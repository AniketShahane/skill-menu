#!/usr/bin/env node
// Starts and supervises background workers. No model, so no tokens; run.sh calls `tick` after
// every replies check.
//
//   dispatch.mjs tick        clean up dead workers, start `ready` items up to workers.max
//   dispatch.mjs exec AQ-n   internal: supervise one worker run (tick spawns it detached)
//   dispatch.mjs status      running and queued work (same as aq.mjs jobs)
//
// A worker is `claude -p` with the fail-closed worker guard (guard.mjs --worker), working in
// <home>/jobs/AQ-n/work: a git worktree on branch aq/AQ-n when job.repo is set, else a plain
// folder. Each item keeps one Claude session: the first run uses --session-id, follow-ups --resume.

import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SKILL_DIR, createStore, headlessSettings, listJobs, resolveHome, updateItem, workerConfig } from "./aq.mjs";

const POLL_MS = Number(process.env.ASK_QUEUE_POLL_MS) || 5000;
const KILL_GRACE_MS = 10_000;
// A worker that set `working` this recently may not have recorded its pid yet.
const START_GRACE_MS = 60_000;

const today = (now) => now.toISOString().slice(0, 10);

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

// Job folder + workspace. A repo gets a worktree on a new local branch; nothing is ever pushed.
export function prepareWorkspace(home, item) {
  const jobDir = path.join(home, "jobs", item.id);
  const workDir = path.join(jobDir, "work");
  fs.mkdirSync(jobDir, { recursive: true });
  const job = { dir: jobDir, workDir };
  if (item.job.repo && !fs.existsSync(workDir)) {
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
    if (exists) git("worktree", "add", workDir, branch);
    else git("worktree", "add", "-b", branch, workDir, item.job.base || "HEAD");
    job.branch = branch;
  }
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(path.join(jobDir, "brief.md"), `# ${item.id}: ${item.title}\n\n${item.job.brief}\n`);
  fs.writeFileSync(path.join(jobDir, "settings.json"), `${JSON.stringify(headlessSettings(home, item.id), null, 2)}\n`);
  return job;
}

export function tick({ home = resolveHome(), clock, spawnSupervisor = defaultSpawn, alive = supervisorAlive } = {}) {
  return withLock(home, () => {
    const store = createStore(home);
    const now = clock ? clock() : new Date();
    const config = workerConfig(store);
    const result = { reaped: [], started: [], waiting: [], failed: [] };

    for (const item of store.allItems().filter((i) => i.status === "working")) {
      const job = item.job || {};
      if (alive(job.pid, item.id)) continue;
      if (!job.pid && now - Date.parse(job.startedAt || 0) < START_GRACE_MS) continue;
      patchJob(store, item.id, { pid: null, endedAt: now.toISOString(), notice: "The worker stopped unexpectedly (machine restart or crash). Say *continue* to resume it." }, { status: "review", note: "worker gone" });
      result.reaped.push(item.id);
    }

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
          patchJob(store, id, { capNotice: today(now), notice: `Today's worker limit (${config.dailyRuns} runs) is used up. It starts tomorrow.` });
        }
        result.waiting.push(id);
        continue;
      }
      try {
        const workspace = prepareWorkspace(home, item);
        patchJob(
          store,
          id,
          { ...workspace, sessionId: item.job.sessionId || randomUUID(), startedAt: now.toISOString(), pid: null, runs: (item.job.runs || 0) + 1 },
          { status: "working", note: "worker starting" },
        );
        spawnSupervisor(home, id);
        bumpCounter(home, now);
        runs += 1;
        running += 1;
        result.started.push(id);
      } catch (err) {
        const reason = String(err.stderr || err.message).trim().split("\n")[0].slice(0, 200);
        patchJob(store, id, { notice: `Couldn't start the worker: ${reason}` }, { status: "scoping", note: "start failed" });
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

function workerPrompt(home, item, config) {
  const aq = path.join(SKILL_DIR, "scripts", "aq.mjs");
  const job = item.job;
  const thread = `channel ${item.card?.channelId || config.slack?.selfDmId}, thread_ts ${item.card?.ts}`;
  const head = `You are an ask-queue worker for ${item.id}: "${item.title}". This is unattended: nobody answers in this chat.`;
  const where = `Job folder (the only place you may edit files or run commands): ${job.workDir}
Card thread for every message (post only there, each starting with "🤖 ${item.id}"): ${thread}
State CLI: node ${aq}   (write any --file input inside ${job.dir})`;
  if (job.sessionStarted) {
    return `${head}
The user replied in the card thread:
${job.lastFollowUp || "(no text: continue where you left off)"}

Continue under the worker rules in ${SKILL_DIR}/references/work.md.
${where}`;
  }
  return `${head}
Read ${SKILL_DIR}/references/work.md ("Worker rules") first, then the agreed brief: ${job.dir}/brief.md
${where}`;
}

// Supervises one run: starts claude, enforces stop and the time limit, records how it ended.
export async function execJob(id, { home = resolveHome(), claudeBin = process.env.ASK_QUEUE_CLAUDE_BIN || "claude" } = {}) {
  const store = createStore(home);
  const config = workerConfig(store);
  let item = store.getItem(id);
  if (item.status !== "working") return { skipped: `${id} is ${item.status}` };
  const followUp = item.job.followUp || null;
  item = patchJob(store, id, { pid: process.pid, followUp: null, lastFollowUp: followUp });

  const args = [
    "-p",
    workerPrompt(home, item, store.config()),
    "--model",
    config.model,
    "--permission-mode",
    "dontAsk",
    "--settings",
    path.join(item.job.dir, "settings.json"),
    "--add-dir",
    SKILL_DIR,
    "--disallowedTools",
    "WebFetch",
    "WebSearch",
    "--max-budget-usd",
    String(config.maxBudgetUsd),
    "--output-format",
    "text",
    ...(item.job.sessionStarted ? ["--resume", item.job.sessionId] : ["--session-id", item.job.sessionId]),
  ];
  const log = fs.openSync(path.join(item.job.dir, "log.txt"), "a");
  fs.writeSync(log, `=== ${new Date().toISOString()} run ${item.job.runs} ${item.job.sessionStarted ? "resume" : "start"}\n`);
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
  const limitMs = config.timeLimitMin * 60 * 1000;
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

  const fresh = store.getItem(id);
  const job = { pid: null, endedAt: new Date().toISOString(), exitCode: code, stopRequested: null };
  if (fresh.status !== "working") {
    // The worker reported (review). A reply that came in meanwhile resumes it right away.
    if (fresh.status === "review" && fresh.job.followUp && reason !== "stopped") {
      return patchJob(store, id, job, { status: "ready", note: "follow-up arrived during the run" });
    }
    return patchJob(store, id, job);
  }
  const notices = {
    stopped: "Stopped. Say *continue* to pick it up again, or drop it.",
    timeout: `Stopped at the ${config.timeLimitMin}-minute limit. Say *continue* to keep going.`,
  };
  job.notice =
    notices[reason] ||
    (code === 0
      ? "The worker ended without posting a result. Say *continue* to retry."
      : `The worker failed (exit ${code}) before reporting. Log: jobs/${id}/log.txt. Say *continue* to retry.`);
  return patchJob(store, id, job, { status: "review", note: `worker ended: ${reason || `exit ${code}`}` });
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
