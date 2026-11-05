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
7. **Slack bot (optional, recommended).** Without it, cards live in the self-DM and every scheduled
   check starts Claude. With it, cards live in the bot's DM, the watcher hears the user's messages
   there at once with no Claude run, and the 2-minute check is free when nothing is new.
   - The user creates a Slack app for their workspace (api.slack.com/apps, "From scratch"; company
     workspaces may need a security review and admin approval). **Bot token scopes only, exactly:**
     `chat:write`, `im:history`, `im:read`, `users:read`. No user token scopes. Turn on **Socket
     Mode** (make an app-level token with `connections:write`), **Event Subscriptions** with the
     bot event `message.im`, and in **App Home** the Messages tab with "Allow users to send
     messages". Install it.
   - Tokens: the bot token (`xoxb-`) and the app-level token (`xapp-`). Either in files outside the
     data directory:

     ```
     mkdir -p ~/.config/ask-queue && chmod 700 ~/.config/ask-queue
     (umask 077; cat > ~/.config/ask-queue/slack-token)       # bot token, then Ctrl-D
     (umask 077; cat > ~/.config/ask-queue/slack-app-token)   # app-level token, then Ctrl-D
     ```

     or in AWS Secrets Manager as `<prefix>/bot-token` and `<prefix>/app-token`, with
     `~/.config/ask-queue/aws.json` = `{"region": "us-west-2", "prefix": "<prefix>"}`. The machine's
     role needs `secretsmanager:GetSecretValue` on those two. Once `aws.json` exists, the files are
     not read: delete them. Check with `node <skill-dir>/scripts/slack.mjs check`.
   - Connect: `node <skill-dir>/scripts/slack.mjs connect` posts a hello into the bot DM and saves
     its channel id as `slack.cardChannel`. From then on new cards go there. Cards already in the
     self-DM stay there until they close; a Claude replies run reads them every 15 minutes.
   - With the guard off, sessions could read the tokens; the scopes above are why that is OK: the
     bot can read and write only its own DM with the user (and look up user names).
8. **Health check.** Run `scripts/doctor.sh`. It checks the gate token if there is one, starts a headless `claude -p`
   run the way cron will, reports which connector tools that run can see, and posts one test
   message to the self-DM.
9. **Schedule.** Give the user these lines for `crontab -e` (adjust the timezone and hours):

```
CRON_TZ=America/Los_Angeles
1-59/15 8-20 * * 1-5  $HOME/.claude/skills/ask-queue/scripts/run.sh sweep
*/2 8-20 * * 1-5  $HOME/.claude/skills/ask-queue/scripts/run.sh replies
* * * * *  $HOME/.claude/skills/ask-queue/scripts/watch.sh
```

The last line only matters with the Slack bot: it starts the watcher (`watch.mjs`) and restarts it
within a minute if it dies; while it runs, the line does nothing. The watcher hands a new bot-DM
message to a session within seconds. Its log is `logs/watch-<date>.log`; every request it, the
gate and `slack.mjs post` handle is one line in `logs/events.jsonl` (time, event id, channel,
user, action, item).

The gate runs first every time. With the bot, a reply in a card thread reaches that card's session
in seconds (watcher) or about 2 minutes (gate), and a quiet check costs nothing. Without one, the gate lets replies through only
every 15 minutes, as before. Sweeps run every 15 minutes either way (odd minutes, so they never
clash with a replies check on the shared lock).

Every card has its own Claude session. After every check (sweep or replies, run or skipped),
`scripts/dispatch.mjs tick` (no model) starts queued sessions: new asks to prep, cards with new
replies, work after "go". Each session is a background `claude --bg` session named
`AQ-n <first words of the title>` (30 characters at most), so it shows in Claude Code's agent view (`claude agents`): under "working" while a
round runs, then under "completed" (it's stopped between rounds so it doesn't hold memory). It runs
in its own folder under `~/.local/share/ask-queue/jobs/AQ-n/work` and is resumed there for every
round. Background sessions only start in trusted folders, so the
first run marks `jobs/` as trusted in every claude config file (`~/.claude.json`, and
`$CLAUDE_CONFIG_DIR/.claude.json` or `~/.claude/.claude.json`): cron and the background daemon can
read different ones. Sessions run with
`bypassPermissions` and no guard hook (`guard.mjs` is off for now): nothing is blocked. The prompt
tells them to ask in the card thread before three things: changing main, sending as you, and
writing to production data (`$AQ config set prodProfile <profile>` names your production Databricks profile). A new ask waits `prepDelayMin` 10 minutes, then the sweep checks it
still needs a session: if you replied or reacted 👀, another card has it, or one of your own Claude
sessions is on it, no session starts. Unchecked after `precheckWaitMin` 45 more minutes, it starts anyway.
Start a self-DM message with "Claude," to ask directly: the answer comes in that message's thread.
Limits live in `config.workers`: `max` 5 sessions at once, `dailyRuns` 100 runs a day;
card runs `cardModel` sonnet, `cardEffort` medium, `cardTimeLimitMin` 20; work runs `model` opus,
`timeLimitMin` 60. There's no per-run dollar cap: `claude --max-budget-usd` only works in `-p` mode.
Change one with `$AQ config set workers.max 3`. Sweep and replies runs use `config.models` (both
sonnet). A model name (`opus`, `sonnet`, `haiku`) in any card reply switches that card's sessions to
it until changed; the card shows its model on a 🧠 line. A card session reacts 👀 to each of your
card-thread messages when it reads them. A closed
card keeps its session for 7 days.

Repo: `$AQ config set repo /path/to/repo`. Every card gets its own git worktree of it at
`jobs/AQ-n/work/repo`, on a local branch `aq/AQ-n-…`, and its session starts there, so it loads
that repo's CLAUDE.md, skills and memory. Add this line to that repo's CLAUDE.md:
`- In an ask-queue card session (your own `aq/` worktree), the card thread is the chat: commit freely on that branch, keep scratch in `aq-scratch/`, and bring to main only the files the user names there.`
Before the
worktree is made, the repo as it is (committed, changed and new files; `.gitignore`d files, secrets
and new files over 20 MB left out) is saved as one commit on top of the rolling `aq-backup` branch
and pushed to origin. Main, the index and your files are not touched, and nothing changed means no
new commit. The worktree starts from that snapshot, so `git diff <job.base> aq/AQ-n-…` shows only
the session's changes. Bring them to main yourself.

A closed card keeps its session and worktree for `records.keepDays` (7). Then its record goes to
`<repo>/<records.dir>/<YYYY-MM>/AQ-n.md`, leftovers are committed on its branch, and the worktree
is removed. Records are committed to `records.branch` once a day, never pushed. Set them with
`$AQ config set records '{"dir":"ask-queue-records","branch":"main","keepDays":7,"since":"<today>"}'`
(`since`: cards closed before it get a record only if they still have a worktree).

Runs never overlap (the second one exits when the first holds the lock). Skipped checks log one line. Logs:
`~/.local/share/ask-queue/logs/`.

Retention: stored messages are kept 90 days. Once a day the tick deletes closed items (done,
skipped, filtered) that closed more than 90 days ago, with their job folder, worktree and artifacts,
plus ledger lines, `events.jsonl` lines, logs and tmp files older than that. Git branches stay.
Run it by hand with `node <skill-dir>/scripts/dispatch.mjs purge`. Claude Code deletes its own
session transcripts after `cleanupPeriodDays` (30 by default).

## If the health check fails

Headless `claude -p` runs have had bugs where claude.ai connector tools (Slack, Atlassian) were missing or
read-only. If `doctor.sh` shows missing Slack tools or the test message fails:

1. Update Claude Code and re-run `doctor.sh`.
2. If it still fails, run the queue inside one long-lived interactive session instead of cron, with
   the same settings (interactive sessions load claude.ai connectors). With a gate token, prefer
   `> watch my queue`: a Monitor runs `gate.mjs watch` and wakes Claude only on new messages or asks.
   Without one, use `/loop`:

```
tmux new -s ask-queue
claude --permission-mode bypassPermissions --settings ~/.local/share/ask-queue/tmp/headless-settings.json
> /loop 15m use ask-queue in replies mode (unattended: never ask in chat)
> /loop 2h use ask-queue in sweep mode (unattended: never ask in chat)
```

`/loop` jobs expire after 7 days, so restart that session weekly. `doctor.sh` writes the settings file.
