# Sweep Flow

Target: fully headless. A sweep is a capture net between good mornings. It harvests
action-item candidates from the configured sources since the last checkpoint and submits
them once to the rolling queue. It runs with no user present, so every decision is
automatic and every step is read-only except the single submission POST.

The queue is triage, not a plan. A candidate becoming a real task happens later, only when
the user grills it in the studio. This flow never creates that task.

---

## HARD RULES (read first)

- Never create a task, ticket, or day plan. Never write `day.json`, `calendar.json`, or
  `queue.json` directly.
- Never send any outbound message: no Slack post, no email, no Jira comment/transition, no
  calendar event. Harvesting is read-only.
- The ONLY write this flow performs is one `POST /api/studio/queue/sweep`. All queue writes
  go through the studio server; the sweep agent never touches `queue.json` on disk.
- Never dismiss or consume queue items. Dismissal and grill-apply are user actions only.
- No user is present. Do not ask questions, do not block on interactive auth. A source that
  needs auth you cannot complete is reported `skipped`, not faked as `ok`.
- Report per-source health honestly. A source that errored is `failed` with a short detail.

---

## Step 0: Reach the studio + read current queue state

1. Fetch `GET /api/studio/queue` at the resolved studio URL (default
   `http://localhost:${WORKING_MEMORY_STUDIO_PORT:-3020}`).
2. If that request fails (connection refused, non-2xx, or the studio is down), start the
   studio with the bundled script, then retry the GET exactly once:

   ```bash
   INTERACTIVE_MEMORY_DIR="{archiveDir}" WORKING_MEMORY_TIMEZONE="{timezone}" scripts/ensure-studio.sh
   ```

   After the script reports ready, fetch `GET /api/studio/health` and confirm
   `config.interactiveMemoryDir` equals the resolved `archiveDir`, then retry
   `GET /api/studio/queue`. If it still fails, stop: record nothing, submit nothing.
3. The GET returns a `QueueFile`:

   ```json
   {
     "schemaVersion": 1,
     "updatedAt": "<ISO>",
     "sweep": {
       "lastSweepAt": "<ISO>",
       "lastSweepKind": "scheduled | manual | morning",
       "checkpoint": "<ISO>",
       "sources": [{ "source": "slack", "status": "ok", "detail": "" }]
     },
     "items": [ /* QueueItem[] */ ]
   }
   ```

   Keep the full `items` array in working memory. You need it for topic identity (Step 3)
   and to avoid resubmitting events the server already knows.

---

## Step 1: Determine the harvest window

- Capture `sweepStartedAt = now()` (ISO, resolved `timezone`) BEFORE harvesting anything.
  This becomes the checkpoint you submit, so any event arriving during the sweep is caught
  by the next run rather than dropped.
- Read `sweep.checkpoint` from the GET payload. Harvest events strictly after it.
- If `sweep.checkpoint` is missing (first sweep ever), default the window start to the
  start of the current local day in the resolved `timezone`. Never run an unbounded scan.

---

## Step 2: Harvest each source since the checkpoint

Use the exact tools, auth, and dedup notes in [source-queries.md](source-queries.md). The
only change from the morning scan is the window: events strictly after the checkpoint, not
a fixed 24h. For tool-not-loaded, run `ToolSearch select:<name>` first; if no match, the
source is unreachable this run.

| Source | Harvest | Fingerprint format |
| ------ | ------- | ------------------ |
| Slack | DMs to the user + @mentions of the user since checkpoint | `slack:{channelId}:{ts}` (e.g. `slack:C0123:1720900000.123`) |
| Gmail | Inbox messages addressed to the user since checkpoint; open actionable threads to read the ask | `gmail:{messageId}` |
| Jira | Issues newly assigned to the user OR where the user is explicitly mentioned since checkpoint | `jira:{KEY}:{event}` (e.g. `jira:PROJ-12:assigned`, `jira:PROJ-12:mention`) |
| Calendar / Zoom | Meetings that ENDED since checkpoint; pull the transcript/recap/assets when available and extract action items for the user | `calendar:{eventId}` (or `meeting:{eventId}` for a transcript-derived item) |

- For Calendar/Zoom, filter to meetings whose END time falls in the window
  `(checkpoint, sweepStartedAt]`. A meeting still in progress has not ended yet: skip it
  this run, it will end before a later sweep.
- If a source connector is not configured, mark it `skipped`. If it needs interactive auth
  you cannot complete headless, mark it `skipped` with detail (e.g. `not authenticated`).
  If it errors (auth expired, rate limit, timeout, disconnected), mark it `failed` with a
  short detail. Continue with the sources that worked.

---

## Step 3: Build candidates (the candidate bar)

For each harvested event, decide whether it is plausibly an action item for the user.

- Include when it plausibly needs the user to do something. When unsure, include it: the
  queue is triage and the user dismisses what does not belong.
- Do NOT include other people's items unless the user is explicitly on the hook (directly
  assigned, directly asked, directly named as owner). A meeting action item owned by
  someone else, an FYI, or a decision with no ask for the user is not a candidate.

Each candidate is a `QueueCandidate`:

```json
{
  "title": "short imperative candidate title",
  "summary": "1-2 sentence gist",
  "harvestedContext": "raw excerpt(s) that pre-seed the grill conversation",
  "sourceRefs": [{ "kind": "slack", "label": "Slack: #team-updates", "url": "..." }],
  "fingerprints": ["slack:C0123:1720900000.123"],
  "matchedTask": { "taskId": "...", "taskDate": "YYYY-MM-DD", "title": "..." },
  "mergeIntoItemId": "queue-...",
  "reAskOfItemId": "queue-..."
}
```

- `title` is a short imperative, generic style (e.g. `fix login timeout`, `reply to
  onboarding thread`, `review the pricing doc`).
- `harvestedContext` carries the actual excerpt(s) so the grill session opens with real
  context, not a restatement of the title.
- `sourceRefs` reuse the existing shape: `kind`, human `label`, optional `url`. Omit `url`
  when there is no shareable permalink; never emit a bare `Slack` label with no channel/DM.
- `matchedTask`, `mergeIntoItemId`, `reAskOfItemId` are set only per Steps 4 and 5.

---

## Step 4: Topic identity (your job, not the server's)

Fingerprints only catch the SAME event re-seen; the server handles that automatically.
TOPIC identity across DIFFERENT events is yours. Compare each candidate against the `items`
array from the GET payload and set at most one id field:

- **(a) Same ask, new event, still queued.** The candidate is the same ask as an existing
  item whose `status` is `queued`, but it arrived through a new event (a follow-up message,
  a re-send). Set `mergeIntoItemId = <that item's id>`. Do not also set `reAskOfItemId`.
- **(b) Ambient re-mention of a dismissed topic.** The candidate merely echoes the topic of
  an item whose `status` is `dismissed` (chatter, an FYI, someone else still discussing it),
  with no new direct ask to the user. DROP it entirely: do not submit it.
- **(c) New direct ask re-raising a dismissed topic.** A NEW event directly asks the user
  (a fresh assignment, a direct @mention or DM, a direct email ask) and its topic matches an
  item whose `status` is `dismissed`. Set `reAskOfItemId = <the dismissed item's id>`. This
  re-queues the topic as a new item carrying a "dismissed before" marker. Do not also set
  `mergeIntoItemId`.

If a candidate matches nothing in `items`, leave both id fields unset: the server creates a
new queued item. If your id field points at a missing or wrong-status item, the server
falls back to creating a new item, so an imperfect guess never loses the candidate. When in
doubt between (a) and a fresh item, prefer merging into the queued item to avoid duplicates.

---

## Step 5: Match against today's plan (annotate only)

- Fetch `GET /api/studio/current` and read the day plan tasks in `bundle.day`.
- For each candidate, set `matchedTask` when it plausibly overlaps an existing task by
  title similarity OR a shared Jira key. Use `taskId`, `taskDate` (the plan date the matched
  task lives on, normally today), and the matched task `title`.
- Matching NEVER suppresses a candidate. It only adds a "possible match" annotation the
  studio shows as a chip. A matched candidate is still submitted.

---

## Step 6: Fingerprints

- Every candidate needs at least one non-empty fingerprint string.
- Use the stable per-event ids in Step 2's table (Slack channel+ts, Gmail message id, Jira
  key+event, calendar/meeting event id). A candidate merged from several events (Step 4a)
  may carry several fingerprints: include all of them so the server can union them.
- Never invent or reuse a placeholder fingerprint. If you cannot derive a stable id for an
  event, do not submit that candidate.

---

## Step 7: Submit once, with honest health

Build the sweep meta and POST all candidates in a single request:

- `POST /api/studio/queue/sweep` with body `{ candidates: QueueCandidate[], sweep: QueueSweepMeta }`.
- `QueueSweepMeta`:

  ```json
  {
    "lastSweepAt": "<now, ISO>",
    "lastSweepKind": "scheduled",
    "checkpoint": "<sweepStartedAt from Step 1>",
    "sources": [
      { "source": "slack", "status": "ok" },
      { "source": "gmail", "status": "ok" },
      { "source": "jira", "status": "failed", "detail": "401 unauthorized" },
      { "source": "calendar", "status": "ok" },
      { "source": "meeting", "status": "skipped", "detail": "not authenticated" }
    ]
  }
  ```

- `lastSweepKind` is `scheduled` for a background run and `manual` when a person runs this
  flow by hand in a session. `checkpoint` is `sweepStartedAt`, so the next sweep resumes
  strictly after this run.
- List a `sources` entry for every source you attempted: `ok` only when it actually
  returned, `failed` with a short detail on error, `skipped` when unconfigured or
  unauthenticated. Never report `ok` for a source you could not reach.
- Submit even when `candidates` is empty (the empty array is valid): the sweep meta still
  advances the checkpoint and records source health.
- The server merges by fingerprint and id per its precedence rules, replaces the sweep meta
  wholesale, and prunes old dismissed/consumed items. Do not pre-dedupe against the server's
  own event identity: submit the candidate with its fingerprints and let the server merge.
- On a non-2xx response, log the body and retry the POST once. If it still fails, stop:
  never fall back to writing `queue.json` yourself.

---

## Edge cases

- **Studio unreachable after one restart retry.** Stop cleanly. Submit nothing. The next
  sweep or the morning flow will re-harvest from the same checkpoint.
- **No new events since checkpoint.** Submit an empty `candidates` array with the advanced
  checkpoint and source health, so the queue's "last sweep" line stays honest.
- **A source is down.** Report it `failed` and keep the other sources. The studio header
  shows a warning dot for a failed source even when the queue is otherwise empty.
- **Overlapping runs (a manual sweep near a scheduled one).** Harmless: fingerprint identity
  on the server collapses the same events, so double-harvesting cannot create duplicates.
