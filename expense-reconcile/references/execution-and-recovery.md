# Execution and recovery

## What made the workflow fast

Inventory and match a whole merchant/date batch once, rather than switching sites for every row. Present exact numbers visually so the user can approve several allocations at once. Use Gmail for item receipts, ride routes, cancellation notices and refund messages when merchant history is inaccessible. Keep separate source-charge and saved-expense identities so combined expenses and split tenders don't become duplicates.

When delegation is requested or permitted, give each merchant investigation an independent read-only agent. Once ownership is confirmed, give a completion agent the full source facts, existing expense identity, saved shares, allowed mutations and verification checklist. Serialize writers touching the same account, expense or browser; independent readers can run concurrently when sessions permit it. Don't flood the user's visible tab with competing agents.

A handoff must resolve every conversational reference. Include dates, exact source amounts, participant names, payer, item ownership, fee rule, saved rounding, pending/posted rule, duplicate-search coverage, evidence links, and outstanding work. Exclude unrelated account history and sensitive identifiers. Root remains accountable for terminal verification, not just dispatch.

## Resume without duplicating

Maintain a small work ledger with source key, evidence, proposed allocation, existing Splitwise expense, receipt/note verified, Monarch split/note verified, review verified, blocker and next action. If the environment supports persistent files and the user wants continuity, save it in that task's authorized location; do not embed live account state in this reusable skill.

After interruption or browser failure, inspect saved state before retrying any external mutation. In this workflow resumed executors sometimes lost browser access; a fresh executor could recover a signed-in session. Treat this as a troubleshooting observation, not a reason to spawn agents automatically or an assurance that all environments share cookies. Never launch another browser profile or paid browser without authorization. Login and CAPTCHA steps stay user-controlled.

Stop after a failed save long enough to verify whether it persisted. Retry only unresolved steps. If tools are unavailable, report the exact unfinished step and give a concise user handoff. Do not claim a separate tab is the one the user watches.

## Receipt verification

Prefer the original attachment/download. If no receipt is available, capture a Monarch screenshot cropped to only the relevant transaction card/details, inspect the crop for readable merchant/date/amount and unrelated information, and attach it under the user's standing fallback authorization. Identify the source as a Monarch transaction screenshot and retain any missing itemization as unresolved. If constructing a copy instead, retain only verified purchase facts and label the provenance. Render PDF pages and inspect them when layout matters. Confirm upload persisted after reload; for fragile uploads, inspect the actual attached file as well. References to a source link are useful but are not equivalent to a saved receipt attachment.

## Completion criteria

A row is complete only for the actions requested: exact match established or uncertainty recorded; duplicate outcome documented; accepted financial shares persisted; required receipt and readable note present; pending note or posted split verified; each resulting review flag verified. Report remaining ambiguous and personal-only rows explicitly rather than declaring the entire merchant complete.
