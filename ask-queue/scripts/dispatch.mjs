#!/usr/bin/env node
// Starts and supervises background workers. No model, so no tokens; run.sh calls `tick` after
// every replies check.
//
//   dispatch.mjs tick        clean up dead workers, start `ready` items up to workers.max
//   dispatch.mjs exec AQ-n   internal: supervise one worker run (tick spawns it detached)
//   dispatch.mjs status      running and queued work (same as aq.mjs jobs)
//
// Every card has one Claude session for its whole life: the first run (--session-id) preps the ask
// and posts the card; every reply in the card thread, and the work after "go", resumes it (--resume).
// A session is `claude -p` with the fail-closed worker guard (guard.mjs --worker), always started in
// <home>/jobs/AQ-n/work (resume needs the same folder). Code work gets a git worktree on branch
// aq/AQ-n-… at work/repo. Card runs (kind card) and work runs (kind work) have separate limits.

import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AFTER_CLOSE_WATCH_MS,
  CARD_BRIEF,
  SKILL_DIR,
  TRANSITIONS,
  createStore,
  enteredStatusAt,
  headlessSettings,
  listJobs,
  resolveHome,
  updateItem,
  workerConfig,
} from "./aq.mjs";

const POLL_MS = Number(process.env.ASK_QUEUE_POLL_MS) || 5000;
const KILL_GRACE_MS = 10_000;
// A worker that set `working` this recently may not have recorded its pid yet.
const START_GRACE_MS = 60_000;

// A prep run that ends without a posted card is retried this many times in all.
const PREP_ATTEMPTS = 3;
// Resting statuses a card run may leave the item in (ready/working are dispatch states).
const RESTING = ["new", "asking", "approving", "drafted", "scoping", "review", "done", "filtered", "skipped"];

const today = (now) => now.toISOString().slice(0, 10);

// Outside the job folder, so a session can't rewrite its own guard settings or its post marker.
export const settingsFile = (home, id) => path.join(home, "jobs", ".settings", `${id}.json`);
export const cardPostMarker = (home, id) => path.join(home, "jobs", ".cardposts", id);

// Per-run limits and model for the session's current kind.
export function runLimits(config, kind) {
  return kind === "work"
    ? { model: config.model, effort: config.effort, budgetUsd: config.maxBudgetUsd, timeLimitMin: config.timeLimitMin }
    : { model: config.cardModel, effort: config.cardEffort, budgetUsd: config.cardBudgetUsd, timeLimitMin: config.cardTimeLimitMin };
}

function patchJob(store, id, job, { status, note } = {}) {
  return updateItem(store, id, { patch: { job }, status, note, internal: true });
}

function withLock(home, fn) {
  const lock = path.join(home, ".dispatch.lock");
  try {
    fs.mkdirSync(lock);
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    if (Date.now() - fs.statSync(lock).mtimeMs < 120_000) return { skipped: "another dispatch is running" };
    fs.rmSync(lock, { recursive: true, force: true });
    fs.mkdirSync(lock);
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

// The pid is ours only if that process is still this item's supervisor (pids get reused).
export function supervisorAlive(pid, id) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    const args = execFileSync("ps", ["-o", "args=", "-p", String(pid)], { encoding: "utf8" });
    return args.includes("dispatch.mjs") && new RegExp(`\\bexec ${id}\\b`).test(args);
  } catch {
    return false;
  }
}

function readCounter(home, now) {
  try {
    const counter = JSON.parse(fs.readFileSync(path.join(home, "workers.json"), "utf8"));
    if (counter.day === today(now)) return counter;
  } catch {
    // first run today
  }
  return { day: today(now), runs: 0 };
}

function bumpCounter(home, now) {
  const counter = readCounter(home, now);
  counter.runs += 1;
  fs.writeFileSync(path.join(home, "workers.json"), `${JSON.stringify(counter)}\n`);
}

function slug(text) {
  return String(text || "work")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "work";
}

// Job folder + workspace. The session always runs in work/ (resume finds sessions by folder).
// A repo gets a worktree at work/repo on a new local branch; nothing is ever pushed.
export function prepareWorkspace(home, item) {
  const jobDir = path.join(home, "jobs", item.id);
  const workDir = path.join(jobDir, "work");
  fs.mkdirSync(workDir, { recursive: true });
  const job = { dir: jobDir, workDir };
  const repoDir = path.join(workDir, "repo");
  if (item.job.repo && !fs.existsSync(repoDir)) {
    const repo = path.resolve(item.job.repo);
    const branch = `aq/${item.id}-${slug(item.title)}`;
    const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: "pipe" });
    git("rev-parse", "--git-dir");
    let exists = true;
    try {
      git("rev-parse", "--verify", "--quiet", `refs/heads/${branch}`);
    } catch {
      exists = false;
    }
    if (exists) git("worktree", "add", repoDir, branch);
    else git("worktree", "add", "-b", branch, repoDir, item.job.base || "HEAD");
    job.branch = branch;
    job.repoDir = repoDir;
  }
  fs.writeFileSync(path.join(jobDir, "brief.md"), `# ${item.id}: ${item.title}\n\n${item.job.brief}\n`);
  const settings = settingsFile(home, item.id);
  fs.mkdirSync(path.dirname(settings), { recursive: true });
  fs.writeFileSync(settings, `${JSON.stringify(headlessSettings(home, item.id), null, 2)}\n`);
  return job;
}

// New asks get their card session: queued to prep the ask and post its card.
function queuePreps(store, now) {
  const queued = [];
  for (const item of store.allItems().filter((i) => i.status === "new")) {
    const patch = {
      job: { kind: "card", brief: item.job?.brief || CARD_BRIEF, restingStatus: "new" },
    };
    // An item brought back from the filtered digest still points at the digest thread: it needs its own card.
    if (item.card) {
      patch.previousCard = item.card;
      patch.card = null;
      fs.rmSync(cardPostMarker(store.paths.home, item.id), { force: true });
    }
    updateItem(store, item.id, { patch, status: "ready", note: "queued for its card session", internal: true }, () => now);
    queued.push(item.id);
  }
  return queued;
}

// Closed cards keep their session for 48 hours (follow-ups resume it). After that, a reopened card
// starts a fresh session.
function expireSessions(store, now) {
  const expired = [];
  for (const item of store.allItems()) {
    if (!["done", "skipped", "filtered"].includes(item.status)) continue;
    if (!item.job?.sessionId || item.job.sessionExpired) continue;
    if (now - Date.parse(enteredStatusAt(item)) < AFTER_CLOSE_WATCH_MS) continue;
    patchJob(store, item.id, { sessionExpired: now.toISOString(), previousSessionId: item.job.sessionId, sessionId: null, sessionStarted: false });
    expired.push(item.id);
  }
  return expired;
}

export function tick({ home = resolveHome(), clock, spawnSupervisor = defaultSpawn, alive = supervisorAlive } = {}) {
  return withLock(home, () => {
    const store = createStore(home);
    const now = clock ? clock() : new Date();
    const config = workerConfig(store);
    const result = { reaped: [], started: [], waiting: [], failed: [], prepQueued: [], expired: [] };

    for (const item of store.allItems().filter((i) => i.status === "working")) {
      const job = item.job || {};
      if (alive(job.pid, item.id)) continue;
      if (!job.pid && now - Date.parse(job.startedAt || 0) < START_GRACE_MS) continue;
      const back = endStatus(item);
      if (back === "new") fs.rmSync(cardPostMarker(home, item.id), { force: true });
      patchJob(store, item.id, { pid: null, endedAt: now.toISOString(), notice: "The session stopped unexpectedly (machine restart or crash). Say *continue* to resume it." }, { status: back, note: "worker gone" });
      result.reaped.push(item.id);
    }
    result.expired = expireSessions(store, now);
    result.prepQueued = queuePreps(store, now);

    let running = store.allItems().filter((i) => i.status === "working").length;
    let { runs } = readCounter(home, now);
    for (const { id } of listJobs(store).queued) {
      if (running >= config.max) {
        result.waiting.push(id);
        continue;
      }
      const item = store.getItem(id);
      if (runs >= config.dailyRuns) {
        if (item.job.capNotice !== today(now)) {
          patchJob(store, id, { capNotice: today(now), notice: `Today's session limit (${config.dailyRuns} runs) is used up. It starts tomorrow.` });
        }
        result.waiting.push(id);
        continue;
      }
      try {
        const workspace = prepareWorkspace(home, item);
        patchJob(
          store,
          id,
          { ...workspace, kind: item.job.kind || "card", sessionId: item.job.sessionId || randomUUID(), startedAt: now.toISOString(), pid: null, runs: (item.job.runs || 0) + 1 },
          { status: "working", note: "worker starting" },
        );
        spawnSupervisor(home, id);
        bumpCounter(home, now);
        runs += 1;
        running += 1;
        result.started.push(id);
      } catch (err) {
        const reason = String(err.stderr || err.message).trim().split("\n")[0].slice(0, 200);
        const back = item.job.restingStatus && TRANSITIONS.ready.includes(item.job.restingStatus) ? item.job.restingStatus : "scoping";
        patchJob(store, id, { notice: `Couldn't start the session: ${reason}` }, { status: back, note: "start failed" });
        result.failed.push(id);
      }
    }
    return result;
  });
}

function defaultSpawn(home, id) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "exec", id], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ASK_QUEUE_HOME: home },
  });
  child.unref();
}

export function workerPrompt(home, item, config) {
  const aq = path.join(SKILL_DIR, "scripts", "aq.mjs");
  const job = item.job;
  const selfDm = config.slack?.selfDmId;
  const head = `You are the ask-queue card session for ${item.id}: "${item.title}". This is unattended: nobody answers in this chat. The user talks to you only through the card thread.`;
  const post = item.card?.ts
    ? `Card thread for every message (post only there, each starting with "🤖" and naming ${item.id}, formatted per references/cards.md): channel ${item.card.channelId}, thread_ts ${item.card.ts}`
    : `No card yet: post the card as ONE top-level message to channel ${selfDm} (no thread_ts), then record it with update (card.channelId, card.ts, card.lastSeenTs). After that, post only in its thread.`;
  const where = `Job folder (the only place you may edit files or run commands; write --file inputs here): ${job.workDir}${
    job.repoDir ? `\nCode: the git worktree at ${job.repoDir}, branch ${job.branch}` : ""
  }
${post}
State CLI: node ${aq}   (your item: get ${item.id}; you may update only ${item.id})
Skill: ${SKILL_DIR}`;
  const replies = job.lastFollowUp ? `\nThe user's new messages in the card thread:\n${job.lastFollowUp}\n` : "";
  const intro = job.sessionStarted ? "" : `Read ${SKILL_DIR}/SKILL.md and ${SKILL_DIR}/references/card-session.md first.\n`;

  if (job.kind === "work") {
    if (!job.workStarted) {
      return `${head}
${intro}The user said go. Do the work in the agreed brief (${job.dir}/brief.md) under the worker rules in ${SKILL_DIR}/references/work.md section 5.${replies}
${where}`;
    }
    return `${head}
${intro}${replies || "\n(no new text: continue where you left off)\n"}
Continue under the worker rules in ${SKILL_DIR}/references/work.md section 5.
${where}`;
  }
  if (!item.card?.ts) {
    return `${head}
${intro}Prep this ask and post its card (card-session.md section 1).${replies ? `\nNews that arrived before the card was posted:${replies}` : ""}
${where}`;
  }
  if (!job.sessionStarted) {
    return `${head}
${intro}This card was posted before it had its own session: \`get ${item.id}\` for its history, then handle the reply (card-session.md section 2).${replies}
${where}`;
  }
  return `${head}
${replies || "\n(no new text: continue where you left off)\n"}
Handle it under ${SKILL_DIR}/references/card-session.md section 2.
${where}`;
}

// Where a run that ended without setting a status leaves the item.
function endStatus(item) {
  const job = item.job || {};
  if (job.kind === "work") return "review";
  if (!item.card?.ts) return "new";
  const back = job.restingStatus;
  return back && RESTING.includes(back) && back !== "new" ? back : "review";
}

// Supervises one run: starts claude, enforces stop and the time limit, records how it ended.
export async function execJob(id, { home = resolveHome(), claudeBin = process.env.ASK_QUEUE_CLAUDE_BIN || "claude" } = {}) {
  const store = createStore(home);
  const config = workerConfig(store);
  let item = store.getItem(id);
  if (item.status !== "working") return { skipped: `${id} is ${item.status}` };
  const followUp = item.job.followUp || null;
  item = patchJob(store, id, { pid: process.pid, followUp: null, lastFollowUp: followUp });
  const kind = item.job.kind || "card";
  const limits = runLimits(config, kind);
  const prompt = workerPrompt(home, item, store.config());
  if (kind === "work" && !item.job.workStarted) patchJob(store, id, { workStarted: new Date().toISOString() });

  const args = [
    "-p",
    prompt,
    "--model",
    limits.model,
    ...(limits.effort ? ["--effort", limits.effort] : []),
    "--permission-mode",
    "dontAsk",
    "--settings",
    settingsFile(home, id),
    "--add-dir",
    SKILL_DIR,
    "--disallowedTools",
    "WebFetch",
    "WebSearch",
    "--max-budget-usd",
    String(limits.budgetUsd),
    "--output-format",
    "text",
    ...(item.job.sessionStarted ? ["--resume", item.job.sessionId] : ["--session-id", item.job.sessionId]),
  ];
  const log = fs.openSync(path.join(item.job.dir, "log.txt"), "a");
  fs.writeSync(log, `=== ${new Date().toISOString()} run ${item.job.runs} ${kind} ${item.job.sessionStarted ? "resume" : "start"} session ${item.job.sessionId}\n`);
  const child = spawn(claudeBin, args, {
    cwd: item.job.workDir,
    detached: true,
    stdio: ["ignore", log, log],
    env: { ...process.env, ASK_QUEUE_HOME: home, ASK_QUEUE_JOB: id },
  });
  patchJob(store, id, { sessionStarted: true });

  let reason = null;
  const killGroup = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch {
      // already gone
    }
  };
  const limitMs = limits.timeLimitMin * 60 * 1000;
  const started = Date.now();
  const timer = setInterval(() => {
    if (reason) return;
    let stop = false;
    try {
      stop = Boolean(store.getItem(id).job?.stopRequested);
    } catch {
      // unreadable for a moment: check again next poll
    }
    if (stop) reason = "stopped";
    else if (Date.now() - started > limitMs) reason = "timeout";
    if (reason) {
      killGroup("SIGTERM");
      setTimeout(() => killGroup("SIGKILL"), KILL_GRACE_MS).unref();
    }
  }, POLL_MS);

  const code = await new Promise((resolve) => {
    child.on("error", () => resolve(127));
    child.on("exit", (exitCode, signal) => resolve(exitCode ?? (signal ? 128 : 1)));
  });
  clearInterval(timer);
  fs.writeSync(log, `=== ${new Date().toISOString()} exit ${code}${reason ? ` (${reason})` : ""}\n`);
  fs.closeSync(log);

  return finishRun(store, id, { code, reason, limits, home });
}

// Records how a run ended. A run normally ends by setting the card's next status itself.
export function finishRun(store, id, { code, reason, limits, home }) {
  const fresh = store.getItem(id);
  const job = { pid: null, endedAt: new Date().toISOString(), exitCode: code, stopRequested: null };
  if (fresh.status !== "working") {
    // A reply that came in during the run resumes the session right away.
    if (fresh.status !== "ready" && fresh.job.followUp && reason !== "stopped" && TRANSITIONS[fresh.status]?.includes("ready")) {
      return patchJob(store, id, { ...job, restingStatus: fresh.status }, { status: "ready", note: "follow-up arrived during the run" });
    }
    return patchJob(store, id, job);
  }
  const back = endStatus(fresh);
  if (back === "new") {
    // The prep run posted no card. The guard's one-post marker is cleared so a retry can post.
    fs.rmSync(cardPostMarker(home, id), { force: true });
    const attempts = (fresh.job.prepAttempts || 0) + 1;
    if (attempts < PREP_ATTEMPTS) {
      return patchJob(store, id, { ...job, prepAttempts: attempts }, { status: "new", note: `prep run ended without a card (try ${attempts})` });
    }
    return patchJob(
      store,
      id,
      { ...job, prepAttempts: attempts, notice: `Couldn't prep this ask after ${attempts} tries. Log: jobs/${id}/log.txt.` },
      { status: "review", note: "prep failed" },
    );
  }
  const notices = {
    stopped: "Stopped. Say *continue* to pick it up again, or drop it.",
    timeout: `Stopped at the ${limits.timeLimitMin}-minute limit. Say *continue* to keep going.`,
  };
  job.notice =
    notices[reason] ||
    (code === 0
      ? "The session ended without posting a result. Say *continue* to retry."
      : `The session failed (exit ${code}) before reporting. Log: jobs/${id}/log.txt. Say *continue* to retry.`);
  return patchJob(store, id, job, { status: back, note: `session ended: ${reason || `exit ${code}`}` });
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [command, id] = process.argv.slice(2);
  try {
    let result;
    if (command === "tick") result = tick();
    else if (command === "exec" && /^AQ-\d+$/.test(id || "")) result = await execJob(id);
    else if (command === "status") result = listJobs(createStore(resolveHome()));
    else {
      process.stderr.write("usage: dispatch.mjs tick | status | exec <AQ-n>\n");
      process.exit(64);
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (err) {
    process.stderr.write(`${JSON.stringify({ error: err.message })}\n`);
    process.exit(1);
  }
}
