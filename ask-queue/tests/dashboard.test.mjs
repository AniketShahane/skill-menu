// dashboard.mjs: the four numbers, and a page that renders safely for any data.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { addCandidate, addLedger, routeToCard, updateItem } from "../scripts/aq.mjs";
import { dashboardData, renderDashboard } from "../scripts/dashboard.mjs";
import { makeHome } from "./helpers.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "dashboard.mjs");
const NOW = () => new Date("2026-11-06T20:00:00Z");
const at = (iso) => () => new Date(iso);

function setup() {
  const { home, store } = makeHome();
  const config = store.config();
  config.timezone = "America/New_York";
  fs.writeFileSync(store.paths.config, JSON.stringify(config));
  return { home, store };
}

let n = 0;
const ask = (store, extra = {}, clock = at("2026-11-04T12:00:00Z")) => {
  n += 1;
  return addCandidate(store, { title: `Ask ${n}`, source: { kind: "slack", who: "Sam" }, excerpt: "x", fingerprints: [`slack:${n}`], ...extra }, clock).id;
};
const promise = (store, due, extra = {}) => {
  n += 1;
  return addCandidate(store, { title: `Promise ${n}`, status: "tracking", source: { kind: "slack", who: "Sam" }, fingerprints: [`promise:${n}`], track: { kind: "promise", due }, ...extra }, at("2026-10-20T12:00:00Z")).id;
};
const tags = (html, tag) => [(html.match(new RegExp(`<${tag}[\\s>]`, "g")) || []).length, (html.match(new RegExp(`</${tag}>`, "g")) || []).length];

test("dashboard: an empty queue renders a complete page with no NaN, null or undefined", () => {
  const { store } = setup();
  const data = dashboardData(store, {}, NOW);
  assert.equal(data.trend.length, 8);
  assert.equal(data.answeredFirst.rate, null);
  const html = renderDashboard(data);
  assert.ok(html.indexOf("<title>Ask Queue Pulse</title>") === 0, "title first");
  for (const bad of ["NaN", "undefined", ">null<", " null "]) assert.ok(!html.includes(bad), bad);
  assert.match(html, /○ No data yet/);
  assert.match(html, /Not enough data yet/);
  assert.match(html, /Nothing overdue/);
  assert.match(html, /No topic asked 3\+ times/);
  assert.match(html, /○ None tracked yet/);
});

test("dashboard: the four numbers and their status chips", () => {
  const { store } = setup();
  for (let i = 0; i < 3; i += 1) ask(store, { status: "filtered" });
  const real = [ask(store), ask(store), ask(store), ask(store)];
  for (const id of real.slice(0, 3)) {
    updateItem(store, id, { status: "asking" }, at("2026-11-04T13:00:00Z"));
    updateItem(store, id, { status: "skipped", note: "the user handled it in the source thread" }, at("2026-11-04T14:00:00Z"));
  }
  updateItem(store, real[3], { status: "approving", patch: { card: { channelId: "D", ts: "1.1" } } }, at("2026-11-04T13:00:00Z"));
  routeToCard(store, real[3], { messages: [{ text: "yes" }] }, at("2026-11-04T14:00:00Z"));
  addLedger(store, { id: real[3], outcome: "sent", edited: false }, at("2026-11-05T12:00:00Z"));
  promise(store, "2026-11-01");
  promise(store, "2026-11-06"); // due today: not overdue
  const kept = promise(store, "2026-11-02");
  updateItem(store, kept, { status: "done", note: "kept: sent" }, at("2026-11-03T12:00:00Z"));

  const data = dashboardData(store, {}, NOW);
  assert.deepEqual([data.answeredFirst.n, data.answeredFirst.of], [3, 4]);
  assert.equal(data.answeredFirst.rate, 0.75);
  assert.deepEqual([data.oneTap.n, data.oneTap.of, data.oneTap.rate], [1, 1, 1]);
  assert.deepEqual(data.promises.overdue.map((o) => o.due), ["2026-11-01"]);
  assert.equal(data.promises.kept, 1);
  assert.equal(data.promises.open, 2);
  const html = renderDashboard(data);
  assert.match(html, /<span class="big">75%<\/span>[\s\S]*▲ Needs work/);
  assert.match(html, /<span class="big">100%<\/span>[\s\S]*✓ On track/);
  assert.match(html, /▲ 1 late/);
  const week = data.trend.at(-1);
  assert.equal(week.answeredFirst, 0.75);
  assert.equal(week.weekEnding, "2026-11-06");
});

test("dashboard: rates are clamped to 100% when answered-first outruns this window's asks", () => {
  const { store } = setup();
  // Asked last month, answered (skipped) this week: counts as answered-first, but not as this window's ask.
  for (let i = 0; i < 3; i += 1) {
    const id = ask(store, {}, at("2026-09-01T12:00:00Z"));
    updateItem(store, id, { status: "skipped", note: "the user picked it up" }, at("2026-11-04T12:00:00Z"));
  }
  ask(store);
  const data = dashboardData(store, {}, NOW);
  assert.equal(data.answeredFirst.rate, 1);
  assert.ok(data.answeredFirst.n <= data.answeredFirst.of);
  assert.match(renderDashboard(data), /<span class="big">100%<\/span>/);
});

test("dashboard: text from Slack can't inject markup or script", () => {
  const { store } = setup();
  promise(store, "2026-11-01", { title: "<script>alert(1)</script>", source: { kind: "slack", who: '"><img src=x onerror=alert(2)>' } });
  for (const [id, who] of [["AQ-90", "<b>Sam</b>"], ["AQ-91", "Pri & ya"], ["AQ-92", "Lee"]]) {
    addLedger(store, { id, who, topic: "x<y>z", outcome: "sent" }, at("2026-11-04T12:00:00Z"));
  }
  const html = renderDashboard(dashboardData(store, {}, NOW));
  assert.ok(!html.includes("<script>alert"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<b>Sam"));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Pri &amp; ya/);
  assert.deepEqual(tags(html, "script"), [1, 1], "only the page's own script");
});

test("dashboard: overdue list shows 5, oldest first, then 'and N more'", () => {
  const { store } = setup();
  for (const d of ["05", "01", "03", "02", "04", "06", "07"]) promise(store, `2026-10-${d}`);
  const data = dashboardData(store, {}, NOW);
  assert.deepEqual(data.promises.overdue.slice(0, 3).map((o) => o.due), ["2026-10-01", "2026-10-02", "2026-10-03"]);
  const html = renderDashboard(data);
  assert.equal((html.match(/<li><span class="mono">AQ-/g) || []).length, 5);
  assert.match(html, /and 2 more/);
  assert.match(html, /<span class="big">7<\/span>/);
});

test("dashboard: the trend breaks at weeks with no data instead of drawing through zero", () => {
  const trend = [0.5, null, null, 0.2, 0.1, null, 0.3, 0.4].map((v, i) => ({ weekEnding: `2026-10-0${i + 1}`, answeredFirst: v, oneTap: null, asks: 1, sent: 0 }));
  const html = renderDashboard({ ...dashboardData(setup().store, {}, NOW), trend });
  const path = html.match(/<path class="line s-first" d="([^"]+)"/)[1];
  assert.equal((path.match(/M/g) || []).length, 3, "three runs");
  assert.ok(!/<path class="line s-tap"/.test(html), "no one-tap line without data");
  assert.equal((html.match(/class="dot s-first"/g) || []).length, 5);
  assert.equal((html.match(/class="hit"/g) || []).length, 8, "a hover target per week");
  const single = renderDashboard({ ...dashboardData(setup().store, {}, NOW), trend: [{ weekEnding: "2026-11-06", answeredFirst: 1, oneTap: 0, asks: 2, sent: 1 }] });
  assert.ok(!/NaN|Infinity/.test(single), "one week: no division by zero");
});

test("dashboard: well-formed, theme-aware, and loads nothing but Google Fonts", () => {
  const { store } = setup();
  promise(store, "2026-11-01");
  ask(store);
  const html = renderDashboard(dashboardData(store, {}, NOW));
  for (const tag of ["div", "section", "svg", "table", "ul", "details", "header", "footer", "style"]) {
    const [open, close] = tags(html, tag);
    assert.equal(open, close, `<${tag}> balanced`);
  }
  const hosts = new Set([...html.matchAll(/https:\/\/([^/"')\s]+)/g)].map((m) => m[1]));
  assert.deepEqual([...hosts].sort(), ["fonts.googleapis.com"]);
  assert.match(html, /@media \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme="light"\]\)/);
  assert.match(html, /:root\[data-theme="dark"\]/);
  assert.match(html, /body \{ background: var\(--bg\)/);
  assert.match(html, /padding-left: max\(16px, env\(safe-area-inset-left, 0px\)\)/);
  assert.ok(!html.includes("—"), "no em-dashes");
});

test("dashboard CLI: writes the page (default path or --out) and prints JSON with --json", () => {
  const { home } = setup();
  const env = { ...process.env, ASK_QUEUE_HOME: home };
  const def = JSON.parse(execFileSync("node", [SCRIPT], { env, encoding: "utf8" }));
  assert.equal(def.file, path.join(home, "artifacts", "dashboard", "index.html"));
  assert.ok(fs.readFileSync(def.file, "utf8").startsWith("<title>"));
  const out = path.join(home, "tmp", "nested", "d.html");
  assert.equal(JSON.parse(execFileSync("node", [SCRIPT, "--out", out], { env, encoding: "utf8" })).file, out);
  assert.ok(fs.existsSync(out));
  const data = JSON.parse(execFileSync("node", [SCRIPT, "--json"], { env, encoding: "utf8" }));
  assert.equal(data.trend.length, 8);
  assert.throws(() => execFileSync("node", [SCRIPT], { env: { ...env, ASK_QUEUE_HOME: path.join(home, "missing") }, stdio: "pipe" }), /Command failed/);
});
