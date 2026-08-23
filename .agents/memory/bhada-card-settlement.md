---
name: Settling money against a farmer card
description: A farmer card has no row of its own, so anything paid against it must be stamped with farmer + stock date, which then freezes those two fields.
---

A farmer card is a runtime grouping, not a stored row: it is the lots sharing a farmer and a stock entry
date. The stock-cards view groups one level finer (it also splits on vehicle number), so any card-level
money figure has to be read once per vehicle sub-group and summed back up to farmer + date.

**The rule:** money settled against a card is stamped with farmer id + stock entry date, never with vehicle
number or driver — both are optional. Card-level amounts (bhada, farmer advance) are duplicated onto every
lot of the sub-group, so a total is a distinct-by-vehicle sum, never a plain SUM over lots.

**Why:** the app already prevents the same farmer appearing twice on one day, so farmer + date is a unique
and stable key, while vehicle number is frequently blank or filled in later.

**How to apply:** the moment such a payment exists, the card's farmer and stock date are frozen and the
card's amount cannot be cut below what is paid — otherwise the payment strands on a card that no longer
exists. Archive and delete need the same guard: these payments carry no transaction link, so the older
transaction-joined payment blocks cannot see them at all. Raising the amount is always safe.
