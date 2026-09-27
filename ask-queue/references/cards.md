# Cards

Every message goes to the user's self-DM, starts with 🤖, and is short enough to read on a phone.
A card is one top-level message; everything about that ask happens in its thread.

Layout: header line (id, state, who, where, link) → the ask (a quote of at most 2 lines) → the body
→ one line saying how to reply.

## Question card (status `asking`)

```
🤖 AQ-13 · Need 2 answers · Priya Shah in PROJ-412 (Export job is slow) · <link>
> Can you look into why the nightly export takes 3h now?
1. Diagnose only, or also ship a fix? _guess: diagnose only (PROJ-412 is labeled "investigation")_
2. Which repo? _guess: data-pipeline (PROJ-412 component)_
Reply *ok* if the guesses are right, or answer by number.
```

## Approve card (status `approving`)

```
🤖 AQ-12 · Ready · Sam Lee in #eng-platform · <link>
> Can you send me the Q3 export numbers before Thursday's review?
I'll draft a Slack reply in Sam's thread:
Hi Sam, here's the Q3 export sheet: https://docs.google.com/… (Q3 tab, final as of Sep 30).
_guess: Finance's live sheet (you answered this for AQ-4 on Sep 12)_
Reply *yes* to create the draft, *skip*, or tell me what to change.
```

For `doc` and `brief` outputs, show a 3–5 line outline instead of the full text and say where the
draft will be created.

## Thread replies

- Revised draft: `🤖 AQ-12 · Revised:` then the new text.
- Drafted: `🤖 AQ-12 · Draft ready in Sam's thread. Review and send it yourself.` (Gmail: "in your
  Gmail drafts"; doc: the doc link; jira-comment and brief: the full copy-ready text).
- Closed: `🤖 AQ-12 · Skipped.` / `🤖 AQ-12 · Marked as not an ask. I'll filter ones like it.`

## Filtered digest (one per sweep, only when something was filtered)

```
🤖 Filtered 3 (not asks for you):
• AQ-14 Dana, #launch: FYI the deploy finished
• AQ-15 Jira bot: PROJ-9 moved to Done
• AQ-16 Lee, email: team offsite photos
Reply in this thread with an id to bring one back.
```

## Promotion offer (from learn.md)

```
🤖 Your last 5 *share-link* drafts went out unedited. Skip the questions for these from now on?
Reply *yes* or *no*. You can undo it anytime by DMing yourself `demote share-link`.
```

## Status (reply to a top-level `status` message)

```
🤖 Queue: 2 need answers (AQ-13, AQ-17) · 1 ready to approve (AQ-12) · 3 drafts waiting for you to send
```

## Alert

```
🤖 ⚠️ Sweep: jira unavailable (401 unauthorized). Other sources still ran.
```
