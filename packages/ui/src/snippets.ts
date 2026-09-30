import {
  type Command,
  type Editor,
  type EditorNode,
  type EditorState,
  Fragment,
  type NodeJSON,
  ReplaceInlineStep,
  TextSelection,
  blocksInRange,
  insertContent,
  nodeAtPath,
  nodeFromJSON,
  pos,
  sliceInline,
  splitBlock,
} from '@trevixal/core'

/**
 * Word's Quick Parts and a text expander's abbreviations: a piece of the
 * document kept under a short name, put back by name from Insert ▸ Snippet,
 * or by typing its abbreviation and a space, Tab or Enter.
 */

export interface Snippet {
  /** What is typed to put it in: `;sig`. */
  readonly abbreviation: string
  /** What the list calls it. */
  readonly name: string
  /** The blocks it puts in, with their formatting, as the document keeps them. */
  readonly content: readonly NodeJSON[]
}

/** Where the snippets are kept; the host decides, as it does for preferences. */
export interface SnippetStore {
  list(): readonly Snippet[]
  save(snippets: readonly Snippet[]): void
}

/** An abbreviation as one word: letters, digits and a few marks, no spaces. */
const ABBREVIATION = /^[^\s]{2,32}$/

/** Whether text can be an abbreviation. */
export function isAbbreviation(text: string): boolean {
  return ABBREVIATION.test(text)
}

/** A snippet's blocks as the schema's nodes; those it cannot hold are left out. */
function nodesOf(state: EditorState, snippet: Snippet): EditorNode[] {
  const nodes: EditorNode[] = []
  for (const json of snippet.content) {
    try {
      nodes.push(nodeFromJSON(state.schema, json))
    } catch {
      // A block this schema has no type for is skipped, not the whole snippet.
    }
  }
  return nodes
}

/**
 * Put a snippet in at the caret. A snippet of paragraphs goes in as typing
 * would: its first line joins the line the caret is on, and each next one
 * starts a new paragraph; anything else (a table, a list) goes in as a paste.
 */
export function insertSnippet(snippet: Snippet): Command {
  return (state) => {
    const nodes = nodesOf(state, snippet)
    if (nodes.length === 0) return null
    if (!nodes.every((node) => node.type.name === 'paragraph')) return insertContent(nodes)(state)
    const tr = state.tr
    let current = state
    nodes.forEach((node, index) => {
      const commands = [
        ...(index > 0 ? [splitBlock] : []),
        ...(node.content.childCount > 0 ? [insertContent(node.content.children)] : []),
      ]
      for (const command of commands) {
        const next = command(current)
        if (!next) continue
        for (const step of next.steps) tr.step(step)
        tr.setSelection(next.selection)
        current = current.apply(next)
      }
    })
    return tr.docChanged ? tr : null
  }
}

/** The selection's blocks as a snippet's content: what Save as snippet keeps. */
export function selectionContent(state: EditorState): NodeJSON[] {
  const { doc, selection } = state
  return blocksInRange(doc, selection.from, selection.to)
    .filter((block) => block.from < block.to)
    .map((block) =>
      block.node.withContent(sliceInline(block.node.content, block.from, block.to)).toJSON(),
    )
}

/** A plain text snippet's content: a paragraph a line. */
export function textContent(text: string): NodeJSON[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' },
    )
}

/**
 * The snippet whose abbreviation ends at the caret, standing alone (at the
 * start of the line or after a space), and where it starts.
 */
export function abbreviationAt(
  state: EditorState,
  snippets: readonly Snippet[],
): { snippet: Snippet; from: number } | null {
  const selection = state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const block = nodeAtPath(state.doc, selection.head.path)
  if (!block?.isTextblock || block.type.spec.preserveWhitespace) return null
  const caret = selection.head.offset
  // One character an inline atom, so string offsets are the editor's.
  const before = sliceInline(block.content, 0, caret)
    .children.map((child) => (child.isText ? child.textContent : '\uFFFC'))
    .join('')
  for (const snippet of snippets) {
    const abbreviation = snippet.abbreviation
    if (!before.endsWith(abbreviation)) continue
    const start = before.length - abbreviation.length
    if (start > 0 && !/\s/.test(before[start - 1] as string)) continue
    return { snippet, from: caret - abbreviation.length }
  }
  return null
}

/** Replace the abbreviation before the caret with its snippet. */
export function expandAbbreviation(snippets: readonly Snippet[]): Command {
  return (state) => {
    const found = abbreviationAt(state, snippets)
    if (!found) return null
    const path = (state.selection as TextSelection).head.path
    const caret = (state.selection as TextSelection).head.offset
    const tr = state.tr.step(new ReplaceInlineStep(path, found.from, caret, Fragment.empty))
    tr.setSelection(new TextSelection(pos(path, found.from)))
    const inserted = insertSnippet(found.snippet)(state.apply(tr))
    if (!inserted) return tr
    for (const step of inserted.steps) tr.step(step)
    return tr.setSelection(inserted.selection)
  }
}

/**
 * Expand abbreviations as they are typed: an abbreviation followed by a
 * space or Enter becomes its snippet, and the key goes on to do what it
 * does; Tab expands without adding anything. Returns a disposer.
 */
export function enableSnippetExpansion(editor: Editor, store: SnippetStore): () => void {
  const view = editor.view
  if (!view) return () => {}
  return view.addKeydownInterceptor((event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return false
    if (event.key !== ' ' && event.key !== 'Enter' && event.key !== 'Tab') return false
    const snippets = store.list()
    if (snippets.length === 0 || !abbreviationAt(editor.state, snippets)) return false
    editor.exec(expandAbbreviation(snippets))
    // Space and Enter still type; Tab only expands.
    return event.key === 'Tab'
  })
}

/** Whether a document's blocks are empty of text. */
function isBlank(content: readonly NodeJSON[]): boolean {
  const text = (node: NodeJSON): string => node.text ?? (node.content ?? []).map(text).join('')
  return content.every((node) => text(node).trim() === '' && node.type === 'paragraph')
}

/** One snippet as its row in the list: the abbreviation, the name, its first words. */
function preview(snippet: Snippet): string {
  const text = (node: NodeJSON): string => node.text ?? (node.content ?? []).map(text).join(' ')
  const words = snippet.content.map(text).join(' ').replace(/\s+/g, ' ').trim()
  return words.length > 60 ? `${words.slice(0, 57)}…` : words
}

/**
 * The snippets dialog: every snippet with its abbreviation, a Delete each,
 * and a form for a new one, from the selection or typed in.
 */
export function openSnippetsDialog(
  document: Document,
  editor: Editor,
  store: SnippetStore,
): Promise<void> {
  const overlay = document.createElement('div')
  overlay.className = 'trevixal-dialog-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'trevixal-dialog trevixal-snippets'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', 'Snippets')
  const heading = document.createElement('h2')
  heading.className = 'trevixal-dialog__title'
  heading.textContent = 'Snippets'
  const body = document.createElement('p')
  body.className = 'trevixal-dialog__body'
  body.textContent =
    'Type a snippet’s abbreviation and a space, Enter or Tab to put the snippet in, or pick one from Insert ▸ Snippet.'
  const list = document.createElement('ul')
  list.className = 'trevixal-snippets__list'

  const form = document.createElement('form')
  form.className = 'trevixal-dialog__form'
  const field = (name: string, label: string, control: HTMLInputElement | HTMLTextAreaElement) => {
    const row = document.createElement('label')
    row.className = 'trevixal-dialog__field'
    const caption = document.createElement('span')
    caption.className = 'trevixal-dialog__label'
    caption.textContent = label
    control.name = name
    control.className = 'trevixal-dialog__input'
    row.append(caption, control)
    return row
  }
  const abbreviation = document.createElement('input')
  abbreviation.placeholder = ';sig'
  const name = document.createElement('input')
  name.placeholder = 'Signature'
  const text = document.createElement('textarea')
  text.rows = 3
  const hasSelection = !editor.state.selection.empty
  text.placeholder = hasSelection
    ? 'Leave empty to keep the selected text, formatting and all'
    : 'What it puts in'
  const problem = document.createElement('p')
  problem.className = 'trevixal-dialog__hint'
  problem.setAttribute('role', 'alert')
  const add = document.createElement('button')
  add.type = 'submit'
  add.className = 'trevixal-dialog__button'
  add.textContent = 'Add snippet'
  form.append(
    field('abbreviation', 'Abbreviation', abbreviation),
    field('name', 'Name', name),
    field('text', 'Text', text),
    problem,
    add,
  )
  const actions = document.createElement('div')
  actions.className = 'trevixal-dialog__actions'
  const done = document.createElement('button')
  done.type = 'button'
  done.className = 'trevixal-dialog__button trevixal-dialog__button--primary'
  done.textContent = 'Done'
  actions.appendChild(done)
  dialog.append(heading, body, list, form, actions)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)
  const selection = selectionContent(editor.state)

  const render = (): void => {
    const snippets = store.list()
    list.replaceChildren(
      ...snippets.map((snippet) => {
        const item = document.createElement('li')
        item.className = 'trevixal-snippets__item'
        const label = document.createElement('span')
        label.className = 'trevixal-snippets__label'
        const key = document.createElement('kbd')
        key.textContent = snippet.abbreviation
        label.append(key, ` ${snippet.name}: ${preview(snippet)}`)
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'trevixal-dialog__button'
        remove.textContent = 'Delete'
        remove.setAttribute('aria-label', `Delete ${snippet.name}`)
        remove.addEventListener('click', () => {
          store.save(store.list().filter((each) => each.abbreviation !== snippet.abbreviation))
          render()
        })
        item.append(label, remove)
        return item
      }),
    )
  }
  render()

  return new Promise((resolve) => {
    const finish = (): void => {
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
      editor.view?.focus()
      resolve()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      finish()
    }
    document.addEventListener('keydown', onKey, true)
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const short = abbreviation.value.trim()
      if (!isAbbreviation(short)) {
        problem.textContent = 'An abbreviation is one word of 2 to 32 characters, with no spaces.'
        return
      }
      const content = text.value.trim() ? textContent(text.value) : selection
      if (content.length === 0 || isBlank(content)) {
        problem.textContent = 'Type the text it puts in, or select some before opening this.'
        return
      }
      const snippet: Snippet = { abbreviation: short, name: name.value.trim() || short, content }
      store.save([...store.list().filter((each) => each.abbreviation !== short), snippet])
      abbreviation.value = ''
      name.value = ''
      text.value = ''
      problem.textContent = ''
      render()
    })
    done.addEventListener('click', finish)
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) finish()
    })
    abbreviation.focus()
  })
}
