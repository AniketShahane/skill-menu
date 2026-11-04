#!/usr/bin/env node
// The ask-queue dashboard: four numbers that change what the user does, as one self-contained HTML
// page (no model, no network). A Claude session publishes the file as a private claude.ai page
// (SKILL.md "dashboard"); config dashboard.url remembers where.
//
//   dashboard.mjs [--out <file.html>] [--json]     default out: <home>/artifacts/dashboard/index.html
//
// 1. You answered first: real asks you handled before their card came (is prep fast enough?)
// 2. One-tap closes: sent drafts that needed only a "yes" (are drafts good enough?)
// 3. Promises: kept, and the overdue ones by name
// 4. Repeats: topics asked again and again (what to build)
// Plus an 8-week trend of 1 and 2.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore, findRepeats, localParts, queueReport, resolveHome, timezoneOf } from "./aq.mjs";

const DAY_MS = 86_400_000;
export const GOALS = { answeredFirst: 0.2, oneTap: 0.5 };

const ratio = (n, d) => (d > 0 ? Math.min(1, n / d) : null);

// Everything the page shows, from items and the ledger only.
export function dashboardData(store, { days = 30, weeks = 8 } = {}, clock) {
  const now = (clock ? clock() : new Date()).getTime();
  const tz = timezoneOf(store);
  const r = queueReport(store, { days }, () => new Date(now));
  const realAsks = r.asks.harvested - r.asks.filtered;
  const today = localParts(new Date(now), tz).date;
  const overdue = store
    .allItems()
    .filter((item) => item.status === "tracking" && item.track?.due < today)
    .sort((a, b) => a.track.due.localeCompare(b.track.due))
    .map((item) => ({ id: item.id, title: item.title, who: item.source?.who || null, due: item.track.due, kind: item.track.kind }));
  const trend = [];
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const end = now - w * 7 * DAY_MS;
    const wk = queueReport(store, { days: 7 }, () => new Date(end));
    trend.push({
      weekEnding: localParts(new Date(end), tz).date,
      answeredFirst: ratio(wk.asks.youAnsweredFirst, wk.asks.harvested - wk.asks.filtered),
      oneTap: ratio(wk.closed.oneTap, wk.closed.sent),
      asks: wk.asks.harvested - wk.asks.filtered,
      sent: wk.closed.sent,
    });
  }
  return {
    generatedAt: new Date(now).toISOString(),
    generatedLocal: `${localParts(new Date(now), tz).date} ${String(localParts(new Date(now), tz).hour).padStart(2, "0")}:${String(localParts(new Date(now), tz).minute).padStart(2, "0")}`,
    timezone: tz,
    days,
    answeredFirst: { n: Math.min(r.asks.youAnsweredFirst, Math.max(realAsks, 0)), of: Math.max(realAsks, 0), rate: ratio(r.asks.youAnsweredFirst, realAsks), goal: GOALS.answeredFirst },
    oneTap: { n: r.closed.oneTap, of: r.closed.sent, rate: r.closed.oneTapRate, goal: GOALS.oneTap },
    promises: { open: r.tracking.open, kept: r.tracking.kept, overdue },
    repeats: findRepeats(store, {}, () => new Date(now)).slice(0, 5),
    trend,
  };
}

// ---------- page ----------

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const pct = (rate) => (rate === null || rate === undefined ? "n/a" : `${Math.round(rate * 100)}%`);
const fmtDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Status chip: icon + label, never color alone.
function chip(rate, goal, lowerIsBetter) {
  if (rate === null) return `<span class="chip chip-none">○ No data yet</span>`;
  const ok = lowerIsBetter ? rate <= goal : rate >= goal;
  return ok ? `<span class="chip chip-good">✓ On track</span>` : `<span class="chip chip-warn">▲ Needs work</span>`;
}

function trendSvg(trend) {
  const W = 640;
  const H = 220;
  const m = { l: 40, r: 16, t: 14, b: 28 };
  const x = (i) => m.l + (trend.length > 1 ? (i * (W - m.l - m.r)) / (trend.length - 1) : (W - m.l - m.r) / 2);
  const y = (v) => m.t + (1 - v) * (H - m.t - m.b);
  const grid = [0, 0.5, 1]
    .map((v) => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`)
    .join("");
  const ticks = trend.map((t, i) => `<text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(fmtDay(t.weekEnding))}</text>`).join("");
  const series = (key, cls) => {
    let d = "";
    let pen = false;
    trend.forEach((t, i) => {
      if (t[key] === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(t[key]).toFixed(1)}`;
      pen = true;
    });
    const dots = trend.map((t, i) => (t[key] === null ? "" : `<circle class="dot ${cls}" cx="${x(i).toFixed(1)}" cy="${y(t[key]).toFixed(1)}" r="4"/>`)).join("");
    return `${d ? `<path class="line ${cls}" d="${d}"/>` : ""}${dots}`;
  };
  const hits = trend
    .map((t, i) => {
      const half = trend.length > 1 ? (W - m.l - m.r) / (trend.length - 1) / 2 : (W - m.l - m.r) / 2;
      const tip = `Week to ${fmtDay(t.weekEnding)}: answered first ${pct(t.answeredFirst)} of ${t.asks} asks · one tap ${pct(t.oneTap)} of ${t.sent} sent`;
      return `<rect class="hit" x="${(x(i) - half).toFixed(1)}" y="${m.t}" width="${(2 * half).toFixed(1)}" height="${H - m.t - m.b}" data-tip="${esc(tip)}" tabindex="0" aria-label="${esc(tip)}"/>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly answered-first and one-tap rates">${grid}${ticks}${series("answeredFirst", "s-first")}${series("oneTap", "s-tap")}<line class="cross" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/>${hits}</svg>`;
}

export function renderDashboard(data) {
  const af = data.answeredFirst;
  const ot = data.oneTap;
  const pr = data.promises;
  const hasTrend = data.trend.some((t) => t.answeredFirst !== null || t.oneTap !== null);
  const shown = pr.overdue.slice(0, 5);
  const overdueList = shown.length
    ? `<ul class="list">${shown.map((o) => `<li><span class="mono">${esc(o.id)}</span> ${esc(o.title)}<span class="muted"> · ${o.kind === "waiting" ? "waiting on" : "for"} ${esc(o.who || "someone")} · due ${esc(fmtDay(o.due))}</span></li>`).join("")}${pr.overdue.length > 5 ? `<li class="muted">and ${pr.overdue.length - 5} more</li>` : ""}</ul>`
    : `<p class="muted">Nothing overdue.</p>`;
  const repeats = data.repeats.length
    ? `<ol class="list repeats">${data.repeats.map((r) => `<li><span class="topic">${esc(r.topic)}</span><span class="count">${r.count} asks</span><span class="muted">${esc(r.askers.join(", "))}</span></li>`).join("")}</ol>`
    : `<p class="muted">No topic asked 3+ times by 2+ people in 90 days yet. Topics count from closed cards onward.</p>`;
  const rows = data.trend
    .map((t) => `<tr><td>${esc(fmtDay(t.weekEnding))}</td><td>${pct(t.answeredFirst)}</td><td>${t.asks}</td><td>${pct(t.oneTap)}</td><td>${t.sent}</td></tr>`)
    .join("");

  return `<title>Ask Queue Pulse</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
/* Layout: a single column read top to bottom: three headline tiles, the weekly trend, then the two action lists. */
:root {
  --bg: #f7f8f6; --surface: #ffffff; --fg: #15181a; --muted: #5c6460; --line: #dfe3df;
  --s-first: #eb6834; --s-tap: #2a78d6;
  --good: #1f7a3a; --good-bg: #e3f2e7; --warn: #9a5b00; --warn-bg: #fbefd9; --none-bg: #eceeec;
  --display: "Instrument Sans", "Helvetica Neue", Arial, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #121514; --surface: #1a1e1c; --fg: #eef1ee; --muted: #a4ada8; --line: #2c322f;
  --s-first: #d95926; --s-tap: #3987e5;
  --good: #7fd197; --good-bg: #183323; --warn: #f0b45a; --warn-bg: #3a2a10; --none-bg: #262b29; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #121514; --surface: #1a1e1c; --fg: #eef1ee; --muted: #a4ada8; --line: #2c322f;
  --s-first: #d95926; --s-tap: #3987e5;
  --good: #7fd197; --good-bg: #183323; --warn: #f0b45a; --warn-bg: #3a2a10; --none-bg: #262b29; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font-family: var(--display); line-height: 1.45; }
.wrap { max-width: 880px; margin: 0 auto; padding-block: 28px 40px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 20px; }
header h1 { margin: 0; font-size: 1.6rem; font-weight: 700; letter-spacing: -0.01em; text-wrap: balance; }
header p { margin: 4px 0 0; color: var(--muted); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
.tile, .panel { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; min-width: 0; display: grid; gap: 6px; align-content: start; }
.label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; }
.big { font-family: var(--mono); font-size: 2.4rem; line-height: 1.1; font-variant-numeric: tabular-nums; }
.sub { color: var(--muted); font-size: 0.9rem; }
.chip { justify-self: start; font-size: 0.78rem; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.chip-good { color: var(--good); background: var(--good-bg); }
.chip-warn { color: var(--warn); background: var(--warn-bg); }
.chip-none { color: var(--muted); background: var(--none-bg); }
h2 { margin: 0; font-size: 1.05rem; font-weight: 600; }
.legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.85rem; color: var(--muted); }
.key { display: inline-block; width: 14px; height: 3px; border-radius: 2px; vertical-align: middle; margin-right: 6px; }
.chart { position: relative; }
svg { width: 100%; height: auto; display: block; }
.grid { stroke: var(--line); stroke-width: 1; }
.tick { fill: var(--muted); font: 11px var(--display); }
.line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.line.s-first { stroke: var(--s-first); } .line.s-tap { stroke: var(--s-tap); }
.dot { stroke: var(--surface); stroke-width: 2; } .dot.s-first { fill: var(--s-first); } .dot.s-tap { fill: var(--s-tap); }
.hit { fill: transparent; cursor: crosshair; outline: none; }
.cross { stroke: var(--muted); stroke-dasharray: 3 3; }
.tip { position: absolute; pointer-events: none; background: var(--fg); color: var(--bg); font-size: 0.8rem; padding: 6px 8px; border-radius: 6px; max-width: 260px; }
.empty { color: var(--muted); padding: 24px 0; text-align: center; }
.lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.list { margin: 0; padding-left: 18px; display: grid; gap: 8px; }
.repeats li { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.topic { font-family: var(--mono); font-size: 0.9rem; overflow-wrap: anywhere; }
.count { font-weight: 600; font-variant-numeric: tabular-nums; }
.muted { color: var(--muted); }
.mono { font-family: var(--mono); font-size: 0.85rem; }
details { font-size: 0.85rem; } summary { cursor: pointer; color: var(--muted); }
summary:focus-visible, .hit:focus-visible { outline: 2px solid var(--s-tap); outline-offset: 2px; }
.table { overflow-x: auto; } table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; margin-top: 8px; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); }
footer { color: var(--muted); font-size: 0.8rem; }
</style>
<div class="wrap">
<header>
  <h1>Ask Queue Pulse</h1>
  <p>Last ${data.days} days · updated ${esc(data.generatedLocal)} (${esc(data.timezone)})</p>
</header>

<section class="tiles">
  <div class="tile">
    <span class="label">You answered first</span>
    <span class="big">${pct(af.rate)}</span>
    <span class="sub">${af.n} of ${af.of} real asks, before their card came</span>
    ${chip(af.rate, af.goal, true)}
    <span class="sub">Goal: under ${af.goal * 100}%. High means prep is too slow, or the ask didn't need a card.</span>
  </div>
  <div class="tile">
    <span class="label">One-tap closes</span>
    <span class="big">${pct(ot.rate)}</span>
    <span class="sub">${ot.n} of ${ot.of} sent drafts needed only a yes</span>
    ${chip(ot.rate, ot.goal, false)}
    <span class="sub">Goal: over ${ot.goal * 100}%. Low means drafts miss and you rewrite them.</span>
  </div>
  <div class="tile">
    <span class="label">Promises</span>
    <span class="big">${pr.overdue.length}</span>
    <span class="sub">overdue · ${pr.kept} kept · ${pr.open} open</span>
    ${pr.overdue.length ? `<span class="chip chip-warn">▲ ${pr.overdue.length} late</span>` : pr.open || pr.kept ? `<span class="chip chip-good">✓ None late</span>` : `<span class="chip chip-none">○ None tracked yet</span>`}
  </div>
</section>

<section class="panel">
  <h2>Week by week</h2>
  <div class="legend"><span><span class="key" style="background: var(--s-first)"></span>You answered first</span><span><span class="key" style="background: var(--s-tap)"></span>One-tap closes</span></div>
  <div class="chart">${hasTrend ? trendSvg(data.trend) : `<p class="empty">Not enough data yet: the trend starts once asks come in and drafts get sent.</p>`}<div class="tip" hidden></div></div>
  <details><summary>Weekly numbers</summary><div class="table"><table><thead><tr><th>Week to</th><th>Answered first</th><th>Real asks</th><th>One tap</th><th>Sent</th></tr></thead><tbody>${rows}</tbody></table></div></details>
</section>

<section class="lists">
  <div class="panel"><h2>Overdue promises</h2>${overdueList}</div>
  <div class="panel"><h2>Asked again and again</h2>${repeats}</div>
</section>

<footer>Private: it names colleagues. Built from <span class="mono">aq report</span>. To update it, say "refresh dashboard" in Claude Code.</footer>
</div>
<script>
(() => {
  const chart = document.querySelector(".chart");
  const tip = chart && chart.querySelector(".tip");
  const cross = chart && chart.querySelector(".cross");
  if (!tip || !cross) return;
  const show = (el) => {
    const svg = el.ownerSVGElement;
    const box = el.getBBox();
    const cx = box.x + box.width / 2;
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    const left = Math.min(Math.max(cx * scale - 130, 0), chart.clientWidth - 260);
    tip.style.left = Math.max(left, 0) + "px";
    tip.style.top = "0px";
  };
  const hide = () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); };
  chart.querySelectorAll(".hit").forEach((el) => {
    el.addEventListener("mouseenter", () => show(el));
    el.addEventListener("focus", () => show(el));
    el.addEventListener("mouseleave", hide);
    el.addEventListener("blur", hide);
  });
})();
</script>
`;
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = process.argv.slice(2);
    const home = resolveHome();
    const data = dashboardData(createStore(home));
    if (args.includes("--json")) {
      process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    } else {
      const i = args.indexOf("--out");
      const out = path.resolve(i >= 0 && args[i + 1] ? args[i + 1] : path.join(home, "artifacts", "dashboard", "index.html"));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, renderDashboard(data));
      process.stdout.write(`${JSON.stringify({ file: out, generatedAt: data.generatedAt })}\n`);
    }
  } catch (err) {
    process.stderr.write(`${JSON.stringify({ error: err.message })}\n`);
    process.exit(1);
  }
}
