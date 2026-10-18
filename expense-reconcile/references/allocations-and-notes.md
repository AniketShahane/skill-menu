# Exact allocations and app-specific notes

These examples are generic, not account records. Splitwise uses a full per-person breakdown; Monarch keeps a tiny ownership/status note. A receipt attachment supports the Splitwise breakdown rather than replacing it. Do not rewrite unrelated completed notes merely to apply this format.

## Splitwise: complete per-person note

Use plain text, line breaks and indentation in the expense Notes/details field:

```text
SPLIT BREAKDOWN
---------------

Alex: $31.64
  Items ($25.00):
    • Mocktail: $12.00
    • Pizza: $10.00 (1/3 share of $30.00)
    • Dessert: $3.00 (1/3 share of $9.00)
  + Tax: $2.04
  + Tip: $4.60

Jo: $37.64
  Items ($31.00):
    • Cocktail: $18.00
    • Pizza: $10.00 (1/3 share of $30.00)
    • Dessert: $3.00 (1/3 share of $9.00)
  + Tax: $2.04
  + Tip: $4.60

Sam: $19.64
  Items ($13.00):
    • Pizza: $10.00 (1/3 share of $30.00)
    • Dessert: $3.00 (1/3 share of $9.00)
  + Tax: $2.04
  + Tip: $4.60

Paid by: Alex
```

This example assumes the confirmed rule is to share food, tax and tip equally, with drinks owned individually. Items total $69.00, tax $6.12 and included tip $13.80; participant totals sum to $88.92. Use the actual confirmed rule for each expense; the format does not impose equal or proportional allocation.

Repeat the full block for every participant, including the payer and any zero-share participant. For shared items show the exact allocated amount, actual share fraction/weight and full item price; solo items need no share annotation. Add `+ Service charge`, `- Discount`, `- Credit` or `- Refund` only when applicable. If necessary, add a signed rounding-adjustment line to reconcile item/adjustment lines to accepted saved totals, with a short explanation of the remainder cents. Preserve accepted totals; do not change the financial split to fit the note. For multiple payers, list their exact paid contributions at the end.

For combined receipts, label the source of each item where needed to distinguish purchases. If the Splitwise expense covers only part of a bank purchase, itemize only that expense's included portion. If only a verified aggregate is available, label it as such and state that itemization is unavailable; do not fabricate a receipt. Omit zero/irrelevant adjustment lines and search/save narration. Useful source links or actionable exceptions may follow the breakdown.

## Monarch: tiny notes

Normally use 3-5 short lines and at most about 50 words. One line is enough for a simple personal purchase. Read the saved app fields, receipt and linked Splitwise breakdown together with the Monarch note. The examples below are Monarch notes unless stated otherwise.

## Personal purchase

Personal: tennis backpack.

Omit the merchant, date, amount, category and card if already visible. Add an order link only when useful for later matching or a return.

## Shared purchase, waiting to post

Plunger: me $2.66; Priya $2.66.
Pending - split after posting; keep unreviewed.
Splitwise: [expense link]

The link is also the stable duplicate key. Do not repeat it as a separate expense ID. If no Splitwise expense exists, replace the link line with "Splitwise not added: [reason/trigger]" and retain the exact shares.

## Expense paid by someone else

Dinner paid by Priya; my share $32.71.
Includes tip.
Splitwise: [expense link]

The manual account and spending category are already saved fields. Do not repeat the full bill, the payer's other share, bank card, receipt URL, import explanation or future-settlement policy in the note.

## Refund or explicit deferral

Personal air mattress; return not completed.
Keep unreviewed until return/refund decision.
Order: [link]

Or, for verified progress: "Refund promised $80; bank credit not seen through [date]." Preserve the relevant search cutoff when the absence of a credit matters, not a search diary.

## Conditional split

Movie tickets: Alex $21; Priya $21; Sam $21; me $0.
Attendance unconfirmed; Splitwise deferred.
Order: [link]

## Mixed ownership or combined expenses

Keep a short ownership summary in the Monarch note; keep the complete per-person breakdown in Splitwise Notes/details for the included expense. Include an extra line only for an exception affecting the saved amounts.

Example: A $61.40 purchase contains a personal $29 tumbler and $32.40 shared tea. The user's share is $45.20 and the friend's is $16.20. If Splitwise records only tea, leave its total $32.40; do not add the tumbler. A sufficient note is "Tumbler mine; tea shared. Me $45.20; Priya $16.20. Splitwise: [link]".

## Exact math stays exact

Use integer cents. Item allocations, expense shares and the user's personal/Friends totals must agree with the bank charge and accepted Splitwise record. Preserve saved rounding. For an odd-cent equal split, keep the accepted $26.63/$26.62 shares; explain the remainder cents in the Splitwise breakdown when needed to reconcile its item lines and saved totals; keep the Monarch note short. Do not invent offsetting item/tax allocations just to narrate an even total.

Include tax/tip/fees/discounts once. Distinguish rewards redeemed from rewards earned. For split tenders or delayed payments, retain how the receipt total becomes this bank charge in supporting evidence. A $6.01 delayed payment on an already recorded $53.17 ride is not a new ride or new Splitwise expense. Mention this exception briefly and link the original source.

## Before saving

Splitwise: check that every participant has a complete block, all item and adjustment lines sum to that person's saved total, all participant totals sum to the expense, and payer contributions, receipt and useful source links are correct. Do not shorten the breakdown using the Monarch limit.

Monarch: remove facts already visible in app fields, verification narration, repeated status, irrelevant unknowns and normal-policy boilerplate. Preserve ownership, pending actions or explicit deferrals, and the right source link.
