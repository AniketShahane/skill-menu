#!/usr/bin/env bash
# Health check: runs headless exactly like cron does and reports what that run can see and do.
# 1) which connector tools a `claude -p` run loads, 2) whether it can post to the self-DM.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AQ="$SKILL_DIR/scripts/aq.mjs"
export ASK_QUEUE_HOME="${ASK_QUEUE_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/ask-queue}"
export PATH="$HOME/.local/bin:$HOME/.claude/local:/usr/local/bin:$PATH"
CLAUDE_BIN="${ASK_QUEUE_CLAUDE_BIN:-$(command -v claude || true)}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

command -v node >/dev/null || fail "node is not installed (need Node 20+)"
[ -n "$CLAUDE_BIN" ] && [ -x "$CLAUDE_BIN" ] || fail "claude CLI not found; set ASK_QUEUE_CLAUDE_BIN"
[ -f "$ASK_QUEUE_HOME/config.json" ] || fail "not set up: run install.sh, then 'set up ask queue' in claude"

SELF_DM="$(node "$AQ" config get slack.selfDmId | tr -d '"')"
[ -n "$SELF_DM" ] && [ "$SELF_DM" != "null" ] || fail "slack.selfDmId is not configured (run setup)"

mkdir -p "$ASK_QUEUE_HOME/tmp" "$ASK_QUEUE_HOME/logs"
SETTINGS="$ASK_QUEUE_HOME/tmp/headless-settings.json"
node "$AQ" settings >"$SETTINGS"

echo "Claude Code: $("$CLAUDE_BIN" --version 2>/dev/null || echo unknown)"
node "$SKILL_DIR/scripts/gate.mjs" check || fail "gate token check failed (fix or remove ~/.config/ask-queue/slack-token)"
echo "Data dir:    $ASK_QUEUE_HOME"
echo "Running a headless check (about a minute)..."

PROMPT="ask-queue health check. Do only these two things, then answer.
1. Use ToolSearch (queries: slack, atlassian jira, zoom, gmail, google drive) to list the MCP tools available in this session.
2. Call slack_send_message with channel_id \"$SELF_DM\" and message \"🤖 ask-queue health check: headless runs can post here.\"
Answer with only this JSON: {\"slack\":{\"search\":bool,\"read_thread\":bool,\"send_message\":bool,\"send_message_draft\":bool},\"jira\":{\"search\":bool},\"zoom\":{\"tools\":[string]},\"gmail\":{\"search\":bool,\"create_draft\":bool},\"drive\":{\"read\":bool,\"create_file\":bool},\"posted_to_self_dm\":bool,\"error\":string}"

cd "$ASK_QUEUE_HOME"
"$CLAUDE_BIN" -p "$PROMPT" \
  --model sonnet \
  --permission-mode dontAsk \
  --settings "$SETTINGS" \
  --disallowedTools WebFetch WebSearch \
  --output-format text

cat <<'EOF'

Read the JSON above:
- slack.search, slack.read_thread and slack.send_message_draft must be true, and posted_to_self_dm
  must be true (check your Slack self-DM for the message). Otherwise see "If the health check
  fails" in references/setup.md.
- jira / zoom / gmail only matter for the sources you enable.
EOF
