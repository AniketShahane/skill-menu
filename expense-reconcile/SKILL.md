---
name: expense-reconcile
description: Reconcile Monarch Money transactions with merchant or Gmail receipts and Splitwise expenses; identify purchases, prevent duplicates, calculate item allocations, attach readable receipt notes, and verify authorized splits and reviews.
---

# Expense reconciliation

Turn bank charges into an inspectable purchase table, let the user assign ownership, and finish authorized updates in Splitwise and Monarch. Support lookup-only, proposed splits, existing-expense completion, refund investigation, and explicitly requested bulk reviews. Read [allocation and note examples](references/allocations-and-notes.md) when calculating shares or writing receipts. Read [execution and recovery](references/execution-and-recovery.md) for batches, delegated work, interruptions, and final verification.

## Establish the current scope

Use the user's latest direction and permissions from the current conversation. Identify date range, merchants, accounts, review-only versus all transactions, and requested changes. Interpret before a cutoff strictly; include the cutoff only if requested. Do not silently reuse the July-onward range or today's participants in a future run.

A skill invocation is not blanket authorization to modify accounts or contact support. A lookup authorizes read-only investigation; a request to complete a user-created expense authorizes its receipts, notes, and specified Monarch updates. Continue within permissions already given without repeatedly asking. Ask only for missing ownership, unresolved matching, or an action outside that scope. Ask before visiting a merchant website unless the user has requested that merchant lookup. Stop an expense task when the user says they handled it.

Verify which account and browser session are accessible. Use connectors or APIs where available; use the user's signed-in browser for missing capabilities. Keep actions in the visible requested tab when supported; say if control uses another tab. Do not imply that account login, skill portability, and browser-session availability are the same thing.

## Build a source-backed inventory

Read current Monarch state, not earlier summaries. For each source charge record bank date, amount/currency, original descriptor, account identifier sufficient to distinguish it, pending/posted status, review status, existing split rows, and notes. A date-group heading is not one purchase; reconstruct original amounts from split portions rather than counting portions twice.

Match merchant orders and Gmail receipts by evidence: exact charged amount, bank/card payment details, order or ride identifier, dates, items, and payment breakdown. Label matches verified, probable, or unresolved and explain discrepancies. Same amount alone is insufficient. Separate bank posting, order, service, and payment dates. Check nearby dates, shipments, installments, rewards, discounts, tips, gift cards, split tenders, and partial payments before calling a charge unmatched.

For groceries and food, show item bullets with quantities and prices when available. For rides, show pickup, destination, ride date, total ride cost, and the specific bank payment. For rental tolls, group only verified charges by rental period/agreement and separate tolls, service/convenience fees, congestion charges, and direct authority payments. Date overlap alone establishes a candidate rental, not a verified vehicle or crossing.

Present concise tables with bank date, merchant/order or route, bank amount, receipt amount, item list, match confidence, and existing Splitwise status. Include useful source links. Never invent items or turn an unidentified merchant into a confident business identity.

## Prevent duplicates before creating or finishing expenses

Inspect Splitwise individual, group, and combined expenses. Search when available; otherwise page or scroll the relevant period and describe coverage. Compare payer, currency, participants, amounts, dates, item descriptions, and attachments. Do not conclude absent from a truncated view. An order may be recorded inside a larger expense or under a generic name; inspect plausible candidates.

When the user says they added an expense, locate that existing entry and read its saved shares. Do not create another. Preserve accepted combined expenses, saved dates, and rounding, even if the suggested item-by-item split differed by a cent. If payer/participants or meaningful amounts conflict, resolve before changing financial fields. A delayed partial bank payment for an already recorded ride must not become a new expense.

If Splitwise blocks creation with a daily limit, give the user exact totals, payer, participants, and shares to enter manually. Resume receipts and notes after their confirmation. Do not buy Pro, fabricate a save, or repeatedly attempt blocked creation.

## Allocate exact cents

Use integer cents or decimal arithmetic. Follow explicit item ownership and sharing; do not assume all food or all trip participants shared every item. Resolve ambiguous names against actual saved contacts, not phonetic guesses. Ask for missing fee/tax/tip/discount allocation; reuse a clearly established rule only within its applicable batch.

Require allocations to sum to each item and expense total. Allocate remainder cents consistently and show who received them. Preserve the user's accepted saved Splitwise totals. If a combined saved split differs from the proposed item breakdown, reconcile the per-item breakdown to those totals or show a separate rounding adjustment; never silently change the ledger to fit a draft.

## Record ownership in Monarch notes

Whenever creating or updating a reconciliation note, establish who owns or shares that exact charge. Reuse participants and allocations already confirmed for this transaction or read from its saved Splitwise entry; otherwise ask the user directly, identifying the merchant, date, and amount. Ask who shared it, whether the user is included, and the split rule or exact amounts. For refunds, cancellations, or uncertain attendance, ask whose original purchase it was and whether reimbursement is conditional. Do not infer participants from another expense or from the trip group. If ownership cannot yet be identified, record it as unknown and state the question still needed.

Make the note sufficient to reconstruct the later Splitwise entry: purchase/service date and source identifier or receipt link; total and currency; payer; exact participant names (resolved against saved contacts where available); each person's amount, including the user's zero share when applicable; own/Friends totals; and any item ownership, tax, fees, discounts, refunds, or rounding that determines those shares. For a personal-only expense, explicitly say that the user is the sole owner and there is no shared allocation. Label proposed shares separately from confirmed shares; do not invent amounts when the split rule is unresolved.

Record the Splitwise state explicitly: saved (with verified expense link/ID and receipt status), not yet created, or deferred by the user. For a deferred expense, include the reason and the event or information needed before adding it. A participant answer does not override an earlier instruction to defer Splitwise; keep the allocation in Monarch until creation is authorized. Preserve useful existing notes and do not rewrite completed historical entries merely to apply this format.

## Keep notes concise and complete in both apps

Monarch and Splitwise notes must be easy to scan: short labeled lines or small sections, with one item or participant per line. Use the fewest words that preserve every fact needed to understand the charge and reconstruct the split: purchase/date/source, total and payer, exact names and shares, own/Friends totals, material tax/fee/credit/rounding treatment, refund or review status, Splitwise state, and the necessary next step. Include applicable fields only; avoid dense paragraphs, repeated facts, search logs, boilerplate, and repeated dated updates. Put the current status first and distinguish confirmed facts from conditional allocations or unresolved matches.

When revising a note within the authorized scope, consolidate superseded text into one current account while retaining useful source identifiers, links, material uncertainty, and follow-up details. Do not discard evidence or rewrite unrelated completed notes just to enforce formatting. Use the same readable allocation detail in both apps without implying that a draft note is a saved Splitwise expense. See the compact examples in [allocations and readable notes](references/allocations-and-notes.md).

## Finish the authorized accounts

Splitwise: prefer the actual receipt or a clearly labeled copy of verified merchant/email details. When no receipt is available, the user authorizes a cropped screenshot from Monarch as a standing fallback within the authorized expense workflow. Include only the card/details for that particular transaction; exclude other transactions, balances, sidebar/account history, and unrelated notes. Keep the merchant, date, amount, and relevant account identifier readable where shown. Label it a Monarch transaction screenshot, not an itemized merchant receipt; it proves the bank charge, not the purchased items or toll/fee breakdown. Prefer this screenshot over constructing a bank-charge summary when Monarch is accessible. For combined expenses assemble the relevant receipts into one readable document where useful. Add readable sections showing each item/charge, total, sharers, each person's share, fees/tax/credits, rounding, and participant totals. Leave completed historical notes unchanged unless requested.

Monarch: retain the user's own appropriate category and allocate others' aggregate amount to the existing Friends category. For a pending charge or disabled split control, record the shares and completed Splitwise status in a note; do not imply an actual split exists. For a posted charge, apply the actual split when authorized. If one combined Splitwise expense maps to multiple bank charges, distribute its accepted totals across source charges with consistent rounding; verify both per-charge and participant totals. Preserve existing notes when adding facts.

Mark the resulting portions reviewed only when requested or included in the authorized completion workflow. Notes do not themselves change review status. Pending and reviewed are separate states. For explicitly requested bulk reviews, first verify exact filtered date scope and count, then review only that scope and reload both the filtered result and excluded cutoff/later rows.

## Refunds and support

Search all relevant history, including reviewed credits and dates after purchase. Check original descriptors, merchant aliases, partial and cumulative refunds, order identifiers, and refund emails. Reconcile net amounts; distinguish planned return, merchant refund promise, and posted bank credit. An unrelated equal-sized credit is not proof. State the search coverage when no refund was found.

For a canceled rental, separate prepaid booking charge from cancellation or no-show fee. User recollection is not a recorded cancellation timestamp. Check booking status, cancellation policy, email timeline, and actual refund record before explaining retained payment.

Contact support only when explicitly authorized. Verify a monitored official channel and avoid unmonitored booking senders. Ask for case reference, cancellation/payment explanation, itemization, and eligible refund. Do not accept fees, partial settlements, or start a dispute without authorization. Schedule follow-up only when requested, using supported automation tools; inspect existing monitors to prevent duplicates. Respect promised response deadlines and notify on meaningful changes rather than unchanged daily status.

## Verify and report

After every save, reload and verify the actual persisted shares, payer, attachment, note, source amount, categories, split sums, and review status applicable to the action. Splitwise editing can recalculate a rounding cent; restore accepted shares using normal supported input and verify again. An upload click, draft, optimistic toast, or attempted split is not completion.

Report verified outcomes concisely: receipt/note saved, exact own/Friends amounts, reviewed or still pending, duplicate excluded, and unresolved issue. Keep a per-source completion ledger during long work. Never say an entire merchant is done when only a subset is verified. Clearly separate lookup results, proposed changes, saved changes, and remaining blockers.
