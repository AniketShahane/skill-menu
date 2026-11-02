#!/usr/bin/env node
// Always-on Slack watcher (Socket Mode). No AI, no tokens spent, no public endpoint, no npm packages.
// Run with: node --experimental-websocket watch.mjs   (Node 20; Node 22+ has WebSocket built in)
// watch.sh starts it, and a crontab line restarts it within a minute if it dies.
//
// It hears only the bot's DM with the user (bot event message.im). For each new message from the
// user (never a bot: loop protection):
//   - top level: a direct ask, so a card session starts (aq direct)
//   - reply in a card's thread: passed to that card's session (aq route)
//   then dispatch tick starts the session at once. Anything else (edits, replies under a digest or
//   an offer) starts a replies check (run.sh replies), which handles it as before.
// Every request is logged to logs/events.jsonl (event id, channel, user, action).

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SKILL_DIR, addDirect, compareTs, createStore, resolveHome, routeToCard } from "./aq.mjs";
import { tick } from "./dispatch.mjs";
import { loadAppToken, logEvent } from "./slack.mjs";

// Per minute; past this, messages wait for the 2-minute replies check (rate limit, loop guard).
export const MAX_EVENTS_PER_MIN = 20;
const SEEN_IDS = 500;
const REPLIES_DEBOUNCE_MS = 60_000;

const log = (line) => process.stdout.write(`${new Date().toISOString()} ${line}\n`);

export function createHandler({ home, clock, runTick = (h) => tick({ home: h }), runReplies = defaultReplies } = {}) {
  const seen = [];
  const recent = [];
  let lastReplies = 0;

  const replies = (why) => {
    const now = (clock ? clock() : new Date()).getTime();
    if (now - lastReplies < REPLIES_DEBOUNCE_MS) return "replies-debounced";
    lastReplies = now;
    runReplies(home, why);
    return "replies";
  };

  // Returns the action taken (also logged). Throws nothing.
  return function handle(payload) {
    const event = payload?.event || {};
    const eventId = payload?.event_id;
    const store = createStore(home);
    let config;
    try {
      config = store.config();
    } catch {
      return "no-config";
    }
    const { userId, cardChannel } = config.slack || {};
    const base = { source: "watch", eventId, channel: event.channel, user: event.user || event.message?.user };
    const record = (action, extra = {}) => {
      logEvent(home, { ...base, action, ...extra }, clock);
      return action;
    };

    if (event.type !== "message" || event.channel_type !== "im") return "ignored";
    if (eventId) {
      if (seen.includes(eventId)) return "duplicate";
      seen.push(eventId);
      if (seen.length > SEEN_IDS) seen.shift();
    }
    // Loop protection: the bot's own posts (and any bot's) never trigger anything.
    if (event.bot_id || event.subtype === "bot_message" || event.message?.bot_id) return "ignored";
    if (cardChannel && event.channel !== cardChannel) return record("ignored-other-dm");
    if (!cardChannel) return record("ignored-no-cardChannel");

    if (event.subtype === "message_changed") {
      if (event.message?.user !== userId) return "ignored";
      return record(replies("edited message"));
    }
    if (event.subtype && event.subtype !== "file_share") return "ignored";
    if (event.user !== userId) return record("ignored-not-user");

    const now = (clock ? clock() : new Date()).getTime();
    while (recent.length && now - recent[0] > 60_000) recent.shift();
    if (recent.length >= MAX_EVENTS_PER_MIN) return record("rate-limited");
    recent.push(now);

    const message = {
      ts: event.ts,
      text: String(event.text || ""),
      ...(Array.isArray(event.files) && event.files.length
        ? { files: event.files.map((f) => ({ name: f.name || f.title || null, url: f.permalink || null })) }
        : {}),
    };
    const threadTs = event.thread_ts && event.thread_ts !== event.ts ? event.thread_ts : null;
    try {
      if (!threadTs) {
        if (!message.text.trim() && !message.files) return record("ignored-empty");
        const { action, id } = addDirect(store, { ts: message.ts, text: message.text || "(file attached)" }, clock);
        if (action === "duplicate") return record("duplicate", { id });
        runTick(home);
        return record("direct", { id });
      }
      const items = store
        .allItems()
        .filter((item) => item.card?.channelId === event.channel && item.card?.ts === threadTs && item.status !== "filtered");
      if (items.length !== 1) return record(replies("reply outside a card thread"));
      const item = items[0];
      if (item.card.lastSeenTs && compareTs(item.card.lastSeenTs, message.ts) >= 0) return record("duplicate", { id: item.id });
      routeToCard(store, item.id, { messages: [message], seenTs: message.ts }, clock, { grant: true });
      runTick(home);
      return record("route", { id: item.id });
    } catch (err) {
      log(`could not handle ${event.ts}: ${err.message}`);
      return record(replies(`watcher could not handle it: ${err.message}`), { error: err.message.slice(0, 120) });
    }
  };
}

function defaultReplies(home, why) {
  const child = spawn(path.join(SKILL_DIR, "scripts", "run.sh"), ["replies"], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ASK_QUEUE_HOME: home },
  });
  child.unref();
  log(`replies check started: ${why}`);
}

async function openSocket(appToken) {
  const res = await fetch("https://slack.com/api/apps.connections.open", {
    method: "POST",
    headers: { Authorization: `Bearer ${appToken}`, "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`apps.connections.open: ${String(body.error).slice(0, 80)}`);
  return body.url;
}

// One connection's life. Resolves when it closes.
function connect(url, handle) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    let opened = false;
    ws.addEventListener("open", () => {
      opened = true;
    });
    ws.addEventListener("message", (msg) => {
      let envelope;
      try {
        envelope = JSON.parse(String(msg.data));
      } catch {
        return;
      }
      // Ack first: Slack retries unacked events.
      if (envelope.envelope_id) ws.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
      if (envelope.type === "hello") log("connected");
      else if (envelope.type === "disconnect") {
        log(`Slack asked to reconnect (${envelope.reason || "no reason"})`);
        ws.close();
      } else if (envelope.type === "events_api") {
        const action = handle(envelope.payload);
        if (action !== "ignored") log(`event ${envelope.payload?.event_id || "?"}: ${action}`);
      }
    });
    ws.addEventListener("close", () => resolve(opened));
    ws.addEventListener("error", () => {
      try {
        ws.close();
      } catch {
        // already closed
      }
    });
  });
}

async function main() {
  if (typeof WebSocket === "undefined") {
    log("no WebSocket in this Node: run with node --experimental-websocket (Node 20) or use Node 22+");
    process.exit(1);
  }
  const home = resolveHome();
  const appToken = loadAppToken();
  if (!appToken) {
    log("no Slack app token (xapp-): see references/setup.md, Slack bot");
    process.exit(1);
  }
  const handle = createHandler({ home });
  let backoff = 1000;
  for (;;) {
    try {
      const url = await openSocket(appToken);
      const wasOpen = await connect(url, handle);
      if (wasOpen) backoff = 1000;
      log("connection closed");
    } catch (err) {
      log(`connect failed: ${err.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, backoff));
    backoff = Math.min(backoff * 2, 60_000);
  }
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
