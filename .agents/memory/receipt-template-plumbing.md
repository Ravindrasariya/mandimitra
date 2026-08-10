---
name: Receipt template plumbing
description: Two different documents can both be called "the receipt" — a custom uploaded template or the built-in default — so confirm which one prints before editing.
---

# Receipt template plumbing

There are two independent sources for a printed receipt, and they are **different documents, not variants of each other**:

- **Custom templates** — HTML uploaded per business through the admin panel, on request. The template files kept in the client's public folder are the *master copies* that get uploaded; the app never reads them from disk at runtime.
- **The built-in default** — generated in TypeScript when a business has no custom template. Its layout is genuinely different from the custom master (different sections, labels, and structure).

**Why:** Editing a master copy in the public folder does not change what any existing business prints. Their uploaded copy is a snapshot taken at upload time. Conversely, changing the built-in default does nothing for businesses that already have a custom template. Assuming one edit covers both produces work that looks done but changes nothing for the user.

**How to apply:** Before editing any receipt layout, establish which of the two the affected business actually prints. Then state explicitly which one you changed and whether existing businesses need a re-upload for it to take effect. When a change is meant to reach everyone, it usually has to be made in both places.

## Token substitution

Custom templates are filled by plain string replacement over a fixed set of `{{TOKEN}}` keys — no templating engine, no expressions, no conditionals. An unknown token is left in the output verbatim, so a typo prints as a literal `{{SOME_TOKEN}}` on the customer's receipt instead of failing loudly. Always render the template with sample data and grep the output for leftover `{{...}}` before calling a token change done.

## Print margin contract

The print helper always injects `@page { margin: 0 !important }`, and *additionally* injects a `body` margin (`!important`) only when the template has **no** `@page` rule of its own. A template that stretches a wrapper to `100vh` while relying on its own body margin therefore overflows to a near-blank second page. **How to apply:** every template must declare its own `@page` rule (so the helper stays hands-off from the body), set the body print margin itself, and size any full-page wrapper as `calc(100vh - top-and-bottom-margins)`. Verify with headless Chromium `--print-to-pdf` + `pdfinfo` page count.

## Screenshots cannot validate a print layout

A screenshot proves nothing about the printed result: the viewport is shorter than the page, so bottom-anchored content is cropped out of frame, and `@media print` rules never apply on screen. A receipt can look perfect in the browser and still print two pages.

**Why:** page fit is decided by rules that exist only in the print context, against a page box the screen never uses.

**How to apply:** print the real generator output to PDF headlessly and assert the page count, sweeping produce-row counts and toggling the letterhead image on and off.

## Letterhead sizing: width wins over page fit

An uploaded letterhead must print at the **full content width of whatever page it lands on**, at its natural aspect ratio — never height-capped. Emit it through the one shared helper, not per-generator inline markup.

**Why:** capping the height with `max-height` + `object-fit: contain` letterboxes a wide banner (a ~3.7:1 image shrank to about a third of the A4 width), which the user reads as a broken header. They accepted that a tall letterhead may push a receipt onto a second sheet and asked to verify page fit themselves; do not reintroduce a height ceiling, re-tune the page-height target, or trim content to compensate.

**How to apply:** when a document gains a letterhead, route it through the shared helper so escaping and sizing stay uniform. Verify by measuring the rendered image box headlessly: its width must equal the content width and its drawn aspect must equal the image's natural aspect.

## Page-fit structure

In the two-copy A4 farmer layout, the main copy absorbs all leftover page height while the lower payment slip is content-sized. Adding a **row** to the slip therefore shrinks the produce table above it rather than lengthening the page; adding a **cell to an existing row** changes nothing vertically. Use this to reason about single-page fit without needing to print.
