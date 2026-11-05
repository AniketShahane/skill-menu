// Card records and worktree cleanup. No model, so no tokens; dispatch.mjs tick runs closeOut once a day.
//
// A closed card keeps its session and worktree for records.keepDays (default 7): a reply in that
// time picks up where it left off. After that the close is final:
//   1. its record is written to <repo>/<records.dir>/<YYYY-MM>/AQ-n.md: facts from the item, git and
//      memory (code), plus the card's own lines from its latest ledger entry (did, wrongTurns, nextTime);
//   2. files left in its worktree are committed on its own aq/ branch (never secrets or big files);
//   3. the worktree is removed. The branch stays, so a later reply rebuilds it (prepareWorkspace);
//   4. new records are committed to records.branch, those paths only, at most once a day. Never pushed.
// A record holds no Slack or email text beyond the card's title: that text is kept only 90 days.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SECRET_GLOBS, enteredStatusAt, homeRepo, recordsConfig, roundsOf, updateItem } from "./aq.mjs";

const DAY_MS = 86_400_000;
const CLOSED = ["done", "skipped", "filtered"];
// A leftover file bigger than this stays uncommitted, and its worktree stays too.
const MAX_LEFTOVER = 5 * 1024 * 1024;
export const SCRATCH_DIR = "aq-scratch";
const AQ_IDENTITY = ["-c", "user.name=ask-queue", "-c", "user.email=ask-queue@localhost"];

const git = (cwd, args, opts = {}) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: "pipe", timeout: 60_000, ...opts }).trim();
const tryGit = (cwd, args) => {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
};
const inside = (target, dir) => {
  const rel = path.relative(dir, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};

// Claude Code keeps a repo's memory under its config dir, by the main checkout's path; every worktree shares it.
export function memoryDir(repo) {
  if (process.env.ASK_QUEUE_MEMORY_DIR) return process.env.ASK_QUEUE_MEMORY_DIR;
  const config = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  return path.join(config, "projects", repo.replace(/[^A-Za-z0-9]/g, "-"), "memory");
}

// Memory files a card's sessions started (their frontmatter names the session).
export function memoriesBy(dir, sessionIds) {
  const ids = new Set(sessionIds.filter(Boolean));
  if (!ids.size || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md") && name !== "MEMORY.md")
    .filter((name) => {
      const head = fs.readFileSync(path.join(dir, name), "utf8").slice(0, 2000);
      const id = head.match(/originSessionId:\s*"?([\w-]+)/)?.[1];
      return id && ids.has(id);
    })
    .sort();
}

export const sessionIdsOf = (job = {}) => [...new Set([...(job.sessionIds || []), job.sessionId, job.previousSessionId].filter(Boolean))];

function branchInfo(repo, job) {
  if (!job.branch || !tryGit(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${job.branch}`])) return null;
  const base = job.base && tryGit(repo, ["rev-parse", "--verify", "--quiet", `${job.base}^{commit}`]) ? job.base : null;
  if (!base) return { branch: job.branch, commits: [], files: [], scratch: 0 };
  const commits = (tryGit(repo, ["log", "--format=%s", `${base}..${job.branch}`]) || "").split("\n").filter(Boolean);
  const changed = (tryGit(repo, ["diff", "--name-only", base, job.branch]) || "").split("\n").filter(Boolean);
  const scratch = changed.filter((f) => f.startsWith(`${SCRATCH_DIR}/`));
  return { branch: job.branch, commits, files: changed.filter((f) => !scratch.includes(f)), scratch: scratch.length };
}

const latestLedger = (store, id) => {
  let last = null;
  for (const entry of store.ledgerEntries()) if (entry.id === id) last = entry;
  return last;
};
const day = (iso) => (iso ? String(iso).slice(0, 10) : "unknown");
const text = (value) => {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return value === undefined || value === null || String(value).trim() === "" ? [] : [String(value).trim()];
};
const artifactText = (a) => (a && typeof a === "object" ? [a.title || a.kind, a.url].filter(Boolean).join(" ") || JSON.stringify(a) : String(a));
const list = (items, max = 12) => (items.length > max ? `${items.slice(0, max).join(", ")} and ${items.length - max} more` : items.join(", "));

// The record as markdown. Facts come from code; only the three narrative sections come from the card.
export function renderRecord({ item, ledger, branch, memories, closedAt }) {
  const job = item.job || {};
  const source = item.source || {};
  const who = item.direct || source.who === "you" ? "you" : source.who || "unknown";
  const runs = Array.isArray(job.runLog) ? job.runLog : [];
  const byModel = {};
  for (const run of runs) byModel[run.model || "default"] = (byModel[run.model || "default"] || 0) + 1;
  const models = Object.entries(byModel).map(([m, n]) => `${m} x${n}`).join(", ");
  const lines = [
    `# ${item.id} · ${(ledger?.ask || item.title || "").replace(/\s+/g, " ").trim()}`,
    "",
    `- **From:** ${who}${item.direct ? ", direct ask" : ""} · **Source:** ${source.kind || "unknown"} · **Type:** ${ledger?.askType || "not set"}`,
    `- **Opened:** ${day(item.createdAt)} · **Closed:** ${day(closedAt)} (${item.status}) · **Your replies:** ${roundsOf(item)}`,
    `- **Runs:** ${job.runs || runs.length || 0}${models ? ` (${models})` : ""}`,
    `- **Outcome:** ${ledger?.outcome || item.status}`,
  ];
  const artifacts = (ledger?.artifacts || []).map(artifactText).filter(Boolean);
  if (artifacts.length) lines.push(`- **Artifacts:** ${list(artifacts)}`);
  if (branch) {
    const parts = [`\`${branch.branch}\` (local)`, `${branch.commits.length} commits`];
    if (branch.files.length) parts.push(`changed: ${list(branch.files)}`);
    if (branch.scratch) parts.push(`scratch: ${branch.scratch} files`);
    lines.push(`- **Branch:** ${parts.join(" · ")}`);
  }
  lines.push(`- **Memories it added:** ${memories.length ? memories.map((m) => `\`${m}\``).join(", ") : "none"}`);
  const section = (title, values, empty) => {
    lines.push("", `## ${title}`, "");
    if (!values.length) lines.push(empty);
    else if (values.length === 1) lines.push(values[0]);
    else for (const v of values) lines.push(`- ${v}`);
  };
  section("What it did", text(ledger?.did), "_Not written by the card session._");
  section("Wrong turns", text(ledger?.wrongTurns), "None noted.");
  section("Next time", text(ledger?.nextTime), "None noted.");
  const lessons = text(ledger?.lessons);
  if (lessons.length) section("Lessons", lessons, "");
  return `${lines.join("\n")}\n`;
}

// Commits what the card left in its worktree on its own branch: everything but secrets and big files.
// Returns true when the worktree is clean afterwards (safe to remove).
function commitLeftovers(repoDir, id) {
  const status = git(repoDir, ["status", "--porcelain", "--untracked-files=all", "-z"]);
  if (!status) return true;
  const big = git(repoDir, ["ls-files", "--others", "--modified", "--exclude-standard", "-z"])
    .split("\0")
    .filter((file) => file && (fs.statSync(path.join(repoDir, file), { throwIfNoEntry: false })?.size || 0) > MAX_LEFTOVER)
    .map((file) => `:(exclude,literal)${file}`);
  git(repoDir, ["add", "-A", "--", ".", ...SECRET_GLOBS.map((g) => `:(exclude,glob)${g}`), ...big]);
  if (tryGit(repoDir, ["diff", "--cached", "--quiet"]) === null) {
    git(repoDir, [...AQ_IDENTITY, "commit", "-q", "--no-verify", "-m", `aq: ${id} leftovers at close`]);
  }
  return git(repoDir, ["status", "--porcelain", "--untracked-files=all"]) === "";
}

// A rebase, merge or other operation half done in the main checkout: leave it alone today.
function busy(repo) {
  const gitDir = git(repo, ["rev-parse", "--absolute-git-dir"]);
  return ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "BISECT_LOG", "rebase-merge", "rebase-apply", "index.lock"].some((f) =>
    fs.existsSync(path.join(gitDir, f)),
  );
}

// Commits new or changed records on records.branch, those paths only: anything else the user has
// staged stays staged and uncommitted. Skipped (and retried next day) when the main checkout is on
// another branch or mid-operation. Never pushes.
export function commitRecords(repo, cfg) {
  const dir = cfg.dir;
  if (!fs.existsSync(path.join(repo, dir))) return { skipped: "no records yet" };
  if (busy(repo)) return { skipped: "a git operation is in progress" };
  const head = tryGit(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (head !== cfg.branch) return { skipped: `the main checkout is on ${head || "a detached HEAD"}, not ${cfg.branch}` };
  const changed = git(repo, ["status", "--porcelain", "--untracked-files=all", "--", dir]);
  if (!changed) return { skipped: "nothing new" };
  const ids = [...new Set([...changed.matchAll(/(AQ-\d+)\.md/g)].map((m) => m[1]))];
  git(repo, ["add", "--", dir]);
  git(repo, [...AQ_IDENTITY, "commit", "-q", "--only", "-m", `ask-queue: card records (${ids.join(", ") || "update"})`, "--", dir]);
  return { committed: ids, sha: git(repo, ["rev-parse", "--short", "HEAD"]) };
}

// Final close for every card closed more than keepDays ago (or reopened and closed again since).
// Runs once a day unless forced. Each card: record, then leftovers, then the worktree.
export function closeOut(store, now, { force = false, config = store.config() } = {}) {
  const state = store.state();
  const today = now.toISOString().slice(0, 10);
  if (!force && state.checkpoints["closeout:last"] === today) return null;
  const repo = homeRepo(config);
  const cfg = recordsConfig(config);
  const result = { recorded: [], removed: [], kept: [], errors: [] };
  const jobsDir = path.join(store.paths.home, "jobs");
  for (const item of store.allItems()) {
    if (!CLOSED.includes(item.status)) continue;
    const job = item.job || {};
    if (!job.runs) continue; // never had a session: nothing to record
    const closedAt = enteredStatusAt(item);
    if (now - Date.parse(closedAt) < cfg.keepDays * DAY_MS) continue;
    if (job.closedOutAt && Date.parse(job.closedOutAt) >= Date.parse(closedAt)) continue;
    const itemRepo = job.repo || repo;
    const patch = { closedOutAt: now.toISOString() };
    try {
      // Only ever a card's own worktree under the jobs folder, never the main checkout.
      const ownWorktree =
        job.repoDir && fs.existsSync(job.repoDir) && inside(job.repoDir, jobsDir) && itemRepo && path.resolve(job.repoDir) !== path.resolve(itemRepo);
      // Leftovers first, so the record counts them; the worktree goes only after the record exists.
      const clean = ownWorktree ? commitLeftovers(job.repoDir, item.id) : false;
      // Cards closed before records.since (the day records started) get one only if they still have a worktree.
      if (itemRepo && (!cfg.since || Date.parse(closedAt) >= Date.parse(cfg.since) || ownWorktree)) {
        const month = day(closedAt).slice(0, 7);
        const recordPath = job.recordPath && inside(job.recordPath, itemRepo) ? job.recordPath : path.join(itemRepo, cfg.dir, month, `${item.id}.md`);
        const record = renderRecord({
          item,
          ledger: latestLedger(store, item.id),
          branch: branchInfo(itemRepo, job),
          memories: memoriesBy(memoryDir(itemRepo), sessionIdsOf(job)),
          closedAt,
        });
        fs.mkdirSync(path.dirname(recordPath), { recursive: true });
        fs.writeFileSync(recordPath, record);
        patch.recordPath = recordPath;
        result.recorded.push(item.id);
      }
      if (ownWorktree && clean) {
        git(itemRepo, ["worktree", "remove", job.repoDir]);
        patch.worktreeRemovedAt = now.toISOString();
        result.removed.push(item.id);
      } else if (ownWorktree) {
        patch.notice = "Worktree kept at close: it has secrets or files over 5 MB that weren't committed.";
        result.kept.push(item.id);
      }
      // The session ends with the close: a later reply starts a fresh one that reads the record.
      if (job.sessionId && !job.sessionExpired) {
        Object.assign(patch, { sessionExpired: now.toISOString(), previousSessionId: job.sessionId, sessionId: null, sessionStarted: false });
      }
      updateItem(store, item.id, { patch: { job: patch }, internal: true });
    } catch (err) {
      result.errors.push(`${item.id}: ${String(err.stderr || err.message).trim().split("\n")[0].slice(0, 200)}`);
    }
  }
  if (repo) {
    try {
      result.commit = commitRecords(repo, cfg);
    } catch (err) {
      result.commit = { error: String(err.stderr || err.message).trim().split("\n")[0].slice(0, 200) };
    }
  }
  const fresh = store.state();
  fresh.checkpoints["closeout:last"] = today;
  store.saveState(fresh);
  return result;
}
