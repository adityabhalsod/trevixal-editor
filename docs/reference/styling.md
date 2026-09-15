# Styling and theming

`@trevixal/ui` ships a compiled stylesheet and its SCSS sources:

```ts
import '@trevixal/ui/styles.css'   // everything, compiled
// or compose from source:  @use '@trevixal/ui/scss/tokens';
```

`@trevixal/editor-kit/styles.css` dresses the shell around the editor (the
panes, the panels, the readouts) and loads after it.

## Classes

Wrap the editor in an element with the class **`trevixal`**; the content
surface is `.trevixal-content`. Class names follow BEM:
`trevixal-<block>__<element>--<modifier>`.

## Tokens

Every colour and size is a CSS custom property `--tvx-*`, so overrides need
no build step:

```css
.trevixal { --tvx-color-accent: rebeccapurple; }
```

In SCSS, `t.token('space-2')` compiles to `var(--tvx-space-2)`; the tokens
live in `_tokens.scss`. Design tokens live in `@trevixal/ui` only
([ADR-0004](../adr/0004-scss-tokens-in-ui-only)); the core emits semantic HTML
and never inlines presentational styles.

## Dark mode and presets

Dark mode follows `prefers-color-scheme` and can be forced with
`data-trevixal-theme="dark"` (or `"light"`). A preset is applied with
`data-trevixal-preset="nord"` and a runtime `<style>` the theme controller
writes. Everything but `.trevixal` in the base theme rules sits in
`:where()`, capping them at one class of specificity so a preset can win.

```ts
import { createThemeController, defaultThemePresets } from '@trevixal/ui'

const theme = createThemeController(document, { mode: 'system', presets: defaultThemePresets() })
theme.setPreset('nord')
```

## The browser's own furniture

The palette also sets `color-scheme`, which is what the browser reads for
everything it draws itself: scrollbars, form controls, the canvas behind them.
Tokens alone reach none of that, and without it a dark editor sits beside a
bright white scrollbar. On top of it every surface gets a slim bar in the
theme's own colours: `scrollbar-width` and `scrollbar-color` inherit, so one
declaration on the editor root reaches every scroller under it. Exported and
previewed pages are separate documents and carry their own copy of the same
rules.

The viewport's own scrollbar is painted from the root element, which sits
above the editor, so the kit sets `color-scheme` there when you have put
`data-trevixal-theme` on `<html>`, and leaves the rest of that page to you:

```css
html { scrollbar-width: thin; scrollbar-color: var(--tvx-color-border) transparent; }
```

## Whitespace

The surface is `white-space: pre-wrap`, so a space is kept exactly where it
was typed. Under the default `normal` a run of spaces collapses to one and a
space at the end of a line is dropped when it is drawn, so the caret sat still
until the next character arrived. `pre-wrap` rather than `pre`, so text still
wraps at the edge of the column.

## The partials

`_tokens`, `_themes`, `_editor`, `_chrome`, `_toolbar`, `_navigation`,
`_blocks`, `_features`, `_extensions`, composed by `index.scss`. They are
published under `@trevixal/ui/scss/*` for consumers who want to build from
the tokens.

## Two rules the kit holds itself to

Exports read styles back out of the CSSOM, so:

1. **Never fill a control with a border colour.** A high-contrast palette may
   make it the same ink as the text.
2. **Never put a `var()` in a shorthand that a longhand then overrides.** That
   pair cannot be serialized back out, and the declaration vanishes from
   every saved page. Write the longhands.

A browser test reads the whole exported stylesheet and fails on any empty
declaration.
