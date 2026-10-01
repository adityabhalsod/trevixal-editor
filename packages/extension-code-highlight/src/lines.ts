import {
  type DecorationSource,
  type Editor,
  type EditorNode,
  type InlineDecoration,
  SetNodeAttrsStep,
  lineRangeTest,
  nodeAtPath,
  pathOfElement,
} from '@trevixal/core'

/** How many lines a folded block shows before its "Show all" bar. */
export const COLLAPSED_LINES = 8

/** The class on each line's marker, and on the bar that unfolds a block. */
export const CODE_LINE_CLASS = 'trevixal-code-line'
export const CODE_EXPAND_CLASS = 'trevixal-code-expand'

export interface CodeBlockLinesOptions {
  /** Node type to decorate; `"codeBlock"` by default. */
  readonly nodeName?: string
}

/** Whether a block is written in the diff language, whose lines are coloured by their first character. */
function isDiff(node: EditorNode): boolean {
  const language = typeof node.attrs.language === 'string' ? node.attrs.language : ''
  return /^(?:diff|patch)$/i.test(language.trim())
}

/** The class a diff line takes from its first character: added, removed, or none. */
function diffClass(line: string): string | null {
  if (/^\+(?!\+\+ )/.test(line)) return `${CODE_LINE_CLASS}--added`
  if (/^-(?!-- )/.test(line)) return `${CODE_LINE_CLASS}--removed`
  return null
}

/**
 * A marker at the start of every line of a code block that numbers its
 * lines, picks some out, or is a diff: the number is drawn from its
 * `data-line`, and a picked-out, added or removed line is banded from edge
 * to edge. The markers are zero-width widgets, chrome the document never
 * holds, so the code is exactly what was typed.
 *
 * A folded block (`collapsed`) also gets a bar over its first hidden line,
 * whose button unfolds it. Returns a disposer.
 */
export function codeBlockLines(editor: Editor, options: CodeBlockLinesOptions = {}): () => void {
  const view = editor.view
  if (!view) return () => {}
  const nodeName = options.nodeName ?? 'codeBlock'
  const document = view.dom.ownerDocument
  // The same array for the same node, so an unchanged block is not redrawn.
  const cache = new WeakMap<EditorNode, readonly InlineDecoration[] | null>()

  const unfold = (event: Event): void => {
    event.preventDefault()
    const pre = (event.currentTarget as HTMLElement).closest('pre')
    const path = pre ? pathOfElement(view.dom, view.renderer, pre) : null
    if (!path) return
    editor.exec((state) => {
      const node = nodeAtPath(state.doc, path)
      if (!node || node.type.name !== nodeName) return null
      return state.tr.step(new SetNodeAttrsStep(path, { ...node.attrs, collapsed: false }))
    })
  }

  const expandBar = (lines: number): HTMLElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `${CODE_EXPAND_CLASS}__button`
    button.textContent = `Show all ${lines} lines`
    // A press here must not put the caret in the code under it.
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', unfold)
    return button
  }

  const decorate = (node: EditorNode): readonly InlineDecoration[] | null => {
    const numbered = node.attrs.lineNumbers === true
    const picked = lineRangeTest(node.attrs.highlightLines)
    const diff = isDiff(node)
    const lines = node.textContent.split('\n')
    const folded = node.attrs.collapsed === true && lines.length > COLLAPSED_LINES
    const decorations: InlineDecoration[] = []
    let offset = 0
    lines.forEach((line, index) => {
      const number = index + 1
      const classes = [CODE_LINE_CLASS]
      if (picked(number)) classes.push(`${CODE_LINE_CLASS}--highlight`)
      const change = diff ? diffClass(line) : null
      if (change) classes.push(change)
      if (numbered || classes.length > 1) {
        decorations.push({
          from: offset,
          to: offset,
          className: classes.join(' '),
          attrs: { 'data-line': String(number), 'aria-hidden': 'true' },
          widget: () => document.createElement('span'),
        })
      }
      if (folded && number === COLLAPSED_LINES + 1) {
        decorations.push({
          from: offset,
          to: offset,
          className: CODE_EXPAND_CLASS,
          widget: () => expandBar(lines.length),
        })
      }
      offset += line.length + 1
    })
    return decorations.length > 0 ? decorations : null
  }

  const source: DecorationSource = (node) => {
    if (node.type.name !== nodeName) return null
    if (!cache.has(node)) cache.set(node, decorate(node))
    return cache.get(node) ?? null
  }
  view.setDecorationLayer('code-lines', source)
  return () => view.setDecorationLayer('code-lines', null)
}
