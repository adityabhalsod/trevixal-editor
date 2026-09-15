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
import { ACTIVE_CELL_CLASS, highlightActiveCell } from '../src/active-cell'
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

/** A document of one two-by-one table followed by a paragraph outside it. */
function mount(): { host: HTMLElement; editor: ReturnType<typeof createEditor> } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const doc = schema.node(
    'doc',
    undefined,
    Fragment.from([
      schema.node('table', undefined, Fragment.from([row(cell('a'), cell('b'))])),
      p('after'),
    ]),
  )
  return { host, editor: createEditor({ schema, doc, element: host }) }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('highlightActiveCell', () => {
  it('marks the cell holding the caret, and only that one', () => {
    const { host, editor } = mount()
    const dispose = highlightActiveCell(editor)
    const marked = (): (string | null)[] =>
      [...host.querySelectorAll(`.${ACTIVE_CELL_CLASS}`)].map((el) => el.textContent)

    // Paths run doc -> table -> row -> cell -> paragraph.
    setCaret(editor, [0, 0, 1, 0], 1)
    expect(marked()).toEqual(['b'])

    setCaret(editor, [0, 0, 0, 0], 0)
    expect(marked()).toEqual(['a'])

    dispose()
    editor.destroy()
  })

  it('survives an edit inside the marked cell', () => {
    const { host, editor } = mount()
    const dispose = highlightActiveCell(editor)
    setCaret(editor, [0, 0, 1, 0], 1)

    // Re-rendering the cell must not lose the class, or the highlight would
    // blink out on every keystroke.
    editor.commands.insertText('X')
    const marked = [...host.querySelectorAll(`.${ACTIVE_CELL_CLASS}`)]
    expect(marked.map((el) => el.textContent)).toEqual(['bX'])

    dispose()
    editor.destroy()
  })

  it('clears the mark when the caret leaves the table', () => {
    const { host, editor } = mount()
    const dispose = highlightActiveCell(editor)
    setCaret(editor, [0, 0, 0, 0], 0)
    expect(host.querySelectorAll(`.${ACTIVE_CELL_CLASS}`)).toHaveLength(1)

    setCaret(editor, [1], 0)
    expect(host.querySelectorAll(`.${ACTIVE_CELL_CLASS}`)).toHaveLength(0)

    dispose()
    editor.destroy()
  })

  it('takes the mark off the document when disposed', () => {
    const { host, editor } = mount()
    const dispose = highlightActiveCell(editor)
    setCaret(editor, [0, 0, 0, 0], 0)
    expect(host.querySelectorAll(`.${ACTIVE_CELL_CLASS}`)).toHaveLength(1)

    dispose()
    expect(host.querySelectorAll(`.${ACTIVE_CELL_CLASS}`)).toHaveLength(0)

    // And the disposer really unsubscribed: a later move marks nothing.
    setCaret(editor, [0, 0, 1, 0], 0)
    expect(host.querySelectorAll(`.${ACTIVE_CELL_CLASS}`)).toHaveLength(0)

    editor.destroy()
  })
})

function setCaret(editor: ReturnType<typeof createEditor>, path: number[], offset: number): void {
  editor.exec((state) => state.tr.setSelection(new TextSelection(pos(path, offset))))
}
