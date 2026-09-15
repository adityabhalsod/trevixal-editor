# Adding things

The [callout tutorial](./callout) builds a block type end to end. This page is
the checklist for the other kinds of addition, each with the trap it exists to
avoid.

## A node or mark type

Write a `NodeSpec` or `MarkSpec`: a content expression, `toHTML`, and
`parseHTML` with `getAttrs` returning **sanitized** values (use the `safe*`
helpers from the core). Merge it into the schema. `HTMLSpec.innerHTML` is
*trusted markup* for atoms; only ever build it from escaped values.
`extension-math` and `extension-table` are compact references.

## A menu entry

Add it to `defaultMenus()` (or pass your own `menus`), give it an icon, and
wire its action in `createEditorUI`. An entry with no action is dropped, by
design. Add a `ShortcutAction` if it has a key, so the printed shortcut and
the real binding cannot disagree. Then add it to the browser test that opens
every menu.

## A shortcut

Through `createShortcutManager`, never a bare keymap entry. The manager owns
the keys, prints the labels, swallows the old default when a user rebinds,
and offers `alternateKeys`.

## An interactive block

Decide what it does in an export before writing it. `<details>` survives
because the browser owns it; a tab strip needed a script. Add the
`@media print` rule too, or the PDF quietly loses whatever is not on top.

## A decoration layer

Pick a unique key for `setDecorationLayer`. Layers compose, and two
extensions sharing a key clobber each other.

## A trigger menu

Both the `/` menu and the `:` picker are `suggestionList` from the core. An
`@`-mention style menu of your own is the same call with a different trigger
character and item list; the query is read from the document model, so it
cannot be confused by decorations.

## A storage backend

Autosave, the encrypted vault and the workspace store all speak the same
four-method `KeyValueStorage` (`get`, `set`, `remove`, `keys`). Implement
those four over your API, IndexedDB or a file and every one of them works
unchanged.

## Verifying it

```sh
pnpm --filter @trevixal/<pkg> build
pnpm --filter @trevixal/<pkg> test
pnpm typecheck
pnpm exec biome lint <the files you touched>
cd packages/e2e && pnpm exec playwright test -c playwright.local.config.ts
```

For a regression test, prove it fails against the broken code first: revert
or neuter the fix, rebuild, watch it fail, restore. For anything visual,
measure: screenshot and read pixels, or render the real `.docx`, `.rtf` or
PDF. Several bugs in the project notes were only visible that way.
