import type { EditorNode } from '@trevixal/core'

/**
 * A document as slides: each top-level heading starts one, at the highest
 * level the document has, so a talk written with level-two headings works
 * as well as one with level-one. A level used only once is the document's
 * title: it opens the talk, and the slides split at the level below it.
 * Note callouts are the speaker's notes: they leave the slide and go to its
 * notes instead.
 */

export interface Slide {
  /** The heading's text; empty for what comes before the first heading. */
  readonly title: string
  /** The blocks under the heading, notes taken out. */
  readonly blocks: readonly EditorNode[]
  /** The speaker's notes, a paragraph a note callout. */
  readonly notes: readonly string[]
}

/** A callout with the `note` variant: what the speaker says, not what the room sees. */
function isNote(block: EditorNode): boolean {
  return block.type.name === 'callout' && block.attrs.variant === 'note'
}

/**
 * The heading level slides split at: the highest one the document uses more
 * than once, or the highest one when every level is used once.
 */
function slideLevel(doc: EditorNode): number | null {
  const counts = new Map<number, number>()
  for (const block of doc.content.children) {
    if (block.type.name !== 'heading') continue
    const level = Number(block.attrs.level) || 1
    counts.set(level, (counts.get(level) ?? 0) + 1)
  }
  const levels = [...counts.keys()].sort((a, b) => a - b)
  return levels.find((level) => (counts.get(level) ?? 0) > 1) ?? levels[0] ?? null
}

/** The slides a document makes, in order. A document with no headings is one slide. */
export function documentSlides(doc: EditorNode): Slide[] {
  const level = slideLevel(doc)
  const slides: { title: string; blocks: EditorNode[]; notes: string[] }[] = []
  let current: { title: string; blocks: EditorNode[]; notes: string[] } | null = null
  for (const block of doc.content.children) {
    // A title above the split level opens a slide of its own.
    const starts =
      block.type.name === 'heading' && level !== null && (Number(block.attrs.level) || 1) <= level
    if (starts || !current) {
      current = { title: starts ? block.textContent.trim() : '', blocks: [], notes: [] }
      slides.push(current)
      if (starts) continue
    }
    if (isNote(block)) current.notes.push(block.textContent.trim())
    else current.blocks.push(block)
  }
  // An untitled opening with nothing in it is just the gap before the first heading.
  return slides.filter(
    (slide, index) =>
      index > 0 ||
      slide.title !== '' ||
      slide.blocks.some((block) => block.textContent.trim() !== ''),
  )
}
