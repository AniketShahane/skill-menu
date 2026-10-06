# Sweep

Runs every 2 hours. Capture new asks since the last sweep, prep each one, post a card per ask.
Then reconcile drafts and learn ([learn.md](learn.md)).

## Contents
1. Window
2. Harvest (per source)
3. Candidate bar
4. Add and de-duplicate
5. Prep
6. Post cards and the filtered digest
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

`duplicate` means nothing new. `merged` means an open item got a follow-up: if it already has a card,
post `🤖 AQ-n · Follow-up from <who>: <one line>` in the card thread; re-prep it if the ask changed.
`created` means a new item to prep. If the merged item is `drafted` as a Slack reply and the ask
changed, its Slack draft is now out of date and can't be edited: say so in the follow-up line and
post the new text in the card thread.

## 5. Prep (each `new` item, oldest first, at most 10 per sweep)

1. **Gather.** Full thread or issue, docs linked in the ask or thread (Drive `read_file_content`,
   Notion fetch), `$AQ ledger find "<who>"` and `$AQ ledger find "<topic words>"` for what was asked
   and sent before, and the memory files.
2. **Understand.** `prep.need`: what the asker actually needs, in one sentence. `prep.output`: the
   artifact that satisfies it (a draft kind from SKILL.md). `prep.basis`: the sources you used.
3. **Label.** `askType`: reuse a playbooks.md label when one fits; otherwise coin a kebab-case 1–3
   word label.
4. **Choose the card.**
   - `approving`: you can produce the output now. Guesses are fine when labeled.
   - `asking`: a decision only the user can make; a guess you would bet against; or the draft would
     commit the user (deadline, money, headcount, a promise to someone outside the company). At most
     3 questions, each with your best guess and its basis.
   - If `askType` is in `simpleTypes`, choose `approving` unless the draft would commit the user.
5. **Draft** (approving only). Write in the user's voice (style.md), tuned to the asker (people.md),
   short, with only facts you can trace. Follow the playbook for the type when there is one.
6. **Save.** Write the patch (`askType`, `prep`, `questions` or `draft`) to `tmp/AQ-n.json`, then
   `$AQ update AQ-n --status <asking|approving> --file tmp/AQ-n.json`.

Items beyond the first 10 stay `new` and are prepped next sweep; mention the count in the digest.

## 6. Post cards and the filtered digest

- Post each card as a top-level message to `config.slack.selfDmId` using `slack_send_message`,
  formatted as in [cards.md](cards.md). Then record `card` with `$AQ update AQ-n --file`:
  `{ "card": { "channelId": selfDmId, "ts": <message ts>, "lastSeenTs": <message ts> } }`. If the send
  result lacks a `ts`, read the newest self-DM message with `slack_read_channel` (limit 1).
- If any items were created as `filtered` this sweep, post ONE digest message (cards.md) and set each
  filtered item's `card` to the digest's ts. Items left `new` over the cap are counted there too.
- Post nothing when there is nothing new.

## 7. Finish

1. Reconcile `drafted` items and run the learn steps ([learn.md](learn.md)).
2. For each source that succeeded: `$AQ checkpoint set <source> <sweepStartedAt>`. Leave a failed
   source's checkpoint alone so the next sweep retries the same window.
3. Source failures: at most once per day per source (`$AQ checkpoint get alert:<source>` is today's
   date → stay quiet), post `🤖 ⚠️ Sweep: <source> unavailable (<short reason>)` and set
   `alert:<source>` to today's date.
4. `$AQ checkpoint set sweep:last <sweepStartedAt>`.
