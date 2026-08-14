---
name: Farmer rows are per bill, buyer rows are per transaction
description: The two payment allocation lists are deliberately shaped differently; do not "fix" the buyer side to match the farmer side.
---

The farmer and buyer payment allocation lists look inconsistent on purpose. Do not align them.

- **Farmer payments are per bill (per card).** A farmer is paid for the whole bill, so its rows are
  grouped into one entry per bill and labelled with the **stock register date** — the date the bill
  is filed under in the physical book. Grouping by anything transaction-level splits one bill into
  several rows with identical BB#/SR#, and a user pays one and thinks the bill is settled.
- **Buyer payments are per transaction.** Each bid is its own sale to that buyer, so a buyer owes
  per transaction, not per card. Those rows stay one-per-transaction and are labelled with the
  **transaction date**. The credit-age "days" figure is measured from that same transaction date.

**Why:** this is how the trade works, not an oversight — confirmed directly by the user when a
proposal to make the buyer side match the farmer side was rejected ("Buyers are as per txn rather
than card"). The mismatch looks like a bug on inspection, so it attracts repeat "fixes".

**How to apply:** when touching either pending-transactions endpoint or either allocation list,
change only the side you mean to. A change to farmer grouping must not be mirrored onto the buyer
path, and a bill legitimately shows a different date in the two tabs.
