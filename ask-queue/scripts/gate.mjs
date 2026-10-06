#!/usr/bin/env node
// Token-free pre-check: decides whether a Claude run is needed, using plain Slack Web API reads.
// Optional. Needs a read-only Slack user token (scopes: im:history, search:read) in
// $ASK_QUEUE_SLACK_TOKEN or ~/.config/ask-queue/slack-token. That file sits outside the data dir,
// so the guarded model can't read it. Without a token, runs fall back to the fixed schedule.
//
//   gate.mjs replies   exit 0 = run Claude (writes tmp/inbox.json), exit 10 = nothing new
//   gate.mjs sweep     exit 0 = run Claude, exit 10 = nothing new
//   gate.mjs due <m>   no network: the fixed-schedule fallback alone (run.sh uses it if the gate dies)
//   gate.mjs check     verify the token (doctor.sh)
//   gate.mjs watch     loop for Claude Code's Monitor tool: one stdout line per new event

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareTs, computeStats, createStore, listItems, resolveHome } from "./aq.mjs";

export const EXIT_RUN = 0;
export const EXIT_SKIP = 10;
// Without a working check, run no more often than the old fixed schedule.
const FALLBACK_MINUTES = { replies: 15, sweep: 120 };
// Only these methods can be called, whatever the token's scopes allow.
const READ_METHODS = new Set(["auth.test", "conversations.replies", "conversations.history", "search.messages"]);
const REQUEST_TIMEOUT_MS = 15_000;
// Past this many pages the check fails (and falls back) rather than skip messages.
const PAGE_CAP = 10;
const MAX_TEXT = 20_000;
// Edits and note threads are looked for this far back.
const LOOKBACK_SEC = 48 * 3600;

export function loadToken(env = process.env) {
  if (env.ASK_QUEUE_SLACK_TOKEN) return env.ASK_QUEUE_SLACK_TOKEN.trim();
  const dir = path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "ask-queue");
  try {
    return fs.readFileSync(path.join(dir, "slack-token"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

// Errors never include the token or request headers: they end up in model-readable logs.
export function slackClient(token, fetchImpl = fetch) {
  const valid = /^xox[a-z]-[A-Za-z0-9-]+$/.test(String(token || ""));
  return async function call(method, params = {}) {
    if (!READ_METHODS.has(method)) throw new Error(`${method} is not an allowed read method`);
    if (!valid) throw new Error("Slack token is malformed (expected one line starting with xoxp-)");
    const url = new URL(`https://slack.com/api/${method}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    let res;
    try {
      res = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`${method}: request failed (${err.name})`);
    }
    if (res.status === 429) throw new Error(`${method}: rate limited`);
    let body;
    try {
      body = await res.json();
    } catch {
      throw new Error(`${method}: unreadable response (HTTP ${res.status})`);
    }
    if (!body.ok) throw new Error(`${method}: ${String(body.error).slice(0, 80)}`);
    if (method === "auth.test") body.scopes = res.headers?.get?.("x-oauth-scopes") || null;
    return body;
  };
}

async function paged(call, method, params) {
  const messages = [];
  let cursor;
  for (let page = 0; page < PAGE_CAP; page += 1) {
    const body = await call(method, { ...params, cursor });
    messages.push(...(body.messages || []));
    cursor = body.response_metadata?.next_cursor;
    if (!cursor) return messages;
  }
  throw new Error(`${method}: more than ${PAGE_CAP} pages`);
}

const fromBot = (text) => String(text || "").trimStart().startsWith("🤖");

function isNew(msg, mark) {
  if (compareTs(msg.ts, mark) > 0) return true;
  return Boolean(msg.edited?.ts) && compareTs(msg.edited.ts, mark) > 0;
}

function compact(msg) {
  const text = String(msg.text || "");
  const out = { ts: msg.ts, text: text.slice(0, MAX_TEXT) };
  if (text.length > MAX_TEXT) out.truncated = true;
  // An edit counts as new; mark it seen with editedTs or it would come back every run.
  if (msg.edited?.ts) out.editedTs = msg.edited.ts;
  if (Array.isArray(msg.files) && msg.files.length) {
    out.files = msg.files.map((f) => ({ name: f.name || f.title || null, url: f.permalink || null }));
  }
  return out;
}

async function threadMessages(call, channel, ts) {
  return (await paged(call, "conversations.replies", { channel, ts, limit: 200 })).filter((m) => m.ts !== ts);
}

// Collects only the user's messages that no run has handled yet.
export async function collectInbox(store, call, clock) {
  const { userId, selfDmId } = store.config().slack || {};
  const checkpoints = store.state().checkpoints;
  const mine = (m) => m.user === userId && !fromBot(m.text);

  const threads = new Map();
  for (const item of listItems(store, { watch: true }, clock)) {
    const key = `${item.card.channelId}|${item.card.ts}`;
    const thread = threads.get(key) || { channelId: item.card.channelId, cardTs: item.card.ts, ids: [], lastSeen: null };
    thread.ids.push(item.id);
    const seen = item.card.lastSeenTs || item.card.ts;
    // Shared digest threads: the oldest mark wins, so nothing is skipped.
    if (!thread.lastSeen || compareTs(seen, thread.lastSeen) < 0) thread.lastSeen = seen;
    threads.set(key, thread);
  }

  const cards = [];
  for (const thread of threads.values()) {
    const messages = (await threadMessages(call, thread.channelId, thread.cardTs))
      .filter((m) => mine(m) && isNew(m, thread.lastSeen))
      .map(compact);
    if (messages.length) cards.push({ ids: thread.ids, channelId: thread.channelId, cardTs: thread.cardTs, messages });
  }

  const proposals = [];
  for (const { type, ts } of computeStats(store, clock).openProposals) {
    const messages = (await threadMessages(call, selfDmId, ts)).filter(mine).map(compact);
    if (messages.length) proposals.push({ type, ts, messages });
  }

  // One read covers new top-level messages (since the checkpoint, even after a long weekend),
  // edits to recent ones, and replies under them.
  const now = clock ? clock() : new Date();
  const nowSec = now.getTime() / 1000;
  const since = checkpoints["replies:selfdm"] || (nowSec - 3600).toFixed(6);
  const lookback = (nowSec - LOOKBACK_SEC).toFixed(6);
  const windowStart = compareTs(since, lookback) < 0 ? since : lookback;
  const parents = (await paged(call, "conversations.history", { channel: selfDmId, oldest: windowStart, limit: 200 }))
    .filter((m) => (!m.thread_ts || m.thread_ts === m.ts) && mine(m))
    .sort((a, b) => compareTs(a.ts, b.ts));
  const topLevel = parents.filter((m) => isNew(m, since)).map(compact);

  // Replies under the user's own top-level messages ("no, that was just a note"). Each thread has its
  // own mark (checkpoint note:<parentTs>), so a reply landing mid-check can't be skipped.
  const noteThreads = [];
  for (const parent of parents) {
    const mark = checkpoints[`note:${parent.ts}`] || parent.ts;
    if (!parent.latest_reply || compareTs(parent.latest_reply, mark) <= 0) continue;
    const messages = (await threadMessages(call, selfDmId, parent.ts))
      .filter((m) => mine(m) && compareTs(m.ts, mark) > 0)
      .map(compact);
    if (messages.length) noteThreads.push({ parentTs: parent.ts, parentText: compact(parent).text, messages });
  }

  return { createdAt: now.toISOString(), cards, proposals, topLevel, noteThreads };
}

export function inboxKeys(inbox) {
  return [
    ...inbox.topLevel.map((m) => `top:${m.ts}:${m.editedTs || ""}`),
    ...inbox.cards.flatMap((c) => c.messages.map((m) => `${c.cardTs}:${m.ts}:${m.editedTs || ""}`)),
    ...inbox.proposals.flatMap((p) => p.messages.map((m) => `${p.ts}:${m.ts}`)),
    ...inbox.noteThreads.flatMap((t) => t.messages.map((m) => `${t.parentTs}:${m.ts}`)),
  ];
}

const dayBefore = (iso) => new Date(Date.parse(iso) - 24 * 3600 * 1000).toISOString().slice(0, 10);

export async function sweepNeeded(store, call, clock) {
  const config = store.config();
  const state = store.state();
  const now = (clock ? clock() : new Date()).getTime();
  const others = Object.entries(config.sources || {})
    .filter(([name, on]) => on && name !== "slack")
    .map(([name]) => name);
  if (others.length) return { run: true, reason: `${others.join(", ")} can only be checked by Claude` };
  const since = state.checkpoints.slack;
  if (!since) return { run: true, reason: "first sweep" };
  const waiting = listItems(store, { statuses: ["new"] }, clock).length;
  if (waiting) return { run: true, reason: `${waiting} asks still waiting to be prepped` };
  const quietHours = config.gate?.maxQuietHours ?? 6;
  const last = state.checkpoints["sweep:last"];
  if (!last || now - Date.parse(last) >= quietHours * 3600 * 1000) {
    return { run: true, reason: `no full sweep for ${quietHours}h: reconcile drafts and learn` };
  }

  // One hit is enough to decide, so a single page per query is fine here.
  const { userId, selfDmId } = config.slack;
  const sinceEpoch = Date.parse(since) / 1000;
  const hits = new Set();
  for (const query of [`to:<@${userId}> after:${dayBefore(since)}`, `<@${userId}> after:${dayBefore(since)}`]) {
    const body = await call("search.messages", { query, sort: "timestamp", sort_dir: "desc", count: 50 });
    for (const m of body.messages?.matches || []) {
      if (Number(m.ts) > sinceEpoch && m.user !== userId && m.channel?.id !== selfDmId) {
        hits.add(`${m.channel?.id}:${m.ts}`);
      }
    }
  }
  return hits.size
    ? { run: true, reason: `${hits.size} new Slack messages to check` }
    : { run: false, reason: "no new Slack asks" };
}

function readGateState(home) {
  try {
    return JSON.parse(fs.readFileSync(path.join(home, "gate.json"), "utf8"));
  } catch {
    return { lastRun: {} };
  }
}

function markRun(home, mode, at) {
  const state = readGateState(home);
  state.lastRun = { ...state.lastRun, [mode]: at.toISOString() };
  fs.writeFileSync(path.join(home, "gate.json"), `${JSON.stringify(state, null, 2)}\n`);
}

// The fixed schedule: due when this mode last ran at least FALLBACK_MINUTES ago.
export function fallbackDue(home, mode, now) {
  const last = readGateState(home).lastRun?.[mode];
  return !last || now - Date.parse(last) >= FALLBACK_MINUTES[mode] * 60 * 1000;
}

// One gate decision. Never throws: a failed check falls back to the old fixed schedule.
export async function decide(mode, { home, token, fetchImpl, clock } = {}) {
  const store = createStore(home);
  const now = clock ? clock() : new Date();
  const inboxFile = path.join(home, "tmp", "inbox.json");
  fs.rmSync(inboxFile, { force: true });
  let result;
  try {
    if (!token) throw new Error("no Slack token");
    const call = slackClient(token, fetchImpl);
    if (mode === "replies") {
      const inbox = await collectInbox(store, call, clock);
      const count = inboxKeys(inbox).length;
      if (count) {
        fs.mkdirSync(path.dirname(inboxFile), { recursive: true });
        fs.writeFileSync(inboxFile, `${JSON.stringify(inbox, null, 2)}\n`);
      }
      result = count
        ? { run: true, reason: `${count} new messages`, inbox: "tmp/inbox.json" }
        : { run: false, reason: "no new messages" };
    } else {
      result = await sweepNeeded(store, call, clock);
    }
  } catch (err) {
    const reason = `${err.message}; fixed schedule (every ${FALLBACK_MINUTES[mode]}m)`;
    result = { run: fallbackDue(home, mode, now), reason, fallback: true };
  }
  if (result.run) markRun(home, mode, now);
  return result;
}

// For a long-lived session: prints a line when a mode should run. A failing check still prints on
// the fixed schedule, so the session never goes quiet.
async function watch(home, token, { intervalSec = 60, sweepEveryMin = 30 } = {}) {
  if (!token) {
    process.stdout.write("ask-queue watch: no Slack token, so nothing to watch. Use cron or /loop instead.\n");
    process.exit(1);
  }
  const call = slackClient(token);
  const announced = new Set();
  const lastSignal = { replies: 0, sweep: 0 };
  let lastSweepCheck = 0;
  const signal = (mode, why) => {
    lastSignal[mode] = Date.now();
    process.stdout.write(`ask-queue: ${mode} needed (${why})\n`);
  };
  const fallback = (mode, err) => {
    process.stderr.write(`ask-queue watch: ${err.message}\n`);
    if (Date.now() - lastSignal[mode] >= FALLBACK_MINUTES[mode] * 60 * 1000) signal(mode, `check failed: ${err.message}`);
  };
  for (;;) {
    const store = createStore(home);
    try {
      const fresh = inboxKeys(await collectInbox(store, call)).filter((key) => !announced.has(key));
      if (fresh.length) {
        fresh.forEach((key) => announced.add(key));
        signal("replies", `${fresh.length} new messages`);
      }
    } catch (err) {
      fallback("replies", err);
    }
    if (Date.now() - lastSweepCheck >= sweepEveryMin * 60 * 1000) {
      lastSweepCheck = Date.now();
      try {
        const sweep = await sweepNeeded(store, call);
        if (sweep.run) signal("sweep", sweep.reason);
      } catch (err) {
        fallback("sweep", err);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSec * 1000));
  }
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [mode, arg] = process.argv.slice(2);
  const home = resolveHome();
  const token = loadToken();
  if (mode === "replies" || mode === "sweep") {
    const result = await decide(mode, { home, token });
    process.stdout.write(`${JSON.stringify({ mode, ...result })}\n`);
    process.exit(result.run ? EXIT_RUN : EXIT_SKIP);
  } else if (mode === "due" && (arg === "replies" || arg === "sweep")) {
    const now = new Date();
    const due = fallbackDue(home, arg, now);
    if (due) markRun(home, arg, now);
    process.exit(due ? EXIT_RUN : EXIT_SKIP);
  } else if (mode === "check") {
    if (!token) {
      process.stdout.write("gate: no Slack token (optional). Runs use the fixed schedule.\n");
      process.exit(0);
    }
    try {
      const me = await slackClient(token)("auth.test");
      const expected = createStore(home).config().slack?.userId;
      process.stdout.write(`gate: token OK for ${me.user} (${me.user_id}) on ${me.team}; scopes: ${me.scopes || "unknown"}\n`);
      if (expected && expected !== me.user_id) {
        process.stdout.write(`gate: FAIL token belongs to ${me.user_id}, but slack.userId is ${expected}\n`);
        process.exit(1);
      }
    } catch (err) {
      process.stdout.write(`gate: FAIL ${err.message}\n`);
      process.exit(1);
    }
  } else if (mode === "watch") {
    await watch(home, token);
  } else {
    process.stderr.write("usage: gate.mjs replies|sweep|check|watch|due <replies|sweep>\n");
    process.exit(64);
  }
}
