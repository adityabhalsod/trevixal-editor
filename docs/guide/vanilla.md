# No build step

One stylesheet, one script, one custom element.

```html
<link rel="stylesheet" href="https://unpkg.com/@trevixal/ui/styles.css" />
<script src="https://unpkg.com/@trevixal/web-component"></script>

<div class="trevixal">
  <trevixal-editor placeholder="Start typing…">
    <h2>Hello</h2>
    <p>This content is parsed <em>and sanitized</em> on the way in.</p>
  </trevixal-editor>
</div>

<script>
  const element = document.querySelector('trevixal-editor')
  element.addEventListener('trevixal-change', (event) => {
    console.log(event.detail.json) // store this
    console.log(event.detail.html) // an export format
  })
</script>
```

That is the whole integration. No npm, no bundler, no framework.

## The element

| Surface | Detail |
| --- | --- |
| Attributes | `placeholder`, `readonly` (observed, flipping it toggles editability), `autofocus` |
| Initial content | The element's HTML children, sanitized on parse |
| Event | `trevixal-change`, a bubbling `CustomEvent<{ json, html }>` |
| Properties | `value` (HTML in and out), `getJSON()`, `setJSON(json)`, `editor`, `schema`, `nodeViews` |

`editor` is the full engine, so everything in `@trevixal/core` is reachable
from a page with no build step at all.

## Your own nodes

```js
import { Schema, defaultNodes, defaultMarks } from '@trevixal/core'
import { tableNodes } from '@trevixal/extension-table'

element.schema = new Schema({
  nodes: { ...defaultNodes(), ...tableNodes() },
  marks: defaultMarks(),
})
```

Set `schema` before the element is connected where you can. Assigning to a
live editor rebuilds it, carrying the document across as HTML. Anything the
new schema cannot parse is dropped, which is the honest outcome when the rules
a document was written under have changed.

## Server-rendered content

The element handles being upgraded before the parser has reached its children,
which is what happens when the script is in `<head>`. Content you render on a
server survives. See [Server rendering](./ssr).

A runnable version is in `examples/vanilla-cdn`.
