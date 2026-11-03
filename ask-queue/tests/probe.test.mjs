import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createStore } from "../scripts/aq.mjs";
import { decide } from "../scripts/gate.mjs";
import { SEARCH_TOOL, decideFromCalls, parseResults, probe, probeQueries, searchCalls } from "../scripts/probe.mjs";

const ME = "U_ME";
const AFTER = 1793382000;

function block(n, m, { channel = "D_X", user = "U_SAM", ts = "1793382804.437649" } = {}) {
  return `### Result ${n} of ${m}\nChannel: DM (ID: ${channel})\nFrom: Sam <s@x.com> (ID: ${user}) \nTime: …\nMessage_ts: ${ts}\nText: \nhi\n\n---\n\n`;
}
function resultText(hits, { more = false } = {}) {
  const body = hits.map((h, i) => block(i + 1, hits.length, h)).join("");
  return JSON.stringify({
    results: `# Search Results for: \n\n## Messages (${hits.length} results)\n${body}`,
    pagination_info: more ? "Next cursor: abc" : "End of results - No more pages available.\\n",
  });
}
// stream-json lines as claude -p prints them, for the given [args, resultText] pairs.
function stream(pairs, { error = false } = {}) {
  const lines = [];
  pairs.forEach(([input, text], i) => {
    lines.push(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: `t${i}`, name: SEARCH_TOOL, input }] } }));
    lines.push(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: `t${i}`, is_error: error, content: [{ type: "text", text }] }] } }));
  });
  lines.push(JSON.stringify({ type: "result", total_cost_usd: 0.006 }));
  return lines;
}
const queries = probeQueries(ME, AFTER);
const ctx = { userId: ME, ignoreChannels: ["D_SELF", "D_CARDS"], after: AFTER };

test("parseResults reads channel, sender and ts from the detailed format", () => {
  const page = parseResults(resultText([{ channel: "C1", user: "U2", ts: "1793382804.1" }]));
  assert.deepEqual(page.hits, [{ channel: "C1", user: "U2", ts: "1793382804.1" }]);
  assert.equal(page.morePages, false);
  assert.equal(parseResults(resultText([], { more: true })).morePages, true);
});

test("a new message from someone else means run; own, old and card-channel messages don't", () => {
  const quiet = stream([
    [queries[0].args, resultText([{ user: ME }, { channel: "D_CARDS" }, { ts: String(AFTER - 5) }])],
    [queries[1].args, resultText([])],
  ]);
  assert.equal(decideFromCalls(searchCalls(quiet), queries, ctx).run, false);
  const busy = stream([[queries[0].args, resultText([])], [queries[1].args, resultText([{ channel: "C9" }])]]);
  const r = decideFromCalls(searchCalls(busy), queries, ctx);
  assert.equal(r.run, true);
  assert.equal(r.hits[0].query, "mentions");
});

test("a changed or skipped search throws, so the gate falls back to running", () => {
  const changed = stream([
    [{ ...queries[0].args, after: String(AFTER + 3600) }, resultText([])],
    [queries[1].args, resultText([])],
  ]);
  assert.throws(() => decideFromCalls(searchCalls(changed), queries, ctx), /no matching dms/);
  const skipped = stream([[queries[0].args, resultText([])]]);
  assert.throws(() => decideFromCalls(searchCalls(skipped), queries, ctx), /no matching mentions/);
  const failed = stream([[queries[0].args, "boom"], [queries[1].args, "boom"]], { error: true });
  assert.throws(() => decideFromCalls(searchCalls(failed), queries, ctx), /failed/);
});

test("a full page or unread next page means run, even with nothing new on it", () => {
  const own = Array.from({ length: 20 }, () => ({ user: ME }));
  const full = stream([[queries[0].args, resultText(own)], [queries[1].args, resultText([])]]);
  assert.match(decideFromCalls(searchCalls(full), queries, ctx).reason, /full page/);
  const more = stream([[queries[0].args, resultText([], { more: true })], [queries[1].args, resultText([])]]);
  assert.equal(decideFromCalls(searchCalls(more), queries, ctx).run, true);
});

test("probe() returns the decision and the cost", async () => {
  const run = async () => ({ lines: stream([[queries[0].args, resultText([])], [queries[1].args, resultText([])]]), cost: 0.006 });
  const r = await probe({ userId: ME, after: AFTER, run });
  assert.deepEqual([r.run, r.cost], [false, 0.006]);
});

test("gate: a bot token uses the probe; a failing probe falls back to the fixed schedule", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aq-probe-"));
  const store = createStore(home);
  store.init();
  const config = store.config();
  config.slack = { userId: ME, selfDmId: "D_SELF", cardChannel: "D_CARDS" };
  fs.writeFileSync(store.paths.config, JSON.stringify(config));
  const now = Date.parse("2026-11-03T15:00:00Z");
  const state = store.state();
  state.checkpoints.slack = new Date(now - 900e3).toISOString();
  state.checkpoints["sweep:last"] = new Date(now - 900e3).toISOString();
  fs.writeFileSync(store.paths.state, JSON.stringify(state));
  const clock = () => new Date(now);
  const seen = [];
  const quiet = async (args) => (seen.push(args), { run: false, reason: "no new Slack asks", cost: 0.005 });
  const r = await decide("sweep", { home, token: "xoxb-1-abc", clock, probeImpl: quiet });
  assert.equal(r.run, false);
  assert.match(r.reason, /probe \$0\.0050/);
  assert.deepEqual(seen[0].ignoreChannels, ["D_SELF", "D_CARDS"]);
  assert.equal(seen[0].after, (now - 900e3) / 1000);
  const broken = async () => {
    throw new Error("probe: no matching dms search");
  };
  const f = await decide("sweep", { home, token: "xoxb-1-abc", clock: () => new Date(now + 1), probeImpl: broken });
  assert.equal(f.fallback, true);
  assert.match(f.reason, /no matching dms/);
});
