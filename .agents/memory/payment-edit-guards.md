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

## A party's identity is frozen by that party's own payment

Re-pointing a row to a different farmer or buyer after money has moved is worse than editing an
amount: the cash entry stays filed under the old party while the row moves to the new one, and
both ledgers look internally consistent while disagreeing with each other. Scope this the same way
as amounts — a buyer payment freezes the buyer, a farmer payment freezes the farmer — and never
lump the party field in with the amount fields, or a farmer payout ends up blocking an unrelated
buyer correction.

The freeze is on the *ledger id*, not on the party's details. Renaming a farmer keeps the id and
must stay possible; there is a separate details-edit path for that.

## Deletes and archives block bluntly but must still name the right party

Edits are party-scoped; deletes and archives are not, and that asymmetry is deliberate. A delete
removes the whole row, so *any* un-reversed payment has to stop it no matter who paid. Do not
"improve" these into party-scoped checks — that would let a delete destroy the row a payment on the
other side still depends on.

What the party *is* still matters, for the message only. Reaching the party through the payment's
transaction rather than through the payment itself looks equivalent and is not: every transaction
has a buyer, so a farmer-only payout still resolves to a buyer name and the block correctly fires
while naming someone who paid nothing. The failure is silent — the guard looks like it works.
Resolve the party from the payment's own record, and keep "is it blocked" and "who paid" as
separate values so a change to the message can never change what is refused.

## Server guard rejections must carry a code, not just English prose

Guard messages are the one place a user most needs their own language, and the sentence is built
server-side from live data (which SR#s are paid, which party paid). Reject with a stable reason
code plus the values that go inside the sentence, keep the English text for logs and non-UI
callers, and let the client rebuild the sentence from its dictionary. The fetch wrapper must
preserve those fields — the default "throw away everything but `message`" loses them silently and
there is then no way to translate.

## One block, one message

A guard raised deep inside a multi-step save is normally caught again by the save's outer handler,
which re-toasts `err.message`. With a toast limit of one, the raw English message *replaces* the
translated one and the translation work is invisible. Throw a distinct error type carrying the
already-translated text and let only the outer handler render it.

## Never report a partial multi-row failure with a transient toast

One card save fans out to many transactions. If some succeed and some are rejected, a toast that
auto-dismisses leaves the user looking at freshly recalculated on-screen values that were never
persisted — the bug looks like a wrong total, not a failed save. Collect per-row failures and show
them in something the user has to dismiss.

**How to apply:** whenever adding a "you can't edit this after payment" rule, answer three
questions first — which party's money is affected, which routes can reach the value, and does the
client re-send the field unchanged on every save.
