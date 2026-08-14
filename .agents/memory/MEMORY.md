# Memory Index

- [Charge rate snapshots vs. freight](charge-rate-snapshots.md) — no dated rate table; each transaction freezes its own rates, and freight is the one derived charge that can go stale.
- [Payment-aware edit guards](payment-edit-guards.md) — scope guards by party, fire on a changed value not payload presence, and cover every write route that reaches the same numbers.
- [BB#/SR# is not a unique bill key](bill-number-scoping.md) — bill numbers repeat across financial years; scope bill-level actions by transaction id, and never by number+date.
- [Persisted selections need re-anchoring](persisted-selection-state.md) — browser-persisted picks keyed by a server grouping key break when grouping changes; reconcile by entity id.
- [Receipt template plumbing](receipt-template-plumbing.md) — public-folder template files are reference copies; what prints is a stored DB template or a hardcoded generator, so file edits are silent no-ops until re-uploaded.
