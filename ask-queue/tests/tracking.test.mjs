// Promises and waits: the tracking status, reminder cards (no model) and expiry.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { TRANSITIONS, addCandidate, listItems, needsPrecheck, routeToCard, updateItem } from "../scripts/aq.mjs";
import { expireTracking, plainSlack, remind, remindDue, reminderText, tick, workerPrompt } from "../scripts/dispatch.mjs";
import { makeHome } from "./helpers.mjs";

// 2026-11-06 is a Friday; New York is on EST (UTC-5) after Nov 1.
const FRI_10 = new Date("2026-11-06T15:00:00Z");
const clockAt = (date) => () => date;

function setup({ bot = true, ...extra } = {}) {
  const { home, store } = makeHome();
  const config = store.config();
  config.timezone = "America/New_York";
  if (bot) config.slack.cardChannel = "DBOT";
  Object.assign(config, extra);
  fs.writeFileSync(store.paths.config, JSON.stringify(config));
  return { home, store };
}

let n = 0;
function track(store, t = {}, extra = {}) {
  n += 1;
  return addCandidate(store, {
    title: `Q3 numbers for Sam ${n}`,
    status: "tracking",
    source: { kind: "slack", who: "Sam Lee", where: "#eng", url: "https://x.slack.com/archives/C1/p1", channelId: "C1", ts: `200.${n}` },
    excerpt: "I'll send the Q3 numbers by Friday",
    fingerprints: [`promise:C1:200.${n}`],
    track: { kind: "promise", due: "2026-11-06", ...t },
    ...extra,
  }).id;
}

function poster({ fail = 0, bad = false } = {}) {
  const sent = [];
  let failures = fail;
  const post = async (text) => {
    if (failures > 0) {
      failures -= 1;
      throw new Error("chat.postMessage: ratelimited");
    }
    sent.push(text);
    return bad ? {} : { channel: "DBOT", ts: `900.${sent.length}` };
  };
  return { sent, post };
}

// ---------- the item ----------

test("tracking: created as tracking, never pre-checked, never started by tick", () => {
  const { home, store } = setup();
  const id = track(store);
  const item = store.getItem(id);
  assert.equal(item.status, "tracking");
  assert.equal(needsPrecheck(item, Date.now(), 0), false);
  const spawned = [];
  const result = tick({ home, clock: clockAt(FRI_10), spawnSupervisor: (_h, x) => spawned.push(x), alive: () => true });
  assert.deepEqual(spawned, []);
  assert.deepEqual(result.prepQueued, []);
  assert.equal(store.getItem(id).status, "tracking");
  assert.ok(listItems(store, { open: true }).some((i) => i.id === id), "open list shows it");
  assert.equal(addCandidate(store, { title: "again", status: "tracking", source: { kind: "slack" }, fingerprints: item.fingerprints, track: item.track }).action, "duplicate");
});

test("tracking: status and track go together; due must be a real date", () => {
  const { store } = setup();
  const base = { title: "x", source: { kind: "slack" }, fingerprints: ["promise:C:1"] };
  assert.throws(() => addCandidate(store, { ...base, status: "tracking" }), /go together/);
  assert.throws(() => addCandidate(store, { ...base, track: { kind: "promise", due: "2026-11-06" } }), /go together/);
  assert.throws(() => addCandidate(store, { ...base, status: "filtered", track: { kind: "promise", due: "2026-11-06" } }), /go together/);
  for (const due of ["Friday", "2026-02-30", "2026-13-01", "2026-11-6", "", null, undefined, 20261106]) {
    assert.throws(() => addCandidate(store, { ...base, status: "tracking", track: { kind: "promise", due } }), /track.due/, String(due));
  }
  assert.throws(() => addCandidate(store, { ...base, status: "tracking", track: { kind: "todo", due: "2026-11-06" } }), /track.kind/);
  assert.throws(() => addCandidate(store, { ...base, status: "tracking", track: ["promise"] }), /track must be an object/);
  assert.throws(() => addCandidate(store, { ...base, status: "tracking", track: { kind: "promise", due: "2026-11-06", dueGuessed: "yes" } }), /dueGuessed/);
  assert.throws(() => addCandidate(store, { ...base, status: "asking" }), /must be 'new', 'filtered' or 'tracking'/);
  assert.equal(addCandidate(store, { ...base, status: "tracking", track: { kind: "waiting", due: "2028-02-29" } }).action, "created", "leap day");
});

test("tracking: the model may move the date; reminder fields are code-only; kind survives a merge", () => {
  const { store } = setup();
  const id = track(store);
  updateItem(store, id, { patch: { track: { due: "2026-11-10", dueGuessed: false } } });
  assert.deepEqual(store.getItem(id).track, { kind: "promise", due: "2026-11-10", dueGuessed: false });
  assert.throws(() => updateItem(store, id, { patch: { track: { remindedFor: "2026-11-10" } } }), /managed by dispatch/);
  assert.throws(() => updateItem(store, id, { patch: { track: { due: "next week" } } }), /track.due/);
  assert.throws(() => updateItem(store, id, { patch: { track: null } }), /track must be an object/);
  assert.equal(store.getItem(id).track.due, "2026-11-10", "a rejected patch changes nothing");
});

test("tracking: transitions, and a reply on its card queues a session that comes back to tracking", () => {
  assert.deepEqual(TRANSITIONS.tracking.sort(), ["done", "ready", "skipped", "tracking"]);
  assert.ok(TRANSITIONS.working.includes("tracking"));
  const { store } = setup();
  const id = track(store);
  assert.throws(() => updateItem(store, id, { status: "asking" }), /Cannot move/);
  assert.throws(() => updateItem(store, id, { status: "working" }), /Cannot move/);
  updateItem(store, id, { patch: { card: { channelId: "DBOT", ts: "900.1", lastSeenTs: "900.1" } }, internal: true });
  assert.ok(listItems(store, { watch: true }).some((i) => i.id === id), "watched once it has a card");
  routeToCard(store, id, { messages: [{ ts: "901.0", text: "move it to monday" }], seenTs: "901.0" });
  const item = store.getItem(id);
  assert.equal(item.status, "ready");
  assert.equal(item.job.restingStatus, "tracking");
  updateItem(store, id, { status: "working", internal: true });
  updateItem(store, id, { status: "tracking", patch: { track: { due: "2026-11-09" } } });
  assert.equal(store.getItem(id).status, "tracking");
});

// ---------- reminders ----------

test("reminders: due today posts once, inside hours, and becomes the item's card", async () => {
  const { store } = setup();
  const id = track(store);
  const { sent, post } = poster();
  const first = await remindDue(store, { now: FRI_10, post });
  assert.deepEqual(first.reminded, [id]);
  assert.match(sent[0], new RegExp(`^🤖 ⏰ \\*\\*${id} · Due today: Q3 numbers for Sam`));
  assert.match(sent[0], /💬 \*\*You told Sam\*\*/);
  assert.match(sent[0], /from \[Sam Lee · #eng\]\(https:\/\/x\.slack\.com/);
  assert.match(sent[0], /━{16}$/);
  const item = store.getItem(id);
  assert.deepEqual(item.card, { channelId: "DBOT", ts: "900.1", lastSeenTs: "900.1" });
  assert.equal(item.track.remindedFor, "2026-11-06");
  assert.equal(item.status, "tracking");
  const again = await remindDue(store, { now: new Date(FRI_10.getTime() + 3600_000), post });
  assert.deepEqual(again.reminded, []);
  assert.equal(sent.length, 1, "one reminder per due date");
});

test("reminders: not before the due date, only weekdays inside local hours, overdue on Monday", async () => {
  const { store } = setup();
  const id = track(store);
  const { sent, post } = poster();
  const at = async (iso) => remindDue(store, { now: new Date(iso), post });
  assert.deepEqual((await at("2026-11-05T15:00:00Z")).reminded, [], "Thursday: not due yet");
  assert.match((await at("2026-11-06T13:59:00Z")).skipped, /outside reminder hours/, "Fri 08:59 NY");
  assert.match((await at("2026-11-06T23:00:00Z")).skipped, /outside reminder hours/, "Fri 18:00 NY");
  assert.match((await at("2026-11-07T15:00:00Z")).skipped, /outside reminder hours/, "Saturday");
  assert.match((await at("2026-11-09T03:00:00Z")).skipped, /outside reminder hours/, "Sun 22:00 NY is Mon 03:00 UTC");
  assert.equal(sent.length, 0);
  assert.deepEqual((await at("2026-11-09T14:00:00Z")).reminded, [id], "Mon 09:00 NY");
  assert.match(sent[0], /Overdue since Fri, Nov 6/);
});

test("reminders: local hours follow daylight saving time and custom hours", async () => {
  const { store } = setup({ track: { hours: [8, 20] } });
  const id = track(store, { due: "2026-03-09" });
  const { post } = poster();
  // Mon 2026-03-09 is the day after clocks go forward: 07:30 EDT = 11:30 UTC (it would be 06:30 EST).
  assert.match((await remindDue(store, { now: new Date("2026-03-09T11:30:00Z"), post })).skipped, /outside/);
  assert.deepEqual((await remindDue(store, { now: new Date("2026-03-09T12:00:00Z"), post })).reminded, [id], "08:00 EDT");
});

test("reminders: no bot DM or no token posts nothing and marks nothing", async () => {
  const off = setup({ bot: false });
  const a = track(off.store);
  const { sent, post } = poster();
  assert.match((await remindDue(off.store, { now: FRI_10, post })).skipped, /no bot DM/);
  const on = setup();
  const b = track(on.store);
  assert.match((await remindDue(on.store, { now: FRI_10, post: null })).skipped, /no bot token/);
  assert.equal(sent.length, 0);
  assert.equal(off.store.getItem(a).track.remindedFor, undefined);
  assert.equal(on.store.getItem(b).track.remindedFor, undefined);
  assert.equal(on.store.getItem(b).card, undefined);
});

test("reminders: a failed or empty post backs off 30 minutes, then retries", async () => {
  const { store } = setup();
  const id = track(store);
  const flaky = poster({ fail: 1 });
  const first = await remindDue(store, { now: FRI_10, post: flaky.post });
  assert.deepEqual(first.failed, [id]);
  let item = store.getItem(id);
  assert.equal(item.card, undefined);
  assert.equal(item.track.remindedFor, undefined);
  assert.match(item.history.at(-1).note, /reminder failed: chat.postMessage: ratelimited/);
  await remindDue(store, { now: new Date(FRI_10.getTime() + 10 * 60_000), post: flaky.post });
  assert.equal(flaky.sent.length, 0, "inside the back-off: not tried");
  const later = await remindDue(store, { now: new Date(FRI_10.getTime() + 31 * 60_000), post: flaky.post });
  assert.deepEqual(later.reminded, [id]);
  item = store.getItem(id);
  assert.equal(item.track.retryAt, null);

  const empty = setup();
  const e = track(empty.store);
  assert.deepEqual((await remindDue(empty.store, { now: FRI_10, post: poster({ bad: true }).post })).failed, [e]);
  assert.equal(empty.store.getItem(e).card, undefined, "a post result without ts is not a card");
});

test("reminders: at most 5 per pass, earliest due first; the rest next pass", async () => {
  const { store } = setup();
  const ids = ["2026-11-06", "2026-11-02", "2026-11-04", "2026-11-03", "2026-11-05", "2026-11-01", "2026-11-06"].map((due) => track(store, { due }));
  const { post } = poster();
  const first = await remindDue(store, { now: FRI_10, post });
  assert.deepEqual(first.reminded, [ids[5], ids[1], ids[3], ids[2], ids[4]]);
  assert.equal(first.later, 2);
  const second = await remindDue(store, { now: FRI_10, post });
  assert.deepEqual(second.reminded, [ids[0], ids[6]]);
  assert.equal(second.later, undefined);
});

test("reminders: a new due date reminds again and keeps the old card; a queued item is left alone", async () => {
  const { store } = setup();
  const id = track(store);
  const other = track(store);
  const { sent, post } = poster();
  routeToCard(store, other, { messages: [{ text: "done" }] }); // no card yet, but its session is queued
  assert.deepEqual((await remindDue(store, { now: FRI_10, post })).reminded, [id], "ready items are not reminded");
  updateItem(store, id, { patch: { track: { due: "2026-11-09" } } });
  const monday = new Date("2026-11-09T15:00:00Z");
  assert.deepEqual((await remindDue(store, { now: monday, post })).reminded, [id]);
  const item = store.getItem(id);
  assert.equal(item.card.ts, "900.2");
  assert.equal(item.previousCard.ts, "900.1");
  assert.match(sent[1], /Due today/);
});

test("reminder text: mentions and link markup neutralized, long text cut, waits worded, guessed dates said", () => {
  const raw = `Hey <@U123ABC|sam> and <@U999> <!channel> <!subteam^S1|@data-team> see <https://a.b/c|the doc> and <https://x.y/z> <mailto:a@b.c|mail>\n\nline two ${"word ".repeat(80)}`;
  const flat = plainSlack(raw);
  assert.doesNotMatch(flat, /[<>\n]/);
  assert.match(flat, /^Hey @sam and @someone @channel @data-team see the doc and \(link\) mail line two/);
  assert.ok(flat.length <= 201 && flat.endsWith("…"));
  assert.equal(plainSlack(undefined), "");
  assert.equal(plainSlack(null), "");

  const wait = {
    id: "AQ-9",
    title: "MPT list",
    excerpt: "",
    source: { who: "Asim Ismail", where: "DM", url: "javascript:alert(1)" },
    track: { kind: "waiting", due: "2026-11-06", dueGuessed: true },
  };
  const text = reminderText(wait, "2026-11-06");
  assert.match(text, /^🤖 ⏰ \*\*AQ-9 · Still waiting on Asim: MPT list\*\*/);
  assert.match(text, /You asked Asim/);
  assert.match(text, /> MPT list/, "empty excerpt falls back to the title");
  assert.match(text, /No date was given, so I picked Fri, Nov 6/);
  assert.match(text, /draft a nudge/);
  assert.match(text, /^from Asim Ismail · DM$/m, "a non-https url is not linked");
  const paren = reminderText({ ...wait, source: { who: "", url: "https://x.y/a)b" } }, "2026-11-06");
  assert.match(paren, /^from someone$/m, "a url that would break the link is dropped; no name is 'someone'");
});

test("lifecycle: promise -> reminder card -> reply -> session told to handle it -> back to tracking", async () => {
  const { home, store } = setup();
  const id = track(store);
  const { post } = poster();
  await remindDue(store, { now: FRI_10, post });
  // The watcher routes a card-thread reply exactly like this (watch.mjs).
  routeToCard(store, id, { messages: [{ ts: "901.5", text: "move it to monday" }], seenTs: "901.5" }, clockAt(FRI_10), { grant: true });
  const spawned = [];
  const result = tick({ home, clock: clockAt(FRI_10), spawnSupervisor: (_h, x) => spawned.push(x), alive: () => true });
  assert.deepEqual(result.started, [id]);
  const item = store.getItem(id);
  assert.equal(item.status, "working");
  const prompt = workerPrompt(home, { ...item, job: { ...item.job, lastFollowUp: item.job.followUp } }, store.config());
  assert.match(prompt, /posted before it had its own session/);
  assert.match(prompt, /card-session\.md section 2/);
  assert.match(prompt, /thread 900\.1|--thread 900\.1/);
  assert.match(prompt, /move it to monday/);
  // The session moves the date and rests; a new reminder comes on Monday.
  updateItem(store, id, { status: "tracking", patch: { track: { due: "2026-11-09", dueGuessed: false } } });
  assert.equal(store.getItem(id).card.lastSeenTs, "901.5");
  assert.deepEqual((await remindDue(store, { now: new Date("2026-11-09T15:00:00Z"), post })).reminded, [id]);
});

// ---------- expiry ----------

test("expiry: closes promises expireDays past due, quietly; others untouched", () => {
  const { home, store } = setup();
  const id = track(store);
  const fresh = track(store, { due: "2026-11-20" });
  const regular = addCandidate(store, { title: "ask", source: { kind: "slack" }, fingerprints: ["slack:C:9"] }).id;
  assert.deepEqual(expireTracking(store, new Date("2026-11-20T15:00:00Z")), [], "day 14 is still kept");
  const result = tick({ home, clock: clockAt(new Date("2026-11-21T15:00:00Z")), spawnSupervisor: () => {}, alive: () => true });
  assert.deepEqual(result.lapsed, [id]);
  const item = store.getItem(id);
  assert.equal(item.status, "skipped");
  assert.match(item.history.at(-1).note, /^expired: 14 days past due/);
  assert.equal(store.getItem(fresh).status, "tracking");
  assert.notEqual(store.getItem(regular).status, "skipped");
});

test("expiry: config track.expireDays", () => {
  const { store } = setup({ track: { expireDays: 3 } });
  const id = track(store);
  assert.deepEqual(expireTracking(store, new Date("2026-11-10T15:00:00Z")), [id]);
});

// ---------- one pass at a time ----------

test("remind(): a live lock skips the pass; a stale one is cleared", async () => {
  const { home, store } = setup();
  const id = track(store);
  const lock = path.join(home, ".remind.lock");
  fs.mkdirSync(lock);
  const { sent, post } = poster();
  assert.match((await remind({ home, clock: clockAt(FRI_10), post })).skipped, /another reminder pass/);
  const old = new Date(Date.now() - 10 * 60_000);
  fs.utimesSync(lock, old, old);
  assert.deepEqual((await remind({ home, clock: clockAt(FRI_10), post })).reminded, [id]);
  assert.equal(fs.existsSync(lock), false, "released after the pass");
  assert.equal(sent.length, 1);
});

test("reminders: the token is only loaded when something is due", async () => {
  const { store } = setup();
  let connects = 0;
  const connect = () => {
    connects += 1;
    return poster().post;
  };
  assert.deepEqual((await remindDue(store, { now: FRI_10, connect })).reminded, []);
  assert.equal(connects, 0, "nothing due: no token lookup");
  const id = track(store);
  assert.deepEqual((await remindDue(store, { now: FRI_10, connect })).reminded, [id]);
  assert.equal(connects, 1);
  track(store);
  assert.match((await remindDue(store, { now: FRI_10, connect: () => null })).skipped, /no bot token/);
});
