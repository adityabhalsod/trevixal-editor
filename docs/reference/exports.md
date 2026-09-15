# What an export carries

An export is a page, not a screenshot. Anything the editor drove with
JavaScript, and anything it *drew* rather than stored, has to be carried
deliberately. The kit does, end to end.

| Concern | How |
| --- | --- |
| **Theme** | `readThemeSnapshot` reads the resolved `--tvx-*` values off the live editor (whichever of preset, custom theme, host CSS or system preference won) and `ExportContext.theme` hands them to every exporter. HTML writes them as resolved values on `:root, .trevixal` (attributes alone lose a specificity coin-toss), paints `html, body`, sets `color-scheme`, and adds `print-color-adjust: exact` so "Save as PDF" keeps backgrounds. DOCX writes `w:background` plus the `word/settings.xml` that makes Word draw it; RTF shades every paragraph and restates the ink after each `\plain` |
| **Styles** | `collectDocumentCSS` serializes the editor's own rules from every stylesheet the page parsed, so a saved file does not depend on a dev server being up |
| **Highlighted code and diagrams** | Neither is in the document: highlighting is a decoration layer, a preview is an appended element. `captureRenderedBlocks` reads both back through `view.renderer.modelOf`, `rasterizeDiagrams` turns each SVG into a PNG for the binary formats, and `renderNode` on `serializeToHTML` emits them for the page. The drawing replaces the source it was drawn from; if nothing drew, the source stays |
| **Behaviour** | `documentBehaviourScript` is inlined: tab strips switch on click and arrow keys, and a YouTube frame becomes a link when the page is not served over http(s). Printing reveals every tab panel and open toggle |
| **Images in RTF** | `\pict\pngblip`, so ordinary images embed rather than degrading to `[alt]` |

## The pipeline in code

```ts
import { exportDocument, builtinExporters, captureRenderedBlocks, rasterizeDiagrams, readThemeSnapshot } from '@trevixal/ui'
import { exportFormats } from '@trevixal/extension-export'

await exportDocument(editor, {
  format: 'docx',
  exporters: [...builtinExporters(), ...exportFormats()],
  // These are what `mountFullEditor` passes; a custom chrome does the same.
  theme: readThemeSnapshot(editor),
  rendered: await rasterizeDiagrams(captureRenderedBlocks(editor)),
})
```

The same three readings (theme, rendered blocks, behaviour script) feed the
side-by-side preview, which is why the preview shows exactly what a download
would. See the [workspace extension](../extensions/workspace#split-view).

## What the browser suite checks

Exports carry the theme, the highlighting and the diagram to the page and to
Word; a saved page works when opened from disk; print preview prints the theme
and reveals tabs; a real `.docx` reads back; the exported stylesheet has no
empty declaration. Those are measured by rendering the real files, not by
reading the markup.
