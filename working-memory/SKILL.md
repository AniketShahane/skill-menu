---
name: working-memory
description: >-
  Daily task management with morning standup and evening shutdown rituals in the
  file-backed Interactive Working Memory JSON archive.
  Use this skill whenever the user says "morning standup", "start my day", "what's on my plate",
  "daily planning", "evening shutdown", "end of day", "wrap up", "what did I do today",
  "close out the day", "working memory", "daily review", "daily tasks", "standup",
  "add a task", "add another task", "one more task", "add this to today's plan",
  "put this on today's plan", "capture this", "new todo", "add a tracker",
  "add another tracker", "track someone's work", "follow up on someone else's deliverable",
  "show today's plan", or "what's my plan".
  Also trigger when the user asks to aggregate tasks from Slack, Gmail, and Jira into a daily plan,
  or when they want to review and prioritize their day. If the user mentions triaging their inbox,
  reviewing what's pending, or carrying forward yesterday's tasks: this skill applies.
---

# Working Memory: Daily Task Lifecycle

Scan candidates → Present candidates → Classify → Grill one task → Targeted lookup → Draft body → User approves/edits/drops → Repeat → Lunch/schedule → Confirm → Write.

The morning flow is intentionally interactive for active tasks. Do not write final task fields from guessed repo context. Candidate scans find possible work; the user defines what the work means before any repo deep-dive. The candidate briefing is not approval to write tasks; it only builds the one-task-at-a-time qualification queue.

**Execution boundary:** this skill's deliverable is a ticket or tracker record, never a finished task. Targeted lookup means reading a file, running a read-only query, or opening a doc to confirm a detail so the ticket is accurate — that's expected. It never means editing code, running a command that changes state, deploying anything, or otherwise doing the task while "just checking." If the work turns out to be trivial, still write the ticket and stop; actual execution happens later, through a separately deployed agent, after the user reviews the ticket.

## Portable Configuration

This skill is distributed through internal Git or direct copy. Do not commit personal IDs, account emails, vault paths, source defaults, or credentials into shared docs.

Resolve configuration before running any flow:

| Key                      | Required | How to resolve                                                                                                                                       |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveDir`             | Yes      | Absolute path to the `Interactive Working Memory` JSON archive. The code default is `$XDG_DATA_HOME/working-memory/Interactive Working Memory` (i.e. `~/.local/share/...` when `XDG_DATA_HOME` is unset) — not a path under this skill's own install directory. A machine-local override lives in the sourced config file at `${XDG_CONFIG_HOME:-$HOME/.config}/working-memory/ensure-studio.local.sh` (see [references/setup-flow.md](references/setup-flow.md)); set `INTERACTIVE_MEMORY_DIR` there, or export it directly, to point at a different/external archive location. |
| `timezone`               | Yes      | IANA timezone used for day boundaries and wall-clock scheduling. Cross-check Google Calendar's own `timeZone` field against the terminal/system timezone: if they agree, treat as resolved and state it plainly; if they disagree, only one is available, or neither is, ask the user directly. Never silently prefer one signal. Store the confirmed value in today's `day.json.timezone` so later steps reuse it without re-asking.                       |
| `studioUrl` / port       | No       | Local studio URL. Default to `http://localhost:${WORKING_MEMORY_STUDIO_PORT:-3020}/studio` when the bundled studio is used.                           |
| Zoom connector           | No       | Zoom MCP connector (`mcp__claude_ai_Zoom_for_Claude__*`) for meeting recaps/summaries/action items. Data tools load only after auth; discover them at runtime via `ToolSearch` (query `zoom`) and authenticate on first use. If unconfigured or unauthenticated, skip meeting-context scans. |
| Source connector config  | No       | Slack user ID, Gmail account, Google Calendar ID, Jira cloud/account/project list, and similar source-specific values. If absent, run manual-only.     |
| Direct deploy config     | No       | Optional background-agent/direct-deploy integration. If absent, preserve `agentRuns[]` but do not launch or invent deploy metadata.                    |

First run is manual-only by default: create or read the local JSON archive, ask the user for tasks/context, and skip Slack/Gmail/Jira/Calendar scans until source connectors are explicitly configured.

Internal installer flow:

1. Copy or clone this skill directory from internal Git into the agent skill root, preserving `SKILL.md`, `references/`, and `scripts/`.
2. Configure local-only values outside shared docs: `archiveDir`, `timezone`, optional `studioUrl`, and optional source connector settings.
3. Run the morning flow once in manual-only mode to create the archive and confirm the studio can read it.
4. Add source connectors or direct deploy later only if the user wants the advanced setup.

When the user asks to "set up", "first-time setup", "configure", or "install" working memory, read [references/setup-flow.md](references/setup-flow.md) and execute the wizard there instead of doing steps 2-4 above ad hoc — it covers the same ground interactively (prereq check, the direct-deploy trust question, config write, script run, verify).

## JSON Archive Strategy

**JSON first.** The canonical working-memory store is the file-backed archive at resolved `archiveDir`, edited by one persistent local studio when configured.

Only read and write the Interactive Working Memory JSON archive. If a `day.json` is missing, start from an empty JSON day archive and let the user add context explicitly.

## Routing

| User intent                                                                         | Go to                                                                                                                                                          |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Morning standup / start day / planning                                              | Read [references/morning-flow.md](references/morning-flow.md), then execute **MORNING FLOW** starting from **Step 0 (config + source pre-flight)** — do not skip it. |
| Evening shutdown / wrap up / end of day                                             | Read [references/evening-flow.md](references/evening-flow.md), then execute **EVENING FLOW**                                                                   |
| Add a task / add another task / one more task / add this to today's plan / capture this / new todo | **QUICK ADD** (below)                                                                                                                                          |
| Track someone else's work / add a tracker / follow up on someone else's deliverable | **TRACKER ADD** (below)                                                                                                                                        |
| Show today's plan / what's my plan                                                  | **READ TODAY** (below)                                                                                                                                         |

Read source query templates when scanning: [references/source-queries.md](references/source-queries.md)
JSON archive contract and examples: [references/note-templates.md](references/note-templates.md)
Viewer contract: [assets/working-memory-viewer/docs/interactive-working-memory.md](assets/working-memory-viewer/docs/interactive-working-memory.md)
Packaged scripts: `scripts/install-skill.sh` for internal-Git local installs, plus `scripts/install-studio.sh`, `scripts/start-studio.sh`, `scripts/ensure-studio.sh`, `scripts/stop-studio.sh`, and `scripts/validate-studio.sh` for the bundled Studio.

## Interactive Working Memory Output

The replacement daily workspace is file-backed under resolved `archiveDir`:

```text
${archiveDir}/
  _index.json
  {YYYY-MM-DD}/
    day.json
    calendar.json
```

`day.json` contains task/ticket state, first-class `trackers[]` for other people's work, lifecycle timestamps, structured `ticketFields`, concise task-level `agentName`, optional task-level `agentRuns[]`, schedule placement, computed agent-readiness metadata, `breaks[]`, and an `ideas.text` free-form scratchpad. `calendar.json` is populated from the Google Calendar connector when that connector is configured, from manual calendar inputs when supplied, or marked unavailable during degraded/manual runs. Calendar meeting entries must preserve `meetingUrl` for direct join links and `htmlLink` for Google Calendar event links when present. `_settings.json` stores the board-wide prompt template. `_index.json` lives at the archive root and tracks available dates/freshness for navigation and carry-forward. Do not use local Google OAuth or store Google tokens in this repo or the archive.

When generating or updating a day, write today's `day.json`, today's `calendar.json`, and root `_index.json` via the safe-write flow in `references/morning-flow.md`: temp files, validation, backups, and atomic rename. Set `day.json.lifecycle.morningRunAt` when the morning flow has completed successfully. The local studio only edits/reloads these files; it does not fetch Google Calendar itself.

Past `day.json` files are retained indefinitely. They are the history and carry-forward source; do not prune or overwrite past days except to correct that specific day at the user's request.

Open the same app for every day:

- Resolved `studioUrl` loads the current day in resolved `timezone`.
- `http://localhost:3020/studio?date=YYYY-MM-DD` loads a specific archived day.

For each active task, populate `ticketFields.objective`, `ticketFields.doneWhen`, and the other structured fields that are needed for the task's complexity. Also populate `agentName`, `workDepth`, `estimateMinutes`, `sourceRefs`, `agentReadiness`, `readinessWarnings`, and preserve any app-written `agentRuns[]`. The app generates the copy-agent `ticketBody` from `ticketFields`; do not store `ticketBody`, `brief`, or `rawThoughts` in schema v8 tasks.

Active tasks written by the morning flow should be `agentReadiness: "ready"`. If a task is not ready after grilling, do not put it in active `tasks[]`; record it below the cut line in `ideas.text` with the missing decision named.

`agentReadiness` values:

- `ready`: `ticketFields` are complete enough to generate a delegable prompt; `readinessWarnings` is empty.
- `warning`: app/manual/carry-forward state for partially specified work; do not write newly qualified morning-flow active tasks with this state.
- `incomplete`: capture-only; do not treat it as an executable agent prompt.

`ticketFields` use this simple structure:

```json
{
  "objective": "Exact outcome to create.",
  "background": "Relevant context, or empty for simple shallow work.",
  "sourcesOverride": "Optional editable source text when sourceRefs are not enough.",
  "constraintsNonGoals": "Scope boundaries, non-goals, ask-before rules, or empty/None.",
  "doneWhen": "Concrete completion criteria.",
  "verification": "Checks, commands, screenshots, review steps, or empty for simple shallow work."
}
```

Build `ticketFields` only from scanned sources, source refs, carried task context, targeted repo/file inspection requested by the user, user answers, or clearly stated inference. If something needed is unknown, keep the item below the cut line instead of inventing context to make it look ready.

During grilling, identify every field that could plausibly apply to this specific task (not every field exists for simpler tasks) and resolve each one explicitly. A field that genuinely does not apply must be written as `None` (for example `constraintsNonGoals: "None"` or `verification: "None"`), never left blank, omitted, or deferred to an app default. The goal is that every task the skill writes is fully agent-ready, with no field silently unaddressed even when the honest answer is "not applicable."

`agentName` is the short display/deploy name shown by the app and optional direct-deploy integration. Generate it when the task becomes agent-ready, keep it kebab-case, and aim for 2-5 meaningful tokens such as `fix-login-timeout`, `backfill-user-events`, or `ticket-1047-cache-fix`. The user may edit it during the task approval pass.

`agentRuns[]` is app-owned optional deployment metadata. Preserve it when carrying a task forward, but do not invent or edit `agentRuns[]` from the skill.

For each tracker, populate `person`, `work`, `status`, `originalAskDate`, `sourceRefs`, and concise `notes`. Trackers are for monitoring someone else's deliverable over multiple days; they are not task substitutes. If the user has an action today, create or keep a task and link it with `task.trackerIds` and `tracker.relatedTaskIds`.

On future working-memory calls, inspect `day.json.ideas.text` when it is non-empty and treat it as idea backlog context. Do not spawn idea-implementation subagents automatically; present candidate ideas first and ask for approval before converting them into tasks or delegated work.

## Internal Time Blocking

After the user approves each active task body, the morning flow must ask which lunch block to protect and then guide a collaborative time-blocking pass before writing `day.json`. This is internal planning for the webapp only: do not create, update, or delete Google Calendar events.

Use Google Calendar events in `calendar.json` as fixed constraints and write planned task blocks into each task's `scheduledStart`, `scheduledEnd`, and `estimateMinutes`. Time blocks should help the user prioritize and see overload immediately.

Default scheduling rules:

- Assign `workDepth: "deep"` for cognitively demanding focus work and `workDepth: "shallow"` for admin, communication, coordination, review, and other fragmented work.
- Front-load deep work before 3pm where possible. Prefer Slack/email replies, follow-ups, review, and other shallow work after 3pm.
- Before scheduling, get the actual current wall-clock time, but first make sure `timezone` is actually resolved (Google Calendar's `timeZone` field agrees with the terminal/system timezone, or the user has confirmed it directly), not a single unconfirmed guess. A background session's terminal clock reflects the execution environment, not necessarily the user's location. If unresolved, ask before computing the floor, and store the confirmed value in `day.json.timezone`. Then round the current time up to the nearest 15 minutes and never schedule tasks, lunch, or breaks before that floor.
- Ask which lunch block to protect during morning planning; write it to `day.json.breaks[]` as `kind: "lunch"`.
- Add 5-minute `breaks[]` after every 45-60 minutes of scheduled work where feasible.
- Focus/deep-work blocks reserve 90-120 minutes when appropriate.
- Tasks default to 45-60 minutes when the outcome is defined. If a task cannot produce a concrete result inside 60 minutes, challenge whether it should become Focus or be split.
- Quick/comms/personal items default to 15-30 minutes.
- If planned work exceeds available open calendar time, do not silently overbook. Present a cut line and ask the user to drop, defer, shorten, split, or move items.
- Preserve stable task ids as the internal tag for finding scheduled work later. New scheduled tasks should use a stable `wm-{YYYYMMDD}-{short-slug}` style id unless carrying forward an existing id.

---

## QUICK ADD

1. Read today's `day.json` from `${archiveDir}/{YYYY-MM-DD}/day.json`. If it does not exist, create a minimal day archive for today and leave `lifecycle.morningRunAt` unset so the studio can warn that Good Morning has not run.
2. Classify the new item (Focus / Tasks / Quick): usually Quick.
3. Check the 1-3-5 soft limit. If over, note it: _"You're at 4 items in Tasks. Want to bump one to Quick, or keep it as-is?"_ Respect the user's answer.
4. If the user mentioned a source (Slack link, meeting name, email reference), capture it as structured `sourceRefs`: `kind` is one of the schema values, `label` is human-readable (`Slack: #channel`, `Meeting: Title`, `Gmail: subject`), and `url` is optional. If context behind the task isn't obvious, ask once: _"Any source link or context for this?"_: optional, don't block on it.
5. Run a single-task version of Morning Flow Step 5 before writing an active task. If the user has not supplied the task content, first ask: _"What task should I add?"_
6. For quick/simple shallow work, ask at most one missing question, but still require title, `ticketFields.objective`, `ticketFields.doneWhen`, `estimateMinutes`, and `workDepth`. For focus/deep/code/data/production/delegated/risky/source-dependent work, use the core grilling set: outcome, authoritative source, scope/non-goals, done criteria, verification, and estimate.
7. Draft `ticketFields`, `agentName`, estimate, depth, source refs, readiness, and the generated task body for this one task. Wait for explicit approval or edits before writing.
8. If the user cannot provide enough detail to make the task ready, add it to `ideas.text` with the missing decision named instead of active `tasks[]`. If ready, add it to today's `day.json` via the same safe-write flow using the current schema v8 task shape, set `agentReadiness: "ready"`, keep `readinessWarnings: []`, update `updatedAt`, and refresh root `_index.json`.

## TRACKER ADD

Use this when the user wants to track someone else's work, e.g. "track Sam's one-pager", "Riley is working on onboarding", or "follow up on Morgan's doc".

1. Read today's `day.json` from `${archiveDir}/{YYYY-MM-DD}/day.json`. If missing, create the minimal day archive as in QUICK ADD.
2. Extract:
   - `person`: who owns the work.
   - `work`: the deliverable or thread being monitored.
   - `originalAskDate`: the ask date if known; otherwise today's date in resolved `timezone`.
   - `sourceRefs`: Slack/Gmail/Jira/meeting/doc/manual source if mentioned.
   - `notes`: the current state or expected next check.
3. Deduplicate against existing `day.json.trackers[]` by person + work + source. If a matching tracker exists, update `notes`, `status`, `updatedAt`, and source refs rather than creating a second tracker.
4. Create a stable id `tracker-{YYYYMMDD}-{person-slug}-{work-slug}` for new trackers.
5. Default `status`:
   - `waiting` when the next move is with the other person.
   - `blocked` when there is a concrete blocker.
   - `active` when the work is in flight and there is no blocker.
6. Do not add a normal task unless the user has an action today. If they do, add the task and link both sides with `task.trackerIds` and `tracker.relatedTaskIds`.
7. Refresh root `_index.json` after writing.

During source scans, the skill may recommend trackers for other people's deliverables or open threads. Present tracker recommendations in chat and write a `trackers[]` record only after the user approves. If the user also has an action today, create a linked task and tracker; otherwise create only the tracker.

## READ TODAY

1. Read today's `day.json` from `${archiveDir}/{today's date}/day.json`.
2. Present a clean summary: active trackers, Focus items, Tasks, Quick items, scheduled blocks, readiness state, and their current JSON task status.
3. Highlight anything with a deferral marker/warning or items that have been in-progress for 2+ days.
4. If `day.json` is missing, say that Good Morning has not run for today and offer to start a fresh JSON archive.

---

## Shared Principles

**Tiered qualification** (shared with `/jira` skill):

- For morning planning and Quick Add active tasks, grill one selected active task at a time. Do not batch all deep-work questions globally.
- Always conduct the grilling interview through the AskUserQuestion tool, never as plain-text questions in chat. This is non-optional: every qualification question (outcome, authoritative source, scope/non-goals, done criteria, verification, estimate) is asked via AskUserQuestion.
- The unified inbox can list all candidates, but it is candidate discovery only. It does not approve any active task.
- `"looks good"` accepts the classification only. It never skips the one-task-at-a-time qualification loop.
- Ask before repo lookup. The user names the intended source/repo/branch/doc/thread first; then inspect only that target.
- If the conversation already answered a question, state the inference and confirm. Do not re-ask.
- For each task: show that single task, ask only its missing questions, wait for the answer, do targeted lookup if needed, draft the structured body, and show it to the user.
- Do not move to the next selected task until the user approves or edits the current body.
- Exit ramp: if the user says "just do it" / "just plan it" / "skip": stop grilling that item and move it below the cut line unless it is already ready from explicit context. Do not keep it as an active warning task.

Question budgets:

- Quick/simple shallow: 0-1 questions.
- Normal task: use the core grilling set only as needed.
- Focus/delegated/risky: ask the core grilling set.

Core grilling set:

1. What exact outcome should exist when this is done?
2. What source, repo, branch, doc, ticket, or thread is authoritative?
3. What must not change, or what is out of scope?
4. What proves it is done?
5. Estimate: 15 / 30 / 60 / 90 / 120 min?

**1-3-5 is a soft suggestion, not a hard constraint:**

- 1 Focus item, 3 Tasks, 5 Quick items is the default shape.
- If the user wants 2 Focus items or 12 Quick items, respect that.
- Only comment when the plan looks unrealistic: _"That's 4 deep-work items with 3 meetings: want to adjust?"_

**Execution boundary:**

- This skill only reads sources to fill in ticket fields: viewing a file, running a read-only query, or opening a doc/thread to confirm a detail during targeted lookup is expected.
- It never edits code, runs a command that changes state, deploys anything, or otherwise performs the task itself. Creating the ticket or tracker is the finish line for this skill.
- "Just do it" / "just plan it" from the user (see Exit ramp above) means stop grilling and drop the item below the cut line, not go implement it.

**Source & project context memory:**

- Keep the skill's persisted context (`day.json`) current, but carefully and concisely: notice what matters, do not log everything.
- When the user mentions a source they are working on (a repo, project, dataset, doc, or thread), capture it in the task's structured `sourceRefs` and `project` field, not just in prose.
- When that context later changes (a new repo appears, a project's scope or roadmap shifts, a source is superseded), update the existing task/tracker/context entry in place rather than appending a second entry. Keep the archive precise, not append-only: this mirrors tracker dedup (update the matching record; do not create a duplicate).

**Jira skill boundary:**

- This skill reads Jira data (source scan) and references ticket keys in notes.
- It NEVER creates, transitions, or edits Jira tickets. Hand off to `/jira` for that.
- If the user says "make a ticket for this" during triage, invoke the `/jira` skill.
- During morning triage, if active tickets are being reviewed and the user is about to start work on one, consider prompting: "Want me to spin up the jira-agent to log a start comment and mark it In Progress?" Respect the user's answer: do not spawn autonomously.
- When spawning jira-agent for ticket creation, include the full `day.json` task object fields that describe the work: `title`, `agentName`, `sourceRefs`, `ticketFields`, `estimateMinutes`, `workDepth`, `agentReadiness`, and `readinessWarnings`. Do not translate the task into unstructured prose.

**Error handling:**

- Source connector failure mid-scan: proceed with available sources, note the gap. The morning and evening flows catch predictable failures earlier via Step 0 pre-flight; mid-scan failures are the residual case (e.g., Jira times out partway through).
- Studio unavailable: write the JSON files directly; the studio will reload them when it is running.
- No prior `day.json` found: start fresh and skip carry-forward.
- Duplicate morning invocation: detect today's `day.json` with `lifecycle.morningRunAt`, offer: add to it / rebuild / just show it.
- Empty inbox: _"Clean inbox. Any personal items or projects to focus on today?"_

---

## Scope Boundary

Working-memory is today's plan only. It can pull meeting context (recaps, summaries, action items) from the Zoom MCP connector as a source of action items, but it does not create separate files outside the Interactive Working Memory JSON archive.
