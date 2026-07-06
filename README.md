# skill-menu

A menu of agent skills for [Claude Code](https://docs.claude.com/en/docs/claude-code) (and Codex), starting with **Working Memory**: a daily standup / shutdown ritual with a live visual studio.

Each top-level folder is one self-contained skill. Clone it, install the skill you want, and go.

---

## What's on the menu

| Skill | What it does |
|---|---|
| [`working-memory`](./working-memory) | Runs a morning standup and evening shutdown over a file-backed daily-notes archive. Aggregates your open tasks, carries yesterday forward, and serves an optional local web "studio" that renders the day as an interactive board. |

More skills will be added over time.

---

## Working Memory, in one screen

- **Morning standup:** builds today's plan from your open items and yesterday's carry-forward, then writes a structured day file.
- **Evening shutdown:** reviews what got done, rolls the rest forward, and closes the day.
- **The studio (optional):** a small Next.js app that reads your archive and renders it as a live board (drag tasks across lanes, mark them done, capture new ones). Runs entirely on `127.0.0.1`.

Your notes never leave your machine (see [Your data](#your-data)).

---

## Requirements

- **Claude Code** or **Codex** (the skill is agent-agnostic).
- **Node.js 20+** and npm, only if you want the visual studio.

---

## Install

Clone the repo, then install the skill:

```bash
git clone <this-repo-url> skill-menu
cd skill-menu
./working-memory/scripts/install-skill.sh --claude   # use --codex for Codex
```

`install-skill.sh` copies the skill into your agent's skills directory. Pick the
agent with `--claude` or `--codex` (or set `WORKING_MEMORY_INSTALL_AGENT`); it
defaults to Claude:
- **Claude Code:** `~/.claude/skills/working-memory` (override with `CLAUDE_HOME`)
- **Codex:** `~/.codex/skills/working-memory` (override with `CODEX_HOME`)

You can also set an explicit target with `WORKING_MEMORY_SKILL_INSTALL_DIR`.

Then ask your agent to **"set up working memory"** for a guided one-time setup
(prerequisite check, optional background-agent deploy, config write, and a health
check), or jump straight in with "run my morning standup."

### Running the studio

```bash
./working-memory/scripts/ensure-studio.sh   # installs deps + serves the board on http://127.0.0.1:3020
```

`ensure-studio.sh` copies the studio into a cache directory, installs its dependencies, and
starts the server for you, so there's no separate `npm ci` step. It auto-resolves the `claude`
binary and stores your archive in your XDG data directory by default. Override the archive
location with `INTERACTIVE_MEMORY_DIR` and the port with `WORKING_MEMORY_STUDIO_PORT`.

---

## Your data

The daily-notes archive is **runtime data, not source**. By default it lives in your
XDG data directory (`$XDG_DATA_HOME/working-memory`, e.g. `~/.local/share/working-memory`),
never inside this repo. The installer explicitly skips it, and `.gitignore` blocks any
`assets/daily-notes/` folder, so no one's personal notes can ever be committed here.

---

## Layout

```
skill-menu/
  README.md
  working-memory/
    SKILL.md              # the skill definition the agent reads
    references/           # standup/shutdown flow docs + note templates
    scripts/              # install + studio lifecycle scripts
    assets/
      working-memory-viewer/   # the Next.js studio (source only)
```
