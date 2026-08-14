---
name: Stock page cards load once; server-owned fields need explicit re-sync
description: The stock page copies cards into local editable state a single time, so query invalidation alone never updates anything visible on an open card.
---

The stock page loads `/api/stock-cards` into local editable state **once**, behind a `dbLoaded`
ref, then never re-syncs wholesale. That is deliberate: the cards are live edit forms with draft
autosave, and a background refetch would clobber someone mid-typing.

The consequence catches people out: **invalidating a query is not enough to update anything the
stock page shows.** The refetch happens, the cache updates, and the card on screen keeps rendering
the values it was born with until a hard refresh. This is why a payment recorded through the Farmer
Pay shortcut — which lives on the stock page — left the Due badges stale even though the
invalidation set was already correct.

The fix pattern for a server-owned field: a separate effect that runs on every refetch and copies
across **only** the fields the user cannot edit, matched by a stable id (transaction id for bids).
Two requirements that are easy to miss:
- Return the object by identity when nothing differs. This runs on every refetch, and the card
  state drives both re-renders and the draft autosave.
- Mirror the same update into the saved-snapshot map. Dirty detection compares the card against
  that snapshot, so updating only the live card makes an untouched card look like it has unsaved
  edits.

**Why:** the once-only load protects edits, but it silently converts "stale cache" bugs into
"stale UI that no invalidation can reach" bugs, and the usual fix (add another
`invalidateQueries`) does nothing at all here.

**How to apply:** any bug of the form "X doesn't update on the stock page without a refresh", and
any new server-computed field displayed on a card.
