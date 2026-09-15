# Word and RTF, in and out

`@trevixal/extension-export`: DOCX and RTF writers and a DOCX reader, with
their own ZIP, XML, OOXML and RTF implementations and no dependencies at all.

```sh
npm install @trevixal/extension-export
```

## Direct calls

```ts
import { serializeToDOCX, serializeToRTF, parseDOCX } from '@trevixal/extension-export'

const docx = await serializeToDOCX(editor.state.doc, { title: 'Report', theme, rendered })
const rtf = serializeToRTF(editor.state.doc, { theme, rendered })
const doc = await parseDOCX(editor.schema, file, { images: 'embed' })
```

## As descriptors

`exportFormats()` and `importFormats()` return descriptors (`name`, `label`,
`extension`, `mime`, `serialize` or `parse`) that plug straight into the UI
kit's save and open plumbing:

```ts
import { exportFormats, importFormats } from '@trevixal/extension-export'
import { builtinExporters, exportDocument } from '@trevixal/ui'

await exportDocument(editor, { exporters: [...builtinExporters(), ...exportFormats()] })
```

## It carries what the editor was showing

Both writers take a `theme` and a `rendered` bundle from `ExportContext`, so
a download is not a bleached copy of the document:

- **Colour.** DOCX writes `w:background` and the `word/settings.xml` that
  makes Word actually draw it, which is stored and ignored without. RTF shades
  every paragraph and restates the ink after each `\plain`, because
  `\pard\plain` resets the colour and a theme set once at the top would last
  one paragraph.
- **Highlighted code.** Syntax highlighting is a decoration layer, so a writer
  walking the model sees one plain string. `@trevixal/ui` captures the drawn
  runs and passes them here as coloured runs.
- **Diagrams.** A diagram preview is an element the renderer appends, not a
  node. It is rasterised and embedded, which meant giving RTF pictures at all
  (`\pict\pngblip`), so ordinary images embed there too instead of degrading
  to `[alt]`. The drawing replaces the source it was drawn from, unless
  nothing managed to draw one.

The full picture of how the UI kit gathers these is on
[What an export carries](../reference/exports).

## Also exported

The pieces are public, because they were written here and are useful on their
own: `createZip`, `readZip`, `crc32`, `parseXML`, `escapeXML`,
`downloadFile`, `suggestFileName`, `readFileText`, `readFileBytes`, and
`documentPalette` for turning theme tokens into an Office palette. A
malformed archive raises `ArchiveError` rather than a generic failure.
