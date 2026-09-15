import { describe, expect, it } from 'vitest'
import { splitBlockInPreformatted } from '../src/commands/commands'
import { createEditor } from '../src/editor/editor'
import { pos } from '../src/model/position'
import { TextSelection } from '../src/state/selection'
import { testSchema } from './helpers'

/** An editor holding one code block containing `text`, caret at the end. */
function codeEditor(text: string) {
  const editor = createEditor({
    schema: testSchema,
    content: {
      type: 'doc',
      content: [{ type: 'codeBlock', content: text ? [{ type: 'text', text }] : [] }],
    } as never,
  })
  const end = editor.state.doc.child(0).textContent.length
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], end))))
  return editor
}

describe('Enter inside a code block', () => {
  it('inserts a newline instead of splitting the block', () => {
    const editor = codeEditor('const a = 1')
    expect(editor.exec(splitBlockInPreformatted)).toBe(true)
    editor.commands.insertText('const b = 2')

    // Still one block, now holding two lines.
    expect(editor.state.doc.childCount).toBe(1)
    expect(editor.state.doc.child(0).type.name).toBe('codeBlock')
    expect(editor.getText()).toBe('const a = 1\nconst b = 2')
    editor.destroy()
  })

  it('leaves the block when Enter is pressed on a blank last line', () => {
    const editor = codeEditor('done')
    editor.exec(splitBlockInPreformatted) // first Enter: a newline
    expect(editor.state.doc.childCount).toBe(1)

    editor.exec(splitBlockInPreformatted) // second Enter: escape
    expect(editor.state.doc.childCount).toBe(2)
    expect(editor.state.doc.child(0).type.name).toBe('codeBlock')
    expect(editor.state.doc.child(1).type.name).toBe('paragraph')
    // The newline that was only an escape gesture is not left behind.
    expect(editor.state.doc.child(0).textContent).toBe('done')

    // The caret lands in the new paragraph.
    editor.commands.insertText('after')
    expect(editor.state.doc.child(1).textContent).toBe('after')
    editor.destroy()
  })

  it('does not apply to ordinary blocks', () => {
    const editor = createEditor({ schema: testSchema })
    editor.commands.insertText('paragraph text')
    // The command declines, so the regular split runs instead.
    expect(editor.exec(splitBlockInPreformatted)).toBe(false)
    editor.destroy()
  })

  it('replaces the selection before inserting the newline', () => {
    const editor = codeEditor('keep DROP')
    // Select just " DROP", the way a user would drag over it.
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 4), pos([0], 9))))
    expect(editor.exec(splitBlockInPreformatted)).toBe(true)

    // The selected text is gone and a newline took its place.
    expect(editor.state.doc.childCount).toBe(1)
    expect(editor.getText()).toBe('keep\n')
    editor.destroy()
  })

  it('declines a document-wide selection, leaving it to the regular split', () => {
    const editor = codeEditor('code')
    editor.commands.selectAll() // an AllSelection, not a TextSelection
    expect(editor.exec(splitBlockInPreformatted)).toBe(false)
    editor.destroy()
  })

  it('keeps the caret after the inserted newline', () => {
    const editor = codeEditor('a')
    editor.exec(splitBlockInPreformatted)
    editor.commands.insertText('b')
    expect(editor.getText()).toBe('a\nb')
    editor.destroy()
  })

  it('adds a line rather than escaping when the source already ends in a newline', () => {
    // Most files end in a newline, and the caret lands after it. The old
    // check saw that trailing newline and escaped on the first Enter, which
    // reads as being thrown out of the block.
    const editor = codeEditor('pass\n')
    editor.exec(splitBlockInPreformatted)
    expect(editor.state.doc.childCount).toBe(1)
    expect(editor.state.doc.child(0).type.name).toBe('codeBlock')

    // The second Enter, on the now-blank line, is what leaves.
    editor.exec(splitBlockInPreformatted)
    expect(editor.state.doc.childCount).toBe(2)
    expect(editor.state.doc.child(1).type.name).toBe('paragraph')
    // And the code is left as it was, trailing newline included.
    expect(editor.state.doc.child(0).textContent).toBe('pass\n')
    editor.destroy()
  })

  it('keeps adding lines in the middle of a block', () => {
    const editor = codeEditor('one\ntwo')
    // Caret at the end of "two", which is not a blank line.
    editor.exec(splitBlockInPreformatted)
    editor.commands.insertText('three')
    expect(editor.state.doc.childCount).toBe(1)
    expect(editor.state.doc.child(0).textContent).toBe('one\ntwo\nthree')
    editor.destroy()
  })
})
