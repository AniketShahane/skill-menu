# Replies

Card threads are not handled here: each card's own session handles its replies
([card-session.md](card-session.md)), and `scripts/gate.mjs` passes them on without starting Claude.
This run handles what belongs to no single card: top-level messages in the self-DM, replies under
them, the shared filtered digest, promotion offers, and session notices. Then learn
([learn.md](learn.md)). The user writes plain language, never commands: work out what they mean.

## 1. Find new messages

**If the run prompt names an inbox file, use it and skip the rest of this step.** `scripts/gate.mjs`
wrote it just before this run with only the user's unhandled messages: `cards[]` (only shared
digest threads, with the item `ids` in each), `proposals[]` (answers to promotion offers),
`topLevel[]`, `noteThreads[]` (the user's replies under their own top-level messages, e.g. "no,
that was just a note"), and `notices[]` (news from card sessions). A message with `editedTs` was
edited after you last saw it: act on the new text. A message with `truncated` is longer than the
inbox holds: read it in full from Slack before acting. Don't re-read those threads unless a message
refers to something you need to see.

Otherwise (no gate token), find them yourself:

1. `$AQ list --watch`: items whose card threads need checking, including cards closed in the last
   48 hours. Several filtered items share one digest thread: read each thread once.
2. For each thread: `slack_read_thread` (`response_format` `concise`) with `channel_id` =
   `card.channelId`, `message_ts` = `card.ts`. New user messages are those with `ts` greater than
   `card.lastSeenTs`, or edited since then, whose text does not start with 🤖.
   **A thread with one item that is not `filtered` is that card's: don't handle it.** Pass it on:
   write `{"messages": [{"ts": …, "text": …, "editedTs": …}], "seenTs": <newest ts or editedTs>}`
   to `tmp/route-AQ-n.json` and run `$AQ route AQ-n --file tmp/route-AQ-n.json`. Its session runs
   within about 2 minutes.
3. Promotion offers: for each `openProposals` entry in `$AQ stats`, read its thread (`ts`) the same
   way; any message without 🤖 is the answer.
4. Top level: `slack_read_channel` on `config.slack.selfDmId` with `oldest` = checkpoint
   `replies:selfdm` (no checkpoint: last hour). Consider only top-level messages without 🤖.
5. Note threads: for the user's top-level messages from the last 48 hours that have replies, read
   the thread; new are user messages without 🤖 after checkpoint `note:<parent ts>` (none: all).

Session notices (no inbox: items in `$AQ list --open` whose `job.notice` is set) need posting too.

No new messages and no notices: change nothing and end.

## 2. Digest threads, promotion offers, notices

Digest thread (filtered items): bring one back ("AQ-15 is mine") → set that item `new`. Its own
card session preps it and posts a fresh card. Confirm in the digest thread.

Promotion thread: a yes → `$AQ promote <type>` and confirm. Anything else → `$AQ decline <type>`
and confirm (it won't be offered again for a week).

**Session notices:** post each as `🤖 ℹ️ **AQ-n ·** <notice>` in its card thread (top-level when the item
has no card), then clear it with `{"job": {"notice": null}}` through `$AQ update AQ-n --file`.

## 3. Top-level messages

There are no commands. Decide what each message is for:

| The message is | Example | Do |
|---|---|---|
| about an existing card | "the Sam one: say Friday", "AQ-12 yes" | Pass it to that card's session: `$AQ route AQ-n --file` (no `seenTs`). Reply in this message's thread: `🤖 Passed to AQ-12.` |
| something to do | "draft a reply to Lee's email about the offsite", "pull Q3 churn by region into a doc" | New item (`$AQ add`, status `new`): `source.kind` `manual`, fingerprint `manual:{ts}`, `who` = the user. Its card session preps it and posts the card. Reply: `🤖 Took this as a new ask (AQ-21).` |
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

## 4. Finish

1. For every digest thread you handled (routed card threads were marked by `route`):
   `$AQ seen <card.channelId> <card.ts> <ts>`, where `<ts>` is the newest **user** message you acted
   on in that thread (for an edited message, its edit time, `editedTs` in the inbox). Never use the
   ts of your own reply: a message the user sent while you were working is older than your reply
   and would be skipped. `seen` updates every item sharing the thread and never moves backwards.
2. `$AQ checkpoint set replies:selfdm <newest top-level ts you handled>` (for an edited message, its
   `editedTs` when that is newer).
3. For each note thread: `$AQ checkpoint set note:<parentTs> <newest user ts you handled in it>`.
4. Run learn.md for items you closed in this run (card sessions do their own).
