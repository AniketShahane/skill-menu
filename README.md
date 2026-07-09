# skill-menu

Agent skills for [Claude Code](https://docs.claude.com/en/docs/claude-code) and Codex. Each top-level folder is one self-contained skill: clone the repo, run the installer, and go.

First on the menu: **Working Memory**, a daily planning ritual with a live visual board.

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
  working-memory/
    SKILL.md          # the skill definition your agent reads
    references/       # standup / shutdown / setup flows
    scripts/          # install + studio lifecycle
    assets/           # the studio web app (source only)
```

More skills will be added over time.
