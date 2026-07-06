# JSON Archive Contract

The canonical working-memory artifact is a file-backed JSON archive:

```text
${archiveDir}/
  _index.json
  {YYYY-MM-DD}/
    day.json
    calendar.json
```

The working-memory skill writes this JSON archive via the safe-write flow in `morning-flow.md`: temp file, validation, `.bak` backup when replacing an existing file, and atomic rename.

## Shared Versions And Enums

These values must stay aligned with `apps/working-memory-viewer/src/lib/interactive-memory/types.ts`.

| Field                         | Allowed values                                                   |
| ----------------------------- | ---------------------------------------------------------------- |
| `day.json.schemaVersion`      | `8`                                                              |
| `calendar.json.schemaVersion` | `3`                                                              |
| `_index.json.schemaVersion`   | `1`                                                              |
| `_settings.json.schemaVersion` | `1`                                                             |
| Task `status`                 | `todo`, `in_progress`, `review`, `done`                          |
| Task `kind`                   | `focus`, `task`, `quick`, `comms`, `personal`, `ad_hoc`          |
| Task `workDepth`              | `deep`, `shallow`                                                |
| Task `agentReadiness`         | `ready`, `warning`, `incomplete`                                 |
| Task `agentRuns[].model`      | `haiku`, `sonnet`, `opus`                                        |
| Task `agentRuns[].status`     | `launched`                                                       |
| Tracker `status`              | `active`, `waiting`, `blocked`, `done`, `dropped`                |
| Source ref `kind`             | `jira`, `slack`, `gmail`, `calendar`, `meeting`, `doc`, `manual` |
| Calendar `source`             | `google-calendar`, `manual`, `unavailable`                       |
| Day `status`                  | `active`, `closed`                                               |
| Break `kind`                  | `break`, `lunch`                                                 |

## `day.json`

```json
{
  "schemaVersion": 8,
  "date": "2026-05-22",
  "timezone": "{timezone}",
  "title": "2026-05-22: Working Memory",
  "status": "active",
  "settings": {
    "startHour": 8,
    "endHour": 18,
    "slotMinutes": 30,
    "completionTargetPercent": 100
  },
  "tasks": [
    {
      "id": "wm-20260522-riley-onboarding-review",
      "title": "Review Riley's onboarding doc",
      "agentName": "review-riley-onboarding",
      "status": "todo",
      "kind": "task",
      "estimateMinutes": 45,
      "workDepth": "shallow",
      "agentReadiness": "ready",
      "readinessWarnings": [],
      "sourceRefs": [
        {
          "kind": "slack",
          "label": "Slack: DM with Riley",
          "url": "https://slack.example.com/archives/D123/p456"
        }
      ],
      "trackerIds": ["tracker-20260522-riley-onboarding"],
      "ticketFields": {
        "objective": "Review Riley's latest onboarding doc when it lands.",
        "background": "This is the user's action attached to the tracker for Riley's work.",
        "constraintsNonGoals": "Do not close the tracker unless Riley's onboarding doc no longer needs monitoring.",
        "doneWhen": "Comments are sent back to Riley or the tracker is updated with the current blocker.",
        "verification": "Confirm the comments were sent or the tracker note was updated."
      },
      "agentRuns": [
        {
          "id": "agent-run-7f4c2a25-8ef7-4aa6-8f7c-20dfcf635a5f",
          "model": "sonnet",
          "name": "wm-20260522-riley-onboarding-review",
          "cwd": "/path/to/project",
          "launchedAt": "2026-05-22T10:00:00Z",
          "status": "launched",
          "promptSha256": "1e42c9f5e4b58f5fb8a74bd47d76f0a0df9f3a7e7b7e6b5a5ef4e54a7251c112"
        }
      ],
      "scheduledStart": "2026-05-22T10:00:00",
      "scheduledEnd": "2026-05-22T10:45:00",
      "createdAt": "2026-05-22T09:00:00Z",
      "updatedAt": "2026-05-22T09:00:00Z"
    }
  ],
  "trackers": [
    {
      "id": "tracker-20260522-riley-onboarding",
      "person": "Riley",
      "work": "Onboarding doc",
      "status": "waiting",
      "originalAskDate": "2026-05-20",
      "sourceRefs": [
        {
          "kind": "slack",
          "label": "Slack: DM with Riley",
          "url": "https://slack.example.com/archives/D123/p456"
        }
      ],
      "notes": "Waiting for Riley's next doc revision before the user reviews.",
      "relatedTaskIds": ["wm-20260522-riley-onboarding-review"],
      "createdAt": "2026-05-22T09:00:00Z",
      "updatedAt": "2026-05-22T09:00:00Z"
    }
  ],
  "breaks": [
    {
      "id": "break-20260522-lunch",
      "label": "Lunch",
      "start": "2026-05-22T12:30:00",
      "end": "2026-05-22T13:00:00",
      "kind": "lunch"
    },
    {
      "id": "break-20260522-1030",
      "label": "Break",
      "start": "2026-05-22T10:45:00",
      "end": "2026-05-22T10:50:00",
      "kind": "break"
    }
  ],
  "dayNotes": "",
  "ideas": {
    "text": "",
    "updatedAt": "2026-05-22T09:00:00Z"
  },
  "lifecycle": {
    "morningRunAt": "2026-05-22T09:00:00Z",
    "morningSources": {
      "slack": "ok",
      "gmail": "ok",
      "calendar": "ok",
      "jira": "ok"
    },
    "generatedBy": "working-memory-skill"
  },
  "generatedAt": "2026-05-22T09:00:00Z",
  "updatedAt": "2026-05-22T09:00:00Z"
}
```

### Day Rules

- Write only supported task statuses. There is no `deferred`, `dropped`, or `cancelled` status in the archive contract.
- Deferred items remain `status: "todo"` and carry their age/context in `ticketFields.background` or `dayNotes`.
- Dropped items are recorded in `dayNotes` with the task id/title and reason. The next morning carry-forward must exclude items listed in the latest dropped section unless the user explicitly revives them.
- Completed items use `status: "done"` and set `completedAt`.
- Preserve user edits when carrying tasks forward: title, `agentName`, source refs, project, `ticketFields`, schedule hints, and estimates should not be discarded.
- `ticketFields.objective`, `background`, `sourcesOverride`, `constraintsNonGoals`, `doneWhen`, and `verification` are the only task text fields. Do not write `brief`, `rawThoughts`, stored `ticketBody`, or extra planning objects.
- The app generates the final structured work order from `ticketFields` when `Copy prompt` is clicked. Keep `_settings.json`'s `{{ticketBody}}` placeholder; do not store a `ticketBody` string on tasks.
- `agentName` is the editable app display name and optional direct-deploy name. Keep it concise kebab-case, 2-5 meaningful tokens, and avoid model/date/status filler.
- `agentRuns[]` is app-owned optional deployment history. Preserve it when carrying tasks forward, but do not invent it in the skill. It stores model/name/cwd/launchedAt/status/prompt hash only, never the full prompt.
- `agentReadiness: "ready"` requires required `ticketFields` to be filled for that task's complexity, no unresolved placeholders, and empty `readinessWarnings`.
- Active morning-plan tasks should be `agentReadiness: "ready"` with empty `readinessWarnings`.
- Keep unqualified `warning` or `incomplete` items below the cut line in `ideas.text` until the user supplies enough context.
- Build `ticketFields` only from scanned sources, source refs, carried task context, targeted repo/file inspection after grilling, user answers, or clearly stated inference. Unknown needed fields must keep the item below the cut line; do not invent context.
- `workDepth: "deep"` means cognitively demanding focused work. `workDepth: "shallow"` means logistics, admin, communication, review, or coordination work.
- Use `estimateMinutes`, `scheduledStart`, and `scheduledEnd` for internal webapp time blocks. These are not Google Calendar events.
- Write `scheduledStart` and `scheduledEnd` as local wall-clock values in resolved `timezone` (`YYYY-MM-DDTHH:mm:ss`). The webapp treats task schedules as wall time for the selected day, not UTC instants.
- New scheduled tasks should use stable, findable ids such as `wm-{YYYYMMDD}-{short-slug}`. Preserve existing ids when carrying tasks forward.
- Front-load deep work before 3pm where possible.
- Prefer lighter Quick/comms/shallow work around and after the user's 3pm energy dip.
- Ask which lunch block to protect and write it to `breaks[]`.
- Add 5-minute breaks after every 45-60 minutes of scheduled work where feasible.
- `breaks[].start` and `breaks[].end` use the same local wall-clock format as tasks (`YYYY-MM-DDTHH:mm:ss`) in resolved `timezone`.
- If the approved task list does not fit the open calendar capacity, leave below-the-cut-line tasks unscheduled and record the deferral/split reason in `dayNotes` or `ideas.text`.
- Store mid-day or evening prose summaries in `dayNotes`.
- Set `lifecycle.morningRunAt` only after the morning flow has completed and the day archive has been written successfully.

### Tracker Rules

- Use `trackers[]` for other people's work that the user wants to monitor across days. Do not encode this only in a task title.
- A tracker is not a task. Create a task only when the user has an action today, such as reviewing the tracked work, sending a follow-up, or updating Jira.
- Stable tracker ids should use `tracker-{YYYYMMDD}-{person-slug}-{work-slug}`. Preserve ids across carry-forward days.
- `person` is the person or team doing the work. `work` is the deliverable or open thread being tracked.
- `createdAt` is when tracking began. `originalAskDate` is the date of the underlying ask, which may be earlier than `createdAt`.
- Age is computed from `originalAskDate` to the selected work date. Keep `originalAskDate` stable across days.
- `sourceRefs` should point to the Slack DM/thread, meeting recap, Jira ticket, Gmail thread, or doc that created the tracker.
- `notes` should stay short: latest known state, expected next check, blocker, or why it matters.
- `relatedTaskIds` links today's tasks that act on the tracker. The task may also include the tracker's id in `task.trackerIds`.
- Carry forward tracker records whose status is `active`, `waiting`, or `blocked`. Do not carry `done` or `dropped` unless the user explicitly revives them.
- Use `waiting` when the next move is with someone else, `blocked` when there is a concrete blocker, and `active` when the work is in flight but not blocked.
- Use `done` when the tracked work landed or no longer needs monitoring. Use `dropped` when the user intentionally stops tracking it; include the reason in `notes`.

## `calendar.json`

```json
{
  "schemaVersion": 3,
  "date": "2026-05-22",
  "timezone": "{timezone}",
  "source": "google-calendar",
  "generatedAt": "2026-05-22T09:00:00Z",
  "meetings": [
    {
      "id": "event-id",
      "calendarId": "primary",
      "title": "Team Daily Standup",
      "start": "2026-05-22T13:00:00Z",
      "end": "2026-05-22T13:15:00Z",
      "allDay": false,
      "status": "confirmed",
      "responseStatus": "accepted",
      "location": "",
      "htmlLink": "https://www.google.com/calendar/event?eid=...",
      "meetingUrl": "https://zoom.us/j/...",
      "attendeeCount": 8,
      "organizer": "person@example.com",
      "transparency": "opaque",
      "eventType": "default"
    }
  ]
}
```

### Calendar Rules

- The morning flow writes `calendar.json` from the Google Calendar connector. The studio only reloads this file from disk.
- If Calendar is unavailable but the user proceeds with a degraded morning flow, write `source: "unavailable"`, an empty `meetings` array unless manual events are known, and a short `error`.
- Do not store full event descriptions by default. Capture title, time, attendance/status metadata, links, location, organizer, and meeting URL when present.
- For meeting links, populate `meetingUrl` with the direct join URL when present (Zoom, Google Meet, Teams, etc.) and `htmlLink` with the Google Calendar event URL. Populate both when the connector returns both. The studio opens `meetingUrl` first and falls back to `htmlLink`.

## `_index.json`

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-22T09:00:00Z",
  "updatedAt": "2026-05-22T09:00:00Z",
  "days": [
    {
      "date": "2026-05-22",
      "schemaVersion": 8,
      "title": "2026-05-22: Working Memory",
      "status": "active",
      "updatedAt": "2026-05-22T09:00:00Z",
      "generatedAt": "2026-05-22T09:00:00Z",
      "taskCount": 1,
      "morningRunComplete": true,
      "morningRunAt": "2026-05-22T09:00:00Z",
      "generatedBy": "working-memory-skill"
    }
  ]
}
```

### Index Rules

- Refresh `_index.json` whenever `day.json` or `calendar.json` is created or updated.
- If `_index.json` is missing or stale, rebuild it by scanning date folders that contain `day.json`.
- Keep entries sorted by date descending for navigation/history.
- `morningRunComplete` is true only when `day.json.lifecycle.morningRunAt` is present.

## `_settings.json`

```json
{
  "schemaVersion": 1,
  "promptTemplate": "{{ticketBody}}\n\n## Source Links\n\n{{sources}}\n\n## Planning Metadata\n\n- Kind: {{kind}}\n- Work depth: {{workDepth}}\n- Estimate: {{estimateMinutes}} minutes\n- Project / area: {{project}}\n\n## Execution Guidance\n\n- Inspect relevant files or sources before editing.\n- Reuse existing patterns and keep changes scoped.\n- Do not revert unrelated user work.\n- Run the checks named above, or report exactly why they could not be run.\n- Ask only if blocked, destructive, security-sensitive, or success criteria are ambiguous.",
  "updatedAt": "2026-05-22T09:00:00Z"
}
```

Supported placeholders: `{{title}}`, `{{ticketBody}}`, `{{sources}}`, `{{kind}}`, `{{workDepth}}`, `{{estimateMinutes}}`, `{{readinessWarnings}}`, and `{{project}}`.

## Unsupported Writes

Do not write these fields or artifacts unless the app schema changes first:

- Task fields: `agentContext`, `priority`, `deferred`, `dropped`, `cancelled`.
- Legacy task text fields: `brief`, `rawThoughts`, stored `ticketBody`.
- Task statuses outside `todo`, `in_progress`, `review`, `done`.
- Separate objective/context/files/acceptance/verification objects outside `ticketFields`.
- Files outside `day.json`, `calendar.json`, root `_index.json`, and root `_settings.json`.
- Per-day app bundles or launch files.
