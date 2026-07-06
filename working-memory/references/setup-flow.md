# Working Memory: Setup Flow

The one-time, agent-driven wizard that gets a fresh install from "skill copied onto disk" to "studio running and reachable." It replaces steps 2-4 of SKILL.md's internal installer flow with an interactive pass: detect what it can, ask exactly one real question through `AskUserQuestion`, write a small machine-local config file, run the packaged scripts, and verify. This wizard is Claude-native; see **Portability: Codex** at the end for the non-wizard path.

Trigger this flow when the user asks to set up, first-time-install, or configure working memory (see SKILL.md's routing pointer). Do not run it as part of a normal morning/evening invocation.

---

## Step 0: Prereq Gate (fail fast, before asking anything)

Before asking the user anything, verify the hard prerequisites are present:

| Check | Command | Why |
|-------|---------|-----|
| `HOME` is set | `[ -n "${HOME:-}" ]` | Every path below (XDG config, XDG data archive) resolves relative to `HOME`. Unset `HOME` is the same failure class `install-skill.sh` and `ensure-studio.sh` already guard against. |
| `node` present | `command -v node` | `ensure-studio.sh` and the studio app require it directly. |
| `npm` present | `command -v npm` | `install-studio.sh` uses it to install the vendored Next.js app on first run. |
| `curl` present | `command -v curl` | `ensure-studio.sh`'s own readiness check and this wizard's verify step both poll `/api/studio/health` over `curl`. |

If any of these are missing, report exactly which one(s) and stop. Do not proceed to detection or questions. The `claude` binary is **not** a prereq-gate item: it is only needed if the user later enables direct deploy (checked in Step 3).

---

## Step 1: Detect (never ask)

Resolve what can be resolved without user input:

- **`claude` binary:** run `command -v claude`. If it resolves, note the absolute path silently; do not surface it unless direct deploy is enabled in Step 3. If it does not resolve, note that it's missing and defer to Step 3's conditional ask.
- **OS timezone:** run the same one-liner `ensure-studio.sh` uses internally, `node -e 'console.log(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")'`, purely for your own situational awareness. **Do not ask the user to confirm it and do not write it into the wizard's config.** Timezone resolution/confirmation is the morning flow's job (it re-resolves and cross-checks against Google Calendar every day); this wizard has no `timezone` key to write.

---

## Step 2: Idempotent Re-run Check

Before asking the trust-surface question, check whether the pinned config file already exists:

```text
${XDG_CONFIG_HOME:-$HOME/.config}/working-memory/ensure-studio.local.sh
```

If it exists, read it and show the user its current `export` lines verbatim, then ask (plain chat question is fine here — this is a re-run confirmation, not the trust decision): keep the existing config as-is and skip straight to Step 5, or walk through reconfiguration (continue to Step 3). Never overwrite an existing config file without this confirmation; this is what makes re-running the wizard safe.

If it does not exist, continue to Step 3 normally.

---

## Step 3: Ask (the one real question)

This is the only question this wizard asks, and it must go through `AskUserQuestion`, never as plain chat text:

> Enable the studio to launch background agents (`claude --bg`) directly from its UI?

Default: **No**. Before the user answers, explain plainly what saying yes means: it lets the studio spawn `claude` processes with the user's own full permissions, scoped to whatever folder is chosen next — anything that folder and its contents allow, the spawned agent can do unattended. This is a real trust surface, not a convenience toggle. Most users should stay on **No** (manual-only; the studio still reads/edits JSON directly) until they've used the studio for a while.

**Only if the user answers Yes:**

1. Ask the agent working directory. Default to the user's current project directory; let them override it.
2. Confirm the `claude` binary resolved in Step 1. If Step 1 found nothing, ask the user for its absolute path directly — do not guess or fall back to a bare `claude` on `PATH`.

If the user answers No, skip both follow-ups entirely.

---

## Step 4: Write Config

Write the pinned, sourced bash file — creating its directory first:

```bash
mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/working-memory"
```

Target file (exact path, both agents in this project are pinned to it):

```text
${XDG_CONFIG_HOME:-$HOME/.config}/working-memory/ensure-studio.local.sh
```

Every line is a quoted `export KEY="value"` — no `${VAR:-default}` fallback pattern, just the literal resolved value. Emit only the keys the user actually set:

- **Direct deploy = No:**
  ```bash
  export WORKING_MEMORY_ENABLE_DIRECT_DEPLOY="false"
  ```
  Nothing else. Do not write `WORKING_MEMORY_AGENT_CWD` or `WORKING_MEMORY_CLAUDE_BIN` in this case — they're meaningless without direct deploy, and persisting them anyway would leave an unused trust-surface artifact on disk.
- **Direct deploy = Yes:**
  ```bash
  export WORKING_MEMORY_ENABLE_DIRECT_DEPLOY="true"
  export WORKING_MEMORY_AGENT_CWD="<resolved agent working directory>"
  export WORKING_MEMORY_CLAUDE_BIN="<resolved absolute claude path>"
  ```

Leave the archive directory (`INTERACTIVE_MEMORY_DIR`) to the code default (`$XDG_DATA_HOME/working-memory/Interactive Working Memory`, i.e. `~/.local/share/...`) unless the user volunteers a different location unprompted — this wizard does not ask about it. If they do volunteer one, add `export INTERACTIVE_MEMORY_DIR="<path>"` alongside the lines above.

Do not add a `timezone` key here (see Step 1) and do not add connector IDs of any kind — Slack/Jira/Calendar connector config stays lazy and first-use per `references/source-queries.md`; this wizard performs no connector discovery.

---

## Step 5: Run Install + Studio

Two commands, in order, from the skill's own directory:

```bash
./scripts/install-skill.sh --claude
```

Passing the flag explicitly means this wizard never depends on `install-skill.sh`'s path-based inference. It reports the resolved install target on completion; run the next command from that installed directory (or the current directory, if this was already a self-install no-op).

```bash
scripts/ensure-studio.sh
```

Run it with no manual env vars — the file written in Step 4 is sourced automatically, and the script's own internal `wait_for_studio` retry loop is the readiness gate. Do not poll `/api/studio/health` yourself in a race with its boot, and do not run a separate `npm ci`: `ensure-studio.sh` already delegates to `install-studio.sh` on first run or whenever the vendored app's source has changed.

If it exits non-zero, it prints the PID file, log path, and a log tail on its own — surface that to the user and stop. Do not retry silently.

---

## Step 6: Verify

Once `ensure-studio.sh` exits 0, GET the health endpoint at the URL it printed (default `http://127.0.0.1:3020/api/studio/health`, or whatever port it reported if 3020 was occupied). Confirm:

- `config.interactiveMemoryDir` matches the archive path expected from Step 4 (code default, or the override if one was written).
- `config.directDeployEnabled` matches what was set in Step 3.
- `config.claudeBin` and `config.agentCwd` match what was written in Step 4 (only meaningful when direct deploy is `true`; ignore them otherwise).
- `config.timezoneValid` is `true`.

If any of these don't match, report the mismatch plainly rather than declaring success. If they all match, report one closing line: _"You're ready — say 'run my morning standup' to start using working memory."_

---

## Portability: Codex

This wizard only runs under Claude Code — it depends on `AskUserQuestion` and this skill's own agent loop, neither of which Codex has. Codex users skip this file entirely and install manually:

1. `scripts/install-skill.sh --codex` (or set `WORKING_MEMORY_INSTALL_AGENT=codex`).
2. Hand-write the same pinned config file from Step 4 above, using the identical `export KEY="value"` lines — there's no wizard to derive it for you, but the format is exactly this file's Step 4 section.
3. Run `scripts/ensure-studio.sh` the same way described in Step 5.

There is no separate config format for Codex; it's the same file, same keys, same path.
