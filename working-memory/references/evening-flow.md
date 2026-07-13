# Evening Flow

Target: < 2 minutes. Quick sweep, not a ceremony. Skipping this is fine: morning carry-forward handles missed evenings gracefully.

---

## Step 0: Resolve Config + Optional Jira Pre-flight

Resolve `archiveDir` and `timezone` before reading or writing today's archive. Evening's only connector-dependent step is the Jira ticket re-check in Step 1, used to pre-fill the status sweep. If Jira is not configured, skip this probe and tell the user once that the status sweep will be manual.

Slack, Gmail, and Calendar aren't used in the evening flow. Zoom meeting context is used only when the Zoom MCP connector is configured. Skip probing unconfigured sources.

**Probe configured Jira (same as morning-flow Step 0's Jira probe):**

`mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql` with `cloudId: "{jiraCloudId}"`, JQL `assignee = "{jiraAccountId}" AND status NOT IN (Done, Closed) AND project IN ({jiraProjects}) ORDER BY priority DESC, updated DESC`, `maxResults: 1`. Tool-not-loaded handling matches morning-flow Step 0: run `ToolSearch select:<name>` first; if no match, treat as failed.

**If pass:** proceed to Step 1.

**If fail:** unlike morning, evening's failure is soft — the flow can still write a useful summary, just without Jira pre-fill. Tell the user once and keep going by default:

```
Jira connector unreachable ({short error}). Continuing without Jira pre-fill: the status sweep will be manual. Reconnect and re-run if you want pre-filled statuses.
```

Then proceed to Step 1 with the per-ticket Jira lookups skipped — the status sweep presents tasks without pre-filled markers; the user marks each manually. Everything else runs normally.

The user can `abort` here if they prefer to reconnect first, but the default is proceed-with-warning. There's no batch question like morning's; evening's cost-of-degraded is much lower than morning's.

---

## Step 1: Read Today's Day Archive + Re-check Jira

Read today's canonical archive:

```text
${archiveDir}/{YYYY-MM-DD}/day.json
```

If today's `day.json` is missing, start a fresh JSON archive from the user's evening summary.

**If no `day.json` exists for today:** _"No morning plan found for today. Want to build a quick evening summary from scratch? Tell me what you worked on."_ Then create a minimal `day.json` with an evening summary and refresh root `_index.json`. Leave `lifecycle.morningRunAt` unset so the studio can still warn that Good Morning did not run.

**Re-check Jira status** for any ticket keys referenced in the day archive:

- For each Jira key found (regex `[A-Z]+-\d+`), fetch current status via `mcp__claude_ai_Atlassian__getJiraIssue`.
- Pre-fill task statuses where Jira shows a change:
  - Jira status = Done/Closed → pre-fill as `[x]` done
  - Jira status = In Progress → pre-fill as `[/]` in-progress
  - Jira status unchanged from morning → leave for user to confirm

Run Jira lookups in parallel for all referenced tickets.

**Re-check today's Zoom meetings when configured:**
Meetings that happened during the day may have generated new recaps that weren't in the morning scan. If the Zoom MCP connector is configured (see [source-queries.md](source-queries.md) for tool-discovery + auth), pull today's meetings and read any not already referenced in today's `day.json`. Extract action items for the configured user and open questions. Present these as new items discovered during the day: they'll appear in the status sweep as additions the user can confirm or defer.

---

## Step 2: Quick Status Sweep

Present all tasks in a single batch with pre-filled statuses:

```
End of day: {date}

Mark each: (x) done, (/) in progress, (-) deferred, (d) dropped
Pre-filled from Jira where possible:

Focus:
1. [x] PROJ-847: Fix dashboard filter (Jira: Done)

Tasks:
2. [/] PROJ-852: Build metric views (Jira: In Progress)
3. [x] Q2 OKR action items
4. [x] Metrics check for partner

Quick:
5-9. [list each with suggested status]

Adjust or confirm: "all correct" / "2 is actually done, 7 is dropped"
```

**User response formats (all accepted):**

- `"all correct"` → accept all pre-filled statuses
- `"2 is done, 7 dropped"` → override specific items
- `"1-4 done, 5 in progress, rest deferred"` → batch update
- Full skip: `"done"` or `"close it out"` → mark all non-completed as deferred

**Follow-up questions (minimal):**

- For each item marked **in-progress**: _"What's left?"_: One sentence for tomorrow's context.
- For each item marked **dropped**: _"Why?"_: So the skill doesn't re-surface it.
- For deferred items: no questions. Carry forward automatically.
- Batch these follow-ups into a single message if multiple items need them.

If `day.json.trackers[]` has active, waiting, or blocked items, present a concise tracker sweep immediately after the task sweep:

```
Trackers:
T1. [waiting] Sam: KPI one-pager (open 4 days)
T2. [blocked] Riley: onboarding doc (open 2 days)

Update trackers: "T1 still waiting, T2 done", "drop T1: no longer needed", or "no tracker changes"
```

Accepted tracker statuses: `active`, `waiting`, `blocked`, `done`, `dropped`. Ask for a short reason only when a tracker is marked `blocked` or `dropped`.

---

## Step 3: Capture Late Additions

After status sweep, ask once:

_"Anything come up today that wasn't on the plan? Quick items you handled, meetings that generated action items?"_

If the user provides items:

- Classify as done or in-progress.
- If the user mentions a source (Slack thread, meeting name, email), capture it as a structured `sourceRefs` entry: `kind`, human-readable `label`, and optional `url`. If context behind the item isn't obvious from the task text, capture a one-sentence note in `ticketFields.background`: only ask if you have no basis to infer it.
- Add to the evening summary (not to the main task sections: those are frozen from morning).

If the user says "no" or "nothing" → skip.

---

## Step 4: Update Day Archive + Shutdown Signal

### Update task statuses in `day.json`

Change task status based on the status sweep:

- Done: set `status: "done"`, set `completedAt`, and update `updatedAt`.
- In-progress: set `status: "in_progress"`, capture the "what's left" sentence in `ticketFields.background` or `dayNotes`, and update `updatedAt`.
- Deferred: keep or set `status: "todo"` so carry-forward handles it; record age/context in `ticketFields.background` or the evening `dayNotes`.
- Dropped: do not write unsupported statuses. Record the task id/title and reason in the `Dropped` section of `dayNotes`; the next morning carry-forward excludes those dropped items unless the user explicitly revives them.

### Update trackers in `day.json`

For each tracker sweep update:

- `active`, `waiting`, `blocked`: preserve the tracker for tomorrow, update `status`, `notes`, and `updatedAt`.
- `done`: set `status: "done"`, set `completedAt`, update `notes` with the landing signal, and do not carry it forward tomorrow.
- `dropped`: set `status: "dropped"`, update `notes` with the reason, and do not carry it forward tomorrow.
- If a completed or dropped tracker has related open tasks, either close/drop those tasks with the user's approval or remove the tracker link from `task.trackerIds`.

### Update day metadata

Set `day.json.status` to `"closed"`, update task timestamps, update `updatedAt`, and refresh root `_index.json` with the day's latest update/closed state. The current schema has no dedicated evening lifecycle field; store the evening summary in `dayNotes`.

### Write evening summary

Write the evening summary into today's `day.json` using the app's summary/day-notes fields. Preserve the same content shape:

```text

### Done ({done_count}/{total})
- [x] **PROJ-847**: Fixed WHERE clause: dashboard validates correctly for all date ranges
- [x] Q2 OKR action items: proposed 3 OKRs, sent to manager
- [x] Metrics check: numbers confirmed, replied in #team-channel

### In Progress ({ip_count}/{total})
- [/] **PROJ-852**: Build metric views: 3 of 5 deployed, blocked on dedup logic
  - Left: `metric_trades` and `metric_unique_users` views

### Deferred ({deferred_count}/{total})
- [ ] Review aging alert *(day 6 ⚠️)*
- [ ] Reply to partner re volume report *(day 3 ⚠️: comm: unanswered communication carries risk; consider a holding-reply)*

### Dropped ({dropped_count}/{total})
*(none)*

### Trackers
- [waiting] Sam: KPI one-pager *(open 4 days; next check tomorrow)*
- [done] Riley: onboarding doc *(landed today)*

{If late additions exist:}
### Late Additions
- [x] Responded to compliance team Slack thread (unplanned)
- [/] Started API estimation spike from afternoon discussion

---
**Day score:** {done}/{total} complete
**Tomorrow's carry-forward:** {brief list of in-progress + deferred items}
```

### Shutdown signal

Read the continuous-monitoring queue count before closing: `GET /api/studio/queue`, count items whose `status` is `queued`. This is report-only. The evening flow never grills, dismisses, or otherwise triages a queue item; un-grilled items roll over day to day until the user acts on them. If the studio or the queue endpoint is unreachable, omit the rollover line silently.

Close with a brief message: this is the ritual closure:

```
Day closed. {done} of {total} complete.

{If focus item was completed:}
Deep work done: {focus item summary}

Carrying forward: {count} items ({in-progress count} in-progress, {deferred count} deferred{, ⚠️ count at 5+ days if any})

{If N queued items > 0:}
Queue: {N} items still un-triaged, rolling over.

Your brain is off the clock. Anything not captured here waits until morning.
```

---

## Edge Cases

**User skipped evening for multiple days:**
No problem. The morning flow reads the most recent prior `day.json` regardless of age. Unchecked tasks carry forward. The only loss is the evening summary: which is a nice-to-have, not load-bearing.

**User runs evening before lunch:**
Fine: the flow doesn't enforce time-of-day. If the user wants to do a mid-day checkpoint, this works as-is.

**All tasks already done (per Jira pre-fill):**
Present the pre-filled sweep, get quick confirmation, write a short summary. Total time: 30 seconds.

**Zero tasks on the plan:**
_"Empty plan today: did you skip the morning flow, or was it an unplanned day? Want me to build a quick summary of what you actually did?"_
