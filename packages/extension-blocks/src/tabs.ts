import {
  type Command,
  type EditorNode,
  type EditorState,
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

/** Where a path sits inside a tabs block. */
export interface TabsContext {
  readonly tabs: EditorNode
  readonly tabsPath: Path
  /** The tab item the path runs through. */
  readonly item: EditorNode
  readonly itemPath: Path
  /** Index of that item among its siblings. */
  readonly index: number
  /** Index of the active item, or -1 when the block has none (a broken invariant). */
  readonly activeIndex: number
}

/** Direction for {@link moveTab}: tabs run left to right. */
export type TabDirection = 'left' | 'right'

/**
 * The tabs block and tab item enclosing `path`, or null when the path is not
 * inside a tab item (a path stopping at the block itself has no item).
 */
export function tabsContextAt(doc: EditorNode, path: Path): TabsContext | null {
  const found = findAncestor(doc, path, 'tabsBlock')
  if (!found) return null
  const index = path[found.path.length]
  if (index === undefined || index >= found.node.childCount) return null
  const itemPath = [...found.path, index]
  const item = found.node.child(index)
  if (item.type.name !== 'tabItem') return null
  return {
    tabs: found.node,
    tabsPath: found.path,
    item,
    itemPath,
    index,
    activeIndex: activeIndexOf(found.node),
  }
}

/** Index of the active item, or -1. */
function activeIndexOf(tabs: EditorNode): number {
  for (let i = 0; i < tabs.childCount; i++) {
    if (tabs.child(i).attrs.active === true) return i
  }
  return -1
}

/** A tab item with a titled, empty body. */
function makeTab(schema: Schema, title: string, active: boolean): EditorNode {
  return schema
    .nodeType('tabItem')
    .create(
      { active },
      Fragment.from([
        schema
          .nodeType('tabTitle')
          .create(undefined, title ? Fragment.of(schema.text(title)) : undefined),
        schema.nodeType('tabContent').create(undefined, Fragment.of(emptyParagraph(schema))),
      ]),
    )
}

/**
 * Make the tab item at `tabItemPath` the active one, deactivating the rest of
 * its block. This is the single writer of the one-active-item invariant: it
 * also repairs a block that has drifted to zero or several active items.
 * Returns null when the path is not a tab item or nothing would change.
 */
export function activateTabAt(state: EditorState, tabItemPath: Path): Transaction | null {
  if (tabItemPath.length === 0) return null
  const tabsPath = tabItemPath.slice(0, -1)
  const tabs = nodeAtPath(state.doc, tabsPath)
  if (tabs?.type.name !== 'tabsBlock') return null
  const target = tabItemPath[tabItemPath.length - 1] as number
  if (target < 0 || target >= tabs.childCount) return null
  const tr = state.tr
  let changed = false
  for (let i = 0; i < tabs.childCount; i++) {
    const item = tabs.child(i)
    const active = i === target
    if ((item.attrs.active === true) === active) continue
    tr.step(new SetNodeAttrsStep([...tabsPath, i], { ...item.attrs, active }))
    changed = true
  }
  return changed ? tr : null
}

/**
 * Activate a tab: by index within the tabs block holding the selection, or by
 * the path of a tab item anywhere in the document (what a click supplies).
 */
export function activateTab(indexOrPath: number | Path): Command {
  return (state) => {
    if (typeof indexOrPath === 'number') {
      const context = tabsContextAt(state.doc, state.selection.from.path)
      if (!context) return null
      if (indexOrPath < 0 || indexOrPath >= context.tabs.childCount) return null
      return activateTabAt(state, [...context.tabsPath, indexOrPath])
    }
    return activateTabAt(state, indexOrPath)
  }
}

/**
 * Insert a tabs block with `count` (clamped 1..MAX_SECTIONS) tabs titled
 * "Tab 1", "Tab 2", …, the first active. The first title is selected whole,
 * so typing replaces the placeholder.
 */
export function insertTabs(count = 2): Command {
  return (state) => {
    const schema = state.schema
    const total = clampCount(count, 1, MAX_SECTIONS)
    const items: EditorNode[] = []
    for (let i = 0; i < total; i++) items.push(makeTab(schema, `Tab ${i + 1}`, i === 0))
    const block = schema.nodeType('tabsBlock').create(undefined, Fragment.from(items))
    const inserted = insertBlockHere(state, block)
    if (!inserted) return null
    const titlePath = [...inserted.path, 0, 0]
    inserted.tr.setSelection(selectTextblockContent(items[0]?.child(0) as EditorNode, titlePath))
    return inserted.tr
  }
}

/**
 * Add a tab right after the one holding the selection and switch to it. The
 * new title is a placeholder numbered from the block's new size, selected so
 * typing replaces it.
 */
export const addTab: Command = (state) => {
  const context = tabsContextAt(state.doc, state.selection.from.path)
  if (!context) return null
  if (context.tabs.childCount >= MAX_SECTIONS) return null
  const schema = state.schema
  const at = context.index + 1
  const tab = makeTab(schema, `Tab ${context.tabs.childCount + 1}`, true)
  const tr = state.tr
  // Deactivate every existing item first; the inserted one is born active.
  for (let i = 0; i < context.tabs.childCount; i++) {
    const item = context.tabs.child(i)
    if (item.attrs.active !== true) continue
    tr.step(new SetNodeAttrsStep([...context.tabsPath, i], { ...item.attrs, active: false }))
  }
  tr.step(new ReplaceNodesStep(context.tabsPath, at, at, Fragment.of(tab)))
  tr.setSelection(selectTextblockContent(tab.child(0), [...context.tabsPath, at, 0]))
  return tr
}

/**
 * Remove the tab holding the selection. The last tab never goes. A tabs
 * block cannot be empty; delete the block instead. When the removed tab was
 * active, the one that slides into its slot (or the new last one) takes over
 * and receives the cursor.
 */
export const removeTab: Command = (state) => {
  const context = tabsContextAt(state.doc, state.selection.from.path)
  if (!context) return null
  const { tabs, tabsPath, index } = context
  if (tabs.childCount <= 1) return null
  const tr = state.tr
  tr.step(new ReplaceNodesStep(tabsPath, index, index + 1, Fragment.empty))
  const neighbour = Math.min(index, tabs.childCount - 2)
  const remaining = nodeAtPath(tr.doc, tabsPath)
  if (remaining) {
    const wasActive = context.item.attrs.active === true
    const stillActive = activeIndexOf(remaining)
    if (wasActive || stillActive === -1) {
      const item = remaining.child(neighbour)
      tr.step(new SetNodeAttrsStep([...tabsPath, neighbour], { ...item.attrs, active: true }))
    }
  }
  tr.setSelection(new TextSelection(pos([...tabsPath, neighbour, 0], 0)))
  return tr
}

/**
 * Swap the tab holding the selection with its neighbour. Active state rides
 * on the item, so the invariant survives the swap; the selection follows the
 * moved tab.
 */
export function moveTab(direction: TabDirection): Command {
  return (state) => {
    const context = tabsContextAt(state.doc, state.selection.from.path)
    if (!context) return null
    const { tabs, tabsPath, index } = context
    const target = direction === 'left' ? index - 1 : index + 1
    if (target < 0 || target >= tabs.childCount) return null
    const first = Math.min(index, target)
    const swapped = Fragment.from([tabs.child(first + 1), tabs.child(first)])
    const tr = state.tr
    tr.step(new ReplaceNodesStep(tabsPath, first, first + 2, swapped))
    const from = state.selection.from
    const rest = from.path.slice(tabsPath.length + 1)
    tr.setSelection(new TextSelection(pos([...tabsPath, target, ...rest], from.offset)))
    return tr
  }
}
