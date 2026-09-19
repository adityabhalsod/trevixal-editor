# @trevixal/core

<!-- generated: header -->

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/core.svg)](https://www.npmjs.com/package/@trevixal/core)
[![types](https://img.shields.io/npm/types/@trevixal/core.svg)](https://www.npmjs.com/package/@trevixal/core)
[![license](https://img.shields.io/npm/l/@trevixal/core.svg)](https://github.com/adityabhalsod/trevixal-editor/blob/main/LICENSE)

[Documentation](https://trevixal-editor.vercel.app) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](https://github.com/adityabhalsod/trevixal-editor/blob/main/packages/core/CHANGELOG.md) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

[![The Trevixal editor](https://trevixal-editor.vercel.app/media/editor.png)](https://trevixal-editor.vercel.app/full-editor)

## Features

- Immutable document model: schema-validated JSON you can store, diff and transform
- Invertible transactions, so undo is step inversion rather than a second history
- Runs headless in Node with no DOM, for migrations, tests and server rendering
- Imported HTML parsed inside an inert template through an allowlist
- **36.2 kB** minified and gzipped, with TypeScript types in the package

<!-- /generated: header -->

The editing engine: an immutable document model, invertible transactions, and
a contenteditable view that treats the DOM as a render target rather than the
truth. No framework code, no runtime dependencies, safe to import on a server.

```sh
npm install @trevixal/core
```

## Usage

```ts
import { createEditor, Schema, defaultNodes, defaultMarks } from '@trevixal/core'

const editor = createEditor({
  schema: new Schema({ nodes: defaultNodes(), marks: defaultMarks() }),
  element: document.querySelector('#editor'), // omit for a headless editor
  placeholder: 'Write something…',
  onChange: ({ json }) => save(json),
})

editor.commands.toggleMark('bold')
editor.chain().focus().setHeading(2).insertText('Hello').run()
editor.getJSON()   // what you store
editor.getHTML()   // an export format, not the storage format
```

Omit `element` and the identical engine runs with no DOM at all, for
server-side processing, migrations and tests.

## The shape of it

| Area | What lives there |
| --- | --- |
| `model/` | `EditorNode`, `Fragment`, `Mark`, `Schema`, content expressions, and positions as `{ path, offset }` |
| `state/` | `EditorState`, `Transaction`, and ten invertible step types |
| `commands/` | `(state) => Transaction \| null` functions; `editor.commands` is a facade over them |
| `view/` | The renderer, `beforeinput` handling, the IME composition machine, MutationObserver repair, decoration layers |
| `history/` | Undo over inverted steps, with time and adjacency grouping |
| `serialize/` | HTML, Markdown and text out; sanitized HTML in; paste-source cleanup |
| `suggest/` | The trigger driver behind `/` and `:` menus |
| `a11y/` | The live-region announcer for edits a screen reader cannot see coming |

## Three things worth knowing

**The DOM is never the source of truth.** State is immutable; the surface is
an input source and a render target. Everything else follows from that.

**Every change is an invertible step.** Undo is step inversion, not a second
bookkeeping system, and every step remaps positions, so selections,
decorations and suggestion ranges survive arbitrary edits. A property test
applies 200 random steps, inverts them, and checks the document is restored.

**Imported HTML is parsed inside an inert `<template>`** through an allowlist,
with a protocol allowlist on every URL. Scripts cannot run during parsing, and
an XSS corpus holds it to that.

**The DOM is patched, never rewritten.** An attribute is only written when
its value actually changed. Assigning one the value it already has is still a
write. It invalidates style, it shows up as a mutation to anything watching,
and on an `<iframe>` assigning `src` reloads the frame. Since a decoration
layer puts the whole document through the renderer again, and extensions
refresh those on a timer, writing unconditionally restarted every embed in the
document a few hundred milliseconds after every keystroke.

**Focusing the surface never moves the page.** `view.focus()` hands focus back
without scrolling: it is called after a menu, a dialog or the command palette
took focus, and the caret can be a whole document away from what the reader is
looking at. Navigation says so instead: `view.scrollSelectionIntoView()`.

## Extending it

Four public hooks, and every extension package in this repository is built on
them alone: `onTransaction`, `addDispatchTransform`, `setDecorationLayer`, and
the `suggestion` trigger module, plus schema merging, `keymap`, `inputRules`
and `nodeViews`. If something needs more, the hook set is incomplete; see
[ADR-0008](https://github.com/adityabhalsod/trevixal-editor/blob/main/docs/adr/0008-extension-points.md).

## License

Apache-2.0
