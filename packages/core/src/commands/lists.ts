import { attrsEq } from '../model/attrs'
import { blocksInRange } from '../model/blocks'
import { Fragment } from '../model/fragment'
import { inlineLength } from '../model/inline'
import type { EditorNode } from '../model/node'
import { type Position, pos } from '../model/position'
import { type Path, nodeAtPath, pathsEqual } from '../model/tree'
import { listStylesFor } from '../schema/basic'
import { TextSelection } from '../state/selection'
import { SetNodeAttrsStep } from '../state/steps/attrs-step'
import { ReplaceNodesStep, replaceNodeAt } from '../state/steps/replace-nodes'
import { SplitNodeStep } from '../state/steps/split-join'
import type { Command } from './commands'
import { deleteRange } from './helpers'

/**
 * The item types a list can hold. Task lists are ordinary lists with a
 * different item type, so every list command works on both by looking the
 * item type up here rather than hard-coding `listItem`.
 */
const ITEM_TYPES: Readonly<Record<string, string>> = {
  bulletList: 'listItem',
  orderedList: 'listItem',
  taskList: 'taskItem',
}

const ITEM_TYPE_NAMES: ReadonlySet<string> = new Set(Object.values(ITEM_TYPES))

/**
 * Whether a node type names a list item: `listItem` or `taskItem`. Anything
 * deciding "am I inside a list?" must ask this rather than compare against
 * `listItem`, or task lists quietly take the wrong branch.
 */
export function isListItemTypeName(typeName: string | undefined): boolean {
  return typeName !== undefined && ITEM_TYPE_NAMES.has(typeName)
}

/** Item type a list type holds; `listItem` for anything unregistered. */
function itemTypeNameFor(listTypeName: string): string {
  return ITEM_TYPES[listTypeName] ?? 'listItem'
}

interface ListContext {
  readonly listPath: Path
  readonly list: EditorNode
  readonly itemPath: Path
  readonly item: EditorNode
  readonly itemIndex: number
}

/** Resolve the list item and list containing the textblock at `blockPath`. */
function listContextAt(doc: EditorNode, blockPath: Path): ListContext | null {
  if (blockPath.length < 3) return null
  const itemPath = blockPath.slice(0, -1)
  const item = nodeAtPath(doc, itemPath)
  if (!item || !ITEM_TYPE_NAMES.has(item.type.name)) return null
  const listPath = itemPath.slice(0, -1)
  const list = nodeAtPath(doc, listPath)
  if (!list) return null
  return { listPath, list, itemPath, item, itemIndex: itemPath[itemPath.length - 1] as number }
}

/**
 * Toggle the blocks in the selection into/out of a list of the given type.
 * Inside a same-type list: unwrap. Inside another list type: retype the list.
 */
export function toggleList(listTypeName: string): Command {
  return (state) => {
    const type = state.schema.nodeType(listTypeName)
    const selection = state.selection
    const blocks = blocksInRange(state.doc, selection.from, selection.to)
    const first = blocks[0]
    const last = blocks[blocks.length - 1]
    if (!first || !last) return null
    const tr = state.tr
    const context = listContextAt(state.doc, first.path)

    if (context) {
      if (context.list.type === type) {
        // Unwrap: replace the whole list with its items' blocks.
        const flat = context.list.content.children.flatMap((item) => item.content.children)
        tr.step(replaceNodeAt(context.listPath, Fragment.from(flat)))
        tr.setSelection(mapOutOfList(selection.from, selection.to, context))
      } else {
        // Retype in place. A bullet ↔ task switch also changes the item type,
        // so rebuild the items rather than reusing the old fragment; the
        // block content inside each item is shared untouched.
        const itemType = state.schema.nodeType(itemTypeNameFor(listTypeName))
        const items = context.list.content.children.map((item) =>
          item.type === itemType ? item : itemType.create(undefined, item.content),
        )
        tr.step(
          replaceNodeAt(
            context.listPath,
            Fragment.of(type.create(undefined, Fragment.from(items))),
          ),
        )
        tr.setSelection(new TextSelection(selection.from, selection.to))
      }
      return tr
    }

    // Wrap: the selected sibling blocks each become a list item.
    const parentPath = first.path.slice(0, -1)
    if (!pathsEqual(parentPath, last.path.slice(0, -1))) return null
    const parent = nodeAtPath(state.doc, parentPath)
    if (!parent) return null
    const fromIndex = first.path[first.path.length - 1] as number
    const toIndex = (last.path[last.path.length - 1] as number) + 1
    const itemType = state.schema.nodeType(itemTypeNameFor(listTypeName))
    const items = parent.content.children
      .slice(fromIndex, toIndex)
      .map((block) => itemType.create(undefined, Fragment.of(block)))
    tr.step(
      new ReplaceNodesStep(
        parentPath,
        fromIndex,
        toIndex,
        Fragment.of(type.create(undefined, Fragment.from(items))),
      ),
    )
    const intoList = (position: Position): Position => {
      const index = position.path[position.path.length - 1] as number
      if (
        !pathsEqual(position.path.slice(0, -1), parentPath) ||
        index < fromIndex ||
        index >= toIndex
      ) {
        return position
      }
      return pos([...parentPath, fromIndex, index - fromIndex, 0], position.offset)
    }
    tr.setSelection(new TextSelection(intoList(selection.from), intoList(selection.to)))
    return tr
  }
}

function mapOutOfList(from: Position, to: Position, context: ListContext): TextSelection {
  const map = (position: Position): Position => {
    // [...listPath, itemIndex, blockIndex] → [...listParent, listIndex + flatIndex]
    if (position.path.length !== context.listPath.length + 2) return position
    if (!pathsEqual(position.path.slice(0, context.listPath.length), context.listPath))
      return position
    const itemIndex = position.path[context.listPath.length] as number
    const blockIndex = position.path[context.listPath.length + 1] as number
    let flat = 0
    for (let i = 0; i < itemIndex; i++) flat += context.list.content.child(i).childCount
    const listIndex = context.listPath[context.listPath.length - 1] as number
    return pos([...context.listPath.slice(0, -1), listIndex + flat + blockIndex], position.offset)
  }
  return new TextSelection(map(from), map(to))
}

/** Enter inside a list item: split it; on an empty item, lift out instead. */
export const splitListItem: Command = (state) => {
  const selection = state.selection
  if (!(selection instanceof TextSelection)) return null
  const context = listContextAt(state.doc, selection.from.path)
  if (!context) return null

  const point = selection.from
  const blockIndex = point.path[point.path.length - 1] as number
  const currentBlock = nodeAtPath(state.doc, point.path)
  if (!currentBlock) return null

  // Enter on an empty, single-block item exits the list.
  if (
    selection.empty &&
    context.item.childCount === 1 &&
    inlineLength(currentBlock.content) === 0
  ) {
    return liftListItem(state)
  }

  const tr = state.tr
  if (!selection.empty) deleteRange(tr, selection.from, selection.to)
  tr.step(new SplitNodeStep(point.path, point.offset))

  // Move the second half (and any later blocks of this item) into a new item.
  const item = nodeAtPath(tr.doc, context.itemPath)
  if (!item) return null
  const moved = item.content.slice(blockIndex + 1)
  tr.step(new ReplaceNodesStep(context.itemPath, blockIndex + 1, item.childCount, Fragment.empty))
  // The new item inherits the old one's type but never its `checked` state:
  // splitting a finished task yields a fresh, unfinished one.
  const itemType = context.item.type
  const newAttrs = 'checked' in context.item.attrs ? { checked: false } : undefined
  tr.step(
    new ReplaceNodesStep(
      context.listPath,
      context.itemIndex + 1,
      context.itemIndex + 1,
      Fragment.of(itemType.create(newAttrs, moved)),
    ),
  )
  tr.setSelection(new TextSelection(pos([...context.listPath, context.itemIndex + 1, 0], 0)))
  return tr
}

/** Tab: nest the current item under its previous sibling. */
export const sinkListItem: Command = (state) => {
  const selection = state.selection
  const context = listContextAt(state.doc, selection.from.path)
  if (!context || context.itemIndex === 0) return null
  const previous = context.list.content.child(context.itemIndex - 1)
  const lastChild = previous.content.maybeChild(previous.childCount - 1)
  const restPath = selection.from.path.slice(context.listPath.length + 1)

  let replacement: EditorNode
  let newBlockPath: Path
  if (lastChild && lastChild.type === context.list.type) {
    // Previous item already ends in a same-type nested list: append there.
    const nested = lastChild.withContent(lastChild.content.append(Fragment.of(context.item)))
    replacement = previous.withContent(
      previous.content.replaceChild(previous.childCount - 1, nested),
    )
    newBlockPath = [
      ...context.listPath,
      context.itemIndex - 1,
      previous.childCount - 1,
      lastChild.childCount,
      ...restPath,
    ]
  } else {
    const nested = context.list.type.create(undefined, Fragment.of(context.item))
    replacement = previous.withContent(previous.content.append(Fragment.of(nested)))
    newBlockPath = [...context.listPath, context.itemIndex - 1, previous.childCount, 0, ...restPath]
  }
  const tr = state.tr
  tr.step(
    new ReplaceNodesStep(
      context.listPath,
      context.itemIndex - 1,
      context.itemIndex + 1,
      Fragment.of(replacement),
    ),
  )
  tr.setSelection(new TextSelection(pos(newBlockPath, selection.from.offset)))
  return tr
}

/** Shift-Tab / Enter-on-empty: lift the current item out of its list. */
export const liftListItem: Command = (state) => {
  const selection = state.selection
  const context = listContextAt(state.doc, selection.from.path)
  if (!context) return null
  const items = context.list.content.children
  const before = items.slice(0, context.itemIndex)
  const after = items.slice(context.itemIndex + 1)
  const blockIndex = (selection.from.path[context.listPath.length + 1] as number | undefined) ?? 0
  const tr = state.tr

  // Nested list (this list lives inside another list item): the lifted item
  // becomes a sibling of its parent item in the outer list.
  const parentItemPath = context.listPath.slice(0, -1)
  const parentItem = parentItemPath.length > 0 ? nodeAtPath(state.doc, parentItemPath) : null
  if (parentItem && isListItemTypeName(parentItem.type.name)) {
    const listIndexInItem = context.listPath[context.listPath.length - 1] as number
    const outerPath = parentItemPath.slice(0, -1)
    const parentIndex = parentItemPath[parentItemPath.length - 1] as number
    const keptNested = before.length > 0 ? [context.list.withContent(Fragment.from(before))] : []
    const newParent = parentItem.withContent(
      parentItem.content.replaceRange(
        listIndexInItem,
        listIndexInItem + 1,
        Fragment.from(keptNested),
      ),
    )
    const carried =
      after.length > 0 ? [context.list.type.create(undefined, Fragment.from(after))] : []
    const newItem = context.item.withContent(context.item.content.append(Fragment.from(carried)))
    tr.step(
      new ReplaceNodesStep(
        outerPath,
        parentIndex,
        parentIndex + 1,
        Fragment.of(newParent, newItem),
      ),
    )
    tr.setSelection(
      new TextSelection(pos([...outerPath, parentIndex + 1, blockIndex], selection.from.offset)),
    )
    return tr
  }

  // Top-level list: the item's blocks land beside the (possibly split) list.
  const replacement: EditorNode[] = []
  if (before.length > 0) replacement.push(context.list.withContent(Fragment.from(before)))
  replacement.push(...context.item.content.children)
  if (after.length > 0) {
    replacement.push(context.list.type.create(undefined, Fragment.from(after)))
  }
  tr.step(replaceNodeAt(context.listPath, Fragment.from(replacement)))

  const listIndex = context.listPath[context.listPath.length - 1] as number
  const newIndex = listIndex + (before.length > 0 ? 1 : 0) + blockIndex
  tr.setSelection(
    new TextSelection(pos([...context.listPath.slice(0, -1), newIndex], selection.from.offset)),
  )
  return tr
}

/** Toggle the selection into/out of a task list. */
export const toggleTaskList: Command = toggleList('taskList')

/** Flip the `checked` attribute of the task item holding the selection. */
export const toggleTaskChecked: Command = (state) => {
  const context = listContextAt(state.doc, state.selection.from.path)
  if (context?.item.type.name !== 'taskItem') return null
  return state.tr.step(
    new SetNodeAttrsStep(context.itemPath, {
      ...context.item.attrs,
      checked: context.item.attrs.checked !== true,
    }),
  )
}

/** Set an explicit `checked` state on the task item at `itemPath`. */
export function setTaskChecked(itemPath: Path, checked: boolean): Command {
  return (state) => {
    const item = nodeAtPath(state.doc, itemPath)
    if (item?.type.name !== 'taskItem' || item.attrs.checked === checked) return null
    return state.tr.step(new SetNodeAttrsStep(itemPath, { ...item.attrs, checked }))
  }
}

/**
 * Set the marker style of the list wrapping the selection. Declines outside a
 * list, and for a value this list type does not accept. The attribute is
 * serialized into a `style` attribute, so the allowlist is load-bearing.
 */
export function setListStyle(style: string | null): Command {
  return (state) => {
    const context = listContextAt(state.doc, state.selection.from.path)
    if (!context) return null
    if (style !== null && !listStylesFor(context.list.type.name).has(style)) return null
    if (!('listStyle' in context.list.attrs)) return null
    const attrs = { ...context.list.attrs, listStyle: style }
    if (attrsEq(context.list.attrs, attrs)) return null
    return state.tr.step(new SetNodeAttrsStep(context.listPath, attrs))
  }
}

/** Number the ordered list at the selection from 1 again. */
export const restartNumbering: Command = continueNumbering(1)

/**
 * Number the ordered list at the selection on from where the nearest ordered
 * list above it (in the same parent) left off, Word's "Continue numbering".
 * Declines when no earlier ordered list exists to continue from.
 */
export const continueNumberingFromPrevious: Command = (state) => {
  const context = listContextAt(state.doc, state.selection.from.path)
  if (context?.list.type.name !== 'orderedList') return null
  const parent = nodeAtPath(state.doc, context.listPath.slice(0, -1))
  if (!parent) return null
  const index = context.listPath[context.listPath.length - 1] as number
  for (let i = index - 1; i >= 0; i--) {
    const sibling = parent.child(i)
    if (sibling.type.name !== 'orderedList') continue
    const start = typeof sibling.attrs.start === 'number' ? sibling.attrs.start : 1
    return continueNumbering(start + sibling.childCount)(state)
  }
  return null
}

/** Number the ordered list at the selection from `start`. */
export function continueNumbering(start: number): Command {
  return (state) => {
    const context = listContextAt(state.doc, state.selection.from.path)
    if (context?.list.type.name !== 'orderedList') return null
    const value = Math.round(start)
    if (!Number.isFinite(value) || context.list.attrs.start === value) return null
    return state.tr.step(
      new SetNodeAttrsStep(context.listPath, { ...context.list.attrs, start: value }),
    )
  }
}
