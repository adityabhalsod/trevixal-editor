import { setMark, unsetMark } from '../commands/commands'
import type { Attrs } from '../model/attrs'
import type { Editor, EditorSnapshot } from './editor'

/**
 * A captured set of formatting: the inline marks with their attributes, and
 * optionally the block type and its layout. Plain data, so an application can
 * store it, show it, or apply it later.
 */
export interface CopiedFormat {
  /** Mark name → attributes, for every mark active at the copy point. */
  readonly marks: Readonly<Record<string, Attrs>>
  /** Block type name, when block formatting was included. */
  readonly blockType: string | null
  readonly blockAttrs: Attrs | null
}

export interface FormatPainterOptions {
  /**
   * Copy the block type and alignment as well as the inline marks.
   * On by default: it is what users expect from a format painter.
   */
  readonly includeBlock?: boolean
  /** Notified whenever the armed state changes, for button styling. */
  readonly onChange?: (state: FormatPainterState) => void
}

export interface FormatPainterState {
  /** The captured format, or null when nothing has been copied. */
  readonly format: CopiedFormat | null
  /** True while the painter will apply to the next selection. */
  readonly armed: boolean
  /** True when armed until explicitly turned off, rather than for one use. */
  readonly locked: boolean
}

/** Marks that describe formatting. Links and suggestions are not styling. */
const NON_FORMATTING = new Set(['link', 'insertion', 'deletion', 'comment'])

/**
 * Copies formatting from one place in the document and applies it to another:
 * the "format painter" every word processor has.
 *
 * Single-arm applies once and disarms; {@link copyAndLock} stays armed until
 * turned off, which is the double-click behaviour users expect.
 */
export class FormatPainter {
  private format: CopiedFormat | null = null
  private armed = false
  private locked = false

  constructor(
    private readonly editor: Editor,
    private readonly options: FormatPainterOptions = {},
  ) {}

  get state(): FormatPainterState {
    return { format: this.format, armed: this.armed, locked: this.locked }
  }

  /** Capture the formatting at the current selection and arm for one use. */
  copy(): boolean {
    return this.capture(false)
  }

  /** Capture and stay armed until {@link cancel}, the double-click mode. */
  copyAndLock(): boolean {
    return this.capture(true)
  }

  /** Disarm without clearing what was copied. */
  cancel(): void {
    if (!this.armed && !this.locked) return
    this.armed = false
    this.locked = false
    this.emit()
  }

  /**
   * Apply the captured formatting to the current selection. Disarms
   * afterwards unless locked. Returns false when nothing was applied.
   */
  apply(): boolean {
    const format = this.format
    if (!format) return false

    const snapshot = this.editor.getSnapshot()
    const chain = this.editor.chain()

    // Remove the formatting already there, so the result is the copied style
    // rather than a merge of the two.
    for (const name of snapshot.activeMarks) {
      if (!NON_FORMATTING.has(name) && !(name in format.marks)) {
        chain.command(unsetMark(name))
      }
    }
    for (const [name, attrs] of Object.entries(format.marks)) {
      chain.command(setMark(name, attrs))
    }

    if (format.blockType) {
      chain.setBlockType(format.blockType, format.blockAttrs ?? undefined)
    }

    const applied = chain.run()
    if (!this.locked) {
      this.armed = false
      this.emit()
    }
    return applied
  }

  private capture(locked: boolean): boolean {
    const snapshot = this.editor.getSnapshot()
    this.format = formatFromSnapshot(snapshot, this.options.includeBlock !== false)
    this.armed = true
    this.locked = locked
    this.emit()
    return true
  }

  private emit(): void {
    this.options.onChange?.(this.state)
  }
}

/** Extract the formatting half of a snapshot. Exported for testing and reuse. */
export function formatFromSnapshot(snapshot: EditorSnapshot, includeBlock = true): CopiedFormat {
  const marks: Record<string, Attrs> = {}
  for (const name of snapshot.activeMarks) {
    if (NON_FORMATTING.has(name)) continue
    marks[name] = snapshot.markAttrs[name] ?? {}
  }

  if (!includeBlock) return { marks, blockType: null, blockAttrs: null }

  // Carry the layout attributes, but not content-bearing ones like a code
  // block's language, pasting a style should not change what a block means.
  const blockAttrs: Record<string, unknown> = {}
  if (snapshot.align !== null) blockAttrs.align = snapshot.align
  if (snapshot.indent) blockAttrs.indent = snapshot.indent
  const level = snapshot.blockAttrs?.level
  if (typeof level === 'number') blockAttrs.level = level

  return {
    marks,
    blockType: snapshot.blockType,
    blockAttrs: Object.keys(blockAttrs).length > 0 ? blockAttrs : null,
  }
}

/** A short human-readable description of a copied format, for a tooltip. */
export function describeFormat(format: CopiedFormat | null): string {
  if (!format) return 'Nothing copied'
  const parts: string[] = []
  if (format.blockType && format.blockType !== 'paragraph') parts.push(format.blockType)
  parts.push(...Object.keys(format.marks))
  return parts.length > 0 ? parts.join(', ') : 'Plain text'
}
