/**
 * Reading a file into the document, and writing the document out to one.
 *
 * Both halves go through the same two lists, the formats this build can
 * read and the formats it can write, so they are built once here and the
 * two verbs close over them. Both also have to ask the document's protection
 * first: an encrypted file is opened rather than imported, and a document
 * that forbids downloading says so instead of producing a file.
 */
import type { Editor } from '@trevixal/core'
import { exportFormats, importFormats } from '@trevixal/extension-export'
import {
  acceptFor,
  builtinExporters,
  builtinImporters,
  collectDocumentCSS,
  exportDocument,
  importFile,
  openInfoDialog,
  pickFile,
} from '@trevixal/ui'
import type { DocumentSecurity } from './security'

/**
 * The four of `DocumentSecurity`'s nine that opening and downloading use.
 * A whole `DocumentSecurity` satisfies it.
 */
export type FileActionsSecurity = Pick<
  DocumentSecurity,
  'allows' | 'downloadEncrypted' | 'openEncrypted' | 'report'
>

export interface FileActions {
  /** Ask for a file and put it on screen, whatever format it turns out to be. */
  openDocument(): Promise<void>
  /** Write the document out as `format`, or just the selection. */
  download(format: string, selectionOnly?: boolean): Promise<void>
}

export function createFileActions(editor: Editor, security: FileActionsSecurity): FileActions {
  // The kit ships HTML, Markdown, text and JSON; the export package adds the
  // two Office formats, and the DOCX reader that imports Word documents.
  const exporters = [...builtinExporters({ styles: collectDocumentCSS }), ...exportFormats()]
  const importers = [...builtinImporters(), ...importFormats()]

  async function openDocument(): Promise<void> {
    const file = await pickFile(document, `${acceptFor(importers)},.tvx`)
    if (!file) return
    // A `.tvx` is JSON too, so the envelope check has to come before the
    // importers, otherwise the JSON importer happily loads the ciphertext.
    if (await security.openEncrypted(file)) return
    const ok = await importFile(editor, file, importers)
    if (!ok) {
      await openInfoDialog({
        document,
        title: 'Unsupported file',
        body: `Nothing here can read “${file.name}”. Try HTML, Markdown, plain text, Word, Trevixal JSON or an encrypted .tvx.`,
      })
    }
  }

  async function download(format: string, selectionOnly = false): Promise<void> {
    if (!security.allows('download')) {
      security.report('Downloading is blocked for this document')
      return
    }
    if (format === 'encrypted') {
      await security.downloadEncrypted()
      return
    }
    const exporter = exporters.find((entry) => entry.name === format)
    if (!exporter) {
      await openInfoDialog({
        document,
        title: 'Format not installed',
        body: `This build has no ${format.toUpperCase()} exporter. Install @trevixal/extension-export and pass its formats to the demo.`,
      })
      return
    }
    await exportDocument(editor, exporter, document, { selectionOnly })
  }

  return { openDocument, download }
}
