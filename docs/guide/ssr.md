# Server rendering

The server renders the words; the browser attaches the editor to them.

## Why it works

Creating an editor touches no DOM. Without an `element` no view is built at
all, and nothing in `@trevixal/core` reads `window` or `document` at import
time, so the engine is importable in Node, in a Next route, in a CMS build
step.

```js
import { Schema, createEditor, defaultNodes, defaultMarks, serializeToHTML } from '@trevixal/core'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
const editor = createEditor({ schema, content: storedJson }) // no `element`
const html = serializeToHTML(editor.state.doc)
const words = editor.getWordCount()
editor.destroy()
```

No browser was involved in any of that, including the validation and the word
count.

## The schema has to match the document

`defaultNodes()` covers the blocks the core ships. A document written in the
full editor also holds tables, callouts, tasks, media and equations, and a
schema that has never heard of `tableCell` refuses to load one. Build the same
schema the browser will:

```js
import { createFullSchema } from '@trevixal/editor-kit'

const schema = createFullSchema()
```

Nothing in `@trevixal/editor-kit` reaches for the DOM as it loads, only
`mountFullEditor` does, so a Node process can import it, and the server and
the browser agree on what a document may contain by construction.


## The pattern

1. **Store** `editor.getJSON()`, canonical, schema-validated, stable.
2. **Render** it on the server with `serializeToHTML` and put it in the page.
3. **Attach** in the browser, over the markup that is already there.

Step 3 is one script tag with the web component, or `useEditor` and
`<EditorContent>` over the same JSON with a framework adapter.

The payoff is what a reader gets before any bundle loads: the document itself,
in the HTML, indexable and readable, and no flash of an empty box.

## A trap worth knowing

A custom element whose definition has already loaded upgrades the *instant*
its opening tag is seen, before the parser reaches the markup between the
tags. An element that reads `innerHTML` in `connectedCallback` therefore sees
nothing, and server-rendered content is lost.

`<trevixal-editor>` handles this: when it starts empty while the document is
still being parsed, it adopts whatever lands inside afterwards. Worth
remembering if you write custom elements of your own. The bug hides behind a
warm cache, which changes the timing.

A runnable version is in `examples/ssr`.
