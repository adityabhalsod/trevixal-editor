import type { EditorNode } from '@trevixal/core'

/**
 * What the editor drew that the document does not hold.
 *
 * Syntax highlighting is a decoration layer and a diagram preview is an
 * element the renderer appends: neither is in the model, so a writer walking
 * the model alone emits code with no colour and a diagram as the source text
 * describing it. `@trevixal/ui` reads both back off the live editor and hands
 * them down through the export context; the shapes here mirror its own.
 */

/** A run of code text, with the colour and weight the editor drew it in. */
export interface RenderedRun {
  readonly text: string
  /** `#rrggbb`, or absent for text in the block's own colour. */
  readonly color?: string
  readonly bold?: boolean
  readonly italic?: boolean
}

/** A picture of something the document only describes in words. */
export interface RenderedImage {
  /** A PNG data URL. Absent where nothing was able to draw one. */
  readonly src?: string
  readonly width: number
  readonly height: number
  readonly alt: string
}

/** What the editor drew for one block beyond what the block itself says. */
export interface RenderedBlock {
  readonly runs?: readonly RenderedRun[]
  readonly image?: RenderedImage
}

/** Keyed by the model node the writer is emitting. */
export type RenderedDocument = ReadonlyMap<EditorNode, RenderedBlock>
