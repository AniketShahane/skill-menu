# Cards

Every message goes to the user's self-DM, starts with 🤖, and is easy to read on a phone. A card is
one top-level message; everything about that ask happens in its thread. Each card and its thread
replies are posted by that card's own session ([card-session.md](card-session.md)); the filtered
digest and promotion offers by the sweep.

## Formatting rules

`slack_send_message` reads **standard markdown** and converts it for Slack:

- Bold is `**word**`. Never `*word*`: it shows as italics. Italics is `_word_`.
- No `#` headers, no tables, no `---`. Use a bold label line instead of a header.
- Links always sit behind words: `[Sam Lee · DM](<url>)`. Never paste a raw URL.
- A `>` quote holds only what someone else wrote (the ask, or the draft to send). Your own notes,
  plans and guesses are never quoted.
- One idea per line. Put a blank line between parts and between numbered questions.
- **After a `>` quote**, Slack drops the blank line and glues the next line to the quote. Always
  follow a quote with a blank line, then a line holding only `⠀` (U+2800, an invisible character),
  as in the layouts below. Not needed when the quote is the last thing in the message.
- Each guess goes on its own line under its question: `→ _My guess: …_`. Keep it to one line.
- Keep `🤖` as the very first character. Scripts use it to tell your posts from the user's.
- End every card with a divider line of exactly 16 `━` (longer wraps on a phone).

## Card layout

```
🤖 <dot> **AQ-n · <what the user needs to do>**
from [<who> · <where>](<link to the ask>)

💬 **<First name> asked**
> <the ask, at most 2 lines>

⠀
<body: labeled parts, see below>

👉 <one line saying how to reply>
🧠 _<Model> · say opus, sonnet or haiku to switch_
━━━━━━━━━━━━━━━━
```

The 🧠 line names the model this run uses (the prompt says which). Cards only, not thread replies.

The dot says what the user needs to do, so they can scan the DM:

| Dot | Status | Title text |
|---|---|---|
| 🟡 | `asking` | `N questions for you` |
| 🟢 | `approving` | `Reply ready to approve` (or `Doc ready to approve`, …) |
| 🔵 | `scoping` | `New work: N questions first` (no questions: `New work: ready when you are`) |
| 🟣 | `working` | `Working on it` |
| 🟠 | `review` | `Done, please review` |
| ✅ | `drafted`, `done` | `Draft saved` / `Done` |
| ⏭️ | `skipped`, `filtered` | `Skipped` |

## Question card (status `asking`)

```
🤖 🟡 **AQ-13 · 2 questions for you**
from [Priya Shah · PROJ-412](https://…)

💬 **Priya asked**
> Can you look into why the nightly export takes 3h now?

⠀
**1. Diagnose only, or also ship a fix?**
→ _My guess: diagnose only. PROJ-412 is labeled "investigation"._

**2. Which repo?**
→ _My guess: data-pipeline (the PROJ-412 component)._

👉 Reply **ok** to take my guesses, or answer by number: `2: analytics`
🧠 _Sonnet · say opus, sonnet or haiku to switch_
━━━━━━━━━━━━━━━━
```

## Approve card (status `approving`)

```
🤖 🟢 **AQ-12 · Reply ready to approve**
from [Sam Lee · #eng-platform](https://…)

💬 **Sam asked**
> Can you send me the Q3 export numbers before Thursday's review?

⠀
✏️ **My reply, in Sam's thread**
> Hi Sam, here's the Q3 export sheet: https://docs.google.com/… (Q3 tab, final as of Sep 30).

⠀
ℹ️ _Used Finance's live sheet, like your answer for AQ-4 on Sep 12._

👉 Reply **yes** to save it as a draft, or tell me what to change.
🧠 _Sonnet · say opus, sonnet or haiku to switch_
━━━━━━━━━━━━━━━━
```

Something the user must do first (that you can't): a `⚠️ **Before you send:** …` line instead of
the `ℹ️` line.

## Scope card (status `scoping`, work.md)

```
🤖 🔵 **AQ-21 · New work: 2 questions first**
from [Lee Park · #data](https://…)

💬 **Lee asked**
> Can you pull Q3 churn by region and write it up for Monday?

⠀
📦 **The plan**
• **You get:** a private Google Doc: churn by region (Jul to Sep), 3-line summary, method note
• **Uses:** the churn dashboard, Lee's Sep 30 thread, last quarter's write-up (AQ-9)
• **Where:** a folder on this machine
• **Time:** about 30 min

❓ **Questions**
**1. Q3 = Jul to Sep calendar?**
→ _My guess: yes (fiscal year = calendar, projects.md)._

**2. Split EMEA by country?**
→ _My guess: no, Lee asked by region._

👉 Answer by number, change anything, or say **go**.
🧠 _Sonnet · say opus, sonnet or haiku to switch (the work itself runs on Opus unless you pick)_
━━━━━━━━━━━━━━━━
```

For `brief` outputs, show a 3 to 5 line outline under `📦 **The plan**` instead of the full text and
say where the draft will be created.

## Thread replies

Short, one line where possible: `🤖 <icon> **AQ-n · <what happened>**` then the detail.

- Revised draft: `🤖 ✏️ **AQ-12 · Revised**`, a blank line, then the new text as a `>` quote.
- Drafted: `🤖 ✅ **AQ-12 · Draft saved** in Sam's thread. Review and send it yourself.` (Gmail: "in
  your Gmail drafts"; doc: the doc link; jira-comment and brief: the full copy-ready text below,
  as a `>` quote).
- Closed: `🤖 ⏭️ **AQ-12 · Skipped.**` / `🤖 ⏭️ **AQ-12 · Not an ask.** I'll filter ones like it.`
- Reopened: `🤖 🟡 **AQ-12 · Reopened**`, then the new draft or questions in card layout.
- Updated plan: `🤖 🔵 **AQ-21 · Updated plan**`, then the changed `📦` part only.
- Work: `🤖 🟣 **AQ-21 · Starting.**` / `🤖 🟣 **AQ-21 · Queued** (2nd in line, 5 running).` / the work
  run's own `Started:` and result messages / `🤖 ℹ️ **AQ-21 ·** <notice>` for session notices
  (work.md).

## Filtered digest (one per sweep, only when something was filtered)

```
🤖 🧹 **Filtered 3** (not asks for you)

• **AQ-14** Dana, #launch: FYI the deploy finished
• **AQ-15** Jira bot: PROJ-9 moved to Done
• **AQ-16** Lee, email: team offsite photos

👉 Reply here with an id to bring one back.
━━━━━━━━━━━━━━━━
```

## Promotion offer (from learn.md)

```
🤖 💡 **Ask less for share-link drafts?**

Your last 5 went out unedited. I can skip the questions for these from now on.

👉 Reply **yes** or **no**. You can undo it anytime: just tell me to ask first again.
━━━━━━━━━━━━━━━━
```

## Status (when the user asks what's waiting)

```
🤖 📋 **Queue**

🟡 **Need answers:** AQ-13, AQ-17
🟢 **Ready to approve:** AQ-12
✅ **Drafts to send:** 3

🔵 **Scoping:** AQ-25
🟣 **Working:** AQ-21, AQ-23 · queued: AQ-24
🟠 **To review:** AQ-19
━━━━━━━━━━━━━━━━
```

Leave out lines with nothing in them.

## Alert

```
🤖 ⚠️ **Sweep: jira unavailable** (401 unauthorized). Other sources still ran.
```
