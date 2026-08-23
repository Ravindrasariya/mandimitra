---
name: Business switching and page-local state
description: Why a mounted page must prove which business its data came from, not just refetch on switch.
---

Switching business does not unmount the page. A page that hydrates server data into local state once,
and a query key that carries no business id, together mean the previous business's rows can be shown
under the new business — and written into its browser-local drafts.

**The rule:** page-local copies of server data must be discarded on switch, and each response must be
admitted only if it can prove which business it was fetched for.

**Why:** invalidating the cache deliberately *keeps* the old data until the new answer arrives, and a
wall-clock "fetched after the switch" test still admits a reply that was already in flight. Only an
identity stamp carried on the response is sound.

**How to apply:** stamp the response with the business it was fetched for and admit it only on a match,
and hold any browser-local draft saving until the page has re-hydrated for the new business.
