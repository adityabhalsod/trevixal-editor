import { Fragment } from './fragment'
import { type Mark, marksEq } from './mark'
import type { EditorNode, TextNode } from './node'
import type { MarkType, NodeType } from './schema'

/**
 * Inline content addressing: character offsets within a textblock. Text nodes
 * contribute their length; inline atoms (hard break, footnote marker, …) count as 1.
 */
export function inlineSize(node: EditorNode): number {
  return node.isText ? (node as TextNode).text.length : 1
}

export function inlineLength(frag: Fragment): number {
  return frag.children.reduce((sum, child) => sum + inlineSize(child), 0)
}

/** Last grapheme length of a string (surrogate/ZWJ aware where supported). */
function lastGraphemeLength(text: string): number {
  if (text.length === 0) return 0
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    let last = ''
    for (const { segment } of new Intl.Segmenter().segment(text)) last = segment
    return last.length
  }
  const codePoint = text.codePointAt(text.length - 2)
  return codePoint !== undefined && codePoint > 0xffff ? 2 : 1
}

function firstGraphemeLength(text: string): number {
  if (text.length === 0) return 0
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    for (const { segment } of new Intl.Segmenter().segment(text)) return segment.length
  }
  const codePoint = text.codePointAt(0)
  return codePoint !== undefined && codePoint > 0xffff ? 2 : 1
}

/** The offset one deletion unit (grapheme or atom) before `offset`, or -1 at the start. */
export function previousInlineBoundary(frag: Fragment, offset: number): number {
  if (offset <= 0) return -1
  let pos = 0
  for (const child of frag.children) {
    const size = inlineSize(child)
    const end = pos + size
    if (offset > pos && offset <= end) {
      if (!child.isText) return pos
      const local = offset - pos
      return offset - lastGraphemeLength((child as TextNode).text.slice(0, local))
    }
    pos = end
  }
  return -1
}

/** The offset one deletion unit (grapheme or atom) after `offset`, or -1 at the end. */
export function nextInlineBoundary(frag: Fragment, offset: number): number {
  if (offset >= inlineLength(frag)) return -1
  let pos = 0
  for (const child of frag.children) {
    const size = inlineSize(child)
    const end = pos + size
    if (offset >= pos && offset < end) {
      if (!child.isText) return end
      const local = offset - pos
      return offset + firstGraphemeLength((child as TextNode).text.slice(local))
    }
    pos = end
  }
  return -1
}

/** Cut the inline content between two character offsets. Atoms are kept only when fully inside. */
export function sliceInline(frag: Fragment, from: number, to: number): Fragment {
  if (from >= to) return Fragment.empty
  const out: EditorNode[] = []
  let pos = 0
  for (const child of frag.children) {
    const size = inlineSize(child)
    const start = pos
    const end = pos + size
    pos = end
    if (end <= from) continue
    if (start >= to) break
    if (child.isText) {
      const cutFrom = Math.max(from - start, 0)
      const cutTo = Math.min(to - start, size)
      out.push(cutFrom === 0 && cutTo === size ? child : (child as TextNode).cut(cutFrom, cutTo))
    } else if (start >= from && end <= to) {
      out.push(child)
    }
  }
  return Fragment.from(out)
}

/** Merge adjacent text nodes that share an identical mark set. */
export function mergeInline(frag: Fragment): Fragment {
  const out: EditorNode[] = []
  for (const child of frag.children) {
    const last = out[out.length - 1]
    if (last?.isText && child.isText && marksEq(last.marks, child.marks)) {
      const lastText = last as TextNode
      out[out.length - 1] = lastText.withText(lastText.text + (child as TextNode).text)
    } else {
      out.push(child)
    }
  }
  return out.length === frag.childCount ? frag : Fragment.from(out)
}

/**
 * Adapt inline content to what a block will actually hold. Marks the block
 * forbids are dropped, and an inline node it cannot contain is reduced to the
 * text it stands for. A hard break becomes a newline, which is the same line
 * ending written in the only form a `text*` block such as a code block can
 * store. Without this, pasting formatted text into a code block builds a
 * document the schema would reject.
 */
export function coerceInlineFor(type: NodeType, nodes: readonly EditorNode[]): EditorNode[] {
  const out: EditorNode[] = []
  for (const node of nodes) {
    if (node.isText) {
      const kept = node.marks.filter((mark) => type.allowsMarkType(mark.type))
      out.push(kept.length === node.marks.length ? node : node.withMarks(kept))
      continue
    }
    if (type.validContent(Fragment.of(node))) {
      out.push(node)
      continue
    }
    const text = node.type.name === 'hardBreak' ? '\n' : node.textContent
    if (text.length > 0) out.push(node.type.schema.text(text))
  }
  return mergeInline(Fragment.from(out)).children as EditorNode[]
}

/**
 * Map an offset in a textblock's rendered text back to an inline offset. Text
 * contributes one character per position, but an inline atom counts as a
 * single position while rendering however many characters it likes, none at
 * all, for a hard break, so the two scales drift apart the moment a block
 * holds one. An offset landing inside an atom resolves to its nearer edge,
 * since an atom has no positions within it.
 */
export function inlineOffsetFromText(frag: Fragment, textOffset: number): number {
  let chars = 0
  let inline = 0
  for (const child of frag.children) {
    const childChars = child.textContent.length
    if (chars + childChars >= textOffset) {
      if (child.isText) return inline + (textOffset - chars)
      return textOffset <= chars ? inline : inline + 1
    }
    chars += childChars
    inline += inlineSize(child)
  }
  return inline
}

/** Replace the inline range [from, to) with the given inline fragment. */
export function replaceInline(
  frag: Fragment,
  from: number,
  to: number,
  insert: Fragment,
): Fragment {
  const before = sliceInline(frag, 0, from)
  const after = sliceInline(frag, to, inlineLength(frag))
  return mergeInline(before.append(insert).append(after))
}

/** Add or remove a mark across the inline range [from, to). */
export function applyInlineMark(
  frag: Fragment,
  from: number,
  to: number,
  mark: Mark,
  add: boolean,
): Fragment {
  const out: EditorNode[] = []
  let pos = 0
  for (const child of frag.children) {
    const size = inlineSize(child)
    const start = pos
    const end = pos + size
    pos = end
    if (end <= from || start >= to) {
      out.push(child)
      continue
    }
    const apply = (node: EditorNode): EditorNode =>
      node.withMarks(add ? mark.addToSet(node.marks) : mark.removeFromSet(node.marks))
    if (!child.isText) {
      out.push(start >= from && end <= to ? apply(child) : child)
      continue
    }
    const text = child as TextNode
    const cutFrom = Math.max(from - start, 0)
    const cutTo = Math.min(to - start, size)
    if (cutFrom > 0) out.push(text.cut(0, cutFrom))
    out.push(apply(text.cut(cutFrom, cutTo)))
    if (cutTo < size) out.push(text.cut(cutTo, size))
  }
  return mergeInline(Fragment.from(out))
}

/** True when every markable node overlapping [from, to) carries a mark of this type. */
export function rangeHasMark(
  frag: Fragment,
  from: number,
  to: number,
  markType: MarkType,
): boolean {
  let sawContent = false
  let pos = 0
  for (const child of frag.children) {
    const size = inlineSize(child)
    const start = pos
    const end = pos + size
    pos = end
    if (end <= from || start >= to) continue
    if (!child.isText) continue
    sawContent = true
    if (!child.marks.some((mark) => mark.type === markType)) return false
  }
  return sawContent
}

/**
 * Contiguous subranges of [from, to) where a mark of this type is present,
 * with the exact mark instance per range (ranges split when attributes
 * change), used to build exactly-invertible RemoveMark steps.
 */
export function rangesWithMark(
  frag: Fragment,
  from: number,
  to: number,
  markType: MarkType,
): readonly { from: number; to: number; mark: Mark }[] {
  const ranges: { from: number; to: number; mark: Mark }[] = []
  let pos = 0
  for (const child of frag.children) {
    const size = inlineSize(child)
    const start = pos
    const end = pos + size
    pos = end
    if (end <= from || start >= to) continue
    const mark = child.marks.find((candidate) => candidate.type === markType)
    if (!mark) continue
    const overlapFrom = Math.max(start, from)
    const overlapTo = Math.min(end, to)
    const last = ranges[ranges.length - 1]
    if (last && last.to === overlapFrom && last.mark.eq(mark)) {
      last.to = overlapTo
    } else {
      ranges.push({ from: overlapFrom, to: overlapTo, mark })
    }
  }
  return ranges
}

/** The mark set adjacent to an inline offset: what typing there should inherit. */
export function marksAtInlineOffset(frag: Fragment, offset: number): readonly Mark[] {
  let pos = 0
  for (const child of frag.children) {
    const size = inlineSize(child)
    const end = pos + size
    // Prefer the node ending at the offset (marks continue from the left).
    if (offset > pos && offset <= end) return child.isText ? child.marks : []
    pos = end
  }
  const first = frag.maybeChild(0)
  return first?.isText ? first.marks : []
}
