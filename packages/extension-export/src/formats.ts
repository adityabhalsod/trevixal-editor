import type { EditorNode, Schema } from '@trevixal/core'
import { parseExportArchive } from './archive-import'
import { type DOCXImportOptions, parseDOCX } from './docx-reader'
import { type DOCXOptions, serializeToDOCX } from './docx-writer'
import { serializeToEPUB } from './epub'
import { serializeToLaTeX } from './latex'
import { parseODT, serializeToODT } from './odt'
import { type PdfJsLike, loadPdfJs, parsePDF } from './pdf'
import { serializeToPPTX } from './pptx'
import type { RenderedDocument } from './rendered'
import { type RTFOptions, serializeToRTF } from './rtf'
import type { ThemeTokens } from './theme'

/**
 * One "Save as…" target. The descriptor carries everything a menu needs,
 * label, extension and MIME type, so the UI can build its export list
 * without knowing which formats exist.
 */
export interface DocumentExporter {
  readonly name: string
  readonly label: string
  readonly extension: string
  readonly mime: string
  serialize(
    doc: EditorNode,
    context: ExportContext,
  ): string | Uint8Array | Promise<string | Uint8Array>
}

/** What an exporter needs beyond the document: its schema, a title, a theme. */
export interface ExportContext {
  readonly schema: Schema
  readonly title: string
  /**
   * The palette the editor is rendering in. `@trevixal/ui` reads it off the
   * live editor and passes it here, so a download matches what the author was
   * looking at. The shape matches its `ThemeSnapshot`.
   */
  readonly theme?: { readonly tokens?: ThemeTokens }
  /**
   * What the editor drew that the document does not hold, highlighted code
   * and rendered diagrams, captured by `@trevixal/ui` off the live editor.
   */
  readonly rendered?: RenderedDocument
}

/** The mirror of {@link DocumentExporter} for reading a picked file back in. */
export interface DocumentImporter {
  readonly name: string
  readonly label: string
  readonly extensions: readonly string[]
  parse(file: File, context: ImportContext): Promise<EditorNode>
}

/**
 * The schema an importer must produce nodes for, plus the `document` an
 * HTML-based importer would parse against: absent outside a browser.
 */
export interface ImportContext {
  readonly schema: Schema
  readonly document?: Document
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const DOCX_LABEL = 'Word document (.docx)'

/** The `.docx` export target; `options` tune the package the writer emits. */
export function docxExporter(options: DOCXOptions = {}): DocumentExporter {
  return {
    name: 'docx',
    label: DOCX_LABEL,
    extension: 'docx',
    mime: DOCX_MIME,
    serialize: (doc, context) =>
      serializeToDOCX(doc, {
        title: context.title,
        theme: context.theme?.tokens,
        ...(context.rendered ? { rendered: context.rendered } : {}),
        ...options,
      }),
  }
}

/** The `.rtf` export target, for readers that cannot open OOXML. */
export function rtfExporter(options: RTFOptions = {}): DocumentExporter {
  return {
    name: 'rtf',
    label: 'Rich text (.rtf)',
    extension: 'rtf',
    mime: 'application/rtf',
    serialize: (doc, context) =>
      serializeToRTF(doc, {
        theme: context.theme?.tokens,
        ...(context.rendered ? { rendered: context.rendered } : {}),
        ...options,
      }),
  }
}

/** The `.docx` import source, reading a picked file into the target schema. */
export function docxImporter(options: DOCXImportOptions = {}): DocumentImporter {
  return {
    name: 'docx',
    label: DOCX_LABEL,
    extensions: ['docx'],
    parse: (file, context) => parseDOCX(context.schema, file, options),
  }
}

const ODT_MIME = 'application/vnd.oasis.opendocument.text'
const ODT_LABEL = 'OpenDocument text (.odt)'

/** The `.odt` export target, for LibreOffice and anything else that reads OpenDocument. */
export function odtExporter(): DocumentExporter {
  return {
    name: 'odt',
    label: ODT_LABEL,
    extension: 'odt',
    mime: ODT_MIME,
    serialize: (doc, context) => serializeToODT(doc, { title: context.title }),
  }
}

/** The `.epub` export target: a book of chapters, one per level-one heading. */
export function epubExporter(): DocumentExporter {
  return {
    name: 'epub',
    label: 'EPUB book (.epub)',
    extension: 'epub',
    mime: 'application/epub+zip',
    serialize: (doc, context) =>
      serializeToEPUB(doc, globalThis.document, { title: context.title }),
  }
}

/** The `.tex` export target: LaTeX source for an `article`. */
export function latexExporter(): DocumentExporter {
  return {
    name: 'latex',
    label: 'LaTeX (.tex)',
    extension: 'tex',
    mime: 'application/x-tex',
    serialize: (doc) => serializeToLaTeX(doc),
  }
}

/** The `.pptx` export target: a slide for each top-level heading. */
export function pptxExporter(): DocumentExporter {
  return {
    name: 'pptx',
    label: 'PowerPoint (.pptx)',
    extension: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    serialize: (doc, context) => serializeToPPTX(doc, { title: context.title }),
  }
}

/** The `.odt` import source. */
export function odtImporter(): DocumentImporter {
  return {
    name: 'odt',
    label: ODT_LABEL,
    extensions: ['odt'],
    parse: (file, context) => parseODT(context.schema, file),
  }
}

/** What Notion and Google Docs export as a `.zip`: Markdown or HTML pages and their pictures. */
export function archiveImporter(): DocumentImporter {
  return {
    name: 'archive',
    label: 'Notion or Google Docs export (.zip)',
    extensions: ['zip'],
    parse: (file, context) =>
      parseExportArchive(context.schema, file, context.document ?? globalThis.document),
  }
}

/**
 * A PDF's text layer, read through PDF.js, which is fetched the first time a
 * PDF is opened; `load` supplies another copy of it.
 */
export function pdfImporter(load: () => Promise<PdfJsLike> = () => loadPdfJs()): DocumentImporter {
  let pdfjs: Promise<PdfJsLike> | null = null
  return {
    name: 'pdf',
    label: 'PDF text (.pdf)',
    extensions: ['pdf'],
    parse: async (file, context) => {
      pdfjs ??= load()
      return parsePDF(context.schema, file, await pdfjs)
    },
  }
}

/** Every export target this package provides, in menu order. */
export function exportFormats(): DocumentExporter[] {
  return [
    docxExporter(),
    rtfExporter(),
    odtExporter(),
    epubExporter(),
    latexExporter(),
    pptxExporter(),
  ]
}

/** Every import source this package provides, in menu order. */
export function importFormats(): DocumentImporter[] {
  return [docxImporter(), odtImporter(), pdfImporter(), archiveImporter()]
}
