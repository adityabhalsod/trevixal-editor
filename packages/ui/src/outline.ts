import {
  type Editor,
  type EditorNode,
  type Path,
  type TextNode,
  TextSelection,
  pos,
} from '@trevixal/core'
import { type IconName, createIcon } from './icons'

/** One row in the outline: a heading, or a notable non-heading block. */
export interface OutlineEntry {
  readonly path: Path
  /** Node type name (`heading`, `codeBlock`, `table`, …). */
  readonly type: string
  /** Heading level when `type` is a heading, otherwise 0. */
  readonly level: number
  /** Indentation depth in the rendered tree, from 0. */
  readonly depth: number
  /** Row label: heading text, or a description of the block. */
  readonly label: string
  readonly icon?: IconName
}

/** How one node type is presented in the outline. */
export interface OutlineBlockKind {
  readonly icon?: IconName
  /** Label for a row of this type. Defaults to the type name. */
  readonly label?: (node: EditorNode) => string
}

export interface DocumentOutlineOptions {
  /** Where the sidebar is appended. */
  readonly container: HTMLElement
  /** Heading node type (default `"heading"`). */
  readonly headingName?: string
  /**
   * Non-heading block types worth showing, keyed by node type name. Defaults
   * to code blocks, quotes, tables, lists and horizontal rules. Pass `{}` for
   * a headings-only outline.
   */
  readonly blockKinds?: Readonly<Record<string, OutlineBlockKind>>
  readonly emptyLabel?: string
  readonly untitledLabel?: string
  readonly ariaLabel?: string
  /** Called after the caret moves into a clicked row. */
  readonly onNavigate?: (entry: OutlineEntry) => void
}

export interface DocumentOutline {
  readonly element: HTMLElement
  readonly entries: readonly OutlineEntry[]
  refresh(): void
  destroy(): void
}

/** Text of a block's inline children, trimmed and clipped for a sidebar row. */
function blockText(node: EditorNode, limit = 60): string {
  let text = ''
  for (const child of node.content.children) {
    if (child.isText) text += (child as TextNode).text
    if (text.length > limit) break
  }
  const trimmed = text.trim()
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}…` : trimmed
}

/** The block kinds the outline shows when the host does not override them. */
export function defaultOutlineBlockKinds(): Readonly<Record<string, OutlineBlockKind>> {
  return {
    codeBlock: {
      icon: 'codeLanguage',
      label: (node) => {
        const language = node.attrs?.language
        return typeof language === 'string' && language ? `Code (${language})` : 'Code block'
      },
    },
    blockquote: { icon: 'quote', label: () => 'Quote' },
    table: { icon: 'table', label: () => 'Table' },
    bulletList: { icon: 'bulletList', label: (node) => `List (${node.content.childCount})` },
    orderedList: {
      icon: 'orderedList',
      label: (node) => `Numbered list (${node.content.childCount})`,
    },
    horizontalRule: { icon: 'horizontalRule', label: () => 'Divider' },
    image: { icon: 'image', label: () => 'Image' },
  }
}

/**
 * A sidebar showing the document's block structure, headings plus the blocks
 * a writer navigates by (code, tables, lists), and highlighting whichever row
 * contains the selection.
 *
 * Depth comes from heading level for headings, and from the nearest enclosing
 * heading for everything else, so a code block under an h2 sits one level in
 * rather than at the root.
 */
export function createDocumentOutline(
  editor: Editor,
  options: DocumentOutlineOptions,
): DocumentOutline {
  const container = options.container
  const doc = container.ownerDocument
  const headingName = options.headingName ?? 'heading'
  const kinds = options.blockKinds ?? defaultOutlineBlockKinds()
  const untitled = options.untitledLabel ?? 'Untitled'

  const root = doc.createElement('nav')
  root.className = 'trevixal-outline'
  root.setAttribute('aria-label', options.ariaLabel ?? 'Document outline')

  const list = doc.createElement('ul')
  list.className = 'trevixal-outline__list'
  root.appendChild(list)

  let entries: readonly OutlineEntry[] = []
  /** Row elements parallel to `entries`, for cheap highlight updates. */
  let rows: HTMLElement[] = []

  const collect = (): readonly OutlineEntry[] => {
    const found: OutlineEntry[] = []
    // Levels of the headings currently "open"; its length is the depth a
    // non-heading block sits at.
    const openLevels: number[] = []

    const walk = (node: EditorNode, path: Path): void => {
      node.content.children.forEach((child, index) => {
        const childPath = [...path, index]
        const name = child.type.name

        if (name === headingName) {
          const raw = child.attrs?.level
          const level = Math.min(Math.max(typeof raw === 'number' ? raw : 1, 1), 6)
          while (openLevels.length > 0 && (openLevels[openLevels.length - 1] as number) >= level) {
            openLevels.pop()
          }
          found.push({
            path: childPath,
            type: name,
            level,
            depth: openLevels.length,
            label: blockText(child) || untitled,
            icon: 'langPlain',
          })
          openLevels.push(level)
          return
        }

        const kind = kinds[name]
        if (kind) {
          found.push({
            path: childPath,
            type: name,
            level: 0,
            depth: openLevels.length,
            label: kind.label?.(child) ?? name,
            ...(kind.icon ? { icon: kind.icon } : {}),
          })
          // A recognised container is described by its own row; do not also
          // list every paragraph inside it.
          return
        }

        if (!child.isTextblock) walk(child, childPath)
      })
    }
    walk(editor.state.doc, [])
    return found
  }

  const navigate = (entry: OutlineEntry): void => {
    // A container (table, list) has no inline offset of its own, so aim at its
    // first textblock; `validateSelection` would otherwise reject the position.
    let node: EditorNode | null = editor.state.doc
    const path: number[] = []
    for (const index of entry.path) {
      node = node?.content.maybeChild(index) ?? null
      path.push(index)
    }
    while (node && !node.isTextblock && node.content.childCount > 0) {
      path.push(0)
      node = node.content.child(0)
    }
    if (!node?.isTextblock) {
      options.onNavigate?.(entry)
      return
    }
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos(path, 0))))
    editor.view?.focus()
    // Focusing deliberately leaves the viewport alone; picking an outline
    // entry is the one case here that means to move it, so it asks.
    editor.view?.scrollSelectionIntoView({ block: 'start' })
    options.onNavigate?.(entry)
  }

  const render = (): void => {
    list.replaceChildren()
    rows = []
    if (entries.length === 0) {
      const empty = doc.createElement('li')
      empty.className = 'trevixal-outline__empty'
      empty.textContent = options.emptyLabel ?? 'Empty document'
      list.appendChild(empty)
      return
    }

    entries.forEach((entry, index) => {
      const item = doc.createElement('li')
      item.className = 'trevixal-outline__item'

      const button = doc.createElement('button')
      button.type = 'button'
      button.className = 'trevixal-outline__row'
      // Depth drives indentation from CSS rather than inline padding, so the
      // scale stays themable.
      button.dataset.trevixalDepth = String(Math.min(entry.depth, 5))
      button.dataset.trevixalOutlineIndex = String(index)
      button.dataset.trevixalBlock = entry.type

      const glyph = doc.createElement('span')
      glyph.className = 'trevixal-outline__icon'
      const icon = entry.icon ? createIcon(doc, entry.icon) : null
      if (icon) glyph.appendChild(icon)

      const label = doc.createElement('span')
      label.className = 'trevixal-outline__label'
      label.textContent = entry.label

      button.append(glyph, label)
      // Never steal the selection the highlight is derived from.
      button.addEventListener('mousedown', (event) => event.preventDefault())
      item.appendChild(button)
      list.appendChild(item)
      rows.push(button)
    })
  }

  /**
   * The row whose block contains the selection: the deepest entry whose path
   * is a prefix of (or equal to) the selection's path, else the last entry
   * that starts at or before it.
   */
  const activeIndex = (): number => {
    const head = editor.state.selection.to.path
    let best = -1
    entries.forEach((entry, index) => {
      const isPrefix = entry.path.every((segment, i) => head[i] === segment)
      if (isPrefix && entry.path.length <= head.length) {
        best = index
        return
      }
      // Headings label the span that follows them, so a paragraph after an h2
      // still lights up that h2.
      if (entry.type === headingName && comesBefore(entry.path, head)) best = index
    })
    return best
  }

  const highlight = (): void => {
    const index = activeIndex()
    rows.forEach((row, i) => {
      const on = i === index
      row.classList.toggle('trevixal-outline__row--active', on)
      row.setAttribute('aria-current', on ? 'true' : 'false')
    })
  }

  const refresh = (): void => {
    entries = collect()
    render()
    highlight()
  }

  // Delegated, so re-rendering rows leaves no listeners behind.
  const onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null
    const row = target?.closest?.('[data-trevixal-outline-index]') as HTMLElement | null
    if (!row) return
    const entry = entries[Number(row.dataset.trevixalOutlineIndex)]
    if (entry) navigate(entry)
  }
  list.addEventListener('click', onClick as EventListener)

  refresh()
  const offTransaction = editor.on('transaction', refresh)
  const offSelection = editor.on('selectionUpdate', highlight)
  container.appendChild(root)

  return {
    element: root,
    get entries() {
      return entries
    },
    refresh,
    destroy() {
      offTransaction()
      offSelection()
      list.removeEventListener('click', onClick as EventListener)
      root.remove()
    },
  }
}

/** Document-order comparison of two paths. */
function comesBefore(a: Path, b: Path): boolean {
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i++) {
    const left = a[i] as number
    const right = b[i] as number
    if (left !== right) return left < right
  }
  return a.length <= b.length
}
