// @vitest-environment happy-dom
import {
  type Editor,
  type EditorNode,
  Fragment,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  insertText,
  pos,
} from '@trevixal/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { goToTargets } from '../src/go-to'
import { createMacros } from '../src/macros'
import { enableMultipleCarets } from '../src/multi-caret'
import {
  type Snippet,
  type SnippetStore,
  abbreviationAt,
  enableSnippetExpansion,
  insertSnippet,
  selectionContent,
  textContent,
} from '../src/snippets'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

beforeEach(() => {
  document.body.innerHTML = ''
})

const p = (text: string): EditorNode =>
  schema.node('paragraph', undefined, text ? [schema.text(text)] : [])

function mount(...blocks: EditorNode[]): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return createEditor({
    schema,
    element: host,
    doc: schema.node('doc', undefined, Fragment.from(blocks)),
  })
}

const caret = (editor: Editor, path: number[], offset: number, to = offset) =>
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos(path, offset), pos(path, to))))

function key(editor: Editor, name: string): boolean {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })
  editor.view?.dom.dispatchEvent(event)
  return event.defaultPrevented
}

describe('snippets', () => {
  const signature: Snippet = {
    abbreviation: ';sig',
    name: 'Signature',
    content: textContent('Best regards,\nAda'),
  }
  const store = (list: Snippet[]): SnippetStore => ({ list: () => list, save: () => {} })

  it('finds an abbreviation standing on its own before the caret', () => {
    const editor = mount(p('Thanks ;sig'))
    caret(editor, [0], 11)
    expect(abbreviationAt(editor.state, [signature])?.from).toBe(7)
    const glued = mount(p('word;sig'))
    caret(glued, [0], 8)
    expect(abbreviationAt(glued.state, [signature])).toBeNull()
    editor.destroy()
    glued.destroy()
  })

  it('expands on Tab without typing it, and on Enter, which still makes its line', () => {
    const editor = mount(p('Thanks ;sig'))
    caret(editor, [0], 11)
    const remove = enableSnippetExpansion(editor, store([signature]))
    expect(key(editor, 'Tab')).toBe(true)
    expect(editor.state.doc.content.children.map((block) => block.textContent)).toEqual([
      'Thanks Best regards,',
      'Ada',
    ])
    remove()
    editor.destroy()
  })

  it('keeps the selection, formatting and all, as a snippet, and puts it back', () => {
    const bold = schema.marks.bold?.create()
    const rich = schema.node('paragraph', undefined, [
      schema.text('Due ', []),
      schema.text('Friday', bold ? [bold] : []),
    ])
    const editor = mount(rich, p(''))
    caret(editor, [0], 0, 10)
    const content = selectionContent(editor.state)
    caret(editor, [1], 0)
    editor.exec(insertSnippet({ abbreviation: ';due', name: 'Due', content }))
    const pasted = editor.state.doc.child(1)
    expect(pasted.textContent).toBe('Due Friday')
    expect(pasted.child(1).marks.map((mark) => mark.type.name)).toEqual(['bold'])
    editor.destroy()
  })
})

describe('macros', () => {
  it('records typing and a command, and plays them back at the caret', () => {
    const editor = mount(p('one'), p('two'))
    const macros = createMacros(editor)
    caret(editor, [0], 3)
    macros.record()
    expect(macros.recording).toBe(true)
    const input = (data: string) =>
      editor.view?.dom.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertText',
          data,
          bubbles: true,
          cancelable: true,
        }),
      )
    input('!')
    editor.exec(insertText('!'))
    macros.note('upper', (target) => target.commands.convertCase('upper'))
    macros.stop()
    expect(macros.length).toBe(2)

    caret(editor, [1], 3)
    expect(macros.play()).toBe(true)
    expect(editor.state.doc.child(1).textContent).toBe('two!')
    macros.destroy()
    editor.destroy()
  })

  it('does not play while recording, nor an empty macro', () => {
    const editor = mount(p('x'))
    const macros = createMacros(editor)
    expect(macros.play()).toBe(false)
    macros.record()
    expect(macros.play()).toBe(false)
    macros.destroy()
    editor.destroy()
  })
})

describe('more carets', () => {
  it('types at every caret at once, in one step', () => {
    const editor = mount(p('alpha'), p('beta'))
    const carets = enableMultipleCarets(editor)
    caret(editor, [0], 5)
    carets.add(pos([1], 4))
    expect(carets.count).toBe(1)
    expect(editor.view?.dom.querySelectorAll('.trevixal-extra-caret')).toHaveLength(1)
    editor.exec(insertText('!'))
    expect(editor.state.doc.content.children.map((block) => block.textContent)).toEqual([
      'alpha!',
      'beta!',
    ])
    editor.undo()
    expect(editor.state.doc.content.children.map((block) => block.textContent)).toEqual([
      'alpha',
      'beta',
    ])
    carets.destroy()
    editor.destroy()
  })

  it('selects the word at the caret, then each next place it occurs, and replaces them all', () => {
    const editor = mount(p('cat and cat'), p('a cat'))
    const carets = enableMultipleCarets(editor)
    caret(editor, [0], 1)
    expect(carets.addNextMatch()).toBe(true)
    expect(editor.state.selection.from.offset).toBe(0)
    expect(editor.state.selection.to.offset).toBe(3)
    carets.addNextMatch()
    carets.addNextMatch()
    expect(carets.count).toBe(2)
    editor.exec(insertText('dog'))
    expect(editor.state.doc.content.children.map((block) => block.textContent)).toEqual([
      'dog and dog',
      'a dog',
    ])
    carets.clear()
    expect(carets.count).toBe(0)
    carets.destroy()
    editor.destroy()
  })
})

describe('go to', () => {
  it('lists the headings and bookmarks in reading order', () => {
    const doc = schema.node('doc', undefined, [
      schema.node('heading', { level: 1 }, [schema.text('Intro')]),
      p('text'),
      schema.node('heading', { level: 2 }, [schema.text('Details')]),
    ])
    expect(goToTargets(doc).map((target) => [target.kind, target.label, target.path])).toEqual([
      ['heading', 'Intro', [0]],
      ['heading', 'Details', [2]],
    ])
  })
})
