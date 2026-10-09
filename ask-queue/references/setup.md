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
7. **Token-free gate (optional, recommended).** Without it, every scheduled run starts Claude, even
   when nothing is new. With it, `scripts/gate.mjs` checks Slack itself and starts Claude only when
   there is work. The user creates a Slack app for their own workspace (api.slack.com/apps, "From
   scratch"), adds the **User Token Scope** `im:history` (not a bot scope; optionally also the legacy
   `search:read`, which lets the gate skip quiet sweeps too), installs it (Enterprise Grid orgs may
   need admin approval), and saves the User OAuth Token (`xoxp-…`, not the bot's `xoxb-`):

   ```
   mkdir -p ~/.config/ask-queue && chmod 700 ~/.config/ask-queue
   (umask 077; cat > ~/.config/ask-queue/slack-token)   # paste the token, then Ctrl-D
   ```

   It must stay outside the data directory, so the guarded model can never read it. The gate calls
   only four read methods. A single-workspace app counts as an internal app, so Slack's 2025 limits
   for non-Marketplace apps don't apply.
8. **Health check.** Run `scripts/doctor.sh`. It checks the gate token if there is one, starts a headless `claude -p`
   run the way cron will, reports which connector tools that run can see, and posts one test
   message to the self-DM.
9. **Schedule.** Give the user these lines for `crontab -e` (adjust the timezone and hours):

```
CRON_TZ=America/Los_Angeles
1-59/15 8-20 * * 1-5  $HOME/.claude/skills/ask-queue/scripts/run.sh sweep
*/2 8-20 * * 1-5  $HOME/.claude/skills/ask-queue/scripts/run.sh replies
```

The gate runs first every time. With a token, a reply in a card thread reaches that card's session
in about 2 minutes, and a quiet check costs nothing. Without one, the gate lets replies through only
every 15 minutes, as before. Sweeps run every 15 minutes either way (odd minutes, so they never
clash with a replies check on the shared lock).

Every card has its own Claude session. After every check (sweep or replies, run or skipped),
`scripts/dispatch.mjs tick` (no model) starts queued sessions: new asks to prep, cards with new
replies, work after "go". Each session is a background `claude --bg` session named
`AQ-n <first words of the title>` (30 characters at most), so it shows in Claude Code's agent view (`claude agents`): under "working" while a
round runs, then under "completed" (it's stopped between rounds so it doesn't hold memory). It runs
in its own folder under `~/.local/share/ask-queue/jobs/AQ-n/work` and is resumed there for every
round. Background sessions only start (and only run the guard hook) in trusted folders, so the
first run marks `jobs/` as trusted in every claude config file (`~/.claude.json`, and
`$CLAUDE_CONFIG_DIR/.claude.json` or `~/.claude/.claude.json`): cron and the background daemon can
read different ones. Each session has a fail-closed
guard: edits and commands only in that folder (plus memory notes), `aq.mjs` changes only to its own
item, Slack posts only in its card thread (plus posting the card itself once), no network commands
and no push. Limits live in `config.workers`: `max` 5 sessions at once, `dailyRuns` 100 runs a day;
card runs `cardModel` sonnet, `cardEffort` medium, `cardTimeLimitMin` 20; work runs `model` opus,
`timeLimitMin` 60. There's no per-run dollar cap: `claude --max-budget-usd` only works in `-p` mode.
Change one with `$AQ config set workers.max 3`. Sweep and replies runs use `config.models` (both
sonnet). A model name (`opus`, `sonnet`, `haiku`) in any card reply switches that card's sessions to
it until changed; the card shows its model on a 🧠 line. A card session reacts 👀 to each of your
card-thread messages when it reads them. A closed
card keeps its session for 48 hours.

Repo edits: `$AQ config set repoEdit.roots '["/path/to/repo"]'` lets card sessions read and search
those folders (secrets like `.env` and `credentials*` stay closed) and edit a file there once you
allow it. Name the path in a card reply or type it into the session to allow it. Or describe the file
loosely: the session finds it, asks "OK to edit …?", and your yes allows it. Sessions never commit
there. Empty (the default): sessions edit only their job folder. Code work uses a git worktree at `jobs/AQ-n/work/repo` on a
local branch `aq/AQ-n-…`; when you're done with it, push the branch yourself and remove the
worktree with `git worktree remove`.

Runs never overlap (the second one exits when the first holds the lock). Skipped checks log one line. Logs:
`~/.local/share/ask-queue/logs/`. The guard's allow/deny decisions: `logs/guard.log`.

## If the health check fails

Headless `claude -p` runs have had bugs where claude.ai connector tools (Slack, Atlassian) were missing or
read-only. If `doctor.sh` shows missing Slack tools or the test message fails:

1. Update Claude Code and re-run `doctor.sh`.
2. If it still fails, run the queue inside one long-lived interactive session instead of cron, with
   the same guard (interactive sessions load claude.ai connectors). With a gate token, prefer
   `> watch my queue`: a Monitor runs `gate.mjs watch` and wakes Claude only on new messages or asks.
   Without one, use `/loop`:

```
tmux new -s ask-queue
claude --permission-mode dontAsk --settings ~/.local/share/ask-queue/tmp/headless-settings.json
> /loop 15m use ask-queue in replies mode (unattended: never ask in chat)
> /loop 2h use ask-queue in sweep mode (unattended: never ask in chat)
```

`/loop` jobs expire after 7 days, so restart that session weekly. `doctor.sh` writes the settings file.
