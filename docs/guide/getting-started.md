# Getting started

Trevixal is an editing **engine**, not a finished editor. You assemble the
parts you need: a core that owns the document, an optional chrome, and
extensions for anything beyond paragraphs and lists.

## Install

```sh
npm install @trevixal/core @trevixal/ui
```

Pick an adapter if you use a framework ([React](./react), [Vue](./vue),
[Svelte](./svelte), [Angular](./angular)) or [none at all](./vanilla).

If you would rather not assemble anything, [the whole editor](./full-editor)
is one call: every extension, the chrome and the panels, already wired.

::: info The first release
The packages publish to npm as `1.0.0` through the repository's release
workflow. If `npm view @trevixal/core` still answers 404, that release has not
run yet: clone the repository and build against the workspace, as every app in
`examples/` does. [Development](../contributing/development) has the steps.
:::

## The smallest thing that works

```ts
import { createEditor, Schema, defaultNodes, defaultMarks } from '@trevixal/core'

const editor = createEditor({
  schema: new Schema({ nodes: defaultNodes(), marks: defaultMarks() }),
  element: document.querySelector('#editor'),
  placeholder: 'Write something…',
  onChange: ({ json }) => save(json),
})
```

That is a working editor: typing, marks, lists, undo, paste with sanitizing,
and markdown-style shortcuts. No chrome yet. Nothing is drawn but the text.

## Adding the chrome

```ts
import { createEditorUI } from '@trevixal/ui'
import '@trevixal/ui/styles.css'

createEditorUI(editor, { container: document.querySelector('#chrome') })
```

One call mounts a menubar, a grouped toolbar, dialogs and a status bar. It
depends on **none** of the extension packages: you pass in the capabilities
you have, and a menu entry whose action you did not supply is dropped rather
than left as a dead switch.

```ts
import { tableUICommands } from '@trevixal/extension-table'

createEditorUI(editor, {
  container,
  tableCommands: tableUICommands(),   // now the Table menu exists
  images: { pickFiles, insertImage }, // now the image button works
})
```

## What you store

```ts
editor.getJSON()   // canonical, schema-validated, store this
editor.getHTML()   // an export format
editor.getText()
```

HTML is a way out, not a way to keep things. JSON round-trips exactly,
validates against your schema, and can be transformed on a server without a
browser.

## Where to go next

- **[Concepts](../concepts/state)**: what a document, a transaction and a
  decoration actually are. Worth twenty minutes before you write an extension.
- **[Write a callout extension](../extending/callout)**, a new block type,
  end to end, in about eighty lines.
- **[Using the editor](../using/)**: every menu, key and file format, from the
  reader's side of the screen.
- **[Extensions](../extensions/)**: one page per package, with the decisions
  behind each.
- **[Playground](../playground)**: the editor, running on this page.
