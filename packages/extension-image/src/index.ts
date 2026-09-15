import {
  ADD_TO_HISTORY,
  type Attrs,
  type Editor,
  type EditorNode,
  Fragment,
  HISTORY_LABEL,
  type Path,
  ReplaceNodesStep,
  SetNodeAttrsStep,
  safeLength,
} from '@trevixal/core'
import { findImage, insertImage, updateImage } from './commands'
import { type CompressOptions, DEFAULT_COMPRESS_OPTIONS, compressImage } from './compress'
import {
  type ImageStorage,
  type UploadConstraints,
  UploadError,
  type UploadResult,
  validateFile,
} from './storage'
import { type ImageTransform, type ImageTransformer, transformImage } from './transform'

export { imageNodes, type ImageAlign } from './schema'
export {
  activeImage,
  deleteImage,
  findImage,
  imageCaptionText,
  type ImageHit,
  insertImage,
  removeImage,
  resizeImage,
  selectImage,
  setImageAlign,
  setImageAlt,
  setImageCaption,
  setImageWidth,
  toggleImageCaption,
  updateImage,
} from './commands'
export {
  compressImage,
  type CompressOptions,
  DEFAULT_COMPRESS_OPTIONS,
} from './compress'
export {
  type ImageCrop,
  type ImageTransform,
  type ImageTransformer,
  transformImage,
  type TransformImageOptions,
} from './transform'
export {
  createImageToolbar,
  type ImageToolbar,
  type ImageToolbarOptions,
} from './toolbar'
export {
  createImageResizeHandles,
  type ImageResizeHandles,
  type ImageResizeHandlesOptions,
} from './resize-handles'
export {
  createDataURLStorage,
  createFallbackStorage,
  createFetchStorage,
  createObjectURLStorage,
  createS3PresignedStorage,
  DEFAULT_ACCEPT,
  type FetchStorageOptions,
  type ImageStorage,
  type PresignedUpload,
  type S3PresignedStorageOptions,
  type UploadConstraints,
  type UploadContext,
  UploadError,
  type UploadResult,
  validateFile,
} from './storage'

/** A single upload in flight, as reported to {@link ImageOptions.onUpload}. */
export interface UploadStatus {
  readonly id: string
  readonly fileName: string
  /** 0-1, or null when the backend reports no progress. */
  readonly progress: number | null
  readonly state: 'uploading' | 'done' | 'error'
  readonly error?: string
}

export interface ImageOptions extends UploadConstraints {
  /** Where the bytes go. Any {@link ImageStorage} implementation. */
  readonly storage: ImageStorage
  /** Upload lifecycle for progress UI; called on every state change. */
  readonly onUpload?: (status: UploadStatus) => void
  /** Surfaced to the user when a file is rejected or an upload fails. */
  readonly onError?: (message: string) => void
  /** Delete the stored object when its image leaves the document. */
  readonly deleteOnRemove?: boolean
  /**
   * Shrink images before they are uploaded. On by default because the common
   * case, a photo straight off a phone, is several megabytes of pixels no
   * document will ever show; pass `false` to upload the bytes untouched.
   */
  readonly compress?: CompressOptions | false
  /** Swap the compressor out (a worker, a WASM encoder, a stub in tests). */
  readonly compressor?: (file: File, options: CompressOptions) => Promise<File>
  /** Swap the rotate/crop rasteriser out, for the same reasons. */
  readonly transformer?: ImageTransformer
}

let nextUploadId = 0

/**
 * Image uploads bound to an editor: drag-and-drop, paste, and the
 * {@link ImageController.pickFiles} file dialog all funnel through the same
 * pipeline, compress, validate, insert a placeholder node, upload, then
 * patch the node with the real URL.
 *
 * The placeholder is tracked by its `uploadId` attribute rather than a
 * position, so it survives arbitrary edits (and disappears cleanly if the
 * user deletes it mid-upload).
 */
export class ImageController {
  private readonly disposers: (() => void)[] = []
  private readonly inFlight = new Map<string, AbortController>()
  private readonly stored = new Map<string, UploadResult>()
  /** The element the drop/paste listeners are currently bound to. */
  private boundDOM: HTMLElement | null = null
  private destroyed = false

  constructor(
    private readonly editor: Editor,
    private readonly options: ImageOptions,
  ) {
    this.attachToView()
    this.disposers.push(editor.on('transaction', () => this.attachToView()))
    if (options.deleteOnRemove) this.trackRemovals()
  }

  /** Open the OS file picker and upload everything chosen. */
  pickFiles(): void {
    const document = this.editor.view?.dom.ownerDocument
    if (!document) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = (this.options.accept ?? []).join(',') || 'image/*'
    input.multiple = true
    input.addEventListener('change', () => {
      const files = input.files ? [...input.files] : []
      void this.uploadFiles(files)
    })
    input.click()
  }

  /** Validate and upload files, inserting one image node per accepted file. */
  async uploadFiles(files: readonly File[]): Promise<void> {
    const jobs: { file: File; id: string }[] = []
    for (const file of files) {
      // Only the type is checked here, and synchronously, so a file the editor
      // will never accept is rejected before a placeholder appears. The size
      // limit waits until after compression: shrinking an over-large photo to
      // fit is the entire reason the compressor runs.
      const problem = validateFile(file, {
        accept: this.options.accept,
        maxBytes: Number.POSITIVE_INFINITY,
      })
      if (problem) {
        this.options.onError?.(problem)
        continue
      }
      const id = `upload-${++nextUploadId}`
      this.inFlight.set(id, new AbortController())
      jobs.push({ file, id })
    }
    // Every placeholder goes in before the first byte moves, each one after
    // the one before it: inserting them as the uploads finish would stack a
    // multi-file drop up backwards, because the selection they insert after
    // never moves off the block the user dropped onto.
    let previous: Path | null = null
    for (const job of jobs) previous = this.insertPlaceholder(job.id, job.file, previous)
    for (const job of jobs) await this.uploadOne(job.file, job.id)
  }

  /** Insert an image that is already hosted somewhere. */
  insertImage(attrs: { src: string; alt?: string; title?: string }): boolean {
    return this.editor.exec(insertImage(attrs))
  }

  /**
   * Rotate, flip or crop the image under the selection (or at `at`), re-upload
   * the new pixels and point the node at them.
   *
   * The edit is destructive on purpose: a CSS rotation only exists inside this
   * editor, while new bytes survive export, copy-paste and every other reader.
   * Everything lands in a single transaction labelled for the history, so one
   * undo puts back both the old URL and the old dimensions.
   */
  async transform(transform: ImageTransform, at?: Path): Promise<boolean> {
    if (this.destroyed) return false
    const hit = findImage(this.editor.state, at)
    const src = typeof hit?.node.attrs.src === 'string' ? hit.node.attrs.src : ''
    if (!hit || !src) return false

    const id = `transform-${++nextUploadId}`
    const abort = new AbortController()
    this.inFlight.set(id, abort)
    const fileName = fileNameOf(src)
    this.report({ id, fileName, progress: 0, state: 'uploading' })
    try {
      const source = await this.loadSource(src, abort.signal)
      const transformer = this.options.transformer ?? transformImage
      const blob = await transformer(source, transform, { mimeType: source.type || 'image/png' })
      if (this.destroyed || !this.inFlight.has(id)) return false

      const type = blob.type || source.type || 'image/png'
      const file = new File([blob], fileNameOf(src, type), { type })
      const result = await this.options.storage.upload(file, {
        signal: abort.signal,
        onProgress: (fraction) => {
          this.report({ id, fileName, progress: fraction, state: 'uploading' })
        },
      })
      if (this.destroyed || !this.inFlight.has(id)) return false

      // The document may have moved on while the bytes were in flight, so the
      // node is looked up again by its source rather than by the stale path.
      const target = findImageBySrc(this.editor.state.doc, src) ?? hit
      const attrs: Attrs = {
        src: result.url,
        storageKey: result.key ?? null,
        ...transformedSize(target.node, transform),
      }
      const tr = updateImage(attrs, target.path)(this.editor.state)
      if (!tr) return false
      tr.setMeta(HISTORY_LABEL, transform.crop ? 'Crop image' : 'Rotate image')
      this.editor.dispatch(tr)
      // Registered after the dispatch: the transaction is what drops the old
      // source out of the document, and that is what triggers its delete.
      if (this.options.deleteOnRemove) this.stored.set(result.url, result)
      this.report({ id, fileName, progress: 1, state: 'done' })
      return true
    } catch (error) {
      if (abort.signal.aborted) return false
      const message = error instanceof Error ? error.message : 'Could not transform the image'
      this.options.onError?.(message)
      this.report({ id, fileName, progress: null, state: 'error', error: message })
      return false
    } finally {
      this.inFlight.delete(id)
    }
  }

  /** Rotate a quarter turn anticlockwise. */
  rotateLeft(at?: Path): Promise<boolean> {
    return this.transform({ rotate: 270 }, at)
  }

  /** Rotate a quarter turn clockwise. */
  rotateRight(at?: Path): Promise<boolean> {
    return this.transform({ rotate: 90 }, at)
  }

  /** Cancel a running upload and remove its placeholder. */
  cancel(id: string): void {
    this.inFlight.get(id)?.abort()
    this.inFlight.delete(id)
    this.removePlaceholder(id)
  }

  get uploadsInFlight(): number {
    return this.inFlight.size
  }

  destroy(): void {
    if (this.destroyed) return
    // Abort in-flight uploads and take their placeholders with them, so a
    // torn-down controller never leaves a permanently empty image behind.
    for (const [id, controller] of this.inFlight) {
      controller.abort()
      this.removePlaceholder(id)
    }
    this.inFlight.clear()
    this.destroyed = true
    this.detachDOM()
    for (const dispose of this.disposers) dispose()
    this.stored.clear()
  }

  // ------------------------------------------------------------- internals

  /** Run the (possibly injected) compressor, but never let it fail an upload. */
  private async compress(file: File): Promise<File> {
    if (this.options.compress === false) return file
    if (!file.type.startsWith('image/')) return file
    const merged = { ...DEFAULT_COMPRESS_OPTIONS, ...this.options.compress }
    // A file the upload limit would reject must always be offered to the
    // compressor, whatever `minBytes` says: "leave small files alone" cannot
    // be allowed to mean "reject a file compression would have made fit".
    const limit = this.options.maxBytes
    const settings: CompressOptions =
      typeof limit === 'number' && limit < merged.minBytes ? { ...merged, minBytes: limit } : merged
    const compressor = this.options.compressor ?? compressImage
    try {
      return await compressor(file, settings)
    } catch {
      return file
    }
  }

  /** Read an existing image back out of wherever it is served from. */
  private async loadSource(src: string, signal: AbortSignal): Promise<Blob> {
    const response = await fetch(src, { signal })
    if (!response.ok) {
      throw new UploadError(`Could not read the image (status ${response.status})`)
    }
    return await response.blob()
  }

  /**
   * Put one placeholder in the document. A batch chains them: each insertion
   * goes directly after the previous placeholder, so the files keep the order
   * they were dropped or picked in.
   */
  private insertPlaceholder(id: string, file: File, previous: Path | null): Path | null {
    const attrs: Attrs = { src: '', alt: file.name, uploadId: id }
    const index = previous?.[previous.length - 1]
    const type = this.editor.state.schema.nodes.image
    if (previous && index !== undefined && type) {
      this.editor.dispatch(
        this.editor.state.tr.step(
          new ReplaceNodesStep(
            previous.slice(0, -1),
            index + 1,
            index + 1,
            Fragment.of(type.create(attrs)),
          ),
        ),
      )
    } else if (!this.editor.exec(insertImage({ src: '', alt: file.name, uploadId: id }))) {
      return null
    }
    return this.findPlaceholder(id)?.path ?? null
  }

  private async uploadOne(file: File, id: string): Promise<void> {
    const abort = this.inFlight.get(id)
    // Cancelled (or the controller torn down) before its turn came round.
    if (!abort || this.destroyed) return
    this.report({ id, fileName: file.name, progress: 0, state: 'uploading' })

    try {
      // Compression comes before the upload *and* before the size check: it
      // is the compressed bytes, not the originals, the constraints apply to.
      const candidate = await this.compress(file)
      if (this.destroyed || !this.inFlight.has(id)) return
      const problem = validateFile(candidate, this.options)
      if (problem) throw new UploadError(problem)

      const result = await this.options.storage.upload(candidate, {
        signal: abort.signal,
        onProgress: (fraction) => {
          this.report({ id, fileName: file.name, progress: fraction, state: 'uploading' })
        },
      })
      if (this.destroyed || !this.inFlight.has(id)) return // cancelled meanwhile
      const patched = this.patchPlaceholder(id, {
        src: result.url,
        storageKey: result.key ?? null,
        width: result.width ? String(result.width) : null,
        height: result.height ? String(result.height) : null,
        uploadId: null,
      })
      // Only retained when a delete hook will consume it later.
      if (patched && this.options.deleteOnRemove) this.stored.set(result.url, result)
      this.report({ id, fileName: file.name, progress: 1, state: 'done' })
    } catch (error) {
      if (abort.signal.aborted) return
      const message = error instanceof UploadError ? error.message : 'Upload failed'
      this.removePlaceholder(id)
      this.options.onError?.(message)
      this.report({ id, fileName: file.name, progress: null, state: 'error', error: message })
    } finally {
      this.inFlight.delete(id)
    }
  }

  private report(status: UploadStatus): void {
    this.options.onUpload?.(status)
  }

  /** Locate a placeholder by its upload id, wherever the user moved it. */
  private findPlaceholder(id: string): { path: Path; node: EditorNode } | null {
    let found: { path: Path; node: EditorNode } | null = null
    const walk = (node: EditorNode, path: Path): void => {
      if (found) return
      if (node.type.name === 'image' && node.attrs.uploadId === id) {
        found = { path, node }
        return
      }
      node.content.children.forEach((child, index) => walk(child, [...path, index]))
    }
    walk(this.editor.state.doc, [])
    return found
  }

  private patchPlaceholder(id: string, attrs: Attrs): boolean {
    const target = this.findPlaceholder(id)
    if (!target) return false
    this.editor.dispatch(
      this.editor.state.tr.step(
        new SetNodeAttrsStep(target.path, { ...target.node.attrs, ...attrs }),
      ),
    )
    return true
  }

  private removePlaceholder(id: string): void {
    const target = this.findPlaceholder(id)
    if (!target) return
    const index = target.path[target.path.length - 1]
    if (index === undefined) return
    this.editor.dispatch(
      this.editor.state.tr.step(
        new ReplaceNodesStep(target.path.slice(0, -1), index, index + 1, Fragment.empty),
      ),
    )
  }

  /** Ask the backend to delete objects whose nodes left the document. */
  private trackRemovals(): void {
    this.disposers.push(
      this.editor.onTransaction(({ transaction, before, state }) => {
        if (!transaction.docChanged) return
        // Undo and redo (and anything else replayed outside the history) only
        // *look* like a removal: the user can put the image straight back, so
        // the bytes have to outlive the step. The handle is kept, and a later
        // deletion the user actually meant still cleans up.
        if (transaction.getMeta(ADD_TO_HISTORY) === false) return
        const survivors = new Set(imageSources(state.doc))
        for (const src of imageSources(before.doc)) {
          if (survivors.has(src)) continue
          const result = this.stored.get(src)
          if (!result) continue
          this.stored.delete(src)
          void this.options.storage.delete?.(result)
        }
      }),
    )
  }

  /** Bind the drop/paste listeners, following the view if it is replaced. */
  private attachToView(): void {
    if (this.destroyed) return
    const dom = this.editor.view?.dom ?? null
    if (dom === this.boundDOM) return
    this.detachDOM()
    if (!dom) return
    dom.addEventListener('drop', this.onDrop)
    dom.addEventListener('dragover', this.onDragOver)
    dom.addEventListener('paste', this.onPaste)
    this.boundDOM = dom
  }

  private detachDOM(): void {
    const dom = this.boundDOM
    if (!dom) return
    dom.removeEventListener('drop', this.onDrop)
    dom.removeEventListener('dragover', this.onDragOver)
    dom.removeEventListener('paste', this.onPaste)
    this.boundDOM = null
  }

  private onDragOver = (event: DragEvent): void => {
    if (dragCarriesImage(event.dataTransfer)) event.preventDefault()
  }

  private onDrop = (event: DragEvent): void => {
    const files = imageFilesOf(event.dataTransfer)
    if (files.length === 0) return
    event.preventDefault()
    void this.uploadFiles(files)
  }

  private onPaste = (event: ClipboardEvent): void => {
    const files = imageFilesOf(event.clipboardData)
    if (files.length === 0) return
    // Beat the core paste handler: image bytes win over the HTML flavour.
    event.preventDefault()
    event.stopImmediatePropagation()
    void this.uploadFiles(files)
  }
}

function imageFilesOf(data: DataTransfer | null): File[] {
  if (!data) return []
  return [...data.files].filter((file) => file.type.startsWith('image/'))
}

/**
 * Whether a drag *in progress* is carrying an image. `files` is deliberately
 * empty until the drop, so a dragover that only looked there would never
 * accept the drag, and a drag the editor refuses never produces a drop at
 * all. The item list is the one thing readable this early; a browser that
 * withholds the MIME type too leaves a bare file entry, which is taken as a
 * candidate rather than dismissed.
 */
function dragCarriesImage(data: DataTransfer | null): boolean {
  if (!data) return false
  if (imageFilesOf(data).length > 0) return true
  const items = data.items ? [...data.items] : []
  const files = items.filter((item) => item.kind === 'file')
  return files.some((item) => item.type === '' || item.type.startsWith('image/'))
}

function imageSources(doc: EditorNode): string[] {
  const sources: string[] = []
  const walk = (node: EditorNode): void => {
    if (node.type.name === 'image' && typeof node.attrs.src === 'string' && node.attrs.src) {
      sources.push(node.attrs.src)
    }
    for (const child of node.content.children) walk(child)
  }
  walk(doc)
  return sources
}

/** The image node currently holding a given source, wherever it moved to. */
function findImageBySrc(doc: EditorNode, src: string): { path: Path; node: EditorNode } | null {
  let found: { path: Path; node: EditorNode } | null = null
  const walk = (node: EditorNode, path: Path): void => {
    if (found) return
    if (node.type.name === 'image' && node.attrs.src === src) {
      found = { path, node }
      return
    }
    node.content.children.forEach((child, index) => walk(child, [...path, index]))
  }
  walk(doc, [])
  return found
}

/**
 * The explicit size an image should carry once its pixels have been edited.
 *
 * A crop throws pixels away, so keeping the old `width` stretches what is
 * left back over the same box, visible damage to the document, not a
 * cosmetic slip, and the stored size has to shrink by the same factor as the
 * crop rectangle.
 *
 * A quarter turn makes the source's y axis the width the reader sees, so the
 * fraction that belongs to each *output* axis is the one from the source axis
 * that lands on it. With both dimensions set that falls out of scaling each
 * source axis and then swapping the pair. With only one set the swap cannot
 * happen, the browser derives the other from the new bitmap's aspect ratio,
 * so nothing is stretched and only the footprint is in question, and the
 * output axis's own fraction has to be chosen directly instead. Scaling the
 * lone `width` by the x fraction across a quarter turn shrinks the box along
 * the axis the crop did not touch.
 *
 * Only lengths in pixels move, and only pixel pairs swap. A `%` width is
 * measured against the column rather than the pixels, so cropping does not
 * change what it means and turning it into a `%` *height*, which resolves
 * against an auto-height container and is effectively dropped, would lose it.
 * Returns just the attributes that actually change, so an unsized image stays
 * unsized.
 */
function transformedSize(node: EditorNode, transform: ImageTransform): Attrs {
  const currentWidth = typeof node.attrs.width === 'string' ? node.attrs.width : null
  const currentHeight = typeof node.attrs.height === 'string' ? node.attrs.height : null
  const crop = transform.crop
  const fractionX = cropFraction(crop?.x, crop?.width)
  const fractionY = cropFraction(crop?.y, crop?.height)
  const quarterTurn = transform.rotate === 90 || transform.rotate === 270
  let width: string | null
  let height: string | null
  if (currentWidth !== null && currentHeight !== null) {
    width = scaleLength(currentWidth, fractionX)
    height = scaleLength(currentHeight, fractionY)
    if (quarterTurn && isPixelLength(width) && isPixelLength(height)) {
      ;[width, height] = [height, width]
    }
  } else {
    width = scaleLength(currentWidth, quarterTurn ? fractionY : fractionX)
    height = scaleLength(currentHeight, quarterTurn ? fractionX : fractionY)
  }
  const attrs: Record<string, unknown> = {}
  if (width !== currentWidth) attrs.width = width
  if (height !== currentHeight) attrs.height = height
  return attrs
}

/**
 * How much of one axis a crop keeps, clamped the way {@link transformImage}
 * clamps its rectangle so the stored size tracks the pixels that are really
 * drawn rather than the rectangle that was asked for.
 */
function cropFraction(offset: number | undefined, size: number | undefined): number {
  if (size === undefined) return 1
  const start = clampFraction(offset ?? 0)
  return Math.min(clampFraction(size), 1 - start)
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 1)
}

/**
 * Is this a length in pixels? `safeLength` validates the unit but does not
 * normalise its case, so `400PX` is as valid as `400px` and both have to be
 * recognised, comparing the raw string against `'px'` silently skips one.
 */
function isPixelLength(value: string | null): boolean {
  const length = value === null ? null : safeLength(value)
  return length?.toLowerCase().endsWith('px') ?? false
}

/** Scale a px length by a crop fraction; anything else is left untouched. */
function scaleLength(value: string | null, fraction: number): string | null {
  if (value === null || fraction >= 1) return value
  const length = safeLength(value)
  if (!length || !isPixelLength(length)) return value
  const pixels = Number.parseFloat(length)
  if (!Number.isFinite(pixels)) return value
  // Never below a pixel: that is the floor the rasteriser itself works to.
  return `${Math.max(1, Math.round(pixels * fraction))}px`
}

/**
 * A plausible file name for re-uploaded pixels, taken from the old source.
 *
 * `data:` and `blob:` sources have no path: everything after the scheme is
 * payload or an opaque handle, so splitting it on punctuation the way a path
 * is split produces a name made of base64. Those fall back to a generic stem,
 * and the extension always comes from the MIME type of the new bytes.
 */
function fileNameOf(src: string, mimeType?: string): string {
  const stem = fileStemOf(src)
  if (!mimeType) return stem
  return `${stem}.${extensionFor(mimeType)}`
}

function fileStemOf(src: string): string {
  if (/^(?:data|blob):/i.test(src.trim())) return 'image'
  const withoutQuery = src.split(/[?#]/)[0] ?? ''
  const last = withoutQuery.split('/').pop() ?? ''
  const name = last.includes('.') ? last.slice(0, last.lastIndexOf('.')) : last
  // Whatever survives still ends up as a file name at the far end, so the
  // characters a file system (or a Content-Disposition header) would choke on
  // are dropped rather than passed on. C0 is not the whole control range:
  // DEL and C1 are controls too and reach a header just as easily.
  const unsafe = '"\'\\:*?<>|'
  const stem = [...name]
    .filter((character) => !isControl(character) && !unsafe.includes(character))
    .join('')
    .trim()
    // A name made only of dots is not a name, `..` would become `..png`, and
    // a path segment is not allowed to mean "the parent directory" here.
    .replace(/^\.+$/, '')
  // Nearly every file system stops at 255 bytes, so a long path segment has to
  // be cut somewhere; cutting it here leaves room for the extension.
  return stem.slice(0, MAX_FILE_STEM) || 'image'
}

/** Longest stem kept, leaving room for `.` and an extension under 255 bytes. */
const MAX_FILE_STEM = 200

/** C0, DEL and C1, none of them belong in a file name or a header. */
function isControl(character: string): boolean {
  return (
    character < '\u0020' ||
    character === '\u007f' ||
    (character >= '\u0080' && character <= '\u009f')
  )
}

/** `image/jpeg` → `jpg`, `image/svg+xml` → `svg`: the extension a reader expects. */
function extensionFor(mimeType: string): string {
  const subtype = mimeType.split(';')[0]?.split('/')[1] ?? ''
  const base = subtype.split('+')[0]?.trim().toLowerCase() ?? ''
  if (!base) return 'png'
  return base === 'jpeg' ? 'jpg' : base
}

/**
 * Wire image uploads onto an editor whose schema includes {@link imageNodes}.
 * Returns the controller; call `destroy()` to detach.
 */
export function image(editor: Editor, options: ImageOptions): ImageController {
  return new ImageController(editor, options)
}
