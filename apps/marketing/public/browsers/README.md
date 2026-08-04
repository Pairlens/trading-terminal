# Browser logos

Vendor marks used on the landing hero to say the web terminal runs in any
modern browser. Sourced from [alrra/browser-logos][repo].

Each logo is a trademark of its respective owner. They are shown here purely
to state compatibility — nominative use — not to suggest any partnership,
sponsorship or endorsement.

They are served as separate files rather than inlined, and that is not an
accident: every one of these SVGs defines `id="a"`, and four of them reference
`url(#a)`. Inline them into one document and four logos render with Chrome's
gradient. `safari.svg` also carries an unscoped `<style>` block whose `.b` and
`.c` rules would leak into the page.

[repo]: https://github.com/alrra/browser-logos
