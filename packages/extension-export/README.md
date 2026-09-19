# @trevixal/extension-export

<!-- generated: header -->

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/extension-export.svg)](https://www.npmjs.com/package/@trevixal/extension-export)
[![types](https://img.shields.io/npm/types/@trevixal/extension-export.svg)](https://www.npmjs.com/package/@trevixal/extension-export)
[![license](https://img.shields.io/npm/l/@trevixal/extension-export.svg)](https://github.com/adityabhalsod/trevixal-editor/blob/main/LICENSE)

[Documentation](https://trevixal-editor.vercel.app) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](https://github.com/adityabhalsod/trevixal-editor/blob/main/packages/extension-export/CHANGELOG.md) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

[![The Trevixal editor](https://trevixal-editor.vercel.app/media/editor.png)](https://trevixal-editor.vercel.app/full-editor)

## Features

- DOCX and RTF writers, and a dependency-free DOCX reader
- Exports carry the theme, code colours and diagrams the editor showed
- File download helpers that work in the browser and in Node
- **18.8 kB** minified and gzipped, with TypeScript types in the package

<!-- /generated: header -->

Word and Rich Text, out and in, with its own ZIP, XML, OOXML and RTF
implementations and no dependencies at all.

```sh
npm install @trevixal/extension-export
```

## Usage

```ts
import { serializeToDOCX, serializeToRTF, parseDOCX } from '@trevixal/extension-export'

const docx = await serializeToDOCX(editor.state.doc, { title: 'Report' })
const rtf = serializeToRTF(editor.state.doc)
const doc = await parseDOCX(editor.schema, file, { images: 'embed' })
```

Or as descriptors that plug into `@trevixal/ui`'s save and open plumbing:

```ts
import { exportFormats, importFormats } from '@trevixal/extension-export'
import { exportDocument } from '@trevixal/ui'

await exportDocument(editor, { exporters: [...builtinExporters(), ...exportFormats()] })
```

## It carries what the editor was showing

Both writers take a `theme` and a `rendered` bundle from `ExportContext`, so a
download is not a bleached copy of the document:

- **Colour.** DOCX writes `w:background`, and the `word/settings.xml` that
  makes Word actually draw it, which is stored and ignored without. RTF shades
  every paragraph and restates the ink after each `\\plain`, because `\\pard\\plain`
  resets the colour and a theme set once at the top would last one paragraph.
- **Highlighted code.** Syntax highlighting is a decoration layer, so a writer
  walking the model sees one plain string. `@trevixal/ui` captures the drawn
  runs and passes them here as coloured runs.
- **Diagrams.** A diagram preview is an element the renderer appends, not a
  node. It is rasterised and embedded, which meant giving RTF pictures at
  all (`\\pict\\pngblip`), so ordinary images now embed there too instead of
  degrading to `[alt]`. The drawing replaces the source it was drawn from,
  unless nothing managed to draw one.

## Also exported

The pieces are public, because they were written here and are useful on their
own: `createZip` / `readZip` / `crc32`, `parseXML` / `escapeXML`,
`downloadFile`, `suggestFileName`, `readFileText`, `readFileBytes`, and
`documentPalette` for turning theme tokens into an Office palette.

## License

Apache-2.0
