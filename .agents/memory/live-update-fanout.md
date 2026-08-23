---
name: Live updates across server copies
description: Why the app's "something changed" push needs a database channel, a counter, and client-side catch-up rather than an in-memory broadcast.
---

An in-memory list of connected browsers only reaches the server copy holding those connections. Any
deployment that can run more than one copy therefore delivers live updates to some users and silently
not to others, and it looks perfect in the single-process dev preview.

**The rule:** a change announcement must travel through the shared database (Postgres LISTEN/NOTIFY on
its own long-lived connection, never a pooled one), and must be backed by a per-business counter row
the browser can poll.

**Why:** the push is the fast path but the fragile one — dropped streams, sleeping phones and buffering
proxies all lose it with no visible symptom. The counter is the only mechanism that still works when
the stream never arrives at all, so it is what turns "stale until hard refresh" into self-healing.
Persist the counter *before* announcing, or a browser reacting to the announcement reads the old value
and refreshes twice.

**How to apply:** announce from one central place covering every write, rather than route by route —
an announcement omitted from a new write is invisible until someone notices figures not matching.
Coalesce bursts, since one saved card is many writes.
