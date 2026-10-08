#!/usr/bin/env node
// PreToolUse policy for headless ask-queue runs. Fail-closed: a call is allowed only when a rule
// below allows it; everything else is denied, so the run can read and draft but never send.
// Wired by `aq.mjs settings` as: node guard.mjs <ASK_QUEUE_HOME>   (hook JSON arrives on stdin)
//
// Worker profile (`node guard.mjs <home> --worker AQ-n`, for dispatch.mjs card sessions). Still
// fail-closed: edits and commands only inside the session's job folder (<home>/jobs/AQ-n), plus
// memory/*.md; aq.mjs may change only its own item; Slack posts only in its own card thread, except
// one top-level post of the card itself while the item has no card; the same draft-only MCP rules,
// no push, no network commands.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Harmless session bookkeeping tools.
const LOCAL_TOOLS = new Set(["ToolSearch", "TodoWrite", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet"]);
const READ_TOOLS = { Read: "file_path", Glob: "path", Grep: "path", LS: "path" };
const WRITE_TOOLS = { Write: "file_path", Edit: "file_path", MultiEdit: "file_path", NotebookEdit: "notebook_path" };
// Data-dir subfolders the model may edit directly. Items, state, config and ledger change only via aq.mjs.
const WRITABLE_DIRS = ["memory", "tmp", "artifacts"];

// Any of these words in an MCP tool name marks it as a write/side-effect tool.
const WRITE_WORDS = new Set(
  (
    "send post reply forward create update delete remove trash untrash edit transition comment share " +
    "label unlabel mark unmark spam schedule add move upload write set archive unarchive invite respond " +
    "merge close reopen assign react reaction pin unpin authenticate authentication apply copy rename " +
    "convert spawn stop enable disable complete approve submit publish run trigger execute import restore " +
    "attach link join leave insert append patch put push subscribe unsubscribe dismiss resolve unresolve " +
    "fork request sync save star unstar mute notify accept decline cancel register"
  ).split(" "),
);
const READ_WORDS = new Set(
  "search get read list fetch lookup query download view describe find".split(" "),
);

export function toolWords(tool) {
  return tool
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function splitMcpName(name) {
  const rest = name.slice("mcp__".length);
  const idx = rest.indexOf("__");
  if (idx < 0) return null;
  return { server: rest.slice(0, idx).toLowerCase(), tool: rest.slice(idx + 2) };
}

function isInside(target, dir) {
  const rel = path.relative(dir, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function collectValues(input, keys) {
  return keys.map((key) => input?.[key]).filter((value) => typeof value === "string" && value);
}

function loadConfig(home) {
  try {
    return JSON.parse(fs.readFileSync(path.join(home, "config.json"), "utf8"));
  } catch {
    return {};
  }
}

function loadDraftRefs(home) {
  const refs = new Set();
  const dir = path.join(home, "items");
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return refs;
  }
  for (const name of names) {
    try {
      const item = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      if (typeof item.draft?.ref === "string") refs.add(item.draft.ref);
    } catch {
      // unreadable item: contributes no refs
    }
  }
  return refs;
}

function loadCard(home, workerId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(home, "items", `${workerId}.json`), "utf8")).card || null;
  } catch {
    return null;
  }
}

export function makeContext(home, workerId) {
  if (workerId !== undefined && !/^AQ-\d+$/.test(String(workerId))) throw new Error(`invalid worker id: ${workerId}`);
  const resolved = path.resolve(home);
  // Set when the card's one top-level post is allowed. Outside the job folder, so the session can't
  // clear it; dispatch.mjs clears it when a prep run is retried.
  const marker = workerId ? path.join(resolved, "jobs", ".cardposts", workerId) : null;
  return {
    home: resolved,
    skillDir: SKILL_DIR,
    config: loadConfig(home),
    draftRefs: () => loadDraftRefs(home),
    workerId: workerId || null,
    jobDir: workerId ? path.join(resolved, "jobs", workerId) : null,
    card: workerId ? loadCard(home, workerId) : null,
    cardPosted: () => Boolean(marker) && fs.existsSync(marker),
    markCardPosted: () => {
      fs.mkdirSync(path.dirname(marker), { recursive: true });
      fs.writeFileSync(marker, `${new Date().toISOString()}\n`);
    },
  };
}

const allow = (reason) => ({ decision: "allow", reason });
const deny = (reason) => ({ decision: "deny", reason });

function decideBash(command, ctx) {
  const cmd = String(command || "").trim();
  if (/[;&|`$<>\\\n\r]/.test(cmd)) return deny("shell operators are not allowed; run aq.mjs alone");
  const match = cmd.match(/^node\s+(?:"([^"]+)"|'([^']+)'|(\S+))(?:\s|$)/);
  if (!match) return deny("only `node <skill>/scripts/aq.mjs ...` may run");
  const script = path.resolve(match[1] || match[2] || match[3]);
  if (script !== path.join(ctx.skillDir, "scripts", "aq.mjs")) {
    return deny("only the ask-queue aq.mjs script may run");
  }
  return allow("aq.mjs state command");
}

function decideMcp(name, input, ctx) {
  const parts = splitMcpName(name);
  if (!parts) return deny("unrecognized MCP tool name");
  const { server, tool } = parts;

  // A worker marks the user's card-thread messages as read with a reaction (its card's DM only).
  if (server.includes("slack") && tool === "slack_add_reaction" && ctx.workerId) {
    if (ctx.card?.channelId && input?.channel_id === ctx.card.channelId) return allow("worker reacts in its card's DM");
    return deny("a worker may only react to messages in its card's DM");
  }
  if (server.includes("slack") && tool === "slack_send_message" && ctx.workerId) {
    const card = ctx.card;
    if (card?.ts) {
      if (input?.channel_id === card.channelId && input?.thread_ts === card.ts) {
        return allow("worker post in its own card thread");
      }
      return deny(`a worker may only post in its own card thread (thread_ts ${card.ts})`);
    }
    // No card yet: exactly one top-level post of the card to the user's own DM.
    const self = [ctx.config.slack?.userId, ctx.config.slack?.selfDmId].filter(Boolean);
    if (self.length && self.includes(input?.channel_id) && !input?.thread_ts && !input?.reply_broadcast) {
      if (ctx.cardPosted()) return deny("the card is already posted: record it with aq.mjs update, then post in its thread");
      ctx.markCardPosted();
      return allow("the session posts its card (one top-level message to the user's own DM)");
    }
    return deny("no card yet: the only allowed post is the card itself, top-level in the user's own DM");
  }
  if (server.includes("slack") && tool === "slack_send_message") {
    const self = [ctx.config.slack?.userId, ctx.config.slack?.selfDmId].filter(Boolean);
    if (self.length && self.includes(input?.channel_id)) return allow("message to the user's own DM");
    return deny("slack_send_message may only target the user's own DM; use slack_send_message_draft");
  }
  if (server.includes("slack") && tool === "slack_send_message_draft") return allow("Slack draft (unsent)");

  if (server.includes("gmail") && tool === "create_draft") return allow("Gmail draft (unsent)");
  if (server.includes("gmail") && (tool === "update_draft" || tool === "delete_draft")) {
    const ids = collectValues(input, ["draft_id", "draftId", "id"]);
    const refs = ctx.draftRefs();
    if (ids.length && ids.every((id) => refs.has(id))) return allow("a draft this queue created");
    return deny("only drafts created by ask-queue may be changed");
  }

  if (server.includes("drive") && tool === "create_file") {
    const placed = Object.entries(input || {}).some(
      ([key, value]) => /parent|folder/i.test(key) && value !== undefined && value !== null && value !== "" &&
        !(Array.isArray(value) && value.length === 0),
    );
    if (placed) return deny("new docs must stay private in My Drive (no parent folder)");
    return allow("new private Google Doc draft");
  }

  const words = toolWords(tool);
  const writeWord = words.find((word) => WRITE_WORDS.has(word));
  if (writeWord) return deny(`write tool (${writeWord}) is blocked: ask-queue only drafts`);
  if (words.some((word) => READ_WORDS.has(word))) return allow("read-only tool");
  return deny("tool is not recognized as read-only");
}

// Commands that reach other machines or publish work. Workers never push: the user does.
const WORKER_BLOCKED = /(^|[\s;&|(`])(curl|wget|ssh|scp|sftp|rsync|nc|ncat|telnet|ftp|sudo|su|gh|glab|npx|pip|pip3|npm|yarn|pnpm|docker|crontab|nohup|disown|setsid)(\s|$)|\bgit\b[^\n]*\b(push|remote|config|credential|clone|fetch|pull|submodule)\b/;

// aq.mjs commands a session may run: reads, plus changes to its own item and the ledger.
const WORKER_AQ_READS = new Set(["get", "list", "now", "stats", "jobs"]);

function decideWorkerAq(cmd, ctx) {
  if (/[;&|`$<>\\\n\r]/.test(cmd)) return deny("run aq.mjs alone, without shell operators");
  const words = cmd.split(/\s+/).map((w) => w.replace(/^['"]|['"]$/g, ""));
  const aq = path.join(ctx.skillDir, "scripts", "aq.mjs");
  if (words[0] !== "node" || path.resolve(words[1] || "") !== aq) return deny("run aq.mjs as `node <skill>/scripts/aq.mjs ...`");
  const [sub, arg] = words.slice(2);
  if (WORKER_AQ_READS.has(sub)) return allow("aq.mjs read");
  if ((sub === "config" || sub === "checkpoint") && arg === "get") return allow("aq.mjs read");
  if (sub === "ledger" && (arg === "find" || arg === "add")) return allow("aq.mjs ledger");
  if (sub === "update" && arg === ctx.workerId) return allow("aq.mjs update of the session's own item");
  return deny(`a card session may only read state and update ${ctx.workerId}`);
}

function decideWorkerBash(command, cwd, ctx) {
  const cmd = String(command || "").trim();
  if (!cmd) return deny("empty command");
  if (/\baq\.mjs\b/.test(cmd)) {
    const verdict = decideWorkerAq(cmd, ctx);
    if (verdict.decision === "deny") return verdict;
  }
  if (!isInside(path.resolve(cwd), ctx.jobDir)) return deny("commands run only inside the job folder");
  if (WORKER_BLOCKED.test(cmd)) return deny("network, install, push and background commands are blocked for workers");
  if (/\$\{?(HOME|USER|XDG_[A-Z_]+|ASK_QUEUE_[A-Z_]+|PWD|OLDPWD)\b|(^|[\s=:'"(])~|(^|\s)cd\s*($|[;&|])|\bcd\s+-/.test(cmd)) {
    return deny("home, environment paths and bare cd are blocked; stay in the job folder");
  }
  // Every path-looking word must stay inside the job folder (the skill's aq.mjs is also fine).
  const aq = path.join(ctx.skillDir, "scripts", "aq.mjs");
  for (const word of cmd.split(/[\s;&|()<>`"'=]+/).filter(Boolean)) {
    if (word.split("/").includes("..")) return deny("`..` paths are blocked; stay in the job folder");
    if (word.startsWith("/")) {
      const target = path.resolve(word);
      if (target === aq || isInside(target, ctx.jobDir) || target === "/dev/null") continue;
      return deny(`${word} is outside the job folder`);
    }
  }
  return allow("command inside the job folder");
}

function decideWorker(name, toolInput, input, ctx) {
  const cwd = input.cwd || ctx.jobDir;
  if (LOCAL_TOOLS.has(name)) return allow("session bookkeeping");
  if (name in READ_TOOLS) {
    const raw = toolInput[READ_TOOLS[name]];
    const target = path.resolve(cwd, typeof raw === "string" && raw ? raw : ".");
    const memory = path.join(ctx.home, "memory");
    if ([ctx.jobDir, memory, ctx.skillDir].some((dir) => isInside(target, dir))) return allow("read inside the job");
    return deny("workers read only their job folder, memory/ and the skill");
  }
  if (name in WRITE_TOOLS) {
    const raw = toolInput[WRITE_TOOLS[name]];
    if (typeof raw !== "string" || !raw) return deny("missing file path");
    const target = path.resolve(cwd, raw);
    if (isInside(target, ctx.jobDir)) return allow("edit inside the job folder");
    // Card sessions learn on close (learn.md): the memory notes, and nothing else outside the job.
    if (path.dirname(target) === path.join(ctx.home, "memory") && target.endsWith(".md")) return allow("memory note");
    return deny("workers edit only inside their job folder (and memory/*.md)");
  }
  if (name === "Bash") return decideWorkerBash(toolInput.command, cwd, ctx);
  if (name.startsWith("mcp__")) return decideMcp(name, toolInput, ctx);
  return deny(`${name} is not available to workers`);
}

export function decide(input, ctx) {
  const name = input?.tool_name;
  const toolInput = input?.tool_input || {};
  if (typeof name !== "string") return deny("missing tool name");
  if (ctx.workerId) return decideWorker(name, toolInput, input, ctx);
  const cwd = input.cwd || ctx.home;

  if (LOCAL_TOOLS.has(name)) return allow("session bookkeeping");

  if (name in READ_TOOLS) {
    const raw = toolInput[READ_TOOLS[name]];
    const target = path.resolve(cwd, typeof raw === "string" && raw ? raw : ".");
    if (isInside(target, ctx.home) || isInside(target, ctx.skillDir)) return allow("read inside ask-queue");
    return deny("reads are limited to the ask-queue data and skill directories");
  }

  if (name in WRITE_TOOLS) {
    const raw = toolInput[WRITE_TOOLS[name]];
    if (typeof raw !== "string" || !raw) return deny("missing file path");
    const target = path.resolve(cwd, raw);
    if (WRITABLE_DIRS.some((dir) => isInside(target, path.join(ctx.home, dir)))) {
      return allow("edit inside memory/, tmp/ or artifacts/");
    }
    return deny("edits are limited to memory/, tmp/ and artifacts/; change state through aq.mjs");
  }

  if (name === "Bash") return decideBash(toolInput.command, ctx);
  if (name === "Monitor") {
    const watch = `node ${path.join(ctx.skillDir, "scripts", "gate.mjs")} watch`;
    if (!toolInput.ws && String(toolInput.command || "").trim() === watch) return allow("gate watch");
    return deny("Monitor may only run `node <skill>/scripts/gate.mjs watch`");
  }
  if (name === "Skill") {
    return toolInput.skill === "ask-queue" ? allow("ask-queue skill") : deny("only the ask-queue skill");
  }
  if (name.startsWith("mcp__")) return decideMcp(name, toolInput, ctx);
  return deny(`${name} is not needed by ask-queue`);
}

function log(home, input, result) {
  try {
    const line = [new Date().toISOString(), result.decision, input?.tool_name, result.reason].join("\t");
    fs.appendFileSync(path.join(home, "logs", "guard.log"), `${line}\n`);
  } catch {
    // logging is best-effort
  }
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const [home, flag, workerId] = process.argv.slice(2);
    if (!home || (flag && flag !== "--worker")) throw new Error("usage: guard.mjs <ASK_QUEUE_HOME> [--worker AQ-n]");
    const input = JSON.parse(fs.readFileSync(0, "utf8"));
    if (input.hook_event_name && input.hook_event_name !== "PreToolUse") process.exit(0);
    const result = decide(input, makeContext(home, flag ? workerId : undefined));
    log(home, input, result);
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: result.decision,
          permissionDecisionReason: `ask-queue guard: ${result.reason}`,
        },
      }),
    );
  } catch (err) {
    // Fail closed: exit 2 blocks the call unconditionally.
    process.stderr.write(`ask-queue guard error, blocking call: ${err.message}\n`);
    process.exit(2);
  }
}
