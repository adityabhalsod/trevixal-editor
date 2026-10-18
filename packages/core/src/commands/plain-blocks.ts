import type { Attrs } from '../model/attrs'
import { type BlockRange, blocksInRange } from '../model/blocks'
import { Fragment } from '../model/fragment'
import { inlineSize } from '../model/inline'
import type { EditorNode } from '../model/node'
import { pos } from '../model/position'
import { type Path, nodeAtPath } from '../model/tree'
import { AllSelection, TextSelection } from '../state/selection'
import { SetNodeAttrsStep } from '../state/steps/attrs-step'
import { ReplaceInlineStep } from '../state/steps/replace-inline'
import { ReplaceNodesStep, replaceNodeAt } from '../state/steps/replace-nodes'
import { withoutId } from '../state/steps/split-join'
import type { Transaction } from '../state/transaction'
import type { Command } from './commands'
import { isListItemTypeName, isListTypeName } from './lists'

/**
 * Make the selected blocks plain paragraphs, the part of Clear all formatting
 * that marks and layout attributes do not reach: out of every list and quote
 * around them, headings turned into paragraphs, a named paragraph style
 * dropped, and inline atoms that are styled words (a button, a badge) turned
 * into those words. Tables, callouts, columns and code stay what they are;
 * what is inside them is made plain where it stands.
 */
export const plainBlocks: Command = (state) => {
  const selection = state.selection
  const ranges = blocksInRange(state.doc, selection.from, selection.to)
  const first = ranges[0]
  const last = ranges[ranges.length - 1]
  if (!first || !last) return null
  const tr = state.tr
  let grown = 0
  for (const range of ranges) {
    const growth = atomsToWords(tr, range)
    if (range === last) grown = growth
    plainTextblock(tr, range.path)
  }
  // Taken after the steps above, which replace blocks. Lifting moves the
  // blocks without making new ones, so the selection's ends are found again
  // by identity once the lists and quotes are gone.
  const fromBlock = nodeAtPath(tr.doc, first.path)
  const toBlock = nodeAtPath(tr.doc, last.path)
  const start = first.path[0] as number
  const end = liftOutOfListsAndQuotes(tr, ranges, start, (last.path[0] as number) + 1)

  if (selection instanceof AllSelection) {
    tr.setSelection(new AllSelection(tr.doc))
  } else if (selection instanceof TextSelection && fromBlock && toBlock) {
    const fromPath = pathOf(tr.doc, fromBlock, start, end, 'first')
    const toPath = pathOf(tr.doc, toBlock, start, end, 'last')
    if (fromPath && toPath) {
      tr.setSelection(
        new TextSelection(
          pos(fromPath, selection.from.offset),
          pos(toPath, selection.to.offset + grown),
        ),
      )
    }
  }
  return tr.docChanged ? tr : null
}

/**
 * Turn the styled-words atoms in a block's selected range into their words.
 * Returns how much longer that made the range.
 */
function atomsToWords(tr: Transaction, range: BlockRange): number {
  const found: { offset: number; words: string }[] = []
  let offset = 0
  for (const child of range.node.content.children) {
    const words = child.type.spec.plainText
    if (words && child.type.isAtom && offset >= range.from && offset < range.to) {
      found.push({ offset, words: words(child) })
    }
    offset += inlineSize(child)
  }
  // Right to left, so each replacement leaves the offsets before it alone.
  for (const { offset: at, words } of found.reverse()) {
    const insert = words ? Fragment.of(tr.doc.type.schema.text(words)) : Fragment.empty
    tr.step(new ReplaceInlineStep(range.path, at, at + 1, insert))
  }
  return found.reduce((sum, { words }) => sum + words.length - 1, 0)
}

/** A heading becomes a paragraph, keeping its link target; a paragraph loses its named style. */
function plainTextblock(tr: Transaction, path: Path): void {
  const node = nodeAtPath(tr.doc, path)
  const parent = nodeAtPath(tr.doc, path.slice(0, -1))
  const paragraph = tr.doc.type.schema.nodes.paragraph
  if (!node || !parent || !paragraph) return
  if (node.type.name === 'heading') {
    const plain = paragraph.create({ id: node.attrs.id ?? null }, node.content)
    const index = path[path.length - 1] as number
    // A block that must open with a heading (a card's title, say) keeps it.
    if (!parent.type.validContent(parent.content.replaceChild(index, plain))) return
    tr.step(replaceNodeAt(path, Fragment.of(plain)))
  } else if (node.type === paragraph && node.attrs.paragraphStyle != null) {
    tr.step(new SetNodeAttrsStep(path, { ...node.attrs, paragraphStyle: null }))
  }
}

/** A block on its way up, and whether it still has to leave the list or quote it lands in. */
interface Part {
  readonly node: EditorNode
  readonly out: boolean
}

/** A child of a list or a quote being split: one that stays in it, or one leaving it. */
interface Entry extends Part {
  readonly inside: boolean
}

/** The selected blocks, and every node holding one, by path. */
interface Marked {
  readonly selected: ReadonlySet<string>
  readonly holding: ReadonlySet<string>
}

const key = (path: Path): string => path.join('.')

/**
 * Take the selected blocks out of the lists and quotes around them, in the
 * top-level blocks from `start` to `end`. A list is split around what leaves
 * it, and a point whose own line leaves takes what was under it out of that
 * list as well, as lifting a point does. Returns where the blocks that were
 * there now end.
 */
function liftOutOfListsAndQuotes(
  tr: Transaction,
  ranges: readonly BlockRange[],
  start: number,
  end: number,
): number {
  const marked: Marked = {
    selected: new Set(ranges.map((range) => key(range.path))),
    holding: new Set(
      ranges.flatMap((range) => range.path.map((_, depth) => key(range.path.slice(0, depth + 1)))),
    ),
  }
  const doc = tr.doc
  const before = doc.content.children.slice(start, end)
  const after = before.flatMap((node, index) =>
    plainParts(node, [start + index], marked).map((part) => part.node),
  )
  if (after.length === before.length && after.every((node, index) => node === before[index])) {
    return end
  }
  const children = [...doc.content.children]
  children.splice(start, end - start, ...after)
  if (!doc.type.validContent(Fragment.from(children))) return end
  tr.step(new ReplaceNodesStep([], start, end, Fragment.from(after)))
  return start + after.length
}

function plainParts(node: EditorNode, path: Path, marked: Marked): Part[] {
  if (node.isTextblock) return [{ node, out: marked.selected.has(key(path)) }]
  if (!marked.holding.has(key(path))) return [{ node, out: false }]
  const partsOf = (parent: EditorNode, at: Path): Part[] =>
    parent.content.children.flatMap((child, index) => plainParts(child, [...at, index], marked))
  const nodesOf = (parts: readonly Part[]): EditorNode[] => parts.map((part) => part.node)

  if (isListTypeName(node.type.name)) {
    const entries: Entry[] = []
    node.content.children.forEach((item, index) => {
      const itemPath = [...path, index]
      if (!isListItemTypeName(item.type.name) || !marked.holding.has(key(itemPath))) {
        entries.push({ node: item, inside: true, out: false })
        return
      }
      const kids = partsOf(item, itemPath)
      const leaving = kids.findIndex((part) => part.out)
      if (leaving < 0) {
        entries.push({ node: withChildren(item, nodesOf(kids)), inside: true, out: false })
        return
      }
      // The lines before the first plain one stay a point. From there on
      // everything leaves this list: the plain lines on their way out of every
      // list and quote, and what was under them to stand beside them.
      if (leaving > 0) {
        const kept = withChildren(item, nodesOf(kids.slice(0, leaving)))
        entries.push({ node: kept, inside: true, out: false })
      }
      for (const part of kids.slice(leaving)) entries.push({ ...part, inside: false })
    })
    return splitAround(node, entries)
  }

  const kids = partsOf(node, path)
  if (node.type.name === 'blockquote') {
    return splitAround(
      node,
      kids.map((part) => ({ ...part, inside: !part.out })),
    )
  }
  // Any other block holds what it holds: what was on its way out stops here.
  const placed = withChildren(node, nodesOf(kids))
  const valid = placed === node || node.type.validContent(placed.content)
  return [{ node: valid ? placed : node, out: false }]
}

/**
 * The wrapper around each run of children that stay in it, with what leaves
 * it in between. The first run keeps the wrapper itself; a later one is a new
 * wrapper of the same kind, without the first one's id, and a numbered list
 * carries on counting from where the run before it stopped.
 */
function splitAround(wrapper: EditorNode, entries: readonly Entry[]): Part[] {
  const parts: Part[] = []
  let run: EditorNode[] = []
  let kept = 0
  const flush = (): void => {
    if (run.length === 0) return
    const node =
      kept === 0
        ? withChildren(wrapper, run)
        : wrapper.type.create(continued(wrapper.attrs, kept), Fragment.from(run))
    parts.push({ node, out: false })
    kept += run.length
    run = []
  }
  for (const entry of entries) {
    if (entry.inside) {
      run.push(entry.node)
      continue
    }
    flush()
    parts.push({ node: entry.node, out: entry.out })
  }
  flush()
  return parts
}

function continued(attrs: Attrs, kept: number): Attrs {
  const next = withoutId(attrs)
  return typeof attrs.start === 'number' ? { ...next, start: attrs.start + kept } : next
}

/** `node` with these children, or `node` itself when they are the ones it has. */
function withChildren(node: EditorNode, children: readonly EditorNode[]): EditorNode {
  const same =
    children.length === node.childCount &&
    children.every((child, index) => child === node.child(index))
  return same ? node : node.withContent(Fragment.from(children))
}

/** Where `target` sits among top-level blocks `start` to `end`: its first place, or its last. */
function pathOf(
  doc: EditorNode,
  target: EditorNode,
  start: number,
  end: number,
  which: 'first' | 'last',
): Path | null {
  let found: Path | null = null
  const walk = (node: EditorNode, path: Path): boolean => {
    if (node === target) {
      found = path
      return which === 'first'
    }
    if (node.isTextblock) return false
    return node.content.children.some((child, index) => walk(child, [...path, index]))
  }
  for (let index = start; index < end; index++) {
    if (walk(doc.child(index), [index])) break
  }
  return found
}
