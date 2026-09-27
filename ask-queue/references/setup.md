# Setup

One-time, interactive, on the machine that will run the cron jobs (for example the user's EC2
instance), in a normal `claude` session logged in with the user's claude.ai account. The claude.ai
connectors (Slack required; Jira, Zoom, Gmail optional) must already be connected at claude.ai.

## Steps

1. **Install.** If `$AQ` is not under `~/.claude/skills/ask-queue`, have the user run
   `ask-queue/scripts/install.sh` from their clone. It copies the skill and runs `$AQ init`.
2. **Timezone.** Ask for the IANA timezone (e.g. `America/Los_Angeles`); compare with the system
   timezone and the Slack profile's timezone, and confirm when they differ.
   `$AQ config set timezone <tz>`.
3. **Slack identity.** Find the user's Slack user id (`slack_search_users` with their name or email;
   ask for it if the search is ambiguous). `$AQ config set slack.userId U…`.
4. **Self-DM.** `slack_send_message` with `channel_id` = the user id and message
   `🤖 ask-queue is connected. Cards will show up here.` Take the DM channel id (starts with `D`) from
   the result; if it is missing, find that message with `slack_search_public_and_private`.
   `$AQ config set slack.selfDmId D…`.
5. **Sources.** Slack is on by default. Recommend running on Slack alone for a few days, then adding
   Jira, Zoom and Gmail in that order. To enable one: `$AQ config set sources.<name> true`.
   - Jira: `getAccessibleAtlassianResources` → `$AQ config set jira.cloudId …`; the user's account id
     → `jira.accountId`; optional `jira.projects` as a JSON array of keys.
   - Zoom: run the connector's authenticate flow now, in this interactive session.
   - Gmail: nothing to configure.
6. **Jump-start memory** (read-only, optional, recommended). Read the user's last ~30 sent Slack
   messages (`from:<@{userId}>`) and ~15 sent emails (`in:sent`). Write concrete rules to
   `memory/style.md` and recurring askers to `memory/people.md`. Then ask the user: "Who asks you for
   things most often, and where do the answers usually live?" and record that in people.md and
   projects.md.
7. **Health check.** Run `scripts/doctor.sh`. It starts a headless `claude -p` run the way cron will,
   reports which connector tools that run can see, and posts one test message to the self-DM.
8. **Schedule.** Give the user these lines for `crontab -e` (adjust the timezone and hours):

```
CRON_TZ=America/Los_Angeles
7 8-20/2 * * 1-5  $HOME/.claude/skills/ask-queue/scripts/run.sh sweep
*/15 8-20 * * 1-5 $HOME/.claude/skills/ask-queue/scripts/run.sh replies
```

Runs never overlap (the second one exits when the first holds the lock). Logs:
`~/.local/share/ask-queue/logs/`. The guard's allow/deny decisions: `logs/guard.log`.

## If the health check fails

Headless `claude -p` runs have had bugs where claude.ai connector tools (Slack, Atlassian) were missing or
read-only. If `doctor.sh` shows missing Slack tools or the test message fails:

1. Update Claude Code and re-run `doctor.sh`.
2. If it still fails, run the queue inside one long-lived interactive session instead of cron, with
   the same guard (interactive sessions load claude.ai connectors):

```
tmux new -s ask-queue
claude --permission-mode dontAsk --settings ~/.local/share/ask-queue/tmp/headless-settings.json
> /loop 15m use ask-queue in replies mode (unattended: never ask in chat)
> /loop 2h use ask-queue in sweep mode (unattended: never ask in chat)
```

`/loop` jobs expire after 7 days, so restart that session weekly. `doctor.sh` writes the settings file.
