import { UnsupportedEnvironmentError } from '@trevixal/core'
import { createSurface, decodeImage, hasCanvas } from './canvas'

/** A crop window expressed as fractions of the source, each 0-1. */
export interface ImageCrop {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * A destructive edit applied to the pixels themselves. Fractions rather than
 * pixels for the crop, so a rectangle drawn over a scaled preview means the
 * same thing against the full-resolution original.
 */
export interface ImageTransform {
  /** Clockwise, in degrees. */
  readonly rotate?: 0 | 90 | 180 | 270
  readonly flipX?: boolean
  readonly flipY?: boolean
  readonly crop?: ImageCrop
}

/** Output encoding for {@link transformImage}. */
export interface TransformImageOptions {
  /** Defaults to `image/png`, which never adds artefacts to an edit. */
  readonly mimeType?: string
  /** Lossy encoder quality, 0-1. Defaults to 0.92. */
  readonly quality?: number
}

/** How the transform is applied to any source that can be decoded. */
export type ImageTransformer = (
  source: Blob | string,
  transform: ImageTransform,
  options?: TransformImageOptions,
) => Promise<Blob>

/**
 * Rasterise a rotated / flipped / cropped copy of an image.
 *
 * Unlike a CSS transform this produces new bytes, so the result survives
 * export, copy-paste and any consumer that only reads `src`, which is the
 * whole point of editing in the document rather than in the stylesheet.
 *
 * Throws where there is no canvas: silently returning the original would hand
 * the caller an unrotated image and no way to notice.
 */
export async function transformImage(
  source: Blob | string,
  transform: ImageTransform,
  options: TransformImageOptions = {},
): Promise<Blob> {
  if (!hasCanvas()) {
    throw new UnsupportedEnvironmentError(
      'transformImage: this environment has no canvas to draw on',
    )
  }
  const decoded = await decodeImage(source)
  try {
    const crop = cropRect(transform.crop, decoded.width, decoded.height)
    const rotate = transform.rotate ?? 0
    const swap = rotate === 90 || rotate === 270
    const width = Math.max(1, Math.round(swap ? crop.height : crop.width))
    const height = Math.max(1, Math.round(swap ? crop.width : crop.height))
    const surface = createSurface(width, height)
    if (!surface)
      throw new UnsupportedEnvironmentError(
        'transformImage: this environment has no canvas to draw on',
      )

    // Draw around the centre: rotation and flips are then a single matrix,
    // and the cropped region lands centred whichever way the axes point.
    const context = surface.context
    context.translate(width / 2, height / 2)
    if (rotate) context.rotate((rotate * Math.PI) / 180)
    context.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1)
    context.drawImage(
      decoded.source,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      -crop.width / 2,
      -crop.height / 2,
      crop.width,
      crop.height,
    )
    return await surface.encode(options.mimeType ?? 'image/png', options.quality ?? 0.92)
  } finally {
    decoded.release()
  }
}

/** Fractions to source pixels, clamped so a stray rectangle cannot draw nothing. */
function cropRect(
  crop: ImageCrop | undefined,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  if (!crop) return { x: 0, y: 0, width, height }
  const x = clamp(crop.x, 0, 1) * width
  const y = clamp(crop.y, 0, 1) * height
  return {
    x,
    y,
    width: Math.max(1, Math.min(clamp(crop.width, 0, 1) * width, width - x)),
    height: Math.max(1, Math.min(clamp(crop.height, 0, 1) * height, height - y)),
  }
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low
  return Math.min(Math.max(value, low), high)
}
