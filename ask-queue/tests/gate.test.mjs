import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { addCandidate, createStore, updateItem } from "../scripts/aq.mjs";
import { decide, slackClient } from "../scripts/gate.mjs";

let tick = Date.parse("2026-09-28T09:00:00Z");
const clock = () => new Date((tick += 1000));

function freshHome({ sources } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aq-gate-"));
  const store = createStore(home);
  store.init();
  const config = store.config();
  config.slack = { userId: "U_ME", selfDmId: "D_ME" };
  if (sources) config.sources = sources;
  fs.writeFileSync(store.paths.config, JSON.stringify(config));
  return { home, store };
}

// Fake Slack: routes by method; records every call.
function fakeSlack({ threads = {}, history = [], search = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    const method = url.pathname.split("/").pop();
    const params = Object.fromEntries(url.searchParams);
    calls.push({ method, params });
    let body;
    if (method === "conversations.replies") body = { ok: true, messages: threads[params.ts] || [] };
    else if (method === "conversations.history") body = { ok: true, messages: history };
    else if (method === "search.messages") body = { ok: true, messages: { matches: search } };
    else body = { ok: false, error: "unknown_method" };
    return { status: 200, headers: { get: () => null }, json: async () => body };
  };
  return { fetchImpl, calls };
}

const TOKEN = "xoxp-test-1";
const me = (ts, text, extra = {}) => ({ ts, user: "U_ME", text, ...extra });
const inbox = (home) => JSON.parse(fs.readFileSync(path.join(home, "tmp", "inbox.json"), "utf8"));

function cardItem(store, status, card, fingerprint = "slack:C1:1.0") {
  const { id } = addCandidate(
    store,
    { title: "Send Sam Q3", source: { kind: "slack", who: "Sam" }, fingerprints: [fingerprint] },
    clock,
  );
  updateItem(store, id, { status: status === "skipped" ? "approving" : status, patch: { card } }, clock);
  if (status === "skipped") updateItem(store, id, { status: "skipped" }, clock);
  return id;
}

test("replies: a message sent while the last run worked is still picked up", async () => {
  const { home, store } = freshHome();
  // Last run handled "shorter" (100.1) and marked it seen; "cc Dana" landed before its 🤖 reply.
  cardItem(store, "approving", { channelId: "D_ME", ts: "100.0", lastSeenTs: "100.1" });
  const slack = fakeSlack({
    threads: {
      "100.0": [
        me("100.0", "🤖 AQ-1 · Ready"),
        me("100.1", "shorter"),
        me("100.2", "also cc Dana"),
        me("100.3", "🤖 AQ-1 · Revised: ..."),
      ],
    },
  });
  const result = await decide("replies", { home, token: TOKEN, fetchImpl: slack.fetchImpl, clock });
  // The card thread goes straight to the card's session: no Claude replies run, no inbox.
  assert.equal(result.run, false);
  assert.deepEqual(result.routed, ["AQ-1"]);
  assert.equal(fs.existsSync(path.join(home, "tmp", "inbox.json")), false);
  const item = store.getItem("AQ-1");
  assert.equal(item.status, "ready");
  assert.equal(item.job.restingStatus, "approving");
  assert.match(item.job.followUp, /also cc Dana/);
  assert.doesNotMatch(item.job.followUp, /shorter/);
  assert.equal(item.card.lastSeenTs, "100.2");
});

test("replies: edits count as new, and replies on recently closed cards are kept", async () => {
  const { home, store } = freshHome();
  cardItem(store, "skipped", { channelId: "D_ME", ts: "200.0", lastSeenTs: "200.5" });
  const slack = fakeSlack({
    threads: {
      "200.0": [me("200.1", "skip"), me("200.4", "actually do it, use the Q4 tab", { edited: { ts: "200.9" } })],
    },
  });
  const result = await decide("replies", { home, token: TOKEN, fetchImpl: slack.fetchImpl, clock });
  assert.deepEqual(result.routed, ["AQ-1"]);
  const item = store.getItem("AQ-1");
  assert.equal(item.status, "ready");
  assert.equal(item.job.restingStatus, "skipped");
  assert.match(item.job.followUp, /edited 200\.9\] actually do it, use the Q4 tab/);
  assert.doesNotMatch(item.job.followUp, /\] skip$/m);
  assert.equal(item.card.lastSeenTs, "200.9");
});

test("replies: top level keeps the user's plain messages only", async () => {
  const { home, store } = freshHome();
  const state = store.state();
  state.checkpoints["replies:selfdm"] = "300.0";
  store.saveState(state);
  const slack = fakeSlack({
    history: [
      me("300.4", "🤖 AQ-9 · Ready"),
      me("300.3", "reply inside a thread", { thread_ts: "300.1" }),
      me("300.2", "Priya likes bullet points"),
      { ts: "300.5", user: "U_OTHER", text: "someone else" },
    ],
  });
  await decide("replies", { home, token: TOKEN, fetchImpl: slack.fetchImpl, clock });
  assert.deepEqual(inbox(home).topLevel.map((m) => m.text), ["Priya likes bullet points"]);
  assert.equal(slack.calls.find((c) => c.method === "conversations.history").params.oldest, "300.0");
});

test("replies: nothing new means no Claude run and no inbox file", async () => {
  const { home, store } = freshHome();
  cardItem(store, "asking", { channelId: "D_ME", ts: "400.0", lastSeenTs: "400.2" });
  fs.writeFileSync(path.join(home, "tmp", "inbox.json"), "{}"); // stale file from an older run
  const slack = fakeSlack({ threads: { "400.0": [me("400.2", "ok"), me("400.3", "🤖 AQ-1 · Ready")] } });
  const result = await decide("replies", { home, token: TOKEN, fetchImpl: slack.fetchImpl, clock });
  assert.equal(result.run, false);
  assert.equal(fs.existsSync(path.join(home, "tmp", "inbox.json")), false);
});

test("no token: falls back to the old 15-minute schedule", async () => {
  const { home } = freshHome();
  assert.equal((await decide("replies", { home, token: null, clock })).run, true);
  assert.equal((await decide("replies", { home, token: null, clock })).run, false);
  const later = () => new Date(tick + 16 * 60 * 1000);
  assert.equal((await decide("replies", { home, token: null, clock: later })).run, true);
});

test("a Slack error falls back instead of failing", async () => {
  const { home } = freshHome();
  const fetchImpl = async () => ({ status: 429, headers: { get: () => null }, json: async () => ({}) });
  const result = await decide("replies", { home, token: TOKEN, fetchImpl, clock });
  assert.equal(result.run, true);
  assert.equal(result.fallback, true);
});

test("sweep: runs for other sources, leftovers and quiet periods; else only on new asks", async () => {
  const withJira = freshHome({ sources: { slack: true, jira: true } });
  const jira = await decide("sweep", { home: withJira.home, token: TOKEN, fetchImpl: fakeSlack().fetchImpl, clock });
  assert.match(jira.reason, /jira/);

  const { home, store } = freshHome();
  assert.match((await decide("sweep", { home, token: TOKEN, fetchImpl: fakeSlack().fetchImpl, clock })).reason, /first/);

  const now = new Date(tick).toISOString();
  const state = store.state();
  state.checkpoints.slack = now;
  state.checkpoints["sweep:last"] = now;
  store.saveState(state);
  const since = Date.parse(now) / 1000;
  const quiet = fakeSlack({
    search: [
      { ts: String(since - 60), user: "U_SAM", channel: { id: "C1" } }, // before the checkpoint
      { ts: String(since + 60), user: "U_ME", channel: { id: "C1" } }, // the user's own message
      { ts: String(since + 60), user: "U_SAM", channel: { id: "D_ME" } }, // in the self-DM
    ],
  });
  const none = await decide("sweep", { home, token: TOKEN, fetchImpl: quiet.fetchImpl, clock });
  assert.equal(none.run, false);

  const busy = fakeSlack({ search: [{ ts: String(since + 60), user: "U_SAM", channel: { id: "C1" } }] });
  assert.equal((await decide("sweep", { home, token: TOKEN, fetchImpl: busy.fetchImpl, clock })).run, true);

  const later = () => new Date(tick + 7 * 3600 * 1000);
  const stale = await decide("sweep", { home, token: TOKEN, fetchImpl: quiet.fetchImpl, clock: later });
  assert.match(stale.reason, /no full sweep/);
});

test("the Slack client refuses anything but its four read methods", async () => {
  const call = slackClient(TOKEN, fakeSlack().fetchImpl);
  await assert.rejects(() => call("chat.postMessage", { channel: "C1", text: "hi" }), /not an allowed read method/);
});

test("replies: a reply under the user's own top-level message is picked up", async () => {
  const { home, store } = freshHome();
  const state = store.state();
  state.checkpoints["replies:selfdm"] = "500.5";
  store.saveState(state);
  const now = String(Math.floor(tick / 1000));
  const parent = me(now, "draft a reply to Lee", { latest_reply: `${now}.9` });
  const slack = fakeSlack({
    history: [parent],
    threads: { [now]: [me(`${now}.5`, "🤖 Took this as a new ask (AQ-21)."), me(`${now}.9`, "no, just a note")] },
  });
  await decide("replies", { home, token: TOKEN, fetchImpl: slack.fetchImpl, clock });
  const [thread] = inbox(home).noteThreads;
  assert.equal(thread.parentText, "draft a reply to Lee");
  assert.deepEqual(thread.messages.map((m) => m.text), ["no, just a note"]);
});

test("pages are followed; too many pages fall back instead of skipping", async () => {
  const { home, store } = freshHome();
  cardItem(store, "asking", { channelId: "D_ME", ts: "600.0", lastSeenTs: "600.0" });
  const pages = { "": [me("600.1", "first page")], c2: [me("600.2", "second page")] };
  const fetchImpl = async (url) => {
    const method = url.pathname.split("/").pop();
    const cursor = url.searchParams.get("cursor") || "";
    const body =
      method === "conversations.replies"
        ? { ok: true, messages: pages[cursor], response_metadata: { next_cursor: cursor ? "" : "c2" } }
        : { ok: true, messages: [] };
    return { status: 200, headers: { get: () => null }, json: async () => body };
  };
  await decide("replies", { home, token: TOKEN, fetchImpl, clock });
  const { followUp } = store.getItem("AQ-1").job;
  assert.match(followUp, /first page/);
  assert.match(followUp, /second page/);

  const endless = async () => ({
    status: 200,
    headers: { get: () => null },
    json: async () => ({ ok: true, messages: [], response_metadata: { next_cursor: "more" } }),
  });
  const result = await decide("replies", { home, token: TOKEN, fetchImpl: endless, clock });
  assert.equal(result.fallback, true);
  assert.match(result.reason, /more than 10 pages/);
});

test("a malformed token is refused and never echoed", async () => {
  const { home } = freshHome();
  const secret = "xoxp-secret\nsecond-line";
  let called = false;
  const fetchImpl = async () => {
    called = true;
    throw new TypeError(`Invalid header value: Bearer ${secret}`);
  };
  const result = await decide("replies", { home, token: secret, fetchImpl, clock });
  assert.equal(called, false);
  assert.equal(result.fallback, true);
  assert.doesNotMatch(result.reason, /secret/);

  const failing = await decide("sweep", { home, token: TOKEN, fetchImpl, clock: () => new Date(tick + 9e6) });
  assert.doesNotMatch(failing.reason, /xoxp/);
});

test("top level: edits to handled messages and long messages are flagged", async () => {
  const { home, store } = freshHome();
  const now = Math.floor(tick / 1000);
  const state = store.state();
  state.checkpoints["replies:selfdm"] = `${now - 100}.0`;
  store.saveState(state);
  const slack = fakeSlack({
    history: [
      me(`${now - 200}.0`, "forget that Priya thing", { edited: { ts: `${now - 50}.0` } }),
      me(`${now - 300}.0`, "old and untouched"),
      me(`${now - 10}.0`, "x".repeat(25_000)),
    ],
  });
  await decide("replies", { home, token: TOKEN, fetchImpl: slack.fetchImpl, clock });
  const [edited, long] = inbox(home).topLevel;
  assert.equal(edited.editedTs, `${now - 50}.0`);
  assert.equal(long.truncated, true);
  assert.equal(inbox(home).topLevel.length, 2);
});

test("note threads keep their own marks", async () => {
  const { home, store } = freshHome();
  const now = Math.floor(tick / 1000);
  const [a, b] = [`${now - 500}.0`, `${now - 400}.0`];
  const state = store.state();
  state.checkpoints["replies:selfdm"] = `${now}.0`;
  state.checkpoints[`note:${b}`] = `${now - 100}.0`; // thread B handled up to here
  store.saveState(state);
  const slack = fakeSlack({
    history: [me(a, "note A", { latest_reply: `${now - 200}.0` }), me(b, "note B", { latest_reply: `${now - 100}.0` })],
    threads: { [a]: [me(`${now - 200}.0`, "late reply in A")], [b]: [me(`${now - 100}.0`, "handled in B")] },
  });
  await decide("replies", { home, token: TOKEN, fetchImpl: slack.fetchImpl, clock });
  assert.deepEqual(
    inbox(home).noteThreads.map((t) => t.messages[0].text),
    ["late reply in A"],
    "B's mark must not hide A's older reply",
  );
});

test("worker notices start a replies run, with or without a token", async () => {
  const { home, store } = freshHome();
  const id = cardItem(store, "scoping", { channelId: "D_ME", ts: "500.0", lastSeenTs: "500.0" });
  updateItem(store, id, { patch: { job: { notice: "Stopped." } } }, clock);
  const slack = fakeSlack();
  const result = await decide("replies", { home, token: TOKEN, fetchImpl: slack.fetchImpl, clock });
  assert.equal(result.run, true);
  assert.deepEqual(inbox(home).notices.map((n) => [n.id, n.notice]), [[id, "Stopped."]]);
  // Without a token the fixed schedule would wait 15 minutes; a notice doesn't.
  assert.equal((await decide("replies", { home, token: null, clock })).run, true);
  assert.equal((await decide("replies", { home, token: null, clock })).run, true);
  updateItem(store, id, { patch: { job: { notice: null } } }, clock);
  assert.equal((await decide("replies", { home, token: TOKEN, fetchImpl: slack.fetchImpl, clock })).run, false);
});
