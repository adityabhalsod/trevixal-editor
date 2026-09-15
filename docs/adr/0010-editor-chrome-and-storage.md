# ADR-0010: Editor chrome composition and pluggable image storage

**Status:** Accepted, 2026-08-30

## Context

Two features arrived together and share one design question: how much should
the editor know about the things around it?

1. A full editing interface (menubar, grouped toolbar with selects, color
   pickers and a table grid, dialogs, status bar) of the kind desktop
   editors and WordPress/TinyMCE users expect.
2. Image uploads, which must reach whatever storage the host application
   uses: an in-house API, S3/R2/GCS behind presigned URLs, a CDN, or nothing
   at all in a demo.

## Decision

### Styling attributes are marks with sanitized values

Font family, font size, text color and background color are marks carrying
attributes; alignment and indent are attributes on textblock nodes. All of
them serialize into a `style` attribute through dedicated sanitizers
(`safeColor`, `safeLength`, `safeCSSValue`, `safeFontFamily`) that validate
against explicit grammars rather than escaping. A value that cannot be proven
safe is dropped, so a hostile attribute can never open a new declaration,
reach `url()`, or smuggle script.

`toggleMark` was the wrong verb for attributed marks, choosing 12pt twice
would remove it, so `setMark` replaces any existing mark of the same type in
the range, and `unsetMark` and `clearFormatting` remove them.

Node JSON now omits attributes equal to their schema default, because
`computeAttrs` restores them on load. Without this, adding `align`/`indent`
would have put `"align": null` on every paragraph in every stored document.

### The chrome composes public API, and depends on nothing it drives

Every control is data: a `ToolbarItem` is a plain object, a `ToolbarControl`
supplies `create`, and a `Menu` is a list of `MenuItem`s. Consumers add,
remove or reorder anything without modifying the toolbar.

`@trevixal/ui` must not depend on the extension packages, or every consumer
would pay for tables and images whether or not they use them. Instead
`createEditorUI` accepts the capabilities it drives, `tableCommands`
(satisfied by `tableUICommands()` from the table extension) and `images`
(satisfied by the image controller). Menu entries with no wired handler
render **disabled** rather than silently doing nothing.

One `createDropdown` primitive backs the menubar, the selects, the color
pickers and the table grid; it owns only open/close behavior, so a new kind
of panel never touches it.

### Storage is an interface the editor owns

`ImageStorage { upload, delete? }` is defined by the image extension; the
bundled adapters (fetch multipart, S3-style presigned, data URL, object URL,
and a fallback chain) are ordinary implementations with no privileged status.
Applications implement the same two methods for anything else.

Uploads insert a placeholder node carrying an `uploadId` and locate it again
by that id, never by position, so the placeholder survives arbitrary edits
made while bytes are in flight. A failed or cancelled upload removes its
placeholder, leaving the document exactly as it was.

## Consequences

- Adding a toolbar control, a menu entry or a storage provider is additive;
  none of them requires editing existing files.
- Building the chrome surfaced a real core bug: browsers report whole-block
  selections (Ctrl+A in Firefox, triple-click) with the anchor on a
  *container* element and the offset as a child index. `positionFromDOMPoint`
  only understood points inside a textblock and returned null, so the model
  selection silently stayed stale and toolbar commands applied to the wrong
  range. It now resolves container points by descending to a textblock, and
  `Editor.exec` syncs the DOM selection first. A toolbar button suppresses
  focus changes, so no keydown or `beforeinput` would otherwise run.
- The `@trevixal/ui` package remains optional: the engine ships no chrome,
  and an application can render its own against the same snapshot API.
