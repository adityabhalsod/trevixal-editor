import { type Editor, Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { type ImageStorage, image, imageNodes } from '@trevixal/extension-image'
import {
  createTableTools,
  enableCellSelection,
  highlightActiveCell,
  tableKeymap,
  tableNodes,
  tableUICommands,
} from '@trevixal/extension-table'
import { createEditorUI } from '@trevixal/ui'

declare global {
  interface Window {
    uiPage: {
      editor: Editor
      /** Feed files straight in, bypassing the OS picker (for tests). */
      upload(files: File[]): Promise<void>
      /** Last upload status seen, so tests can assert progress reporting. */
      lastStatus(): string
    }
  }
}

const schema = new Schema({
  nodes: { ...defaultNodes(), ...tableNodes(), ...imageNodes() },
  marks: defaultMarks(),
})

const surface = document.getElementById('editor')
const chrome = document.getElementById('chrome')
if (!surface || !chrome) throw new Error('missing mount points')

const editor = createEditor({
  schema,
  element: surface,
  keymap: tableKeymap(),
  placeholder: 'Write something…',
})

/** A deterministic stand-in for a real backend, so the demo needs no server. */
const demoStorage: ImageStorage = {
  async upload(file, context) {
    for (const step of [0.25, 0.5, 0.75, 1]) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      if (context.signal?.aborted) break
      context.onProgress?.(step)
    }
    return { url: `https://cdn.example/${encodeURIComponent(file.name)}`, key: file.name }
  },
}

let lastStatus = 'idle'
const images = image(editor, {
  storage: demoStorage,
  onUpload: (status) => {
    lastStatus = `${status.state}:${status.fileName}`
    const readout = document.getElementById('upload-status')
    if (readout) readout.textContent = lastStatus
  },
  onError: (message) => {
    const readout = document.getElementById('upload-status')
    if (readout) readout.textContent = `error:${message}`
  },
})

// As the editor kit mounts them: double click a cell to select it, drag for more.
highlightActiveCell(editor)
enableCellSelection(editor)
const tableTools = createTableTools(editor, { container: surface })

createEditorUI(editor, {
  container: chrome,
  tableCommands: {
    ...tableUICommands({ editor }),
    toggleTableTool: (tool) => tableTools.toggle(tool),
    activeTableTool: () => tableTools.tool,
  },
  images: {
    pickFiles: () => images.pickFiles(),
    insertImage: (attrs) => images.insertImage(attrs),
  },
})

window.uiPage = {
  editor,
  upload: (files) => images.uploadFiles(files),
  lastStatus: () => lastStatus,
}
