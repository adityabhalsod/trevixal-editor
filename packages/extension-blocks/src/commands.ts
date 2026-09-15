import {
  type Command,
  type EditorNode,
  Fragment,
  type Path,
  ReplaceNodesStep,
  SetNodeAttrsStep,
  TextSelection,
  insertInlineNode,
  nodeAtPath,
  pos,
  safeHref,
} from '@trevixal/core'
import {
  emptyParagraph,
  findAncestor,
  findChildIndex,
  insertBlockHere,
  selectFirstTextblock,
} from './helpers'
import {
  type BadgeTone,
  type CalloutVariant,
  badgeTone,
  calloutVariant,
  clampColumnCount,
  isContainerNode,
  isContentContainerNode,
  safeAnchorId,
} from './schema'

/** Insert an empty callout of the given variant and put the cursor inside it. */
export function insertCallout(variant: CalloutVariant = 'info'): Command {
  return (state) => {
    const schema = state.schema
    const callout = schema
      .nodeType('callout')
      .create({ variant: calloutVariant(variant), icon: null }, Fragment.of(emptyParagraph(schema)))
    const inserted = insertBlockHere(state, callout)
    if (!inserted) return null
    inserted.tr.setSelection(selectFirstTextblock(callout, inserted.path))
    return inserted.tr
  }
}

/** Re-flavor the callout containing the selection. */
export function setCalloutVariant(variant: CalloutVariant): Command {
  return (state) => {
    const found = findAncestor(state.doc, state.selection.from.path, 'callout')
    if (!found) return null
    const next = calloutVariant(variant)
    if (found.node.attrs.variant === next) return null
    const tr = state.tr
    tr.step(new SetNodeAttrsStep(found.path, { ...found.node.attrs, variant: next }))
    return tr
  }
}

/** Insert a toggle with an empty summary and one empty body paragraph. */
export const insertToggleBlock: Command = (state) => {
  const schema = state.schema
  const toggle = schema
    .nodeType('toggleBlock')
    .create(
      { open: true },
      Fragment.from([
        schema.nodeType('toggleSummary').create(),
        schema.nodeType('toggleContent').create(undefined, Fragment.of(emptyParagraph(schema))),
      ]),
    )
  const inserted = insertBlockHere(state, toggle)
  if (!inserted) return null
  // The summary is where a user starts typing. It is the toggle's title.
  inserted.tr.setSelection(new TextSelection(pos([...inserted.path, 0], 0)))
  return inserted.tr
}

/** Fold or unfold the toggle containing the selection. */
export const toggleToggleOpen: Command = (state) => {
  const found = findAncestor(state.doc, state.selection.from.path, 'toggleBlock')
  if (!found) return null
  const tr = state.tr
  tr.step(
    new SetNodeAttrsStep(found.path, {
      ...found.node.attrs,
      open: found.node.attrs.open === false,
    }),
  )
  return tr
}

/** Insert a column layout of `count` (clamped 2..4) empty columns. */
export function insertColumns(count = 2): Command {
  return (state) => {
    const schema = state.schema
    const columns = clampColumnCount(count)
    const children: EditorNode[] = []
    for (let i = 0; i < columns; i++) {
      children.push(
        schema.nodeType('column').create({ width: null }, Fragment.of(emptyParagraph(schema))),
      )
    }
    const block = schema.nodeType('columnBlock').create({ count: columns }, Fragment.from(children))
    const inserted = insertBlockHere(state, block)
    if (!inserted) return null
    inserted.tr.setSelection(new TextSelection(pos([...inserted.path, 0, 0], 0)))
    return inserted.tr
  }
}

/**
 * Grow or shrink the column layout containing the selection. Added columns
 * start empty; removed ones take their content with them, so shrinking is
 * only offered when the columns being dropped are empty.
 */
export function setColumnCount(count: number): Command {
  return (state) => {
    const found = findAncestor(state.doc, state.selection.from.path, 'columnBlock')
    if (!found) return null
    const target = clampColumnCount(count)
    const current = found.node.childCount
    if (target === current) return null
    const schema = state.schema
    const tr = state.tr
    if (target > current) {
      const added: EditorNode[] = []
      for (let i = current; i < target; i++) {
        added.push(
          schema.nodeType('column').create({ width: null }, Fragment.of(emptyParagraph(schema))),
        )
      }
      tr.step(new ReplaceNodesStep(found.path, current, current, Fragment.from(added)))
    } else {
      // Refuse to silently discard writing: only empty tail columns may go.
      for (let i = target; i < current; i++) {
        if (found.node.child(i).textContent.length > 0) return null
      }
      tr.step(new ReplaceNodesStep(found.path, target, current, Fragment.empty))
    }
    tr.step(new SetNodeAttrsStep(found.path, { ...found.node.attrs, count: target }))
    return tr
  }
}

/** Insert an empty card and put the cursor inside it. */
export const insertCard: Command = (state) => {
  const schema = state.schema
  const card = schema.nodeType('card').create(undefined, Fragment.of(emptyParagraph(schema)))
  const inserted = insertBlockHere(state, card)
  if (!inserted) return null
  inserted.tr.setSelection(selectFirstTextblock(card, inserted.path))
  return inserted.tr
}

/** Insert a timeline seeded with one empty entry. */
export const insertTimeline: Command = (state) => {
  const schema = state.schema
  const item = schema
    .nodeType('timelineItem')
    .create({ marker: null }, Fragment.of(emptyParagraph(schema)))
  const timeline = schema.nodeType('timeline').create(undefined, Fragment.of(item))
  const inserted = insertBlockHere(state, timeline)
  if (!inserted) return null
  inserted.tr.setSelection(new TextSelection(pos([...inserted.path, 0, 0], 0)))
  return inserted.tr
}

/** Append an entry after the timeline entry holding the selection. */
export const insertTimelineItem: Command = (state) => {
  const found = findAncestor(state.doc, state.selection.from.path, 'timeline')
  if (!found) return null
  const itemIndex = state.selection.from.path[found.path.length]
  if (itemIndex === undefined) return null
  const schema = state.schema
  const item = schema
    .nodeType('timelineItem')
    .create({ marker: null }, Fragment.of(emptyParagraph(schema)))
  const at = itemIndex + 1
  const tr = state.tr
  tr.step(new ReplaceNodesStep(found.path, at, at, Fragment.of(item)))
  tr.setSelection(new TextSelection(pos([...found.path, at, 0], 0)))
  return tr
}

/**
 * Insert a page break after the current block. Never replaces the current
 * block, a break is punctuation between blocks, not a block of its own, and
 * climbs out of a parent that cannot hold one (a tab item, a toggle).
 */
export const insertPageBreak: Command = (state) => {
  const pageBreak = state.schema.nodeType('pageBreak').create()
  const inserted = insertBlockHere(state, pageBreak, false)
  return inserted ? inserted.tr : null
}

/** Insert an inline badge at the cursor. */
export function insertBadge(label: string, tone: BadgeTone = 'neutral'): Command {
  return (state) => {
    if (label.length === 0) return null
    return insertInlineNode('badge', { label, tone: badgeTone(tone) })(state)
  }
}

/**
 * Insert an inline button. An unsafe href is dropped rather than stored, so
 * the document never carries a `javascript:` target waiting to be rendered.
 */
export function insertButton(label: string, href: string | null = null): Command {
  return (state) => {
    if (label.length === 0) return null
    return insertInlineNode('buttonBlock', { label, href: href === null ? null : safeHref(href) })(
      state,
    )
  }
}

/**
 * Insert a footnote: a reference at the cursor plus its matching item in the
 * document's footnote list, which is created at the end of the document when
 * this is the first footnote. Ids are validated, so a caller-supplied id that
 * could escape into an href or an `id` attribute declines instead.
 */
export function insertFootnote(id?: string): Command {
  return (state) => {
    const schema = state.schema
    // A ref inside the footnote apparatus would make a footnote cite itself;
    // decline, the way insertCitation declines inside the reference list.
    if (findAncestor(state.doc, state.selection.from.path, 'footnoteList')) return null
    const footnoteId = id === undefined ? nextFootnoteId(state.doc) : safeAnchorId(id)
    if (!footnoteId) return null
    // A duplicate id would make two refs point at one item, decline.
    if (id !== undefined && findFootnoteItem(state.doc, footnoteId)) return null

    const tr = insertInlineNode('footnoteRef', { id: footnoteId })(state)
    if (!tr) return null

    const item = schema
      .nodeType('footnoteItem')
      .create({ id: footnoteId }, Fragment.of(emptyParagraph(schema)))
    const listIndex = findChildIndex(tr.doc, 'footnoteList')
    if (listIndex === null) {
      const list = schema.nodeType('footnoteList').create(undefined, Fragment.of(item))
      const at = tr.doc.childCount
      tr.step(new ReplaceNodesStep([], at, at, Fragment.of(list)))
    } else {
      const list = tr.doc.child(listIndex)
      tr.step(
        new ReplaceNodesStep([listIndex], list.childCount, list.childCount, Fragment.of(item)),
      )
    }
    return tr
  }
}

/** Insert an inline anchor target; rejects ids that are not fragment-safe. */
export function insertAnchor(id: string): Command {
  return (state) => {
    const anchorId = safeAnchorId(id)
    if (!anchorId) return null
    return insertInlineNode('anchor', { id: anchorId })(state)
  }
}

/**
 * Move the block holding the selection out of its container and into the
 * container's own parent, just after it. This is the escape hatch for a
 * container that would otherwise trap the cursor at the end of the document.
 *
 * Two kinds of container are handled. A callout or card sits among ordinary
 * blocks, so the block is left right after it. A column or a content slot
 * (toggle body, tab panel, accordion body) is a fixed part of a larger block
 * whose parent only accepts that structure, `columnBlock` takes `column+`,
 * `tabItem` takes `tabTitle tabContent`, so the block leaves past the whole
 * layout, toggle, tabs block or accordion instead, and never empties the slot,
 * which must keep one block.
 */
export const liftOutOfContainer: Command = (state) => {
  const blockPath = state.selection.from.path
  if (blockPath.length < 2) return null
  const containerPath = blockPath.slice(0, -1)
  const container = nodeAtPath(state.doc, containerPath)
  if (!container || !isContainerNode(container)) return null

  const block = nodeAtPath(state.doc, blockPath)
  if (!block) return null
  const index = blockPath[blockPath.length - 1] as number
  // Only the last child can leave without splitting the container in two.
  if (index !== container.childCount - 1) return null

  const tr = state.tr
  if (isContentContainerNode(container) || container.type.name === 'column') {
    // The slot's own parent (toggleBlock, tabItem, accordionItem, columnBlock)
    // is fixed structure; the block lands after the outermost block in that
    // chain rather than beside siblings its parent would reject.
    const outerPath = outerBlockPath(state.doc, containerPath)
    if (!outerPath || container.childCount === 1) return null
    const landingParent = outerPath.slice(0, -1)
    const landingIndex = (outerPath[outerPath.length - 1] as number) + 1
    tr.step(new ReplaceNodesStep(containerPath, index, index + 1, Fragment.empty))
    tr.step(new ReplaceNodesStep(landingParent, landingIndex, landingIndex, Fragment.of(block)))
    tr.setSelection(new TextSelection(pos([...landingParent, landingIndex], 0)))
    return tr
  }

  const grandparentPath = containerPath.slice(0, -1)
  const containerIndex = containerPath[containerPath.length - 1] as number

  if (container.childCount === 1) {
    // Removing the only child would leave an invalid empty container, so the
    // container itself is replaced by the block it held.
    tr.step(
      new ReplaceNodesStep(grandparentPath, containerIndex, containerIndex + 1, Fragment.of(block)),
    )
    tr.setSelection(new TextSelection(pos([...grandparentPath, containerIndex], 0)))
    return tr
  }

  tr.step(new ReplaceNodesStep(containerPath, index, index + 1, Fragment.empty))
  tr.step(
    new ReplaceNodesStep(
      grandparentPath,
      containerIndex + 1,
      containerIndex + 1,
      Fragment.of(block),
    ),
  )
  tr.setSelection(new TextSelection(pos([...grandparentPath, containerIndex + 1], 0)))
  return tr
}

/**
 * Path of the block a fixed slot ultimately belongs to: the toggle for a
 * toggleContent, the layout for a column, the tabs block for a tabContent
 * (through its tabItem), the accordion for an accordionContent.
 */
function outerBlockPath(doc: EditorNode, slotPath: Path): Path | null {
  const slot = nodeAtPath(doc, slotPath)
  if (!slot) return null
  // toggleContent → toggleBlock; column → columnBlock;
  // tabContent → tabItem → tabsBlock; accordionContent → accordionItem → accordion.
  const name = slot.type.name
  const levels = name === 'toggleContent' || name === 'column' ? 1 : 2
  if (slotPath.length < levels) return null
  return slotPath.slice(0, -levels)
}

/** The footnote item carrying an id, wherever it sits in the document. */
function findFootnoteItem(doc: EditorNode, id: string): EditorNode | null {
  const listIndex = findChildIndex(doc, 'footnoteList')
  if (listIndex === null) return null
  const list = doc.child(listIndex)
  for (const item of list.content.children) {
    if (item.attrs.id === id) return item
  }
  return null
}

/** The lowest positive integer id not already taken by a footnote item. */
function nextFootnoteId(doc: EditorNode): string {
  const taken = new Set<string>()
  const listIndex = findChildIndex(doc, 'footnoteList')
  if (listIndex !== null) {
    for (const item of doc.child(listIndex).content.children) {
      if (typeof item.attrs.id === 'string') taken.add(item.attrs.id)
    }
  }
  let n = 1
  while (taken.has(String(n))) n++
  return String(n)
}
