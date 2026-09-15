# ADR-0005: beforeinput-first input pipeline with diff-based DOM repair

**Status:** Accepted, 2026-08-30

## Context

The DOM must never be the source of truth, yet contenteditable input arrives
through several channels: `beforeinput` intents, IME composition events,
autocorrect, and browser extensions mutating the DOM directly.

## Decision

Three concentric layers, outermost first:

1. **Intercept.** Every understood `beforeinput` inputType is
   `preventDefault()`ed and translated intent → command → transaction
   (insertText, insertParagraph, deleteContentBackward, historyUndo, …).
   Unknown intents are also blocked so they cannot corrupt the rendered DOM.
   `keydown` handles only shortcut chords (`Mod-b`, `Mod-z`, …) via a
   platform-aware keymap.
2. **Let the IME lead.** Between `compositionstart` and `compositionend` the
   view never re-renders and never intercepts `insertCompositionText`. At
   `compositionend` the composed block is reconciled into the model with a
   prefix/suffix text diff (inheriting marks at the edit point) and the caret
   is read back from the DOM.
3. **Repair the rest.** A MutationObserver watches for mutations not caused
   by our own renderer (render passes drain their own records via
   `takeRecords()`). A mutation attributable to a single textblock goes
   through the same text-diff reconciliation; anything else triggers a full
   re-render from state. The model always wins.

Word-level deletions (`deleteWordBackward` …) are currently approximated as
single-unit deletions; grapheme clusters are segmented with `Intl.Segmenter`
where available.

## Consequences

- Typing, marks, Enter/Backspace, undo and caret sync pass real-browser e2e
  on Chromium and Firefox (WebKit runs in CI, where its system libraries can
  be installed).
- The composition machine never rebuilds the composed DOM range
  mid-composition, which is the invariant IMEs require.
- The repair path doubles as the recovery mechanism for autocorrect and
  extension interference.
