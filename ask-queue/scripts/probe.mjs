#!/usr/bin/env node
// Cheap sweep check for a bot token, which can't search Slack: a lean Haiku run makes the exact
// Slack searches we give it (through the claude.ai Slack connector) and nothing else. This code then
// checks the calls were the ones asked for and reads the raw results itself; Haiku's own reply is
// ignored. About $0.005 a check, against ~$0.40 for a Sonnet sweep.
//
// Errs toward running Sonnet: a failed check, a changed argument, a missing result, a full page or
// more pages all count as "run".
//
//   probe.mjs <afterEpoch> [beforeEpoch]   prints the hits and the decision (manual test)

import { spawn } from "node:child_process";

export const SEARCH_TOOL = "mcp__claude_ai_Slack__slack_search_public_and_private";
const PAGE = 20;
const TIMEOUT_MS = 150_000;

// The searches a sweep harvests: DMs and group DMs to the user, and mentions anywhere.
// Bots included: Jira assignments and some asks come from bots, and the sweep decides what's an ask.
export function probeQueries(userId, after, before) {
  const base = {
    after: String(Math.floor(after)),
    include_bots: true,
    include_context: false,
    limit: PAGE,
    max_context_length: 100,
    natural_language_query: "",
    sort: "timestamp",
    ...(before ? { before: String(Math.ceil(before)) } : {}),
  };
  return [
    { name: "dms", args: { ...base, filters: "is:dm", channel_types: "im,mpim" } },
    { name: "mentions", args: { ...base, keywords: [`<@${userId}>`] } },
  ];
}

export function probePrompt(queries) {
  const calls = queries.map((q, i) => `${i + 1}. ${JSON.stringify(q.args)}`).join("\n");
  return [
    `First run ToolSearch with query "select:${SEARCH_TOOL}".`,
    `Then call ${SEARCH_TOOL} once for each argument object below, copying it exactly (no fields added, changed or removed):`,
    calls,
    `If a result's pagination_info gives a cursor for another page, call again with the same arguments plus "cursor".`,
    `When every call is done, reply with the single word DONE.`,
  ].join("\n");
}

const SAME_KEYS = ["after", "before", "filters", "keywords", "channel_types", "include_bots", "cursor"];
const norm = (v) => (v === undefined || v === null || v === "" ? null : JSON.stringify(v));

function matches(input, args) {
  return SAME_KEYS.filter((k) => k !== "cursor").every((k) => norm(input?.[k]) === norm(args[k]));
}

// One search result's text → hits. Format (detailed): "### Result n of m" blocks with
// "Channel: <name> (ID: C…)", "From: <name> (ID: U…)", "Message_ts: 123.456".
export function parseResults(text) {
  let body = text;
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

// stream-json lines → [{ input, text, isError }] for every call of the search tool.
export function searchCalls(lines) {
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
      if (c?.type === "tool_use" && c.name === SEARCH_TOOL) uses.set(c.id, c.input);
      if (c?.type === "tool_result" && uses.has(c.tool_use_id)) {
        const text = Array.isArray(c.content) ? c.content.map((p) => p?.text ?? "").join("") : String(c.content ?? "");
        calls.push({ input: uses.get(c.tool_use_id), text, isError: Boolean(c.is_error) });
      }
    }
  }
  return calls;
}

// The decision. Throws when the check itself can't be trusted (the gate then falls back to running).
export function decideFromCalls(calls, queries, { userId, ignoreChannels = [], after }) {
  const hits = [];
  let incomplete = [];
  for (const q of queries) {
    const own = calls.filter((c) => matches(c.input, q.args));
    if (!own.length) throw new Error(`probe: no matching ${q.name} search (Haiku changed or skipped it)`);
    for (const c of own) {
      if (c.isError) throw new Error(`probe: ${q.name} search failed: ${c.text.slice(0, 120)}`);
      const page = parseResults(c.text);
      if (page.hits.some((h) => !h.ts || !h.channel)) throw new Error(`probe: unreadable ${q.name} result`);
      if (page.hits.length !== Math.min(page.total, PAGE)) throw new Error(`probe: ${q.name} count mismatch`);
      hits.push(...page.hits.map((h) => ({ ...h, query: q.name })));
      const followed = own.some((o) => o.input?.cursor);
      if ((page.morePages || page.hits.length >= PAGE) && !followed) incomplete.push(q.name);
    }
  }
  const skip = new Set(ignoreChannels.filter(Boolean));
  const fresh = new Map();
  for (const h of hits) {
    if (Number(h.ts) <= after || h.user === userId || skip.has(h.channel)) continue;
    fresh.set(`slack:${h.channel}:${h.ts}`, h);
  }
  incomplete = [...new Set(incomplete)];
  if (fresh.size) return { run: true, reason: `${fresh.size} new Slack messages to check`, hits: [...fresh.values()] };
  if (incomplete.length) return { run: true, reason: `probe saw a full page (${incomplete.join(", ")}): checking anyway`, hits: [] };
  return { run: false, reason: "no new Slack asks", hits: [] };
}

// Runs the lean Haiku session; resolves to stream-json lines plus cost.
export function runHaiku(prompt, { claudeBin = process.env.ASK_QUEUE_CLAUDE_BIN || "claude", timeoutMs = TIMEOUT_MS } = {}) {
  const args = [
    "-p", prompt,
    "--model", "haiku",
    "--system-prompt", "You make the exact tool calls you are given and nothing else.",
    "--disable-slash-commands",
    "--exclude-dynamic-system-prompt-sections",
    "--no-chrome",
    "--no-session-persistence",
    "--tools", "ToolSearch",
    "--allowedTools", `ToolSearch,${SEARCH_TOOL}`,
    "--max-turns", "8",
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

export async function probe({ userId, after, before, ignoreChannels = [], run = runHaiku }) {
  const queries = probeQueries(userId, after, before);
  const { lines, cost } = await run(probePrompt(queries));
  const decision = decideFromCalls(searchCalls(lines), queries, { userId, ignoreChannels, after });
  return { ...decision, cost };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [after, before] = process.argv.slice(2).map(Number);
  const userId = process.env.AQ_USER_ID;
  if (!after || !userId) {
    process.stderr.write("usage: AQ_USER_ID=U… probe.mjs <afterEpoch> [beforeEpoch]\n");
    process.exit(64);
  }
  probe({ userId, after, before })
    .then((r) => process.stdout.write(`${JSON.stringify(r)}\n`))
    .catch((e) => {
      process.stdout.write(`${JSON.stringify({ error: e.message })}\n`);
      process.exit(1);
    });
}
