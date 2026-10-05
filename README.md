# skill-menu

Agent skills for [Claude Code](https://docs.claude.com/en/docs/claude-code) and Codex. Each top-level folder is one self-contained skill: clone the repo, run the installer, and go.

On the menu:

- **Ask Queue** (new): turns asks from Slack, Jira, Zoom and Gmail into cards in your own Slack DM, asks only what it can't work out, and prepares drafts you read and send. It learns from every ask. Built to replace Working Memory.
- **Working Memory**: a daily planning ritual with a live visual board.
- **Android App Craft** (new): build native Android apps (Kotlin + Compose, Material 3 Expressive) that look and move like a premium app. Comes with a starter app that builds and passes its tests.
- **iOS App Craft** (new): the same for SwiftUI on iOS, including porting an Android app. Comes with a starter app and a card-to-page flight engine.

---

## What the app-craft skills do

Two sister skills, distilled from shipped apps (a running app and a phone-to-TV casting app). They load on their own when you ask your agent for Android or iOS app work.

- **A playbook.** `SKILL.md` gives the workflow and the rules that cost the most to learn. `references/` covers theme and type, motion, page transitions and shared elements, components, testing, performance and delivery. Every rule carries the measurement or bug behind it.
- **A starter app.** `templates/new-app.sh` copies a small app that already has the theme, motion system, navigation, tests and device scripts, renamed to your app.
- **Worked examples.** `examples/` shows the techniques in full files. The casting app's files are copied from its public repo; the rest are generic rewrites of code from a private app.
- **A learning loop.** `lessons-log.md` collects what went wrong during a project. At the end, say "update the android skill with what we learned" (or the iOS one) and it folds the lessons into the guides.

### Install

```bash
git clone https://github.com/AniketShahane/skill-menu.git
cd skill-menu
mkdir -p ~/.claude/skills
cp -R android-app-craft ios-app-craft ~/.claude/skills/
```

Then ask for an app, e.g. "start a new android app: a plant watering tracker". Android needs JDK 21 and the Android SDK; iOS needs Xcode and XcodeGen.

`android-app-craft` points to an older taste-level skill, `android-design`, for design method. It isn't in this repo. The Android skill works without it, and its `references/android-design-corrections.md` lists where the two disagree.

---

## What Ask Queue does

Every ask aimed at you becomes one card in your Slack self-DM, and every card ends in one yes/no.

1. **Every 2 hours** it collects new asks (Slack DMs and @mentions first; Jira, Zoom and Gmail when enabled).
2. **Before bothering you** it reads the thread, the linked docs and its memory, then either drafts the answer (**Ready** card) or asks 1–3 questions, each with a labeled best guess (**Need answers** card). Reply `ok` to accept the guesses.
3. **You reply in the card's thread** (`yes`, `skip`, answers, or "make it shorter"). It checks every 15 minutes.
4. **It creates drafts, never sends.** Slack replies become native Slack drafts in the original thread; email replies become Gmail drafts; bigger write-ups become private Google Docs. You review and send.
5. **It learns.** Every ask, question, draft and what you actually sent goes into a ledger. Answers and your edits update its memory of people, projects, your writing style and playbooks. When you approve 5 drafts of one kind unedited, it offers to stop asking questions for that kind.

Top-level commands in your self-DM: `ask: <anything>` adds an ask, `note: <fact>` teaches it something, `status` shows the queue.

**Safety:** unattended runs go through a fail-closed hook (`ask-queue/scripts/guard.mjs`) that allows only reads and drafts, and messages only to your own DM. The hook enforces this, so it doesn't rely on instructions alone.

### Install on the machine that will run it (e.g. an EC2 instance)

Needs Node.js 20+ and Claude Code logged in with your claude.ai account, with the Slack connector connected at claude.ai.

```bash
git clone https://gitlab.com/ashahane1/skill-menu.git
cd skill-menu
./ask-queue/scripts/install.sh
claude   # then say: "set up ask queue"
```

Setup finds your Slack ids, posts a hello to your self-DM, optionally learns your writing style from recent sent messages, runs `scripts/doctor.sh` (a headless health check), and gives you the two cron lines. Your data stays in `~/.local/share/ask-queue`, outside this repo.

Run the tests with `node --test 'ask-queue/tests/*.test.mjs'`.

---

## What Working Memory does

It turns your day into a plan your agent actually maintains:

- **Morning standup.** Scans your open items and yesterday's leftovers, then interviews you one task at a time until each task has a clear outcome, done-criteria, and time estimate. Writes it all to a local JSON archive.
- **During the day.** Say "add a task" or "capture this" to drop new work in. Say "track Sam's report" to follow someone else's deliverable without making it your task.
- **Evening shutdown.** Reviews what got done, rolls the rest into tomorrow, closes the day.
- **The studio (optional).** A local web board at `http://127.0.0.1:3020/studio` that shows your day as draggable lanes: move tasks, mark them done, capture new ones. Runs only on your machine.

The payoff: every task comes out **agent-ready**. Because the standup forces a real objective and done-criteria, any task can be copied out as a complete brief and handed to a coding agent to execute.

---

## Install (2 minutes)

You need Claude Code or Codex. Node.js 20+ only if you want the studio board.

```bash
git clone https://gitlab.com/ashahane1/skill-menu.git
cd skill-menu
./working-memory/scripts/install-skill.sh --claude   # or --codex
```

Then open your agent and say:

> **"set up working memory"**

That runs a guided one-time wizard: it checks prerequisites, asks where to store your notes, writes the config, and verifies everything with a health check. When it finishes, you're ready.

To start the studio board:

```bash
./working-memory/scripts/ensure-studio.sh   # installs deps + serves http://127.0.0.1:3020/studio
```

Stop it anytime with `./working-memory/scripts/stop-studio.sh`.

---

## Daily use: what to say

| You say | What happens |
|---|---|
| "run my morning standup" | Builds today's plan, task by task, with your approval |
| "add a task" / "capture this" | Quick-adds one item to today |
| "track [person]'s work" | Adds a tracker for someone else's deliverable |
| "show today's plan" | Summarizes tasks, trackers, and schedule |
| "evening shutdown" | Closes the day, carries leftovers to tomorrow |
| Click "Grill" / "Re-grill" on a task in the studio | Runs the qualification interview in-app and drafts the ticket fields for you to accept (needs `WORKING_MEMORY_ENABLE_GRILL=true`) |

---

## Getting the most out of it

1. **Run both rituals daily.** Carry-forward is the whole engine: skipped shutdowns mean lost context the next morning.
2. **Answer the standup questions honestly.** It asks "what proves this is done?" for a reason. A well-grilled task is a brief you can delegate; a vague one is just a reminder.
3. **Keep the studio open.** Plans change by 11am. Dragging a task to Done or capturing a new one takes two seconds and keeps the archive true.
4. **Use trackers for other people's work.** Waiting on a review or a handoff? Track it instead of letting it squat in your task list.
5. **Respect the 1-3-5 shape.** One focus item, three tasks, five quick items. The skill suggests it softly; overloaded days get a cut line, not silent overbooking.
6. **Connect sources when ready.** The skill works fully manual out of the box. Wire up Slack, Gmail, Jira, or Calendar connectors later and the morning scan starts finding candidate work for you.

---

## Your data

Everything stays on your machine. Notes live in your local data directory (`~/.local/share/working-memory` by default), never inside this repo, and the studio serves only `127.0.0.1`. The installer skips your archive and `.gitignore` blocks it, so personal notes can never be committed here.

Useful overrides, all optional:

| Variable | Controls |
|---|---|
| `INTERACTIVE_MEMORY_DIR` | Where your notes archive lives |
| `WORKING_MEMORY_STUDIO_PORT` | Studio port (default 3020) |
| `WORKING_MEMORY_ENABLE_GRILL` | Turn on in-app grilling (Grill/Re-grill buttons) in the studio; default off |
| `CLAUDE_HOME` / `CODEX_HOME` | Where the skill installs |

Persistent overrides go in `~/.config/working-memory/ensure-studio.local.sh`, which the studio script loads automatically.

---

## Layout

```
skill-menu/
  ask-queue/
    SKILL.md          # rules, modes, state CLI
    references/       # sweep / replies / cards / learn / setup
    scripts/          # aq.mjs (state), guard.mjs (safety hook), run.sh (cron), doctor.sh, install.sh
    templates/memory/ # seed memory files
  android-app-craft/ # Kotlin + Compose playbook, starter app, examples
  ios-app-craft/     # SwiftUI playbook, starter app, examples
  working-memory/
    SKILL.md          # the skill definition your agent reads
    references/       # standup / shutdown / setup flows
    scripts/          # install + studio lifecycle
    assets/           # the studio web app (source only)
```

More skills will be added over time.
