// The Slack bot: tokens, posting only into the bot DM, the gate reading the bot DM, the Socket Mode
// watcher's event handling, the request log, and the 90-day purge.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { addCandidate, createStore, updateItem } from "../scripts/aq.mjs";
import { purgeOld, workerPrompt } from "../scripts/dispatch.mjs";
import { decide } from "../scripts/gate.mjs";
import { botPost, cardChannel, loadSecret } from "../scripts/slack.mjs";
import { MAX_EVENTS_PER_MIN, createHandler } from "../scripts/watch.mjs";

let now = Date.parse("2026-11-02T15:00:00Z");
const clock = () => new Date((now += 1000));

function freshHome({ bot = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aq-bot-"));
  const store = createStore(home);
  store.init();
  const config = store.config();
  config.slack = { userId: "U_ME", selfDmId: "D_SELF", ...(bot ? { cardChannel: "D_BOT" } : {}) };
  fs.writeFileSync(store.paths.config, JSON.stringify(config));
  return { home, store };
}

const events = (home) =>
  fs.existsSync(path.join(home, "logs", "events.jsonl"))
    ? fs.readFileSync(path.join(home, "logs", "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l))
    : [];

function cardItem(store, card, status = "approving") {
  const { id } = addCandidate(store, { title: "Send Sam Q3", source: { kind: "slack", who: "Sam" }, fingerprints: [`slack:${card.ts}`] }, clock);
  updateItem(store, id, { status, patch: { card } }, clock);
  return id;
}

// ---------- tokens ----------

test("tokens: env first, then AWS Secrets Manager when aws.json is set, else the file", () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), "aq-cfg-"));
  fs.mkdirSync(path.join(cfg, "ask-queue"));
  const env = { XDG_CONFIG_HOME: cfg };
  assert.equal(loadSecret("bot-token", env), null);
  fs.writeFileSync(path.join(cfg, "ask-queue", "slack-token"), "xoxb-file\n");
  assert.equal(loadSecret("bot-token", env), "xoxb-file");
  assert.equal(loadSecret("bot-token", { ...env, ASK_QUEUE_SLACK_TOKEN: "xoxb-env" }), "xoxb-env");

  fs.writeFileSync(path.join(cfg, "ask-queue", "aws.json"), JSON.stringify({ region: "us-west-2", prefix: "aq/bot/" }));
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    return "xapp-from-aws\n";
  };
  assert.equal(loadSecret("app-token", env, run), "xapp-from-aws");
  assert.equal(loadSecret("app-token", env, run), "xapp-from-aws", "cached");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^aws secretsmanager get-secret-value --region us-west-2 --secret-id aq\/bot\/app-token/);
  // AWS on but denied: no token (the plain file is not used as a silent fallback).
  const denied = () => {
    throw new Error("AccessDenied");
  };
  assert.equal(loadSecret("bot-token", { ...env, XDG_CONFIG_HOME: cfg }, denied), null);
});

// ---------- posting ----------

function fakeApi() {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const method = String(url).split("/").pop();
    const body = JSON.parse(opts.body);
    calls.push({ method, body, auth: opts.headers.Authorization });
    return { status: 200, headers: { get: () => null }, json: async () => ({ ok: true, channel: "D_BOT", ts: "900.000100" }) };
  };
  return { calls, fetchImpl };
}

test("post: only into the bot DM, as markdown; first post opens it via the user id; every post logged", async () => {
  const { home, store } = freshHome({ bot: false });
  const api = fakeApi();
  const token = "xoxb-1-abc";
  const first = await botPost({ token, config: store.config(), text: "🤖 hello", fetchImpl: api.fetchImpl, home, clock });
  assert.deepEqual(first, { channel: "D_BOT", ts: "900.000100" });
  assert.equal(api.calls[0].method, "chat.postMessage");
  assert.equal(api.calls[0].body.channel, "U_ME");
  assert.equal(api.calls[0].body.markdown_text, "🤖 hello");

  const config = { slack: { ...store.config().slack, cardChannel: "D_BOT" } };
  await botPost({ token, config, text: "🤖 reply", thread: "900.000100", fetchImpl: api.fetchImpl, home, clock, by: "AQ-1" });
  assert.equal(api.calls[1].body.channel, "D_BOT");
  assert.equal(api.calls[1].body.thread_ts, "900.000100");
  await botPost({ token, config, text: "🤖 edited", update: "900.000100", fetchImpl: api.fetchImpl, home, clock });
  assert.equal(api.calls[2].method, "chat.update");
  assert.equal(api.calls[2].body.channel, "D_BOT");

  await assert.rejects(botPost({ token, config, text: "  ", fetchImpl: api.fetchImpl }), /empty/);
  await assert.rejects(botPost({ token: "xoxp-user", config, text: "x", fetchImpl: api.fetchImpl }), /no bot token/, "never posts as the user");
  await assert.rejects(botPost({ token, config, text: "x", thread: "C123", fetchImpl: api.fetchImpl }), /bad message ts/);
  await assert.rejects(botPost({ token, config, text: "x".repeat(12_001), fetchImpl: api.fetchImpl }), /limit/);
  assert.deepEqual(events(home).map((e) => [e.source, e.action, e.by || null]), [
    ["post", "post", null],
    ["post", "reply", "AQ-1"],
    ["post", "edit", null],
  ]);
  assert.equal(cardChannel(config), "D_BOT");
  assert.equal(cardChannel(store.config()), "D_SELF");
});

// ---------- gate ----------

function fakeSlack({ threads = {}, history = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    const method = url.pathname.split("/").pop();
    const params = Object.fromEntries(url.searchParams);
    calls.push({ method, params });
    let body;
    if (method === "conversations.replies") {
      body = params.channel === "D_BOT" ? { ok: true, messages: threads[params.ts] || [] } : { ok: false, error: "channel_not_found" };
    } else if (method === "conversations.history") {
      body = params.channel === "D_BOT" ? { ok: true, messages: history } : { ok: false, error: "channel_not_found" };
    } else if (method === "search.messages") body = { ok: false, error: "not_allowed_token_type" };
    else body = { ok: false, error: "unknown_method" };
    return { status: 200, headers: { get: () => null }, json: async () => body };
  };
  return { fetchImpl, calls };
}
const BOT_TOKEN = "xoxb-test-1";
const me = (ts, text, extra = {}) => ({ ts, user: "U_ME", text, ...extra });

test("gate: reads card threads in the bot DM, never the self-DM; bot posts are never the user's", async () => {
  const { home, store } = freshHome();
  cardItem(store, { channelId: "D_BOT", ts: "100.0", lastSeenTs: "100.0" });
  const slack = fakeSlack({
    threads: {
      "100.0": [
        { ts: "100.1", user: "U_BOT", bot_id: "B1", text: "AQ-1 · Ready (no 🤖 prefix, still the bot)" },
        me("100.2", "shorter please"),
      ],
    },
  });
  const result = await decide("replies", { home, token: BOT_TOKEN, fetchImpl: slack.fetchImpl, clock });
  assert.equal(result.run, false);
  assert.deepEqual(result.routed, ["AQ-1"]);
  const job = store.getItem("AQ-1").job;
  assert.match(job.followUp, /shorter please/);
  assert.doesNotMatch(job.followUp, /Ready/);
  assert.ok(slack.calls.every((c) => c.params.channel !== "D_SELF"));
  assert.deepEqual(events(home).map((e) => [e.source, e.action, e.id]), [["gate", "route", "AQ-1"]]);
});

test("gate: in the bot DM any top-level message is a direct ask; its own checkpoint", async () => {
  const { home, store } = freshHome();
  const nowSec = Math.floor(Date.parse("2026-11-02T15:00:00Z") / 1000) + 3600;
  const slack = fakeSlack({ history: [me(`${nowSec}.000100`, "which amendments went live in Sep?")] });
  const result = await decide("replies", { home, token: BOT_TOKEN, fetchImpl: slack.fetchImpl, clock: () => new Date(nowSec * 1000 + 5000) });
  assert.equal(result.run, false);
  assert.deepEqual(result.routed, ["AQ-1"]);
  const item = store.getItem("AQ-1");
  assert.equal(item.direct, true);
  assert.equal(item.card.channelId, "D_BOT");
  assert.equal(item.source.where, "your DM with the bot");
  assert.equal(store.state().checkpoints["replies:cards"], `${nowSec}.000100`);
  assert.equal(store.state().checkpoints["replies:selfdm"], undefined);
});

test("gate: old self-DM cards can't be read by the bot, so a Claude run reads them on the fixed schedule", async () => {
  const { home, store } = freshHome();
  cardItem(store, { channelId: "D_SELF", ts: "50.0", lastSeenTs: "50.0" });
  const slack = fakeSlack();
  const first = await decide("replies", { home, token: BOT_TOKEN, fetchImpl: slack.fetchImpl, clock });
  assert.equal(first.run, true);
  assert.match(first.reason, /1 cards in the old self-DM/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, "tmp", "inbox.json"), "utf8")).legacy, ["AQ-1"]);
  const second = await decide("replies", { home, token: BOT_TOKEN, fetchImpl: slack.fetchImpl, clock });
  assert.equal(second.run, false, "not again until the fixed schedule is due");
  assert.ok(slack.calls.every((c) => c.params.channel !== "D_SELF"));
});

test("gate: a bot token never searches; sweeps keep the fixed schedule", async () => {
  const { home, store } = freshHome();
  const state = store.state();
  state.checkpoints.slack = "2026-11-02T14:00:00Z";
  state.checkpoints["sweep:last"] = "2026-11-02T14:59:00Z";
  store.saveState(state);
  const slack = fakeSlack();
  const result = await decide("sweep", { home, token: BOT_TOKEN, fetchImpl: slack.fetchImpl, clock });
  assert.equal(result.fallback, true);
  assert.match(result.reason, /can't search/);
  assert.equal(slack.calls.length, 0);
});

// ---------- watcher ----------

function watcher(home) {
  const ticks = [];
  const replies = [];
  const handle = createHandler({ home, clock, runTick: (h) => ticks.push(h), runReplies: (h, why) => replies.push(why) });
  let n = 0;
  const send = (event, id) => handle({ event_id: id || `Ev${(n += 1)}`, event: { type: "message", channel_type: "im", channel: "D_BOT", ...event } });
  return { send, ticks, replies };
}

test("watch: a top-level message becomes a direct ask and starts its session at once", () => {
  const { home, store } = freshHome();
  const w = watcher(home);
  assert.equal(w.send({ user: "U_ME", ts: "1000.000100", text: "pull last week's RLUSD volume" }, "Ev1"), "direct");
  const item = store.getItem("AQ-1");
  assert.equal(item.direct, true);
  assert.equal(item.status, "new");
  assert.equal(w.ticks.length, 1);
  assert.equal(w.send({ user: "U_ME", ts: "1000.000100", text: "pull last week's RLUSD volume" }, "Ev1"), "duplicate", "Slack retry");
  assert.equal(w.send({ user: "U_ME", ts: "1000.000100", text: "pull last week's RLUSD volume" }, "Ev9"), "duplicate", "same message");
  assert.deepEqual(events(home).map((e) => [e.action, e.eventId, e.channel, e.user, e.id || null]), [
    ["direct", "Ev1", "D_BOT", "U_ME", "AQ-1"],
    ["duplicate", "Ev9", "D_BOT", "U_ME", "AQ-1"],
  ]);
});

test("watch: a card-thread reply goes to that card's session; replies elsewhere start a replies check", () => {
  const { home, store } = freshHome();
  const id = cardItem(store, { channelId: "D_BOT", ts: "500.0", lastSeenTs: "500.0" });
  const w = watcher(home);
  assert.equal(w.send({ user: "U_ME", ts: "500.2", thread_ts: "500.0", text: "make it shorter" }), "route");
  const item = store.getItem(id);
  assert.equal(item.status, "ready");
  assert.match(item.job.followUp, /make it shorter/);
  assert.equal(item.card.lastSeenTs, "500.2");
  assert.equal(w.ticks.length, 1);
  assert.equal(w.send({ user: "U_ME", ts: "500.2", thread_ts: "500.0", text: "make it shorter" }), "duplicate");
  assert.equal(w.send({ user: "U_ME", ts: "700.1", thread_ts: "700.0", text: "promote it" }), "replies");
  assert.equal(w.send({ user: "U_ME", ts: "700.2", thread_ts: "700.0", text: "and this" }), "replies-debounced");
  assert.equal(w.replies.length, 1);
});

test("watch: loop protection and scope: bots, other people, other channels and other events do nothing", () => {
  const { home, store } = freshHome();
  const w = watcher(home);
  assert.equal(w.send({ user: "U_BOT", bot_id: "B1", ts: "1.1", text: "🤖 card" }), "ignored");
  assert.equal(w.send({ subtype: "bot_message", ts: "1.2", text: "x" }), "ignored");
  assert.equal(w.send({ user: "U_OTHER", ts: "1.3", text: "hi" }), "ignored-not-user");
  assert.equal(w.send({ user: "U_ME", ts: "1.4", text: "hi", channel: "D_OTHER" }), "ignored-other-dm");
  assert.equal(w.send({ user: "U_ME", ts: "1.5", text: "hi", channel_type: "channel" }), "ignored");
  assert.equal(w.send({ user: "U_ME", ts: "1.6", subtype: "channel_join", text: "" }), "ignored");
  assert.equal(store.allItems().length, 0);
  assert.equal(w.ticks.length, 0);
});

test("watch: rate limit: past the per-minute cap, messages wait for the replies check", () => {
  const { home, store } = freshHome();
  const w = watcher(home);
  for (let i = 0; i < MAX_EVENTS_PER_MIN; i += 1) assert.equal(w.send({ user: "U_ME", ts: `2000.${100 + i}`, text: `ask ${i}` }), "direct");
  assert.equal(w.send({ user: "U_ME", ts: "2000.999", text: "one too many" }), "rate-limited");
  assert.equal(store.allItems().length, MAX_EVENTS_PER_MIN);
});

// ---------- prompts ----------

test("prompt: with the bot DM, sessions post with slack.mjs, not the Slack tools", () => {
  const { home, store } = freshHome();
  const id = cardItem(store, { channelId: "D_BOT", ts: "500.0", lastSeenTs: "500.0" });
  const item = store.getItem(id);
  item.job = { workDir: "/w", kind: "card" };
  assert.match(workerPrompt(home, item, store.config()), /slack\.mjs post --thread 500\.0 --file/);
  const fresh = { ...item, card: null };
  assert.match(workerPrompt(home, fresh, store.config()), /slack\.mjs post --file <card\.md>/);
  const old = freshHome({ bot: false });
  assert.match(workerPrompt(old.home, fresh, old.store.config()), /top-level message to channel D_SELF/);
});

// ---------- 90-day purge ----------

test("purge: closed items older than 90 days lose item, job folder and artifacts; old log lines go; once a day", () => {
  const { home, store } = freshHome();
  const t0 = Date.parse("2026-07-01T12:00:00Z");
  const at = (ms) => () => new Date(ms);
  const { id: oldDone } = addCandidate(store, { title: "old", source: { kind: "slack" }, fingerprints: ["a"] }, at(t0));
  updateItem(store, oldDone, { status: "skipped" }, at(t0));
  const { id: oldOpen } = addCandidate(store, { title: "open", source: { kind: "slack" }, fingerprints: ["b"] }, at(t0));
  const { id: recent } = addCandidate(store, { title: "recent", source: { kind: "slack" }, fingerprints: ["c"] }, at(t0));
  updateItem(store, recent, { status: "skipped" }, at(Date.parse("2026-10-20T12:00:00Z")));
  for (const id of [oldDone, recent]) {
    fs.mkdirSync(path.join(home, "jobs", id, "work"), { recursive: true });
    fs.mkdirSync(path.join(home, "artifacts", id), { recursive: true });
  }
  fs.appendFileSync(store.paths.ledger, `${JSON.stringify({ at: "2026-07-01T00:00:00Z", id: oldDone, draft: "old text" })}\n${JSON.stringify({ at: "2026-10-30T00:00:00Z", id: recent })}\n`);
  fs.mkdirSync(path.join(home, "logs"), { recursive: true });
  fs.writeFileSync(path.join(home, "logs", "events.jsonl"), `${JSON.stringify({ at: "2026-06-01T00:00:00Z" })}\n${JSON.stringify({ at: "2026-11-01T00:00:00Z" })}\n`);
  const oldLog = path.join(home, "logs", "2026-07-01.log");
  fs.writeFileSync(oldLog, "x");
  fs.utimesSync(oldLog, new Date(t0), new Date(t0));

  const day = new Date("2026-11-02T15:00:00Z");
  const result = purgeOld(store, day);
  assert.deepEqual(result.items, [oldDone]);
  assert.equal(result.ledger, 1);
  assert.equal(result.events, 1);
  assert.equal(result.logs, 1);
  assert.deepEqual(store.allItems().map((i) => i.id), [oldOpen, recent]);
  assert.ok(!fs.existsSync(path.join(home, "jobs", oldDone)));
  assert.ok(!fs.existsSync(path.join(home, "artifacts", oldDone)));
  assert.ok(fs.existsSync(path.join(home, "jobs", recent)));
  assert.doesNotMatch(fs.readFileSync(store.paths.ledger, "utf8"), /old text/);
  assert.equal(purgeOld(store, day), null, "once a day");
  // Ids are never reused.
  const { id: next } = addCandidate(store, { title: "new", source: { kind: "slack" }, fingerprints: ["d"] }, clock);
  assert.equal(next, "AQ-4");
});
