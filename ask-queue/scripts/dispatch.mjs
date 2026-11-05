#!/usr/bin/env node
// Starts and supervises background workers. No model, so no tokens; run.sh calls `tick` after
// every replies check.
//
//   dispatch.mjs tick        clean up dead workers, start `ready` items up to workers.max
//   dispatch.mjs exec AQ-n   internal: supervise one worker run (tick spawns it detached)
//   dispatch.mjs status      running and queued work (same as aq.mjs jobs)
//   dispatch.mjs purge [days] delete what closed more than 90 days ago (tick also runs it once a day)
//
// Every card has one Claude session for its whole life: the first run preps the ask
// and posts the card; every reply in the card thread, and the work after "go", resumes it (--resume).
// A session is a background `claude --bg` named "AQ-n · <title>" (so it shows in Claude Code's agent
// view), with no permission checks (bypassPermissions; guard.mjs is off for now). Every card gets a
// git worktree of config.repo on branch aq/AQ-n-…, started from an aq-backup snapshot, at work/repo,
// and its session starts inside it (job.cwd), so it loads that repo's CLAUDE.md, skills and memory.
// Resume needs the same folder: sessions started before this keep <home>/jobs/AQ-n/work.
// Card runs (kind card) and work runs (kind work) have separate limits. A closed card keeps its
// session and worktree for records.keepDays, then records.mjs closeOut writes its record and removes the worktree.

import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARD_BRIEF,
  DIRECT_BRIEF,
  OWN_KINDS,
  REPORT_BRIEF,
  SECRET_GLOBS,
  SKILL_DIR,
  TRANSITIONS,
  addCandidate,
  addDays,
  createStore,
  enteredStatusAt,
  headlessSettings,
  homeRepo,
  listJobs,
  localParts,
  recordsConfig,
  repoRoots,
  resolveHome,
  timezoneOf,
  updateItem,
  validDay,
  workerConfig,
} from "./aq.mjs";
import { SCRATCH_DIR, closeOut } from "./records.mjs";
import { botPost, loadToken } from "./slack.mjs";

const pollMs = () => Number(process.env.ASK_QUEUE_POLL_MS) || 5000;
// A worker that set `working` this recently may not have recorded its pid yet.
const START_GRACE_MS = 60_000;

// A prep run that ends without a posted card is retried this many times in all.
const PREP_ATTEMPTS = 3;
// Resting statuses a card run may leave the item in (ready/working are dispatch states).
const RESTING = ["new", "asking", "approving", "drafted", "tracking", "scoping", "review", "done", "filtered", "skipped"];

const today = (now) => now.toISOString().slice(0, 10);

// Outside the job folder, so a session can't rewrite its own guard settings or its post marker.
export const settingsFile = (home, id) => path.join(home, "jobs", ".settings", `${id}.json`);
export const cardPostMarker = (home, id) => path.join(home, "jobs", ".cardposts", id);

// Per-run limits and model for the session's current kind. A model the user named in the card
// thread (job.model, set by aq route) wins over the default.
export function runLimits(config, kind, job = {}) {
  const limits =
    kind === "work"
      ? { model: config.model, effort: config.effort, timeLimitMin: config.timeLimitMin }
      : { model: config.cardModel, effort: config.cardEffort, timeLimitMin: config.cardTimeLimitMin };
  return job.model ? { ...limits, model: job.model } : limits;
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

// The permission mode sessions start with; a session saved with another one restarts with this.
const BG_MODE = "bypassPermissions";
export const BACKUP_BRANCH = "aq-backup";
// Kept out of backups, whatever .gitignore says: secrets, and new files too big for a git push.
const BACKUP_EXCLUDES = SECRET_GLOBS.map((glob) => `:(exclude,glob)${glob}`);
const BACKUP_MAX_NEW_FILE = 20 * 1024 * 1024;

// Saves the repo as it is right now (committed, changed and new files) as one commit on top of the
// rolling aq-backup branch, then pushes that branch to origin. Main, the index and the working tree
// are never touched. Nothing changed since the last snapshot: no new commit. A failed push is only
// logged: the next snapshot's push carries this one too. Returns the snapshot commit.
export function snapshotRepo(repo, label) {
  const git = (args, env = {}) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: "pipe", env: { ...process.env, ...env } }).trim();
  const gitDir = git(["rev-parse", "--absolute-git-dir"]);
  const index = path.join(gitDir, `aq-backup-${process.pid}.index`);
  let tree;
  try {
    // Starting from the real index makes `add` fast (unchanged files aren't re-read).
    if (fs.existsSync(path.join(gitDir, "index"))) fs.copyFileSync(path.join(gitDir, "index"), index);
    const big = git(["ls-files", "--others", "--exclude-standard", "-z"])
      .split("\0")
      .filter((file) => file && fs.statSync(path.join(repo, file), { throwIfNoEntry: false })?.size > BACKUP_MAX_NEW_FILE)
      .map((file) => `:(exclude,literal)${file}`);
    git(["add", "-A", "--", ".", ...BACKUP_EXCLUDES, ...big], { GIT_INDEX_FILE: index });
    tree = git(["write-tree"], { GIT_INDEX_FILE: index });
  } finally {
    fs.rmSync(index, { force: true });
  }
  let previous = null;
  try {
    previous = git(["rev-parse", "--verify", "--quiet", `refs/heads/${BACKUP_BRANCH}`]);
  } catch {}
  const parent = previous || git(["rev-parse", "HEAD"]);
  let sha = parent;
  if (git(["rev-parse", `${parent}^{tree}`]) !== tree) {
    sha = git(["-c", "user.name=ask-queue backup", "-c", "user.email=ask-queue@localhost", "commit-tree", tree, "-p", parent, "-m", `aq-backup: ${new Date().toISOString()} before ${label}`]);
  }
  // Compare-and-swap, so two snapshots at once can't drop one.
  git(["update-ref", `refs/heads/${BACKUP_BRANCH}`, sha, ...(previous ? [previous] : [])]);
  let pushed = true;
  try {
    execFileSync("git", ["-C", repo, "push", "--quiet", "origin", `refs/heads/${BACKUP_BRANCH}:refs/heads/${BACKUP_BRANCH}`], {
      stdio: "pipe",
      timeout: 60_000,
    });
  } catch {
    pushed = false;
  }
  return { sha, pushed };
}

// Job folder + workspace. Every card gets a worktree of the repo (job.repo, else config.repo) at
// work/repo, on a new local branch started from a fresh aq-backup snapshot; only aq-backup is ever
// pushed. A worktree removed at close is rebuilt from its branch when the card runs again.
export function prepareWorkspace(home, item, config = {}) {
  const jobDir = path.join(home, "jobs", item.id);
  const workDir = path.join(jobDir, "work");
  fs.mkdirSync(workDir, { recursive: true });
  const job = { dir: jobDir, workDir };
  const repoDir = path.join(workDir, "repo");
  const source = item.job.repo || homeRepo(config);
  if (source && !fs.existsSync(repoDir)) {
    const repo = path.resolve(source);
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
    else {
      const backup = snapshotRepo(repo, item.id);
      git("worktree", "add", "-b", branch, repoDir, item.job.base || backup.sha);
      job.base = item.job.base || backup.sha;
      job.backupPushed = backup.pushed;
    }
    job.repo = repo;
    job.branch = branch;
    job.repoDir = repoDir;
  }
  fs.writeFileSync(path.join(jobDir, "brief.md"), `# ${item.id}: ${item.title}\n\n${item.job.brief}\n`);
  const settings = settingsFile(home, item.id);
  fs.mkdirSync(path.dirname(settings), { recursive: true });
  fs.writeFileSync(settings, `${JSON.stringify(headlessSettings(home, item.id), null, 2)}\n`);
  return job;
}

// New asks get their card session: queued to prep the ask and post its card. A harvested ask waits
// for the sweep's pre-check ("needed"; any other verdict already skipped it), so the user's own
// replies, duplicates and work already under way never start a session. It waits
// workers.prepDelayMin first (the user often picks an ask up), and starts anyway if no pre-check
// came within precheckWaitMin more. Direct asks ("Claude, …") and the user's own asks start at once.
function queuePreps(store, now, config = {}) {
  const delayMin = Number(config.prepDelayMin) || 0;
  const waitMin = Number(config.precheckWaitMin) || 0;
  const queued = [];
  for (const item of store.allItems().filter((i) => i.status === "new")) {
    const age = now - Date.parse(item.createdAt || 0);
    const harvested = !item.direct && !item.card && !OWN_KINDS.includes(item.source?.kind);
    let note = "queued for its card session";
    if (item.direct || item.source?.kind === "report") {
      // no wait: the user asked for it, or code made it on schedule
    } else if (age < delayMin * 60_000) {
      continue;
    } else if (harvested && item.precheck?.verdict !== "needed") {
      if (age < (delayMin + waitMin) * 60_000) continue;
      note = "queued for its card session (no pre-check in time)";
    }
    const patch = {
      job: { kind: "card", brief: item.job?.brief || (item.direct ? DIRECT_BRIEF : CARD_BRIEF), restingStatus: "new" },
    };
    // An item brought back from the filtered digest still points at the digest thread: it needs its own card.
    // A direct ask's card is the user's own message: keep it.
    if (item.card && !item.direct) {
      patch.previousCard = item.card;
      patch.card = null;
      fs.rmSync(cardPostMarker(store.paths.home, item.id), { force: true });
    }
    updateItem(store, item.id, { patch, status: "ready", note, internal: true }, () => now);
    queued.push(item.id);
  }
  return queued;
}

// Stored Slack and email text is kept 90 days. Once a day: closed items (done, skipped, filtered)
// older than that lose their item file, job folder (prompts, logs, scratch), worktree and artifacts;
// ledger lines, logs/events.jsonl lines, dated logs and tmp files older than that go too. The git
// branch aq/AQ-n-… stays: it is code, not messages. Item ids are never reused (state.nextId).
export const RETENTION_DAYS = 90;
const CLOSED = ["done", "skipped", "filtered"];

function pruneJsonl(file, cutoff) {
  if (!fs.existsSync(file)) return 0;
  const lines = fs.readFileSync(file, "utf8").split("\n").filter((line) => line.trim());
  const keep = lines.filter((line) => {
    try {
      const at = Date.parse(JSON.parse(line).at);
      return !Number.isFinite(at) || at >= cutoff;
    } catch {
      return true;
    }
  });
  if (keep.length === lines.length) return 0;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, keep.map((line) => `${line}\n`).join(""));
  fs.renameSync(tmp, file);
  return lines.length - keep.length;
}

function pruneFiles(dir, cutoff, match = () => true) {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (!stat.isFile() || !match(name) || stat.mtimeMs >= cutoff) continue;
    fs.rmSync(file, { force: true });
    removed += 1;
  }
  return removed;
}

export function purgeOld(store, now, { days = RETENTION_DAYS, force = false } = {}) {
  const home = store.paths.home;
  const state = store.state();
  const day = today(now);
  if (!force && state.checkpoints["purge:last"] === day) return null;
  const cutoff = now.getTime() - days * 24 * 3600 * 1000;
  const result = { items: [], ledger: 0, events: 0, logs: 0, tmp: 0 };
  for (const item of store.allItems()) {
    if (!CLOSED.includes(item.status)) continue;
    if (Date.parse(enteredStatusAt(item)) >= cutoff) continue;
    const job = item.job || {};
    if (job.repo && job.repoDir && fs.existsSync(job.repoDir)) {
      try {
        execFileSync("git", ["-C", job.repo, "worktree", "remove", "--force", job.repoDir], { stdio: "pipe" });
      } catch {
        // removed with the folder below; prune drops git's record of it
      }
    }
    fs.rmSync(path.join(home, "jobs", item.id), { recursive: true, force: true });
    fs.rmSync(path.join(home, "artifacts", item.id), { recursive: true, force: true });
    fs.rmSync(settingsFile(home, item.id), { force: true });
    fs.rmSync(cardPostMarker(home, item.id), { force: true });
    fs.rmSync(path.join(store.paths.items, `${item.id}.json`), { force: true });
    if (job.repo) {
      try {
        execFileSync("git", ["-C", job.repo, "worktree", "prune"], { stdio: "pipe" });
      } catch {
        // not a repo any more
      }
    }
    result.items.push(item.id);
  }
  result.ledger = pruneJsonl(store.paths.ledger, cutoff);
  result.events = pruneJsonl(path.join(home, "logs", "events.jsonl"), cutoff);
  result.logs = pruneFiles(path.join(home, "logs"), cutoff, (name) => /\.(log|txt)$/.test(name));
  result.tmp = pruneFiles(path.join(home, "tmp"), cutoff);
  const fresh = store.state();
  fresh.checkpoints["purge:last"] = day;
  store.saveState(fresh);
  return result;
}

// Closed cards keep their session for records.keepDays (follow-ups resume it). After that, a
// reopened card starts a fresh session, which reads the card's record.
function expireSessions(store, now) {
  const expired = [];
  const keepMs = recordsConfig(store.config()).keepDays * 86_400_000;
  for (const item of store.allItems()) {
    if (!["done", "skipped", "filtered"].includes(item.status)) continue;
    if (!item.job?.sessionId || item.job.sessionExpired) continue;
    if (now - Date.parse(enteredStatusAt(item)) < keepMs) continue;
    patchJob(store, item.id, { sessionExpired: now.toISOString(), previousSessionId: item.job.sessionId, sessionId: null, sessionStarted: false });
    expired.push(item.id);
  }
  return expired;
}

// ---------- weekly report, reminders, expiry (no model) ----------

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// A report missed (machine off) is still made this many days late; after that the week is skipped.
export const REPORT_GRACE_DAYS = 3;
const REMIND_RETRY_MS = 30 * 60_000;

// The local date of the report the queue owes now, or null: the latest report day/hour already
// passed, at most REPORT_GRACE_DAYS ago.
export function reportDay(now, tz, { day = "Fri", hour = 14 } = {}) {
  const want = WEEKDAYS.findIndex((d) => d.toLowerCase() === String(day).slice(0, 3).toLowerCase());
  const h = Number(hour);
  if (want < 0 || !Number.isInteger(h) || h < 0 || h > 23) throw new Error(`config report: day must be a weekday (Fri) and hour 0-23, got ${day} ${hour}`);
  const local = localParts(now, tz);
  let back = (WEEKDAYS.indexOf(local.weekday) - want + 7) % 7;
  if (back === 0 && local.hour < h) back = 7;
  return back > REPORT_GRACE_DAYS ? null : addDays(local.date, -back);
}

// Makes the week's report item once (fingerprint report:<day>); its card session drafts the note.
export function scheduleReport(store, now) {
  const config = store.config();
  const r = { day: "Fri", hour: 14, ...(config.report || {}) };
  if (r.off) return null;
  const day = reportDay(now, timezoneOf(store), r);
  if (!day) return null;
  const { action, id } = addCandidate(
    store,
    {
      title: `Weekly report: ${addDays(day, -6)} to ${day}`,
      source: { kind: "report", who: "you", where: "ask-queue" },
      askType: "weekly-report",
      excerpt: `Weekly report for the 7 days to ${day}.`,
      fingerprints: [`report:${day}`],
      job: { kind: "card", brief: REPORT_BRIEF },
    },
    () => now,
  );
  return action === "created" ? id : null;
}

// Promises and waits nobody replied about for track.expireDays past due close quietly.
export function expireTracking(store, now) {
  const days = Number(store.config().track?.expireDays) || 14;
  const today = localParts(now, timezoneOf(store)).date;
  const lapsed = [];
  for (const item of store.allItems()) {
    if (item.status !== "tracking" || !validDay(item.track?.due)) continue;
    if (addDays(item.track.due, days) >= today) continue;
    updateItem(store, item.id, { status: "skipped", note: `expired: ${days} days past due with no reply`, internal: true }, () => now);
    lapsed.push(item.id);
  }
  return lapsed;
}

const fmtDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

// Other people's Slack text, flattened for a one-line quote: no live mentions, no link markup.
export function plainSlack(text, max = 200) {
  let s = String(text ?? "")
    .replace(/<@[A-Z0-9]+\|([^>]+)>/g, "@$1")
    .replace(/<@[A-Z0-9]+>/g, "@someone")
    .replace(/<!(here|channel|everyone)[^>]*>/g, "@$1")
    .replace(/<!subteam\^[A-Z0-9]+\|([^>]+)>/g, "$1")
    .replace(/<(?:https?|mailto):[^|>]+\|([^>]+)>/g, "$1")
    .replace(/<(?:https?|mailto):[^>]+>/g, "(link)")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > max) s = `${s.slice(0, max).replace(/\s+\S*$/, "")}…`;
  return s;
}

// The reminder card (cards.md "Reminder card"). It becomes the item's card: replies go to a session.
export function reminderText(item, today) {
  const t = item.track;
  const who = plainSlack(item.source?.who, 60) || "someone";
  const first = who.split(" ")[0];
  const title = plainSlack(item.title, 90);
  const head =
    t.kind === "waiting"
      ? `🤖 ⏰ **${item.id} · Still waiting on ${first}: ${title}**`
      : `🤖 ⏰ **${item.id} · ${t.due < today ? `Overdue since ${fmtDay(t.due)}` : "Due today"}: ${title}**`;
  const where = item.source?.where ? ` · ${plainSlack(item.source.where, 60)}` : "";
  const url = String(item.source?.url || "");
  const from = /^https:\/\/[^\s()<>]+$/.test(url) ? `from [${who}${where}](${url})` : `from ${who}${where}`;
  const lines = [head, from, "", t.kind === "waiting" ? `💬 **You asked ${first}**` : `💬 **You told ${first}**`, `> ${plainSlack(item.excerpt || item.title) || title}`, "", "⠀"];
  if (t.dueGuessed) lines.push(`ℹ️ _No date was given, so I picked ${fmtDay(t.due)}._`);
  lines.push(
    t.kind === "waiting"
      ? "👉 Reply **done** if they answered, a new date, **drop**, or ask me to draft a nudge."
      : "👉 Reply **done**, a new date, **drop**, or ask me to draft it.",
    "━━━━━━━━━━━━━━━━",
  );
  return lines.join("\n");
}

// Posts a reminder card for each tracking item due today or earlier (once per due date), on weekdays
// within config track.hours, at most `max` per call. post(text) -> {channel, ts}; without one,
// connect() makes it, only when something is due (the token may come from AWS). A failed post
// retries after 30 minutes.
export async function remindDue(store, { now = new Date(), post, connect, max = 5 } = {}) {
  const config = store.config();
  const hours = Array.isArray(config.track?.hours) && config.track.hours.length === 2 ? config.track.hours.map(Number) : [9, 18];
  const local = localParts(now, timezoneOf(store));
  if (["Sat", "Sun"].includes(local.weekday) || !(local.hour >= hours[0] && local.hour < hours[1])) return { skipped: "outside reminder hours" };
  if (!config.slack?.cardChannel) return { skipped: "no bot DM (slack.cardChannel)" };
  const due = store
    .allItems()
    .filter((item) => item.status === "tracking" && validDay(item.track?.due) && item.track.due <= local.date && item.track.remindedFor !== item.track.due)
    .filter((item) => !(item.track.retryAt && Date.parse(item.track.retryAt) > now.getTime()))
    .sort((a, b) => a.track.due.localeCompare(b.track.due) || Number(a.id.slice(3)) - Number(b.id.slice(3)));
  if (!due.length) return { reminded: [] };
  if (post === undefined) post = connect ? connect() : null;
  if (!post) return { skipped: "no bot token" };
  const result = { reminded: [], failed: [] };
  for (const item of due.slice(0, max)) {
    const fresh = store.getItem(item.id);
    if (fresh.status !== "tracking" || fresh.track?.remindedFor === fresh.track?.due) continue;
    let posted = null;
    let error = null;
    try {
      posted = await post(reminderText(fresh, local.date));
      if (!posted?.ts || !posted?.channel) error = "no message ts in the post result";
    } catch (err) {
      error = String(err.message || err);
    }
    if (error) {
      updateItem(store, item.id, { patch: { track: { retryAt: new Date(now.getTime() + REMIND_RETRY_MS).toISOString() } }, note: `reminder failed: ${error.slice(0, 120)}`, internal: true }, () => now);
      result.failed.push(item.id);
      continue;
    }
    const patch = { card: { channelId: posted.channel, ts: posted.ts, lastSeenTs: posted.ts }, track: { remindedFor: fresh.track.due, remindedAt: now.toISOString(), retryAt: null } };
    if (fresh.card) patch.previousCard = fresh.card;
    updateItem(store, item.id, { patch, note: `reminder posted (due ${fresh.track.due})`, internal: true }, () => now);
    result.reminded.push(item.id);
  }
  if (due.length > max) result.later = due.length - max;
  return result;
}

// One reminder pass at a time (cron's tick and the watcher's can overlap).
export async function remind({ home = resolveHome(), clock, post } = {}) {
  const lock = path.join(home, ".remind.lock");
  try {
    fs.mkdirSync(lock);
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    if (Date.now() - fs.statSync(lock).mtimeMs < 120_000) return { skipped: "another reminder pass is running" };
    fs.rmSync(lock, { recursive: true, force: true });
    fs.mkdirSync(lock);
  }
  try {
    const store = createStore(home);
    const connect = () => {
      const token = loadToken();
      return token ? (text) => botPost({ token, config: store.config(), text, home, by: "reminder" }) : null;
    };
    return await remindDue(store, { now: clock ? clock() : new Date(), post, connect });
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
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
    try {
      const purged = purgeOld(store, now);
      if (purged && (purged.items.length || purged.ledger || purged.events || purged.logs || purged.tmp)) result.purged = purged;
    } catch (err) {
      result.purgeError = err.message;
    }
    try {
      const closed = closeOut(store, now);
      if (closed && (closed.recorded.length || closed.removed.length || closed.kept.length || closed.errors.length || closed.commit?.committed)) {
        result.closedOut = closed;
      }
    } catch (err) {
      result.closeOutError = err.message;
    }
    // Scheduled cards and expiry never block starting sessions.
    try {
      const report = scheduleReport(store, now);
      if (report) result.report = report;
      const lapsed = expireTracking(store, now);
      if (lapsed.length) result.lapsed = lapsed;
    } catch (err) {
      result.scheduleError = err.message;
    }
    result.prepQueued = queuePreps(store, now, config);

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
        const workspace = prepareWorkspace(home, item, store.config());
        // A new session starts in the card's worktree; a resumed one stays where it began.
        const fresh = !(item.job.sessionStarted && item.job.sessionId);
        const cwd = fresh ? workspace.repoDir || workspace.workDir : item.job.cwd || workspace.workDir;
        patchJob(
          store,
          id,
          { ...workspace, cwd, kind: item.job.kind || "card", sessionId: item.job.sessionId || randomUUID(), startedAt: now.toISOString(), pid: null, runs: (item.job.runs || 0) + 1 },
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

// config.prodProfile names the production Databricks profile (any string); the prompt says it.
const prodLine = (config) => (config.prodProfile ? `Databricks profile ${config.prodProfile}` : "production Databricks or any production warehouse");

export function workerPrompt(home, item, config, model = "the default model") {
  const aq = path.join(SKILL_DIR, "scripts", "aq.mjs");
  const job = item.job;
  const selfDm = config.slack?.selfDmId;
  const head = `You are the ask-queue card session for ${item.id}: "${item.title}". This is unattended: nobody answers in this chat. The user talks to you only through the card thread.
This run uses ${model}: say so on the card (cards.md). If the user's new messages switch the model, confirm it in one short line.`;
  const bot = config.slack?.cardChannel;
  const slackCli = `node ${path.join(SKILL_DIR, "scripts", "slack.mjs")}`;
  let post;
  if (item.card?.ts && bot && item.card.channelId === bot) {
    post = `Card thread for every message (post only there, each starting with "🤖" and naming ${item.id}, formatted per references/cards.md): channel ${item.card.channelId}, thread_ts ${item.card.ts}. Post as the bot: write the text to a file, then \`${slackCli} post --thread ${item.card.ts} --file <file.md>\` (never slack_send_message in this DM). Read the thread and react 👀 with the Slack tools as usual.`;
  } else if (item.card?.ts) {
    post = `Card thread for every message (post only there, each starting with "🤖" and naming ${item.id}, formatted per references/cards.md): channel ${item.card.channelId}, thread_ts ${item.card.ts}`;
  } else if (bot) {
    post = `No card yet: write the card to a file and post it as ONE top-level message as the bot: \`${slackCli} post --file <card.md>\` (no --thread). It prints {"channel","ts"}: record them with update (card.channelId, card.ts, card.lastSeenTs). After that, post only in its thread (--thread <ts>).`;
  } else {
    post = `No card yet: post the card as ONE top-level message to channel ${selfDm} (no thread_ts), then record it with update (card.channelId, card.ts, card.lastSeenTs). After that, post only in its thread.`;
  }
  const main = job.repo || homeRepo(config);
  const snapshot = job.base ? `, started from backup snapshot ${job.base.slice(0, 10)}` : "";
  const inWorktree = Boolean(job.repoDir) && job.cwd === job.repoDir;
  let place;
  if (inWorktree) {
    place = `Working directory: your own git worktree of ${main} at ${job.repoDir}, branch ${job.branch}${snapshot}. It loads that repo's CLAUDE.md, skills and memory: follow them, and add to memory under their rules. Commit freely on your branch. Scratch (queries, notes, --file inputs) goes in ${path.join(job.repoDir, SCRATCH_DIR, item.id)}. Main gets only the files the user names in this thread, copied over: never ${SCRATCH_DIR}/ and never a merge of your branch. Job folder (run logs): ${job.dir}`;
  } else {
    const repo = job.repoDir
      ? `\nRepo: your own git worktree of ${main} at ${job.repoDir}, branch ${job.branch}${snapshot}. Make every repo change there and commit it on that branch; the user brings it to main.`
      : "";
    place = `Job folder (your working directory; scratch work, queries and --file inputs go here): ${job.workDir}${repo}`;
  }
  const record = job.recordPath && !job.sessionStarted ? `\nThis card was closed before and written up in ${job.recordPath}: read it first.` : "";
  const where = `${place}${record}
When you close this card, its ledger entry also gets did, wrongTurns and nextTime (references/learn.md section 2): they go in its record.
No permission checks: you may run anything. Three things need the user's explicit yes in the card thread first, for that exact action (references/card-session.md "Three things need a yes"):
1. Changing main: committing, merging or pushing to main, or editing files in the main checkout${main ? ` (${main})` : ""}.
2. Sending anything as the user to other people (Slack outside your card thread, email, invites). Draft it instead.
3. Writing to production data (${prodLine(config)}: tables, jobs, dashboards). Dev and scratch are fine.
${post}
State CLI: node ${aq}   (your item: get ${item.id}; you may update only ${item.id})
Skill: ${SKILL_DIR}`;
  const replies = job.lastFollowUp
    ? `\nThe user's new messages in the card thread (first, react "eyes" to each, by the ts in brackets, so they know it was read):\n${job.lastFollowUp}\n`
    : "";
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
  if (item.direct && !job.sessionStarted) {
    return `${head}
${intro}This is a direct ask: the user wrote to you in ${bot && item.card.channelId === bot ? "their DM with the bot" : "their self-DM"}, and that message is the card. Do what it asks and answer in its thread (card-session.md section 5). Their message (ts ${item.card.ts}):
${item.excerpt || item.title}
${replies ? `\nTheir replies under it since:${replies}` : ""}
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

// The card's name in Claude Code's agent view: its id and what it's about.
// Short enough to read at a glance in the agent view: the card id, then whole words of the title.
export function sessionName(item, max = 30) {
  let name = item.id;
  for (const word of String(item.title || "").split(/\s+/).filter(Boolean)) {
    if (name.length + 1 + word.length > max) break;
    name += ` ${word}`;
  }
  // Don't end on a word that only makes sense with what was cut ("Ruchita: apply the").
  const words = name.split(" ");
  while (words.length > 2 && TAIL_FILLER.test(words.at(-1))) words.pop();
  return words.join(" ").replace(/[\s:;,.(–-]+$/, "");
}
const TAIL_FILLER = /^(a|an|the|to|of|for|and|or|as|at|in|on|by|with|from|your|my|our|is|are|be|use|can|we)$/i;

// The config files claude may keep folder trust in. Which one a process reads depends on its
// CLAUDE_CONFIG_DIR, and the background daemon that hosts the sessions (and the agent view) can be
// started with a different one than cron, so trust has to be in all of them.
export function claudeConfigFiles(env = process.env) {
  if (env.ASK_QUEUE_CLAUDE_JSON) return [env.ASK_QUEUE_CLAUDE_JSON];
  const files = [
    env.CLAUDE_CONFIG_DIR && path.join(env.CLAUDE_CONFIG_DIR, ".claude.json"),
    path.join(os.homedir(), ".claude", ".claude.json"),
    path.join(os.homedir(), ".claude.json"),
  ].filter(Boolean);
  const existing = [...new Set(files)].filter((file) => fs.existsSync(file));
  return existing.length ? existing : [path.join(os.homedir(), ".claude.json")];
}

// Background sessions only start in trusted folders, and an untrusted folder also skips the
// settings hooks (so the guard never allows anything). Trusting jobs/ once covers every card.
export function trustJobsFolder(home, files = claudeConfigFiles()) {
  let changed = false;
  for (const file of [files].flat()) changed = trustIn(file, path.join(home, "jobs")) || changed;
  return changed;
}

function trustIn(file, dir) {
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  config.projects ||= {};
  const covered = Object.entries(config.projects).some(
    ([folder, settings]) => settings?.hasTrustDialogAccepted && (dir === folder || dir.startsWith(`${folder}${path.sep}`)),
  );
  if (covered) return false;
  config.projects[dir] = { ...config.projects[dir], hasTrustDialogAccepted: true };
  const tmp = `${file}.aq-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return true;
}

// This session's entry in `claude agents` (null if it isn't listed).
function bgEntry(claudeBin, opts, bgId) {
  try {
    const list = JSON.parse(execFileSync(claudeBin, ["agents", "--json", "--all"], { ...opts, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    return list.find((entry) => entry.id === bgId) || null;
  } catch {
    return undefined; // couldn't ask: try again next poll
  }
}

function bgStop(claudeBin, opts, bgId) {
  try {
    execFileSync(claudeBin, ["stop", bgId], { ...opts, stdio: "ignore", timeout: 30_000 });
  } catch {
    // already stopped
  }
}

// Supervises one run: starts a background claude session (listed in Claude Code's agent view under
// the card's name), enforces stop and the time limit, then stops it so it doesn't sit in memory.
// The stopped session stays listed under "completed" and is resumed by the card's next run.
export async function execJob(id, { home = resolveHome(), claudeBin = process.env.ASK_QUEUE_CLAUDE_BIN || "claude" } = {}) {
  const store = createStore(home);
  const config = workerConfig(store);
  let item = store.getItem(id);
  if (item.status !== "working") return { skipped: `${id} is ${item.status}` };
  const followUp = item.job.followUp || null;
  item = patchJob(store, id, { pid: process.pid, followUp: null, lastFollowUp: followUp });
  const kind = item.job.kind || "card";
  const limits = runLimits(config, kind, item.job);
  const prompt = workerPrompt(home, item, store.config(), limits.model);
  if (kind === "work" && !item.job.workStarted) patchJob(store, id, { workStarted: new Date().toISOString() });

  const cwd = item.job.cwd || item.job.workDir;
  const inWorktree = Boolean(item.job.repoDir) && cwd === item.job.repoDir;
  const opts = { cwd, env: { ...process.env, ASK_QUEUE_HOME: home, ASK_QUEUE_JOB: id } };
  const resume = item.job.sessionStarted && item.job.sessionId;
  // A background session keeps the options it was started with. Passing new ones (a card session
  // turning into a work run, or a new model) starts a copy with the full history under a new id.
  // Sessions started under the old guard (dontAsk) carry no bgMode: they restart with these options.
  const sameOptions = resume && item.job.bgKind === kind && item.job.bgModel === limits.model && item.job.bgMode === BG_MODE;
  const args = sameOptions
    ? ["--bg", "--resume", item.job.sessionId, "--", prompt]
    : [
        "--bg",
        "--name",
        sessionName(item),
        "--model",
        limits.model,
        ...(limits.effort ? ["--effort", limits.effort] : []),
        // No permission checks: the prompt names the few things that need the user's yes.
        "--permission-mode",
        BG_MODE,
        "--settings",
        settingsFile(home, id),
        "--add-dir",
        SKILL_DIR,
        // In its worktree the session loads the repo's skills itself; the main checkout would load them twice.
        ...(inWorktree ? [] : repoRoots(store.config()).flatMap((root) => ["--add-dir", root])),
        ...(resume ? ["--resume", item.job.sessionId] : []),
        "--", // the list flags above would otherwise take the prompt as one more value
        prompt,
      ];
  const logFile = path.join(item.job.dir, "log.txt");
  const log = (line) => fs.appendFileSync(logFile, `=== ${new Date().toISOString()} ${line}\n`);
  log(`run ${item.job.runs} ${kind} ${limits.model} ${resume ? `resume session ${item.job.sessionId}` : "new session"}`);
  // Each run's model, for the card's record (records.mjs).
  patchJob(store, id, { runLog: [...(item.job.runLog || []), { at: new Date().toISOString(), kind, model: limits.model }] });

  if (item.job.bgId) bgStop(claudeBin, opts, item.job.bgId); // a session still running would be copied, not resumed
  let bgId = null;
  let code = 0;
  try {
    trustJobsFolder(home);
    const out = execFileSync(claudeBin, args, { ...opts, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 });
    bgId = out.replace(/\x1b\[[0-9;]*m/g, "").match(/backgrounded · ([0-9a-f]+)/)?.[1] || null;
    if (!bgId) log(`no session id in: ${out.trim().slice(0, 300)}`);
  } catch (err) {
    log(`start failed: ${String(err.stderr || err.message).trim().slice(0, 300)}`);
    code = err.status || 1;
  }
  if (!bgId) return finishRun(store, id, { code: code || 1, reason: null, limits, home });
  patchJob(store, id, sameOptions ? { sessionStarted: true, bgId } : { sessionStarted: true, bgId, bgKind: kind, bgModel: limits.model, bgMode: BG_MODE });

  let reason = null;
  let missing = 0;
  const limitMs = limits.timeLimitMin * 60 * 1000;
  const started = Date.now();
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, pollMs()));
    const entry = bgEntry(claudeBin, opts, bgId);
    if (entry?.sessionId && entry.sessionId !== store.getItem(id).job.sessionId) {
      // Every id the card's sessions had: the record finds the memories they wrote by it.
      const ids = store.getItem(id).job.sessionIds || [];
      patchJob(store, id, { sessionId: entry.sessionId, sessionIds: [...new Set([...ids, entry.sessionId])] });
    }
    if (entry === null && (missing += 1) >= 3) {
      code = 1;
      log("session no longer listed");
      break;
    }
    if (entry) missing = 0;
    // A finished turn leaves the session idle with a live pid. No pid is left over from the stopped
    // earlier turn (just before the resume wakes it), or a session that died.
    // The turn is over once a live session isn't "working": "done", or "blocked" when its last
    // message reads like a question (the agent view's "awaiting input").
    if (entry?.pid && ["done", "blocked"].includes(entry.state)) break;
    if (entry && !entry.pid && Date.now() - started > START_GRACE_MS) {
      if (entry.state !== "done") code = 1;
      log(`session exited (${entry.state || "no state"})`);
      break;
    }
    let stop = false;
    try {
      stop = Boolean(store.getItem(id).job?.stopRequested);
    } catch {
      // unreadable for a moment: check again next poll
    }
    if (stop) reason = "stopped";
    else if (Date.now() - started > limitMs) reason = "timeout";
    if (reason) break;
  }
  bgStop(claudeBin, opts, bgId);
  log(`end ${reason || (code ? `failed (${code})` : "done")}`);
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
    if (command === "tick") {
      result = tick();
      // Reminders need the network; a failure here never hides the tick's result.
      try {
        const reminders = await remind();
        if (reminders.reminded?.length || reminders.failed?.length) result.reminders = reminders;
      } catch (err) {
        result.remindError = err.message;
      }
    } else if (command === "exec" && /^AQ-\d+$/.test(id || "")) result = await execJob(id);
    else if (command === "status") result = listJobs(createStore(resolveHome()));
    else if (command === "purge") result = purgeOld(createStore(resolveHome()), new Date(), { days: Number(id) || RETENTION_DAYS, force: true });
    else {
      process.stderr.write("usage: dispatch.mjs tick | status | purge [days] | exec <AQ-n>\n");
      process.exit(64);
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (err) {
    process.stderr.write(`${JSON.stringify({ error: err.message })}\n`);
    process.exit(1);
  }
}
