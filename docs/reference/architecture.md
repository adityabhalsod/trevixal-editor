# Architecture

Three things are worth reading before changing anything in `@trevixal/core`:
the rules the engine will not bend, the path a keystroke takes from the
keyboard to the screen, and the handful of mechanisms that are not obvious
from the type signatures.

## Principles that do not bend

1. **The DOM is never the source of truth.** State is an immutable
   `EditorState { doc, selection, storedMarks }`; the contenteditable surface
   is a render target and an input source only.
2. **Everything is a `Transaction`**: an ordered list of invertible steps.
   Undo and redo fall out of step inversion; there is no second bookkeeping
   system.
3. **Every step remaps positions**, so selections, decorations and suggestion
   ranges survive arbitrary edits.
4. **Documents are schema-validated**, with a deterministic normalization pass.
5. **Core is pure, portable, strict TypeScript**: no framework code, no DOM
   access at module top level (SSR-safe), no `any` in the public API,
   `sideEffects: false`.
6. **No runtime dependencies in anything shipped.** The schema system,
   transactions, undo, sanitizer, DOM reconciler, fuzzy search, emoji data,
   ZIP, XML, OOXML, RTF and MathML are all written in this repository.

## Data flow

```
        keydown / beforeinput / paste / IME composition / MutationObserver
                                    |
                                    v
                  intent -> Command(state) -> Transaction | null
                                    |
                    dispatch transforms may rewrite it
                    (suggestion mode turns a delete into a strike)
                                    |
                                    v
              EditorState.apply(tr)  ->  a new immutable EditorState
                                    |
           +------------------------+-------------------------+
           v                        v                         v
   History records            onTransaction             DOMRenderer diffs
   inverted steps             listeners: outline,       model -> DOM, keyed,
   in undo groups             autosave, writing         with structural sharing
                              checks, diagrams
```

## Key mechanisms

- **Input pipeline** ([ADR-0005](../adr/0005-beforeinput-first-input-pipeline)):
  `beforeinput` is intercepted and translated to commands; IME composition
  lets the DOM lead and reconciles at `compositionend`; a MutationObserver
  performs prefix and suffix text-diff repair for anything unexpected, such
  as autocorrect or a browser extension. `Enter` and `Backspace` ride on
  `beforeinput`; the keymap handles marks, undo and redo, `Tab` and
  `Mod-Enter`.
- **Positions** ([ADR-0001](../adr/0001-path-offset-positions)) are a
  child-index trail plus an inline offset; text nodes contribute their length
  and inline atoms count as one.
- **Steps** ([ADR-0003](../adr/0003-primitive-steps-over-monolithic-replace))
  are small primitives rather than one monolithic replace; a property test
  applies random steps, inverts them and checks the document is restored,
  200 times per run.
- **Clipboard** writes `text/html`, `text/plain` and a lossless
  `application/x-trevixal+json`; `Mod-Shift-V` pastes plain; pasting into a
  code block inserts plain text.
- **The DOM is patched, never rewritten.** An attribute is only written when
  its value actually changed. Assigning one the value it already has is still
  a write: it invalidates style, it shows up as a mutation, and on an
  `<iframe>` assigning `src` reloads the frame.
- **Decorations, not document pollution** ([ADR-0008](../adr/0008-extension-points)):
  search highlights, code tokens, writing marks and diagram previews render
  through named, composable decoration layers or appended elements; none are
  stored.
- **Adapter contract** ([ADR-0007](../adr/0007-adapter-contract)): the editor
  DOM lives *outside* framework reconciliation; toolbars subscribe to
  reference-stable snapshots, so typing never re-renders host component
  trees.
- **Extension points** ([ADR-0008](../adr/0008-extension-points)): every
  extension is built on `onTransaction`, `addDispatchTransform`,
  `setDecorationLayer` and the `suggestion` trigger module, plus schema
  merging, `keymap`, `inputRules` and `nodeViews`. No private access
  anywhere.
- **Chrome composition** ([ADR-0010](../adr/0010-editor-chrome-and-storage)):
  the UI kit depends on no extension; hosts inject capabilities, and unwired
  entries drop out of the menus.

## Repository layout

```
trevixal-editor/
  packages/
    core/                    the engine: model/ state/ commands/ history/ input-rules/
                             search/ serialize/ suggest/ schema/ view/ editor/ a11y/
    ui/                      chrome, dialogs, themes, persistence, export plumbing
                             src/styles/: the SCSS partials
    editor-kit/              everything, assembled into one call, plus the CDN build
    react/ vue/ svelte/ angular/ web-component/
    extension-*/             fifteen extensions
    e2e/                     Playwright specs and the built test pages
  examples/                  eleven apps, one per way in
  docs/                      this site, and docs/adr/ the decision records
  benchmarks/                keystroke latency and serialization, with a budget
  scripts/                   size budgets, the publish gate, docs assets
  .github/workflows/         CI and the release workflow
  .changeset/                versioning
```

Each package is `src/` + `test/` + `tsup.config.ts` + `package.json`,
building to a gitignored `dist/`. The [decision records](../adr/) hold the
reasoning behind the shapes above.
