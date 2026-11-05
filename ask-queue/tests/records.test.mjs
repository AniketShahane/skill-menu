import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { addCandidate, addLedger, homeRepo, recordsConfig, repoRoots, updateItem } from "../scripts/aq.mjs";
import { execJob, tick, workerPrompt } from "../scripts/dispatch.mjs";
import { closeOut, renderRecord } from "../scripts/records.mjs";
import { fakeBgClaude, makeHome } from "./helpers.mjs";

const DAY = 86_400_000;
const noSpawn = () => {};

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "aq-records-repo-"));
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q", "-b", "main");
  fs.writeFileSync(path.join(repo, "README.md"), "repo\n");
  git("add", ".");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init");
  return { repo, git };
}

// A card with a worktree of the repo, as tick leaves it after starting its first session.
function cardWithWorktree(extraConfig = {}) {
  const { home, store } = makeHome();
  const { repo, git } = makeRepo();
  const config = store.config();
  Object.assign(config, { repo, ...extraConfig });
  fs.writeFileSync(store.paths.config, JSON.stringify(config));
  const { id } = addCandidate(store, { title: "Check the weekly report job", source: { kind: "direct", who: "you" }, fingerprints: ["d:1"] });
  updateItem(store, id, { status: "scoping", patch: { card: { channelId: "D1", ts: "1.5" }, job: { brief: "check" } } });
  updateItem(store, id, { status: "ready" });
  tick({ home, spawnSupervisor: noSpawn, alive: () => true });
  return { home, store, repo, git, id };
}

function closeCard(store, id, job = {}) {
  updateItem(store, id, { patch: { job: { pid: null, ...job } }, status: "review", internal: true });
  updateItem(store, id, { status: "done", internal: true });
}

test("config.repo is the repo cards work in; older setups fall back to the first repoEdit root", () => {
  assert.equal(homeRepo({ repo: "/a", repoEdit: { roots: ["/b"] } }), "/a");
  assert.deepEqual(repoRoots({ repo: "/a", repoEdit: { roots: ["/b", "/a"] } }), ["/a", "/b"]);
  assert.equal(homeRepo({ repoEdit: { roots: ["/b"] } }), "/b");
  assert.equal(homeRepo({ repo: "relative/path" }), null);
  assert.equal(homeRepo({}), null);
  assert.deepEqual(recordsConfig({}), { dir: "ask-queue-records", branch: "main", keepDays: 7, since: null });
  assert.equal(recordsConfig({ records: { keepDays: "x" } }).keepDays, 7);
});

test("a new session starts inside the card's worktree, without the main checkout as an extra dir", async () => {
  const { home, store, repo, id } = cardWithWorktree();
  const job = store.getItem(id).job;
  assert.equal(job.cwd, job.repoDir);
  const prompt = workerPrompt(home, store.getItem(id), store.config(), "opus");
  assert.match(prompt, new RegExp(`Working directory: your own git worktree of ${repo} at ${job.repoDir}`));
  assert.match(prompt, /loads that repo's CLAUDE\.md, skills and memory/);
  assert.ok(prompt.includes(path.join(job.repoDir, "aq-scratch", id)));
  assert.match(prompt, /never aq-scratch\/ and never a merge of your branch/);
  assert.match(prompt, /did, wrongTurns and nextTime/);

  const program = path.join(home, "session.mjs");
  fs.writeFileSync(program, `#!/usr/bin/env node\nimport fs from "node:fs";\nfs.appendFileSync(${JSON.stringify(path.join(home, "calls.jsonl"))}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + "\\n");\n`);
  fs.chmodSync(program, 0o755);
  await execJob(id, { home, claudeBin: fakeBgClaude(home, program) });
  const call = JSON.parse(fs.readFileSync(path.join(home, "calls.jsonl"), "utf8").trim().split("\n")[0]);
  assert.equal(fs.realpathSync(call.cwd), fs.realpathSync(job.repoDir));
  const addDirs = call.args.flatMap((a, i) => (call.args[i - 1] === "--add-dir" ? [a] : []));
  assert.ok(!addDirs.includes(repo), "the worktree loads the repo's skills itself");
  assert.equal(store.getItem(id).job.runLog.at(-1).model, "opus");
});

test("a session started before the change resumes in its old job folder", () => {
  const { home, store, id } = cardWithWorktree();
  const job = store.getItem(id).job;
  // An older card: its session began in work/ and has no cwd saved.
  updateItem(store, id, { patch: { job: { cwd: null, sessionStarted: true, sessionId: "S-old", pid: null } }, status: "review", internal: true });
  updateItem(store, id, { patch: { job: { followUp: "more" } }, status: "ready", internal: true });
  tick({ home, spawnSupervisor: noSpawn, alive: () => true });
  assert.equal(store.getItem(id).job.cwd, job.workDir);
  assert.match(workerPrompt(home, store.getItem(id), store.config()), /Job folder \(your working directory/);
});

test("close-out after keepDays: record in the repo, leftovers on the branch, worktree gone, records committed to main only", () => {
  const memDir = fs.mkdtempSync(path.join(os.tmpdir(), "aq-mem-"));
  process.env.ASK_QUEUE_MEMORY_DIR = memDir;
  fs.writeFileSync(path.join(memDir, "project_report_window.md"), "---\nname: x\nmetadata:\n  originSessionId: 11111111-2222\n---\nbody\n");
  fs.writeFileSync(path.join(memDir, "other.md"), "---\nmetadata:\n  originSessionId: 99999999-0000\n---\n");
  const { store, repo, git, id } = cardWithWorktree();
  const job = store.getItem(id).job;
  fs.mkdirSync(path.join(job.repoDir, "aq-scratch", id), { recursive: true });
  fs.writeFileSync(path.join(job.repoDir, "aq-scratch", id, "q.sql"), "select 1");
  fs.writeFileSync(path.join(job.repoDir, "fix.py"), "print(1)\n");
  addLedger(store, {
    id,
    outcome: "sent",
    askType: "data-check",
    ask: "Did the weekly report job skip any weeks",
    draft: "SECRET DRAFT TEXT",
    final: "SECRET FINAL TEXT",
    did: "Read every task and found the last-week-only window.",
    wrongTurns: ["Checked the wrong tables first", "Spot-checked a few tables only"],
    nextTime: "Find the named job before any query.",
    artifacts: [{ kind: "mr", url: "https://gitlab.example/mr/263" }],
  });
  closeCard(store, id, { runs: 3, sessionIds: ["11111111-2222"], runLog: [{ model: "sonnet" }, { model: "opus" }, { model: "opus" }] });
  // The user has their own work staged in the main checkout: it must stay staged and uncommitted.
  fs.writeFileSync(path.join(repo, "mine.txt"), "mine");
  git("add", "mine.txt");

  assert.equal(closeOut(store, new Date(Date.now() + 6 * DAY), { force: true }).recorded.length, 0, "kept for 7 days");
  const result = closeOut(store, new Date(Date.now() + 8 * DAY), { force: true });
  assert.deepEqual(result.recorded, [id]);
  assert.deepEqual(result.removed, [id]);
  assert.deepEqual(result.commit.committed, [id]);

  const after = store.getItem(id).job;
  const month = new Date().toISOString().slice(0, 7);
  assert.equal(after.recordPath, path.join(repo, "ask-queue-records", month, `${id}.md`));
  const record = fs.readFileSync(after.recordPath, "utf8");
  assert.match(record, new RegExp(`^# ${id} · Did the weekly report job skip any weeks`));
  assert.match(record, /\*\*From:\*\* you · \*\*Source:\*\* direct · \*\*Type:\*\* data-check/);
  assert.match(record, /\*\*Runs:\*\* 3 \(sonnet x1, opus x2\)/);
  assert.match(record, /https:\/\/gitlab\.example\/mr\/263/);
  assert.match(record, /1 commits · changed: fix\.py · scratch: 1 files/);
  assert.match(record, /\*\*Memories it added:\*\* `project_report_window\.md`$/m);
  assert.match(record, /## Wrong turns\n\n- Checked the wrong tables first\n- Spot-checked a few tables only/);
  assert.match(record, /## Next time\n\nFind the named job before any query\./);
  assert.ok(!record.includes("SECRET"), "no draft or sent text in a record");
  assert.ok(!record.includes("\u2014"), "no em-dashes");

  assert.ok(!fs.existsSync(job.repoDir), "worktree removed");
  assert.equal(git("show", `${job.branch}:fix.py`), "print(1)", "leftovers kept on the branch");
  assert.equal(git("show", `${job.branch}:aq-scratch/${id}/q.sql`), "select 1");
  assert.deepEqual(git("show", "--name-only", "--format=", "HEAD").split("\n"), [`ask-queue-records/${month}/${id}.md`]);
  assert.match(git("log", "-1", "--format=%an %s"), new RegExp(`^ask-queue ask-queue: card records \\(${id}\\)`));
  assert.equal(git("status", "--porcelain"), "A  mine.txt", "the user's staged file is untouched");
  assert.equal(after.sessionStarted, false);
  assert.equal(closeOut(store, new Date(Date.now() + 9 * DAY), { force: true }).recorded.length, 0, "once per close");
  delete process.env.ASK_QUEUE_MEMORY_DIR;
});

test("close-out keeps a worktree holding a secret; records wait while main is busy or on another branch", () => {
  const { store, repo, git, id } = cardWithWorktree();
  const job = store.getItem(id).job;
  fs.writeFileSync(path.join(job.repoDir, ".env"), "TOKEN=1");
  closeCard(store, id, { runs: 1 });
  git("checkout", "-q", "-b", "feature");
  const result = closeOut(store, new Date(Date.now() + 8 * DAY), { force: true });
  assert.deepEqual(result.kept, [id]);
  assert.ok(fs.existsSync(job.repoDir));
  assert.throws(() => git("show", `${job.branch}:.env`), "secrets never committed");
  assert.match(result.commit.skipped, /on feature, not main/);
  assert.match(store.getItem(id).job.notice, /Worktree kept/);
  git("checkout", "-q", "main");
  fs.writeFileSync(path.join(repo, ".git", "MERGE_HEAD"), "x");
  assert.match(closeOut(store, new Date(Date.now() + 9 * DAY), { force: true }).commit.skipped, /in progress/);
  fs.rmSync(path.join(repo, ".git", "MERGE_HEAD"));
  assert.ok(closeOut(store, new Date(Date.now() + 10 * DAY), { force: true }).commit.committed.includes(id), "committed once main is free");
});

test("a reply after close-out rebuilds the worktree from the branch and the fresh session reads the record", () => {
  const { home, store, id } = cardWithWorktree();
  const job = store.getItem(id).job;
  fs.writeFileSync(path.join(job.repoDir, "kept.txt"), "kept");
  closeCard(store, id, { runs: 1, sessionStarted: true, sessionId: "S1" });
  closeOut(store, new Date(Date.now() + 8 * DAY), { force: true });
  assert.ok(!fs.existsSync(job.repoDir));
  updateItem(store, id, { patch: { job: { followUp: "one more thing" } }, status: "ready", internal: true });
  tick({ home, spawnSupervisor: noSpawn, alive: () => true });
  const fresh = store.getItem(id);
  assert.equal(fs.readFileSync(path.join(fresh.job.repoDir, "kept.txt"), "utf8"), "kept");
  assert.equal(fresh.job.cwd, fresh.job.repoDir);
  assert.ok(workerPrompt(home, fresh, store.config()).includes(`written up in ${fresh.job.recordPath}: read it first`));
});

test("a record without the card's own lines says so; cards without a session get none", () => {
  const record = renderRecord({ item: { id: "AQ-9", title: "t", status: "skipped", history: [], source: { kind: "slack", who: "Sam" }, job: {} }, ledger: null, branch: null, memories: [], closedAt: "2026-11-01T00:00:00Z" });
  assert.match(record, /_Not written by the card session\._/);
  assert.match(record, /\*\*From:\*\* Sam · \*\*Source:\*\* slack/);
  const { store, repo, id } = cardWithWorktree();
  updateItem(store, id, { patch: { job: { runs: 0 } }, internal: true });
  closeCard(store, id);
  assert.deepEqual(closeOut(store, new Date(Date.now() + 8 * DAY), { force: true }).recorded, []);
  assert.ok(!fs.existsSync(path.join(repo, "ask-queue-records")));
});

test("records.since: older closed cards get a record only if they still have a worktree", () => {
  const since = new Date(Date.now() + DAY).toISOString();
  const withTree = cardWithWorktree({ records: { since } });
  closeCard(withTree.store, withTree.id, { runs: 1 });
  assert.deepEqual(closeOut(withTree.store, new Date(Date.now() + 8 * DAY), { force: true }).recorded, [withTree.id]);
  const noTree = cardWithWorktree({ records: { since } });
  const job = noTree.store.getItem(noTree.id).job;
  noTree.git("worktree", "remove", "--force", job.repoDir);
  closeCard(noTree.store, noTree.id, { runs: 1 });
  const result = closeOut(noTree.store, new Date(Date.now() + 8 * DAY), { force: true });
  assert.deepEqual(result.recorded, []);
  assert.ok(noTree.store.getItem(noTree.id).job.closedOutAt, "still closed out once");
});
