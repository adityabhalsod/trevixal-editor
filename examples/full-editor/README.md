# Full editor example

Every package in the workspace, assembled into one page: the editing chrome,
the document features, and the things that sit around a document rather than
inside it, themes, autosave, protection and a workspace of several documents.

The code is one file, and most of it is comments:

```ts
import { mountFullEditor } from '@trevixal/editor-kit'
import '@trevixal/ui/styles.css'
import '@trevixal/editor-kit/styles.css'

mountFullEditor({ element: document.querySelector('#app') })
```

The assembly itself (the schema, the twenty extensions, the menus, the
panels, the panes) lives in [`@trevixal/editor-kit`](../../packages/editor-kit),
so it can be read once and mounted from any framework. The
[other examples](..) do the same call from React, Next.js, Vue, Nuxt, Svelte,
SvelteKit, Angular and Solid; what changes between them is the lifecycle hook,
and nothing else.

## Installable, and offline

The built page is an installable app. `public/manifest.webmanifest` names it,
and the build writes `sw.js`, a service worker that caches the page and every
file the build made, the language catalogues and the export worker included.
After one visit with a network, the editor opens and works with none, and the
browser offers to install it. [`service-worker.ts`](service-worker.ts) holds
its source, and the plugin in [`vite.config.ts`](vite.config.ts) writes the
build's own file list into it, so each build is a new worker. The dev server
registers no worker, since its modules are no app shell.

## Run it

```sh
pnpm install
pnpm build   # required: the packages resolve through dist/, which is gitignored
pnpm --filter @trevixal/example-full-editor dev
```

## The chrome

- **Menubar**: File, Edit, Insert, Format, Tools, Table, View, Help
- **Toolbar**: block format, font family and size, marks, lists and indent,
  alignment, text and background color, link/image/table inserts, undo/redo.
  Groups drag into a new order, by mouse or from the keyboard, and the
  arrangement is remembered.
- **Command palette**: `Mod-K`, built from the menus as actually wired, so it
  cannot drift out of step with them
- **Slash commands**: `/table`, `/image`, `/code` and the rest, from a popup
  at the caret; `:smi` does the same for emoji
- **Dialogs**: link, image, source code, special characters, word count,
  custom CSS, custom theme, font, writing goal, password, restrictions
- **Sidebar**: table of contents, document outline, undo history and the
  workspace panel. It arrives with the first panel opened and leaves with the
  last one closed.
- **Status bar**: element path and live counts, plus save state, upload
  progress, protection and an offline indicator

## The document

Tables, including sort, borders, cell background and CSV. Images with crop,
rotate and captions. Video, audio, embeds and file attachments. Equations and
Mermaid diagrams. Callouts, tabs, accordions, columns and timelines. Task
lists, footnotes and citations. Code blocks with syntax highlighting and a
language selector.

The tour it opens with shows the tools for longer documents in its own text,
and names the menus for the ones a document cannot show:

- **Long documents**: numbered captions, a cross-reference that follows what
  it names, a list of tables, an index built from marked words, endnotes and
  a right-to-left paragraph. Heading numbering and line numbers are under
  *Format*, and every block has a menu on its grip.
- **Formatting**: a paragraph style and a character style from the Styles
  pane, a drop cap, a bordered and shaded paragraph, and tab stops with dot
  leaders. Smart quotes, dashes and AutoCorrect work as you type. Text
  columns, hyphenation, and widow and orphan control are under *Format*.
- **Lists and tables**: tasks with assignees, due dates and a done count, a
  folded list item, a list to sort, and a multilevel list of the document's
  own. A captioned table with its header row frozen, wide cell padding, a
  cell aligned to the middle and a table inside a cell. Its header row heads
  every printed page it runs onto.
- **Tables as data**: a total that a formula adds up, costs in a currency
  column, and a timetable with cells merged down a column. Filtering rows and
  drawing a chart are under *Table*.
- **Media**: an image gallery that opens each picture full size, and a
  whiteboard drawing to draw on. The camera, screen and audio captures and
  video chapters are under *Insert*, and a new image asks for its alt text.
- **Code and equations**: a titled code block with numbered lines and one
  picked out, a terminal session, a chemical equation and a numbered display
  equation. Diffs, code to run, Graphviz and PlantUML are under *Insert*.
- **Review, blocks and forms**: a comment thread with a reply that mentions
  someone, a sticky note in the margin, a poll, a paragraph shown only while
  a template variable says so, and a text box, a tick box and a drop-down to
  fill in. Its printed pages carry a numbered footer.
- **Named with their menus**: links to any block, wiki links and backlinks,
  versions and comparing, redaction, locked sections, signatures and the
  audit log, page setup and section breaks, presenting as slides, the
  chrome's languages, toolbar presets, theme files, the dyslexia-friendly
  font, the writing checks and assistant, synonyms, the accessibility check,
  citation styles, snippets, macros and several carets.

## Around the document

- **Workspace**: several documents in tabs, kept in `localStorage`
- **Split view**: a live preview pane, or a second editing surface on the
  same document
- **Track changes**: suggestion mode with a review bar
- **Writing checks**: readability, passive voice, repeated words, keyword
  density, and a word-count goal
- **Themes**: light, dark and the presets, with a custom-theme dialog. The
  page around the editor follows the editor, so the demo is not left white
  while the editor goes dark.
- **Autosave, draft recovery and local backups**
- **Protection**: a password, an expiry, and copy/download restrictions.
  None of it is persisted: a reload starts unprotected, as a demo should.
- **Export**: `.txt`, `.md`, `.html`, `.docx`, `.rtf`, and PDF through the
  browser's print dialog; Word and Markdown import
- **Read-only mode**, focus mode and fullscreen

The pane under the editor shows the HTML a download would produce, styles,
theme, highlighted code and drawn diagrams included.

## Storage

A fallback chain: it tries `POST /api/uploads` and, since this static page has
no server, falls back to inlining the image as a data URL. Pass
`uploadEndpoint` to point it at your own, or read
[`src/mount.ts`](../../packages/editor-kit/src/mount.ts) and swap in
`createS3PresignedStorage` to upload straight to S3/R2/GCS. See the
[image extension](../../packages/extension-image).

## License

Apache-2.0
