# ADR-0008: Extension points, transforms, transaction events, decoration layers, triggers

**Status:** Accepted, 2026-08-30

## Context

The extension packages ship as separate modules. They must observe and influence the
editor without private APIs, and without each extension re-implementing the
same popup/trigger machinery.

## Decision

Four public core extension points:

1. **`Editor.onTransaction(listener)`** delivers the applied transaction with
   its before/after states. The table of contents and the writing assistant
   remap their anchors through `transaction.mapPosition`.
2. **`Editor.addDispatchTransform(fn)`** lets an extension rewrite a
   transaction *before* it applies (returning a replacement built on the same
   state). Track changes uses it to turn deletes into `deletion` marks and
   inserts into `insertion`-marked text.
3. **`EditorView.setDecorationLayer(key, source)`**: named, composable
   decoration layers (search, code highlighting and writing checks stack
   without clobbering each other). `InlineDecoration` gained
   `style` (per-range colors) and zero-width `widget` decorations whose
   wrappers the position mapper skips (`data-trevixal-widget`). Widget
   content must keep `textContent` empty (render labels via CSS `attr()`),
   so IME repair diffs and clipboard text stay clean. The renderer compares
   per-block decoration output structurally, so a decoration update
   elsewhere never re-renders unrelated blocks.
4. **`suggestion` / `suggestionList` (core `suggest` module)**, trigger-char
   detection against the *model* (never the DOM) plus the full popup driver
   (async item fetching with stale-response dropping, arrow/Enter/Tab/Escape
   handling via `EditorView.addKeydownInterceptor`). Slash (`/`,
   start-of-block) and emoji (`:`) are each a thin mapping over it; popup
   rendering stays UI-side (`createSuggestionPopup` in `@trevixal/ui`, or
   bring your own via `onState`).

Atom nodes with visible labels (badges, footnote markers) are supported by an
`HTMLSpec.text` field rendered as escaped text content by both the DOM renderer
and the HTML serializer.

## Track-changes v0 scope

The dispatch transform recognizes single-textblock inline edits (including
the delete+insert pair that typing over a selection emits). Structural
transactions (Enter, block joins, wraps) apply directly, untracked, in v0.
Same-author adjacent suggestions reuse the neighboring mark instance so a
typing burst forms one suggestion span. Deleting your own pending insertion
is a real deletion; delete/backspace over already-struck text steps the
caret across it instead of re-marking.

## Consequences

- No extension package imports anything private; every one of them builds on
  the public API only.
