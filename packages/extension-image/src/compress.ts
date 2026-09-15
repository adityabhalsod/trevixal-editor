import { createSurface, decodeImage, hasCanvas } from './canvas'

/**
 * How hard to squeeze an upload before it leaves the browser. Every knob has
 * a default that is safe for photographs pasted straight off a phone, which
 * is where the multi-megabyte files come from.
 */
export interface CompressOptions {
  /** Longest edge, in px; larger images are scaled down. Defaults to 2048. */
  readonly maxDimension?: number
  /** Lossy encoder quality, 0-1. Defaults to 0.85. */
  readonly quality?: number
  /**
   * Output format. `'auto'` keeps PNG when the image actually uses its alpha
   * channel and switches to JPEG when it does not, flattening transparency
   * to a black box is far worse than a bigger file.
   */
  readonly mimeType?: 'image/jpeg' | 'image/webp' | 'auto'
  /** Files below this many bytes are returned untouched. Defaults to 150 000. */
  readonly minBytes?: number
}

/** The defaults every unset {@link CompressOptions} field falls back to. */
export const DEFAULT_COMPRESS_OPTIONS: Required<CompressOptions> = {
  maxDimension: 2048,
  quality: 0.85,
  mimeType: 'auto',
  minBytes: 150_000,
}

/**
 * Formats a re-encode would damage: SVG is not raster at all, and GIF/APNG
 * would lose every frame but the first.
 */
const NEVER_COMPRESS = new Set(['image/svg+xml', 'image/gif', 'image/apng'])

/** Formats whose pixels can carry an alpha channel worth preserving. */
const MAY_HAVE_ALPHA = new Set(['image/png', 'image/webp', 'image/avif', 'image/gif'])

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/png': 'png',
}

/**
 * Shrink an image before it is uploaded, and hand back the original whenever
 * that would not be an improvement. No canvas in this environment, a file
 * already small enough to leave alone, a format re-encoding would ruin, or a
 * result that came out no smaller than what we started with. Callers can
 * therefore run this unconditionally and never make a file worse.
 */
export async function compressImage(file: File, options: CompressOptions = {}): Promise<File> {
  const settings = { ...DEFAULT_COMPRESS_OPTIONS, ...options }
  if (file.size < settings.minBytes) return file
  if (NEVER_COMPRESS.has(file.type)) return file
  if (!hasCanvas()) return file

  let decoded: Awaited<ReturnType<typeof decodeImage>>
  try {
    decoded = await decodeImage(file)
  } catch {
    return file // undecodable here: let the backend deal with the original
  }
  try {
    if (decoded.width <= 0 || decoded.height <= 0) return file
    const scale = Math.min(1, settings.maxDimension / Math.max(decoded.width, decoded.height))
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))
    const surface = createSurface(width, height)
    if (!surface) return file
    surface.context.drawImage(decoded.source, 0, 0, width, height)
    const mimeType = resolveMimeType(settings.mimeType, file.type, surface.context, width, height)
    const blob = await surface.encode(mimeType, settings.quality)
    if (blob.size >= file.size) return file
    const type = blob.type || mimeType
    return new File([blob], renameFor(file.name, type), { type, lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    decoded.release()
  }
}

/** Resolve `'auto'` against what the pixels actually need; pass anything else through. */
function resolveMimeType(
  requested: Required<CompressOptions>['mimeType'],
  sourceType: string,
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
): string {
  if (requested !== 'auto') return requested
  if (!MAY_HAVE_ALPHA.has(sourceType)) return 'image/jpeg'
  return hasTransparency(context, width, height) ? 'image/png' : 'image/jpeg'
}

/**
 * True when any pixel is not fully opaque. Every pixel is checked rather than
 * sampled: a missed transparent region becomes a black rectangle in the JPEG,
 * which is not a defect worth trading for a few milliseconds.
 */
function hasTransparency(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  try {
    const { data } = context.getImageData(0, 0, width, height)
    for (let index = 3; index < data.length; index += 4) {
      if ((data[index] ?? 255) < 255) return true
    }
    return false
  } catch {
    // A tainted canvas cannot be read: assume alpha and keep the lossless path.
    return true
  }
}

/** Swap the extension so the uploaded name matches the bytes inside it. */
function renameFor(name: string, mimeType: string): string {
  const extension = EXTENSIONS[mimeType]
  if (!extension) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  return `${stem}.${extension}`
}
