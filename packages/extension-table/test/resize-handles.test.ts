// @vitest-environment happy-dom
import {
  type EditorNode,
  Fragment,
  Schema,
  createEditor,
  defaultMarks,
  defaultNodes,
} from '@trevixal/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createTableResizeHandles } from '../src/resize-handles'
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

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

/**
 * happy-dom lays nothing out, so every box the drag measures is stubbed. The
 * table is two 100x20 cells by two rows, 200x40 overall.
 */
function stub(element: Element, box: DOMRect): void {
  Object.defineProperty(element, 'getBoundingClientRect', { value: () => box, configurable: true })
}

interface Mounted {
  readonly editor: ReturnType<typeof createEditor>
  readonly surface: HTMLElement
  readonly cells: readonly HTMLTableCellElement[]
}

function mount(): Mounted {
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
    ]),
  )
  const editor = createEditor({ schema, doc, element: host })
  const surface = editor.view?.dom as HTMLElement
  const table = surface.querySelector('table') as HTMLTableElement
  stub(table, rect(0, 0, 200, 40))
  stub(host, rect(0, 0, 200, 40))
  stub(surface, rect(0, 0, 200, 40))
  const cells = [...table.querySelectorAll('td')]
  stub(cells[0] as Element, rect(0, 0, 100, 20))
  stub(cells[1] as Element, rect(100, 0, 100, 20))
  stub(cells[2] as Element, rect(0, 20, 100, 20))
  stub(cells[3] as Element, rect(100, 20, 100, 20))
  for (const tableRow of [...table.rows]) stub(tableRow, rect(0, tableRow.rowIndex * 20, 200, 20))
  return { editor, surface, cells }
}

function pointer(type: string, target: EventTarget, x: number, y: number): void {
  target.dispatchEvent(
    new window.PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
    }),
  )
}

/** The committed column widths, read off the first row of the document. */
function columnWidths(editor: ReturnType<typeof createEditor>): unknown[] {
  return editor.state.doc
    .child(0)
    .child(0)
    .content.children.map((c) => c.attrs.width)
}

function rowHeights(editor: ReturnType<typeof createEditor>): unknown[] {
  return editor.state.doc.child(0).content.children.map((r) => r.attrs.height)
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('createTableResizeHandles', () => {
  it('moves an inner border alone, leaving the table the width it was', () => {
    const { editor, cells } = mount()
    const handles = createTableResizeHandles(editor)

    // Grab the border between the two columns and pull it 30px right.
    pointer('pointerdown', cells[0] as EventTarget, 98, 10)
    pointer('pointermove', document, 128, 10)
    pointer('pointerup', document, 128, 10)

    expect(columnWidths(editor)).toEqual(['130px', '70px'])
    const table = editor.state.doc.child(0)
    expect(table.attrs.width).toBe('200px')
    // Widths only hold under fixed layout; otherwise they are a minimum.
    expect(table.attrs.layout).toBe('fixed')

    handles.destroy()
    editor.destroy()
  })

  it('stops the dragged column at the minimum width, the neighbour taking the rest', () => {
    const { editor, cells } = mount()
    const handles = createTableResizeHandles(editor)

    pointer('pointerdown', cells[0] as EventTarget, 98, 10)
    pointer('pointermove', document, -200, 10)
    pointer('pointerup', document, -200, 10)

    // Default minColumnWidth is 40, and the pair still adds up to 200.
    expect(columnWidths(editor)).toEqual(['40px', '160px'])

    handles.destroy()
    editor.destroy()
  })

  it('sizes just the dragged row, without pinning any column', () => {
    const { editor, cells } = mount()
    const handles = createTableResizeHandles(editor)

    // The bottom border of the first row, pulled 42px down from a 20px row.
    pointer('pointerdown', cells[0] as EventTarget, 50, 18)
    pointer('pointermove', document, 50, 60)
    pointer('pointerup', document, 50, 60)

    expect(rowHeights(editor)).toEqual(['62px', null])
    expect(columnWidths(editor)).toEqual([null, null])

    handles.destroy()
    editor.destroy()
  })

  it('puts everything back on Escape, committing nothing', () => {
    const { editor, cells } = mount()
    const handles = createTableResizeHandles(editor)

    pointer('pointerdown', cells[0] as EventTarget, 98, 10)
    pointer('pointermove', document, 128, 10)
    document.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    pointer('pointerup', document, 128, 10)

    expect(columnWidths(editor)).toEqual([null, null])
    // The drag borrows these while it runs and owes them back.
    expect(document.body.style.userSelect).toBe('')
    expect(document.body.style.cursor).toBe('')

    handles.destroy()
    editor.destroy()
  })

  it('leaves no guide, handle or cursor behind when destroyed', () => {
    const { editor, surface, cells } = mount()
    const handles = createTableResizeHandles(editor)
    pointer('pointermove', cells[0] as EventTarget, 98, 10)

    handles.destroy()

    expect(document.querySelectorAll('.trevixal-resize-guide')).toHaveLength(0)
    expect(document.querySelectorAll('.trevixal-table-resize-handle')).toHaveLength(0)
    expect(surface.style.cursor).toBe('')

    editor.destroy()
  })
})
