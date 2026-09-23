# Testing

Two suites, split by what they can actually see. Anything that needs a real
browser (layout, scroll anchoring, focus, composition, printing, a `.docx`
read back) is a browser test; everything else is a unit test.

## Unit tests

Vitest, with happy-dom where a DOM is needed. Around 2,200 tests across 23
packages; the core alone has over 500 and the export package over 300.

Among them: a randomized **step-inversion property test** (apply, invert,
apply restores the document, 200 iterations); an **XSS corpus** in
`parse-html.test.ts` (script tags, event-handler attributes, `javascript:`
and `data:` URLs, SVG payloads, nested and obfuscated variants) parsed in an
inert template through the allowlist; a **tokenizer time budget** on hostile
20,000-character inputs for every bundled grammar; the adapter test that a
non-subscribing React sibling renders **zero** times while typing; SSR import
tests for React, Vue and the web component; and the `review-2.test.ts` files,
which were written as hypotheses by review passes and then corrected against
real behaviour.

```sh
pnpm test                                  # everything, cached
pnpm --filter @trevixal/core test          # one package
```

## Browser tests

Playwright, 158 tests across 18 specs, each run on Chromium, Firefox and
WebKit in the CI configuration (474 in a full run, 16 skipped where an engine
lacks the API).

| Spec | Covers |
| --- | --- |
| `feature-set.spec.ts` | The built demo through its own menus: every node kind renders; every menu offers its features; tabs switch and write to the document; theme presets repaint; the shortcut manager rebinds; statistics; passive voice; the review bar; autosave; spell check; menu labels stay readable in every theme; every entry has an icon; the palette matches the menus; a real `.docx` reads back; exports carry the theme, the highlighting and the diagram to the page and to Word; a saved page works from disk; print preview; Markdown export; slash and emoji; protection encrypts the autosave; a blocked copy says so; read-only locks and unlocks; Word and Google Docs pastes arrive clean |
| `full-editor-example.spec.ts` | The demo boots on its seeded document; the cell toolbar appears only inside a table; the language picker floats over the block at the caret; code highlights; the format painter |
| `editor-ui.spec.ts` | Every control renders and drives the editor |
| `productivity.spec.ts` | The built demo's keyboard tools: the palette prints the keys that fire and opens on what ran last; the slash menu keeps its highlight in view; quick insert inserts on `Enter` and the tray pins; Google Docs keys format the paragraph and a bare key is never bound; Customize toolbar applies without a reload; fullscreen shows the page alone, with the slash menu over it |
| `chrome-state.spec.ts` | Menus report what is on; the palette leaves the page where it found it; every scrollbar follows the theme; both split panes show what the editor shows and scroll together |
| `chrome-polish.spec.ts` | Visual polish, and the table toolbar moves, swaps and resizes |
| `examples.spec.ts` | Every example app, actually run: React, Next.js on its own server, Vue, Nuxt, Svelte, SvelteKit, Angular, Solid, the CDN page and the server-rendered build |
| `table-resize.spec.ts` | Dragging borders and the corner handle; minimum widths; Escape abandons a drag; a resize is one undo step |
| `responsive-editing.spec.ts` | The chrome wraps at 380 and 320 px; exported pages carry their own CSS with no empty declaration |
| `code-block.spec.ts` | Editing code: indentation, `Ctrl+Enter`, bracket pairs, no spell check inside code, the copy button |
| `ime.spec.ts` | Japanese composition driven through Chrome's own `Input.imeSetComposition`: only the committed text reaches the model |
| `accessibility.spec.ts` | axe-core audits on load, with a menu open, with a dialog open, and in the dark theme with contrast |
| `docs.spec.ts` | This site builds and serves, and its playground runs the real CDN bundle from the checkout |
| `wave1-features`, `tables`, `typing`, `features`, `track-changes`, `toolbar-reorder` | Blocks, tables, typing, input rules, suggesting, toolbar drag |

```sh
cd packages/e2e
pnpm exec playwright test -c playwright.local.config.ts            # everything, local Chrome
pnpm exec playwright test -c playwright.local.config.ts tables.spec.ts --headed
pnpm exec playwright test                                          # CI config: chromium + firefox + webkit
```

Where a spec cannot see something, whether the browser really marked a
misspelling or a colour really printed, it measures pixels in a screenshot or
a rendered PDF rather than reading an attribute.

## One caveat on "green"

Every browser test passes on every engine, but not every *run* is clean. On a
four-core machine a full three-engine run drops one to three tests to
contention, a different one or two each time, almost always in
`examples.spec.ts` on WebKit, and each of them passes in isolation. Run a
failure on its own before believing it. The browser suite is therefore not a
required check in CI; run it locally before a release.
