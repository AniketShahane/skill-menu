# Morning Flow

Target: concise, but not rushed. Candidate discovery should be fast; active task qualification is one task at a time and must happen before repo deep-dive or archive writes.

---

## Step 0: Resolve Config + Pre-flight Source Check

Resolve `archiveDir` and `timezone` before doing carry-forward or source scans. If either value is missing, ask the user to choose it. On first run, default to manual-only and ask before writing to a local `archiveDir`.

Source connectors are optional advanced setup. If no Slack/Gmail/Jira/Calendar connectors are configured, skip source probes, print _"Pre-flight: no source connectors configured; using carry-forward and manual inputs."_ and proceed to Step 0.5.

Probe configured data sources before doing expensive carry-forward or source scans. If a configured source is unreachable, show the user the blast radius and ask whether to proceed degraded or abort. Do not continue silently.

**Probe each configured connector with the same query Step 2 would run, capped to 1 result.** Run all configured probes in parallel:

| Source           | Probe (matches Step 2's query, capped)                                                                                                                                                                                                        | Pass criterion                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Slack            | `mcp__claude_ai_Slack__slack_search_public_and_private` with `query: "to:<@{slackUserId}>"`, `limit: 1`                                                                                                                                       | Returns without auth/connection error |
| Gmail            | `mcp__claude_ai_Gmail__search_threads` with `query: "is:unread newer_than:1d"`, `pageSize: 1`                                                                                                                                                 | Returns without auth/connection error |
| Google Calendar  | `mcp__claude_ai_Google_Calendar__list_events` with `calendarId: "{calendarId}"`, today's window in resolved `timezone`, `pageSize: 1`                                                                                                         | Returns without auth/connection error |
| Atlassian / Jira | `mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql` with `cloudId: "{jiraCloudId}"`, JQL `assignee = "{jiraAccountId}" AND status NOT IN (Done, Closed) AND project IN ({jiraProjects}) ORDER BY priority DESC, updated DESC`, `maxResults: 1` | Returns without auth/connection error |

A probe "fails" if the tool isn't loaded, the call errors (auth expired, server disconnected, permission denied), or it hangs past a reasonable timeout. An empty result set is NOT a failure: the user simply has zero items in that source today.

**Tool-not-loaded:** if a probe's tool is on the deferred list, run `ToolSearch select:<name>` first; if that returns no match, treat the probe as failed.

**If all configured probes pass:** print a single one-liner such as _"Pre-flight: Slack, Gmail, Calendar, Jira all reachable."_ using only the configured source names, then proceed to Step 0.5. No table, no friction.

**If one or more probes fail:** stop the morning flow before Step 1. Do not start carry-forward or source scans. Present a compact table and ask the user:

```
Pre-flight check — one or more configured sources unavailable:

| Source | Status | Blast radius |
|-----|--------|--------------|
| Slack | ✓ reachable | : |
| Gmail | ✓ reachable | : |
| Calendar | ✓ reachable | : |
| Jira | ✗ {short error: "connector not loaded" / "401 unauthorized" / "timeout"} | {tailored prose, see below} |

Proceed with degraded scan (skipping {failed sources}) or abort and reconnect first?
```

**Tailor the blast-radius cell to the morning flow's actual use of that source:**

- Slack failure → _"No @mentions / DM scan. Carry-forward + manual input still work; new asks landing only in Slack will be missed today."_
- Gmail failure → _"No unread / starred / Zoom-recap pulls. Carry-forward + Slack + Jira still work."_
- Calendar failure → _"No today's-events table. Plan shape will be blind to meeting density unless the user supplies busy windows manually."_
- Jira failure → _"No assigned-active / recently-transitioned / watcher-mention scan. Carry-forward + Slack still surface key tickets via mentions; net signal degraded but not gone."_

**User responses:**

- `proceed` / `degraded` / `keep going` → continue to Step 0.5. In Step 2, explicitly skip the failed source(s). In Step 3, surface a single banner above the briefing: _"Source gap: {source} unreachable; flag during evening flow if reconnection needed."_ and carry the same line into `day.json.dayNotes`.
- `abort` / `stop` / `reconnect first` → exit the skill cleanly. Do not write any archive files. Print: _"Aborted. Reconnect the failed source connector(s) and re-run /working-memory when ready."_
- Anything else → answer the question and re-ask proceed/abort. Don't proceed silently.

**Why Step 0 exists, not just Step 2's existing tolerance:** Step 2 already handles partial failures, but it kicks in _after_ carry-forward and source setup — context already spent on a scan the user may have wanted to abort. Repeated mornings with Jira unavailable, each producing a degraded scan the user had to mentally discount, is the specific incident this step prevents.

---

## Studio Launch Timing

Do not start the studio before task qualification, scheduling, user approval, and JSON writes. The intended order is: scan candidates, classify, grill and approve each active ticket body, finalize schedule, write the archive safely, then start or confirm the studio from Step 7.

---

## Step 0.5: Duplicate Invocation Guard

Before carry-forward or source scans, check today's archive:

```text
${archiveDir}/{YYYY-MM-DD}/day.json
```

If today's `day.json` already exists and has `lifecycle.morningRunAt`:

- _"You already have a plan for today. Want to: (a) add new items to it, (b) rebuild from scratch, (c) just show it?"_
- (a) → read existing `day.json`, preserve user edits, and append new source-scan items as task candidates.
- (b) → continue the morning flow, but make clear this will overwrite today's `day.json` and `calendar.json` only after final Step 7 approval.
- (c) → switch to READ TODAY mode.

If today's `day.json` exists but `lifecycle.morningRunAt` is missing, warn that Good Morning has not run for this day and ask whether to run the morning flow, keep the existing quick-add archive, or rebuild it.

Do not continue into carry-forward/source scans until this guard is resolved.

---

## Step 1: Carry Forward

Find the most recent previous `day.json` and carry forward incomplete items and active trackers while preserving user edits.

**Finding the previous day:**

- Read `${archiveDir}/_index.json` first and pick the most recent date before today.
- If `_index.json` is missing or stale, list date folders under `${archiveDir}/` and pick the most recent folder with a `day.json`.
- If today is Monday, prefer Friday as the first expected prior day, but still use the newest available earlier `day.json` if Friday is absent.
- Past `day.json` files are retained indefinitely and are the canonical carry-forward/history source. Do not delete or prune older days.
- Only use prior `day.json` files for carry-forward.

**Extract tasks from the previous `day.json`:**

- Carry only tasks whose supported status is `todo`, `in_progress`, or `review`.
- Ignore `done` tasks.
- The app schema does not support `deferred`, `dropped`, or `cancelled` statuses. If the previous evening summary in `dayNotes` lists a task as dropped, exclude it from carry-forward unless the user explicitly revives it.

Carry the task's existing `title`, `agentName`, `sourceRefs`, `ticketFields`, `project`, estimate, and useful scheduling intent forward unless the user explicitly changes them. Do not copy prior-day `scheduledStart` or `scheduledEnd` into today: preserve duration/intent, then re-time the task during Step 6 against today's calendar.

**Carry-forward age tracking:**

- If a carried task already has age context in `ticketFields.background` or `dayNotes`, increment it.
- If it has no age context and is being carried for the first time, mark it as day 2 in `ticketFields.background` or `dayNotes`.
- At day 3+, add the warning marker used by the app.
- At day 5+, the morning briefing should flag it prominently: _"This has been deferred 5+ days. Options: force-schedule today, delegate, or drop."_
- Do NOT nag with Socratic questions about deferred items. Just make the age visible.

**Extract trackers from the previous `day.json`:**

- Carry tracker records whose status is `active`, `waiting`, or `blocked`.
- Do not carry trackers with `status: "done"` or `status: "dropped"` unless the user explicitly revives them.
- Preserve tracker `id`, `person`, `work`, `originalAskDate`, `sourceRefs`, `createdAt`, and useful `notes`.
- Clear `relatedTaskIds` unless the linked task is also carried into today; if today's plan creates a follow-up/review task for the tracker, link both sides with `tracker.relatedTaskIds` and `task.trackerIds`.
- Compute age from `originalAskDate`, not from today's carry-forward date. At 5+ days, flag the tracker in the briefing: _"{person}: {work} has been open N days. Follow up, keep waiting, or drop?"_

**If no previous `day.json` exists:** Skip carry-forward entirely. This is fine: first use or return from extended absence.

---

## Step 2: Source Scan

Read [source-queries.md](source-queries.md) for exact query templates.

This scan is for candidate discovery only. Do not inspect repos, branches, implementation files, or broad project folders yet. Save repo/file lookup for Step 5 after the user names the intended source for a selected task.

Fan out the configured source lookups as **parallel sub-agents**: spawn one simple Sonnet sub-agent (low/medium reasoning effort) per lookup source (Slack, Gmail, Jira, Calendar, Zoom meetings), launched together in a single message so they run concurrently. Each sub-agent runs only its own read-only lookup using the query templates below and returns candidate items plus source citations; it must not qualify, grill, schedule, or write anything. Fanning out one small agent per source (instead of one agent running the lookups serially) keeps the main thread's context clean for the interactive qualification pass. In manual-only mode, skip the fan-out and ask the user for candidate tasks or source links.

1. **Slack**: @mentions and DMs from last 24h, using configured `slackUserId`
2. **Gmail**: Unread (1d) + starred unactioned (7d), using configured Gmail account
3. **Jira**: Assigned active + recently transitioned + watcher mentions, using configured Jira cloud/account/projects
4. **Google Calendar**: Today's events, using configured calendar ID and resolved `timezone`
5. **Meetings (Zoom)**: recent meeting recaps/summaries and action items from the Zoom MCP connector (`mcp__claude_ai_Zoom_for_Claude__*`) when configured. Extract action items assigned to the configured user and open questions/follow-ups. See [source-queries.md](source-queries.md) for the runtime tool-discovery + auth steps.

**Processing the results:**

Dedup across sources:

- Slack message mentioning a Jira key → merge into one item, keep Slack context + Jira key as link.
- Same thread mentioned multiple times → collapse to one item.
- Zoom meeting action item referencing a Jira key → merge with the Jira item, add meeting context as source.
- Zoom meeting action item duplicating a Slack thread → merge, prefer the meeting version.

Cap each source at 10 items. If more, note: _"Showing 10 of 23 Slack mentions."_

**Capture source citations while scanning:** For each actionable item surfaced, record its origin anchor alongside the item: these become source references in today's `day.json`:

- Slack @mention or DM → `{ "kind": "slack", "label": "Slack: #channel or DM", "url": "thread-url" }`. If no permalink is available, omit `url`; never use a bare label like `Slack` without channel/DM context.
- Zoom meeting action item → `{ "kind": "meeting", "label": "Meeting: Title", "url": "https://zoom.us/rec/..." }`; omit `url` when there is no shareable link.
- Gmail thread → `{ "kind": "gmail", "label": "Gmail: subject", "url": "thread-url" }`
- Jira ticket → `{ "kind": "jira", "label": "KEY" }`; the key is self-sufficient.
- If discussion context is non-obvious from the task text, preserve it in `ticketFields.background`.

Separate informational items (meeting recaps shared, FYI emails, completed Jira tickets) from actionable items. Other people's action items should usually become `trackers[]`, not active user tasks, unless the user has a concrete action today.

**Calendar archive output:** Normalize the Calendar connector result into `${archiveDir}/{YYYY-MM-DD}/calendar.json` with `schemaVersion: 3`, `source: "google-calendar"` when the connector succeeded, `source: "manual"` when the user supplied busy windows manually, `source: "unavailable"` when the user chose a degraded/manual scan with no calendar data, and `generatedAt` set to the scan time. Store event title/time/status/self response/location/organizer/attendee count, `htmlLink` for the Google Calendar event link, and `meetingUrl` for the direct join link when present. Do not store full event descriptions by default.

---

## Step 3: Present Unified Inbox

Present the briefing with scannable tables for each section. Keep narrative minimal: the tables ARE the format.

This is a candidate scan only. It is useful to list candidates together so the user can classify the day, but no candidate is approved as an active task from this table. Every selected active item must still pass Step 5 one task at a time before it can be written to `tasks[]`.

### Calendar

| Time ({timezone}) | Meeting | Notes                         |
| ----------------- | ------- | ----------------------------- |
| {HH:MM}           | {title} | {declined / key meeting / empty} |

Flag if 5+ hours of meetings: _"Heavy meeting day: plan for Quick tasks between meetings."_

### Carried Forward ({count})

| Item                                 | Source                         | Deferral         |
| ------------------------------------ | ------------------------------ | ---------------- |
| **{KEY}** ({ticket summary}): {task} | Jira / Slack / Meeting / Gmail | day N {⚠️ if 5+} |

Items at day 5+ get ⚠️ and explicit options in the flag row below the table: _force-schedule today / delegate / drop_.

### Trackers ({count})

| Person        | Work                 | Status                     | Age                            | Next user action                 |
| ------------- | -------------------- | -------------------------- | ------------------------------ | -------------------------------- |
| {person/team} | {deliverable/thread} | active / waiting / blocked | {N days since originalAskDate} | none / follow up / review / drop |

Trackers are for other people's work. Do not put them in the task tables unless the user has an action today.

### New from Sources ({count})

| Item                                                      | Source                                               | Suggested Tier                     |
| --------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| {brief description with Jira key + summary if applicable} | Slack / Gmail / Jira / Meeting: {title} / Zoom recap | Focus / Tasks / Quick / FYI (drop) |

Aging items (starred 3+ days, old Slack, unanswered thread) get ⚠️ in the Deferral or Suggested Tier cell.

### Queue (from continuous monitoring) ({count})

Read the rolling sweep queue: `GET /api/studio/queue`. Surface items whose `status` is `queued` as pre-harvested candidates gathered by the between-mornings sweeps (see [sweep-flow.md](sweep-flow.md)). These are inputs to planning, not tasks: the user decides what enters the plan by grilling a queued item (Step 5, or the in-app Grill entry point). Never auto-create a task from a queued item.

| Item                       | Source(s)                    | Notes                                        |
| -------------------------- | ---------------------------- | -------------------------------------------- |
| {short candidate title}    | Slack / Gmail / Jira / Meeting | {possible match: <task> / dismissed before <date>} |

A queued item may overlap a live source-scan candidate or an existing task; it can carry a "possible match" chip. Show it, do not double-count, and do not silently drop it. Grilling is the only path that turns a queued item into a task; the sweep never did.

If the studio or `GET /api/studio/queue` is unreachable, skip this subsection silently. The queue is an optional layer; carry-forward and the live source scan still work without it.

**How do you want to organize today?**

- Classify: `"focus: X, tasks: Y Z, quick: rest"`
- Add personal items not in any source
- Drop items: `"drop the meeting recap, just FYI"`
- Accept: `"looks good"` to use the suggested classification

**Pre-classification heuristics** (applied before building the "Suggested Tier" column):

- **Communication tasks** (draft/send/reply/post/update-ticket/follow-up/email) → weight UP one tier: Quick → Tasks, Tasks → Focus candidate. When multiple Focus candidates exist, prefer the communication one. This reflects the user's priority: communication is the most important piece of their role.
- Jira priority Major/Critical → likely Focus or Tasks
- Simple reply / read / approve → likely Quick (but apply comm weighting above first)
- Multi-day project already in-progress → likely Focus (carry-forward)
- Vague scope, cross-team, aging → likely Tasks (may trigger interrogation)
- Informational only → suggest dropping (Tier = FYI)

**Always include Jira ticket summaries**: format: `KEY (summary)` in prose or `**KEY** (summary)` in task titles. Example: `PROJ-946 (Gather requirements for weekly metrics)`. Never surface a bare key.

**Meeting items (from Zoom)** populate the same "New from Sources" table: the Source column makes the meeting origin clear:

| Item                                                    | Source                           | Suggested Tier |
| ------------------------------------------------------- | -------------------------------- | -------------- |
| @{configuredUser}: Review sample data once available    | Meeting: Data Ingestion Review   | Tasks          |
| @Teammate: Set up initial ingestion                     | Meeting: Data Ingestion Review   | FYI (drop)     |
| Open Q: Which team owns the review environment?         | Meeting: Weekly Review           | Tasks          |

Other people's action items from meetings go in the Trackers table unless they require the user to act today.

---

## Step 3.5: Communication Pattern Check

As part of the Step 3 briefing, scan carry-forward + new items for communication work (drafting/sending messages, replying to threads, posting in channels, updating Jira tickets, follow-ups, emails).

Surface **ONE** of these flags (or nothing) at the top of the briefing, kept to 1-2 sentences. No moralizing. If neither trigger fires, skip the flag entirely: do not add filler.

**Aging flag** (wins ties with concentration): fires if any communication item is at day 3+ deferral:

_"**{KEY}** ({summary}): reply deferred N days. Prioritize responding today or explicitly drop with a reason."_

**Concentration flag**: fires if >50% of items are communication AND the suggested Focus is NOT a communication item:

_"N of M items are communication. Suggested Focus is not: consider swapping the Focus to the most strategic comm item."_

**Rationale:** communication is the most important piece of the user's role. Aging threads carry silent risk; a holding-reply costs 30 seconds but prevents relationship damage.

---

## Step 4: User Classifies

Accept classification in natural language. Flexible formats:

- Explicit: `"focus: PROJ-847, tasks: PROJ-852 + OKRs + partner reply, quick: rest"`
- Loose: `"focus on the dashboard fix and the OKR stuff, everything else is quick"`
- Accept classification: `"looks good"` or `"just write it"` accepts the suggested classification only. It does **not** approve task bodies, skip Step 5, bypass scheduling, or bypass Step 7 approval. Any selected item that the user does not qualify in Step 5 goes below the cut line unless it is already ready from explicit context.
- Partial: `"move the data request to tasks, otherwise looks good"`

After classification, check against the 1-3-5 soft suggestion:

- Over limit → note it once: _"That's 4 tasks with 3 meetings. Want to adjust, or keep it?"_
- All quick, no focus → note it once: _"No deep work today: intentional?"_
- Respect whatever the user decides. One comment, then move on.

---

## Step 5: Task Qualification

Replace vague task handoffs with a one-task-at-a-time readiness pass. The goal is to make each active task honest enough to deploy, without letting the agent wander through the repo before the user defines the target.

### Readiness states

- `ready`: `ticketFields` are complete enough for the app to generate a delegable prompt; `readinessWarnings` is empty.
- `warning`: app/manual/carry-forward state for partially specified work. Do not write newly qualified morning-flow active tasks with this state.
- `incomplete`: capture-only; do not treat it as executable.

Morning flow must write active tasks only when they are `ready`. If the user keeps an unqualified item, put it below the cut line in `ideas.text` with the missing decision named.

### Qualification triggers

Score each classified item on:

- size,
- ambiguity,
- risk,
- source dependency,
- delegation readiness,
- work depth.

Canonical question set and field rules: [assets/working-memory-viewer/content/grilling-contract.md](../assets/working-memory-viewer/content/grilling-contract.md).

Core grilling set for each selected active task:

1. What exact outcome should exist when this is done?
2. What source, repo, branch, doc, ticket, or thread is authoritative?
3. What must not change, or what is out of scope?
4. What proves it is done?
5. Estimate: 15 / 30 / 60 / 90 / 120 min?

Use fewer questions for obvious quick/shallow work, but do not skip the core source/outcome questions for focus, deep, code, data, production, or delegated work.

### Rules:

- Ask about one selected active task at a time. Never ask for views on all selected tasks in one batch.
- Do not use the AskUserQuestion tool for grilling; option lists invite rubber-stamping the default. Ask the missing questions as one concise numbered list in plain chat text, open-ended with no suggested options, phrased concretely for this task (name the artifact, repo, or decision). The user answers each in their own words, in one reply or several.
- For each task, show a small heading: `Qualifying task N/M: {title}`.
- Ask only the missing questions for that task. For focus/deep/code/data/production/delegated/source-dependent work, do not skip outcome, authoritative source, scope/non-goals, done criteria, verification, or estimate.
- Wait for the user's answer before doing any repo/source lookup for that task.
- After the user names the source, inspect only the named repo, branch, doc, ticket, thread, or file path — read-only: view/read files, run read-only queries, open docs or threads to confirm details. Do not edit files, run commands that change state, or otherwise start doing the task while looking it up.
- If the conversation already answered a question, state the inference and confirm: _"Sounds like the outcome is X: correct?"_
- Source lookup can fill supporting details only after the user defines the target; it cannot replace asking for outcome, scope, done criteria, verification, or estimate, and it never turns into performing the task itself. The lookup's only output is more accurate `ticketFields` for the ticket you're about to draft.
- After one answer round plus targeted lookup, draft the concise `agentName`, structured fields, and full ticket body for that task only.
- Show the draft and wait for explicit approval, edits, or drop before moving to the next selected task.
- **Exit ramp:** If the user says "just plan it" / "skip" / shows any impatience → stop grilling that item. Move unresolved work below the cut line unless it is already ready from explicit context. Do not keep it as an active warning task.

### Structured ticket field requirements

For every active task, draft `ticketFields` directly and show the generated body before writing:

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

Also write:

- `agentName`: concise kebab-case deploy name, 2-5 meaningful tokens, e.g. `fix-login-timeout`
- `workDepth`: `deep` or `shallow`
- `estimateMinutes`: the internal time estimate
- `agentReadiness`: `ready` for every morning-flow active task
- `readinessWarnings`: empty for every morning-flow active task
- Preserve existing `agentRuns[]` if carrying a task forward. Do not invent app deployment metadata from the skill.

Always required: title, `ticketFields.objective`, `ticketFields.doneWhen`, valid `estimateMinutes`, and valid `workDepth`.

For deep, focus, delegated, risky, source-dependent, code, or data work, also require useful `background`, sources from `sourceRefs` or `sourcesOverride`, `constraintsNonGoals` unless explicitly `None`, and `verification`.

For quick/simple shallow work, identify which of `background`, sources, `constraintsNonGoals`, and `verification` could plausibly apply to this task, then resolve each explicitly. A field that genuinely does not apply must be written as `None` (for example `verification: "None"`), never left blank, omitted, or deferred to the app's default rendering, so every written task is fully agent-ready with no field silently unaddressed.

Build `ticketFields` only from scanned sources, source refs, carried `ticketFields`, targeted repo/file inspection after grilling, user answers, or clearly stated inference. If a needed field is unknown, do not write it as an active task; keep it below the cut line with the missing question named.

---

### Step 5 Exit Gate

Do not enter Step 6 until every active task has:

- user-approved `ticketFields`,
- `agentName`,
- valid `workDepth` and `estimateMinutes`,
- `agentReadiness: "ready"`,
- empty `readinessWarnings`.

If any selected task cannot pass this gate, move it below the cut line with the missing decision named. Do not schedule or write active `warning` tasks from the morning flow.

---

## Step 6: Collaborative Internal Time Blocking

After the user approves every active task body, ask for lunch, then build the day's internal schedule before writing `day.json`. This is for the webapp only. Do **not** create, update, or delete Google Calendar events.

### Scheduling inputs

- Treat busy `calendar.json.meetings` as fixed blocks that the agent must avoid. The webapp renders overlaps but does not enforce conflicts, so the schedule proposal must do the conflict checking.
- A calendar event is busy only when it is not cancelled, not `responseStatus: "declined"`, not `transparency: "transparent"`, and not an all-day/free informational event. OOO/all-day events should block only when their title or metadata clearly indicates real unavailability.
- If Calendar was unavailable in Step 0 and the user chose a degraded scan, do not invent precise `scheduledStart`/`scheduledEnd` values from an empty calendar. Ask for manual busy windows, or write only `estimateMinutes` and leave tasks unscheduled.
- Use `day.json.settings` for the visible planning range, defaulting to 8am-6pm in resolved `timezone`.
- **Current-time floor:** At the start of Step 6, before reading the current wall-clock time, resolve `timezone` reliably: compare Google Calendar's own `timeZone` field (from the Calendar connector) against the terminal/system timezone. If they agree, treat it as resolved and state it plainly in the schedule proposal. If they disagree, only one signal is available, or neither is configured, ask the user directly which timezone to use. A background session's terminal clock reflects the execution environment, not necessarily the user's physical location, so don't trust it alone, and don't silently prefer one signal over another when they conflict. Once resolved, store the confirmed value in `day.json.timezone` so Step 7 and the evening flow reuse it without re-asking. Only then get the actual current wall-clock time in the resolved `timezone` from the environment/time tool, not from the workday start or calendar. Round it up to the nearest 15 minutes and use that as the earliest schedulable slot when it is later than `settings.startHour`. No `scheduledStart`, lunch, or break may be earlier than this floor; state the floor in the schedule proposal.
- Ask which lunch block to protect. Write the approved lunch block to `day.json.breaks[]` with `kind: "lunch"`.
- Add 5-minute breaks after every 45-60 minutes of scheduled work where feasible. Write them to `day.json.breaks[]` with `kind: "break"`.
- Use task tier, urgency, work depth, energy fit, and source context to assign `estimateMinutes`, `scheduledStart`, and `scheduledEnd`.
- Preserve existing user-edited schedule fields only when they are for today's date and do not conflict with meetings. Rebuild carried-forward task timing against today's calendar.

### Default block sizes

| Kind                     | Default               | Rule                                                                                                                          |
| ------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Focus / deep work        | 90 minutes, up to 120 | Reserve a front-loaded block before 3pm where possible. |
| Task                     | 45-60 minutes         | If it cannot produce a concrete result inside 60 minutes, challenge whether it should become Focus or be split.               |
| Quick / comms / personal | 15-30 minutes         | Batch related replies/follow-ups where possible.                                                                              |

Deep-work estimates over 30 minutes are not a license to grind blindly. If the path is uncertain, capture the uncertainty in `ticketFields`/`readinessWarnings` or split the task. Do not add a mandatory 30-minute checkpoint unless it helps the specific task.

### Scheduling-time split gate

If Step 6 estimation reveals any item is in the wrong tier, pause once before presenting final blocks:

- A Task estimated above 60 minutes → ask whether to promote it to Focus, split it, or reduce scope.
- A Focus item that cannot fit in 120 minutes → ask for a narrower done definition or split.
- A Quick item estimated above 30 minutes → move it to Tasks or split.

This is a scheduling correction, not a second Socratic interview. Ask in one batch and then proceed.

### Energy and sequencing rules

- Avoid scheduling deep work across the user's 3pm energy dip. Prefer Slack replies, email, reviews, follow-ups, and other lighter work around 3pm.
- Front-load `workDepth: "deep"` items before 3pm where possible.
- Prefer `workDepth: "shallow"` items after 3pm where possible.
- Prefer one high-leverage Focus block over several fragmented deep-work blocks.
- Schedule aging communication items earlier than comfortable if they carry relationship or blocking risk.
- Add small buffers around meetings when the calendar is dense; do not fill every visible gap by default.
- Exclude elapsed time, lunch, breaks, meeting-transition buffers, and at least 30 minutes of unscheduled recovery/admin buffer from capacity.
- Breaks/lunch cannot overlap meetings or tasks, count against capacity, use local wall-clock strings in resolved `timezone` (`YYYY-MM-DDTHH:mm:ss`), obey the current-time floor, and should note any skipped break in the final summary.
- Keep the plan honest. If available open time cannot fit the approved list, show the overload instead of forcing all tasks onto the calendar.

### Overload challenge

Before writing, compute available open minutes and planned task minutes. If planned work exceeds capacity or creates an unrealistic day, present a cut-line proposal:

```text
Schedule capacity: 4h 30m open work time
Planned work: 6h 15m
Over by: 1h 45m

Proposed cut line:
- Keep today: Focus PROJ-847, metrics reply, OKR email, partner follow-up
- Move below cut line: data request, dashboard bug triage

Choose: keep cut line / move one item above it / shorten blocks / rebuild schedule
```

The skill should recommend a cut line, not merely ask the user to solve the overload. Below-cut-line items are not written as active `tasks`; capture them in `ideas.text` under `Below cut line` or in `dayNotes` so they remain visible without inflating today's board. After one round, respect the user's choice.

### Present the proposed blocks

Show the schedule in time order:

```text
Proposed internal time blocks:

| Time ({timezone}) | Block | Why here |
|-------------------|-------|----------|
| 9:00-10:30 | Deep work: PROJ-847 dashboard filter | Best energy before meetings |
| 10:30-10:35 | Break | 5-minute reset after long block |
| 10:35-10:45 | Buffer / notes | Protect meeting transition |
| 1:00-1:30 | Metrics reply + label follow-up | Communication before it ages further |
| 3:00-3:30 | Slack/email sweep | Matches 3pm energy dip |

Write these scheduledStart/scheduledEnd values into the webapp archive? (or adjust)
```

If the user approves, continue to Step 7. If the user adjusts, revise the schedule once, then proceed unless the user asks for another pass.

---

## Step 6.5: Compute Sweep Times + Refresh Scheduled Sweeps (gated)

The continuous-monitoring queue runs two calendar-aware sweeps a day between good mornings (see [sweep-flow.md](sweep-flow.md)). The morning flow owns computing today's two sweep times from the calendar already fetched in Step 2. Refreshing the actual scheduled jobs is gated: it happens only when sweep scheduling has been activated per the ACTIVATION CHECKLIST in [../SKILL.md](../SKILL.md). Until then, compute and surface the times but touch no scheduled job.

### Compute the two times

- Base times: 12:00 and 16:00 local in the resolved `timezone`.
- Meeting-block deferral: if a busy meeting is in progress at a base time, defer that sweep to the END of the overlapping meeting block. A block is a chain of back-to-back busy meetings with no real gap covering the base time; defer to the end of the whole chain, not just the first meeting.
- Use the same busy definition as Step 6: a meeting counts only when it is not cancelled, not `responseStatus: "declined"`, not `transparency: "transparent"`, and not an all-day/free informational event.
- If no busy meeting overlaps a base time, use the plain 12:00 / 16:00.
- These two times are today's sweep schedule. When no morning flow runs on a given day, the sweeps fall back to plain 12:00 / 16:00.

### Refresh scheduled jobs (only behind the activation gate)

- If sweep scheduling is NOT activated per the SKILL.md ACTIVATION CHECKLIST, skip this silently. Do not create, delete, or edit any scheduled job. This is the v1 default: sweeps run manually by invoking [sweep-flow.md](sweep-flow.md) in a session.
- If it IS activated: delete today's stale sweep jobs, then create two fresh scheduled jobs at the computed times, each running the headless routine in [sweep-flow.md](sweep-flow.md) with `lastSweepKind: "scheduled"`. Refresh with delete-then-create so re-running the morning flow does not stack duplicate jobs.

---

## Step 7: Confirm + Write Day Archive

### Show summary before writing:

```
Today's Plan: {date}

| Tier | Time ({timezone}) | Item | Source | Notes |
|------|-------------------|------|--------|-------|
| Focus | 9:00-10:30 | **PROJ-847** (Fix dashboard filter) | Jira (carry-fwd, day 2) | deep, ready |
| Tasks | 1:00-1:30 | Metrics check for partner | Slack | Reply in #team-channel |
| Quick | 3:00-3:15 | Reply re: vendor list | Carry-fwd (day 3 ⚠️) | 3pm light-work slot |

Breaks: Lunch 12:30-1:00, Break 10:30-10:35
Below cut line: data request, dashboard bug triage

1 focus / 2 tasks / 4 quick: Calendar: 3 meetings: Scheduled work: 4h 30m / Realistic capacity: 5h

Write to today's day archive? (or adjust)
```

### Pre-write readiness gate

Before writing, recompute readiness for every active task. Remove the task from active `tasks[]` and put it below the cut line if any of these are true:

- `ticketFields.objective` or `ticketFields.doneWhen` is missing, empty, `Unknown`, or still has unresolved placeholders.
- `estimateMinutes` or `workDepth` is missing.
- A deep, risky, delegated, source-dependent, code, or data task is missing required background, sources, constraints/non-goals, or verification.
- A task uses `sourcesOverride: "Unknown"` instead of a real source, explicit `None needed`, or empty source for a truly simple shallow task.

Only write active tasks with `agentReadiness: "ready"` and empty warnings. If the task is intentionally capture-only, keep it in `ideas.text` or ask the user to qualify it first.

### Write the JSON archive:

Do not write files until the user explicitly approves the summary or gives an equivalent command such as "write it" or "looks good." After approval, write the JSON archive directly:

- `${archiveDir}/{YYYY-MM-DD}/day.json`
- `${archiveDir}/{YYYY-MM-DD}/calendar.json`
- `${archiveDir}/_index.json`

Set `day.json.lifecycle.morningRunAt` only after today's `day.json`, `calendar.json`, and `_index.json` have been written successfully. Carry citations through: the `Source` column in the briefing table maps to source references in `day.json`. Include thread URLs and file paths captured in Step 2, not just the source type label. Quick items can omit source references unless the source adds context not obvious from the task text.

Use the schema v8 app-compatible task shape. Each active task should have `agentName`, `ticketFields`, `workDepth`, `agentReadiness: "ready"`, empty `readinessWarnings`, structured `sourceRefs`, supported status/kind, `estimateMinutes`, `scheduledStart`, and `scheduledEnd` where scheduled. Preserve existing `agentRuns[]` if present. Do not write `brief`, `rawThoughts`, or stored `ticketBody`. Write breaks/lunch into `day.json.breaks[]`. Write other people's monitored work into `day.json.trackers[]` with stable ids, `person`, `work`, `status`, `originalAskDate`, `sourceRefs`, concise `notes`, and `relatedTaskIds` if a task acts on it today. Below-cut-line items should not be written as active `tasks`; capture them in `ideas.text` or `dayNotes` with enough source context to revive later. The persistent app at `http://localhost:3020/studio` loads the day.

Safe write flow:

1. Build draft `day.json`, `calendar.json`, and `_index.json` in memory.
2. Write drafts to temp paths.
3. Validate drafts against schema v8 / v3 / v1.
4. Parse drafts through the app normalizer if available.
5. Create `.bak` files for existing archive files.
6. Atomically rename temp files into place.
7. Set `lifecycle.morningRunAt` only after all three files validate and write successfully.
8. If any step fails, leave the existing archive untouched and report the failure.

Update `_index.json` so today's date appears in navigation/history with its latest update time and morning-run state. Ensure `calendar.json` uses `schemaVersion: 3`, records source status, and excludes full event descriptions.

### First-time setup:

On first invocation, use manual-only local defaults unless the user has already configured source connectors:

1. Resolve and confirm `archiveDir`; the code default is the XDG data path `$XDG_DATA_HOME/working-memory/Interactive Working Memory` (e.g. `~/.local/share/working-memory/Interactive Working Memory`), resolved by the studio's runtime config. A machine-local override lives in `INTERACTIVE_MEMORY_DIR`, persisted in the XDG config file (`${XDG_CONFIG_HOME:-$HOME/.config}/working-memory/ensure-studio.local.sh`) that `ensure-studio.sh` sources. Point at a different/external archive only when the user explicitly asks for one.
2. Resolve `timezone` reliably: compare Google Calendar's own `timeZone` field against the terminal/system timezone. If they agree, treat it as resolved and state it plainly. If they disagree, only one is available, or neither is, ask the user directly. Never silently prefer one signal (a background session's terminal clock reflects the execution environment, not necessarily the user). Store the confirmed value in today's `day.json.timezone` for reuse by later steps.
3. Create `${archiveDir}/` if it does not exist.
4. Create root `_index.json` if it does not exist.
5. Create today's date folder with `day.json` and `calendar.json`.
6. Skip Slack/Gmail/Jira/Calendar source scans unless connectors are configured; ask the user for manual candidate tasks and busy windows instead.

Source connectors and direct deploy are optional advanced setup. Do not block first-run archive creation on either.

After writing, start or confirm the studio with the bundled script from this skill directory:

```bash
INTERACTIVE_MEMORY_DIR="{archiveDir}" WORKING_MEMORY_TIMEZONE="{timezone}" scripts/ensure-studio.sh
```

If port 3020 is occupied by an old or unrelated process, rerun with `WORKING_MEMORY_STUDIO_PORT={free-port}`. Then fetch `/api/studio/health` on that port and verify `config.interactiveMemoryDir` equals resolved `archiveDir` and `config.timezone` equals resolved `timezone`; fetch `/api/studio/current` and verify `selectedDate` is today's date in resolved `timezone`, `bundle.day.schemaVersion` is `8`, and `settings.schemaVersion` is `1`. Confirm the final studio URL to the user.

---

## Step 8: Refresh Completion Facts (once per day)

After today's `day.json` is written, check `day.json.completionFacts`. If it is already a non-empty array, skip this step. Otherwise, spawn a single read-only research sub-agent with the Agent/Task tool, model `haiku`, whose only job is to WebSearch for 5 fresh, light fun/trivia facts, nothing hardcore, not work- or domain-related, in the same style as the app's existing examples (art, science, coffee, fitness, health, design, life hacks), and return them as `{subject, text}` pairs. This is a read-only WebSearch task: the sub-agent edits nothing, runs no state-changing command, and performs no user task; it only returns fact text. Write the returned pairs into today's `day.json.completionFacts` through the same safe-write flow (temp file, validate, `.bak`, atomic rename), bump `updatedAt`, and refresh root `_index.json`. If the sub-agent fails or returns fewer than usable facts, leave `completionFacts` unset and let the app fall back to its built-in pool.
