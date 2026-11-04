import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createStore } from "../scripts/aq.mjs";
import { decide } from "../scripts/gate.mjs";
import {
  TOOLS,
  decideFromCalls,
  gmailDay,
  gmailIdSeconds,
  parseResults,
  probe,
  probeQueries,
  searchCalls,
} from "../scripts/probe.mjs";

const ME = "U_ME";
const AFTER = 1793382000;

function block(n, m, { channel = "D_X", user = "U_SAM", ts = "1793382804.437649" } = {}) {
  return `### Result ${n} of ${m}\nChannel: DM (ID: ${channel})\nFrom: Sam <s@x.com> (ID: ${user}) \nTime: …\nMessage_ts: ${ts}\nText: \nhi\n\n---\n\n`;
}
function slackText(hits, { more = false } = {}) {
  const body = hits.map((h, i) => block(i + 1, hits.length, h)).join("");
  return JSON.stringify({
    results: `# Search Results for: \n\n## Messages (${hits.length} results)\n${body}`,
    pagination_info: more ? "Next cursor: abc" : "End of results - No more pages available.\\n",
  });
}
// A Gmail id whose arrival time is `sec`.
const gmailId = (sec) => (BigInt(Math.round(sec * 1000)) << 20n).toString(16);
const gmailText = (secs) =>
  JSON.stringify(secs.length ? { threads: secs.map((s) => ({ id: gmailId(s), messages: [{ id: gmailId(s), sender: "b@x.com" }] })) } : {});
const zoomText = (meetings, more = false) => JSON.stringify({ meetings, has_more: more });
const meeting = (uuid, endSec, extra = {}) => ({
  meeting_uuid: uuid,
  meeting_category: "history",
  has_summary: true,
  meeting_end_time: new Date(endSec * 1000).toISOString(),
  topic: "sync",
  ...extra,
});

// stream-json lines as claude -p prints them, for the given [query, resultText] pairs.
function stream(pairs, { error = false } = {}) {
  const lines = [];
  pairs.forEach(([q, text], i) => {
    lines.push(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: `t${i}`, name: q.tool, input: q.args }] } }));
    lines.push(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: `t${i}`, is_error: error, content: [{ type: "text", text }] }] } }));
  });
  lines.push(JSON.stringify({ type: "result", total_cost_usd: 0.006 }));
  return lines;
}
const all = { slack: { after: AFTER }, gmail: { after: AFTER }, zoom: { after: AFTER, seen: ["Z_OLD"] } };
const queries = probeQueries({ userId: ME, sources: all, before: AFTER + 900 });
const [dms, mentions, gmail, zoom] = queries;
const ctx = { userId: ME, sources: all, ignoreChannels: ["D_SELF", "D_CARDS"] };
const quietAll = (over = {}) =>
  stream([
    [dms, over.dms ?? slackText([])],
    [mentions, over.mentions ?? slackText([])],
    [gmail, over.gmail ?? gmailText([])],
    [zoom, over.zoom ?? zoomText([])],
  ]);

test("queries: one per Slack search, Gmail with whole days, Zoom from 3 hours back to now", () => {
  assert.deepEqual(queries.map((q) => q.name), ["dms", "mentions", "gmail", "zoom"]);
  assert.match(gmail.args.query, new RegExp(`^in:inbox after:${gmailDay(AFTER - 86400)} before:\\d{4}/\\d{2}/\\d{2} -from:me`));
  assert.equal(zoom.args.from, new Date((AFTER - 3 * 3600) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"));
  assert.equal(zoom.args.to, new Date((AFTER + 900) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"));
  assert.equal(probeQueries({ userId: ME, sources: { gmail: { after: AFTER } } }).length, 1);
});

test("gmail ids decode to arrival time", () => {
  assert.equal(Math.round(gmailIdSeconds("1a155895cab00000")), Math.round(Date.parse("2026-10-19T19:00:27.947Z") / 1000));
  assert.equal(gmailIdSeconds(gmailId(AFTER)), AFTER);
});

test("parseResults reads channel, sender and ts from the detailed Slack format", () => {
  const page = parseResults(slackText([{ channel: "C1", user: "U2", ts: "1793382804.1" }]));
  assert.deepEqual(page.hits, [{ channel: "C1", user: "U2", ts: "1793382804.1" }]);
  assert.equal(page.morePages, false);
  assert.equal(parseResults(slackText([], { more: true })).morePages, true);
});

test("nothing new anywhere means skip; own, old, card-channel, seen and unsummarized items don't count", () => {
  const lines = quietAll({
    dms: slackText([{ user: ME }, { channel: "D_CARDS" }, { ts: String(AFTER - 5) }]),
    gmail: gmailText([AFTER - 3600]),
    zoom: zoomText([
      meeting("Z_OLD", AFTER),
      meeting("Z_NOSUM", AFTER, { has_summary: false }),
      meeting("Z_FUTURE", AFTER, { meeting_category: "scheduled_upcoming" }),
      meeting("Z_ANCIENT", AFTER - 4 * 3600),
    ]),
  });
  const r = decideFromCalls(searchCalls(lines), queries, ctx);
  assert.equal(r.run, false, r.reason);
});

test("each source can wake the sweep on its own", () => {
  const slack = decideFromCalls(searchCalls(quietAll({ mentions: slackText([{ channel: "C9" }]) })), queries, ctx);
  assert.deepEqual([slack.run, slack.hits[0].source], [true, "slack"]);
  const mail = decideFromCalls(searchCalls(quietAll({ gmail: gmailText([AFTER + 60, AFTER - 3600]) })), queries, ctx);
  assert.deepEqual([mail.run, mail.hits.length, mail.hits[0].key.startsWith("gmail:")], [true, 1, true]);
  // A summary for a meeting that ended before the checkpoint still counts (summaries arrive late).
  const late = decideFromCalls(searchCalls(quietAll({ zoom: zoomText([meeting("Z_NEW", AFTER - 3000)]) })), queries, ctx);
  assert.deepEqual([late.run, late.hits[0].uuid], [true, "Z_NEW"]);
  assert.match(late.reason, /1 zoom/);
});

test("a changed, skipped, failed or unreadable search throws, so the gate falls back to running", () => {
  const changed = quietAll();
  changed[4] = changed[4].replace(gmail.args.query, `${gmail.args.query} is:unread`);
  assert.throws(() => decideFromCalls(searchCalls(changed), queries, ctx), /no matching gmail/);
  const skipped = stream([[dms, slackText([])], [mentions, slackText([])], [gmail, gmailText([])]]);
  assert.throws(() => decideFromCalls(searchCalls(skipped), queries, ctx), /no matching zoom/);
  const failed = stream(queries.map((q) => [q, "boom"]), { error: true });
  assert.throws(() => decideFromCalls(searchCalls(failed), queries, ctx), /failed/);
  assert.throws(() => decideFromCalls(searchCalls(quietAll({ zoom: "not json" })), queries, ctx), /unreadable zoom/);
  assert.throws(() => decideFromCalls(searchCalls(quietAll({ gmail: '{"threads":[{"messages":[{}]}]}' })), queries, ctx), /unreadable gmail/);
});

test("a full page or more pages means run, even with nothing new on it", () => {
  const own = Array.from({ length: 20 }, () => ({ user: ME }));
  assert.match(decideFromCalls(searchCalls(quietAll({ dms: slackText(own) })), queries, ctx).reason, /full page \(dms\)/);
  const oldMail = Array.from({ length: 50 }, () => AFTER - 7200);
  assert.match(decideFromCalls(searchCalls(quietAll({ gmail: gmailText(oldMail) })), queries, ctx).reason, /full page \(gmail\)/);
  assert.match(decideFromCalls(searchCalls(quietAll({ zoom: zoomText([], true) })), queries, ctx).reason, /full page \(zoom\)/);
});

test("probe() passes only the tools it needs and returns the decision and the cost", async () => {
  let tools;
  const run = async (_prompt, t) => ((tools = t), { lines: quietAll(), cost: 0.006 });
  const r = await probe({ userId: ME, sources: all, before: AFTER + 900, run });
  assert.deepEqual([r.run, r.cost], [false, 0.006]);
  assert.deepEqual(tools, [TOOLS.slack, TOOLS.gmail, TOOLS.zoom]);
});

function gateHome(sources) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aq-probe-"));
  const store = createStore(home);
  store.init();
  const config = store.config();
  config.slack = { userId: ME, selfDmId: "D_SELF", cardChannel: "D_CARDS" };
  config.sources = sources;
  fs.writeFileSync(store.paths.config, JSON.stringify(config));
  return { home, store };
}

test("gate: a bot token probes every enabled source from its own checkpoint", async () => {
  const { home, store } = gateHome({ slack: true, gmail: true, zoom: true, jira: false });
  const now = Date.parse("2026-11-03T15:00:00Z");
  const clock = () => new Date(now);
  const state = store.state();
  state.checkpoints.slack = new Date(now - 900e3).toISOString();
  state.checkpoints["sweep:last"] = new Date(now - 900e3).toISOString();
  fs.writeFileSync(store.paths.state, JSON.stringify(state));
  // No Gmail/Zoom checkpoint yet: the sweep runs once to set them.
  const first = await decide("sweep", { home, token: "xoxb-1-abc", clock, probeImpl: async () => assert.fail("no probe") });
  assert.match(first.reason, /first sweep for gmail, zoom/);
  state.checkpoints.gmail = new Date(now - 1800e3).toISOString();
  state.checkpoints.zoom = new Date(now - 600e3).toISOString();
  fs.writeFileSync(store.paths.state, JSON.stringify(state));
  const seen = [];
  const quiet = async (args) => (seen.push(args), { run: false, reason: "nothing new", cost: 0.005, hits: [] });
  const r = await decide("sweep", { home, token: "xoxb-1-abc", clock: () => new Date(now + 1), probeImpl: quiet });
  assert.equal(r.run, false);
  assert.match(r.reason, /probe \$0\.0050/);
  assert.deepEqual(Object.keys(seen[0].sources), ["slack", "gmail", "zoom"]);
  assert.equal(seen[0].sources.gmail.after, (now - 1800e3) / 1000);
  assert.equal(seen[0].sources.zoom.after, (now - 600e3) / 1000);
  assert.deepEqual(seen[0].ignoreChannels, ["D_SELF", "D_CARDS"]);
});

test("gate: a Zoom summary wakes the sweep once; jira still always runs; a failing probe falls back", async () => {
  const { home, store } = gateHome({ slack: true, zoom: true });
  const now = Date.parse("2026-11-03T15:00:00Z");
  const state = store.state();
  for (const k of ["slack", "zoom", "sweep:last"]) state.checkpoints[k] = new Date(now - 900e3).toISOString();
  fs.writeFileSync(store.paths.state, JSON.stringify(state));
  const calls = [];
  const zoomHit = async (args) => {
    calls.push(args.sources.zoom.seen);
    const fresh = args.sources.zoom.seen.includes("Z1") ? [] : [{ key: "zoom:Z1", source: "zoom", uuid: "Z1" }];
    return { run: fresh.length > 0, reason: "x", hits: fresh, cost: 0.005 };
  };
  const one = await decide("sweep", { home, token: "xoxb-1-abc", clock: () => new Date(now), probeImpl: zoomHit });
  assert.deepEqual([one.run, one.seen], [true, ["zoom:Z1"]]);
  const two = await decide("sweep", { home, token: "xoxb-1-abc", clock: () => new Date(now + 900e3), probeImpl: zoomHit });
  assert.equal(two.run, false);
  assert.deepEqual(calls[1], ["Z1"]);
  const broken = async () => {
    throw new Error("probe: no matching gmail search");
  };
  const f = await decide("sweep", { home, token: "xoxb-1-abc", clock: () => new Date(now + 2e6), probeImpl: broken });
  assert.equal(f.fallback, true);
  const jira = gateHome({ slack: true, jira: true });
  const js = jira.store.state();
  js.checkpoints.slack = new Date(now).toISOString();
  fs.writeFileSync(jira.store.paths.state, JSON.stringify(js));
  const j = await decide("sweep", { home: jira.home, token: "xoxb-1-abc", clock: () => new Date(now), probeImpl: broken });
  assert.match(j.reason, /jira can only be checked by Claude/);
});
