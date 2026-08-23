---
name: Charge dues are scope-based
description: Why hammali, extra-charge and freight dues can only be shown per date/farmer, and what has to stay in step for them to agree across tabs.
---

Money paid OUT (freight/bhada, hammali, extra charges) is recorded against a scope, never against a
single bill: freight against farmer + stock date, hammali and extras against a date. Money owed IN or
to the farmer is per bill. So an outgoing due can never be filtered by buyer or crop the way a bill
total can — the only honest options are a proportional share (labelled as an estimate) or nothing.

**Why:** the user chose the proportional share, on the understanding that it is an estimate.

**How to apply:** compute such a due as (server scope total − paid) × (visible total ÷ server scope
total), clamped to [0,1] and never negative. Take the scope total from the same server calculation
that produced "paid", so a rounding difference can never invent a due.

Three things must move in lockstep or the tabs quietly disagree: the rounding rule (buyer per-bag
hammali is rounded per bill, in SQL and in both clients), the scope key, and cache invalidation —
editing a bill changes what is owed just as a payment changes what is paid, so both kinds of write
must refresh the breakdown queries.
