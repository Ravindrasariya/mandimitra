---
name: Seeing a generated receipt without logging in
description: How to visually verify printed receipt/HTML output when the screenshot browser cannot authenticate into the app.
---

Receipt layout work needs eyes on the rendered page, but the screenshot browser is unauthenticated
and lands on the login screen, so the real print flow is unreachable. It is still fully verifiable:

1. Call the generator directly from a throwaway `tsx` script with a hand-built input. The receipt
   generators only import `date-fns` and a sibling module at runtime — the schema imports are
   type-only and get erased — so they run outside React with no alias resolution needed.
2. Write the returned HTML into the client's **public** directory, which the dev server serves at
   the site root, and screenshot that path.
3. Delete the files afterwards. They sit in the source tree and will otherwise show up in the diff.

The screenshot viewport is much shorter than a full A4 page, so a one-page-fit check needs a second
wrapper page in the same directory that embeds the receipt in a scaled-down iframe. That is the only
way to see where the cut line and tear-off slip actually land.

For anything involving `@media print` or page breaks, the screenshot route is useless -- it renders
screen styles on one endless page. There is a Chromium binary in the nix store (under the playwright
browsers package) that will print to PDF headlessly, and `pdftoppm` / `pdfinfo` / `pdftotext` are on
PATH. That gives a far better loop than screenshots: real page counts, per-page PNGs to look at, and
`pdftotext -f N -l N` to assert *which sheet* a given label landed on without spending a screenshot.

It also gives a regression test with no test framework: render the same fixtures from the pre-change
generator (copy the file aside, `git checkout --` it, render, restore) and compare page-image md5s. An
identical hash is hard proof that a layout change left the ordinary cases untouched.

Two gotchas: avoid unbounded `find /nix/store` (it will blow the command timeout -- glob the specific
store path instead), and Devanagari has no system font, so glyphs render as boxes. Layout and
pagination are still accurate, and `pdftotext` extracts the real characters regardless.

**Why:** the alternative is shipping print-layout changes unseen, and printed receipts are the one
output in this project the user physically hands to someone.

**How to apply:** any change to a receipt, bill, or other generated-HTML print layout. Cover the
padding boundary in both directions — fewer rows than the minimum, exactly the minimum, and more —
since row-count edge cases are where these layouts break.
