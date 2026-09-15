/**
 * Server-side rendering, with no browser anywhere.
 *
 * This file runs in plain Node. It imports the engine, takes the same document
 * the [full-editor example](../full-editor) opens with, validates it against a
 * schema and serializes it to HTML, and never touches `window`, `document` or
 * the DOM, because creating an editor without an `element` creates no view at
 * all.
 *
 * That is the whole SSR story for an editor, and it is the same in Next, Nuxt,
 * SvelteKit or a CMS build step: **the server renders the content, the browser
 * builds the editor over it**. Nothing here is specific to a framework, which
 * is why this example does not pull one in.
 *
 * What the browser then builds is the full-editor example, to the line: the
 * same call, the same document, the same chrome. The only difference is that
 * the words were on the page before the script ran.
 *
 * The page it writes carries the document twice, on purpose:
 *
 *   - as **HTML**, inside the element the editor will claim, so a crawler, a
 *     reader on a slow connection and a browser with JavaScript off all get
 *     the words; and
 *   - as **JSON**, in a `<script type="application/json">`, because that is
 *     what the editor actually opens. Re-parsing the HTML would work, but it
 *     would be a lossy round trip of a document the server already had in its
 *     canonical shape.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEditor, serializeToHTML } from '../../packages/core/dist/index.js'
// The kit's own schema and demo document, imported in Node. Nothing in
// `@trevixal/editor-kit` reaches for the DOM as it loads, only
// `mountFullEditor` does, and that is called from the browser below, so a
// server can read the same package a client bundle would.
//
// The schema has to be the kit's and not `defaultNodes()`: a kit document
// holds tables, callouts, tasks, media and equations, and a schema that has
// never heard of `tableCell` refuses to load one.
import { createFullSchema, initialContent } from '../../packages/editor-kit/dist/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const schema = createFullSchema()

// A document from your database, in the canonical JSON shape.
const stored = initialContent

// No `element`: the engine runs headless, and the view is never constructed.
const editor = createEditor({ schema, content: stored })
const html = serializeToHTML(editor.state.doc)
const words = editor.getWordCount()
editor.destroy()

/** `</script>` inside a JSON string would close the tag it is sitting in. */
const embed = (value) => JSON.stringify(value).replace(/</g, '\\u003c')

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Trevixal, server-rendered</title>
    <link rel="stylesheet" href="./vendor/ui-styles.css" />
    <link rel="stylesheet" href="./vendor/kit-styles.css" />
    <script src="./vendor/trevixal-editor-kit.js" defer></script>
    <style>
      body { margin: 0; }
      /* Before the script runs, the server's HTML stands in for the editor.
         It is given the editor's own measure and padding so the words do not
         move sideways when the real surface replaces them. */
      #app > .trevixal-content {
        max-width: 84rem;
        margin: 2.5rem auto;
        padding: 0 1rem;
      }
    </style>
  </head>
  <body class="trevixal">
    <!--
      The words are in here as HTML, and they are what a crawler sees. The
      editor claims this element on load and empties it first, so this markup
      is the page until the script has run and not a frame longer.
    -->
    <div id="app"><div class="trevixal-content">${html}</div></div>

    <script type="application/json" id="document">${embed(stored)}</script>
    <script>
      window.addEventListener('DOMContentLoaded', () => {
        TrevixalKit.mountFullEditor({
          element: document.querySelector('#app'),
          content: JSON.parse(document.querySelector('#document').textContent),
          namespace: 'trevixal:ssr',
          aboutRows: [
            { term: 'Example', description: 'ssr, every package the workspace ships' },
            { term: 'Framework', description: 'None: ${words} words rendered by Node, mounted in the browser' },
          ],
        })
      })
    </script>
  </body>
</html>
`

await mkdir(join(here, 'dist'), { recursive: true })
await writeFile(join(here, 'dist/index.html'), page)

// The three files the page loads. A published page would take them from a CDN.
const { copyFile } = await import('node:fs/promises')
const root = join(here, '../..')
await mkdir(join(here, 'dist/vendor'), { recursive: true })
for (const [from, to] of [
  ['packages/ui/dist/styles.css', 'ui-styles.css'],
  ['packages/editor-kit/dist/styles.css', 'kit-styles.css'],
  ['packages/editor-kit/dist/trevixal-editor-kit.iife.js', 'trevixal-editor-kit.js'],
]) {
  await copyFile(join(root, from), join(here, 'dist/vendor', to))
}

console.log(`rendered ${words} words to dist/index.html without a DOM`)
