// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import type { Command } from '../src/commands/commands'
import {
  continueNumbering,
  restartNumbering,
  setListStyle,
  sinkListItem,
  splitListItem,
  toggleList,
  toggleTaskChecked,
  toggleTaskList,
} from '../src/commands/lists'
import { type Editor, createEditor } from '../src/editor/editor'
import { Fragment } from '../src/model/fragment'
import type { EditorNode } from '../src/model/node'
import { serializeToHTML } from '../src/serialize/html'
import { parseHTML } from '../src/serialize/parse-html'
import type { EditorState } from '../src/state/editor-state'
import type { EditorView } from '../src/view/editor-view'
import { cursor, doc, p, stateWith, testSchema } from './helpers'

function taskList(...items: EditorNode[]): EditorNode {
  return testSchema.node('taskList', undefined, Fragment.from(items))
}

function task(checked: boolean, ...blocks: EditorNode[]): EditorNode {
  return testSchema.node('taskItem', { checked }, Fragment.from(blocks))
}

function ul(attrs: { listStyle?: string } | undefined, ...items: EditorNode[]): EditorNode {
  return testSchema.node('bulletList', attrs, Fragment.from(items))
}

function ol(attrs: { start?: number; listStyle?: string } | undefined, ...items: EditorNode[]) {
  return testSchema.node('orderedList', attrs, Fragment.from(items))
}

function li(...blocks: EditorNode[]): EditorNode {
  return testSchema.node('listItem', undefined, Fragment.from(blocks))
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

describe('toggleTaskList', () => {
  it('turns a paragraph into a task list with one unchecked item', () => {
    const state = stateWith(doc(p('write tests')), cursor([0], 2))
    const next = run(state, toggleTaskList)
    expect(next.doc.eq(doc(taskList(task(false, p('write tests')))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 0, 0], offset: 2 })
  })

  it('unwraps a task list back into plain paragraphs', () => {
    const state = stateWith(
      doc(taskList(task(true, p('a')), task(false, p('b')))),
      cursor([0, 1, 0], 1),
    )
    const next = run(state, toggleTaskList)
    expect(next.doc.eq(doc(p('a'), p('b')))).toBe(true)
    expect(next.selection.from).toEqual({ path: [1], offset: 1 })
  })

  it('retypes a bullet list into a task list, converting its items', () => {
    const state = stateWith(doc(ul(undefined, li(p('a')), li(p('b')))), cursor([0, 0, 0], 1))
    const next = run(state, toggleTaskList)
    expect(next.doc.eq(doc(taskList(task(false, p('a')), task(false, p('b')))))).toBe(true)
  })

  it('retypes a task list back into a bullet list of list items', () => {
    const state = stateWith(doc(taskList(task(true, p('a')))), cursor([0, 0, 0], 1))
    const next = run(state, toggleList('bulletList'))
    expect(next.doc.eq(doc(ul(undefined, li(p('a')))))).toBe(true)
  })
})

describe('toggleTaskChecked', () => {
  it('checks an unchecked item and unchecks it again', () => {
    const state = stateWith(doc(taskList(task(false, p('a')))), cursor([0, 0, 0], 0))
    const checked = run(state, toggleTaskChecked)
    expect(checked.doc.eq(doc(taskList(task(true, p('a')))))).toBe(true)
    const back = run(checked, toggleTaskChecked)
    expect(back.doc.eq(doc(taskList(task(false, p('a')))))).toBe(true)
  })

  it('leaves the selection where it was', () => {
    const state = stateWith(doc(taskList(task(false, p('abc')))), cursor([0, 0, 0], 2))
    const next = run(state, toggleTaskChecked)
    expect(next.selection.from).toEqual({ path: [0, 0, 0], offset: 2 })
  })

  it('declines outside a task item', () => {
    const state = stateWith(doc(ul(undefined, li(p('a')))), cursor([0, 0, 0], 0))
    expect(toggleTaskChecked(state)).toBeNull()
  })
})

describe('nesting task items', () => {
  it('Tab nests an item under its previous sibling in a nested task list', () => {
    const state = stateWith(
      doc(taskList(task(false, p('a')), task(true, p('b')))),
      cursor([0, 1, 0], 1),
    )
    const next = run(state, sinkListItem)
    expect(next.doc.eq(doc(taskList(task(false, p('a'), taskList(task(true, p('b')))))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 0, 1, 0, 0], offset: 1 })
  })
})

describe('Enter inside a task item', () => {
  it('splits a checked item into a checked and an unchecked one', () => {
    const state = stateWith(doc(taskList(task(true, p('abcd')))), cursor([0, 0, 0], 2))
    const next = run(state, splitListItem)
    expect(next.doc.eq(doc(taskList(task(true, p('ab')), task(false, p('cd')))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0, 1, 0], offset: 0 })
  })
})

describe('setListStyle', () => {
  it('sets an allowed marker on a bullet list', () => {
    const state = stateWith(doc(ul(undefined, li(p('a')))), cursor([0, 0, 0], 0))
    const next = run(state, setListStyle('square'))
    expect(next.doc.eq(doc(ul({ listStyle: 'square' }, li(p('a')))))).toBe(true)
    expect(serializeToHTML(next.doc)).toContain('style="list-style-type: square"')
  })

  it('sets an allowed marker on an ordered list, keeping its start', () => {
    const state = stateWith(doc(ol({ start: 3 }, li(p('a')))), cursor([0, 0, 0], 0))
    const next = run(state, setListStyle('upper-roman'))
    expect(next.doc.eq(doc(ol({ start: 3, listStyle: 'upper-roman' }, li(p('a')))))).toBe(true)
    const html = serializeToHTML(next.doc)
    expect(html).toContain('list-style-type: upper-roman')
    expect(html).toContain('start="3"')
  })

  it('declines a value the list type does not allow', () => {
    const state = stateWith(doc(ul(undefined, li(p('a')))), cursor([0, 0, 0], 0))
    // `upper-roman` is legal on an ordered list, never on a bullet one.
    expect(setListStyle('upper-roman')(state)).toBeNull()
    expect(setListStyle('url(javascript:alert(1))')(state)).toBeNull()
    expect(setListStyle('disc; color: red')(state)).toBeNull()
  })

  it('declines outside a list', () => {
    const state = stateWith(doc(p('a')), cursor([0], 0))
    expect(setListStyle('disc')(state)).toBeNull()
  })

  it('never serializes a marker that is not on the allowlist', () => {
    // An attribute smuggled in past the command (imported JSON, a plugin)
    // still has to be filtered at render time.
    const rogue = testSchema.node(
      'bulletList',
      { listStyle: 'disc; background: url(evil)' },
      Fragment.of(li(p('a'))),
    )
    expect(serializeToHTML(doc(rogue))).toBe('<ul><li><p>a</p></li></ul>')
  })
})

describe('numbering', () => {
  it('restarts an ordered list at 1', () => {
    const state = stateWith(doc(ol({ start: 7 }, li(p('a')))), cursor([0, 0, 0], 0))
    const next = run(state, restartNumbering)
    expect(next.doc.eq(doc(ol({ start: 1 }, li(p('a')))))).toBe(true)
    expect(serializeToHTML(next.doc)).toBe('<ol><li><p>a</p></li></ol>')
  })

  it('continues numbering from an explicit start', () => {
    const state = stateWith(doc(ol(undefined, li(p('a')))), cursor([0, 0, 0], 0))
    const next = run(state, continueNumbering(12))
    expect(next.doc.eq(doc(ol({ start: 12 }, li(p('a')))))).toBe(true)
    expect(serializeToHTML(next.doc)).toContain('start="12"')
  })

  it('declines on a list that is not ordered', () => {
    const state = stateWith(doc(taskList(task(false, p('a')))), cursor([0, 0, 0], 0))
    expect(restartNumbering(state)).toBeNull()
    expect(continueNumbering(2)(state)).toBeNull()
  })
})

describe('HTML round trip', () => {
  it('serializes task items with their data attributes', () => {
    const html = serializeToHTML(doc(taskList(task(true, p('a')), task(false, p('b')))))
    expect(html).toBe(
      '<ul data-type="taskList">' +
        '<li data-type="taskItem" data-checked="true"><p>a</p></li>' +
        '<li data-type="taskItem" data-checked="false"><p>b</p></li>' +
        '</ul>',
    )
  })

  it('parses its own output back into the same document', () => {
    const original = doc(taskList(task(true, p('a')), task(false, p('b'))))
    expect(parseHTML(testSchema, serializeToHTML(original)).eq(original)).toBe(true)
  })

  it('parses a GitHub-style list of checkbox inputs', () => {
    const result = parseHTML(
      testSchema,
      '<ul data-type="taskList">' +
        '<li><input type="checkbox" checked>done</li>' +
        '<li><input type="checkbox">todo</li>' +
        '</ul>',
    )
    expect(result.eq(doc(taskList(task(true, p('done')), task(false, p('todo')))))).toBe(true)
  })

  it('promotes a bare ul of checkbox items to a task list', () => {
    // No `data-type`: the checkboxes alone identify it. The list has to be
    // promoted too, `bulletList` may only hold `listItem`, so leaving it a
    // bullet list would produce schema-invalid content.
    const result = parseHTML(testSchema, '<ul><li><input type="checkbox" checked>a</li></ul>')
    expect(result.eq(doc(taskList(task(true, p('a')))))).toBe(true)
    // The input itself never becomes content; only the label survives.
    expect(result.child(0).child(0).textContent).toBe('a')
  })

  it('reads a checkbox wrapped in the paragraph some renderers emit', () => {
    const result = parseHTML(testSchema, '<ul><li><p><input type="checkbox">a</p></li></ul>')
    expect(result.eq(doc(taskList(task(false, p('a')))))).toBe(true)
  })

  it('leaves an ordinary list holding a nested task list alone', () => {
    // The checkbox belongs to the inner list. Retyping the outer one on a
    // descendant match would move the plain item into a task list.
    const result = parseHTML(
      testSchema,
      '<ul><li>outer<ul><li><input type="checkbox">inner</li></ul></li></ul>',
    )
    const outer = result.child(0)
    expect(outer.type.name).toBe('bulletList')
    expect(outer.child(0).type.name).toBe('listItem')
    expect(outer.child(0).child(1).type.name).toBe('taskList')
  })

  it('keeps the space markdown exporters leave after the checkbox', () => {
    // `<input> done` is how GFM renders it. The parser collapses runs of
    // whitespace but never trims, here as anywhere else, so the leading
    // space is retained rather than special-cased for task items.
    const result = parseHTML(testSchema, '<ul><li><input type="checkbox"> done</li></ul>')
    expect(result.child(0).child(0).textContent).toBe(' done')
  })

  it('keeps a plain list of plain items as a bullet list', () => {
    const result = parseHTML(testSchema, '<ul><li>one</li></ul>')
    expect(result.child(0).type.name).toBe('bulletList')
    expect(result.child(0).child(0).type.name).toBe('listItem')
  })

  it('reads an allowed list-style-type off imported markup', () => {
    const result = parseHTML(testSchema, '<ul style="list-style-type: circle"><li>a</li></ul>')
    expect(result.child(0).attrs.listStyle).toBe('circle')
  })

  it('drops a list-style-type that is not on the allowlist', () => {
    const result = parseHTML(testSchema, '<ul style="list-style-type: hebrew"><li>a</li></ul>')
    expect(result.child(0).attrs.listStyle).toBeNull()
  })
})

describe('clicking a task checkbox', () => {
  let editor: Editor

  beforeEach(() => {
    window.document.body.innerHTML = ''
  })

  function mount(document: EditorNode): EditorView {
    const host = window.document.createElement('div')
    window.document.body.appendChild(host)
    editor = createEditor({ schema: testSchema, doc: document, element: host })
    return editor.view as EditorView
  }

  /** A press in the item's left gutter, where the checkbox marker renders. */
  function pressGutter(item: HTMLElement, offset: number): boolean {
    const event = new window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: item.getBoundingClientRect().left + offset,
    })
    item.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('toggles the item the press landed in, without moving the caret', () => {
    const view = mount(doc(taskList(task(false, p('a')), task(false, p('b')))))
    const before = editor.state.selection
    const second = view.dom.querySelectorAll('li')[1] as HTMLElement
    expect(pressGutter(second, -4)).toBe(true)
    expect(editor.state.doc.eq(doc(taskList(task(false, p('a')), task(true, p('b')))))).toBe(true)
    expect(editor.state.selection.eq(before)).toBe(true)
    expect(second.getAttribute('data-checked')).toBe('true')
    editor.destroy()
  })

  it('ignores a press on the item text', () => {
    const view = mount(doc(taskList(task(false, p('a')))))
    const item = view.dom.querySelector('li') as HTMLElement
    // Far to the right of the gutter: ordinary text placement, not a toggle.
    expect(pressGutter(item, 400)).toBe(false)
    expect(editor.state.doc.eq(doc(taskList(task(false, p('a')))))).toBe(true)
    editor.destroy()
  })

  it('ignores a press on an ordinary list item', () => {
    const view = mount(doc(ul(undefined, li(p('a')))))
    const item = view.dom.querySelector('li') as HTMLElement
    expect(pressGutter(item, -4)).toBe(false)
    editor.destroy()
  })
})
