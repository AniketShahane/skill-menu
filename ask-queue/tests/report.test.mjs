// L2: the weekly report card, the queue's numbers, ledger facts and topics, repeat asks.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import {
  REPORT_BRIEF,
  addCandidate,
  addLedger,
  findLedger,
  findRepeats,
  listTopics,
  markRepeat,
  needsPrecheck,
  queueReport,
  recordPrecheck,
  routeToCard,
  run,
  updateItem,
} from "../scripts/aq.mjs";
import { reportDay, scheduleReport, tick } from "../scripts/dispatch.mjs";
import { makeHome } from "./helpers.mjs";

const NY = "America/New_York";
const at = (iso) => () => new Date(iso);

function setup(extra = {}) {
  const { home, store } = makeHome();
  const config = store.config();
  config.timezone = NY;
  config.report = { day: "Fri", hour: 14 };
  Object.assign(config, extra);
  fs.writeFileSync(store.paths.config, JSON.stringify(config));
  return { home, store };
}

// ---------- when the report is due ----------

test("reportDay: from the report hour on Friday until 3 days later, in local time", () => {
  const day = (iso, opts = {}, tz = NY) => reportDay(new Date(iso), tz, { day: "Fri", hour: 14, ...opts });
  assert.equal(day("2026-11-06T18:59:00Z"), null, "Fri 13:59 NY");
  assert.equal(day("2026-11-06T19:00:00Z"), "2026-11-06", "Fri 14:00 NY");
  assert.equal(day("2026-11-07T15:00:00Z"), "2026-11-06", "Saturday");
  assert.equal(day("2026-11-10T04:59:00Z"), "2026-11-06", "Mon 23:59 NY");
  assert.equal(day("2026-11-10T05:00:00Z"), null, "Tue 00:00 NY: too late");
  assert.equal(day("2026-11-05T19:00:00Z"), null, "Thursday");
  assert.equal(day("2026-03-13T18:00:00Z"), "2026-03-13", "14:00 EDT after the spring change");
  assert.equal(day("2026-03-13T17:59:00Z"), null, "13:59 EDT");
  assert.equal(day("2026-11-06T08:30:00Z", {}, "Asia/Kolkata"), "2026-11-06", "14:00 IST");
  assert.equal(day("2026-11-06T19:00:00Z", { day: "friday", hour: "14" }), "2026-11-06", "loose config");
  assert.equal(day("2026-11-03T15:00:00Z", { day: "Tue", hour: 9 }), "2026-11-03");
  assert.throws(() => day("2026-11-06T19:00:00Z", { day: "Funday" }), /config report/);
  assert.throws(() => day("2026-11-06T19:00:00Z", { hour: 24 }), /config report/);
  assert.throws(() => day("2026-11-06T19:00:00Z", { hour: 13.5 }), /config report/);
});

test("weekly report: tick makes it once, starts it without the prep delay or a pre-check", () => {
  const { home, store } = setup({ workers: { prepDelayMin: 30, precheckWaitMin: 45 } });
  const spawned = [];
  const opts = { home, spawnSupervisor: (_h, id) => spawned.push(id), alive: () => true };
  assert.equal(tick({ ...opts, clock: at("2026-11-06T18:00:00Z") }).report, undefined, "before 14:00");
  const result = tick({ ...opts, clock: at("2026-11-06T19:05:00Z") });
  const id = result.report;
  assert.ok(id);
  assert.deepEqual(spawned, [id]);
  const item = store.getItem(id);
  assert.equal(item.source.kind, "report");
  assert.equal(item.askType, "weekly-report");
  assert.equal(item.job.brief, REPORT_BRIEF);
  assert.equal(item.title, "Weekly report: 2026-10-31 to 2026-11-06");
  assert.deepEqual(item.fingerprints, ["report:2026-11-06"]);
  assert.equal(needsPrecheck({ ...item, status: "new" }, Date.parse("2026-11-07"), 0), false);
  assert.equal(tick({ ...opts, clock: at("2026-11-07T15:00:00Z") }).report, undefined, "once per week");
  assert.equal(scheduleReport(store, new Date("2026-11-13T19:00:00Z")) !== null, true, "next week's");
});

test("weekly report: off, or a bad config, never blocks the tick", () => {
  const off = setup({ report: { off: true } });
  assert.equal(scheduleReport(off.store, new Date("2026-11-06T19:05:00Z")), null);
  const bad = setup({ report: { day: "Someday" } });
  addCandidate(bad.store, { title: "manual", source: { kind: "manual" }, fingerprints: ["manual:1"] });
  const spawned = [];
  const result = tick({ home: bad.home, clock: at("2026-11-06T19:05:00Z"), spawnSupervisor: (_h, id) => spawned.push(id), alive: () => true });
  assert.match(result.scheduleError, /config report/);
  assert.deepEqual(spawned, ["AQ-1"], "sessions still start");
});

// ---------- the numbers ----------

test("report: an empty queue gives zeros and nulls, never NaN", () => {
  const { store } = setup();
  const r = queueReport(store, {}, at("2026-11-06T20:00:00Z"));
  const walk = (v) => (v && typeof v === "object" ? Object.values(v).forEach(walk) : assert.ok(!Number.isNaN(v), "NaN in report"));
  walk(r);
  assert.equal(r.asks.harvested, 0);
  assert.equal(r.closed.oneTapRate, null);
  assert.equal(r.closed.medianHoursToClose, null);
  assert.deepEqual(r.repeats, []);
});

test("report: intake, you-answered-first, one tap, edits, rounds and promises add up", () => {
  const { store } = setup();
  const day = (d, h = 12) => at(`2026-11-0${d}T${String(h).padStart(2, "0")}:00:00Z`);
  const add = (title, extra = {}, clock = day(2)) =>
    addCandidate(store, { title, source: { kind: "slack", who: "Sam", channelId: "C1", ts: `${title.length}.1` }, fingerprints: [`slack:${title}`], excerpt: title, ...extra }, clock).id;

  add("fyi deploy", { status: "filtered", askType: "fyi" });
  const back = add("filtered then back", { status: "filtered" });
  updateItem(store, back, { status: "new" }, day(3));
  const tap = add("one tap", { askType: "data-question" });
  updateItem(store, tap, { status: "approving", patch: { card: { channelId: "DBOT", ts: "5.1" } } }, day(2, 13));
  routeToCard(store, tap, { messages: [{ text: "yes" }] }, day(2, 14));
  addLedger(store, { id: tap, outcome: "sent", edited: false, guessesRight: true, who: "Sam" }, day(3));
  const edited = add("edited twice", { askType: "data-question" });
  updateItem(store, edited, { status: "asking" }, day(2, 13));
  routeToCard(store, edited, { messages: [{ text: "1: x" }] }, day(2, 14));
  updateItem(store, edited, { status: "working", internal: true }, day(2, 14));
  updateItem(store, edited, { status: "approving" }, day(2, 15));
  routeToCard(store, edited, { messages: [{ text: "shorter" }] }, day(2, 16));
  addLedger(store, { id: edited, outcome: "sent", edited: true, guessesRight: false }, day(4));
  const legacy = add("legacy entry");
  addLedger(store, { id: legacy, outcome: "sent", rounds: 0 }, day(4));
  const beaten = add("answered in thread");
  updateItem(store, beaten, { status: "asking" }, day(2, 13));
  updateItem(store, beaten, { status: "skipped", note: "the user handled it in the source thread" }, day(3));
  const pre = add("pre-check handled");
  recordPrecheck(store, pre, { verdict: "handled", reason: "replied" }, day(2, 13));
  add("old ask", {}, at("2026-10-01T12:00:00Z"));
  addCandidate(store, { title: "direct", source: { kind: "direct" }, direct: true, fingerprints: ["direct:1"] }, day(3));
  addCandidate(store, { title: "promise", status: "tracking", source: { kind: "slack" }, fingerprints: ["promise:1"], track: { kind: "promise", due: "2026-11-04" } }, day(2));
  const kept = addCandidate(store, { title: "kept", status: "tracking", source: { kind: "slack" }, fingerprints: ["promise:2"], track: { kind: "waiting", due: "2026-11-09" } }, day(2)).id;
  updateItem(store, kept, { status: "done", note: "kept: sent it" }, day(4));
  // A reopened item closes twice: only the latest counts.
  addLedger(store, { id: tap, outcome: "sent", edited: false, guessesRight: true }, day(5));

  const r = queueReport(store, { days: 7 }, at("2026-11-06T20:00:00Z"));
  assert.equal(r.asks.harvested, 7, "old ask, direct and promises are not intake");
  assert.equal(r.asks.filtered, 2);
  assert.equal(r.asks.broughtBack, 1);
  assert.equal(r.asks.youAnsweredFirst, 2);
  assert.equal(r.asks.direct, 1);
  assert.equal(r.asks.carded, 3);
  assert.deepEqual(r.asks.types, { "data-question": 2, fyi: 1 });
  assert.equal(r.closed.total, 3);
  assert.equal(r.closed.sent, 3);
  assert.equal(r.closed.oneTap, 1);
  assert.equal(r.closed.oneTapRate, 0.33);
  assert.equal(r.closed.editRate, 0.5);
  assert.equal(r.closed.editUnknown, 1, "a missing edited is unknown, not 'unedited'");
  assert.equal(r.closed.guessRate, 0.5);
  assert.equal(r.closed.medianRounds, 1);
  assert.equal(r.tracking.open, 1);
  assert.equal(r.tracking.overdue, 1);
  assert.equal(r.tracking.kept, 1);
  assert.ok(r.closed.medianHoursToClose > 0);
});

test("report: --days is a whole number from 1 to 90", () => {
  const { home } = setup();
  const env = { ASK_QUEUE_HOME: home };
  for (const bad of [["--days", "0"], ["--days", "91"], ["--days", "2.5"], ["--days", "abc"], ["--days"]]) {
    assert.throws(() => run(["report", ...bad], env), /--days/, bad.join(" "));
  }
  assert.equal(run(["report", "--days", "30"], env).window.days, 30);
  assert.equal(run(["report"], env).window.days, 7);
});

// ---------- ledger ----------

test("ledger: code fills createdAt, rounds and sourceKind; never overrides; survives a purged item", () => {
  const { store } = setup();
  const id = addCandidate(store, { title: "x", source: { kind: "slack" }, fingerprints: ["slack:x"] }, at("2026-11-02T12:00:00Z")).id;
  updateItem(store, id, { status: "asking", patch: { card: { channelId: "D", ts: "1.1" } } });
  routeToCard(store, id, { messages: [{ text: "ok" }] });
  const rec = addLedger(store, { id, outcome: "sent" });
  assert.equal(rec.createdAt, "2026-11-02T12:00:00.000Z");
  assert.equal(rec.rounds, 1);
  assert.equal(rec.sourceKind, "slack");
  assert.equal(rec.edited, null, "sent with no edited flag is unknown");
  assert.equal(addLedger(store, { id, outcome: "sent", rounds: 4, edited: false }).rounds, 4);
  const gone = addLedger(store, { id: "AQ-999", outcome: "skipped" });
  assert.equal(gone.createdAt, undefined);
  assert.equal(addLedger(store, { id: "not-an-id", outcome: "skipped" }).rounds, undefined);
  assert.equal(addLedger(store, { id, outcome: "skipped" }).edited, undefined, "only sent entries get edited");
  assert.throws(() => addLedger(store, []), /JSON object/);
});

test("ledger: topics are slugged; facts are checked, with clear errors", () => {
  const { store } = setup();
  assert.equal(addLedger(store, { id: "AQ-1", outcome: "sent", topic: "  Daily Active Users!! " }).topic, "daily-active-users");
  assert.equal(addLedger(store, { id: "AQ-1", outcome: "sent", topic: "!!!" }).topic, undefined);
  assert.equal(addLedger(store, { id: "AQ-1", outcome: "sent", topic: "a".repeat(39) + "-bbbb" }).topic, "a".repeat(39), "cut at 40, no trailing dash");
  const good = { claim: "Volume", value: 0, asOf: "2026-11-01", source: "gold table" };
  assert.deepEqual(addLedger(store, { id: "AQ-1", outcome: "sent", facts: [good] }).facts, [good], "zero is a value");
  assert.equal(addLedger(store, { id: "AQ-1", outcome: "sent", facts: [{ ...good, asOf: "2026-11-01T13:00:00Z", query: "q.sql" }] }).facts[0].query, "q.sql");
  const bad = [
    [[{ ...good, claim: " " }], /needs a claim/],
    [[{ ...good, value: null }], /needs a value/],
    [[{ ...good, value: "" }], /needs a value/],
    [[{ ...good, asOf: "yesterday" }], /asOf/],
    [[{ ...good, asOf: "2026-02-30" }], /asOf/],
    [[{ ...good, asOf: "2026-11-01Tgarbage" }], /asOf/],
    [[{ ...good, source: "" }], /needs a source/],
    [["4.2M"], /must be an object/],
    [Array(21).fill(good), /up to 20/],
    [{ claim: "x" }, /must be a list/],
  ];
  for (const [facts, error] of bad) assert.throws(() => addLedger(store, { id: "AQ-1", outcome: "sent", facts }), error);
});

test("ledger: a half-written line is skipped, and the next entry still lands on its own line", () => {
  const { store } = setup();
  addLedger(store, { id: "AQ-1", outcome: "sent", topic: "a" });
  fs.appendFileSync(store.paths.ledger, '{"id": "AQ-2", "outc'); // crash mid-append, no newline
  addLedger(store, { id: "AQ-3", outcome: "skipped", topic: "a" });
  fs.appendFileSync(store.paths.ledger, "[1,2]\n42\n");
  assert.deepEqual(store.ledgerEntries().map((e) => e.id), ["AQ-1", "AQ-3"]);
  assert.equal(listTopics(store)[0].count, 2);
});

test("ledger find: each match has its age; facts older than answers.staleDays are stale", () => {
  const { store } = setup();
  addLedger(store, { id: "AQ-1", outcome: "sent", ask: "daily volume", facts: [
    { claim: "v", value: 1, asOf: "2026-11-01", source: "t" },
    { claim: "w", value: 2, asOf: "2026-10-20T10:00:00Z", source: "t" },
  ] }, at("2026-11-02T12:00:00Z"));
  addLedger(store, { id: "AQ-2", outcome: "sent", ask: "daily volume again" }, at("2026-11-05T12:00:00Z"));
  const found = findLedger(store, "DAILY volume", 5, at("2026-11-06T12:00:00Z"));
  assert.deepEqual(found.map((e) => e.id), ["AQ-2", "AQ-1"], "newest first");
  assert.equal(found[0].ageDays, 1);
  assert.equal(found[0].facts, undefined);
  assert.deepEqual(found[1].facts.map((f) => [f.ageDays, f.stale]), [[5, false], [17, true]]);
  const store2 = setup({ answers: { staleDays: 30 } }).store;
  addLedger(store2, { id: "AQ-1", outcome: "sent", ask: "v", facts: [{ claim: "w", value: 2, asOf: "2026-10-20", source: "t" }] });
  assert.equal(findLedger(store2, "v", 5, at("2026-11-06T12:00:00Z"))[0].facts[0].stale, false);
  assert.equal(store.ledgerEntries()[0].facts[0].stale, undefined, "the file itself is unchanged");
  assert.throws(() => findLedger(store, "  "), /needs a query/);
});

// ---------- repeats ----------

test("repeats: 3+ asks from 2+ people in 90 days; one person repeating is not enough", () => {
  const { store } = setup();
  const now = at("2026-11-06T12:00:00Z");
  const close = (id, who, topic, iso = "2026-11-01T12:00:00Z", extra = {}) => addLedger(store, { id, who, topic, outcome: "sent", ask: `${topic} from ${who}`, ...extra }, at(iso));
  close("AQ-1", "Sam Lee", "dau");
  close("AQ-2", "sam lee ", "DAU");
  close("AQ-3", "Sam Lee", "dau");
  assert.deepEqual(findRepeats(store, {}, now), [], "one asker, three times");
  close("AQ-4", "Priya", "dau", "2026-11-03T12:00:00Z");
  close("AQ-5", "Lee", "churn");
  close("AQ-6", "Kim", "churn");
  close("AQ-7", "Kim", "churn", "2026-07-01T12:00:00Z"); // older than 90 days
  close("AQ-8", "Ana", "churn", "2026-12-01T12:00:00Z"); // in the future: clock skew
  close("AQ-9", "", "churn"); // no asker: counts as an ask, not a person
  const reps = findRepeats(store, {}, now);
  assert.deepEqual(reps.map((r) => r.topic), ["dau", "churn"], "most asked first");
  assert.equal(reps[0].count, 4);
  assert.deepEqual(reps[0].askers.map((a) => a.trim().toLowerCase()).sort(), ["priya", "sam lee"]);
  assert.equal(reps[0].lastAsk, "dau from Priya");
  assert.equal(reps[1].count, 3, "the old and the future-dated asks are left out");
  assert.deepEqual(reps[1].askers.sort(), ["Kim", "Lee"]);
  close("AQ-2", "Sam Lee", "something-else", "2026-11-04T12:00:00Z"); // reopened and relabeled: latest wins
  assert.equal(findRepeats(store, {}, now)[0].count, 3);
});

test("repeats: marking one offered pauses it for 30 days", () => {
  const { store } = setup();
  for (const [id, who] of [["AQ-1", "A"], ["AQ-2", "B"], ["AQ-3", "C"]]) addLedger(store, { id, who, topic: "dau", outcome: "sent" }, at("2026-11-01T12:00:00Z"));
  markRepeat(store, " DAU ", at("2026-11-02T12:00:00Z"));
  assert.deepEqual(findRepeats(store, {}, at("2026-11-20T12:00:00Z")), []);
  assert.equal(findRepeats(store, {}, at("2026-11-30T12:00:00Z")).length, 0, "day 28: still paused");
  addLedger(store, { id: "AQ-4", who: "D", topic: "dau", outcome: "sent" }, at("2026-12-04T12:00:00Z"));
  assert.equal(findRepeats(store, {}, at("2026-12-04T12:00:00Z")).length, 1, "after 30 days it can come back");
  assert.throws(() => markRepeat(store, "!!"), /needs a topic/);
  assert.throws(() => run(["repeats", "--mark"], { ASK_QUEUE_HOME: store.paths.home }), /needs a topic/);
});
