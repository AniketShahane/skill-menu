import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { addCandidate, createStore, updateItem } from "../scripts/aq.mjs";
import { execJob, sessionName, settingsFile, tick, trustJobsFolder } from "../scripts/dispatch.mjs";
import { decide, makeContext } from "../scripts/guard.mjs";
import { fakeBgClaude } from "./helpers.mjs";

const AQ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "aq.mjs");
process.env.ASK_QUEUE_POLL_MS = "50";

function setup(count = 1, job = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aq-dispatch-"));
  const store = createStore(home);
  store.init();
  const config = store.config();
  config.slack = { userId: "U1", selfDmId: "D1" };
  fs.writeFileSync(store.paths.config, JSON.stringify(config));
  for (let n = 1; n <= count; n += 1) {
    addCandidate(store, { title: `Job ${n}`, source: { kind: "manual" }, fingerprints: [`m:${n}`] });
    updateItem(store, `AQ-${n}`, { status: "scoping", patch: { card: { channelId: "D1", ts: `${n}.5` }, job: { brief: "Write a.txt", ...job } } });
    updateItem(store, `AQ-${n}`, { status: "ready" });
  }
  return { home, store };
}

// A stand-in for `claude`: logs its args, then behaves as FAKE_MODE says.
function fakeClaude(home, mode) {
  const file = path.join(home, `fake-claude-${mode}.mjs`);
  fs.writeFileSync(
    file,
    `#!/usr/bin/env node
import fs from "node:fs";
import { execFileSync } from "node:child_process";
fs.appendFileSync(${JSON.stringify(path.join(home, "calls.jsonl"))}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + "\\n");
const id = process.env.ASK_QUEUE_JOB;
if (${JSON.stringify(mode)} === "report") execFileSync("node", [${JSON.stringify(AQ)}, "update", id, "--status", "review"]);
if (${JSON.stringify(mode)} === "fail") process.exit(3);
if (${JSON.stringify(mode)} === "hang") setInterval(() => {}, 1000);
`,
  );
  fs.chmodSync(file, 0o755);
  return fakeBgClaude(home, file);
}

const calls = (home) =>
  fs.readFileSync(path.join(home, "calls.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));

test("tick starts at most workers.max and queues the rest, in order", () => {
  const { home, store } = setup(7);
  const spawned = [];
  const result = tick({ home, spawnSupervisor: (_h, id) => spawned.push(id), alive: () => true });
  assert.deepEqual(result.started, ["AQ-1", "AQ-2", "AQ-3", "AQ-4", "AQ-5"]);
  assert.deepEqual(result.waiting, ["AQ-6", "AQ-7"]);
  assert.deepEqual(spawned, result.started);
  const job = store.getItem("AQ-1").job;
  assert.equal(store.getItem("AQ-1").status, "working");
  assert.match(job.sessionId, /^[0-9a-f-]{36}$/);
  assert.ok(fs.readFileSync(path.join(job.dir, "brief.md"), "utf8").includes("Write a.txt"));
  assert.ok(fs.existsSync(job.workDir));
  assert.match(fs.readFileSync(settingsFile(home, "AQ-1"), "utf8"), /--worker AQ-1/);
  assert.ok(!fs.existsSync(path.join(job.dir, "settings.json")), "guard settings stay out of the writable job folder");
});

test("daily cap leaves work queued with one notice", () => {
  const { home, store } = setup(2);
  fs.writeFileSync(path.join(home, "workers.json"), JSON.stringify({ day: new Date().toISOString().slice(0, 10), runs: 100 }));
  const result = tick({ home, spawnSupervisor: () => {}, alive: () => true });
  assert.deepEqual(result.started, []);
  assert.match(store.getItem("AQ-1").job.notice, /limit/);
  assert.equal(store.getItem("AQ-1").status, "ready");
});

test("a dead worker is moved to review with a notice", () => {
  const { home, store } = setup(1);
  tick({ home, spawnSupervisor: () => {}, alive: () => true });
  updateItem(store, "AQ-1", { patch: { job: { pid: 999999 } }, internal: true });
  const result = tick({ home, spawnSupervisor: () => {}, alive: () => false });
  assert.deepEqual(result.reaped, ["AQ-1"]);
  assert.equal(store.getItem("AQ-1").status, "review");
  assert.match(store.getItem("AQ-1").job.notice, /stopped unexpectedly/);
});

test("repo work gets a git worktree on a new local branch", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "aq-repo-"));
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" });
  git("init", "-q");
  fs.writeFileSync(path.join(repo, "x.txt"), "x");
  git("add", ".");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init");
  const { home, store } = setup(1, { repo });
  tick({ home, spawnSupervisor: () => {}, alive: () => true });
  const job = store.getItem("AQ-1").job;
  assert.match(job.branch, /^aq\/AQ-1-job-1$/);
  assert.equal(job.repoDir, path.join(job.workDir, "repo"));
  assert.ok(fs.existsSync(path.join(job.repoDir, "x.txt")));
});

test("a bad repo sends the item back to scoping with a notice", () => {
  const { home, store } = setup(1, { repo: "/nonexistent/repo" });
  const result = tick({ home, spawnSupervisor: () => {}, alive: () => true });
  assert.deepEqual(result.failed, ["AQ-1"]);
  assert.equal(store.getItem("AQ-1").status, "scoping");
  assert.match(store.getItem("AQ-1").job.notice, /Couldn't start/);
});

test("exec: first run uses --session-id, a follow-up resumes the same session", async () => {
  const { home, store } = setup(1);
  process.env.ASK_QUEUE_HOME = home;
  const claudeBin = fakeClaude(home, "report");
  tick({ home, spawnSupervisor: () => {}, alive: () => true });
  await execJob("AQ-1", { home, claudeBin });
  const sessionId = store.getItem("AQ-1").job.sessionId;
  assert.equal(store.getItem("AQ-1").status, "review");
  assert.equal(store.getItem("AQ-1").job.pid, null);

  updateItem(store, "AQ-1", { patch: { job: { followUp: "make it shorter" } } });
  updateItem(store, "AQ-1", { status: "ready" });
  tick({ home, spawnSupervisor: () => {}, alive: () => true });
  await execJob("AQ-1", { home, claudeBin });
  const [first, second] = calls(home);
  assert.ok(first.args.includes("--bg") && !first.args.includes("--resume"));
  assert.equal(first.args[first.args.indexOf("--name") + 1], "AQ-1 Job 1");
  assert.equal(first.args[first.args.indexOf("--permission-mode") + 1], "dontAsk");
  assert.deepEqual(second.args.slice(0, 3), ["--bg", "--resume", sessionId], "same session, saved options");
  assert.match(second.args.at(-1), /make it shorter/);
  assert.equal(first.args.at(-2), "--", "the prompt can't be read as a flag value");
  assert.equal(fs.realpathSync(first.cwd), fs.realpathSync(store.getItem("AQ-1").job.workDir));
  assert.equal(store.getItem("AQ-1").job.followUp, null);
});

test("exec: a run that ends without reporting goes to review with a notice", async () => {
  const { home, store } = setup(1);
  tick({ home, spawnSupervisor: () => {}, alive: () => true });
  await execJob("AQ-1", { home, claudeBin: fakeClaude(home, "fail") });
  assert.equal(store.getItem("AQ-1").status, "review");
  assert.match(store.getItem("AQ-1").job.notice, /without posting a result/);
});

test("exec: stop kills the worker", async () => {
  const { home, store } = setup(1);
  tick({ home, spawnSupervisor: () => {}, alive: () => true });
  const done = execJob("AQ-1", { home, claudeBin: fakeClaude(home, "hang") });
  setTimeout(() => updateItem(store, "AQ-1", { patch: { job: { stopRequested: "now" } }, internal: true }), 300);
  await done;
  assert.equal(store.getItem("AQ-1").status, "review");
  assert.match(store.getItem("AQ-1").job.notice, /^Stopped/);
  assert.equal(store.getItem("AQ-1").job.stopRequested, null);
});

test("worker guard: job folder only, own thread only, no push or network", () => {
  const { home, store } = setup(1);
  tick({ home, spawnSupervisor: () => {}, alive: () => true });
  const ctx = makeContext(home, "AQ-1");
  const work = store.getItem("AQ-1").job.workDir;
  const call = (tool_name, tool_input, cwd = work) => decide({ tool_name, tool_input, cwd }, ctx).decision;

  assert.equal(call("Write", { file_path: path.join(work, "a.txt") }), "allow");
  assert.equal(call("Write", { file_path: path.join(home, "memory", "people.md") }), "allow");
  assert.equal(call("Write", { file_path: path.join(home, "memory", "notes.json") }), "deny");
  assert.equal(call("Write", { file_path: path.join(home, "items", "AQ-1.json") }), "deny");
  assert.equal(call("Write", { file_path: settingsFile(home, "AQ-1") }), "deny");
  assert.equal(call("Read", { file_path: path.join(home, "memory", "people.md") }), "allow");
  assert.equal(call("Read", { file_path: path.join(home, "items", "AQ-1.json") }), "deny");
  assert.equal(call("Bash", { command: "python3 analysis.py | head -5" }), "allow");
  assert.equal(call("Bash", { command: `node ${AQ} update AQ-1 --status review` }), "allow");
  assert.equal(call("Bash", { command: "git add . && git commit -m wip" }), "allow");
  assert.equal(call("Bash", { command: "git push origin HEAD" }), "deny");
  assert.equal(call("Bash", { command: "curl https://example.com" }), "deny");
  assert.equal(call("Bash", { command: "cat ~/.config/ask-queue/slack-token" }), "deny");
  assert.equal(call("Bash", { command: "cat /etc/passwd" }), "deny");
  assert.equal(call("Bash", { command: "cat ../../items/AQ-1.json" }), "deny");
  assert.equal(call("Bash", { command: "ls" }, home), "deny");
  assert.equal(call("WebFetch", { url: "https://x" }), "deny");
  assert.equal(call("Agent", { prompt: "x" }), "deny");

  const send = "mcp__claude_ai_Slack__slack_send_message";
  assert.equal(call(send, { channel_id: "D1", thread_ts: "1.5", message: "🤖 AQ-1 done" }), "allow");
  assert.equal(call(send, { channel_id: "D1", message: "🤖 top level" }), "deny");
  assert.equal(call(send, { channel_id: "C9", thread_ts: "1.5", message: "hi" }), "deny");
  assert.equal(call("mcp__claude_ai_Slack__slack_send_message_draft", { channel_id: "C9" }), "allow");
  assert.equal(call("mcp__claude_ai_Gmail__send_message", {}), "deny");
  const react = "mcp__claude_ai_Slack__slack_add_reaction";
  assert.equal(call(react, { channel_id: "D1", message_ts: "9.1", emoji: "eyes" }), "allow");
  assert.equal(call(react, { channel_id: "C9", message_ts: "9.1", emoji: "eyes" }), "deny");
});

test("sessionName: card id and the first whole words of the title, at most 30 chars", () => {
  assert.equal(sessionName({ id: "AQ-7", title: "David:  tip to\nfilter" }), "AQ-7 David: tip to filter");
  assert.equal(sessionName({ id: "AQ-12", title: "Sam: present your payments findings?" }), "AQ-12 Sam: present");
  assert.equal(sessionName({ id: "AQ-9", title: "Lee: " + "x".repeat(40) }), "AQ-9 Lee");
  assert.equal(sessionName({ id: "AQ-8", title: "x".repeat(100) }), "AQ-8");
  assert.ok(sessionName({ id: "AQ-8", title: "word ".repeat(40) }).length <= 30);
});

test("trustJobsFolder: trusts jobs/ once, and not at all under a trusted parent", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aq-trust-"));
  const file = path.join(dir, ".claude.json");
  fs.writeFileSync(file, JSON.stringify({ keep: 1, projects: { "/elsewhere": { hasTrustDialogAccepted: true } } }));
  assert.equal(trustJobsFolder("/data/aq", file), true);
  assert.equal(trustJobsFolder("/data/aq", file), false);
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(saved.keep, 1);
  assert.equal(saved.projects["/data/aq/jobs"].hasTrustDialogAccepted, true);
  assert.equal(trustJobsFolder("/elsewhere/aq", file), false, "a trusted parent covers it");
  const other = path.join(dir, "other.json");
  fs.writeFileSync(other, "{}");
  assert.equal(trustJobsFolder("/data/aq", [file, other]), true, "every config file gets it");
  assert.equal(JSON.parse(fs.readFileSync(other, "utf8")).projects["/data/aq/jobs"].hasTrustDialogAccepted, true);
});
