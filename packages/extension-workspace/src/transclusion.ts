import {
  ADD_TO_HISTORY,
  type Command,
  type DocJSON,
  type Editor,
  type EditorNode,
  Fragment,
  type NodeJSON,
  NodeSelection,
  type NodeSpec,
  type Path,
  ReplaceNodesStep,
  SetNodeAttrsStep,
  escapeHTML,
  nodeAtPath,
  nodeFromJSON,
  pathOfElement,
  safeElementId,
  serializeToHTML,
} from '@trevixal/core'
import type { WorkspaceStore } from './store'

const TRANSCLUSION_NODE = 'transclusion'

/** How long edits settle before inclusions are read again. */
const SETTLE_MS = 400

/** What an inclusion shows while its source has not been read yet, or is gone. */
const MISSING = 'This document is not in the workspace.'

/** The content an inclusion holds, as stored: the blocks it shows. */
function blocksOf(value: unknown): NodeJSON[] {
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as NodeJSON[]) : []
  } catch {
    return []
  }
}

/** An inclusion's blocks drawn as HTML, through the schema, so nothing in them is trusted markup. */
function drawnBlocks(node: EditorNode): string {
  const blocks = blocksOf(node.attrs.content)
  if (blocks.length === 0) return `<p class="trevixal-transclusion__missing">${MISSING}</p>`
  try {
    const schema = node.type.schema
    const doc = nodeFromJSON(schema, { type: schema.topType.name, content: blocks } as NodeJSON)
    return serializeToHTML(doc)
  } catch {
    return `<p class="trevixal-transclusion__missing">${MISSING}</p>`
  }
}

/**
 * A block or a whole document from the workspace, shown here and kept in
 * step with it: an atom holding the source's id, the block's when it is one,
 * and the blocks it last read, which the updater refreshes whenever the
 * source is saved. It cannot be edited here; its bar opens the source.
 */
export function transclusionNodes(): Record<string, NodeSpec> {
  return {
    [TRANSCLUSION_NODE]: {
      group: 'block',
      atom: true,
      attrs: {
        doc: { default: '' },
        block: { default: null },
        title: { default: '' },
        content: { default: '' },
      },
      toHTML: (node) => {
        const title = String(node.attrs.title || 'Untitled')
        const block = safeElementId(node.attrs.block)
        return {
          tag: 'div',
          attrs: {
            class: 'trevixal-transclusion',
            'data-transclusion-doc': String(node.attrs.doc ?? ''),
            ...(block ? { 'data-transclusion-block': block } : {}),
            'data-transclusion-title': title,
            'data-transclusion-content': String(node.attrs.content ?? ''),
          },
          innerHTML: `<div class="trevixal-transclusion__bar"><span>Included from ${escapeHTML(title)}</span><button type="button" class="trevixal-transclusion__open">Open</button></div><div class="trevixal-transclusion__body">${drawnBlocks(node)}</div>`,
        }
      },
      parseHTML: [
        {
          tag: 'div',
          attribute: 'data-transclusion-doc',
          getAttrs: (element) => ({
            doc: element.getAttribute('data-transclusion-doc') ?? '',
            block: safeElementId(element.getAttribute('data-transclusion-block')),
            title: element.getAttribute('data-transclusion-title') ?? '',
            content: element.getAttribute('data-transclusion-content') ?? '',
          }),
        },
      ],
    },
  }
}

/** Every block in a document with an id a transclusion can name, and its first words. */
export function includableBlocks(doc: DocJSON): { id: string; label: string }[] {
  const found: { id: string; label: string }[] = []
  const words = (node: NodeJSON): string =>
    node.text ?? (node.content ?? []).map((child) => words(child)).join('')
  const visit = (node: NodeJSON): void => {
    const id = safeElementId((node.attrs as Record<string, unknown> | undefined)?.id)
    if (id && node.type !== TRANSCLUSION_NODE) {
      const text = words(node).replace(/\s+/g, ' ').trim()
      found.push({ id, label: text.length > 50 ? `${text.slice(0, 47)}…` : text || id })
    }
    for (const child of node.content ?? []) visit(child)
  }
  for (const child of doc.content ?? []) visit(child)
  return found
}

/**
 * What an inclusion of `doc` shows: the block with `block` as its id, or the
 * whole document. An inclusion inside the source shows only its bar, so two
 * documents that include each other cannot nest without end.
 */
export function inclusionContent(doc: DocJSON, block: string | null): NodeJSON[] {
  const flat = (node: NodeJSON): NodeJSON =>
    node.type === TRANSCLUSION_NODE
      ? { ...node, attrs: { ...(node.attrs ?? {}), content: '' } }
      : node.content
        ? { ...node, content: node.content.map(flat) }
        : node
  if (!block) return (doc.content ?? []).map(flat)
  let found: NodeJSON | null = null
  const visit = (node: NodeJSON): void => {
    if (found) return
    if ((node.attrs as Record<string, unknown> | undefined)?.id === block) {
      found = node
      return
    }
    for (const child of node.content ?? []) visit(child)
  }
  for (const child of doc.content ?? []) visit(child)
  // A list item or a table cell is not a block on its own: include its contents.
  const hit = found as NodeJSON | null
  if (!hit) return []
  if (hit.type === 'listItem' || hit.type === 'tableCell') return (hit.content ?? []).map(flat)
  return [flat(hit)]
}

/** Put in an inclusion of a document, or of one block of it, after the block at the caret. */
export function insertTransclusion(
  source: { id: string; title: string; doc: DocJSON },
  block: string | null = null,
): Command {
  return (state) => {
    const type = state.schema.nodes[TRANSCLUSION_NODE]
    if (!type) return null
    const selection = state.selection
    const path = selection instanceof NodeSelection ? selection.path : selection.to.path
    if (path.length === 0) return null
    const parentPath = path.slice(0, -1)
    const index = (path[path.length - 1] as number) + 1
    const node = type.create({
      doc: source.id,
      block,
      title: source.title,
      content: JSON.stringify(inclusionContent(source.doc, block)),
    })
    const tr = state.tr.step(new ReplaceNodesStep(parentPath, index, index, Fragment.of(node)))
    return tr.setSelection(new NodeSelection([...parentPath, index]))
  }
}

/** Every inclusion in a document, with where it is. */
function inclusionsIn(doc: EditorNode): { path: Path; node: EditorNode }[] {
  const found: { path: Path; node: EditorNode }[] = []
  const visit = (node: EditorNode, path: Path): void => {
    if (node.type.name === TRANSCLUSION_NODE) found.push({ path, node })
    else if (!node.isTextblock)
      node.content.children.forEach((child, i) => visit(child, [...path, i]))
  }
  doc.content.children.forEach((child, i) => visit(child, [i]))
  return found
}

export interface TransclusionOptions {
  readonly store: WorkspaceStore | Promise<WorkspaceStore>
  /** Open a source document, when its inclusion's Open is pressed. */
  readonly open: (id: string) => void
}

export interface Transclusions {
  /** Read every inclusion's source again now. */
  refresh(): Promise<void>
  dispose(): void
}

/**
 * Keep every inclusion in the editor in step with its source: read again
 * whenever the store changes and whenever the document is replaced, outside
 * the undo history, since nobody edited this document. The bar's Open opens
 * the source.
 */
export function enableTransclusions(editor: Editor, options: TransclusionOptions): Transclusions {
  let generation = 0
  const refresh = async (): Promise<void> => {
    const mine = ++generation
    const store = await options.store
    const found = inclusionsIn(editor.state.doc)
    if (found.length === 0) return
    const updates: { path: Path; attrs: Record<string, unknown> }[] = []
    for (const { path, node } of found) {
      const record = await store.get(String(node.attrs.doc))
      const block = safeElementId(node.attrs.block)
      const content = record ? JSON.stringify(inclusionContent(record.doc, block)) : ''
      const title = record?.title ?? String(node.attrs.title)
      if (content !== node.attrs.content || title !== node.attrs.title) {
        updates.push({ path, attrs: { ...node.attrs, content, title } })
      }
    }
    // A newer refresh started, or the document moved on under this one.
    if (mine !== generation || updates.length === 0) return
    const tr = editor.state.tr
    for (const update of updates) {
      const node = nodeAtPath(tr.doc, update.path)
      if (node?.type.name === TRANSCLUSION_NODE)
        tr.step(new SetNodeAttrsStep(update.path, update.attrs))
    }
    if (tr.docChanged) editor.dispatch(tr.setMeta(ADD_TO_HISTORY, false))
  }

  let unsubscribe: (() => void) | null = null
  let disposed = false
  void Promise.resolve(options.store).then((store) => {
    if (disposed) return
    unsubscribe = store.subscribe(() => void refresh())
  })
  // A document switched in, or an inclusion just put in, may be behind its
  // source: read again once the edits settle, while there are any to read.
  let timer: ReturnType<typeof setTimeout> | null = null
  const offUpdate = editor.on('update', () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    if (inclusionsIn(editor.state.doc).length === 0) return
    timer = setTimeout(() => {
      timer = null
      void refresh()
    }, SETTLE_MS)
  })

  const view = editor.view
  const onClick = (event: MouseEvent): void => {
    const button = (event.target as Element | null)?.closest?.('.trevixal-transclusion__open')
    const block = button?.closest('.trevixal-transclusion')
    if (!(block instanceof HTMLElement) || !view?.dom.contains(block)) return
    event.preventDefault()
    const path = pathOfElement(view.dom, view.renderer, block)
    const node = path ? nodeAtPath(editor.state.doc, path) : null
    const id =
      node?.type.name === TRANSCLUSION_NODE ? String(node.attrs.doc) : block.dataset.transclusionDoc
    if (id) options.open(id)
  }
  view?.dom.addEventListener('click', onClick)
  void refresh()
  return {
    refresh,
    dispose() {
      disposed = true
      if (timer !== null) clearTimeout(timer)
      unsubscribe?.()
      offUpdate()
      view?.dom.removeEventListener('click', onClick)
    },
  }
}
