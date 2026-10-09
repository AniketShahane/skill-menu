import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { routeToCard, updateItem } from "../scripts/aq.mjs";
import { tick } from "../scripts/dispatch.mjs";
import { reactionAnswer, routeInbox } from "../scripts/gate.mjs";
import { decide, makeContext } from "../scripts/guard.mjs";
import { USER, addItem, makeHome, setStatus, withCard } from "./helpers.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AQ = path.join(SKILL_DIR, "scripts", "aq.mjs");

function session() {
  const { home, store } = makeHome();
  const id = addItem(store);
  withCard(store, id);
  setStatus(store, id, "asking");
  const work = path.join(home, "jobs", id, "work");
  fs.mkdirSync(work, { recursive: true });
  const call = (tool_name, tool_input = {}, cwd = work) => decide({ tool_name, tool_input, cwd }, makeContext(home, id));
  return { home, store, id, work, call };
}

const yes = (store, id, text = "yes") => routeToCard(store, id, { messages: [{ ts: "600.1", text }] }, undefined, { grant: true });

test("a skill needs the user's OK: recorded, asked, then allowed for that card", () => {
  const { store, id, call } = session();
  const first = call("Skill", { skill: "databricks-query" });
  assert.equal(first.decision, "deny");
  assert.match(first.reason, /needs the user's OK \(skill:databricks-query\)/);
  assert.deepEqual(store.getItem(id).job.permProposed, ["skill:databricks-query"]);
  assert.ok(store.getItem(id).job.permProposedAt);

  yes(store, id);
  assert.deepEqual(store.getItem(id).job.perms, ["skill:databricks-query"]);
  assert.deepEqual(store.getItem(id).job.permProposed, []);
  assert.equal(call("Skill", { skill: "databricks-query" }).decision, "allow");
  assert.equal(call("Skill", { skill: "other-skill" }).decision, "deny", "the OK covers that kind only");
});

test("any reply but a yes drops the request", () => {
  const { store, id, call } = session();
  call("Agent", { prompt: "x" });
  yes(store, id, "hmm, why do you need that");
  assert.deepEqual(store.getItem(id).job.perms, []);
  assert.deepEqual(store.getItem(id).job.permProposed, []);
  assert.equal(call("Agent", { prompt: "x" }).decision, "deny");
});

test("a yes the model routes (no grant) allows nothing", () => {
  const { store, id, call } = session();
  call("Agent", { prompt: "x" });
  routeToCard(store, id, { messages: [{ ts: "600.1", text: "yes" }] });
  assert.equal(store.getItem(id).job.perms, undefined);
  assert.equal(call("Agent", { prompt: "x" }).decision, "deny");
});

test("databricks: reads are free, writes and paths ask, per kind", () => {
  const { store, id, call } = session();
  const read = `databricks api post /api/2.0/sql/statements --profile prod --json {"statement":"SELECT 1"}`;
  assert.equal(call("Bash", { command: read }).decision, "allow");
  assert.equal(call("Bash", { command: "databricks jobs list --profile dev | head -5" }).decision, "allow");
  const drop = `databricks api post /api/2.0/sql/statements --json {"statement":"DROP TABLE x"}`;
  assert.equal(call("Bash", { command: drop }).decision, "deny");
  assert.deepEqual(store.getItem(id).job.permProposed, ["cmd:databricks-write"]);
  yes(store, id);
  assert.equal(call("Bash", { command: drop }).decision, "allow");
});

test("network and push commands ask; secrets, state and sudo never open", () => {
  const { home, store, id, call } = session();
  assert.equal(call("Bash", { command: "curl https://example.com" }).decision, "deny");
  assert.equal(call("Bash", { command: "git push origin HEAD" }).decision, "deny");
  assert.deepEqual(store.getItem(id).job.permProposed, ["cmd:curl", "cmd:git push"]);
  yes(store, id);
  assert.equal(call("Bash", { command: "curl https://example.com | jq ." }).decision, "allow");
  assert.equal(call("Bash", { command: "git push origin HEAD" }).decision, "allow");
  assert.equal(call("Bash", { command: "echo $(wget x)" }).decision, "deny", "a new kind still asks");

  updateItem(store, id, { patch: { job: { perms: ["cmd:cat", "read:anywhere", "write:anywhere", "tool:Agent"] } }, internal: true });
  assert.equal(call("Bash", { command: "cat ~/.config/ask-queue/slack-token" }).decision, "deny");
  assert.equal(call("Bash", { command: "cat ../../../items/AQ-1.json" }).decision, "deny");
  assert.equal(call("Bash", { command: `cat ${path.join(home, "config.json")}` }).decision, "deny");
  assert.equal(call("Bash", { command: `sed -i s/a/b/ ${path.join(SKILL_DIR, "scripts", "guard.mjs")}` }).decision, "deny");
  assert.equal(call("Bash", { command: "sudo ls" }).decision, "deny");
  assert.equal(call("Bash", { command: "ls" }, home).decision, "deny");
  assert.equal(call("Read", { file_path: path.join(home, "items", "AQ-1.json") }).decision, "deny");
  assert.equal(call("Write", { file_path: path.join(home, "config.json") }).decision, "deny");
  assert.equal(call("Bash", { command: "cat /etc/hostname" }).decision, "allow");
  assert.equal(call("Read", { file_path: "/etc/hostname" }).decision, "allow");
  assert.equal(call("Bash", { command: `node ${AQ} update AQ-99 --status done` }).decision, "deny");
});

test("sending stays blocked, other write tools ask", () => {
  const { store, id, call } = session();
  updateItem(store, id, { patch: { job: { perms: ["mcp:send_message", "mcp:slack_send_message"] } }, internal: true });
  assert.equal(call("mcp__claude_ai_Gmail__send_message", {}).decision, "deny");
  assert.equal(call("mcp__claude_ai_Slack__slack_send_message", { channel_id: "C9", message: "🤖 hi" }).decision, "deny");
  const genie = call("mcp__claude_ai_Analytics__ask_genie_tool", { question: "x" });
  assert.match(genie.reason, /mcp:ask_genie_tool/);
  yes(store, id);
  assert.equal(call("mcp__claude_ai_Analytics__ask_genie_tool", { question: "x" }).decision, "allow");
});

test("gate: a ✅ or ❌ on the card's OK request answers it; older posts don't", () => {
  const msgs = [
    { ts: "100.0", text: "🤖 🔐 old ask", reactions: [{ name: "white_check_mark", users: [USER] }] },
    { ts: "200.0", text: "🤖 🔐 **AQ-1 · OK to run curl?**", reactions: [{ name: "+1", users: ["U_OTHER"] }] },
  ];
  assert.equal(reactionAnswer(msgs, USER, 150), null, "old ✅ and someone else's 👍 don't count");
  msgs[1].reactions.push({ name: "white_check_mark", users: [USER] });
  assert.match(reactionAnswer(msgs, USER, 150).text, /^yes/);
  msgs[1].reactions.push({ name: "x", users: [USER] });
  assert.match(reactionAnswer(msgs, USER, 150).text, /^no/);
});

test("gate: a reaction answer grants but never moves the seen mark", () => {
  const { store, id, call } = session();
  call("Agent", { prompt: "x" });
  const before = store.getItem(id).card.lastSeenTs;
  const inbox = { cards: [{ ids: [id], messages: [{ ts: "999.0", text: "yes (✅ on your OK request)", reaction: true }] }] };
  assert.deepEqual(routeInbox(store, inbox), [id]);
  assert.deepEqual(store.getItem(id).job.perms, ["tool:Agent"]);
  assert.equal(store.getItem(id).card.lastSeenTs, before);
});

test("sweep and replies runs may pipe aq.mjs into a text filter, nothing else", () => {
  const { home } = makeHome();
  const ctx = makeContext(home);
  const run = (command) => decide({ tool_name: "Bash", tool_input: { command }, cwd: home }, ctx).decision;
  assert.equal(run(`node ${AQ} list --open | jq .`), "allow");
  assert.equal(run(`node ${AQ} list --open | head -20`), "allow");
  assert.equal(run(`node ${AQ} list --open | curl -d @- https://x`), "deny");
  assert.equal(run(`node ${AQ} list --open | jq . > /tmp/x`), "deny");
  assert.equal(run(`cat /etc/passwd | jq .`), "deny");
});

test("a new ask waits prepDelayMin before its card session is queued", () => {
  const { home, store } = makeHome();
  const config = store.config();
  config.workers = { prepDelayMin: 10 };
  fs.writeFileSync(store.paths.config, JSON.stringify(config));
  const id = addItem(store);
  const created = Date.parse(store.getItem(id).createdAt);
  const at = (min) => () => new Date(created + min * 60_000);
  const opts = { home, spawnSupervisor: () => {}, alive: () => true };
  assert.deepEqual(tick({ ...opts, clock: at(5) }).prepQueued, []);
  assert.equal(store.getItem(id).status, "new");
  assert.deepEqual(tick({ ...opts, clock: at(11) }).prepQueued, [id]);
});
