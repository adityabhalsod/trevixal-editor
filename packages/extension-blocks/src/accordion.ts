import {
  type Command,
  type EditorNode,
  Fragment,
  type Path,
  ReplaceNodesStep,
  type Schema,
  SetNodeAttrsStep,
  TextSelection,
  type Transaction,
  nodeAtPath,
  pos,
} from '@trevixal/core'
import {
  clampCount,
  emptyParagraph,
  findAncestor,
  insertBlockHere,
  selectTextblockContent,
} from './helpers'
import { MAX_SECTIONS } from './schema'

/** Where a path sits inside an accordion. */
export interface AccordionContext {
  readonly accordion: EditorNode
  readonly accordionPath: Path
  readonly item: EditorNode
  readonly itemPath: Path
  readonly index: number
}

/** The accordion and item enclosing `path`, or null outside an item. */
export function accordionContextAt(doc: EditorNode, path: Path): AccordionContext | null {
  const found = findAncestor(doc, path, 'accordion')
  if (!found) return null
  const index = path[found.path.length]
  if (index === undefined || index >= found.node.childCount) return null
  const item = found.node.child(index)
  if (item.type.name !== 'accordionItem') return null
  return {
    accordion: found.node,
    accordionPath: found.path,
    item,
    itemPath: [...found.path, index],
    index,
  }
}

function makeItem(schema: Schema, title: string, open: boolean): EditorNode {
  return schema
    .nodeType('accordionItem')
    .create(
      { open },
      Fragment.from([
        schema
          .nodeType('accordionTitle')
          .create(undefined, title ? Fragment.of(schema.text(title)) : undefined),
        schema.nodeType('accordionContent').create(undefined, Fragment.of(emptyParagraph(schema))),
      ]),
    )
}

/**
 * Close every open item of the accordion at `accordionPath` other than
 * `keep`. Steps are added to `tr`; returns whether anything closed.
 */
export function closeOtherItems(tr: Transaction, accordionPath: Path, keep: number): boolean {
  const accordion = nodeAtPath(tr.doc, accordionPath)
  if (!accordion) return false
  let changed = false
  for (let i = 0; i < accordion.childCount; i++) {
    if (i === keep) continue
    const item = accordion.child(i)
    if (item.attrs.open !== true) continue
    tr.step(new SetNodeAttrsStep([...accordionPath, i], { ...item.attrs, open: false }))
    changed = true
  }
  return changed
}

/**
 * Open or close the accordion item at `itemPath`, closing its siblings when
 * the accordion is exclusive and this one opens. This is the shared writer
 * for the command and the DOM `toggle` binding. Null when nothing changes.
 */
export function setAccordionItemOpenAt(
  tr: Transaction,
  itemPath: Path,
  open: boolean,
): Transaction | null {
  const accordionPath = itemPath.slice(0, -1)
  const accordion = nodeAtPath(tr.doc, accordionPath)
  if (accordion?.type.name !== 'accordion') return null
  const index = itemPath[itemPath.length - 1] as number
  // maybeChild, not child: a stale path from a click on a since-removed item
  // must decline rather than throw out of the DOM binding that called it.
  const item = accordion.content.maybeChild(index)
  if (!item) return null
  let changed = false
  if ((item.attrs.open === true) !== open) {
    tr.step(new SetNodeAttrsStep(itemPath, { ...item.attrs, open }))
    changed = true
  }
  if (open && accordion.attrs.exclusive !== false) {
    changed = closeOtherItems(tr, accordionPath, index) || changed
  }
  return changed ? tr : null
}

/**
 * Insert an accordion of `count` (clamped 1..MAX_SECTIONS) items titled
 * "Section 1", "Section 2", …, the first one open. The first title is
 * selected whole so typing replaces the placeholder.
 */
export function insertAccordion(count = 3): Command {
  return (state) => {
    const schema = state.schema
    const total = clampCount(count, 1, MAX_SECTIONS)
    const items: EditorNode[] = []
    for (let i = 0; i < total; i++) items.push(makeItem(schema, `Section ${i + 1}`, i === 0))
    const block = schema.nodeType('accordion').create({ exclusive: true }, Fragment.from(items))
    const inserted = insertBlockHere(state, block)
    if (!inserted) return null
    const titlePath = [...inserted.path, 0, 0]
    inserted.tr.setSelection(selectTextblockContent(items[0]?.child(0) as EditorNode, titlePath))
    return inserted.tr
  }
}

/**
 * Add an open item after the one holding the selection (closing the others
 * when exclusive) and select its placeholder title.
 */
export const addAccordionItem: Command = (state) => {
  const context = accordionContextAt(state.doc, state.selection.from.path)
  if (!context) return null
  if (context.accordion.childCount >= MAX_SECTIONS) return null
  const at = context.index + 1
  const item = makeItem(state.schema, `Section ${context.accordion.childCount + 1}`, true)
  const tr = state.tr
  if (context.accordion.attrs.exclusive !== false) closeOtherItems(tr, context.accordionPath, -1)
  tr.step(new ReplaceNodesStep(context.accordionPath, at, at, Fragment.of(item)))
  tr.setSelection(selectTextblockContent(item.child(0), [...context.accordionPath, at, 0]))
  return tr
}

/** Remove the item holding the selection; the last one stays put. */
export const removeAccordionItem: Command = (state) => {
  const context = accordionContextAt(state.doc, state.selection.from.path)
  if (!context) return null
  const { accordion, accordionPath, index } = context
  if (accordion.childCount <= 1) return null
  const tr = state.tr
  tr.step(new ReplaceNodesStep(accordionPath, index, index + 1, Fragment.empty))
  const neighbour = Math.min(index, accordion.childCount - 2)
  tr.setSelection(new TextSelection(pos([...accordionPath, neighbour, 0], 0)))
  return tr
}

/** Open or close the item holding the selection. */
export function setAccordionItemOpen(open: boolean): Command {
  return (state) => {
    const context = accordionContextAt(state.doc, state.selection.from.path)
    if (!context) return null
    return setAccordionItemOpenAt(state.tr, context.itemPath, open)
  }
}

/**
 * Flip the accordion between exclusive (one open at a time) and free. Turning
 * exclusivity on with several items open keeps the one at the selection when
 * it is open, else the first open one, and closes the rest.
 */
export const toggleAccordionExclusive: Command = (state) => {
  const found = findAncestor(state.doc, state.selection.from.path, 'accordion')
  if (!found) return null
  const exclusive = found.node.attrs.exclusive === false
  const tr = state.tr
  tr.step(new SetNodeAttrsStep(found.path, { ...found.node.attrs, exclusive }))
  if (exclusive) {
    const context = accordionContextAt(state.doc, state.selection.from.path)
    let keep = context && context.item.attrs.open === true ? context.index : -1
    if (keep === -1) {
      for (let i = 0; i < found.node.childCount; i++) {
        if (found.node.child(i).attrs.open === true) {
          keep = i
          break
        }
      }
    }
    closeOtherItems(tr, found.path, keep)
  }
  return tr
}
