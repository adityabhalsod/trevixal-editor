import {
  type Editor,
  type EditorNode,
  type Path,
  type TextNode,
  TextSelection,
  pos,
} from '@trevixal/core'

/** One heading discovered in the document. */
export interface TocEntry {
  /** Path of the heading block in the document tree. */
  readonly path: Path
  /** The heading's declared level (1-6), clamped into range. */
  readonly level: number
  /** The heading's plain text; empty for an empty heading. */
  readonly text: string
  /** Stable-per-render id, used for the `href` and `data-` hooks. */
  readonly id: string
}

export interface TableOfContentsOptions {
  /** Where the nav is appended. Required. The TOC is not a floating widget. */
  readonly container: HTMLElement
  /** Node type carrying the `level` attribute (default `"heading"`). */
  readonly nodeName?: string
  /** Deepest level to include (default 6). Deeper headings are skipped. */
  readonly maxLevel?: number
  /** Shown in place of the list when the document has no headings. */
  readonly emptyLabel?: string
  /** Text for an untitled heading (default "Untitled"). */
  readonly untitledLabel?: string
  /** Accessible name of the `<nav>` (default "Table of contents"). */
  readonly ariaLabel?: string
  /**
   * Called after the caret has been moved into the clicked heading. Override
   * to scroll a custom container, or to suppress scrolling entirely.
   */
  readonly onNavigate?: (entry: TocEntry, element: HTMLElement | null) => void
}

export interface TableOfContents {
  readonly element: HTMLElement
  /** The headings behind the current render, in document order. */
  readonly entries: readonly TocEntry[]
  /** Rebuild from the current document. Called automatically on transactions. */
  refresh(): void
  destroy(): void
}

/** Concatenated text of a block's inline children; atoms contribute nothing. */
function blockText(node: EditorNode): string {
  let text = ''
  for (const child of node.content.children) {
    if (child.isText) text += (child as TextNode).text
  }
  return text.trim()
}

/**
 * Every heading in the document, in order. Levels are clamped to 1-6 so a
 * malformed attribute cannot produce a negative nesting depth downstream.
 */
function collectHeadings(
  doc: EditorNode,
  nodeName: string,
  maxLevel: number,
  untitled: string,
): readonly TocEntry[] {
  const entries: TocEntry[] = []
  const walk = (node: EditorNode, path: Path): void => {
    node.content.children.forEach((child, index) => {
      const childPath = [...path, index]
      if (child.type.name === nodeName) {
        const raw = child.attrs?.level
        const level = Math.min(Math.max(typeof raw === 'number' ? raw : 1, 1), 6)
        if (level <= maxLevel) {
          const text = blockText(child)
          entries.push({
            path: childPath,
            level,
            text,
            id: `tvx-toc-${childPath.join('-')}`,
          })
        }
        return
      }
      // Headings can be nested (inside a table cell, a callout), so keep
      // descending through anything that is not itself a textblock.
      if (!child.isTextblock) walk(child, childPath)
    })
  }
  walk(doc, [])
  return entries.map((entry) => (entry.text ? entry : { ...entry, text: untitled }))
}

/**
 * A navigable table of contents built from the document's headings.
 *
 * Nesting is derived from a stack rather than from the raw level numbers, so
 * a document that skips a level (h1 → h3, the common real-world case) still
 * produces well-formed `<ul>`/`<li>` markup instead of an orphaned list.
 *
 * Nothing here touches the document: clicking an entry moves the selection to
 * the heading and scrolls it into view.
 */
export function createTableOfContents(
  editor: Editor,
  options: TableOfContentsOptions,
): TableOfContents {
  const container = options.container
  const doc = container.ownerDocument
  const nodeName = options.nodeName ?? 'heading'
  const maxLevel = Math.min(Math.max(options.maxLevel ?? 6, 1), 6)
  const untitled = options.untitledLabel ?? 'Untitled'

  const root = doc.createElement('nav')
  root.className = 'trevixal-toc'
  root.setAttribute('aria-label', options.ariaLabel ?? 'Table of contents')

  let entries: readonly TocEntry[] = []

  /** The rendered element for a heading path, when the view has one. */
  const elementFor = (entry: TocEntry): HTMLElement | null => {
    const view = editor.view
    if (!view) return null
    let element: HTMLElement | null = view.dom
    for (const index of entry.path) {
      if (!element) return null
      const children = [...element.children].filter((child) =>
        view.renderer.modelOf.get(child),
      ) as HTMLElement[]
      element = children[index] ?? null
    }
    return element
  }

  const navigate = (entry: TocEntry): void => {
    const element = elementFor(entry)
    // Put the caret at the start of the heading so typing continues there,
    // and so keyboard users land where they clicked.
    const tr = editor.state.tr.setSelection(new TextSelection(pos(entry.path, 0)))
    editor.dispatch(tr)
    editor.view?.focus()
    if (options.onNavigate) {
      options.onNavigate(entry, element)
      return
    }
    element?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  /**
   * Build the nested list. `stack` holds the open `<ul>` per depth; a heading
   * deeper than its predecessor opens exactly one level regardless of how far
   * its number jumped, which is what keeps h1 → h3 from breaking nesting.
   */
  const render = (): void => {
    root.replaceChildren()
    if (entries.length === 0) {
      const empty = doc.createElement('p')
      empty.className = 'trevixal-toc__empty'
      empty.textContent = options.emptyLabel ?? 'No headings yet'
      root.appendChild(empty)
      return
    }

    const list = doc.createElement('ul')
    list.className = 'trevixal-toc__list'
    root.appendChild(list)

    // Parallel stacks of open lists and the level each was opened for.
    const lists: HTMLElement[] = [list]
    const levels: number[] = [entries[0]?.level ?? 1]

    for (const entry of entries) {
      while (levels.length > 1 && entry.level < (levels[levels.length - 1] as number)) {
        lists.pop()
        levels.pop()
      }
      let parent = lists[lists.length - 1] as HTMLElement
      if (entry.level > (levels[levels.length - 1] as number)) {
        // Nest under the previous item when there is one; a document opening
        // at h3, or jumping h1 → h3, has no previous item at this depth, so
        // the entry stays in the current list rather than orphaning a <ul>.
        const host = parent.lastElementChild
        if (host) {
          const nested = doc.createElement('ul')
          nested.className = 'trevixal-toc__list'
          host.appendChild(nested)
          lists.push(nested)
          levels.push(entry.level)
          parent = nested
        } else {
          levels[levels.length - 1] = entry.level
        }
      }

      const item = doc.createElement('li')
      item.className = 'trevixal-toc__item'
      item.dataset.trevixalLevel = String(entry.level)

      const link = doc.createElement('a')
      link.className = 'trevixal-toc__link'
      link.href = `#${entry.id}`
      link.dataset.trevixalTocPath = entry.path.join('.')
      link.textContent = entry.text
      item.appendChild(link)
      parent.appendChild(item)
    }
  }

  const refresh = (): void => {
    entries = collectHeadings(editor.state.doc, nodeName, maxLevel, untitled)
    render()
  }

  // One delegated listener for the whole tree, so re-rendering the list never
  // leaves per-link listeners behind.
  const onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null
    const link = target?.closest?.('[data-trevixal-toc-path]') as HTMLElement | null
    if (!link) return
    event.preventDefault()
    const key = link.dataset.trevixalTocPath
    const entry = entries.find((candidate) => candidate.path.join('.') === key)
    if (entry) navigate(entry)
  }
  root.addEventListener('click', onClick as EventListener)

  refresh()
  const offTransaction = editor.on('transaction', refresh)
  container.appendChild(root)

  return {
    element: root,
    get entries() {
      return entries
    },
    refresh,
    destroy() {
      offTransaction()
      root.removeEventListener('click', onClick as EventListener)
      root.remove()
    },
  }
}
