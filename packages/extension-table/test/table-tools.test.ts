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
import { createTableTools } from '../src/table-tools'

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

/** happy-dom lays nothing out, so every box the tools measure is stubbed. */
function stub(element: Element, box: DOMRect): void {
  Object.defineProperty(element, 'getBoundingClientRect', { value: () => box, configurable: true })
}

/**
 * Two rows of two 100x20 cells, 200x40 overall, and below it a paragraph
 * from y 60 to 80 to draw a box over.
 */
function mount() {
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
      p('below'),
    ]),
  )
  const editor = createEditor({ schema, doc, element: host })
  const surface = editor.view?.dom as HTMLElement
  const table = surface.querySelector('table') as HTMLTableElement
  stub(host, rect(0, 0, 200, 100))
  stub(table, rect(0, 0, 200, 40))
  const cells = [...table.querySelectorAll('td')]
  cells.forEach((element, index) => {
    stub(element, rect((index % 2) * 100, Math.floor(index / 2) * 20, 100, 20))
  })
  for (const tableRow of [...table.rows]) stub(tableRow, rect(0, tableRow.rowIndex * 20, 200, 20))
  const paragraph = [...surface.children].find((child) => child.tagName === 'P') as HTMLElement
  stub(paragraph, rect(0, 60, 200, 20))
  return { editor, host, surface, cells, paragraph }
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

function stroke(from: EventTarget, x1: number, y1: number, x2: number, y2: number): void {
  pointer('pointerdown', from, x1, y1)
  pointer('pointermove', document, x2, y2)
  pointer('pointerup', document, x2, y2)
}

/** The first table as rows of `text:colspan`. */
function grid(editor: ReturnType<typeof createEditor>): string[][] {
  return editor.state.doc
    .child(0)
    .content.children.map((line) =>
      line.content.children.map((node) => `${node.textContent}:${node.attrs.colspan}`),
    )
}

const erased = (editor: ReturnType<typeof createEditor>): unknown[][] =>
  editor.state.doc
    .child(0)
    .content.children.map((line) => line.content.children.map((node) => node.attrs.hiddenBorders))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('createTableTools', () => {
  it('holds one tool at a time, picking it again puts it down', () => {
    const { editor, host } = mount()
    const tools = createTableTools(editor)
    tools.toggle('draw')
    expect(tools.tool).toBe('draw')
    expect(host.dataset.tableTool).toBe('draw')
    tools.toggle('erase')
    expect(tools.tool).toBe('erase')
    tools.toggle('erase')
    expect(tools.tool).toBeNull()
    expect(host.dataset.tableTool).toBeUndefined()
    tools.destroy()
    editor.destroy()
  })

  it('erases the side of the cell the pointer is on', () => {
    const { editor, cells } = mount()
    const tools = createTableTools(editor)
    tools.toggle('erase')
    // Just inside the second cell's left edge, and the first cell's bottom.
    pointer('pointerdown', cells[1] as EventTarget, 103, 10)
    pointer('pointerdown', cells[0] as EventTarget, 50, 18)
    expect(erased(editor)).toEqual([
      ['bottom', 'left'],
      [null, null],
    ])
    tools.destroy()
    editor.destroy()
  })

  it('marks the side it would erase, and nothing away from the lines', () => {
    const { editor, cells } = mount()
    const tools = createTableTools(editor)
    tools.toggle('erase')
    const guide = document.querySelector('.trevixal-draw-guide') as HTMLElement
    pointer('pointermove', cells[0] as EventTarget, 97, 10)
    expect(guide.hidden).toBe(false)
    expect(guide.dataset.shape).toBe('erase')
    pointer('pointermove', cells[0] as EventTarget, 50, 10)
    expect(guide.hidden).toBe(true)
    pointer('pointerdown', cells[0] as EventTarget, 50, 10)
    expect(erased(editor)).toEqual([
      [null, null],
      [null, null],
    ])
    tools.destroy()
    editor.destroy()
  })

  it('draws a line down through the rows it crosses', () => {
    const { editor, cells } = mount()
    const tools = createTableTools(editor)
    tools.toggle('draw')
    stroke(cells[0] as EventTarget, 30, 5, 32, 35)
    expect(grid(editor)).toEqual([
      ['a:1', ':1', 'b:1'],
      ['c:1', ':1', 'd:1'],
    ])
    tools.destroy()
    editor.destroy()
  })

  it('draws a line across to split a row', () => {
    const { editor, cells } = mount()
    const tools = createTableTools(editor)
    tools.toggle('draw')
    stroke(cells[0] as EventTarget, 20, 10, 80, 11)
    expect(grid(editor)).toEqual([
      ['a:1', 'b:1'],
      [':1', ':1'],
      ['c:1', 'd:1'],
    ])
    tools.destroy()
    editor.destroy()
  })

  it('draws a table of one cell where a box is drawn outside every table', () => {
    const { editor, paragraph } = mount()
    const tools = createTableTools(editor)
    tools.toggle('draw')
    stroke(paragraph, 10, 62, 110, 102)
    const names = editor.state.doc.content.children.map((node) => node.type.name)
    expect(names).toEqual(['table', 'paragraph', 'table'])
    expect(editor.state.doc.child(2).child(0).attrs.height).toBe('40px')
    tools.destroy()
    editor.destroy()
  })

  it('takes a click for a click, drawing nothing', () => {
    const { editor, cells } = mount()
    const tools = createTableTools(editor)
    tools.toggle('draw')
    const before = editor.state.doc
    stroke(cells[0] as EventTarget, 30, 5, 31, 6)
    expect(editor.state.doc).toBe(before)
    tools.destroy()
    editor.destroy()
  })

  it('keeps the pointer from the resize handles while a tool is held', () => {
    const { editor, cells } = mount()
    const handles = createTableResizeHandles(editor)
    const tools = createTableTools(editor)
    tools.toggle('erase')
    // A drag on the line between the columns would otherwise resize them.
    pointer('pointerdown', cells[0] as EventTarget, 98, 10)
    pointer('pointermove', document, 140, 10)
    pointer('pointerup', document, 140, 10)
    const widths = editor.state.doc
      .child(0)
      .child(0)
      .content.children.map((c) => c.attrs.width)
    expect(widths).toEqual([null, null])
    expect(erased(editor)[0]).toEqual(['right', null])
    handles.destroy()
    tools.destroy()
    editor.destroy()
  })

  it('puts the tool down on Escape, and does nothing while read-only', () => {
    const { editor, cells, surface } = mount()
    const tools = createTableTools(editor)
    tools.toggle('erase')
    surface.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    expect(tools.tool).toBeNull()

    tools.toggle('erase')
    editor.setEditable(false)
    pointer('pointerdown', cells[1] as EventTarget, 103, 10)
    expect(erased(editor)[0]).toEqual([null, null])
    tools.destroy()
    editor.destroy()
  })

  it('leaves no guide or cursor behind when destroyed', () => {
    const { editor, host } = mount()
    const tools = createTableTools(editor)
    tools.toggle('draw')
    tools.destroy()
    expect(document.querySelectorAll('.trevixal-draw-guide')).toHaveLength(0)
    expect(host.dataset.tableTool).toBeUndefined()
    editor.destroy()
  })
})
