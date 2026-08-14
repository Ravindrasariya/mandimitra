---
name: BB#/SR# is not a unique bill key
description: Why bill-level operations must be scoped by transaction id rather than bill book / serial number.
---

Never treat a BB# + SR# pair as a unique identifier for a bill when selecting rows to act on.
Scope bill-level operations by the concrete transaction ids the UI already holds.

**Why:** the duplicate guard on bill numbering only enforces uniqueness *within a financial
year*, so the same BB#/SR# legitimately recurs across years. Anything that fetches a party's
outstanding rows gets them across all dates and years at once, so filtering that list by
BB#/SR# silently pulls in an unpaid bill from an earlier year. A payment shortcut built this
way would settle the wrong bill while looking correct on screen.

Matching on BB#/SR# *plus* date is not a fix either, and is wrong in the other direction: a
single bill's bids can each carry their own transaction date, and the pending-transactions
endpoint keys its groups by bill book / serial / date — so one bill legitimately comes back
split across several date groups. Date-matching drops the rows that moved.

**How to apply:** when a screen acts on "this bill", pass down the saved transaction ids and
intersect the server's groups against them. Compute the due from the surviving rows rather
than from a group's own total, since a group may be only partially owned by the card. This
tolerates the multi-date split and excludes same-numbered bills from other years at once.
