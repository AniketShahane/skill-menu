import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { DIRECT_ASK, DIRECT_BRIEF, addDirect, precheckList, recordPrecheck, run as aqRun } from "../scripts/aq.mjs";
import { tick, workerPrompt } from "../scripts/dispatch.mjs";
import { decide as gateDecide } from "../scripts/gate.mjs";
import { decide as guardDecide, makeContext } from "../scripts/guard.mjs";
import { SELF_DM, USER, addItem, makeHome } from "./helpers.mjs";

const noSpawn = { spawnSupervisor: () => {}, alive: () => true };
const noSessions = () => [];

function setWorkers(store, workers) {
  const config = store.config();
  config.workers = workers;
  fs.writeFileSync(store.paths.config, JSON.stringify(config));
}

const minutesAfter = (store, id, min) => () => new Date(Date.parse(store.getItem(id).createdAt) + min * 60_000);

// ---------- pre-check ----------

test("pre-check: a harvested ask waits for the sweep's verdict before its session starts", () => {
  const { home, store } = makeHome();
  setWorkers(store, { prepDelayMin: 10, precheckWaitMin: 45 });
  const id = addItem(store);
  const at = (min) => minutesAfter(store, id, min);
  assert.deepEqual(tick({ home, ...noSpawn, clock: at(11) }).prepQueued, [], "past the delay, still waiting for a pre-check");
  assert.deepEqual(precheckList(store, at(11), noSessions).items.map((i) => i.id), [id]);
  recordPrecheck(store, id, { verdict: "needed", reason: "Sam asked, no reply yet" }, at(12));
  assert.equal(store.getItem(id).status, "new");
  assert.deepEqual(tick({ home, ...noSpawn, clock: at(12) }).prepQueued, [id]);
  assert.equal(store.getItem(id).status, "working");
  assert.equal(store.getItem(id).precheck.verdict, "needed");
});

test("pre-check: handled, duplicate and in-progress asks are skipped and never start a session", () => {
  const { home, store } = makeHome();
  setWorkers(store, { prepDelayMin: 10, precheckWaitMin: 45 });
  for (const verdict of ["handled", "duplicate", "in-progress"]) {
    const id = addItem(store);
    recordPrecheck(store, id, { verdict, reason: `because ${verdict}`, relatedTo: verdict === "duplicate" ? "AQ-1" : undefined }, minutesAfter(store, id, 11));
    const item = store.getItem(id);
    assert.equal(item.status, "skipped", verdict);
    assert.match(item.history.at(-1).note, new RegExp(`pre-check: ${verdict}`));
    assert.deepEqual(tick({ home, ...noSpawn, clock: minutesAfter(store, id, 120) }).prepQueued, [], verdict);
  }
  assert.equal(store.getItem("AQ-2").precheck.relatedTo, "AQ-1");
});

test("pre-check: an ask nobody checked starts anyway after precheckWaitMin", () => {
  const { home, store } = makeHome();
  setWorkers(store, { prepDelayMin: 10, precheckWaitMin: 45 });
  const id = addItem(store);
  assert.deepEqual(tick({ home, ...noSpawn, clock: minutesAfter(store, id, 54) }).prepQueued, []);
  assert.deepEqual(tick({ home, ...noSpawn, clock: minutesAfter(store, id, 56) }).prepQueued, [id]);
  assert.ok(store.getItem(id).history.some((h) => /no pre-check in time/.test(h.note || "")));
});

test("pre-check: the user's own asks and items brought back from the digest skip it", () => {
  const { home, store } = makeHome();
  setWorkers(store, { prepDelayMin: 10, precheckWaitMin: 45 });
  const manual = addItem(store, { source: { kind: "manual", who: "you", channelId: SELF_DM, ts: "9.1" } });
  const back = addItem(store, { card: { channelId: SELF_DM, ts: "8.0", lastSeenTs: "8.0" } });
  const clock = minutesAfter(store, back, 11);
  assert.deepEqual(precheckList(store, clock, noSessions).items, []);
  assert.deepEqual(tick({ home, ...noSpawn, clock }).prepQueued.sort(), [manual, back].sort());
});

test("pre-check list: only asks past the delay, with same-thread cards and the user's own sessions", () => {
  const { store } = makeHome();
  setWorkers(store, { prepDelayMin: 10 });
  const source = (ts) => ({ kind: "slack", who: "David", channelId: "C7", ts, threadTs: "50.0" });
  const older = addItem(store, { source: source("50.1") });
  recordPrecheck(store, older, { verdict: "needed", reason: "open question" });
  const fresh = addItem(store, { source: source("50.2") });
  const other = addItem(store, { source: { kind: "slack", who: "Sam", channelId: "C8", ts: "60.0" } });
  const sessions = () => [{ name: "wash-trading-methodology-review", state: "done", live: true }];
  const early = precheckList(store, minutesAfter(store, fresh, 5), sessions);
  assert.deepEqual(early, { items: [], sessions: [] }, "nothing waits yet, so no session lookup either");
  const list = precheckList(store, minutesAfter(store, fresh, 11), sessions);
  assert.deepEqual(list.items.map((i) => i.id).sort(), [fresh, other].sort());
  const entry = list.items.find((i) => i.id === fresh);
  assert.deepEqual(entry.sameThread.map((t) => t.id), [older]);
  assert.deepEqual(list.items.find((i) => i.id === other).sameThread, []);
  assert.equal(list.sessions[0].name, "wash-trading-methodology-review");
});

test("pre-check: the CLI lists the user's Claude sessions but not ask-queue's own", () => {
  const { home, store } = makeHome();
  const bin = path.join(home, "fake-claude.mjs");
  fs.writeFileSync(
    bin,
    `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify([{ id: "a", name: "AQ-12 Send Sam", state: "done" }, { id: "b", name: "ledger-alerts", state: "working", pid: 9, cwd: "/w", startedAt: 1792782595812 }]));\n`,
  );
  fs.chmodSync(bin, 0o755);
  addItem(store);
  const list = aqRun(["precheck"], { ASK_QUEUE_HOME: home, ASK_QUEUE_CLAUDE_BIN: bin });
  assert.equal(list.items.length, 1);
  assert.deepEqual(list.sessions, [{ name: "ledger-alerts", state: "working", live: true, startedAt: "2026-10-23T19:09:55.812Z", cwd: "/w" }]);
  const broken = aqRun(["precheck"], { ASK_QUEUE_HOME: home, ASK_QUEUE_CLAUDE_BIN: path.join(home, "missing") });
  assert.equal(broken.sessions, null, "no claude CLI: judge from Slack alone");
});

test("pre-check: bad input is refused", () => {
  const { store } = makeHome();
  const id = addItem(store);
  assert.throws(() => recordPrecheck(store, id, { verdict: "maybe", reason: "x" }), /verdict must be/);
  assert.throws(() => recordPrecheck(store, id, { verdict: "needed" }), /reason/);
  recordPrecheck(store, id, { verdict: "handled", reason: "you replied at 3pm" });
  assert.throws(() => recordPrecheck(store, id, { verdict: "needed", reason: "x" }), /only new asks/);
});

test("gate: a sweep runs when an ask waits for its pre-check", async () => {
  const { home, store } = makeHome();
  setWorkers(store, { prepDelayMin: 10 });
  const state = store.state();
  state.checkpoints.slack = new Date().toISOString();
  state.checkpoints["sweep:last"] = new Date().toISOString();
  store.saveState(state);
  const id = addItem(store);
  const fetchImpl = async () => ({ status: 200, headers: { get: () => null }, json: async () => ({ ok: true, messages: { matches: [] } }) });
  const quiet = await gateDecide("sweep", { home, token: "xoxp-t-1", fetchImpl, clock: minutesAfter(store, id, 5) });
  assert.equal(quiet.run, false);
  const due = await gateDecide("sweep", { home, token: "xoxp-t-1", fetchImpl, clock: minutesAfter(store, id, 11) });
  assert.equal(due.run, true);
  assert.match(due.reason, new RegExp(`pre-check.*${id}`));
});

// ---------- direct asks ----------

test("DIRECT_ASK: only messages that open by addressing Claude", () => {
  for (const text of ["Claude, what's waiting?", "claude: pull Q3 churn", "  @Claude, help", "Hey Claude, quick one", "CLAUDE ,do it"]) {
    assert.ok(DIRECT_ASK.test(text), text);
  }
  for (const text of ["Claude Code is slow today", "ask Claude, maybe", "claudette, hi", "Claude", "the Claude, thing"]) {
    assert.ok(!DIRECT_ASK.test(text), text);
  }
});

test("direct: the user's message becomes the card, and its session starts with no wait or pre-check", () => {
  const { home, store } = makeHome();
  setWorkers(store, { prepDelayMin: 10, precheckWaitMin: 45 });
  const { action, id } = addDirect(store, { ts: "700.1", text: "Claude, which XRPL amendments went live in September? Short list please." });
  assert.equal(action, "created");
  let item = store.getItem(id);
  assert.equal(item.direct, true);
  assert.equal(item.source.kind, "direct");
  assert.deepEqual(item.card, { channelId: SELF_DM, ts: "700.1", lastSeenTs: "700.1" });
  assert.equal(item.title, "which XRPL amendments went live in September? Short list please.");
  assert.deepEqual(precheckList(store, minutesAfter(store, id, 30), noSessions).items, []);
  assert.deepEqual(tick({ home, ...noSpawn, clock: minutesAfter(store, id, 0) }).prepQueued, [id]);
  item = store.getItem(id);
  assert.equal(item.status, "working");
  assert.equal(item.job.brief, DIRECT_BRIEF);
  assert.equal(item.card.ts, "700.1", "the card stays the user's message");
  const prompt = workerPrompt(home, item, store.config(), "sonnet");
  assert.match(prompt, /direct ask/);
  assert.match(prompt, /which XRPL amendments/);
  assert.match(prompt, /thread_ts 700\.1/);
  assert.match(prompt, /section 5/);
});

test("direct: titles are trimmed at a word, and the prefix is required", () => {
  const { store } = makeHome();
  const long = `Claude, ${"please look at the slow ledger alerts from last week ".repeat(3)}`;
  const { id } = addDirect(store, { ts: "701.1", text: long });
  const title = store.getItem(id).title;
  assert.ok(title.length <= 71 && title.endsWith("…"), title);
  assert.doesNotMatch(title, /Claude/);
  assert.throws(() => addDirect(store, { ts: "701.2", text: "remember to buy milk" }), /starts with "Claude,"/);
  assert.throws(() => addDirect(store, { text: "Claude, hi" }), /ts/);
});

test("direct: the same message again is a duplicate; an edit goes to its session", () => {
  const { store } = makeHome();
  const { id } = addDirect(store, { ts: "702.1", text: "Claude, draft a note to Sam" });
  assert.equal(addDirect(store, { ts: "702.1", text: "Claude, draft a note to Sam" }).action, "duplicate");
  const edited = addDirect(store, { ts: "702.1", editedTs: "702.9", text: "Claude, draft a note to Sam and cc Dana" });
  assert.deepEqual(edited, { action: "edited", id });
  const item = store.getItem(id);
  assert.match(item.job.followUp, /cc Dana/);
  assert.equal(item.card.lastSeenTs, "702.9");
  assert.equal(addDirect(store, { ts: "702.1", editedTs: "702.9", text: "Claude, draft a note to Sam and cc Dana" }).action, "duplicate", "an edit is routed once");
});

test("direct: the CLI takes a message file", () => {
  const { home } = makeHome();
  fs.mkdirSync(path.join(home, "tmp"), { recursive: true });
  fs.writeFileSync(path.join(home, "tmp", "d.json"), JSON.stringify({ ts: "703.1", text: "Claude: what's waiting?" }));
  assert.equal(aqRun(["direct", "--file", "tmp/d.json"], { ASK_QUEUE_HOME: home }).action, "created");
});

test("guard: a direct ask's session posts only in the user's message thread", () => {
  const { home, store } = makeHome();
  const { id } = addDirect(store, { ts: "704.1", text: "Claude, what's waiting?" });
  const ctx = makeContext(home, id);
  const post = (input) => guardDecide({ tool_name: "mcp__claude_ai_Slack__slack_send_message", tool_input: input }, ctx).decision;
  assert.equal(post({ channel_id: SELF_DM, thread_ts: "704.1", message: `🤖 ✅ **${id} ·** Two cards wait on you.` }), "allow");
  assert.equal(post({ channel_id: SELF_DM, message: `🤖 **${id} ·** top-level` }), "deny");
  assert.equal(post({ channel_id: SELF_DM, thread_ts: "999.1", message: "🤖 elsewhere" }), "deny");
  const react = guardDecide({ tool_name: "mcp__claude_ai_Slack__slack_add_reaction", tool_input: { channel_id: SELF_DM, message_ts: "704.1", emoji: "eyes" } }, ctx);
  assert.equal(react.decision, "allow");
});

// ---------- gate with a user token ----------

const me = (ts, text, extra = {}) => ({ ts, user: USER, text, ...extra });

function fakeSlack({ threads = {}, history = [] }) {
  const calls = [];
  const fetchImpl = async (url) => {
    const method = url.pathname.split("/").pop();
    const params = Object.fromEntries(url.searchParams);
    calls.push({ method, params });
    let body = { ok: false, error: "unknown_method" };
    if (method === "conversations.replies") body = { ok: true, messages: threads[params.ts] || [] };
    if (method === "conversations.history") body = { ok: true, messages: history };
    return { status: 200, headers: { get: () => null }, json: async () => body };
  };
  return { fetchImpl, calls };
}

test("gate: a 'Claude, …' message becomes a card with no Claude run; other top-level messages still go to the run", async () => {
  const { home, store } = makeHome();
  const state = store.state();
  state.checkpoints["replies:selfdm"] = "800.0";
  store.saveState(state);
  const clock = () => new Date(801 * 1000);
  const only = fakeSlack({ history: [me("800.5", "Claude, list the open cards waiting on me")] });
  const first = await gateDecide("replies", { home, token: "xoxp-t-1", fetchImpl: only.fetchImpl, clock });
  assert.equal(first.run, false, "nothing left for a Claude run");
  assert.deepEqual(first.routed, ["AQ-1"]);
  assert.equal(store.getItem("AQ-1").direct, true);
  assert.equal(store.state().checkpoints["replies:selfdm"], "800.5", "the gate moved the mark past it");

  const mixed = fakeSlack({ history: [me("800.7", "Priya likes bullet points"), me("800.6", "Claude: draft the weekly update"), me("800.5", "Claude, list the open cards waiting on me")] });
  const second = await gateDecide("replies", { home, token: "xoxp-t-1", fetchImpl: mixed.fetchImpl, clock });
  assert.equal(second.run, true);
  assert.deepEqual(second.routed, ["AQ-2"], "the old one is a duplicate, not taken twice");
  const inbox = JSON.parse(fs.readFileSync(path.join(home, "tmp", "inbox.json"), "utf8"));
  assert.deepEqual(inbox.topLevel.map((m) => m.text), ["Priya likes bullet points"]);
  assert.equal(store.state().checkpoints["replies:selfdm"], "800.5", "the run moves the mark once it handles the note");
});

test("gate: a reply under a direct ask goes to its session, not to the note threads", async () => {
  const { home, store } = makeHome();
  const { id } = addDirect(store, { ts: "900.1", text: "Claude, what's waiting?" });
  store.saveState({ ...store.state(), checkpoints: { "replies:selfdm": "900.1" } });
  // The session answered (🤖) and rests in review; the user follows up in the same thread.
  const item = store.getItem(id);
  fs.writeFileSync(path.join(store.paths.items, `${id}.json`), JSON.stringify({ ...item, status: "review" }));
  const slack = fakeSlack({
    history: [me("900.1", "Claude, what's waiting?", { latest_reply: "900.4", reply_count: 2 })],
    threads: { "900.1": [me("900.1", "Claude, what's waiting?"), me("900.2", "🤖 ✅ AQ-1 · Two cards."), me("900.4", "and which one is oldest?")] },
  });
  const result = await gateDecide("replies", { home, token: "xoxp-t-1", fetchImpl: slack.fetchImpl, clock: () => new Date(901 * 1000) });
  assert.equal(result.run, false, "no note thread, no Claude run");
  assert.deepEqual(result.routed, [id]);
  const after = store.getItem(id);
  assert.equal(after.status, "ready");
  assert.match(after.job.followUp, /which one is oldest/);
  assert.equal(after.card.lastSeenTs, "900.4");
});
