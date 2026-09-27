# Replies

Runs every 15 minutes. Read what the user wrote in card threads and top-level in their self-DM, act
on it, then learn ([learn.md](learn.md)). Most runs find nothing: then change nothing and end.

## 1. Find new messages

1. `$AQ list --watch`: items whose card threads need checking. Several filtered items can share one
   digest thread: read each thread once.
2. For each thread: `slack_read_thread` with `channel_id` = `card.channelId`, `message_ts` = `card.ts`.
   New user messages are those with `ts` greater than `card.lastSeenTs` and text that does not start
   with 🤖.
3. Promotion offers: for each `openProposals` entry in `$AQ stats`, read its thread (`ts`) the same
   way; any message without 🤖 is the answer.
4. Top-level commands: `slack_read_channel` on `config.slack.selfDmId` with `oldest` = checkpoint
   `replies:selfdm` (no checkpoint: last hour). Consider only top-level messages without 🤖.

## 2. Act on card replies

Read replies generously: users type fast on phones. Treat anything that is not clearly one of the
listed intents as instructions for that item.

| Item status | Reply | Do |
|---|---|---|
| asking | `ok`, `yes`, `👍` | Accept every guess as the answer, draft, post the approve text in the thread, set `approving`. |
| asking | answers (by number or free text; "ok but 2 is X") | Record `questions[].answer`, keep the unanswered guesses, draft, set `approving`. If a new decision appears, ask it and stay `asking`. |
| approving | `yes`, `ok`, `go`, `lgtm`, `👍` | Deliver the draft (section 4), set `drafted`. |
| approving | changes ("shorter", "mention the Q4 dates", "cc Dana") | Revise, post `Revised:` in the thread, stay `approving`. |
| any open | `skip`, `no`, `ignore` | Set `skipped`, confirm in thread, write the ledger entry (learn.md). |
| any open | `fyi`, `not mine`, `not an ask` | Set `filtered`, add a `## Filters` rule to playbooks.md, confirm, write the ledger entry. |
| drafted | `sent`, `done` | Set `done`; reconcile it now (learn.md). |
| drafted | changes | Revise. Gmail: `update_draft` on `draft.ref`. Slack: you cannot edit a Slack draft; post the revised text in the card thread to paste over it. Stay `drafted`. |
| filtered (digest thread) | an id, e.g. `AQ-15` | That item goes back to `new`; prep and card it now (sweep.md steps 5–6). |

Answers teach memory: after recording them, apply learn.md "Memory" to anything reusable ("Q3
numbers live in Finance's sheet").

Promotion thread: `yes` → `$AQ promote <type>` and confirm. Anything else → `$AQ decline <type>` and
confirm (it won't be offered again for a week).

## 3. Act on top-level commands

| Message starts with | Do |
|---|---|
| `ask:` | New item: `source.kind` `manual`, fingerprint `manual:{ts}`, `who` = the user. Prep and card it. |
| `note:` | Add the fact to the right memory file, tagged `(note, <date>)`; reply `🤖 Noted in <file>`. |
| `status` | Post the status summary (cards.md). |
| `promote <type>` / `demote <type>` | `$AQ promote`/`demote`, confirm. |

Any other top-level message is the user's own note: leave it alone.

## 4. Deliver a draft

| `draft.kind` | Deliver | Record |
|---|---|---|
| `slack-reply` | `slack_send_message_draft` with `channel_id` = `source.channelId`, `thread_ts` = `source.threadTs` or `source.ts`, `message` = `draft.text`. On error (usually an existing draft in that channel), post the text in the card thread to paste. | `draft.ref` = returned id or ts, `draft.url` if given |
| `gmail-reply` | Gmail `create_draft` replying on `source.threadId` to the asker only; keep the subject. | `draft.ref` = draft id |
| `doc` | Drive `create_file` as a Google Doc titled `[Draft] <title>`, no parent folder. | `draft.url` = doc link |
| `jira-comment`, `brief` | Post the full copy-ready text in the card thread. | nothing extra |

Then `$AQ update AQ-n --status drafted --file tmp/AQ-n.json` with the draft fields, and post the
"Drafted" line (cards.md). Record `draft.createdAt` (from `$AQ now`) so reconcile knows where to look.

## 5. Finish

1. For each thread that had new messages: set `card.lastSeenTs` to the newest ts in that thread
   (including your own reply) on EVERY item whose card is that thread, via `$AQ update`. Digest
   threads are shared. Threads with nothing new need no update.
2. `$AQ checkpoint set replies:selfdm <newest top-level ts processed>`.
3. Run learn.md for items closed in this run.
