import {
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  deleteCharBackward,
  deleteCharForward,
  deleteSelection,
  pos,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { TrackChanges, trackChangesMarks } from '../src'

const schema = new Schema({
  nodes: defaultNodes(),
  marks: { ...defaultMarks(), ...trackChangesMarks() },
})

function setup(author = 'ada') {
  const editor = createEditor({ schema, history: { groupDelay: 0 } })
  const track = new TrackChanges(editor, { author, now: () => 42 })
  return { editor, track }
}

/** Editor preloaded with plain (untracked) text and the caret at `offset`. */
function withText(text: string, offset: number, author = 'ada') {
  const { editor, track } = setup(author)
  editor.commands.insertText(text)
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], offset))))
  track.enable()
  return { editor, track }
}

const caretOffset = (editor: ReturnType<typeof createEditor>) => {
  const selection = editor.state.selection
  return selection instanceof TextSelection ? selection.head.offset : -1
}

describe('suggestion mode', () => {
  it('marks typed text as an attributed insertion', () => {
    const { editor, track } = setup()
    track.enable()
    editor.commands.insertText('hi')
    expect(editor.getHTML()).toBe(
      '<p><ins class="trevixal-insertion" data-trevixal-author="ada" ' +
        'data-trevixal-timestamp="42">hi</ins></p>',
    )
    editor.destroy()
  })

  it('backspace strikes text through instead of deleting, and continues leftward', () => {
    const { editor } = withText('hello', 5)
    editor.exec(deleteCharBackward)
    expect(editor.getText()).toBe('hello')
    expect(editor.getHTML()).toContain(
      '<del class="trevixal-deletion" data-trevixal-author="ada" ' +
        'data-trevixal-timestamp="42">o</del>',
    )
    expect(caretOffset(editor)).toBe(4)
    editor.exec(deleteCharBackward)
    expect(editor.getHTML()).toContain('>lo</del>')
    expect(caretOffset(editor)).toBe(3)
    editor.destroy()
  })

  it('forward delete strikes through and steps the caret past struck text', () => {
    const { editor } = withText('abc', 0)
    editor.exec(deleteCharForward)
    expect(editor.getText()).toBe('abc')
    expect(caretOffset(editor)).toBe(1)
    editor.exec(deleteCharForward)
    expect(editor.getHTML()).toContain('>ab</del>')
    expect(caretOffset(editor)).toBe(2)
    editor.destroy()
  })

  it('replacing a selection strikes the original and inserts after it', () => {
    const { editor } = withText('good day', 0)
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 0), pos([0], 4))))
    editor.commands.insertText('great')
    expect(editor.getText()).toBe('goodgreat day')
    expect(editor.getHTML()).toBe(
      '<p><del class="trevixal-deletion" data-trevixal-author="ada" ' +
        'data-trevixal-timestamp="42">good</del>' +
        '<ins class="trevixal-insertion" data-trevixal-author="ada" ' +
        'data-trevixal-timestamp="42">great</ins> day</p>',
    )
    editor.destroy()
  })

  it('deleting your own pending insertion is a real deletion', () => {
    const { editor, track } = setup()
    track.enable()
    editor.commands.insertText('oops')
    editor.exec(deleteCharBackward)
    expect(editor.getText()).toBe('oop')
    expect(track.suggestions().filter((s) => s.kind === 'deletion')).toHaveLength(0)
    editor.destroy()
  })

  it('structural edits and disabled mode pass through unchanged', () => {
    const { editor, track } = withText('ab', 2)
    track.disable()
    editor.exec(deleteCharBackward)
    expect(editor.getText()).toBe('a')
    editor.destroy()
  })
})

describe('accept / reject', () => {
  function suggested() {
    const { editor, track } = withText('keep gone', 9)
    // Strike " gone" (offsets 4..9) and add an insertion.
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 4), pos([0], 9))))
    editor.exec(deleteSelection)
    editor.commands.insertText(' new')
    return { editor, track }
  }

  it('lists pending suggestions with attribution', () => {
    const { editor, track } = suggested()
    const all = track.suggestions()
    expect(all.map((s) => s.kind).sort()).toEqual(['deletion', 'insertion'])
    expect(all.every((s) => s.author === 'ada' && s.timestamp === 42)).toBe(true)
    editor.destroy()
  })

  it('acceptAll applies insertions and drops struck text', () => {
    const { editor, track } = suggested()
    expect(track.acceptAll()).toBe(true)
    expect(editor.getText()).toBe('keep new')
    expect(editor.getHTML()).toBe('<p>keep new</p>')
    expect(track.hasSuggestions).toBe(false)
    editor.destroy()
  })

  it('rejectAll restores the original text', () => {
    const { editor, track } = suggested()
    expect(track.rejectAll()).toBe(true)
    expect(editor.getText()).toBe('keep gone')
    expect(editor.getHTML()).toBe('<p>keep gone</p>')
    editor.destroy()
  })

  it('accepts and rejects a single span at a position', () => {
    const { editor, track } = suggested()
    // Reject just the insertion (" new" sits right after the struck range).
    const insertion = track.suggestions().find((s) => s.kind === 'insertion')
    expect(insertion).toBeDefined()
    if (!insertion) return
    track.rejectAt(pos(insertion.path, insertion.from + 1))
    expect(editor.getText()).toBe('keep gone')
    // The deletion suggestion is still pending; accept it now.
    const deletion = track.suggestions().find((s) => s.kind === 'deletion')
    if (!deletion) throw new Error('deletion expected')
    track.acceptAt(pos(deletion.path, deletion.from))
    expect(editor.getText()).toBe('keep')
    editor.destroy()
  })

  it('undo reverts a whole suggestion step cleanly', () => {
    const { editor, track } = withText('hello', 5)
    editor.exec(deleteCharBackward)
    expect(editor.getHTML()).toContain('trevixal-deletion')
    editor.undo()
    expect(editor.getHTML()).toBe('<p>hello</p>')
    expect(track.suggestions()).toHaveLength(0)
    editor.destroy()
  })
})
