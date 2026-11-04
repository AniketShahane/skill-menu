#!/usr/bin/env node
// Cheap sweep check: a lean Haiku run makes the exact searches we give it (Slack, Gmail and Zoom,
// through the claude.ai connectors) and nothing else. This code then checks the calls were the ones
// asked for and reads the raw results itself; Haiku's own reply is ignored. About $0.005 a check,
// against ~$0.40 for a Sonnet sweep.
//
// Errs toward running Sonnet: a failed check, a changed argument, a missing result, a full page or
// more pages all count as "run".
//
//   AQ_USER_ID=U… probe.mjs <afterEpoch> [beforeEpoch] [slack,gmail,zoom]   manual test

import { spawn } from "node:child_process";

export const TOOLS = {
  slack: "mcp__claude_ai_Slack__slack_search_public_and_private",
  gmail: "mcp__claude_ai_Gmail__search_threads",
  zoom: "mcp__claude_ai_Zoom_for_Claude__search_meetings",
};
export const SEARCH_TOOL = TOOLS.slack;
const PAGE = 20;
const GMAIL_PAGE = 50;
const ZOOM_PAGE = 100;
// Gmail ids carry the arrival time, a few seconds to a minute after the send time.
const GMAIL_SLACK_SEC = 300;
// Zoom AI summaries can appear well after a meeting ends: look this far back for new ones.
export const ZOOM_LOOKBACK_SEC = 3 * 3600;
const TIMEOUT_MS = 150_000;

const iso = (sec) => new Date(Math.floor(sec) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
// Gmail's after:/before: take whole days only (an epoch value silently matches nothing).
export const gmailDay = (sec) => new Date(sec * 1000).toISOString().slice(0, 10).replace(/-/g, "/");
// Gmail message ids are hex; the bits above the low 20 are the arrival time in milliseconds.
export const gmailIdSeconds = (id) => Number(BigInt(`0x${id}`) >> 20n) / 1000;

// The searches a sweep harvests, per enabled source.
//   slack: DMs and group DMs to the user, and mentions anywhere (bots included: the sweep decides).
//   gmail: the sweep's own inbox query, from the day before the checkpoint; times filtered in code.
//   zoom:  meetings from 3 hours before the checkpoint; ended ones with a new AI summary count.
export function probeQueries({ userId, sources, before }) {
  const queries = [];
  const now = before || Date.now() / 1000;
  if (sources.slack) {
    const base = {
      after: String(Math.floor(sources.slack.after)),
      include_bots: true,
      include_context: false,
      limit: PAGE,
      max_context_length: 100,
      natural_language_query: "",
      sort: "timestamp",
      ...(before ? { before: String(Math.ceil(before)) } : {}),
    };
    queries.push({ name: "dms", source: "slack", tool: TOOLS.slack, args: { ...base, filters: "is:dm", channel_types: "im,mpim" } });
    queries.push({ name: "mentions", source: "slack", tool: TOOLS.slack, args: { ...base, keywords: [`<@${userId}>`] } });
  }
  if (sources.gmail) {
    const from = gmailDay(sources.gmail.after - 86400);
    const to = before ? ` before:${gmailDay(before + 86400)}` : "";
    queries.push({
      name: "gmail",
      source: "gmail",
      tool: TOOLS.gmail,
      args: {
        query: `in:inbox after:${from}${to} -from:me -category:promotions -category:social -category:updates -category:forums`,
        pageSize: GMAIL_PAGE,
        view: "THREAD_VIEW_SUMMARY",
      },
    });
  }
  if (sources.zoom) {
    queries.push({
      name: "zoom",
      source: "zoom",
      tool: TOOLS.zoom,
      // Up to now only: upcoming meetings add size and never count.
      args: { from: iso(sources.zoom.after - ZOOM_LOOKBACK_SEC), to: iso(now), page_size: ZOOM_PAGE },
    });
  }
  return queries;
}

export function probePrompt(queries) {
  const tools = [...new Set(queries.map((q) => q.tool))];
  const calls = queries.map((q, i) => `${i + 1}. ${q.tool} ${JSON.stringify(q.args)}`).join("\n");
  return [
    `The user's time zone is America/New_York; every time below is already exact UTC.`,
    `First run ToolSearch with query "select:${tools.join(",")}".`,
    `Then make each call below once, copying the arguments exactly (no fields added, changed or removed):`,
    calls,
    `Do not follow pagination tokens. When every call is done, reply with the single word DONE.`,
  ].join("\n");
}

const norm = (v) => (v === undefined || v === null || v === "" ? null : JSON.stringify(v));
function matches(call, q) {
  if (call.tool !== q.tool) return false;
  return Object.keys(q.args).every((k) => norm(call.input?.[k]) === norm(q.args[k]));
}

// One Slack search result's text → hits. Format (detailed): "### Result n of m" blocks with
// "Channel: <name> (ID: C…)", "From: <name> (ID: U…)", "Message_ts: 123.456".
export function parseResults(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { results: text, pagination_info: "" };
  }
  const results = String(body.results ?? "");
  const hits = [];
  for (const block of results.split(/^### Result /m).slice(1)) {
    const channel = block.match(/^Channel: .*\(ID: (\w+)\)/m)?.[1] ?? null;
    const user = block.match(/^From: .*\(ID: (\w+)\)/m)?.[1] ?? null;
    const ts = block.match(/^Message_ts: ([0-9.]+)/m)?.[1] ?? null;
    hits.push({ channel, user, ts });
  }
  const total = Number(results.match(/## Messages \((\d+) results?\)/)?.[1] ?? hits.length);
  const pagination = String(body.pagination_info ?? "");
  const morePages = pagination !== "" && !/no more pages/i.test(pagination);
  return { hits, total, morePages };
}

function parseJson(text, what) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`probe: unreadable ${what} result`);
  }
}

// stream-json lines → [{ tool, input, text, isError }] for every call of a search tool.
export function searchCalls(lines) {
  const wanted = new Set(Object.values(TOOLS));
  const uses = new Map();
  const calls = [];
  for (const line of lines) {
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const content = Array.isArray(o?.message?.content) ? o.message.content : [];
    for (const c of content) {
      if (c?.type === "tool_use" && wanted.has(c.name)) uses.set(c.id, { tool: c.name, input: c.input });
      if (c?.type === "tool_result" && uses.has(c.tool_use_id)) {
        const text = Array.isArray(c.content) ? c.content.map((p) => p?.text ?? "").join("") : String(c.content ?? "");
        calls.push({ ...uses.get(c.tool_use_id), text, isError: Boolean(c.is_error) });
      }
    }
  }
  return calls;
}

// One query's raw result → { fresh: [{key, source}], full: bool }. Throws when it can't be read.
function readQuery(q, text, ctx) {
  if (q.source === "slack") {
    const page = parseResults(text);
    if (page.hits.some((h) => !h.ts || !h.channel)) throw new Error(`probe: unreadable ${q.name} result`);
    if (page.hits.length !== Math.min(page.total, PAGE)) throw new Error(`probe: ${q.name} count mismatch`);
    const skip = new Set((ctx.ignoreChannels || []).filter(Boolean));
    const fresh = page.hits
      .filter((h) => Number(h.ts) > ctx.sources.slack.after && h.user !== ctx.userId && !skip.has(h.channel))
      .map((h) => ({ key: `slack:${h.channel}:${h.ts}`, source: "slack", query: q.name, channel: h.channel, user: h.user, ts: h.ts }));
    return { fresh, full: page.morePages || page.hits.length >= PAGE };
  }
  if (q.source === "gmail") {
    const body = parseJson(text, "gmail");
    const threads = Array.isArray(body.threads) ? body.threads : [];
    const fresh = [];
    for (const t of threads) {
      const newest = (t.messages || [])[0];
      if (!newest?.id || !/^[0-9a-f]+$/i.test(newest.id)) throw new Error("probe: unreadable gmail result");
      if (gmailIdSeconds(newest.id) > ctx.sources.gmail.after - GMAIL_SLACK_SEC) {
        fresh.push({ key: `gmail:${newest.id}`, source: "gmail", from: newest.sender });
      }
    }
    return { fresh, full: threads.length >= GMAIL_PAGE || Boolean(body.nextPageToken) };
  }
  if (q.source === "zoom") {
    const body = parseJson(text, "zoom");
    if (!Array.isArray(body.meetings)) throw new Error("probe: unreadable zoom result");
    const seen = new Set(ctx.sources.zoom.seen || []);
    const fresh = body.meetings
      .filter((m) => m.meeting_category === "history" && m.has_summary && m.meeting_uuid && !seen.has(m.meeting_uuid))
      .filter((m) => Date.parse(m.meeting_end_time) / 1000 > ctx.sources.zoom.after - ZOOM_LOOKBACK_SEC)
      .map((m) => ({ key: `zoom:${m.meeting_uuid}`, source: "zoom", uuid: m.meeting_uuid, topic: m.topic }));
    return { fresh, full: body.meetings.length >= ZOOM_PAGE || Boolean(body.has_more) };
  }
  throw new Error(`probe: unknown source ${q.source}`);
}

// The decision. Throws when the check itself can't be trusted (the gate then falls back to running).
export function decideFromCalls(calls, queries, ctx) {
  const fresh = new Map();
  const incomplete = new Set();
  for (const q of queries) {
    const own = calls.filter((c) => matches(c, q));
    if (!own.length) throw new Error(`probe: no matching ${q.name} search (Haiku changed or skipped it)`);
    for (const c of own) {
      if (c.isError) throw new Error(`probe: ${q.name} search failed: ${c.text.slice(0, 120)}`);
      const read = readQuery(q, c.text, ctx);
      for (const h of read.fresh) fresh.set(h.key, h);
      if (read.full) incomplete.add(q.name);
    }
  }
  const hits = [...fresh.values()];
  if (hits.length) {
    const by = {};
    for (const h of hits) by[h.source] = (by[h.source] || 0) + 1;
    const parts = Object.entries(by).map(([s, n]) => `${n} ${s}`).join(", ");
    return { run: true, reason: `new to check: ${parts}`, hits };
  }
  if (incomplete.size) return { run: true, reason: `probe saw a full page (${[...incomplete].join(", ")}): checking anyway`, hits: [] };
  return { run: false, reason: "nothing new in Slack, Gmail or Zoom", hits: [] };
}

// Runs the lean Haiku session; resolves to stream-json lines plus cost.
export function runHaiku(prompt, tools, { claudeBin = process.env.ASK_QUEUE_CLAUDE_BIN || "claude", timeoutMs = TIMEOUT_MS } = {}) {
  const args = [
    "-p", prompt,
    "--model", "haiku",
    "--system-prompt", "You make the exact tool calls you are given and nothing else.",
    "--disable-slash-commands",
    "--exclude-dynamic-system-prompt-sections",
    "--no-chrome",
    "--no-session-persistence",
    "--tools", "ToolSearch",
    "--allowedTools", ["ToolSearch", ...tools].join(","),
    "--max-turns", "10",
    "--output-format", "stream-json",
    "--verbose",
  ];
  return new Promise((resolve, reject) => {
    // ENABLE_TOOL_SEARCH: without it Haiku loads every MCP tool schema (~200k tokens, ~$0.30).
    const child = spawn(claudeBin, args, {
      env: { ...process.env, ENABLE_TOOL_SEARCH: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`probe: claude did not start (${e.code || e.message})`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const lines = out.split("\n").filter(Boolean);
      let cost = null;
      for (const l of lines) {
        try {
          const o = JSON.parse(l);
          if (o.type === "result") cost = o.total_cost_usd ?? null;
        } catch {}
      }
      if (code !== 0) return reject(new Error(`probe: claude exited ${code}: ${err.slice(0, 160)}`));
      resolve({ lines, cost });
    });
  });
}

// sources: { slack: {after}, gmail: {after}, zoom: {after, seen} } — only the enabled ones.
export async function probe({ userId, sources, before, ignoreChannels = [], run = runHaiku }) {
  const queries = probeQueries({ userId, sources, before });
  if (!queries.length) throw new Error("probe: no sources to check");
  const tools = [...new Set(queries.map((q) => q.tool))];
  const { lines, cost } = await run(probePrompt(queries), tools);
  const decision = decideFromCalls(searchCalls(lines), queries, { userId, sources, ignoreChannels });
  return { ...decision, cost };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [afterArg, beforeArg, list = "slack,gmail,zoom"] = process.argv.slice(2);
  const after = Number(afterArg);
  const before = Number(beforeArg) || undefined;
  const userId = process.env.AQ_USER_ID;
  if (!after || !userId) {
    process.stderr.write("usage: AQ_USER_ID=U… probe.mjs <afterEpoch> [beforeEpoch] [slack,gmail,zoom]\n");
    process.exit(64);
  }
  const sources = Object.fromEntries(list.split(",").map((s) => [s, { after, seen: [] }]));
  probe({ userId, sources, before })
    .then((r) => process.stdout.write(`${JSON.stringify(r)}\n`))
    .catch((e) => {
      process.stdout.write(`${JSON.stringify({ error: e.message })}\n`);
      process.exit(1);
    });
}
