import { describe, expect, it } from 'vitest'
import { createEditor } from '../src/editor/editor'
import { doc, p, testSchema } from './helpers'

function editorWith(document = doc(p('hello'))): ReturnType<typeof createEditor> {
  return createEditor({ schema: testSchema, doc: document })
}

describe('history', () => {
  it('groups rapid typing into one undo step', () => {
    const editor = editorWith(doc(p('')))
    editor.commands.insertText('h')
    editor.commands.insertText('e')
    editor.commands.insertText('y')
    expect(editor.getText()).toBe('hey')
    expect(editor.undo()).toBe(true)
    expect(editor.getText()).toBe('')
    expect(editor.canUndo).toBe(false)
  })

  it('separates groups beyond the group delay', () => {
    const editor = createEditor({
      schema: testSchema,
      doc: doc(p('')),
      history: { groupDelay: -1 }, // every transaction is its own group
    })
    editor.commands.insertText('a')
    editor.commands.insertText('b')
    expect(editor.getText()).toBe('ab')
    editor.undo()
    expect(editor.getText()).toBe('a')
    editor.undo()
    expect(editor.getText()).toBe('')
  })

  it('redo restores undone work and typing clears redo', () => {
    const editor = createEditor({
      schema: testSchema,
      doc: doc(p('')),
      history: { groupDelay: -1 },
    })
    editor.commands.insertText('x')
    editor.undo()
    expect(editor.canRedo).toBe(true)
    editor.redo()
    expect(editor.getText()).toBe('x')
    editor.commands.insertText('y')
    expect(editor.canRedo).toBe(false)
  })

  it('restores the selection from before the undone group', () => {
    const editor = createEditor({
      schema: testSchema,
      doc: doc(p('abc')),
      history: { groupDelay: -1 },
    })
    editor.commands.selectAll()
    editor.commands.deleteSelection()
    expect(editor.getText()).toBe('')
    editor.undo()
    expect(editor.getText()).toBe('abc')
  })

  it('undoes structural changes (split, wrap)', () => {
    const editor = createEditor({
      schema: testSchema,
      doc: doc(p('hello')),
      history: { groupDelay: -1 },
    })
    editor.commands.splitBlock()
    editor.commands.wrapIn('blockquote')
    expect(editor.state.doc.child(1).type.name).toBe('blockquote')
    editor.undo()
    editor.undo()
    expect(editor.state.doc.eq(doc(p('hello')))).toBe(true)
  })
})
