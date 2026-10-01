import {
  type DocJSON,
  type Editor,
  type EditorState,
  Fragment,
  type NodeSpec,
  ReplaceInlineStep,
  type SuggestionListState,
  TextSelection,
  type TriggerMatch,
  nodeAtPath,
  pathOfElement,
  pos,
  suggestionList,
} from '@trevixal/core'
import type { DocumentMeta, WorkspaceStore } from './store'

const WIKI_NODE = 'wikiLink'

/**
 * The link one workspace document makes to another, `[[Its title]]`: the
 * document's id, which a rename does not change, and its title as it was
 * linked, which is what the link shows. A plain click opens the document.
 */
export function wikiLinkNodes(): Record<string, NodeSpec> {
  return {
    [WIKI_NODE]: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { doc: { default: '' }, title: { default: '' } },
      toHTML: (node) => ({
        tag: 'span',
        attrs: { class: 'trevixal-wikilink', 'data-doc': String(node.attrs.doc ?? '') },
        text: String(node.attrs.title || 'Untitled'),
      }),
      parseHTML: [
        {
          tag: 'span',
          attribute: 'data-doc',
          getAttrs: (element) => {
            const doc = element.getAttribute('data-doc') ?? ''
            return doc ? { doc, title: (element.textContent ?? '').trim() } : false
          },
        },
      ],
    },
  }
}

/** Put a link to a document in place of the `[[` query that asked for it, and a space after it. */
function insertWikiLink(state: EditorState, match: TriggerMatch, meta: DocumentMeta) {
  const type = state.schema.nodes[WIKI_NODE]
  if (!type) return null
  const node = type.create({ doc: meta.id, title: meta.title })
  const tr = state.tr.step(
    new ReplaceInlineStep(
      match.path,
      match.from,
      match.to,
      Fragment.from([node, state.schema.text(' ')]),
    ),
  )
  return tr.setSelection(new TextSelection(pos(match.path, match.from + 2)))
}

/** The ids of every document a document links to. */
export function linkedDocuments(doc: DocJSON): Set<string> {
  const ids = new Set<string>()
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const entry = node as { type?: unknown; attrs?: { doc?: unknown }; content?: unknown }
    if (entry.type === WIKI_NODE && typeof entry.attrs?.doc === 'string' && entry.attrs.doc) {
      ids.add(entry.attrs.doc)
    }
    if (Array.isArray(entry.content)) for (const child of entry.content) visit(child)
  }
  visit(doc)
  return ids
}

/** The documents that link to `id`, most recently changed first. */
export async function backlinks(store: WorkspaceStore, id: string): Promise<DocumentMeta[]> {
  const found: DocumentMeta[] = []
  for (const meta of store.list()) {
    if (meta.id === id) continue
    const record = await store.get(meta.id)
    if (record && linkedDocuments(record.doc).has(id)) found.push(meta)
  }
  return found.sort((a, b) => b.updatedAt - a.updatedAt)
}

export interface WikiLinksOptions {
  /** Where the documents are, or the store once it has opened. */
  readonly store: WorkspaceStore | Promise<WorkspaceStore>
  /** Open a document when its link is clicked; the tab strip's `open`. */
  readonly open: (id: string) => void
  /** The popup's state, to draw; null closes it. */
  readonly onState: (state: SuggestionListState<DocumentMeta> | null) => void
  /** The document being edited, left out of the choices. */
  readonly currentId?: () => string | null
}

export interface WikiLinks {
  /** Choose a document from the popup, as a click does. */
  select(index: number): void
  dispose(): void
}

/**
 * Wiki links between workspace documents. Typing `[[` lists the documents,
 * narrowed by what follows; Enter or a click puts in a link to the one
 * picked. A click on a link opens its document. The popup is the host's to
 * draw, through `onState`, as the `/` menu's is.
 */
export function wikiLinks(editor: Editor, options: WikiLinksOptions): WikiLinks {
  const list = suggestionList<DocumentMeta>(editor, {
    char: '[[',
    allowSpaces: true,
    items: async (query) => {
      const store = await options.store
      const current = options.currentId?.() ?? null
      const text = query.replace(/\]+$/, '').trim()
      const matches = text ? store.search(text) : store.recent(20)
      const pool = text || matches.length > 0 ? matches : store.list()
      return pool.filter((meta) => meta.id !== current).slice(0, 20)
    },
    onState: options.onState,
    onSelect: (meta, match) => {
      editor.exec((state) => insertWikiLink(state, match, meta))
    },
  })
  const view = editor.view
  const onClick = (event: MouseEvent): void => {
    const link = (event.target as Element | null)?.closest?.('.trevixal-wikilink[data-doc]')
    if (!(link instanceof HTMLElement) || !view?.dom.contains(link)) return
    const path = pathOfElement(view.dom, view.renderer, link)
    const node = path ? nodeAtPath(editor.state.doc, path) : null
    const id = node?.type.name === WIKI_NODE ? String(node.attrs.doc) : link.dataset.doc
    if (!id) return
    event.preventDefault()
    options.open(id)
  }
  view?.dom.addEventListener('click', onClick)
  return {
    select: (index) => list.select(index),
    dispose() {
      list.dispose()
      view?.dom.removeEventListener('click', onClick)
    },
  }
}

export interface BacklinksPanelOptions {
  readonly container: HTMLElement
  readonly store: WorkspaceStore
  /** The document being edited now. */
  readonly currentId: () => string | null
  /** Open a document from the list. */
  readonly open: (id: string) => void
}

export interface BacklinksPanel {
  readonly element: HTMLElement
  /** Read the links again; called for you whenever the store changes. */
  refresh(): Promise<void>
  destroy(): void
}

/**
 * The documents that link to this one, each a button that opens it: what a
 * wiki calls "What links here". Kept current as documents are saved.
 */
export function createBacklinksPanel(options: BacklinksPanelOptions): BacklinksPanel {
  const document = options.container.ownerDocument
  const element = document.createElement('section')
  element.className = 'trevixal-backlinks'
  element.setAttribute('aria-label', 'Backlinks')
  const heading = document.createElement('h2')
  heading.className = 'trevixal-backlinks__title'
  heading.textContent = 'Backlinks'
  const list = document.createElement('ul')
  list.className = 'trevixal-backlinks__list'
  const empty = document.createElement('p')
  empty.className = 'trevixal-backlinks__empty'
  empty.textContent = 'No other document links here yet. Type [[ in one to link it.'
  element.append(heading, list, empty)
  options.container.appendChild(element)
  let generation = 0

  const refresh = async (): Promise<void> => {
    const mine = ++generation
    const id = options.currentId()
    const found = id ? await backlinks(options.store, id) : []
    if (mine !== generation) return
    list.replaceChildren(
      ...found.map((meta) => {
        const item = document.createElement('li')
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'trevixal-backlinks__item'
        button.textContent = meta.title || 'Untitled'
        button.addEventListener('click', () => options.open(meta.id))
        item.appendChild(button)
        return item
      }),
    )
    empty.hidden = found.length > 0
  }
  const unsubscribe = options.store.subscribe(() => void refresh())
  void refresh()
  return {
    element,
    refresh,
    destroy() {
      unsubscribe()
      element.remove()
    },
  }
}
