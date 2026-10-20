import {
  type Editor,
  type EditorNode,
  type Path,
  TextSelection,
  inlineSize,
  pos,
} from '@trevixal/core'
import { openDialog } from './dialog'
import { lineStartPoints } from './line-numbers'

/**
 * Word's Go To: a line of the text as it is laid out, a heading, or a
 * bookmark (an anchor), and the caret goes there with the page following.
 */

/** A place to go to: a heading or a bookmark, where it is and what it reads. */
export interface GoToTarget {
  readonly kind: 'heading' | 'bookmark'
  readonly label: string
  readonly path: Path
  readonly offset: number
}

/** Every heading and bookmark in the document, in reading order. */
export function goToTargets(doc: EditorNode): GoToTarget[] {
  const targets: GoToTarget[] = []
  const visit = (node: EditorNode, path: Path): void => {
    if (node.isTextblock) {
      if (node.type.name === 'heading') {
        const words = node.textContent.trim()
        targets.push({ kind: 'heading', label: words || '(empty heading)', path, offset: 0 })
      }
      let offset = 0
      for (const child of node.content.children) {
        if (child.type.name === 'anchor') {
          targets.push({ kind: 'bookmark', label: String(child.attrs.id ?? ''), path, offset })
        }
        offset += inlineSize(child)
      }
      return
    }
    node.content.children.forEach((child, index) => visit(child, [...path, index]))
  }
  doc.content.children.forEach((child, index) => visit(child, [index]))
  return targets
}

/** Put the caret at a place and bring it into view. */
function goTo(editor: Editor, path: Path, offset: number): void {
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos(path, offset))))
  editor.view?.scrollSelectionIntoView({ block: 'center' })
  editor.view?.focus()
}

/** The caret put at the start of a laid-out line of text, counted from 1; false past the last. */
export function goToLine(editor: Editor, line: number): boolean {
  const view = editor.view
  if (!view) return false
  const point = lineStartPoints(view.dom)[line - 1]
  if (!point) return false
  view.dom.ownerDocument.getSelection()?.collapse(point.node, point.offset)
  view.syncSelectionFromDOM()
  view.scrollSelectionIntoView({ block: 'center' })
  view.focus()
  return true
}

/**
 * The Go To dialog: a line number, a heading, or a bookmark. Lines are the
 * ones on screen, so a wrapped paragraph has several, as in Word.
 */
export function openGoToDialog(document: Document, editor: Editor): void {
  const targets = goToTargets(editor.state.doc)
  const headings = targets.filter((target) => target.kind === 'heading')
  const bookmarks = targets.filter((target) => target.kind === 'bookmark')
  const kinds = [
    { value: 'line', label: 'Line' },
    ...(headings.length > 0 ? [{ value: 'heading', label: 'Heading' }] : []),
    ...(bookmarks.length > 0 ? [{ value: 'bookmark', label: 'Bookmark' }] : []),
  ]
  const lines = editor.view ? lineStartPoints(editor.view.dom).length : 0
  void openDialog({
    document,
    title: 'Go to',
    submitLabel: 'Go to',
    fields: [
      { name: 'kind', label: 'Go to what', type: 'select', value: 'line', options: kinds },
      {
        name: 'line',
        label: 'Line number',
        type: 'number',
        value: '1',
        hint: lines > 0 ? `1 to ${lines}` : undefined,
        visibleWhen: { field: 'kind', values: ['line'] },
      },
      {
        name: 'heading',
        label: 'Heading',
        type: 'select',
        value: '0',
        options: headings.map((target, index) => ({ value: String(index), label: target.label })),
        visibleWhen: { field: 'kind', values: ['heading'] },
      },
      {
        name: 'bookmark',
        label: 'Bookmark',
        type: 'select',
        value: '0',
        options: bookmarks.map((target, index) => ({ value: String(index), label: target.label })),
        visibleWhen: { field: 'kind', values: ['bookmark'] },
      },
    ],
  }).then((values) => {
    if (!values) {
      editor.view?.focus()
      return
    }
    if (values.kind === 'line') {
      const line = Math.max(1, Math.min(lines, Math.round(Number(values.line) || 1)))
      if (!goToLine(editor, line)) editor.view?.focus()
      return
    }
    const list = values.kind === 'heading' ? headings : bookmarks
    const target = list[Number(values[values.kind ?? ''] ?? 0)]
    if (target) goTo(editor, target.path, target.offset)
    else editor.view?.focus()
  })
}
