# Execution and recovery

## What made the workflow fast

Inventory and match a whole merchant/date batch once, rather than switching sites for every row. Present exact numbers visually so the user can approve several allocations at once. Start with the actual merchant website and its order/receipt/payment history. Use Gmail for item receipts, ride routes, cancellation notices and refund messages only as a fallback when merchant evidence is missing or inaccessible. Ask the user to identify a charge only after both sources fail. Once ownership, payer and allocation are confirmed, complete authorized saves and reload verification before reporting exact results; do not add another approval round for the same confirmed facts. Keep separate source-charge and saved-expense identities so combined expenses and split tenders don't become duplicates.

When delegation is requested or permitted, give each merchant investigation an independent read-only agent. Once ownership is confirmed, give a completion agent the full source facts, existing expense identity, saved shares, allowed mutations and verification checklist. Serialize writers touching the same account, expense or browser; independent readers can run concurrently when sessions permit it. Don't flood the user's visible tab with competing agents.

A handoff must resolve every conversational reference. Include dates, exact source amounts, participant names, payer, item ownership, fee rule, saved rounding, pending/posted rule, duplicate-search coverage, evidence links, and outstanding work. Exclude unrelated account history and sensitive identifiers. Root remains accountable for terminal verification, not just dispatch.

## Resume without duplicating

Begin a reconciliation run by revisiting in-scope charges previously deferred because they were pending. Verify posting and final amount, match any replacement transaction ID, complete confirmed outstanding personal/Friends splits, and surface category/review decisions. Preserve unresolved refunds or other explicit deferrals; do not mark a charge reviewed merely because it posted. Reuse and verify the existing Splitwise entry. Record the current posting, split and review states separately in the completion ledger.

Maintain a small work ledger with source key, evidence, proposed allocation, existing Splitwise expense, receipt/note verified, Monarch split/note verified, review verified, blocker and next action. If the environment supports persistent files and the user wants continuity, save it in that task's authorized location; do not embed live account state in this reusable skill.

After interruption or browser failure, restore the visible Codex in-app tab: reuse it if present, or reopen the known URL in the in-app browser if missing. Show the current page and verify the actual account and saved state before retrying any external mutation. If in-app control remains unavailable, report the blocker; do not switch to another browser, hidden session, connector, or API. In this workflow resumed executors sometimes lost browser access; a fresh executor could recover a signed-in session. Treat this as a troubleshooting observation, not a reason to spawn agents automatically or an assurance that all environments share cookies. Keep recovery within the in-app browser; another browser profile or paid browser is not a fallback for this workflow. Login and CAPTCHA steps stay user-controlled.

Stop after a failed save long enough to verify whether it persisted. Retry only unresolved steps. If tools are unavailable, report the exact unfinished step and give a concise user handoff. Do not claim a separate tab is the one the user watches.

## Receipt verification

Prefer the original attachment/download. If no receipt is available, capture a Monarch screenshot cropped to only the relevant transaction card/details, inspect the crop for readable merchant/date/amount and unrelated information, and attach it under the user's standing fallback authorization. Identify the source as a Monarch transaction screenshot and retain any missing itemization as unresolved. If constructing a copy instead, retain only verified purchase facts and label the provenance. Render PDF pages and inspect them when layout matters. Confirm upload persisted after reload; for fragile uploads, inspect the actual attached file as well. References to a source link are useful but are not equivalent to a saved receipt attachment.

## Completion criteria

A row is complete only for the actions requested: exact match established or uncertainty recorded; duplicate outcome documented; accepted financial shares persisted; required receipt and readable note present with confirmed ownership, item details, tax/rewards treatment, and refund status where applicable; pending note or posted split verified after reloading and reopening the exact transaction; each resulting review flag verified. Report remaining ambiguous and personal-only rows explicitly rather than declaring the entire merchant complete.
