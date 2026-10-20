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

/** A side of a box, as the page has it: `left` is the left in either direction. */
export type RenderedSide = 'top' | 'right' | 'bottom' | 'left'

/** The lines the stylesheet draws round a block: a callout's edge, a card's frame. */
export interface RenderedBorder {
  /** `#rrggbb`. */
  readonly color: string
  /** In CSS pixels. */
  readonly width: number
  readonly sides: readonly RenderedSide[]
}

/** The ground and lines the stylesheet gives a block. */
export interface RenderedBox {
  /** `#rrggbb` behind the block, absent where the page shows through. */
  readonly fill?: string
  readonly border?: RenderedBorder
}

/**
 * How the stylesheet sets a node's text where it differs from what holds the
 * node: a finished task struck through, a toggle's summary bold, a footnote's
 * marker raised. Each field is only present where it differs.
 */
export interface RenderedLook {
  /** `#rrggbb`. */
  readonly color?: string
  /** `#rrggbb` behind an inline atom: a badge's pill, a field's box. */
  readonly fill?: string
  readonly bold?: boolean
  readonly italic?: boolean
  readonly strike?: boolean
  readonly underline?: boolean
  /** Raised, as a superscript is. */
  readonly raised?: boolean
  /** Its size against what holds it: 0.75 is three quarters. */
  readonly scale?: number
  /** The side of the page its lines line up on, where it differs. */
  readonly align?: 'left' | 'center' | 'right'
  /** Text the stylesheet writes before and after it: a footnote marker's brackets. */
  readonly before?: string
  readonly after?: string
}

/** A code line the editor marks: its number in the gutter, or its band. */
export interface RenderedLine {
  /** The line, counted from 1. */
  readonly line: number
  /** `#rrggbb` the line is banded in: picked out, added, removed. */
  readonly band?: string
}

/** What the editor drew for one block beyond what the block itself says. */
export interface RenderedBlock {
  readonly runs?: readonly RenderedRun[]
  readonly image?: RenderedImage
  readonly box?: RenderedBox
  readonly look?: RenderedLook
  /** A code block's marked lines, where any is. */
  readonly lines?: readonly RenderedLine[]
}

/** Keyed by the model node the writer is emitting. */
export type RenderedDocument = ReadonlyMap<EditorNode, RenderedBlock>
