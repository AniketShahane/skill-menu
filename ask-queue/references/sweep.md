# Sweep

Runs every 15 minutes (the gate skips quiet ones). Capture new asks since the last sweep and add them
to the queue. You don't prep them: each new ask gets its own card session
([card-session.md](card-session.md)), which preps the ask, posts its card and handles every reply.
A session costs far more than this run, so a later sweep first checks each ask still needs one
(step 5). Then post the filtered digest, reconcile and learn ([learn.md](learn.md)).

## Contents
1. Window
2. Harvest (per source)
2b. Promises and waits (once a day)
3. Candidate bar
4. Add and de-duplicate
5. Pre-check waiting asks
6. The filtered digest
7. Finish

## 1. Window

- `$AQ now` → record `sweepStartedAt` (its `iso`) BEFORE harvesting, so asks that arrive mid-sweep
  land in the next window.
- For each enabled source in `config.sources`: `$AQ checkpoint get <source>`. Harvest strictly after
  it. No checkpoint (first run): start of today in `config.timezone`; a missing checkpoint is never
  a reason to skip a source. Never scan unbounded.
- Querying from 10 minutes before the checkpoint is fine: fingerprints make overlaps harmless.

## 2. Harvest

Harvest every enabled source on every sweep. Load tools with `ToolSearch` first when they are
deferred: Slack `select:mcp__claude_ai_Slack__slack_search_public_and_private,mcp__claude_ai_Slack__slack_read_thread`,
Gmail `select:mcp__claude_ai_Gmail__search_threads,mcp__claude_ai_Gmail__get_thread`, Zoom
`select:mcp__claude_ai_Zoom_for_Claude__search_meetings,mcp__claude_ai_Zoom_for_Claude__get_meeting_assets`.
A source is skipped only when that load finds no tools, or a call errors (see step 7 for alerting).
Only collect asks directed at the user.

| Source | What to pull | Fingerprint |
|---|---|---|
| Slack | DMs to the user: `slack_search_public_and_private` query `to:<@{userId}> after:{day-before-checkpoint}`. Mentions: query `<@{userId}> after:{…}`. Keep messages with `ts` after the checkpoint, not from the user, not in the self-DM. | `slack:{channelId}:{ts}` |
| Jira | Newly assigned: `assignee = "{accountId}" AND (created >= "{since}" OR assignee CHANGED TO "{accountId}" AFTER "{since}")`. Comments: `(assignee = "{accountId}" OR reporter = "{accountId}" OR watcher = "{accountId}") AND updated >= "{since}"`, then `getJiraIssue` and keep comments after the checkpoint, by others, that mention or ask the user. Use `searchJiraIssuesUsingJql` with `config.jira.cloudId`; add `AND project IN (…)` when `config.jira.projects` is set. `{since}` is `yyyy/MM/dd HH:mm` in `config.timezone`. | `jira:{KEY}:assigned`, `jira:{KEY}:comment:{commentId}` |
| Zoom | Load the Zoom tools as above; if only authenticate tools exist, skip (needs an interactive login). `search_meetings` with `from` = 3 hours before the checkpoint (AI summaries can appear well after a meeting ends) and `to` = now, both UTC; the time zone is `config.timezone`. Meetings with `meeting_category` `history` and `has_summary` true: `get_meeting_assets` with the `meeting_uuid`, read the summary / next steps; keep action items owned by the user. Fingerprints make the overlap harmless. (`search` with the `zoom_meeting` datasource is blocked here.) | `zoom:{meetingUuid}:{action-slug}` |
| Gmail | `search_threads` query `in:inbox after:{yyyy/MM/dd of the day before the checkpoint} -from:me -category:promotions -category:social -category:updates -category:forums`. Use a date: an epoch `after:` silently matches nothing. Then keep only threads whose newest message is after the checkpoint (`get_thread`, or the message id: hex id >> 20 is its arrival time in ms). `get_thread` on likely asks. Keep messages with the user in To (not only CC or a list). | `gmail:{messageId}` |

Always read the full Slack thread (`slack_read_thread`) around a hit before judging it: the ask is
often in the parent, and the user may already have answered.

## 2b. Promises and waits (once a day)

Skip this step if `$AQ checkpoint get track:day` is today's date. Otherwise search the user's own
Slack messages: `from:<@{userId}> after:{day before checkpoint track}` (no checkpoint: the last 2
days), leaving out the card channel and the self-DM. Keep only:

- **promise**: the user commits to deliver something to a specific person ("I'll send it Friday",
  "let me check and get back to you"). Not social plans, or something done in the same message.
- **waiting**: the user asks a specific person for something they need ("can you send me the list?").
  Not rhetorical or open group questions.

Read each thread once; already delivered or answered: skip. Otherwise `$AQ add` with `"status":
"tracking"`, fingerprint `promise:{channelId}:{ts}` or `waiting:{channelId}:{ts}`, `source.who` = the
other person, `title` = the thing itself ("Q3 export numbers for Sam"), `excerpt` = the user's words,
and `track` = `{"kind": …, "due": "YYYY-MM-DD", "dueGuessed": …}`. `due` is the date they named; none:
2 working days later for a promise, 3 for a wait, with `dueGuessed: true`. Match `## Filters` too.

Then check the open ones (`$AQ list --status tracking`, at most 15, earliest due first): read the
thread after the item's `ts`. Delivered or answered: `$AQ update AQ-n --status done --note "kept:
<one line>"`, and if it has a card, say so in its thread. Post nothing else: dispatch.mjs posts the
reminder card when one is due. Finish with `$AQ checkpoint set track <sweepStartedAt>` and
`$AQ checkpoint set track:day <today's date>`.

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

If any items were created as `filtered` this sweep, post ONE digest message, top level, in the
card channel (cards.md "Where to post") and set each filtered item's `card` to
`{ "channelId": <channel>, "ts": <digest ts>, "lastSeenTs": <digest ts> }`. Post nothing else: cards
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
