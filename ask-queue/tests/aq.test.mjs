import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AqError,
  addCandidate,
  addLedger,
  compareTs,
  computeStats,
  createStore,
  declineProposal,
  findLedger,
  listItems,
  markSeen,
  recordProposal,
  run,
  setSimple,
  updateItem,
} from "../scripts/aq.mjs";

const AQ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "aq.mjs");

function freshStore() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aq-test-"));
  const store = createStore(home);
  store.init();
  return store;
}

let tick = Date.parse("2026-09-28T09:00:00Z");
const clock = () => new Date((tick += 1000));

const candidate = (overrides = {}) => ({
  title: "Send Sam the Q3 export numbers",
  source: { kind: "slack", who: "Sam Lee", channelId: "C1", ts: "100.1" },
  excerpt: "Can you send me the Q3 export numbers?",
  fingerprints: ["slack:C1:100.1"],
  ...overrides,
});

test("init seeds memory and state once", () => {
  const store = freshStore();
  const memory = fs.readdirSync(store.paths.memory).sort();
  assert.deepEqual(memory, ["people.md", "playbooks.md", "projects.md", "style.md"]);
  fs.writeFileSync(path.join(store.paths.memory, "people.md"), "custom");
  assert.deepEqual(store.init().seededMemory, []);
  assert.equal(fs.readFileSync(path.join(store.paths.memory, "people.md"), "utf8"), "custom");
  assert.equal(store.state().nextId, 1);
});

test("add creates items with sequential ids", () => {
  const store = freshStore();
  assert.deepEqual(addCandidate(store, candidate(), clock), { action: "created", id: "AQ-1" });
  const second = addCandidate(store, candidate({ fingerprints: ["jira:PROJ-1:assigned"] }), clock);
  assert.deepEqual(second, { action: "created", id: "AQ-2" });
  const item = store.getItem("AQ-1");
  assert.equal(item.status, "new");
  assert.equal(item.history[0].event, "created");
});

test("add de-duplicates the same event and merges overlapping ones", () => {
  const store = freshStore();
  addCandidate(store, candidate(), clock);
  assert.deepEqual(addCandidate(store, candidate(), clock), { action: "duplicate", id: "AQ-1" });
  const merged = addCandidate(store, candidate({ fingerprints: ["slack:C1:100.1", "slack:C1:200.2"] }), clock);
  assert.deepEqual(merged, { action: "merged", id: "AQ-1" });
  const item = store.getItem("AQ-1");
  assert.deepEqual(item.fingerprints, ["slack:C1:100.1", "slack:C1:200.2"]);
  assert.equal(item.seenCount, 2);
  assert.equal(item.updates.length, 1);
});

test("mergeInto joins an open item but not a closed one", () => {
  const store = freshStore();
  addCandidate(store, candidate(), clock);
  const followUp = candidate({ fingerprints: ["slack:C1:300.3"], mergeInto: "AQ-1" });
  assert.deepEqual(addCandidate(store, followUp, clock), { action: "merged", id: "AQ-1" });

  updateItem(store, "AQ-1", { status: "skipped" }, clock);
  const reAsk = candidate({ fingerprints: ["slack:C1:400.4"], mergeInto: "AQ-1" });
  assert.deepEqual(addCandidate(store, reAsk, clock), { action: "created", id: "AQ-2" });
  assert.equal(store.getItem("AQ-2").relatedTo, "AQ-1");
});

test("add never overwrites an existing item, even with a stale id counter", () => {
  const store = freshStore();
  addCandidate(store, candidate(), clock);
  const state = store.state();
  state.nextId = 1; // another process saved an older counter
  store.saveState(state);
  assert.deepEqual(addCandidate(store, candidate({ fingerprints: ["x"] }), clock), { action: "created", id: "AQ-2" });
  assert.equal(store.getItem("AQ-1").fingerprints[0], "slack:C1:100.1");
  fs.writeFileSync(path.join(store.paths.items, "AQ-3.json"), JSON.stringify({ ...store.getItem("AQ-1"), id: "AQ-3" }));
  state.nextId = 3;
  store.saveState(state);
  assert.deepEqual(addCandidate(store, candidate({ fingerprints: ["y"] }), clock), { action: "created", id: "AQ-4" });
});

test("add rejects malformed candidates", () => {
  const store = freshStore();
  assert.throws(() => addCandidate(store, { title: "x", source: { kind: "slack" } }), AqError);
  assert.throws(() => addCandidate(store, candidate({ fingerprints: [""] })), AqError);
  assert.throws(() => addCandidate(store, candidate({ status: "done" })), AqError);
});

test("update enforces the status machine and protects identity fields", () => {
  const store = freshStore();
  addCandidate(store, candidate(), clock);
  assert.throws(() => updateItem(store, "AQ-1", { status: "done" }, clock), /Cannot move AQ-1 from new to done/);
  assert.throws(() => updateItem(store, "AQ-1", { status: "bogus" }, clock), /Unknown status/);
  assert.throws(() => updateItem(store, "AQ-1", { patch: { id: "AQ-9" } }, clock), /Cannot update id/);

  updateItem(store, "AQ-1", { status: "approving", patch: { askType: "share-link" } }, clock);
  updateItem(store, "AQ-1", { status: "approving", note: "revised draft" }, clock);
  updateItem(store, "AQ-1", { status: "drafted", patch: { draft: { kind: "slack-reply", ref: "d1" } } }, clock);
  const item = updateItem(store, "AQ-1", { status: "done" }, clock);
  assert.equal(item.status, "done");
  assert.deepEqual(
    item.history.filter((h) => h.from).map((h) => `${h.from}>${h.to}`),
    ["new>approving", "approving>drafted", "drafted>done"],
  );
  assert.throws(() => updateItem(store, "AQ-1", { status: "drafted" }, clock), /from done/);
});

test("a follow-up reopens a done or skipped item", () => {
  const store = freshStore();
  addCandidate(store, candidate(), clock);
  updateItem(store, "AQ-1", { status: "skipped" }, clock);
  assert.equal(updateItem(store, "AQ-1", { status: "approving" }, clock).status, "approving");
  updateItem(store, "AQ-1", { status: "drafted" }, clock);
  updateItem(store, "AQ-1", { status: "done" }, clock);
  assert.equal(updateItem(store, "AQ-1", { status: "asking" }, clock).status, "asking");
});

test("closed cards stay watched for 48 hours after closing", () => {
  const store = freshStore();
  addCandidate(store, candidate(), clock);
  updateItem(store, "AQ-1", { status: "approving", patch: { card: { channelId: "D_ME", ts: "1.1" } } }, clock);
  updateItem(store, "AQ-1", { status: "skipped" }, clock);
  assert.deepEqual(listItems(store, { watch: true }, clock).map((i) => i.id), ["AQ-1"]);
  const later = () => new Date(tick + 49 * 60 * 60 * 1000);
  assert.deepEqual(listItems(store, { watch: true }, later), []);
});

test("compareTs orders Slack timestamps exactly", () => {
  assert.equal(compareTs("1727450000.000200", "1727450000.0002"), 0);
  assert.equal(compareTs("1727450000.000199", "1727450000.0002"), -1);
  assert.equal(compareTs("1727450001", "1727450000.999999"), 1);
});

test("seen moves forward only and updates every item sharing the thread", () => {
  const store = freshStore();
  addCandidate(store, candidate({ status: "filtered" }), clock);
  addCandidate(store, candidate({ fingerprints: ["b"], status: "filtered" }), clock);
  addCandidate(store, candidate({ fingerprints: ["c"] }), clock);
  const digest = { channelId: "D_ME", ts: "10.0", lastSeenTs: "10.0" };
  updateItem(store, "AQ-1", { patch: { card: digest } }, clock);
  updateItem(store, "AQ-2", { patch: { card: digest } }, clock);
  updateItem(store, "AQ-3", { status: "asking", patch: { card: { channelId: "D_ME", ts: "11.0" } } }, clock);

  assert.deepEqual(markSeen(store, "D_ME", "10.0", "12.5"), { updated: ["AQ-1", "AQ-2"] });
  assert.deepEqual(markSeen(store, "D_ME", "10.0", "12.1"), { updated: [] });
  assert.equal(store.getItem("AQ-2").card.lastSeenTs, "12.5");
  assert.equal(store.getItem("AQ-3").card.lastSeenTs, undefined);
  assert.throws(() => markSeen(store, "D_ME", "10.0", "not-a-ts"), AqError);
});

test("list filters open and watched items", () => {
  const store = freshStore();
  addCandidate(store, candidate(), clock);
  addCandidate(store, candidate({ fingerprints: ["b"] }), clock);
  addCandidate(store, candidate({ fingerprints: ["c"], status: "filtered" }), clock);
  updateItem(store, "AQ-1", { status: "asking", patch: { card: { channelId: "D_ME", ts: "1.1" } } }, clock);
  updateItem(store, "AQ-3", { patch: { card: { channelId: "D_ME", ts: "2.2" } } }, clock);

  assert.deepEqual(listItems(store, { open: true }, clock).map((i) => i.id), ["AQ-1", "AQ-2"]);
  assert.deepEqual(listItems(store, { watch: true }, clock).map((i) => i.id), ["AQ-1", "AQ-3"]);
  const later = () => new Date(tick + 3 * 24 * 60 * 60 * 1000);
  // A thread check two days later bumps updatedAt but must not extend the filtered watch window.
  updateItem(store, "AQ-3", { patch: { card: { channelId: "D_ME", ts: "2.2", lastSeenTs: "3.3" } } }, () =>
    new Date(tick + 47 * 60 * 60 * 1000),
  );
  assert.deepEqual(listItems(store, { watch: true }, later).map((i) => i.id), ["AQ-1"]);
});

test("ledger find matches all terms, newest first", () => {
  const store = freshStore();
  addLedger(store, { id: "AQ-1", outcome: "sent", askType: "share-link", ask: "Q3 export numbers", who: "Sam" }, clock);
  addLedger(store, { id: "AQ-2", outcome: "sent", askType: "share-link", ask: "Q3 numbers again", who: "Priya" }, clock);
  addLedger(store, { id: "AQ-3", outcome: "skipped", askType: "review-doc", ask: "Review roadmap", who: "Sam" }, clock);
  assert.deepEqual(findLedger(store, "q3 numbers").map((e) => e.id), ["AQ-2", "AQ-1"]);
  assert.deepEqual(findLedger(store, "sam", 1).map((e) => e.id), ["AQ-3"]);
  assert.throws(() => addLedger(store, { id: "AQ-4", outcome: "maybe" }), AqError);
});

test("stats: unedited streak drives promotion; edits suggest demotion", () => {
  const store = freshStore();
  let n = 0;
  const sent = (edited) =>
    addLedger(store, { id: `AQ-${(n += 1)}`, outcome: "sent", askType: "share-link", edited }, clock);
  sent(true);
  for (let i = 0; i < 4; i += 1) sent(false);
  addLedger(store, { id: "AQ-y", outcome: "filtered", askType: "share-link" }, clock);
  assert.equal(computeStats(store, clock).types["share-link"].uneditedStreak, 4);
  assert.equal(computeStats(store, clock).types["share-link"].promotable, false);

  sent(false);
  assert.equal(computeStats(store, clock).types["share-link"].promotable, true);

  recordProposal(store, "share-link", "9.9", clock);
  assert.equal(computeStats(store, clock).types["share-link"].promotable, false, "cooldown after proposing");
  assert.deepEqual(computeStats(store, clock).openProposals, [{ type: "share-link", ts: "9.9" }]);
  declineProposal(store, "share-link");
  assert.deepEqual(computeStats(store, clock).openProposals, []);
  assert.equal(computeStats(store, clock).types["share-link"].promotable, false, "decline keeps the cooldown");

  setSimple(store, "share-link", true);
  let stats = computeStats(store, clock);
  assert.deepEqual(stats.simpleTypes, ["share-link"]);
  assert.equal(stats.types["share-link"].demoteSuggested, false);

  sent(true);
  sent(true);
  stats = computeStats(store, clock);
  assert.equal(stats.types["share-link"].demoteSuggested, true);
  assert.equal(stats.types["share-link"].uneditedStreak, 0);

  setSimple(store, "share-link", false);
  assert.deepEqual(computeStats(store, clock).simpleTypes, []);
  assert.throws(() => setSimple(store, "Bad Type!", true), AqError);
});

test("config and checkpoints round-trip through run()", () => {
  const store = freshStore();
  const env = { ASK_QUEUE_HOME: store.paths.home };
  run(["config", "set", "slack.userId", "U_ME"], env);
  run(["config", "set", "sources", '{"slack":true,"jira":true}'], env);
  assert.equal(run(["config", "get", "slack.userId"], env), "U_ME");
  assert.deepEqual(run(["config", "get", "sources"], env), { slack: true, jira: true });
  run(["checkpoint", "set", "slack", "2026-09-28T09:00:00Z"], env);
  assert.deepEqual(run(["checkpoint", "get", "slack"], env), { slack: "2026-09-28T09:00:00Z" });
  assert.throws(() => run(["config", "set", "timezone", "Mars/Olympus"], env), /Unknown IANA timezone/);
});

test("--file must stay inside the data directory", () => {
  const store = freshStore();
  const env = { ASK_QUEUE_HOME: store.paths.home };
  assert.throws(() => run(["add", "--file", "/etc/passwd"], env), /inside the data directory/);
  assert.throws(() => run(["add", "--file", "../outside.json"], env), /inside the data directory/);
  assert.throws(() => run(["add", "--file"], env), /--file is required/);
});

test("now reports local time in the configured timezone", () => {
  const store = freshStore();
  const env = { ASK_QUEUE_HOME: store.paths.home };
  run(["config", "set", "timezone", "America/Los_Angeles"], env);
  const now = run(["now"], env, () => new Date("2026-09-28T16:30:00Z"));
  assert.equal(now.local, "2026-09-28 09:30");
  assert.equal(now.timezoneConfirmed, true);
});

test("settings wires the guard hook with absolute, quoted paths", () => {
  const store = freshStore();
  const settings = run(["settings"], { ASK_QUEUE_HOME: store.paths.home });
  const command = settings.hooks.PreToolUse[0].hooks[0].command;
  assert.match(command, /^node '\/.+\/scripts\/guard\.mjs' '\/.+'$/);
});

test("CLI prints JSON and reports errors on stderr with exit 1", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aq-cli-"));
  const env = { ...process.env, ASK_QUEUE_HOME: home };
  execFileSync("node", [AQ, "init"], { env });
  fs.writeFileSync(path.join(home, "tmp", "c.json"), JSON.stringify(candidate()));
  const out = JSON.parse(execFileSync("node", [AQ, "add", "--file", "tmp/c.json"], { env, cwd: home }).toString());
  assert.deepEqual(out, { action: "created", id: "AQ-1" });
  assert.throws(
    () => execFileSync("node", [AQ, "get", "AQ-99"], { env, stdio: "pipe" }),
    (err) => err.status === 1 && /No such item/.test(err.stderr.toString()),
  );
});

test("stats count only the latest ledger entry of a reopened item", () => {
  const store = freshStore();
  addLedger(store, { id: "AQ-1", outcome: "sent", askType: "share-link", edited: false }, clock);
  addLedger(store, { id: "AQ-2", outcome: "sent", askType: "share-link", edited: false }, clock);
  addLedger(store, { id: "AQ-1", outcome: "sent", askType: "share-link", edited: true }, clock);
  const stats = computeStats(store, clock).types["share-link"];
  assert.equal(stats.closed, 2);
  assert.equal(stats.edited, 1);
  assert.equal(stats.uneditedStreak, 0, "AQ-1's follow-up is now the newest entry");
});

test("work items: scoping → ready needs a brief, job fields merge, dispatcher fields are protected", () => {
  const store = freshStore();
  addCandidate(store, candidate(), clock);
  updateItem(store, "AQ-1", { status: "scoping" }, clock);
  assert.throws(() => updateItem(store, "AQ-1", { status: "ready" }, clock), /job.brief/);
  updateItem(store, "AQ-1", { patch: { job: { brief: "Do X", repo: "/r" } } }, clock);
  updateItem(store, "AQ-1", { status: "ready" }, clock);
  const job = store.getItem("AQ-1").job;
  assert.equal(job.brief, "Do X");
  assert.ok(job.readyAt);
  updateItem(store, "AQ-1", { patch: { job: { followUp: "also Y" } } }, clock);
  assert.equal(store.getItem("AQ-1").job.repo, "/r");
  assert.throws(() => updateItem(store, "AQ-1", { patch: { job: { sessionId: "x" } } }, clock), /dispatch.mjs/);
  assert.throws(() => updateItem(store, "AQ-1", { status: "done" }, clock), /Cannot move/);
});

test("jobs lists queue order; stop un-queues ready work and flags running work", () => {
  const store = freshStore();
  for (const fp of ["a", "b"]) addCandidate(store, candidate({ fingerprints: [fp] }), clock);
  for (const id of ["AQ-2", "AQ-1"]) {
    updateItem(store, id, { status: "scoping", patch: { job: { brief: "b" } } }, clock);
    updateItem(store, id, { status: "ready" }, clock);
  }
  assert.deepEqual(run(["jobs"], { ASK_QUEUE_HOME: store.paths.home }).queued.map((q) => q.id), ["AQ-2", "AQ-1"]);
  run(["stop", "AQ-2"], { ASK_QUEUE_HOME: store.paths.home }, clock);
  assert.equal(store.getItem("AQ-2").status, "scoping");
  updateItem(store, "AQ-1", { status: "working" }, clock);
  run(["stop", "AQ-1"], { ASK_QUEUE_HOME: store.paths.home }, clock);
  assert.ok(store.getItem("AQ-1").job.stopRequested);
  assert.equal(store.getItem("AQ-1").status, "working");
  assert.throws(() => run(["stop", "AQ-2"], { ASK_QUEUE_HOME: store.paths.home }, clock), /nothing is running/);
});

test("work statuses are watched", () => {
  const store = freshStore();
  addCandidate(store, candidate(), clock);
  updateItem(store, "AQ-1", { status: "scoping", patch: { card: { channelId: "D1", ts: "1.1" } } }, clock);
  assert.deepEqual(listItems(store, { watch: true }, clock).map((i) => i.id), ["AQ-1"]);
});
