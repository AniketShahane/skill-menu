#!/usr/bin/env node
// The ask-queue Slack bot: tokens, posting into the user's DM with the bot, and the request log.
// No AI and no npm packages: plain Slack Web API calls with fetch.
//
// Tokens (bot xoxb- for the Web API, app xapp- for Socket Mode), first match wins:
//   1. env ASK_QUEUE_SLACK_TOKEN / ASK_QUEUE_SLACK_APP_TOKEN
//   2. AWS Secrets Manager, when ~/.config/ask-queue/aws.json says {"region": "...", "prefix": "..."}:
//      secrets <prefix>/bot-token and <prefix>/app-token, read with the aws CLI
//   3. files ~/.config/ask-queue/slack-token and slack-app-token (mode 600)
//
// The bot writes in one place only: its DM with the user (config slack.userId; the DM's channel id
// is config slack.cardChannel once known). Every other message stays a draft made as the user.
//
//   slack.mjs post [--thread <ts>] [--update <ts>] [--file <path>]   text from --file or stdin
//   slack.mjs connect      first post into the bot DM; saves its channel id as slack.cardChannel
//   slack.mjs check        verify both tokens (doctor.sh)

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore, resolveHome } from "./aq.mjs";

const REQUEST_TIMEOUT_MS = 15_000;
// chat.postMessage markdown_text limit.
const MAX_MARKDOWN = 12_000;

const SECRETS = {
  "bot-token": { env: "ASK_QUEUE_SLACK_TOKEN", file: "slack-token", pattern: /^xox[a-z]-[A-Za-z0-9-]+$/ },
  "app-token": { env: "ASK_QUEUE_SLACK_APP_TOKEN", file: "slack-app-token", pattern: /^xapp-[A-Za-z0-9-]+$/ },
};

export const configDir = (env = process.env) =>
  path.join(env.XDG_CONFIG_HOME || path.join(env.HOME || os.homedir(), ".config"), "ask-queue");

// {region, prefix} when tokens live in AWS Secrets Manager, else null.
export function awsSource(env = process.env) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(configDir(env), "aws.json"), "utf8"));
    return cfg?.region && cfg?.prefix ? { region: String(cfg.region), prefix: String(cfg.prefix).replace(/\/+$/, "") } : null;
  } catch {
    return null;
  }
}

const cache = new Map();

// Returns the token or null. Never logs or returns anything about its value.
export function loadSecret(name, env = process.env, run = execFileSync) {
  const spec = SECRETS[name];
  if (!spec) throw new Error(`unknown secret ${name}`);
  if (env[spec.env]) return env[spec.env].trim();
  const aws = awsSource(env);
  if (aws) {
    const key = `${aws.region}|${aws.prefix}/${name}`;
    if (!cache.has(key)) {
      let value = null;
      try {
        value = String(
          run("aws", ["secretsmanager", "get-secret-value", "--region", aws.region, "--secret-id", `${aws.prefix}/${name}`, "--query", "SecretString", "--output", "text"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 20_000,
          }),
        ).trim();
      } catch {
        value = null;
      }
      cache.set(key, value || null);
    }
    return cache.get(key);
  }
  try {
    return fs.readFileSync(path.join(configDir(env), spec.file), "utf8").trim() || null;
  } catch {
    return null;
  }
}

export const loadToken = (env = process.env) => loadSecret("bot-token", env);
export const loadAppToken = (env = process.env) => loadSecret("app-token", env);
export const tokenLooksValid = (name, token) => SECRETS[name].pattern.test(String(token || ""));

// Where cards and the bot's posts live: the bot DM once connected, else the old self-DM.
export function cardChannel(config) {
  return config?.slack?.cardChannel || config?.slack?.selfDmId || null;
}

// True when cards live in the bot DM: every top-level message there is an ask, no "Claude," needed.
export function botDm(config, channel) {
  const ch = config?.slack?.cardChannel;
  return Boolean(ch && channel === ch && ch !== config?.slack?.selfDmId);
}

// ---------- request log: event id, channel, user, action ----------

export function logEvent(home, entry, clock) {
  const at = (clock ? clock() : new Date()).toISOString();
  const line = { at, ...entry };
  for (const key of Object.keys(line)) if (line[key] === undefined || line[key] === null) delete line[key];
  try {
    fs.mkdirSync(path.join(home, "logs"), { recursive: true });
    fs.appendFileSync(path.join(home, "logs", "events.jsonl"), `${JSON.stringify(line)}\n`);
  } catch {
    // logging never breaks a run
  }
  return line;
}

// ---------- writing as the bot ----------

const WRITE_METHODS = new Set(["chat.postMessage", "chat.update"]);

// Errors never include the token or request headers: they end up in model-readable logs.
async function apiPost(token, method, body, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`${method}: request failed (${err.name})`);
  }
  if (res.status === 429) throw new Error(`${method}: rate limited (retry after ${res.headers?.get?.("retry-after") || "?"}s)`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`${method}: unreadable response (HTTP ${res.status})`);
  }
  if (!data.ok) throw new Error(`${method}: ${String(data.error).slice(0, 80)}`);
  return data;
}

// Posts or edits one bot message in the user's DM with the bot. Refuses every other channel.
export async function botPost({ token, config, text, thread, update, fetchImpl, home, clock, by }) {
  const userId = config?.slack?.userId;
  if (!userId) throw new Error("slack.userId is not set: run setup first");
  // Only a bot token: a user token (xoxp-) would post as the user.
  if (!/^xoxb-/.test(String(token || "")) || !tokenLooksValid("bot-token", token)) throw new Error("no bot token (see references/setup.md, Slack bot)");
  const body = String(text || "").trim();
  if (!body) throw new Error("nothing to post (empty text)");
  if (body.length > MAX_MARKDOWN) throw new Error(`message is ${body.length} characters; the limit is ${MAX_MARKDOWN}. Split it.`);
  for (const ts of [thread, update]) {
    if (ts !== undefined && ts !== null && !/^\d+\.\d+$/.test(String(ts))) throw new Error(`bad message ts: ${ts}`);
  }
  // Before the DM's id is known, posting to the user id opens it (no im:write needed).
  const channel = config.slack.cardChannel || userId;
  const method = update ? "chat.update" : "chat.postMessage";
  if (!WRITE_METHODS.has(method)) throw new Error(`${method} is not allowed`);
  const payload = update ? { channel, ts: String(update), markdown_text: body } : { channel, markdown_text: body, unfurl_links: false, unfurl_media: false };
  if (thread && !update) payload.thread_ts = String(thread);
  if (update && !config.slack.cardChannel) throw new Error("slack.cardChannel is not set: run slack.mjs connect first");
  const data = await apiPost(token, method, payload, fetchImpl);
  const result = { channel: data.channel, ts: data.ts, ...(thread ? { thread_ts: String(thread) } : {}) };
  if (home) logEvent(home, { source: "post", action: update ? "edit" : thread ? "reply" : "post", channel: data.channel, ts: data.ts, thread_ts: thread || undefined, by }, clock);
  return result;
}

// ---------- CLI ----------

function parseArgs(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    if (!args[i].startsWith("--")) continue;
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) flags[args[i].slice(2)] = true;
    else {
      flags[args[i].slice(2)] = next;
      i += 1;
    }
  }
  return flags;
}

async function main(argv) {
  const [command, ...rest] = argv;
  const flags = parseArgs(rest);
  const home = resolveHome();
  const store = createStore(home);
  const config = store.config();
  const token = loadToken();

  if (command === "post") {
    const text = typeof flags.file === "string" ? fs.readFileSync(flags.file, "utf8") : fs.readFileSync(0, "utf8");
    const by = process.env.ASK_QUEUE_ITEM || undefined;
    return botPost({ token, config, text, thread: flags.thread, update: flags.update, home, by });
  }
  if (command === "connect") {
    const text = typeof flags.file === "string" ? fs.readFileSync(flags.file, "utf8") : "🤖 ask-queue is connected. Cards will show up here. Message me here to ask for anything.";
    const result = await botPost({ token, config: { slack: { ...config.slack, cardChannel: null } }, text, home, by: "connect" });
    const fresh = store.config();
    fresh.slack = { ...fresh.slack, cardChannel: result.channel };
    fs.writeFileSync(store.paths.config, `${JSON.stringify(fresh, null, 2)}\n`);
    return { cardChannel: result.channel, ts: result.ts };
  }
  if (command === "check") {
    const out = { source: awsSource() ? "aws-secrets-manager" : "file", bot: "missing", app: "missing" };
    if (token) {
      const me = await apiPost(token, "auth.test", {});
      out.bot = `ok (${me.user}, team ${me.team})`;
    }
    const app = loadAppToken();
    if (app) {
      await apiPost(app, "apps.connections.open", {});
      out.app = "ok (Socket Mode)";
    }
    out.cardChannel = config.slack?.cardChannel || null;
    return out;
  }
  throw new Error("usage: slack.mjs post [--thread ts] [--update ts] [--file path] | connect | check");
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = await main(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (err) {
    process.stderr.write(`${JSON.stringify({ error: err.message })}\n`);
    process.exit(1);
  }
}
