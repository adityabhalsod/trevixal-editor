import type { EditorNode, Schema } from '@trevixal/core'
import { type DOCXImportOptions, parseDOCX } from './docx-reader'
import { type DOCXOptions, serializeToDOCX } from './docx-writer'
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

/** Every export target this package provides, in menu order. */
export function exportFormats(): DocumentExporter[] {
  return [docxExporter(), rtfExporter()]
}

/** Every import source this package provides, in menu order. */
export function importFormats(): DocumentImporter[] {
  return [docxImporter()]
}
