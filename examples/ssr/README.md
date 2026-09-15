# Server rendering

Node renders the document to HTML. The browser builds the whole editor over
it.

```sh
pnpm install
pnpm build                              # runs render.mjs
pnpm --filter @trevixal/example-ssr dev
```

The page this produces is the [full-editor example](../full-editor), to the
line: the same document, the same call, the same chrome. The only difference
is that the words were already on the page before the script ran.

## No browser on the server

[`render.mjs`](render.mjs) runs in plain Node. It imports the engine and the
kit, takes the document the showcase opens with, validates it against a schema
and serializes it, and never touches `window` or `document`, because **an
editor created without an `element` creates no view at all**:

```js
const editor = createEditor({ schema, content: stored })  // no element
const html = serializeToHTML(editor.state.doc)
const words = editor.getWordCount()
editor.destroy()
```

That is the whole SSR story, and it is the same in Next, Nuxt, SvelteKit or a
CMS build step: each of which has [an example of its own](..) showing how that
framework says "browser only".

## The schema has to be the kit's

`defaultNodes()` is not enough. A document this editor produced holds tables,
callouts, tasks, media and equations, and a schema that has never heard of
`tableCell` refuses to load one, loudly, which is the right failure. So the
server builds the same schema the browser will:

```js
import { createFullSchema } from '@trevixal/editor-kit'

const schema = createFullSchema()
```

Nothing in `@trevixal/editor-kit` reaches for the DOM as it loads, only
`mountFullEditor` does, so a Node process can import the package a client
bundle would, and the two agree on what a document may contain by construction
rather than by two lists kept in step by hand.

## The document travels twice

The generated page carries it in two shapes, and both are needed:

- **As HTML**, inside the element the editor will claim. A crawler, a reader on
  a slow connection and a browser with JavaScript off all get the words. All
  8 kB of them, tables and callouts included. The browser suite fetches the
  page as text and checks they are in there.
- **As JSON**, in a `<script type="application/json">`, because that is what
  the editor actually opens. Re-parsing the HTML would work, but it would be a
  lossy round trip of a document the server already had in canonical form.

`mountFullEditor` empties the element it is given, so the server's markup is
the page until the script runs and not a frame longer. It is styled with the
editor's own measure and padding so the words do not move sideways when the
real surface replaces them.

## The other way round

`<trevixal-editor>` takes the opposite approach: it adopts the HTML *already
inside it* as its initial content, parsed and sanitized on the way in, with no
JSON at all. That is a smaller page and a smaller build. See
[the vanilla guide](../../docs/guide/vanilla.md). Use it when the server's HTML
is the only copy of the document you have.

## License

Apache-2.0
