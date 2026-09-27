# Learn

How the queue gets better: every closed ask goes into the ledger (the record of asks and artifacts
over time), reusable facts go into memory, and ask types the user keeps approving unedited get
promoted so they skip questions.

## 1. Reconcile drafts (sweep only)

For each `drafted` item (`$AQ list --status drafted`), find what the user actually sent after
`draft.createdAt`:

| kind | Where to look |
|---|---|
| `slack-reply` | `slack_read_thread` on the source thread: the user's first message after the draft |
| `gmail-reply` | `search_threads` `in:sent` on the source thread, then `get_thread` |
| `jira-comment` | `getJiraIssue`: the user's comments after the draft |
| `doc`, `brief` | nothing to find; they close when the user replies `done` |

- Found: `final` = the sent text. `edited` = true when the meaning, facts, structure or tone changed.
  Whitespace, punctuation and a typo fix are not edits. Set `done`.
- Not found and the draft is over 3 days old: set `done` with outcome `unknown`.
- Otherwise leave it `drafted` and check again next sweep.

## 2. Ledger entry (every item that reaches `done` or `skipped`, or that the user marks `fyi`)

Items the sweep filtered on its own get no entry: only the user's decisions teach.

Write to `tmp/ledger-AQ-n.json`, then `$AQ ledger add --file tmp/ledger-AQ-n.json`:

```json
{
  "id": "AQ-12", "askType": "share-link", "who": "Sam Lee", "source": "slack",
  "ask": "Q3 export numbers before Thursday's review",
  "questions": [{ "q": "Which sheet?", "answer": "Finance's live sheet" }],
  "guessesRight": true,
  "draftKind": "slack-reply", "draft": "Hi Sam, here's…", "final": "Hi Sam, here's…",
  "edited": false, "editSummary": "",
  "outcome": "sent",
  "artifacts": [{ "kind": "slack-draft", "url": "https://…" }],
  "lessons": ["Q3 numbers → Finance's live sheet"]
}
```

`outcome` is `sent`, `skipped`, `filtered` or `unknown`. `editSummary` says in one line what the user
changed ("cut the greeting, added the Q4 date"). Keep `draft`/`final` under ~1,500 characters each.
Never record secrets, passwords or tokens.

## 3. Memory (after each ledger entry)

Update the file where the fact will be looked up next time. Edit in place; never append a second
entry for the same person, project or rule. Tag each fact with its origin: `(AQ-12, 2026-09-28)`.

| Learned from | Goes to |
|---|---|
| An answer that locates something ("it's in Finance's sheet") | projects.md |
| Who someone is, what they ask for, how they like replies | people.md |
| The user's edits (`editSummary`), repeated across 2 or more items | style.md, as a concrete rule |
| How an ask type was handled, and what made the draft land unedited | playbooks.md, under `## <askType>` |
| `fyi` / `not mine` replies | playbooks.md `## Filters`, as a pattern ("Jira bot status changes") |

Keep each file under about 200 lines: merge, generalize, and drop facts that turned out wrong or
stale. Don't store sensitive personal details (health, compensation, performance) about anyone.

## 4. Autonomy ladder (end of sweep)

`$AQ stats`:

- `promotable: true` (the last 5 closed asks of that type were sent unedited): post the promotion
  offer (cards.md) as a top-level message, then `$AQ propose <type> --ts <message ts>`. At most one
  offer per sweep.
- `demoteSuggested: true` (a promoted type's last two drafts were both edited): `$AQ demote <type>`
  and tell the user in one line (`🤖 Went back to asking first for *share-link*: your last two edits
  suggest I'm missing something.`).

Promotion only removes the question step for that type. Drafts are still drafts; the user still sends.
