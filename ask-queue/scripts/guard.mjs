#!/usr/bin/env node
// PreToolUse policy for headless ask-queue runs. Fail-closed: a call is allowed only when a rule
// below allows it; everything else is denied, so the run can read and draft but never send.
// Wired by `aq.mjs settings` as: node guard.mjs <ASK_QUEUE_HOME>   (hook JSON arrives on stdin)
//
// Worker profile (`node guard.mjs <home> --worker AQ-n`, for dispatch.mjs card sessions). Still
// fail-closed: edits and commands inside the session's job folder (<home>/jobs/AQ-n), plus
// memory/*.md; aq.mjs may change only its own item; Slack posts only in its own card thread, except
// one top-level post of the card itself while the item has no card; nothing is ever sent (drafts
// only). Repo files (config.repoEdit.roots): read and searched freely except secrets; edited only
// when the user allowed that exact file (job.repoWrites, see aq.mjs).
// Anything else that isn't a hard rule (a skill, a subagent, a write tool, a network or push command,
// a read or edit elsewhere) needs the user's OK, once per kind per card: the call is denied, the kind
// is recorded (job.permProposed) and the session asks in its card thread. A yes allows it (job.perms).
// Never allowed, OK or not: secrets and tokens, the guard's own settings, ask-queue state outside
// aq.mjs, sudo and crontab.
//
// The same command is the worker's UserPromptSubmit hook: a prompt the user types into the session
// (anything that isn't dispatch.mjs's prompt) may allow repo edits, like a card-thread reply.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SECRET_FILE, createStore, grantRepoEdits, proposePerms, realTarget, repoRoots } from "./aq.mjs";

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

function loadItem(home, workerId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(home, "items", `${workerId}.json`), "utf8"));
  } catch {
    return {};
  }
}

export function makeContext(home, workerId) {
  if (workerId !== undefined && !/^AQ-\d+$/.test(String(workerId))) throw new Error(`invalid worker id: ${workerId}`);
  const resolved = path.resolve(home);
  // Set when the card's one top-level post is allowed. Outside the job folder, so the session can't
  // clear it; dispatch.mjs clears it when a prep run is retried.
  const marker = workerId ? path.join(resolved, "jobs", ".cardposts", workerId) : null;
  const item = workerId ? loadItem(home, workerId) : {};
  const config = loadConfig(home);
  return {
    home: resolved,
    skillDir: SKILL_DIR,
    config,
    draftRefs: () => loadDraftRefs(home),
    workerId: workerId || null,
    jobDir: workerId ? path.join(resolved, "jobs", workerId) : null,
    card: item.card || null,
    repoRoots: repoRoots(config),
    repoWrites: Array.isArray(item.job?.repoWrites) ? item.job.repoWrites : [],
    perms: Array.isArray(item.job?.perms) ? item.job.perms : [],
    proposePerms: (kinds) => proposePerms(createStore(resolved), workerId, kinds),
    cardPosted: () => Boolean(marker) && fs.existsSync(marker),
    markCardPosted: () => {
      fs.mkdirSync(path.dirname(marker), { recursive: true });
      fs.writeFileSync(marker, `${new Date().toISOString()}\n`);
    },
  };
}

const BOT_LEAD = /^(🤖|:robot_face:)/u;

const allow = (reason) => ({ decision: "allow", reason });
const deny = (reason) => ({ decision: "deny", reason });

// Text filters an aq.mjs read may be piped into (no paths, no redirects): `aq list | jq ...`.
const PIPE_FILTER = /^(jq|head|tail|grep|wc|sort|uniq|cut|tr)(\s+[^/]*)?$/;

function decideBash(command, ctx) {
  const cmd = String(command || "").trim();
  const [first, ...filters] = cmd.split("|").map((part) => part.trim());
  if (filters.length && !/[;&`$<>\\\n\r]/.test(cmd) && filters.every((f) => PIPE_FILTER.test(f))) {
    const verdict = decideBash(first, ctx);
    return verdict.decision === "allow" ? allow("aq.mjs piped into a text filter") : verdict;
  }
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
  // The gate tells the user's messages from ours by the 🤖 lead, and the user's replies can allow repo
  // edits, so every post a guarded run makes must carry it.
  if (server.includes("slack") && tool === "slack_send_message" && !BOT_LEAD.test(String(input?.message ?? input?.text ?? ""))) {
    return deny("every message starts with 🤖 (references/cards.md)");
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

  // Sending stays the user's job, OK or not.
  if (SEND_TOOLS.test(tool)) return deny("sending is blocked: ask-queue only drafts");
  const words = toolWords(tool);
  const writeWord = words.find((word) => WRITE_WORDS.has(word));
  if (writeWord) return { ...deny(`write tool (${writeWord}) is blocked: ask-queue only drafts`), askable: true };
  if (words.some((word) => READ_WORDS.has(word))) return allow("read-only tool");
  return { ...deny("tool is not recognized as read-only"), askable: true };
}
const SEND_TOOLS = /^(send_message|send_email|reply|reply_all|forward|slack_send_message|slack_schedule_message)$/;

// Programs that reach other machines, install, publish or detach: each needs the user's OK.
const ASK_PROGRAMS = "curl|wget|ssh|scp|sftp|rsync|nc|ncat|telnet|ftp|gh|glab|npx|pip|pip3|npm|yarn|pnpm|uvx|docker|nohup|disown|setsid";
const ASK_PROGRAM = new RegExp(`(^|[\\s;&|(\`])(${ASK_PROGRAMS})(?=\\s|$|[;&|)])`, "g");
// Never, with or without an OK.
const NEVER_PROGRAM = /(^|[\s;&|(`])(sudo|su|crontab)(?=\s|$|[;&|)])/;
const GIT_ASK = /\bgit\b[^\n;&|]*?\b(push|remote|config|credential|clone|fetch|pull|submodule)\b/g;
// databricks CLI reads are free; anything that looks like it changes the workspace asks first.
const DBX_WRITE = /\b(insert|update|delete|drop|create|merge|alter|truncate|grant|revoke|replace|run-now|submit|deploy|destroy|reset|set-permissions|import|upload|cp|mv|rm|mkdir|restart|start|stop|cancel)\b/i;
// Secrets, tokens and the settings that wire this guard: closed to every command and every OK.
const PROTECTED = /(slack-token|\.slack\/|\.config\/ask-queue|\.claude\.json|\.claude\/settings|settings(\.local)?\.json|\.ssh\/|\.aws\/|\.netrc|\.git-credentials|\.databrickscfg|credentials|\.databricks-|(^|[\s/'"=])\.env\b)/i;

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

// Folders no OK opens: ask-queue state (items, config, other jobs, the guard's settings), changed only
// through aq.mjs, and the skill itself. The job folder and memory/ are fine.
function controlled(target, ctx) {
  if (isInside(target, ctx.jobDir) || isInside(target, path.join(ctx.home, "memory"))) return false;
  return isInside(target, ctx.home) || isInside(target, ctx.skillDir);
}

// Denies and records the kinds the user hasn't OK'd yet; allows once they all are.
function needOk(kinds, why, ctx) {
  const unique = [...new Set(kinds)];
  const missing = unique.filter((kind) => !ctx.perms?.includes(kind));
  if (!missing.length) return allow(`the user OK'd ${unique.join(", ")}`);
  try {
    ctx.proposePerms?.(missing);
  } catch {
    // not recorded: the session's ask still reaches the user, who can OK it by typing into the session
  }
  return deny(
    `${why}. This needs the user's OK (${missing.join(", ")}), now recorded. Ask in your card thread ` +
      `(card-session.md "Asking for an OK"), then end this run with the card's resting status: their yes resumes you.`,
  );
}

function decideWorkerBash(command, cwd, ctx, background) {
  const cmd = String(command || "").trim();
  if (!cmd) return deny("empty command");
  if (/\baq\.mjs\b/.test(cmd)) {
    const verdict = decideWorkerAq(cmd, ctx);
    if (verdict.decision === "deny") return verdict;
  }
  if (NEVER_PROGRAM.test(cmd)) return deny("sudo, su and crontab are never allowed");
  if (PROTECTED.test(cmd)) return deny("secrets, tokens and the guard's settings stay closed");
  const here = path.resolve(cwd);
  if (controlled(here, ctx)) return deny("commands never run in ask-queue's own folders; use aq.mjs");

  const kinds = [];
  const program = (segment) => {
    const words = segment.trim().split(/\s+/).filter((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w));
    return path.basename((words[0] || "sh").replace(/^[('"]+/, "")) || "sh";
  };
  if (background) kinds.push("cmd:background");
  for (const m of cmd.matchAll(ASK_PROGRAM)) kinds.push(`cmd:${m[2]}`);
  for (const m of cmd.matchAll(GIT_ASK)) kinds.push(`cmd:git ${m[1]}`);

  const aq = path.join(ctx.skillDir, "scripts", "aq.mjs");
  const outside = !isInside(here, ctx.jobDir);
  for (const segment of cmd.replace(/\d*>&\d+/g, " ").split(/\|\||&&|[|;&\n]/)) {
    if (!segment.trim()) continue;
    const prog = program(segment);
    if (prog === "databricks" && DBX_WRITE.test(segment)) kinds.push("cmd:databricks-write");
    let away = outside;
    if (/\$\{?(HOME|USER|XDG_[A-Z_]+|ASK_QUEUE_[A-Z_]+|PWD|OLDPWD)\b|(^|[\s=:'"(])~|(^|\s)cd\s*$|\bcd\s+-/.test(segment)) away = true;
    for (const word of segment.split(/[\s;&|()<>`"'=]+/).filter(Boolean)) {
      const raw = word.replace(/^~(?=\/|$)/, os.homedir());
      const pathy = raw.startsWith("/") || raw.split("/").includes("..");
      if (!pathy || (prog === "databricks" && word.startsWith("/api/"))) continue;
      const target = path.resolve(here, raw);
      if (target === aq || target === "/dev/null") continue;
      if (controlled(target, ctx)) return deny(`${word} is ask-queue's own state or the skill; use aq.mjs`);
      if (!isInside(target, ctx.jobDir) && !isInside(target, path.join(ctx.home, "memory"))) away = true;
    }
    if (away) kinds.push(`cmd:${prog}`);
  }
  if (!kinds.length) return allow("command inside the job folder");
  return needOk(kinds, "this command reaches past the job folder", ctx);
}

function decideWorker(name, toolInput, input, ctx) {
  const cwd = input.cwd || ctx.jobDir;
  if (LOCAL_TOOLS.has(name)) return allow("session bookkeeping");
  if (name in READ_TOOLS) {
    const raw = toolInput[READ_TOOLS[name]];
    const target = path.resolve(cwd, typeof raw === "string" && raw ? raw : ".");
    const memory = path.join(ctx.home, "memory");
    if ([ctx.jobDir, memory, ctx.skillDir].some((dir) => isInside(target, dir))) return allow("read inside the job");
    if (SECRET_FILE.test(target) || SECRET_FILE.test(realTarget(target)) || PROTECTED.test(realTarget(target))) {
      return deny("secret files stay closed");
    }
    if (ctx.repoRoots.some((root) => isInside(realTarget(target), realTarget(root)))) return allow("read inside a repo root");
    if (controlled(realTarget(target), ctx)) return deny("ask-queue state is read through aq.mjs");
    return needOk(["read:anywhere"], "workers read their job folder, memory/, the skill and the repo roots on their own", ctx);
  }
  if (name in WRITE_TOOLS) {
    const raw = toolInput[WRITE_TOOLS[name]];
    if (typeof raw !== "string" || !raw) return deny("missing file path");
    const target = path.resolve(cwd, raw);
    if (isInside(target, ctx.jobDir)) return allow("edit inside the job folder");
    // Card sessions learn on close (learn.md): the memory notes, and nothing else outside the job.
    if (path.dirname(target) === path.join(ctx.home, "memory") && target.endsWith(".md")) return allow("memory note");
    // A repo file the user allowed by name or by a yes (aq.mjs repoGrantPatch).
    if (ctx.repoWrites.includes(realTarget(target)) && !SECRET_FILE.test(realTarget(target))) return allow("repo file the user allowed");
    const real = realTarget(target);
    const repo = ctx.repoRoots.some((root) => isInside(real, realTarget(root)));
    if (repo || SECRET_FILE.test(real) || PROTECTED.test(real) || controlled(real, ctx)) {
      return deny(
        "workers edit only inside their job folder, memory/*.md and repo files the user allowed: propose the file " +
          "(job.repoProposed) and ask the user to reply yes (references/card-session.md)",
      );
    }
    return needOk(["write:anywhere"], "this edit is outside the job folder and the repos", ctx);
  }
  if (name === "Bash") return decideWorkerBash(toolInput.command, cwd, ctx, Boolean(toolInput.run_in_background));
  if (name.startsWith("mcp__")) {
    const verdict = decideMcp(name, toolInput, ctx);
    if (verdict.decision === "deny" && verdict.askable) {
      return needOk([`mcp:${splitMcpName(name)?.tool || name}`.slice(0, 84)], verdict.reason, ctx);
    }
    return verdict;
  }
  if (name === "Skill") return needOk([`skill:${String(toolInput.skill || "unknown").slice(0, 80)}`], "skills need the user's OK", ctx);
  if (["WebFetch", "WebSearch"].includes(name)) return deny(`${name} is off for card sessions`);
  return needOk([`tool:${name}`.slice(0, 85)], `${name} isn't one of the session's own tools`, ctx);
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

// Every dispatch.mjs prompt starts with this; anything else was typed by the user into the session.
export const DISPATCH_PROMPT = /^You are the ask-queue card session for AQ-\d+:/;

// UserPromptSubmit: the user's typed text may allow repo edits. Never blocks the prompt; on any error
// nothing is allowed.
export function promptHook(home, workerId, input) {
  try {
    const prompt = String(input?.prompt || "");
    if (!prompt.trim() || DISPATCH_PROMPT.test(prompt.trimStart())) return [];
    const granted = grantRepoEdits(createStore(path.resolve(home)), workerId, [prompt]);
    log(home, { tool_name: "UserPromptSubmit" }, { decision: "grant", reason: granted.join(", ") || "none" });
    if (granted.length) process.stdout.write(`ask-queue: the user allowed edits to ${granted.join(", ")}\n`);
    return granted;
  } catch (err) {
    log(home, { tool_name: "UserPromptSubmit" }, { decision: "error", reason: err.message });
    return [];
  }
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const [home, flag, workerId] = process.argv.slice(2);
    if (!home || (flag && flag !== "--worker")) throw new Error("usage: guard.mjs <ASK_QUEUE_HOME> [--worker AQ-n]");
    const input = JSON.parse(fs.readFileSync(0, "utf8"));
    if (input.hook_event_name === "UserPromptSubmit") {
      if (flag) promptHook(home, workerId, input);
      process.exit(0);
    }
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
