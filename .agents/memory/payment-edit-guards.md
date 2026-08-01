---
name: Payment-aware edit guards
description: Rules for blocking edits once money has moved — scope by party, guard on changed value, and guard every write route.
---

# Payment-aware edit guards

## Guard by party, not by "any payment exists"

A single all-or-nothing check ("reject if any active cash entry touches this row") is wrong here:
a **buyer** receipt should not block a **farmer**-side deduction, and vice versa. Splitting the
guard by party is what let a freight correction land on a lot whose buyer had already paid.

The cash-entry table has no direction column. Party is inferred from the FK plus the category:
a farmer payout is `farmerId != null && category = 'outward'`; a buyer receipt is
`buyerId != null && category = 'inward'`. Only non-reversed, non-archived entries count.

Scope also differs by field. Vehicle-level fields (bhada rate, total bags in vehicle) apply to
every crop group on a farmer card, so they must be checked against farmer payments on *any* lot of
that farmer+date — not just the lot being edited.

## Guard on a changed value, never on payload presence

The farmer card always PATCHes its full field set, so "this field is present in the body" would
reject every save. Compare old vs. new, and compare **numerically** — decimal columns round-trip
as strings like `"0.00"`, so string equality reports phantom edits.

## Guard every write route that reaches the same economics

Guarding the transaction route alone is bypassable: the card save writes the bid row first and the
transaction second, so buyer / price / bag count can be mutated through the bid route while the
transaction keeps the old numbers. Any route that can reach a guarded value needs the same check,
and the client's pre-check must run **before** the first write of the sequence, not between writes.

## Never report a partial multi-row failure with a transient toast

One card save fans out to many transactions. If some succeed and some are rejected, a toast that
auto-dismisses leaves the user looking at freshly recalculated on-screen values that were never
persisted — the bug looks like a wrong total, not a failed save. Collect per-row failures and show
them in something the user has to dismiss.

**How to apply:** whenever adding a "you can't edit this after payment" rule, answer three
questions first — which party's money is affected, which routes can reach the value, and does the
client re-send the field unchanged on every save.
