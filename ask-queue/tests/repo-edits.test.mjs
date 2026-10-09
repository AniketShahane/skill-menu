import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { headlessSettings, pathsIn, routeToCard, updateItem } from "../scripts/aq.mjs";
import { workerPrompt } from "../scripts/dispatch.mjs";
import { decide, makeContext, promptHook } from "../scripts/guard.mjs";
import { addItem, makeHome, setStatus, withCard } from "./helpers.mjs";

// A home whose config allows edits under a small fake repo.
function setup() {
  const { home, store } = makeHome();
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "aq-repo-")));
  fs.mkdirSync(path.join(repo, "docs"));
  fs.mkdirSync(path.join(repo, ".git"));
  for (const file of ["docs/project-reference.md", "docs/other.md", "README.md", ".env", "credentials.json", ".git/config"]) {
    fs.writeFileSync(path.join(repo, file), "x\n");
  }
  const config = store.config();
  config.repoEdit = { roots: [repo] };
  fs.writeFileSync(store.paths.config, JSON.stringify(config));
  const id = addItem(store);
  setStatus(store, id, "asking");
  withCard(store, id);
  return { home, store, repo, id };
}

const reply = (store, id, text, grant = true) =>
  routeToCard(store, id, { messages: [{ ts: `${Date.now() / 1000}`, text }] }, undefined, { grant });

function tool(home, id, tool_name, tool_input) {
  return decide({ tool_name, tool_input, cwd: path.join(home, "jobs", id, "work") }, makeContext(home, id)).decision;
}

test("pathsIn: named files under a root, never secrets, .git or paths outside", () => {
  const { repo } = setup();
  const roots = [repo];
  const ref = path.join(repo, "docs/project-reference.md");
  assert.deepEqual(pathsIn("please fix `docs/project-reference.md`.", roots), [ref]);
  assert.deepEqual(pathsIn(`edit ${ref}, thanks`, roots), [ref]);
  assert.deepEqual(pathsIn("README.md needs a line", roots), [path.join(repo, "README.md")]);
  assert.deepEqual(pathsIn(`create ${repo}/docs/new.md`, roots), [path.join(repo, "docs/new.md")], "new file, folder exists");
  assert.deepEqual(pathsIn("docs/missing.md", roots), [], "a relative name must exist");
  assert.deepEqual(pathsIn(`${repo}/nope/new.md`, roots), [], "folder must exist");
  assert.deepEqual(pathsIn(".env and credentials.json and .git/config", roots), []);
  assert.deepEqual(pathsIn(`${repo}/../etc/passwd /etc/hosts`, roots), []);
  assert.deepEqual(pathsIn("just words, yes", roots), []);
  assert.deepEqual(pathsIn("docs/project-reference.md", []), [], "no roots: off");
});

test("route: a path in the user's reply allows it; the model's `aq route` can't", () => {
  const { store, repo, id } = setup();
  const ref = path.join(repo, "docs/project-reference.md");
  reply(store, id, "update docs/project-reference.md with the new row", false);
  assert.equal(store.getItem(id).job.repoWrites, undefined, "aq route (no grant) allows nothing");
  reply(store, id, "update docs/project-reference.md with the new row");
  assert.deepEqual(store.getItem(id).job.repoWrites, [ref]);
  assert.match(store.getItem(id).history.at(-1).note, /repo edits allowed/);
});

test("proposal: the session proposes, the user's yes allows it, anything else drops it", () => {
  const { store, repo, id } = setup();
  const ref = path.join(repo, "docs/project-reference.md");
  const other = path.join(repo, "docs/other.md");
  const propose = (files) => updateItem(store, id, { patch: { job: { repoProposed: files } } });

  assert.throws(() => updateItem(store, id, { patch: { job: { repoWrites: [ref] } } }), /managed by dispatch/);
  assert.throws(() => propose([path.join(repo, ".env")]), /not a repo file/);
  assert.throws(() => propose(["/etc/hosts"]), /not a repo file/);
  assert.throws(() => propose("docs/x.md"), /list/);

  propose([ref]);
  reply(store, id, "no, I meant the other one");
  assert.equal(store.getItem(id).job.repoWrites?.length || 0, 0);
  assert.deepEqual(store.getItem(id).job.repoProposed, [], "a non-yes drops the proposal");
  reply(store, id, "yes");
  assert.equal(store.getItem(id).job.repoWrites?.length || 0, 0, "a later yes can't revive it");

  propose([ref, other]);
  reply(store, id, "Yes, go ahead");
  assert.deepEqual(store.getItem(id).job.repoWrites, [ref, other]);
  assert.deepEqual(store.getItem(id).job.repoProposed, []);
});

test("guard: repo reads open (not secrets); edits only to allowed files", () => {
  const { home, store, repo, id } = setup();
  const ref = path.join(repo, "docs/project-reference.md");
  assert.equal(tool(home, id, "Read", { file_path: ref }), "allow");
  assert.equal(tool(home, id, "Grep", { pattern: "x", path: repo }), "allow");
  assert.equal(tool(home, id, "Read", { file_path: path.join(repo, ".env") }), "deny");
  assert.equal(tool(home, id, "Read", { file_path: "/etc/hosts" }), "deny");
  assert.equal(tool(home, id, "Edit", { file_path: ref }), "deny", "not allowed yet");

  reply(store, id, `edit ${ref}`);
  assert.equal(tool(home, id, "Edit", { file_path: ref }), "allow");
  assert.equal(tool(home, id, "Write", { file_path: path.join(repo, "docs/other.md") }), "deny");
  assert.equal(tool(home, id, "Write", { file_path: path.join(repo, "docs/../docs/other.md") }), "deny");
  // A link to an allowed name doesn't open what it points at, and vice versa.
  fs.symlinkSync(path.join(repo, "docs/other.md"), path.join(repo, "docs/link.md"));
  assert.equal(tool(home, id, "Write", { file_path: path.join(repo, "docs/link.md") }), "deny");
  // Commands still stay in the job folder.
  assert.equal(tool(home, id, "Bash", { command: `git -C ${repo} commit -am x` }), "deny");
  assert.equal(tool(home, id, "Bash", { command: "ls", run_in_background: true }), "deny");
  assert.equal(tool(home, id, "Bash", { command: "ls" }), "allow");
});

test("prompt hook: typed text allows like a reply; dispatch prompts never do", () => {
  const { home, store, repo, id } = setup();
  const ref = path.join(repo, "docs/project-reference.md");
  const item = store.getItem(id);
  const dispatched = workerPrompt(home, { ...item, job: { ...item.job, workDir: "/w", dir: "/j", lastFollowUp: `[1.1] edit ${ref}` } }, store.config());
  assert.match(dispatched, /^You are the ask-queue card session/);
  assert.deepEqual(promptHook(home, id, { prompt: dispatched }), []);
  assert.equal(store.getItem(id).job?.repoWrites, undefined);

  updateItem(store, id, { patch: { job: { repoProposed: [ref] } } });
  assert.deepEqual(promptHook(home, id, { prompt: "yes" }), [ref]);
  assert.deepEqual(store.getItem(id).job.repoWrites, [ref]);
  assert.deepEqual(promptHook(home, id, { prompt: "also README.md please" }), [path.join(repo, "README.md")]);
});

test("settings and prompt: workers get the prompt hook and see what they may edit", () => {
  const { home, store, repo, id } = setup();
  assert.ok(headlessSettings(home, id).hooks.UserPromptSubmit, "worker");
  assert.equal(headlessSettings(home).hooks.UserPromptSubmit, undefined, "sweep and replies runs");
  reply(store, id, "README.md");
  const item = store.getItem(id);
  const prompt = workerPrompt(home, { ...item, job: { ...item.job, workDir: "/w", dir: "/j" } }, store.config());
  assert.ok(prompt.includes(`allowed now: ${path.join(repo, "README.md")}`));
  const off = workerPrompt(home, { ...item, job: { ...item.job, workDir: "/w", dir: "/j" } }, {});
  assert.ok(!off.includes("Repo files"), "no roots: no repo line");
});
