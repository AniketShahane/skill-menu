# Sweep

Runs every 15 minutes (the gate skips quiet ones). Capture new asks since the last sweep and add them
to the queue. You don't prep them: each new ask gets its own card session
([card-session.md](card-session.md)), which preps the ask, posts its card and handles every reply.
A session costs far more than this run, so a later sweep first checks each ask still needs one
(step 5). Then post the filtered digest, reconcile and learn ([learn.md](learn.md)).

## Contents
1. Window
2. Harvest (per source)
3. Candidate bar
4. Add and de-duplicate
5. Pre-check waiting asks
6. The filtered digest
7. Finish

## 1. Window

- `$AQ now` → record `sweepStartedAt` (its `iso`) BEFORE harvesting, so asks that arrive mid-sweep
  land in the next window.
- For each enabled source in `config.sources`: `$AQ checkpoint get <source>`. Harvest strictly after
  it. No checkpoint (first run): start of today in `config.timezone`. Never scan unbounded.
- Querying from 10 minutes before the checkpoint is fine: fingerprints make overlaps harmless.

## 2. Harvest

Load tools with `ToolSearch` first when they are deferred. A source whose tools are missing, or that
errors, is skipped for this run (see step 7 for alerting). Only collect asks directed at the user.

| Source | What to pull | Fingerprint |
|---|---|---|
| Slack | DMs to the user: `slack_search_public_and_private` query `to:<@{userId}> after:{day-before-checkpoint}`. Mentions: query `<@{userId}> after:{…}`. Keep messages with `ts` after the checkpoint, not from the user, not in the self-DM. | `slack:{channelId}:{ts}` |
| Jira | Newly assigned: `assignee = "{accountId}" AND (created >= "{since}" OR assignee CHANGED TO "{accountId}" AFTER "{since}")`. Comments: `(assignee = "{accountId}" OR reporter = "{accountId}" OR watcher = "{accountId}") AND updated >= "{since}"`, then `getJiraIssue` and keep comments after the checkpoint, by others, that mention or ask the user. Use `searchJiraIssuesUsingJql` with `config.jira.cloudId`; add `AND project IN (…)` when `config.jira.projects` is set. `{since}` is `yyyy/MM/dd HH:mm` in `config.timezone`. | `jira:{KEY}:assigned`, `jira:{KEY}:comment:{commentId}` |
| Zoom | `ToolSearch` query `zoom`. If only authenticate tools appear, skip (needs an interactive login). Meetings that ended after the checkpoint: read the AI summary / next steps; keep action items owned by the user. | `zoom:{meetingId}:{action-slug}` |
| Gmail | `search_threads` query `in:inbox after:{checkpointEpochSeconds} -from:me -category:promotions -category:social -category:updates -category:forums`; `get_thread` on likely asks. Keep messages with the user in To (not only CC or a list). | `gmail:{messageId}` |

Always read the full Slack thread (`slack_read_thread`) around a hit before judging it: the ask is
often in the parent, and the user may already have answered.

## 3. Candidate bar

Make it an item when a specific person asks the user to do, answer, decide, review, or prepare
something.

- Not an ask for the user, so create it with `"status": "filtered"` (it appears in the digest):
  FYIs, announcements, automated notifications (except Jira assignments), other people's action
  items, and anything matching a `## Filters` rule in playbooks.md.
- Already handled, so skip entirely: the user replied after the ask and the reply resolves it.
- Unsure: create it as `filtered`. The digest makes that cheap to undo.

## 4. Add and de-duplicate

1. `$AQ list --open` once. If a candidate is the same ask as an open item (a follow-up, a nudge, the
   same request in another channel), set `"mergeInto": "AQ-n"`.
2. Write the candidate to `tmp/cand-<n>.json` and `$AQ add --file tmp/cand-<n>.json`:

```json
{
  "title": "Send Sam the Q3 export numbers",
  "source": { "kind": "slack", "who": "Sam Lee", "where": "#eng-platform", "url": "https://…",
              "channelId": "C123", "ts": "1727450000.1234", "threadTs": "1727449000.0001" },
  "excerpt": "Can you send me the Q3 export numbers before Thursday's review?",
  "fingerprints": ["slack:C123:1727450000.1234"]
}
```

`duplicate` means nothing new. `created` means a new ask: leave it `new` for its card session.
`merged` means an open item got a follow-up: pass it to that card's session, which posts it in the
card thread and re-preps if the ask changed. Write
`{"messages": [{"text": "Follow-up from <who> in <where>: <one line> <url>"}]}` to
`tmp/route-AQ-n.json` and run `$AQ route AQ-n --file tmp/route-AQ-n.json` (no `seenTs`: this is
not a card-thread message). A `filtered` item can't take follow-ups that way: leave it in the digest.

## 5. Pre-check waiting asks

`$AQ precheck` lists asks that are `workers.prepDelayMin` (10) minutes old and still wait for this
check, with `sameThread` (other cards on the same Slack thread) and `sessions` (the user's own Claude
Code sessions: name, state, start time; `null` if they couldn't be listed). Nothing listed: skip this
step. For each ask, read its source thread once (`slack_read_thread`) and the ask's reactions
(`slack_get_reactions` on the ask's `ts`), then pick ONE verdict:

| verdict | When | Effect |
|---|---|---|
| `handled` | The user wrote in the thread after the ask (any reply, even a question back: they're on it), or reacted 👀 ✋ ✅ to it, or someone else answered it and the asker is satisfied. | skipped, silently |
| `duplicate` | A `sameThread` card (or another open card) already covers the same ask. Set `relatedTo`. If the new message adds something (a deadline, a new detail), also pass it on: `$AQ route <relatedTo>` as in step 4. | skipped |
| `in-progress` | One of the user's sessions is clearly on this work (its name matches the topic, e.g. `wash-trading-methodology-review` for "demo your wash trading method"), and it is `working` or started after the ask. Name the session in `reason`. | skipped |
| `needed` | None of the above, or unsure. | its card session starts |

Unsure means `needed`: a missed ask costs more than one session. Write
`{"verdict": "…", "reason": "<one line with the evidence>", "relatedTo": "AQ-m"}` to
`tmp/pre-AQ-n.json` and run `$AQ precheck AQ-n --file tmp/pre-AQ-n.json`. An ask nobody checks
starts anyway after `workers.precheckWaitMin` (45) more minutes.

## 6. The filtered digest

If any items were created as `filtered` this sweep, post ONE digest message to
`config.slack.selfDmId` (cards.md) and set each filtered item's `card` to
`{ "channelId": selfDmId, "ts": <digest ts>, "lastSeenTs": <digest ts> }`. Post nothing else: cards
for new asks come from their card sessions.

## 7. Finish

1. Reconcile `drafted` items and run the learn steps ([learn.md](learn.md)).
   **Cards the user handled themselves** (at most every 2 hours: checkpoint `reconcile:open`): for
   each `asking`, `approving` or `scoping` item from a Slack source, read the source thread with
   `oldest` = `card.ts`. If the user answered the asker there, or said they're on it, post
   `🤖 ⏭️ **AQ-n · Closed: you answered in the thread**` in the card thread, set `skipped` with
   `--note "the user handled it in the source thread"`, and add a ledger entry (learn.md section 2).
   Then `$AQ checkpoint set reconcile:open <sweepStartedAt>`.
2. For each source that succeeded: `$AQ checkpoint set <source> <sweepStartedAt>`. Leave a failed
   source's checkpoint alone so the next sweep retries the same window.
3. Source failures: at most once per day per source (`$AQ checkpoint get alert:<source>` is today's
   date → stay quiet), post `🤖 ⚠️ **Sweep: <source> unavailable** (<short reason>)` and set
   `alert:<source>` to today's date.
4. `$AQ checkpoint set sweep:last <sweepStartedAt>`.
