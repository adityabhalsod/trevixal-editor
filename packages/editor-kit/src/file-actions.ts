/**
 * Reading a file into the document, and writing the document out to one.
 *
 * Both halves go through the same two lists, the formats this build can
 * read and the formats it can write, so they are built once here and the
 * two verbs close over them. Both also have to ask the document's protection
 * first: an encrypted file is opened rather than imported, and a document
 * that forbids downloading says so instead of producing a file.
 */
import { type Editor, type EditorNode, insertContent, nodeFromJSON } from '@trevixal/core'
import {
  type ZipEntry,
  createZip,
  downloadFile,
  exportFormats,
  importFormats,
  suggestFileName,
} from '@trevixal/extension-export'
import {
  MergeFileError,
  type MergeRow,
  mergeDocument,
  parseMergeRows,
  rowName,
  serializeToPDFForm,
} from '@trevixal/extension-forms'
import type { WorkspaceStore } from '@trevixal/extension-workspace'
import {
  acceptFor,
  brokenInternalLinks,
  builtinExporters,
  builtinImporters,
  checkLinks,
  clipWebPage,
  collectDocumentCSS,
  compareDocuments,
  exportDocument,
  fetchPageHTML,
  importFile,
  openComparison,
  openConfirmDialog,
  openDialog,
  openInfoDialog,
  openLinkReport,
  pickFile,
  readDocumentFile,
} from '@trevixal/ui'
import { createWorkerSerializer } from './export-client'
import { readerCopy } from './reader-copy'
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
  /** Ask for a file and show how it differs from the document, side by side. */
  compareWithFile(): Promise<void>
  /** Ask for a web address and clip the page's article in at the caret. */
  importFromURL(): Promise<void>
  /** Ask for a folder and a format, and download its documents in one archive. */
  exportFolder(store: WorkspaceStore): Promise<void>
  /** Ask for a CSV or JSON file and a format, and download a document per row. */
  mailMerge(): Promise<void>
}

export function createFileActions(
  editor: Editor,
  security: FileActionsSecurity,
  fetchPage: (url: string) => Promise<string> = fetchPageHTML,
): FileActions {
  // The kit ships HTML, Markdown, text and JSON; the export package adds the
  // two Office formats, and the DOCX reader that imports Word documents.
  const exporters = [
    ...builtinExporters({ styles: collectDocumentCSS }),
    ...exportFormats(),
    // The document as a PDF that opens ready to fill in, its fields real form fields.
    {
      name: 'pdfForm',
      label: 'Fillable PDF form (.pdf)',
      extension: 'pdf',
      mime: 'application/pdf',
      serialize: (doc: EditorNode, context: { title: string }) =>
        serializeToPDFForm(doc, { title: context.title }),
    },
  ]
  const importers = [...builtinImporters(), ...importFormats()]
  // Word, OpenDocument, RTF, LaTeX and PowerPoint are written in a worker, so
  // a long document downloads without freezing the page.
  const serialize = createWorkerSerializer()

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
    // A link to a place that is not in the document goes nowhere in the
    // file either: say so before writing it, and offer to look.
    const broken = brokenInternalLinks(editor.state.doc)
    if (broken.length > 0) {
      const count = broken.length === 1 ? 'One link points' : `${broken.length} links point`
      const go = await openConfirmDialog({
        document,
        title: 'Links that go nowhere',
        body: `${count} at nothing in this document, so it will not work in the file either.`,
        confirmLabel: 'Export anyway',
        cancelLabel: 'Review links',
      })
      if (!go) {
        openLinkReport(document, editor, await checkLinks(editor.state.doc))
        return
      }
    }
    // A reader's copy: conditional content settled, redacted words replaced.
    await exportDocument(editor, exporter, document, {
      selectionOnly,
      transform: readerCopy,
      serialize,
    })
  }

  async function compareWithFile(): Promise<void> {
    const file = await pickFile(document, acceptFor(importers))
    if (!file) return
    const other = await readDocumentFile(file, importers, { schema: editor.schema, document })
    if (!other) {
      await openInfoDialog({
        document,
        title: 'Unsupported file',
        body: `Nothing here can read “${file.name}” to compare it.`,
      })
      return
    }
    await openComparison(compareDocuments(editor.state.doc, other), {
      document,
      title: 'Compare with a file',
      beforeLabel: 'This document',
      afterLabel: file.name,
    })
    editor.view?.focus()
  }

  async function importFromURL(): Promise<void> {
    const values = await openDialog({
      document,
      title: 'Import from a web address',
      submitLabel: 'Import',
      body: 'The page’s article comes in at the caret, without its menus and sidebars.',
      fields: [
        { name: 'url', label: 'Web address', type: 'url', required: true, placeholder: 'https://' },
      ],
    })
    editor.view?.focus()
    const url = values?.url?.trim()
    if (!url) return
    try {
      const clipped = clipWebPage(await fetchPage(url), url, editor.schema, document)
      editor.exec(insertContent(clipped.content.children))
    } catch (error) {
      await openInfoDialog({
        document,
        title: 'The page could not be imported',
        body: `${url} could not be read: ${error instanceof Error ? error.message : String(error)}. A page that does not allow it can only be fetched through a server.`,
      })
    }
  }

  async function exportFolder(store: WorkspaceStore): Promise<void> {
    if (!security.allows('download')) {
      security.report('Downloading is blocked for this document')
      return
    }
    const folders = store.folders()
    const writable = exporters.filter((exporter) => exporter.name !== 'htmlSingle')
    const values = await openDialog({
      document,
      title: 'Download a workspace folder',
      submitLabel: 'Download',
      body: 'Every document in the folder, and in the folders inside it, in one .zip.',
      fields: [
        {
          name: 'folder',
          label: 'Folder',
          type: 'select',
          value: '',
          options: [
            { value: '', label: 'The whole workspace' },
            ...folders.map((folder) => ({ value: folder, label: folder })),
          ],
        },
        {
          name: 'format',
          label: 'Each document as',
          type: 'select',
          value: 'markdown',
          options: writable.map((exporter) => ({ value: exporter.name, label: exporter.label })),
        },
      ],
    })
    editor.view?.focus()
    const exporter = writable.find((entry) => entry.name === values?.format)
    if (!values || !exporter) return
    const folder = values.folder ?? ''
    const inside = (path: string | null): boolean =>
      !folder || path === folder || (path ?? '').startsWith(`${folder}/`)
    const entries: ZipEntry[] = []
    const taken = new Set<string>()
    for (const meta of store.list().filter((entry) => inside(entry.folder))) {
      const record = await store.get(meta.id)
      if (!record) continue
      const doc = readerCopy(nodeFromJSON(editor.schema, record.doc))
      const data = await exporter.serialize(doc, { schema: editor.schema, title: meta.title })
      // Paths inside the archive keep the folders under the one chosen.
      const within = (meta.folder ?? '').slice(folder ? folder.length + 1 : 0)
      const base = suggestFileName(meta.title, exporter.extension)
      let name = within ? `${within}/${base}` : base
      for (let n = 2; taken.has(name); n++) name = name.replace(/(\.[^.]+)$/, `-${n}$1`)
      taken.add(name)
      entries.push({ name, data })
    }
    if (entries.length === 0) {
      await openInfoDialog({
        document,
        title: 'Nothing to download',
        body: 'That folder has no documents.',
      })
      return
    }
    const archive = folder ? (folder.split('/').pop() ?? folder) : 'workspace'
    downloadFile(document, {
      name: suggestFileName(archive, 'zip'),
      mime: 'application/zip',
      data: createZip(entries),
    })
  }

  /** The formats a mail merge writes each letter in. */
  const MERGE_FORMATS = ['docx', 'pdfForm', 'html', 'markdown']

  async function mailMerge(): Promise<void> {
    const file = await pickFile(document, '.csv,.json,text/csv,application/json')
    if (!file) return
    let rows: MergeRow[]
    try {
      rows = parseMergeRows(await file.text())
    } catch (error) {
      if (!(error instanceof MergeFileError)) throw error
      await openInfoDialog({ document, title: 'Nothing to merge', body: error.message })
      return
    }
    const writable = exporters.filter((exporter) => MERGE_FORMATS.includes(exporter.name))
    const values = await openDialog({
      document,
      title: 'Mail merge',
      submitLabel: 'Merge',
      body: `${rows.length === 1 ? 'One row' : `${rows.length} rows`}: a document each, its fields and {{placeholders}} filled from the columns of the same name.`,
      fields: [
        {
          name: 'format',
          label: 'Write each as',
          type: 'select',
          value: 'docx',
          options: writable.map((exporter) => ({ value: exporter.name, label: exporter.label })),
        },
      ],
    })
    editor.view?.focus()
    const exporter = writable.find((entry) => entry.name === values?.format)
    if (!values || !exporter) return
    const entries: ZipEntry[] = []
    const taken = new Set<string>()
    for (const [index, row] of rows.entries()) {
      const doc = readerCopy(mergeDocument(editor.state.doc, row))
      const title = rowName(row, index)
      const data = await exporter.serialize(doc, { schema: editor.schema, title })
      let name = suggestFileName(title, exporter.extension)
      for (let n = 2; taken.has(name); n++) name = name.replace(/(\.[^.]+)$/, `-${n}$1`)
      taken.add(name)
      entries.push({ name, data })
    }
    downloadFile(document, {
      name: 'mail-merge.zip',
      mime: 'application/zip',
      data: createZip(entries),
    })
  }

  return { openDocument, download, compareWithFile, importFromURL, exportFolder, mailMerge }
}
