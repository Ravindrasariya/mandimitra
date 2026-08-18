---
name: Stretch-to-fill print layouts cannot also paginate
description: Why a flex chain that fills one printed sheet breaks badly when the content grows past it, and the shape of the fix.
---

A print layout that stretches content to fill exactly one sheet -- a column flex chain where the body
element grows into the leftover space so a footer sits at the bottom -- must never be allowed to
fragment across sheets.

Chrome lays a flex container out once and then slices it at page boundaries. It does **not** reposition
later flex items when a break is pushed down. So the moment you add `break-inside: avoid` to anything
inside that container, the avoided block moves down but its following siblings do not, and the content
prints on top of them. The symptom is overlapping text on the second sheet, not a missing page.

Two further traps in the same area:

- `min-height: 0` on the flex items (the usual "let this shrink" idiom) removes their automatic minimum
  size, so an oversized child is handed a box smaller than its content and overflows it. This produces
  overlap even without any avoid rule.
- Natural, unforced fragmentation of the same layout is usually fine. It is specifically the *forced*
  break that misbehaves, which makes the bug look intermittent -- it appears only at the row counts
  where an avoid rule actually has to push something.

**The fix that works:** decide short vs. long at generation time, from data the generator already has,
and emit a class that selects between the two layouts. Keep the flex chain for content that fits one
sheet, so that case stays byte-identical; use ordinary block layout for the long case, where table
fragmentation, repeated `thead`, and `break-inside: avoid` all behave correctly. A stretch-to-fill
layout has no leftover space to distribute once it overflows, so nothing is lost by dropping flex there.

**Why:** the alternative -- trying to make one layout do both -- burns a lot of time on Chrome
fragmentation quirks and still leaves overlapping output.

**How to apply:** any printed document that both fills a page and can grow past it. Pick the switch
threshold by measuring, not by estimating, and note that the threshold shifts when the header height
can vary (e.g. an uploaded letterhead), so content just under the limit may still spill and fall back
to the old behaviour.
