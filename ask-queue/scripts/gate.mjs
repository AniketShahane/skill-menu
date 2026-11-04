#!/usr/bin/env node
// Token-free pre-check: decides whether a Claude run is needed, using plain Slack Web API reads.
// Optional. Uses the ask-queue bot's token (slack.mjs loadToken: env, AWS Secrets Manager or
// ~/.config/ask-queue/slack-token). With bot scope im:history it reads the bot's DM with the user,
// where cards live (config slack.cardChannel). A bot token can't search, so the sweep check runs a
// lean Haiku search through the claude.ai Slack connector instead (probe.mjs, ~$0.005). Cards still
// in the old self-DM are read by a Claude run on the fixed schedule.
// Without a token, or when the check fails, runs fall back to the fixed schedule.
//
//   gate.mjs replies   routes card-thread replies to their card sessions (no Claude run), then
//                      exit 0 = run Claude for the rest (writes tmp/inbox.json), exit 10 = nothing left
//   gate.mjs sweep     exit 0 = run Claude, exit 10 = nothing new
//   gate.mjs due <m>   no network: the fixed-schedule fallback alone (run.sh uses it if the gate dies)
//   gate.mjs check     verify the token (doctor.sh)
//   gate.mjs watch     loop for Claude Code's Monitor tool: one stdout line per new event

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIRECT_ASK,
  addDirect,
  compareTs,
  computeStats,
  createStore,
  listItems,
  needsPrecheck,
  resolveHome,
  routeToCard,
  workerConfig,
} from "./aq.mjs";
import { tick } from "./dispatch.mjs";
import { probe as haikuProbe } from "./probe.mjs";
import { botDm, cardChannel, loadToken, logEvent } from "./slack.mjs";

export { loadToken };

export const EXIT_RUN = 0;
export const EXIT_SKIP = 10;
// Without a working check, run no more often than the old fixed schedule. Sweep is 14, not 15, so
// cron's every-15-minutes sweep is never skipped by a few seconds of start-time jitter.
const FALLBACK_MINUTES = { replies: 15, sweep: 14 };
// Only these methods can be called, whatever the token's scopes allow.
const READ_METHODS = new Set(["auth.test", "conversations.replies", "conversations.history", "search.messages"]);
const REQUEST_TIMEOUT_MS = 15_000;
// Past this many pages the check fails (and falls back) rather than skip messages.
const PAGE_CAP = 10;
const MAX_TEXT = 20_000;
// Edits and note threads are looked for this far back.
const LOOKBACK_SEC = 48 * 3600;

// The checkpoint for new top-level messages where cards live.
export function topCheckpoint(config) {
  const ch = cardChannel(config);
  return ch && ch !== config?.slack?.selfDmId ? "replies:cards" : "replies:selfdm";
}

// Errors never include the token or request headers: they end up in model-readable logs.
export function slackClient(token, fetchImpl = fetch) {
  const valid = /^xox[a-z]-[A-Za-z0-9-]+$/.test(String(token || ""));
  const call = async function call(method, params = {}) {
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
  call.isBot = /^xoxb-/.test(String(token || ""));
  return call;
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

// Slack stores the posted 🤖 as the shortcode ":robot_face:", so accept both.
const fromBot = (text) => /^(🤖|:robot_face:)/u.test(String(text || "").trimStart());
// The user's own message: never the bot's (bot_id), never a 🤖 post. Loop protection.
const byUser = (m, userId) => m.user === userId && !m.bot_id && !m.subtype?.startsWith?.("bot") && !fromBot(m.text);

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

// A reaction on a card's own OK request ("🤖 🔐 … OK to …?") answers it like a reply: ✅ is a yes,
// ❌ a no. Only reactions on 🤖 posts made after the open proposal count, so an old ✅ never answers
// a new ask; once answered, the proposal is gone and the reaction is not read again.
const YES_REACTIONS = new Set(["white_check_mark", "heavy_check_mark", "+1", "thumbsup", "ok", "ok_hand"]);
const NO_REACTIONS = new Set(["x", "-1", "thumbsdown", "no_entry", "no_entry_sign"]);

function proposedSince(item) {
  const times = [item.job?.permProposed?.length && item.job.permProposedAt, item.job?.repoProposed?.length && item.job.repoProposedAt]
    .filter(Boolean)
    .map((at) => Date.parse(at) / 1000)
    .filter(Number.isFinite);
  return times.length ? Math.min(...times) : null;
}

export function reactionAnswer(messages, userId, since) {
  let answer = null;
  for (const m of messages) {
    if (!(fromBot(m.text) || m.bot_id) || Number(m.ts) < since) continue;
    const mine = (names) => (m.reactions || []).some((r) => names.has(r.name) && (r.users || []).includes(userId));
    if (mine(NO_REACTIONS)) answer = { ts: m.ts, text: "no (❌ on your OK request)", reaction: true };
    else if (mine(YES_REACTIONS)) answer = { ts: m.ts, text: "yes (✅ on your OK request)", reaction: true };
  }
  return answer;
}

async function threadMessages(call, channel, ts) {
  return (await paged(call, "conversations.replies", { channel, ts, limit: 200 })).filter((m) => m.ts !== ts);
}

// Collects only the user's messages that no run has handled yet, from the channel where cards live
// (the bot DM). Card threads elsewhere (the old self-DM, which a bot can't read) are listed in
// `legacy` for a Claude run on the fixed schedule.
export async function collectInbox(store, call, clock) {
  const config = store.config();
  const { userId } = config.slack || {};
  const home = cardChannel(config);
  const checkpoints = store.state().checkpoints;
  const mine = (m) => byUser(m, userId);
  const legacy = [];

  const threads = new Map();
  const watched = listItems(store, { watch: true }, clock);
  for (const item of watched) {
    if (item.card.channelId !== home) {
      // Closed old cards don't wake Claude: a reply there would cost a run every 15 minutes for 48h.
      if (!["done", "skipped", "filtered"].includes(item.status)) legacy.push(item.id);
      continue;
    }
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
    const all = await threadMessages(call, thread.channelId, thread.cardTs);
    const messages = all.filter((m) => mine(m) && isNew(m, thread.lastSeen)).map(compact);
    const since = thread.ids.length === 1 ? proposedSince(store.getItem(thread.ids[0])) : null;
    const answer = since === null ? null : reactionAnswer(all, userId, since);
    if (answer) messages.push(answer);
    if (messages.length) cards.push({ ids: thread.ids, channelId: thread.channelId, cardTs: thread.cardTs, messages });
  }

  const proposals = [];
  for (const { type, ts } of computeStats(store, clock).openProposals) {
    let thread;
    try {
      thread = await threadMessages(call, home, ts);
    } catch (err) {
      // An offer posted before cards moved to the bot DM: the Claude run reads it.
      if (!/thread_not_found|channel_not_found/.test(err.message)) throw err;
      legacy.push(`proposal:${type}`);
      continue;
    }
    const messages = thread.filter(mine).map(compact);
    if (messages.length) proposals.push({ type, ts, messages });
  }

  // One read covers new top-level messages (since the checkpoint, even after a long weekend),
  // edits to recent ones, and replies under them.
  const now = clock ? clock() : new Date();
  const nowSec = now.getTime() / 1000;
  const since = checkpoints[topCheckpoint(config)] || (nowSec - 3600).toFixed(6);
  const lookback = (nowSec - LOOKBACK_SEC).toFixed(6);
  const windowStart = compareTs(since, lookback) < 0 ? since : lookback;
  const parents = (await paged(call, "conversations.history", { channel: home, oldest: windowStart, limit: 200 }))
    .filter((m) => (!m.thread_ts || m.thread_ts === m.ts) && mine(m))
    .sort((a, b) => compareTs(a.ts, b.ts));
  const topLevel = parents.filter((m) => isNew(m, since)).map(compact);

  // Replies under the user's own top-level messages ("no, that was just a note"). Each thread has its
  // own mark (checkpoint note:<parentTs>), so a reply landing mid-check can't be skipped.
  // A direct ask's thread is its card's, read above: not a note thread.
  const cardTs = new Set(watched.filter((item) => item.card.channelId === home).map((item) => item.card.ts));
  const noteThreads = [];
  for (const parent of parents) {
    if (cardTs.has(parent.ts)) continue;
    const mark = checkpoints[`note:${parent.ts}`] || parent.ts;
    if (!parent.latest_reply || compareTs(parent.latest_reply, mark) <= 0) continue;
    const messages = (await threadMessages(call, home, parent.ts))
      .filter((m) => mine(m) && compareTs(m.ts, mark) > 0)
      .map(compact);
    if (messages.length) noteThreads.push({ parentTs: parent.ts, parentText: compact(parent).text, messages });
  }

  return { createdAt: now.toISOString(), channel: home, cards, proposals, topLevel, noteThreads, notices: workerNotices(store), legacy };
}

// Direct asks become their own cards here, with no Claude run: dispatch starts the session, which
// answers in the message's thread. In the bot DM every top-level message is one; in the old self-DM
// only "Claude, …" messages are. Returns the item ids.
export function takeDirectAsks(store, inbox, clock) {
  const config = store.config();
  const anyText = botDm(config, inbox.channel || cardChannel(config));
  const taken = [];
  const rest = [];
  let newest = null;
  for (const msg of inbox.topLevel) {
    if ((!anyText && !DIRECT_ASK.test(msg.text)) || msg.truncated) {
      rest.push(msg);
      continue;
    }
    try {
      const { action, id } = addDirect(store, msg, clock);
      if (action === "created" || action === "edited") taken.push(id);
      const ts = msg.editedTs && compareTs(msg.editedTs, msg.ts) > 0 ? msg.editedTs : msg.ts;
      if (!newest || compareTs(ts, newest) > 0) newest = ts;
    } catch {
      rest.push(msg); // the Claude run handles it
    }
  }
  inbox.topLevel = rest;
  // Nothing else at the top level: move the mark past them here, since no Claude run will.
  if (newest && !rest.length) {
    const state = store.state();
    const key = topCheckpoint(config);
    if (!state.checkpoints[key] || compareTs(newest, state.checkpoints[key]) > 0) {
      state.checkpoints[key] = newest;
      store.saveState(state);
    }
  }
  return taken;
}

// Worker news for the user that a replies run must post (dispatch.mjs sets job.notice).
export function workerNotices(store) {
  return store
    .allItems()
    .filter((item) => item.job?.notice)
    .map((item) => ({ id: item.id, status: item.status, notice: item.job.notice, card: item.card || null }));
}

// Card threads with one item go straight to that card's session: messages appended to its
// job.followUp, the item queued, the thread marked seen. Shared digest threads (filtered items),
// promotion offers, top-level messages and note threads stay in the inbox for a Claude run.
export function routeInbox(store, inbox, clock) {
  const routed = [];
  const remaining = [];
  for (const thread of inbox.cards) {
    let done = false;
    if (thread.ids.length === 1) {
      try {
        const item = store.getItem(thread.ids[0]);
        if (item.status !== "filtered") {
          // A reaction answer is not a message: it never moves the thread's seen mark.
          const seenTs = thread.messages
            .filter((m) => !m.reaction)
            .map((m) => m.editedTs || m.ts)
            .reduce((max, ts) => (max === null || compareTs(ts, max) > 0 ? ts : max), null);
          routeToCard(store, item.id, { messages: thread.messages, seenTs }, clock, { grant: true });
          routed.push(item.id);
          done = true;
        }
      } catch {
        // could not route: the Claude run handles it
      }
    }
    if (!done) remaining.push(thread);
  }
  inbox.cards = remaining;
  return routed;
}

export function inboxKeys(inbox) {
  return [
    ...inbox.topLevel.map((m) => `top:${m.ts}:${m.editedTs || ""}`),
    ...inbox.cards.flatMap((c) => c.messages.map((m) => `${c.cardTs}:${m.ts}:${m.editedTs || ""}`)),
    ...inbox.proposals.flatMap((p) => p.messages.map((m) => `${p.ts}:${m.ts}`)),
    ...inbox.noteThreads.flatMap((t) => t.messages.map((m) => `${t.parentTs}:${m.ts}`)),
    ...(inbox.notices || []).map((n) => `notice:${n.id}:${n.notice}`),
  ];
}

// Card threads the gate can't read (old self-DM cards) need a Claude run, on the fixed schedule.
function legacyDue(home, inbox, now) {
  return (inbox.legacy || []).length > 0 && fallbackDue(home, "replies", now);
}

// Sources the Haiku probe can check (bot token only).
const PROBED = ["slack", "gmail", "zoom"];
const dayBefore = (iso) => new Date(Date.parse(iso) - 24 * 3600 * 1000).toISOString().slice(0, 10);

export async function sweepNeeded(store, call, clock, probeImpl = haikuProbe) {
  const config = store.config();
  const state = store.state();
  const now = (clock ? clock() : new Date()).getTime();
  const enabled = Object.entries(config.sources || {})
    .filter(([, on]) => on)
    .map(([name]) => name);
  const probed = enabled.filter((name) => PROBED.includes(name));
  // The probe covers Slack, Gmail and Zoom for a bot token; anything else needs Claude every time.
  const others = enabled.filter((name) => !(call.isBot ? PROBED : ["slack"]).includes(name));
  if (others.length) return { run: true, reason: `${others.join(", ")} can only be checked by Claude` };
  const since = state.checkpoints.slack;
  const fresh = probed.filter((name) => !state.checkpoints[name]);
  if (fresh.length) return { run: true, reason: `first sweep for ${fresh.join(", ")}` };
  const delay = Number(workerConfig(store).prepDelayMin) || 0;
  const waiting = store.allItems().filter((item) => needsPrecheck(item, now, delay)).map((item) => item.id);
  if (waiting.length) return { run: true, reason: `pre-check before a session starts: ${waiting.join(", ")}` };
  const quietHours = config.gate?.maxQuietHours ?? 6;
  const last = state.checkpoints["sweep:last"];
  if (!last || now - Date.parse(last) >= quietHours * 3600 * 1000) {
    return { run: true, reason: `no full sweep for ${quietHours}h: reconcile drafts and learn` };
  }

  const { userId, selfDmId } = config.slack;
  // A bot token can't search Slack: a lean Haiku run searches Slack, Gmail and Zoom through the
  // claude.ai connectors instead (probe.mjs). Any doubt means "run"; a failed probe throws
  // (fixed schedule).
  if (call.isBot) {
    if (config.gate?.probe === "off") throw new Error("a bot token can't search Slack");
    const home = path.dirname(store.paths.config);
    const gateState = readGateState(home);
    const sources = Object.fromEntries(
      probed.map((name) => [name, { after: Date.parse(state.checkpoints[name]) / 1000, seen: gateState.zoomSeen || [] }]),
    );
    const result = await probeImpl({ userId, sources, ignoreChannels: [selfDmId, cardChannel(config)] });
    const cost = result.cost == null ? "" : ` (probe $${result.cost.toFixed(4)})`;
    // A Zoom summary wakes the sweep once; the sweep looks back 3 hours, so a failed run still gets it.
    const zoom = (result.hits || []).filter((h) => h.source === "zoom").map((h) => h.uuid);
    if (result.run && zoom.length) {
      const latest = readGateState(home);
      latest.zoomSeen = [...new Set([...(latest.zoomSeen || []), ...zoom])].slice(-200);
      fs.writeFileSync(path.join(home, "gate.json"), `${JSON.stringify(latest, null, 2)}\n`);
    }
    // `seen` goes into the run log, so a later card can be traced to the check that woke Sonnet.
    const seen = (result.hits || []).map((h) => h.key);
    return { run: result.run, reason: `${result.reason}${cost}`, ...(seen.length ? { seen } : {}) };
  }
  // One hit is enough to decide, so a single page per query is fine here.
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
export async function decide(mode, { home, token, fetchImpl, clock, probeImpl } = {}) {
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
      const routedIds = routeInbox(store, inbox, clock);
      const directIds = takeDirectAsks(store, inbox, clock);
      const routed = [...routedIds, ...directIds];
      for (const id of routedIds) logEvent(home, { source: "gate", action: "route", channel: inbox.channel, user: store.config().slack?.userId, id }, clock);
      for (const id of directIds) logEvent(home, { source: "gate", action: "direct", channel: inbox.channel, user: store.config().slack?.userId, id }, clock);
      const count = inboxKeys(inbox).length;
      const legacy = count ? false : legacyDue(home, inbox, now);
      if (count || legacy) {
        fs.mkdirSync(path.dirname(inboxFile), { recursive: true });
        fs.writeFileSync(inboxFile, `${JSON.stringify(inbox, null, 2)}\n`);
      }
      const sent = routed.length ? `; passed to card sessions: ${routed.join(", ")}` : "";
      result = count
        ? { run: true, reason: `${count} new messages${sent}`, inbox: "tmp/inbox.json", routed }
        : legacy
          ? { run: true, reason: `${inbox.legacy.length} cards in the old self-DM to read${sent}`, inbox: "tmp/inbox.json", routed }
          : { run: false, reason: `nothing for the replies run${sent}`, routed };
    } else {
      result = await sweepNeeded(store, call, clock, probeImpl);
    }
  } catch (err) {
    const reason = `${err.message}; fixed schedule (every ${FALLBACK_MINUTES[mode]}m)`;
    const notices = mode === "replies" ? workerNotices(store).length : 0;
    result = notices
      ? { run: true, reason: `${notices} worker notices; ${reason}`, fallback: true }
      : { run: fallbackDue(home, mode, now), reason, fallback: true };
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
      const inbox = await collectInbox(store, call);
      // Card replies go straight to their sessions; dispatch starts them now.
      if (routeInbox(store, inbox).length + takeDirectAsks(store, inbox).length) tick({ home });
      const fresh = inboxKeys(inbox).filter((key) => !announced.has(key));
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
      if (me.bot_id) {
        if (/search:read|chat:write\.customize|im:write|channels:history|groups:history/.test(me.scopes || "")) {
          process.stdout.write("gate: WARN the bot has more scopes than the approved four (im:history, im:read, users:read, chat:write)\n");
        }
      } else if (expected && expected !== me.user_id) {
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
