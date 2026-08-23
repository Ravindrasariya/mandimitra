---
name: Query-param variants break exact-key invalidation
description: When a second screen reads the same endpoint with a query parameter, every exact-key invalidation for that endpoint silently stops covering it.
---

Two screens frequently need different slices of the same server calculation — one wants only the outstanding
items, another also wants the settled ones so it can say "Paid". Adding a query parameter to the existing
endpoint is the right move: it keeps one calculation and stops the two screens from drifting apart on the
numbers. But it creates a second cache key.

Every `invalidateQueries({ queryKey: ["/api/thing"] })` call in the codebase matches that key exactly, so it
covers the original screen and silently misses the new one. Nothing errors; the second screen just keeps
showing an old answer.

**Rule:** the moment an endpoint gains a query-param variant, convert every invalidation of it to a prefix
predicate on the key string, and sweep for *all* call sites — they are usually scattered across several
write paths, not centralised.

**Why:** the failure is invisible. The screen renders a plausible, confidently-wrong number, and nothing in
the logs or the type checker points at it.

**How to apply:** grep for the endpoint path across the client before adding the parameter, and expect the
call sites to outnumber your guess.
