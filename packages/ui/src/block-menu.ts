import {
  type Announcer,
  type Editor,
  type EditorNode,
  Fragment,
  MoveNodeStep,
  ReplaceNodesStep,
  SetNodeAttrsStep,
  TextSelection,
  inlineLength,
  pos,
  safeElementId,
} from '@trevixal/core'
import { bindListNavigation, focusFirstItem } from './dropdown'
import { type IconName, createIcon } from './icons'

/**
 * The block menu: what the grip beside a block offers when it is clicked
 * rather than dragged. Turn the block into another kind, duplicate it, move
 * it, copy a link to it, or delete it. Every entry is one undoable edit.
 */

/** A top-level block's first and last text, the span "turn into" works over. */
function blockSpan(doc: EditorNode, index: number): TextSelection | null {
  const block = doc.content.maybeChild(index)
  if (!block) return null
  const first: number[] = [index]
  let node = block
  while (!node.isTextblock && node.childCount > 0) {
    node = node.child(0)
    first.push(0)
  }
  if (!node.isTextblock) return null
  const last: number[] = [index]
  let tail = block
  while (!tail.isTextblock && tail.childCount > 0) {
    last.push(tail.childCount - 1)
    tail = tail.child(tail.childCount - 1)
  }
  return new TextSelection(pos(first, 0), pos(last, inlineLength(tail.content)))
}

const LISTS = new Set(['bulletList', 'orderedList', 'taskList'])

/** What a block can be turned into, and how. Each starts from plain paragraphs. */
interface Kind {
  readonly name: string
  readonly label: string
  readonly icon: IconName
  /** The block type that already is this kind, which the entry then skips. */
  readonly is: (block: EditorNode) => boolean
  readonly apply: (editor: Editor) => boolean
}

const KINDS: readonly Kind[] = [
  {
    name: 'text',
    label: 'Text',
    icon: 'langPlain',
    is: (block) => block.type.name === 'paragraph',
    apply: (editor) => editor.commands.setParagraph(),
  },
  ...([1, 2, 3] as const).map(
    (level): Kind => ({
      name: `heading${level}`,
      label: `Heading ${level}`,
      icon: 'caseUpper',
      is: (block) => block.type.name === 'heading' && block.attrs.level === level,
      apply: (editor) => editor.commands.setHeading(level),
    }),
  ),
  {
    name: 'bulletList',
    label: 'Bullet list',
    icon: 'bulletList',
    is: (block) => block.type.name === 'bulletList',
    apply: (editor) => editor.commands.toggleBulletList(),
  },
  {
    name: 'orderedList',
    label: 'Numbered list',
    icon: 'orderedList',
    is: (block) => block.type.name === 'orderedList',
    apply: (editor) => editor.commands.toggleOrderedList(),
  },
  {
    name: 'taskList',
    label: 'To-do list',
    icon: 'taskList',
    is: (block) => block.type.name === 'taskList',
    apply: (editor) => editor.commands.toggleTaskList(),
  },
  {
    name: 'quote',
    label: 'Quote',
    icon: 'quote',
    is: (block) => block.type.name === 'blockquote',
    apply: (editor) => editor.commands.wrapIn('blockquote'),
  },
  {
    name: 'codeBlock',
    label: 'Code block',
    icon: 'codeLanguage',
    is: (block) => block.type.name === 'codeBlock',
    apply: (editor) => editor.commands.setCodeBlock(),
  },
]

/** Whether "turn into" can take this block apart: prose, a list, a quote, code. */
function canTurn(block: EditorNode): boolean {
  return block.isTextblock || LISTS.has(block.type.name) || block.type.name === 'blockquote'
}

/**
 * Turn the block at `index` into `kind`: back to plain paragraphs first
 * (out of its list or quote), then into the new kind. The steps run inside
 * one history group, so one undo takes the whole change back.
 */
function turnInto(editor: Editor, index: number, kind: Kind): void {
  const select = (): boolean => {
    const span = blockSpan(editor.state.doc, index)
    if (span) editor.dispatch(editor.state.tr.setSelection(span))
    return span !== null
  }
  if (!select()) return
  const block = editor.state.doc.child(index)
  if (LISTS.has(block.type.name)) editor.commands.unwrapList()
  else if (block.type.name === 'blockquote') editor.commands.lift()
  else if (block.type.name !== 'paragraph' && kind.name !== 'text') editor.commands.setParagraph()
  // Taking a list or a quote apart leaves its paragraphs where it was, from
  // `index` on; the selection already spans them.
  kind.apply(editor)
}

/** Every id the document holds, so a new one can be told apart from them. */
function idsIn(doc: EditorNode): Set<string> {
  const ids = new Set<string>()
  const walk = (node: EditorNode): void => {
    const id = safeElementId(node.attrs.id)
    if (id) ids.add(id)
    for (const child of node.content.children) walk(child)
  }
  walk(doc)
  return ids
}

/** A copy for "Duplicate": the same content, without the ids that name one block. */
function withoutIds(node: EditorNode): EditorNode {
  if (node.isText) return node
  const content = Fragment.from(node.content.children.map(withoutIds))
  const ownsId = node.type.spec.attrs?.id?.default === null && node.attrs.id !== null
  return (ownsId ? node.withAttrs({ ...node.attrs, id: null }) : node).withContent(content)
}

/** The block, or the first text inside it, that can carry the id a link names. */
function linkable(doc: EditorNode, index: number): { path: number[]; node: EditorNode } | null {
  const visit = (node: EditorNode, path: number[]): { path: number[]; node: EditorNode } | null => {
    if (node.type.spec.attrs?.id?.default === null) return { path, node }
    for (let i = 0; i < node.childCount; i++) {
      const found = visit(node.child(i), [...path, i])
      if (found) return found
    }
    return null
  }
  const block = doc.content.maybeChild(index)
  return block ? visit(block, [index]) : null
}

/** An id from a block's words: `the-plan`, starting with a letter as an HTML id must. */
function slugFor(text: string, taken: ReadonlySet<string>): string {
  const slug = text
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const base = /^[a-z]/.test(slug) && !slug.startsWith('tvx-') ? slug : `block-${slug || 'link'}`
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

export interface BlockMenuOptions {
  /** Where the menu is appended; the grip's container. */
  readonly container: HTMLElement
  readonly announcer: Announcer
}

export interface BlockMenu {
  readonly element: HTMLElement
  readonly isOpen: boolean
  /** Open the menu for the top-level block at `index`, beside `anchor`. */
  open(index: number, anchor: HTMLElement): void
  close(): void
  destroy(): void
}

export function createBlockMenu(editor: Editor, options: BlockMenuOptions): BlockMenu {
  const { container, announcer } = options
  const document = container.ownerDocument
  const panel = document.createElement('div')
  panel.className = 'trevixal-blockmenu'
  panel.setAttribute('role', 'menu')
  panel.setAttribute('aria-label', 'Block')
  panel.hidden = true
  container.appendChild(panel)
  const releaseNavigation = bindListNavigation(panel)

  let anchor: HTMLElement | null = null

  const close = (): void => {
    if (panel.hidden) return
    panel.hidden = true
    panel.textContent = ''
    anchor = null
  }

  /** Run an entry: close first, so focus lands in the editor, not in a vanished menu. */
  const act = (run: () => void): void => {
    close()
    editor.view?.focus()
    run()
  }

  const item = (label: string, icon: IconName, run: () => void, disabled = false): HTMLElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'trevixal-blockmenu__item'
    button.setAttribute('role', 'menuitem')
    button.disabled = disabled
    const glyph = createIcon(document, icon)
    if (glyph) button.appendChild(glyph)
    const text = document.createElement('span')
    text.textContent = label
    button.appendChild(text)
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => act(run))
    return button
  }

  const heading = (label: string): HTMLElement => {
    const element = document.createElement('p')
    element.className = 'trevixal-blockmenu__heading'
    element.setAttribute('role', 'presentation')
    element.textContent = label
    return element
  }

  const build = (index: number): void => {
    const doc = editor.state.doc
    const block = doc.child(index)
    panel.textContent = ''
    panel.append(heading('Turn into'))
    for (const kind of KINDS) {
      panel.append(
        item(
          kind.label,
          kind.icon,
          () => turnInto(editor, index, kind),
          !canTurn(block) || kind.is(block),
        ),
      )
    }
    const rule = document.createElement('hr')
    rule.className = 'trevixal-blockmenu__rule'
    panel.append(rule)
    panel.append(
      item('Duplicate', 'copy', () => {
        editor.dispatch(
          editor.state.tr.step(
            new ReplaceNodesStep([], index + 1, index + 1, Fragment.of(withoutIds(block))),
          ),
        )
        announcer.announce('Block duplicated')
      }),
      item(
        'Move up',
        'tableMoveRowUp',
        () => {
          editor.dispatch(editor.state.tr.step(new MoveNodeStep([], index, index - 1)))
          announcer.announce(`Block moved to position ${index}`)
        },
        index === 0,
      ),
      item(
        'Move down',
        'tableMoveRowDown',
        () => {
          editor.dispatch(editor.state.tr.step(new MoveNodeStep([], index, index + 1)))
          announcer.announce(`Block moved to position ${index + 2}`)
        },
        index === doc.childCount - 1,
      ),
      item(
        'Copy link to block',
        'link',
        () => {
          const target = linkable(editor.state.doc, index)
          if (!target) return
          let id = safeElementId(target.node.attrs.id)
          if (!id) {
            id = slugFor(target.node.textContent, idsIn(editor.state.doc))
            editor.dispatch(
              editor.state.tr.step(new SetNodeAttrsStep(target.path, { ...target.node.attrs, id })),
            )
          }
          const location = document.defaultView?.location
          const href = `${location ? location.href.split('#')[0] : ''}#${id}`
          void document.defaultView?.navigator.clipboard?.writeText(href).catch(() => undefined)
          announcer.announce('Link to the block copied')
        },
        linkable(doc, index) === null,
      ),
      item('Delete', 'trash', () => {
        const tr = editor.state.tr
        // The document keeps one block; the last one goes by being emptied.
        const replacement =
          doc.childCount > 1
            ? Fragment.empty
            : Fragment.of(editor.state.schema.firstTextblockType().create())
        tr.step(new ReplaceNodesStep([], index, index + 1, replacement))
        const at = Math.min(index, tr.doc.childCount - 1)
        const span = blockSpan(tr.doc, at)
        if (span) tr.setSelection(new TextSelection(span.from))
        editor.dispatch(tr)
        announcer.announce('Block deleted')
      }),
    )
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' && event.key !== 'Tab') return
    if (event.key === 'Escape') event.preventDefault()
    const returnTo = anchor
    close()
    // The grip hides once the pointer has left its block for the menu; focus
    // handed to a hidden grip would be lost, so it goes back to the text.
    if (returnTo && !returnTo.hidden && returnTo.getClientRects().length > 0) returnTo.focus()
    else editor.view?.focus()
  }
  const onPointerDown = (event: PointerEvent): void => {
    if (panel.hidden) return
    const target = event.target as Node | null
    if (target && (panel.contains(target) || anchor?.contains(target))) return
    close()
  }
  panel.addEventListener('keydown', onKeyDown)
  document.addEventListener('pointerdown', onPointerDown, true)

  return {
    element: panel,
    get isOpen() {
      return !panel.hidden
    },
    open(index, at) {
      if (index < 0 || index >= editor.state.doc.childCount) return
      anchor = at
      build(index)
      panel.hidden = false
      // Below the grip, lined up with it: its left edge, or in right-to-left
      // text, where the grip sits past the block's right, its right edge.
      const rtl = document.defaultView?.getComputedStyle(at).direction === 'rtl'
      const left = rtl ? at.offsetLeft + at.offsetWidth - panel.offsetWidth : at.offsetLeft
      panel.style.left = `${left}px`
      panel.style.top = `${at.offsetTop + at.offsetHeight + 4}px`
      focusFirstItem(panel)
    },
    close,
    destroy() {
      close()
      releaseNavigation()
      panel.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
      panel.remove()
    },
  }
}
