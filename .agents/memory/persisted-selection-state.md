---
name: Persisted selections must be re-anchored by entity id
description: Browser-persisted picks keyed by a server-derived grouping key silently break when the grouping changes; reconcile them against fresh data by stable entity id.
---

Half-filled forms in this app persist their selected rows in the browser, and those selections
carry a **group key derived from how the server currently groups rows**. A group key is not a
stable identifier — it encodes a grouping decision, and grouping decisions change.

The rule: when a selection list is persisted, reconcile it against freshly fetched data on load,
matching by **stable entity id** (the transaction id, the invoice id — whatever the payment
actually binds to), never by the group key. Fall back to the key only for synthetic rows that own
no entity at all, such as a carried-forward opening balance.

Reconciliation must handle four cases, all of which occur in practice:
- the row no longer exists (settled, reversed, archived) — drop it
- its amount/due changed — refresh it
- **two persisted rows now resolve to one row** — fold them together and combine what the user
  entered, rather than dropping half of it
- nothing changed — return a "no change" signal so the caller skips the state update

**Why:** dedupe in these pickers works by comparing the selected keys against the available rows.
A stale key matches nothing, so the *same* item stays offered in the dropdown while already sitting
in the selection list — the user can pick it twice and produce a self-conflicting payment. This
surfaced when farmer bills changed from being grouped per transaction date to being kept whole on
their stock register date: every selection persisted before the change carried a key that no longer
existed. The active flow was correct; only users mid-form across the deploy were affected.

**Also:** never rewrite the amount string the user typed unless it is genuinely invalid (over the
new due) or being combined. Reformatting `"50"` to `"50.00"` on every background refetch fights the
user's cursor while they are still typing.

**How to apply:** any time a server response's grouping or key format changes, or a new
`usePersistedState` list holds server-derived rows. Keep the reconciler a pure function outside the
component — this project has no test framework, so a pure function is the only part that can be
exercised directly by a script.
