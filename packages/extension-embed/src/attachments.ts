import {
  type Attrs,
  type Editor,
  type EditorNode,
  Fragment,
  type Path,
  ReplaceInlineStep,
  SetNodeAttrsStep,
  inlineSize,
} from '@trevixal/core'
import { insertAttachment } from './commands'
import { formatBytes } from './format'

// ------------------------------------------------------------ shared types
// The storage contract is the one `@trevixal/extension-image` defines, so
// one backend (S3, a REST endpoint, an in-memory stub) can serve both.

/** A file being uploaded, with progress and cancellation. */
export interface UploadContext {
  /** Report 0-1 completion so the chip can render a progress state. */
  readonly onProgress?: (fraction: number) => void
  /** Aborts when the user cancels or the editor is destroyed. */
  readonly signal?: AbortSignal
}

/** What a backend returns once the bytes are durably stored. */
export interface UploadResult {
  /** Public URL the chip links to. */
  readonly url: string
  /** Backend-specific handle used to delete the object later. */
  readonly key?: string
  readonly width?: number
  readonly height?: number
}

/** A storage backend. Any `ImageStorage` from `@trevixal/extension-image` conforms. */
export interface FileStorage {
  /** Persist the file and resolve with its public URL. */
  upload(file: File, context: UploadContext): Promise<UploadResult>
  /** Optional cleanup when an attachment is removed from the document. */
  delete?(result: UploadResult): Promise<void>
}

// One class, in core, so that `error instanceof UploadError` caught from an
// attachment upload also catches one raised by @trevixal/extension-image.
export { UploadError } from '@trevixal/core'

/** A single upload in flight, as reported to {@link AttachmentOptions.onUpload}. */
export interface AttachmentUploadStatus {
  readonly id: string
  readonly fileName: string
  /** 0-1, or null when the backend reports no progress. */
  readonly progress: number | null
  readonly state: 'uploading' | 'done' | 'error'
  readonly error?: string
}

export interface AttachmentOptions {
  /** Where the bytes go. Any {@link FileStorage} implementation. */
  readonly storage: FileStorage
  /** Bytes; defaults to 25 MB. */
  readonly maxBytes?: number
  /**
   * Accepted files: MIME types (`application/pdf`), wildcards (`text/*`) or
   * extensions (`.zip`). Defaults to everything that is not an image, images
   * belong to `@trevixal/extension-image`, which claims them on drop first.
   */
  readonly accept?: readonly string[]
  /** Upload lifecycle for progress UI; called on every state change. */
  readonly onUpload?: (status: AttachmentUploadStatus) => void
  /** Surfaced to the user when a file is rejected or an upload fails. */
  readonly onError?: (message: string) => void
  /** Upload files dropped onto the editor. Defaults to true. */
  readonly bindDrop?: boolean
  /** Delete the stored object when its attachment leaves the document. */
  readonly deleteOnRemove?: boolean
}

export interface AttachmentController {
  /** Open the OS file picker and upload everything chosen. */
  pickFiles(): void
  /** Validate and upload files, inserting one chip per accepted file. */
  upload(files: readonly File[]): Promise<void>
  /** Cancel a running upload and remove its pending chip. */
  cancel(id: string): void
  readonly uploadsInFlight: number
  destroy(): void
}

export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024

/** Whether a file matches an accept list; no list means "anything but images". */
export function acceptsFile(file: File, accept?: readonly string[]): boolean {
  if (!accept) return !file.type.startsWith('image/')
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  return accept.some((pattern) => {
    const wanted = pattern.trim().toLowerCase()
    if (!wanted) return false
    if (wanted.startsWith('.')) return name.endsWith(wanted)
    if (wanted.endsWith('/*')) return type.startsWith(wanted.slice(0, -1))
    return type === wanted
  })
}

/** Validate a file against the options; returns null when acceptable. */
export function validateAttachment(file: File, options: AttachmentOptions): string | null {
  if (!acceptsFile(file, options.accept)) {
    return `Unsupported file type: ${file.type || 'unknown'}`
  }
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  if (file.size > maxBytes) {
    return `File is too large (${formatBytes(file.size)}; limit ${formatBytes(maxBytes)})`
  }
  return null
}

let nextUploadId = 0

interface Located {
  /** Path of the textblock holding the chip. */
  readonly blockPath: Path
  /** Inline offset of the chip within that block. */
  readonly offset: number
  readonly node: EditorNode
}

/**
 * File attachments bound to an editor: the file dialog and drag-and-drop
 * funnel through one pipeline, validate, insert a pending chip, upload,
 * then patch the chip with the real URL. The chip is tracked by its
 * `uploadId` attribute rather than a position, so it survives edits made
 * while the upload runs (and disappears cleanly if the user deletes it).
 */
class Controller implements AttachmentController {
  private readonly disposers: (() => void)[] = []
  private readonly inFlight = new Map<string, AbortController>()
  private readonly stored = new Map<string, UploadResult>()
  private boundDOM: HTMLElement | null = null
  private destroyed = false

  constructor(
    private readonly editor: Editor,
    private readonly options: AttachmentOptions,
  ) {
    if (options.bindDrop !== false) {
      this.attachToView()
      this.disposers.push(editor.on('transaction', () => this.attachToView()))
    }
    if (options.deleteOnRemove) this.trackRemovals()
  }

  pickFiles(): void {
    const document = this.editor.view?.dom.ownerDocument
    if (!document) return
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    const accept = (this.options.accept ?? []).join(',')
    if (accept) input.accept = accept
    input.addEventListener('change', () => {
      const files = input.files ? [...input.files] : []
      void this.upload(files)
    })
    input.click()
  }

  async upload(files: readonly File[]): Promise<void> {
    for (const file of files) {
      const problem = validateAttachment(file, this.options)
      if (problem) {
        this.options.onError?.(problem)
        continue
      }
      await this.uploadOne(file)
    }
  }

  cancel(id: string): void {
    this.inFlight.get(id)?.abort()
    this.inFlight.delete(id)
    this.removePending(id)
  }

  get uploadsInFlight(): number {
    return this.inFlight.size
  }

  destroy(): void {
    if (this.destroyed) return
    for (const [id, controller] of this.inFlight) {
      controller.abort()
      this.removePending(id)
    }
    this.inFlight.clear()
    this.destroyed = true
    this.detachDOM()
    for (const dispose of this.disposers) dispose()
    this.stored.clear()
  }

  // ------------------------------------------------------------- internals

  private async uploadOne(file: File): Promise<void> {
    const id = `attachment-${++nextUploadId}`
    const abort = new AbortController()
    this.inFlight.set(id, abort)
    this.report({ id, fileName: file.name, progress: 0, state: 'uploading' })
    const inserted = this.editor.exec(
      insertAttachment({
        href: '',
        name: file.name,
        size: file.size,
        type: file.type || null,
        uploadId: id,
      }),
    )
    if (!inserted) {
      this.inFlight.delete(id)
      const message = 'No place to insert the attachment'
      this.options.onError?.(message)
      this.report({ id, fileName: file.name, progress: null, state: 'error', error: message })
      return
    }

    try {
      const result = await this.options.storage.upload(file, {
        signal: abort.signal,
        onProgress: (fraction) => {
          this.report({ id, fileName: file.name, progress: fraction, state: 'uploading' })
        },
      })
      if (this.destroyed || !this.inFlight.has(id)) return // cancelled meanwhile
      const patched = this.patchPending(id, {
        href: result.url,
        storageKey: result.key ?? null,
        uploadId: null,
      })
      if (patched && this.options.deleteOnRemove) this.stored.set(result.url, result)
      this.report({ id, fileName: file.name, progress: 1, state: 'done' })
    } catch (error) {
      if (abort.signal.aborted) return
      const message = error instanceof Error && error.message ? error.message : 'Upload failed'
      this.removePending(id)
      this.options.onError?.(message)
      this.report({ id, fileName: file.name, progress: null, state: 'error', error: message })
    } finally {
      this.inFlight.delete(id)
    }
  }

  private report(status: AttachmentUploadStatus): void {
    this.options.onUpload?.(status)
  }

  /** Locate a pending chip by its upload id, wherever the user moved it. */
  private findPending(id: string): Located | null {
    let found: Located | null = null
    const walk = (node: EditorNode, path: Path): void => {
      if (found) return
      if (node.isTextblock) {
        let offset = 0
        for (const child of node.content.children) {
          if (child.type.name === 'attachment' && child.attrs.uploadId === id) {
            found = { blockPath: path, offset, node: child }
            return
          }
          offset += inlineSize(child)
        }
        return
      }
      node.content.children.forEach((child, index) => walk(child, [...path, index]))
    }
    walk(this.editor.state.doc, [])
    return found
  }

  private patchPending(id: string, attrs: Attrs): boolean {
    const target = this.findPending(id)
    if (!target) return false
    const block = target.blockPath
    const index = this.indexOfOffset(block, target.offset)
    if (index === null) return false
    this.editor.dispatch(
      this.editor.state.tr.step(
        new SetNodeAttrsStep([...block, index], { ...target.node.attrs, ...attrs }),
      ),
    )
    return true
  }

  private removePending(id: string): void {
    const target = this.findPending(id)
    if (!target) return
    this.editor.dispatch(
      this.editor.state.tr.step(
        new ReplaceInlineStep(target.blockPath, target.offset, target.offset + 1, Fragment.empty),
      ),
    )
  }

  /** The child index of the inline node starting at `offset` in a textblock. */
  private indexOfOffset(blockPath: Path, offset: number): number | null {
    let node: EditorNode = this.editor.state.doc
    for (const step of blockPath) node = node.child(step)
    let at = 0
    for (let index = 0; index < node.childCount; index++) {
      if (at === offset) return index
      at += inlineSize(node.child(index))
    }
    return null
  }

  /** Ask the backend to delete objects whose chips left the document. */
  private trackRemovals(): void {
    this.disposers.push(
      this.editor.onTransaction(({ transaction, before, state }) => {
        if (!transaction.docChanged) return
        const survivors = new Set(attachmentHrefs(state.doc))
        for (const href of attachmentHrefs(before.doc)) {
          if (survivors.has(href)) continue
          const result = this.stored.get(href)
          if (!result) continue
          this.stored.delete(href)
          void this.options.storage.delete?.(result)
        }
      }),
    )
  }

  private attachToView(): void {
    if (this.destroyed) return
    const dom = this.editor.view?.dom ?? null
    if (dom === this.boundDOM) return
    this.detachDOM()
    if (!dom) return
    dom.addEventListener('drop', this.onDrop)
    dom.addEventListener('dragover', this.onDragOver)
    this.boundDOM = dom
  }

  private detachDOM(): void {
    const dom = this.boundDOM
    if (!dom) return
    dom.removeEventListener('drop', this.onDrop)
    dom.removeEventListener('dragover', this.onDragOver)
    this.boundDOM = null
  }

  private onDragOver = (event: DragEvent): void => {
    if (this.droppedFiles(event.dataTransfer).length > 0) event.preventDefault()
  }

  private onDrop = (event: DragEvent): void => {
    const files = this.droppedFiles(event.dataTransfer)
    if (files.length === 0) return
    event.preventDefault()
    void this.upload(files)
  }

  /** Dropped files this controller should take; images are left to the image extension. */
  private droppedFiles(data: DataTransfer | null): File[] {
    if (!data) return []
    return [...data.files].filter((file) => acceptsFile(file, this.options.accept))
  }
}

function attachmentHrefs(doc: EditorNode): string[] {
  const hrefs: string[] = []
  const walk = (node: EditorNode): void => {
    if (node.type.name === 'attachment' && typeof node.attrs.href === 'string' && node.attrs.href) {
      hrefs.push(node.attrs.href)
    }
    for (const child of node.content.children) walk(child)
  }
  walk(doc)
  return hrefs
}

/**
 * Wire file attachments onto an editor whose schema includes `embedNodes()`.
 * Returns the controller; call `destroy()` to detach.
 */
export function attachments(editor: Editor, options: AttachmentOptions): AttachmentController {
  return new Controller(editor, options)
}
