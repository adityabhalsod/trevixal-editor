# Extensions

Extensions are ordinary packages built on the engine's public API. Nothing in
them reaches into private code, and every one of them is built on the same
[four hooks](../concepts/extension-points): schema merging, `onTransaction`,
`addDispatchTransform` and `setDecorationLayer`, plus `keymap`, `inputRules`,
`nodeViews` and the suggestion trigger module.

Two kinds:

- **Schema extensions** export node or mark specs you merge into your
  `Schema`: `tableNodes()`, `imageNodes()`, `blockNodes()`, `embedNodes()`,
  `mathNodes()`, `trackChangesMarks()`.
- **Behaviour extensions** attach to an editor and return a controller or a
  disposer: `image(editor, ...)`, `codeHighlight(editor, ...)`,
  `diagram(editor, ...)`, `createWritingAssistant(editor, ...)`, `new
  TrackChanges(editor, ...)`.

Each page below covers one package: what it adds, the calls, and the
decisions behind it that are worth knowing before you rely on them.

| Package | Adds |
| --- | --- |
| [`@trevixal/extension-table`](./table) | Tables: structure, merge and split, header row, alignment, background, borders, sort, resize, CSV in and out, text to table and back |
| [`@trevixal/extension-image`](./image) | Images: pluggable storage, drag/paste/pick upload with progress and cancellation, resize, crop, rotate, compress, captions, alignment, a floating toolbar |
| [`@trevixal/extension-blocks`](./blocks) | Callouts, toggles, columns, cards, timelines, page breaks, badges, buttons, footnotes, tabs, accordions, citations and reference lists, anchors |
| [`@trevixal/extension-embed`](./embed) | Video, audio, YouTube and Vimeo, allowlisted iframes, file attachments, link preview cards |
| [`@trevixal/extension-math`](./math) | LaTeX to MathML for inline and display equations, the `$...$` input rule, a pluggable renderer |
| [`@trevixal/extension-diagram`](./diagram) | Live diagram previews under code blocks through any renderer; a Mermaid adapter and lazy loader included |
| [`@trevixal/extension-export`](./export) | DOCX and RTF writers and a DOCX reader, with their own ZIP and XML implementations |
| [`@trevixal/extension-security`](./security) | PBKDF2 and AES-GCM document encryption with expiry, an encrypted storage wrapper, restrictions |
| [`@trevixal/extension-writing`](./writing) | Readability, passive voice, repeated words, long sentences, grammar, keyword density, goals, spell-check toggle |
| [`@trevixal/extension-workspace`](./workspace) | A document store with folders and templates, a tab strip, a workspace panel, a split preview or mirrored editor |
| [`@trevixal/extension-track-changes`](./track-changes) | Suggestion mode: attributed, timestamped insertions and deletions; accept and reject; a review bar |
| [`@trevixal/extension-code-highlight`](./code-highlight) | Twelve bundled languages behind one `Highlighter` interface, language detection, copy-code buttons |
| [`@trevixal/extension-format-code`](./format-code) | JSON and XML pretty-printing and minification, in place |
| [`@trevixal/extension-slash-command`](./slash-command) | The `/` menu: fuzzy filtering, keyboard-first, an extensible item list |
| [`@trevixal/extension-emoji`](./emoji) | The `:` picker with 114 built-in emoji and search |

Every one has no runtime dependencies, declares `@trevixal/core` as a peer
dependency, and ships ESM, CJS and type declarations. The assembled
[`@trevixal/editor-kit`](../guide/full-editor) wires all fifteen together; if
you want to see every call below made once, in order, read its
[`mount.ts`](https://github.com/adityabhalsod/trevixal-editor/blob/main/packages/editor-kit/src/mount.ts).

To write one of your own, start with [the callout tutorial](../extending/callout).
