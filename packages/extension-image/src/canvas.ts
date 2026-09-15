/**
 * The bits of canvas plumbing that compression and transforms both need.
 *
 * Everything here is capability-detected rather than assumed: the same code
 * runs in a browser, in a worker (where only `OffscreenCanvas` exists) and in
 * a test environment with no raster backend at all. Callers decide what a
 * missing canvas means, {@link compressImage} treats it as "leave the file
 * alone", {@link transformImage} as an error, so this module never throws on
 * its own behalf beyond a failed decode.
 */
import { UnsupportedEnvironmentError } from '@trevixal/core'

/** A decoded image plus the disposer for whatever the decode allocated. */
export interface DecodedImage {
  /** Drawable source: an `ImageBitmap`, or an `<img>` that has finished loading. */
  readonly source: CanvasImageSource
  readonly width: number
  readonly height: number
  /** Frees the bitmap or revokes the object URL; always call it. */
  release(): void
}

/** A 2D drawing surface together with the way to read its pixels back out. */
export interface DrawSurface {
  readonly context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  /** Encode the current pixels; quality is ignored by lossless formats. */
  encode(mimeType: string, quality: number): Promise<Blob>
}

/**
 * Whether this environment can raster at all. Checked before any work is
 * started so a canvas-less environment (SSR, jsdom/happy-dom) costs one
 * cheap probe rather than a decode that cannot be used.
 */
export function hasCanvas(): boolean {
  if (typeof OffscreenCanvas !== 'undefined') return true
  const doc = globalThis.document as Document | undefined
  if (!doc) return false
  try {
    return doc.createElement('canvas').getContext('2d') !== null
  } catch {
    return false
  }
}

/**
 * A drawing surface of the given size, preferring `OffscreenCanvas` so the
 * work stays off the layout tree. Null when nothing can draw.
 */
export function createSurface(width: number, height: number): DrawSurface | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) return null
    return {
      context,
      encode: (mimeType, quality) => canvas.convertToBlob({ type: mimeType, quality }),
    }
  }
  const doc = globalThis.document as Document | undefined
  if (!doc) return null
  const canvas = doc.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  return {
    context,
    encode: (mimeType, quality) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the canvas'))),
          mimeType,
          quality,
        )
      }),
  }
}

/**
 * Decode a blob or URL into something drawable. `createImageBitmap` is used
 * where it exists because it decodes off the main thread; the `<img>` path is
 * the fallback, and the only route for a URL that is not fetched first.
 */
export async function decodeImage(source: Blob | string): Promise<DecodedImage> {
  if (typeof source !== 'string' && typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(source)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    }
  }
  const doc = globalThis.document as Document | undefined
  if (!doc)
    throw new UnsupportedEnvironmentError(
      'decodeImage: no way to decode an image in this environment',
    )
  const objectURL = typeof source === 'string' ? null : URL.createObjectURL(source)
  const element = doc.createElement('img')
  // Same-origin images are unaffected; a cross-origin one only stays readable
  // (untainted canvas) when the server opts in, and this is how you ask.
  element.crossOrigin = 'anonymous'
  try {
    await new Promise<void>((resolve, reject) => {
      element.addEventListener('load', () => resolve(), { once: true })
      element.addEventListener('error', () => reject(new Error('Could not load the image')), {
        once: true,
      })
      element.src = objectURL ?? (source as string)
    })
  } catch (error) {
    if (objectURL) URL.revokeObjectURL(objectURL)
    throw error
  }
  return {
    source: element,
    width: element.naturalWidth || element.width,
    height: element.naturalHeight || element.height,
    release: () => {
      if (objectURL) URL.revokeObjectURL(objectURL)
    },
  }
}
