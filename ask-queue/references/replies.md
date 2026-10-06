# Replies

Read what the user wrote in their self-DM (card threads and top level), act on it, then learn
([learn.md](learn.md)). The user writes plain language, never commands: work out what they mean.

## 1. Find new messages

**If the run prompt names an inbox file, use it and skip the rest of this step.** `scripts/gate.mjs`
wrote it just before this run with only the user's unhandled messages: `cards[]` (card threads, with the item
`ids` that share each thread), `proposals[]` (answers to promotion offers), `topLevel[]`, `noteThreads[]` (the user's replies
under their own top-level messages, e.g. "no, that was just a note"), and `notices[]` (news from workers, section 2). A message with `editedTs` was
edited after you last saw it: act on the new text. A message with `truncated` is longer than the
inbox holds: read it in full from Slack before acting.
Don't re-read those threads unless a message refers to something you need to see.

Otherwise (no gate token), find them yourself:

1. `$AQ list --watch`: items whose card threads need checking, including cards closed in the last
   48 hours (a reply on those is a follow-up). Several items can share one digest thread: read each
   thread once.
2. For each thread: `slack_read_thread` (`response_format` `concise`) with `channel_id` =
   `card.channelId`, `message_ts` = `card.ts`. New user messages are those with `ts` greater than
   `card.lastSeenTs`, or edited since then, whose text does not start with 🤖.
3. Promotion offers: for each `openProposals` entry in `$AQ stats`, read its thread (`ts`) the same
   way; any message without 🤖 is the answer.
4. Top level: `slack_read_channel` on `config.slack.selfDmId` with `oldest` = checkpoint
   `replies:selfdm` (no checkpoint: last hour). Consider only top-level messages without 🤖.
5. Note threads: for the user's top-level messages from the last 48 hours that have replies, read
   the thread; new are user messages without 🤖 after checkpoint `note:<parent ts>` (none: all).

Worker notices (no inbox: items in `$AQ list --open` whose `job.notice` is set) need posting too.

No new messages and no notices: change nothing and end.

## 2. Card replies

Read generously: users type fast on phones, and one reply can carry several things ("yes, but say
Friday, and remember Sam is out next week"). Do all of them. The table lists common meanings, not
required words.

| Item status | The user means | Do |
|---|---|---|
| asking | your guesses are fine ("ok", "sure", 👍) | Accept every guess, draft, post the approve text in the thread, set `approving`. |
| asking | answers, by number or not ("2 is the analytics repo") | Record `questions[].answer`, keep the other guesses, draft, set `approving`. If a new decision appears, ask it and stay `asking`. |
| approving | go ahead ("yes", "lgtm", "do it") | Deliver the draft (section 4), set `drafted`. |
| approving | change it ("shorter", "mention the Q4 dates") | Revise, post `Revised:` in the thread, stay `approving`. |
| any open | drop it ("skip", "ignore", "not doing this") | Set `skipped`, confirm in thread, write the ledger entry (learn.md). |
| any open | not theirs ("fyi only", "not mine") | Set `filtered`, add a `## Filters` rule to playbooks.md, confirm, write the ledger entry. |
| drafted | they sent it ("sent", "done") | Set `done`; reconcile it now (learn.md). |
| drafted | change it | Revise. Gmail: `update_draft` on `draft.ref`. Slack drafts can't be edited: post the revised text in the card thread to paste over it. Stay `drafted`. |
| filtered (digest thread) | bring one back ("AQ-15 is mine") | That item goes back to `new`; prep and card it now (sweep.md steps 5–6). |
| done, skipped | more to do ("also attach the Q4 tab", "actually do it") | Reopen: set `approving` with a follow-up draft (or `asking` if you need answers), and say so in the thread. The old draft stays as it was. |
| done, skipped | a thank-you, an aside, nothing to do | Nothing. |
| any | a fact for later ("Sam is out next week") | Memory (learn.md section 3), and confirm in one line. |

Work items (`scoping`, `ready`, `working`, `review`, and done ones that were work) follow
[work.md](work.md) sections 3–4 instead of this table, except for facts to remember.

**Worker notices:** post each as `🤖 AQ-n · <notice>` in its card thread, then clear it with
`{"job": {"notice": null}}` through `$AQ update AQ-n --file`.

Answers teach memory: after recording them, apply learn.md "Memory" to anything reusable ("Q3
numbers live in Finance's sheet").

Promotion thread: a yes → `$AQ promote <type>` and confirm. Anything else → `$AQ decline <type>`
and confirm (it won't be offered again for a week).

## 3. Top-level messages

There are no commands. Decide what each message is for:

| The message is | Example | Do |
|---|---|---|
| about an existing card | "the Sam one: say Friday", "AQ-12 yes" | Handle it as a reply to that card (section 2). Answer in the card's thread. |
| something to do | "draft a reply to Lee's email about the offsite", "pull Q3 churn by region into a doc" | New item: `source.kind` `manual`, fingerprint `manual:{ts}`, `who` = the user. Prep and card it (real work: a scope card, work.md). |
| a fact to remember | "Priya likes bullet points" | Memory, tagged `(note, <date>)`. Reply in its thread: `🤖 Noted in people.md.` |
| a question about the queue | "what's waiting?" | Post the status summary (cards.md). |
| a change to how you work | "stop asking me about share links" | `$AQ promote`/`demote` that type, confirm. |
| a note to self | a shopping list, a bare link | Leave it alone. No reply. |

Unsure between two of these? Pick the more likely one, act, and say so in one line in that
message's thread (`🤖 Took this as a new ask (AQ-21). Say so if it was just a note.`). Never stay
silent about something that might have been meant for you.

A reply in one of those threads (`noteThreads`) corrects or adds to what you did with that message:
undo or redo it ("that was just a note" → set the new item `filtered`; "forget that" → remove the
memory fact).

## 4. Deliver a draft

| `draft.kind` | Deliver | Record |
|---|---|---|
| `slack-reply` | `slack_send_message_draft` with `channel_id` = `source.channelId`, `thread_ts` = `source.threadTs` or `source.ts`, `message` = `draft.text`. On `draft_already_exists` (the user has a draft in that channel; it is never overwritten) or any error, post the text in the card thread to paste. | `draft.ref` = returned id or ts, `draft.url` if given |
| `gmail-reply` | Gmail `create_draft` replying on `source.threadId` to the asker only; keep the subject. | `draft.ref` = draft id |
| `doc` | Drive `create_file` as a Google Doc titled `[Draft] <title>`, no parent folder. | `draft.url` = doc link |
| `jira-comment`, `brief` | Post the full copy-ready text in the card thread. | nothing extra |

Then `$AQ update AQ-n --status drafted --file tmp/AQ-n.json` with the draft fields, and post the
"Drafted" line (cards.md). Record `draft.createdAt` (from `$AQ now`) so reconcile knows where to look.

## 5. Finish

1. For every card thread in the inbox (or that you read and found new messages in), even when
   there was nothing to do: `$AQ seen <card.channelId> <card.ts> <ts>`, where `<ts>` is the
   newest **user** message you acted on in that thread (for an edited message, its edit time,
   `editedTs` in the inbox). Never use the ts of your own reply: a message the user sent while you were working is older than your reply
   and would be skipped. `seen` updates every item sharing the thread and never moves backwards.
2. `$AQ checkpoint set replies:selfdm <newest top-level ts you handled>` (for an edited message, its
   `editedTs` when that is newer).
3. For each note thread: `$AQ checkpoint set note:<parentTs> <newest user ts you handled in it>`.
4. Run learn.md for items closed in this run.
