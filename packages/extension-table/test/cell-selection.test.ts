// @vitest-environment happy-dom
import {
  type EditorNode,
  Fragment,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  pos,
} from '@trevixal/core'
import { afterEach, describe, expect, it } from 'vitest'
import { ACTIVE_CELL_CLASS, RANGE_CELL_CLASS, highlightActiveCell } from '../src/active-cell'
import { enableCellSelection } from '../src/cell-selection'
import { mergeCells, splitCell } from '../src/commands'
import { tableNodes } from '../src/schema'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...tableNodes() },
  marks: defaultMarks(),
})

function p(text = ''): EditorNode {
  return schema.node('paragraph', undefined, text ? [schema.text(text)] : [])
}

function cell(text: string): EditorNode {
  return schema.node('tableCell', { header: false, colspan: 1, align: null }, Fragment.of(p(text)))
}

function row(...cells: EditorNode[]): EditorNode {
  return schema.node('tableRow', undefined, Fragment.from(cells))
}

/** A two-by-two table followed by a paragraph outside it. */
function mount(): { host: HTMLElement; editor: ReturnType<typeof createEditor> } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const doc = schema.node(
    'doc',
    undefined,
    Fragment.from([
      schema.node(
        'table',
        undefined,
        Fragment.from([row(cell('a'), cell('b')), row(cell('c'), cell('d'))]),
      ),
      p('after'),
    ]),
  )
  return { host, editor: createEditor({ schema, doc, element: host }) }
}

/** The rendered cell at a row/column, by its text. */
function cellElement(host: HTMLElement, text: string): HTMLElement {
  const found = [...host.querySelectorAll('td, th')].find((el) => el.textContent === text)
  if (!found) throw new Error(`no cell reading "${text}"`)
  return found as HTMLElement
}

function mouse(target: Element, type: string, detail: number): void {
  // The paragraph inside the cell is what a real pointer lands on.
  const inner = target.firstElementChild ?? target
  inner.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, detail, button: 0 }))
}

/** Text the selection covers, as the document sees it. */
function selectedText(editor: ReturnType<typeof createEditor>): string {
  const { from, to } = editor.state.selection
  return `${from.path.join('.')}:${from.offset} -> ${to.path.join('.')}:${to.offset}`
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('enableCellSelection', () => {
  it('leaves a single click alone, so a cell is still editable prose', () => {
    const { host, editor } = mount()
    const dispose = enableCellSelection(editor)

    editor.exec((state) => state.tr.setSelection(new TextSelection(pos([0, 0, 0, 0], 1))))
    mouse(cellElement(host, 'a'), 'mousedown', 1)

    // Untouched: the caret the click put there is still a caret.
    expect(editor.state.selection.empty).toBe(true)

    dispose()
    editor.destroy()
  })

  it('selects the whole cell on a double click', () => {
    const { host, editor } = mount()
    const dispose = enableCellSelection(editor)

    mouse(cellElement(host, 'a'), 'mousedown', 2)

    // Start of the cell's only paragraph to its end: the cell, entirely.
    expect(selectedText(editor)).toBe('0.0.0.0:0 -> 0.0.0.0:1')

    dispose()
    editor.destroy()
  })

  it('extends across cells as the pointer moves', () => {
    const { host, editor } = mount()
    const dispose = enableCellSelection(editor)

    mouse(cellElement(host, 'a'), 'mousedown', 2)
    mouse(cellElement(host, 'b'), 'mousemove', 0)

    // From the first cell's start to the second cell's end.
    expect(selectedText(editor)).toBe('0.0.0.0:0 -> 0.0.1.0:1')

    dispose()
    editor.destroy()
  })

  it('covers both cells when the drag runs backwards', () => {
    const { host, editor } = mount()
    const dispose = enableCellSelection(editor)

    mouse(cellElement(host, 'b'), 'mousedown', 2)
    mouse(cellElement(host, 'a'), 'mousemove', 0)

    // The anchor is the cell the drag started in, so from/to still span both.
    expect(selectedText(editor)).toBe('0.0.0.0:0 -> 0.0.1.0:1')

    dispose()
    editor.destroy()
  })

  it('drops the selection on the next plain click', () => {
    const { host, editor } = mount()
    const dispose = enableCellSelection(editor)

    mouse(cellElement(host, 'a'), 'mousedown', 2)
    mouse(cellElement(host, 'b'), 'mousemove', 0)
    expect(editor.state.selection.empty).toBe(false)

    // A plain click ends the gesture: a later move must not keep extending.
    mouse(cellElement(host, 'a'), 'mousedown', 1)
    mouse(cellElement(host, 'b'), 'mousemove', 0)
    expect(selectedText(editor)).toBe('0.0.0.0:0 -> 0.0.1.0:1')

    dispose()
    editor.destroy()
  })

  it('ignores a drag that leaves the table', () => {
    const { host, editor } = mount()
    const dispose = enableCellSelection(editor)

    mouse(cellElement(host, 'a'), 'mousedown', 2)
    const outside = host.querySelectorAll('p')
    const last = outside[outside.length - 1] as Element
    last.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, detail: 0, button: 0 }))

    // The last valid range stands rather than collapsing mid-drag.
    expect(selectedText(editor)).toBe('0.0.0.0:0 -> 0.0.0.0:1')

    dispose()
    editor.destroy()
  })

  it('stops listening once disposed', () => {
    const { host, editor } = mount()
    const dispose = enableCellSelection(editor)
    dispose()

    editor.exec((state) => state.tr.setSelection(new TextSelection(pos([1], 0))))
    mouse(cellElement(host, 'a'), 'mousedown', 2)

    expect(editor.state.selection.empty).toBe(true)
    editor.destroy()
  })
})

describe('the selection the gesture makes', () => {
  it('is what mergeCells acts on', () => {
    const { host, editor } = mount()
    const dispose = enableCellSelection(editor)

    mouse(cellElement(host, 'a'), 'mousedown', 2)
    mouse(cellElement(host, 'b'), 'mousemove', 0)
    expect(editor.exec(mergeCells)).toBe(true)

    const firstRow = editor.state.doc.child(0).child(0)
    expect(firstRow.childCount).toBe(1)
    expect(firstRow.child(0).attrs.colspan).toBe(2)
    expect(firstRow.child(0).textContent).toBe('ab')

    dispose()
    editor.destroy()
  })

  it('is what splitCell acts on, putting the cells back', () => {
    const { host, editor } = mount()
    const dispose = enableCellSelection(editor)

    mouse(cellElement(host, 'a'), 'mousedown', 2)
    mouse(cellElement(host, 'b'), 'mousemove', 0)
    editor.exec(mergeCells)

    // Double click the merged cell, then split it.
    mouse(cellElement(host, 'ab'), 'mousedown', 2)
    expect(editor.exec(splitCell)).toBe(true)

    const firstRow = editor.state.doc.child(0).child(0)
    expect(firstRow.childCount).toBe(2)
    expect(firstRow.child(0).attrs.colspan).toBe(1)

    dispose()
    editor.destroy()
  })

  it('declines to merge cells from different rows', () => {
    const { host, editor } = mount()
    const dispose = enableCellSelection(editor)

    mouse(cellElement(host, 'a'), 'mousedown', 2)
    mouse(cellElement(host, 'c'), 'mousemove', 0)

    // Vertical merging is not in the schema; the command says no rather than
    // producing a table that cannot be rendered.
    expect(editor.exec(mergeCells)).toBe(false)

    dispose()
    editor.destroy()
  })
})

describe('highlightActiveCell, with a cell selection', () => {
  it('rings one cell for a caret and fills every cell of a range', () => {
    const { host, editor } = mount()
    const disposeHighlight = highlightActiveCell(editor)
    const disposeSelection = enableCellSelection(editor)
    const marked = (className: string): (string | null)[] =>
      [...host.querySelectorAll(`.${className}`)].map((el) => el.textContent)

    editor.exec((state) => state.tr.setSelection(new TextSelection(pos([0, 0, 0, 0], 0))))
    expect(marked(ACTIVE_CELL_CLASS)).toEqual(['a'])
    expect(marked(RANGE_CELL_CLASS)).toEqual([])

    mouse(cellElement(host, 'a'), 'mousedown', 2)
    mouse(cellElement(host, 'b'), 'mousemove', 0)
    expect(marked(RANGE_CELL_CLASS)).toEqual(['a', 'b'])
    expect(marked(ACTIVE_CELL_CLASS)).toEqual([])

    disposeSelection()
    disposeHighlight()
    editor.destroy()
  })

  it('fills the rectangle a two-row drag covers', () => {
    const { host, editor } = mount()
    const disposeHighlight = highlightActiveCell(editor)
    const disposeSelection = enableCellSelection(editor)

    mouse(cellElement(host, 'a'), 'mousedown', 2)
    mouse(cellElement(host, 'd'), 'mousemove', 0)

    // All four: the rectangle between the corners, not just the two corners.
    expect([...host.querySelectorAll(`.${RANGE_CELL_CLASS}`)].map((el) => el.textContent)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])

    disposeSelection()
    disposeHighlight()
    editor.destroy()
  })
})
