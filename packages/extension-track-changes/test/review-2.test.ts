// @vitest-environment happy-dom
import {
  HISTORY_LABEL,
  NEW_HISTORY_GROUP,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  deleteCharBackward,
  deleteCharForward,
  deleteSelection,
  insertContent,
  insertText,
  parseHTML,
  pos,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { TRACK_CHANGES_META, TrackChanges, trackChangesMarks } from '../src'

const schema = new Schema({
  nodes: defaultNodes(),
  marks: { ...defaultMarks(), ...trackChangesMarks() },
})

function setup(author = 'ada', now = 42, groupDelay = 0) {
  const editor = createEditor({ schema, history: { groupDelay } })
  const track = new TrackChanges(editor, { author, now: () => now })
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

const select = (editor: ReturnType<typeof createEditor>, from: number, to: number) =>
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], from), pos([0], to))))

const caretOffset = (editor: ReturnType<typeof createEditor>) => {
  const selection = editor.state.selection
  return selection instanceof TextSelection ? selection.head.offset : -1
}

describe('attribution', () => {
  it('carries author and timestamp on both kinds of mark', () => {
    const { editor, track } = withText('hello', 5, 'ada')
    editor.exec(deleteCharBackward)
    editor.commands.insertText('!')
    const all = track.suggestions()
    expect(all).toHaveLength(2)
    for (const suggestion of all) {
      expect(suggestion.author).toBe('ada')
      expect(suggestion.timestamp).toBe(42)
      expect(suggestion.mark.attrs.author).toBe('ada')
      expect(suggestion.mark.attrs.timestamp).toBe(42)
    }
    editor.destroy()
  })

  it('attributes text typed inside another author is insertion to the new author', () => {
    const editor = createEditor({ schema, history: { groupDelay: 0 } })
    const bob = new TrackChanges(editor, { author: 'bob', now: () => 1 })
    bob.enable()
    editor.commands.insertText('bob')
    bob.disable()
    const ada = new TrackChanges(editor, { author: 'ada', now: () => 2 })
    ada.enable()
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 1))))
    editor.commands.insertText('A')
    expect(editor.getText()).toBe('bAob')
    const spans = ada.suggestions().map((s) => [s.from, s.to, s.author].join(':'))
    expect(spans).toEqual(['0:1:bob', '1:2:ada', '2:4:bob'])
    editor.destroy()
  })
})

describe('deleting inside your own insertion', () => {
  it('physically removes a selection wholly inside your own insertion', () => {
    const { editor, track } = setup()
    track.enable()
    editor.commands.insertText('abcdef')
    select(editor, 2, 4)
    editor.exec(deleteSelection)
    expect(editor.getText()).toBe('abef')
    expect(track.suggestions().map((s) => s.kind)).toEqual(['insertion'])
    editor.destroy()
  })

  it('removes your own insertion and strikes only the original text in a mixed range', () => {
    const { editor, track } = withText('hello', 5)
    editor.commands.insertText('XY') // ada's own insertion at 5..7
    select(editor, 3, 7) // "lo" (original) + "XY" (own insertion)
    editor.exec(deleteSelection)
    // The original text survives struck; the pending insertion is gone.
    expect(editor.getText()).toBe('hello')
    expect(track.suggestions().map((s) => `${s.kind}:${s.from}:${s.to}`)).toEqual(['deletion:3:5'])
    // Rejecting must not leave the abandoned suggestion behind as real text.
    track.rejectAll()
    expect(editor.getText()).toBe('hello')
    expect(editor.getHTML()).toBe('<p>hello</p>')
    editor.destroy()
  })

  it('typing over your own whole insertion keeps the replacement a suggestion', () => {
    // The replacement must not slip into the document unmarked: the range is
    // wholly this author's own pending insertion, so the old code handed the
    // edit back untouched and committed the typed text outright.
    const { editor, track } = withText('abcd', 2)
    editor.commands.insertText('XY')
    select(editor, 2, 4)
    editor.commands.insertText('Z')
    expect(editor.getText()).toBe('abZcd')
    expect(track.suggestions().map((s) => `${s.kind}:${s.from}:${s.to}`)).toEqual(['insertion:2:3'])
    track.rejectAll()
    expect(editor.getHTML()).toBe('<p>abcd</p>')
    editor.destroy()
  })

  it('leaves the caret on the survivors when the deleted selection runs backwards', () => {
    // Anchor at the end, head at the start: the delete is not "backward", so
    // the caret lands at the far end of the range, which has moved, because
    // the pending insertion inside it vanishes rather than being struck.
    const { editor, track } = withText('hello world', 5)
    editor.commands.insertText('XY') // ada's own insertion at 5..7
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 7), pos([0], 3))))
    editor.exec(deleteSelection)
    expect(editor.getText()).toBe('hello world')
    expect(track.suggestions().map((s) => `${s.kind}:${s.from}:${s.to}`)).toEqual(['deletion:3:5'])
    // "lo" survives struck at 3..5, so the caret belongs at 5, not at the
    // stale offset 7 the vanished insertion used to end at.
    expect(caretOffset(editor)).toBe(5)
    editor.destroy()
  })

  it('strikes both sides of an insertion the deleted range brackets', () => {
    const { editor, track } = withText('abcd', 2)
    editor.commands.insertText('XY') // ada's own insertion at 2..4
    select(editor, 1, 5) // "b" + "XY" + "c"
    editor.exec(deleteSelection)
    // The two original halves close up into one struck span.
    expect(editor.getText()).toBe('abcd')
    expect(track.suggestions().map((s) => `${s.kind}:${s.from}:${s.to}`)).toEqual(['deletion:1:3'])
    track.rejectAll()
    expect(editor.getHTML()).toBe('<p>abcd</p>')
    editor.destroy()
  })
})

describe('deleting already-struck text', () => {
  it('does not extend the strike past a selection that is already struck', () => {
    const { editor, track } = withText('hello', 5)
    select(editor, 2, 5)
    editor.exec(deleteSelection) // strike "llo"
    expect(track.suggestions().map((s) => `${s.from}:${s.to}`)).toEqual(['2:5'])
    select(editor, 2, 5)
    editor.exec(deleteSelection) // delete the same, already struck, range again
    expect(editor.getText()).toBe('hello')
    expect(track.suggestions().map((s) => `${s.kind}:${s.from}:${s.to}`)).toEqual(['deletion:2:5'])
    editor.destroy()
  })

  it('leaves another author’s strike and its attribution untouched', () => {
    // Re-striking text someone else already struck would rewrite their
    // attribution, so the second delete has to be a no-op over that range.
    const editor = createEditor({ schema, history: { groupDelay: 0 } })
    editor.commands.insertText('hello')
    const bob = new TrackChanges(editor, { author: 'bob', now: () => 1 })
    bob.enable()
    select(editor, 2, 5)
    editor.exec(deleteSelection) // bob strikes "llo"
    bob.disable()

    const ada = new TrackChanges(editor, { author: 'ada', now: () => 2 })
    ada.enable()
    select(editor, 2, 5)
    editor.exec(deleteSelection) // ada deletes the same, already struck, range
    expect(editor.getText()).toBe('hello')
    expect(
      ada.suggestions().map((s) => `${s.kind}:${s.from}:${s.to}:${s.author}:${s.timestamp}`),
    ).toEqual(['deletion:2:5:bob:1'])
    editor.destroy()
  })

  it('backspace steps the caret over struck text one character at a time', () => {
    const { editor, track } = withText('hello', 5)
    editor.exec(deleteCharBackward) // strikes "o"
    editor.exec(deleteCharBackward) // strikes "l" too
    expect(caretOffset(editor)).toBe(3)
    expect(track.suggestions().map((s) => `${s.from}:${s.to}`)).toEqual(['3:5'])
    editor.destroy()
  })

  it('forward delete over struck text extends it forward only by the typed width', () => {
    const { editor, track } = withText('abcdef', 0)
    editor.exec(deleteCharForward)
    editor.exec(deleteCharForward)
    expect(track.suggestions().map((s) => `${s.from}:${s.to}`)).toEqual(['0:2'])
    expect(caretOffset(editor)).toBe(2)
    editor.destroy()
  })

  it('typing over an already struck selection keeps the struck original', () => {
    const { editor, track } = withText('hello', 5)
    select(editor, 2, 5)
    editor.exec(deleteSelection) // strike "llo"
    select(editor, 2, 5)
    editor.commands.insertText('p!')
    expect(editor.getText()).toBe('hellop!')
    expect(track.suggestions().map((s) => `${s.kind}:${s.from}:${s.to}`)).toEqual([
      'deletion:2:5',
      'insertion:5:7',
    ])
    // Rejecting restores the original document exactly.
    track.rejectAll()
    expect(editor.getHTML()).toBe('<p>hello</p>')
    editor.destroy()
  })
})

describe('grouping and history', () => {
  it('turns a replacement into a single undoable transaction', () => {
    const { editor, track } = withText('good day', 0)
    const before = editor.historyEntries().undo.length
    select(editor, 0, 4)
    editor.commands.insertText('great')
    expect(editor.historyEntries().undo.length).toBe(before + 1)
    expect(track.suggestions()).toHaveLength(2)
    editor.undo()
    expect(editor.getHTML()).toBe('<p>good day</p>')
    expect(track.suggestions()).toHaveLength(0)
    editor.redo()
    expect(editor.getText()).toBe('goodgreat day')
    expect(
      track
        .suggestions()
        .map((s) => s.kind)
        .sort(),
    ).toEqual(['deletion', 'insertion'])
    editor.destroy()
  })

  it('keeps history metadata set by the source transaction (input rules)', () => {
    // Input rules tag their transaction with NEW_HISTORY_GROUP so undo reverts
    // the rule alone rather than the typing burst it ended.
    const { editor, track } = setup('ada', 42, 5000)
    editor.commands.insertText('start')
    track.enable()
    const groups = editor.historyEntries().undo.length
    const tr = insertText('X')(editor.state)
    if (!tr) throw new Error('insertText should apply')
    editor.dispatch(tr.setMeta(NEW_HISTORY_GROUP, true).setMeta(HISTORY_LABEL, 'Input rule'))
    const entries = editor.historyEntries().undo
    expect(entries.length).toBe(groups + 1)
    expect(entries[entries.length - 1]?.label).toBe('Input rule')
    editor.destroy()
  })

  it('merges replacement text into an insertion that follows the range', () => {
    // The second half of the mark reuse: nothing precedes the edited range, so
    // the span to join is the one on the far side of it. A distinct timestamp
    // per transaction is what makes "reused" and "fresh" tell apart, with a
    // frozen clock the two marks would be equal and merge either way.
    let tick = 0
    const editor = createEditor({ schema })
    const track = new TrackChanges(editor, { author: 'ada', now: () => 100 + tick++ })
    editor.commands.insertText('ab')
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 2))))
    track.enable()
    editor.commands.insertText('XY')
    select(editor, 0, 2)
    editor.commands.insertText('Z')
    expect(editor.getText()).toBe('abZXY')
    expect(
      track
        .suggestions()
        .filter((suggestion) => suggestion.kind === 'insertion')
        .map((suggestion) => `${suggestion.from}:${suggestion.to}`),
    ).toEqual(['2:5'])
    editor.destroy()
  })

  it('keeps metadata this package has never heard of', () => {
    // Meta is how one extension tells the rest of the editor where a
    // transaction came from, and a whitelist can only carry the keys it was
    // written against. `workspace$mirror` is the split view's replay guard:
    // dropping it sends a mirrored edit straight back into the pane that sent
    // it, where the steps no longer apply and the pane is resynced wholesale.
    const { editor, track } = withText('ab', 2)
    const seen: (unknown | undefined)[] = []
    editor.onTransaction(({ transaction }) => {
      if (transaction.docChanged) seen.push(transaction.getMeta('workspace$mirror'))
    })
    const tr = insertText('X')(editor.state)
    if (!tr) throw new Error('insertText should apply')
    editor.dispatch(tr.setMeta('workspace$mirror', true))
    expect(seen).toEqual([true])
    // The suggestion was still made: carrying meta is not passing the
    // transaction through untouched.
    expect(track.suggestions().map((s) => s.kind)).toEqual(['insertion'])
    editor.destroy()
  })

  it("does not carry this package's own marker onto the replacement", () => {
    // TRACK_CHANGES_META means "already tracked, leave alone". The rewritten
    // transaction is the one being tracked now, so it must not claim it.
    const { editor, track } = withText('ab', 2)
    const flags: unknown[] = []
    editor.onTransaction(({ transaction }) => {
      if (transaction.docChanged) flags.push(transaction.getMeta(TRACK_CHANGES_META))
    })
    editor.commands.insertText('X')
    expect(flags).toEqual([undefined])
    expect(track.suggestions()).toHaveLength(1)
    editor.destroy()
  })
})

describe('paste while suggesting', () => {
  it('marks pasted inline content as an insertion', () => {
    const { editor, track } = withText('ab', 2)
    editor.exec(insertContent([schema.text('pasted')]))
    expect(editor.getText()).toBe('abpasted')
    expect(track.suggestions().map((s) => `${s.kind}:${s.from}:${s.to}`)).toEqual(['insertion:2:8'])
    editor.destroy()
  })

  it('marks a paste over a selection as strike plus insertion', () => {
    const { editor, track } = withText('keep this', 9)
    select(editor, 5, 9)
    editor.exec(insertContent([schema.text('that')]))
    expect(editor.getText()).toBe('keep thisthat')
    expect(
      track
        .suggestions()
        .map((s) => s.kind)
        .sort(),
    ).toEqual(['deletion', 'insertion'])
    track.rejectAll()
    expect(editor.getText()).toBe('keep this')
    editor.destroy()
  })
})

describe('suggestions() ordering', () => {
  it('returns suggestions in document order', () => {
    const { editor, track } = withText('abcdef', 6)
    editor.commands.insertText('X') // insertion at 6..7
    select(editor, 0, 1)
    editor.exec(deleteSelection) // deletion at 0..1
    expect(track.suggestions().map((s) => `${s.kind}:${s.from}`)).toEqual([
      'deletion:0',
      'insertion:6',
    ])
    editor.destroy()
  })

  it('orders suggestions across blocks by path then offset', () => {
    const editor = createEditor({
      schema,
      history: { groupDelay: 0 },
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
        ],
      },
    })
    const track = new TrackChanges(editor, { author: 'ada', now: () => 42 })
    track.enable()
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([1], 3))))
    editor.commands.insertText('Z')
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 0), pos([0], 1))))
    editor.exec(deleteSelection)
    expect(track.suggestions().map((s) => `${s.path.join('.')}:${s.kind}`)).toEqual([
      '0:deletion',
      '1:insertion',
    ])
    editor.destroy()
  })
})

describe('accept and reject', () => {
  it('accepts adjacent deletion and insertion spans together', () => {
    const { editor, track } = withText('good day', 0)
    select(editor, 0, 4)
    editor.commands.insertText('great')
    expect(track.acceptAll()).toBe(true)
    expect(editor.getHTML()).toBe('<p>great day</p>')
    editor.destroy()
  })

  it('accepting one span of an adjacent pair leaves the other pending', () => {
    const { editor, track } = withText('good day', 0)
    select(editor, 0, 4)
    editor.commands.insertText('great')
    const deletion = track.suggestions().find((s) => s.kind === 'deletion')
    if (!deletion) throw new Error('deletion expected')
    track.accept([deletion])
    expect(editor.getText()).toBe('great day')
    expect(track.suggestions().map((s) => `${s.kind}:${s.from}:${s.to}`)).toEqual(['insertion:0:5'])
    editor.destroy()
  })

  it('accepts suggestions in several blocks at once', () => {
    const editor = createEditor({
      schema,
      history: { groupDelay: 0 },
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
        ],
      },
    })
    const track = new TrackChanges(editor, { author: 'ada', now: () => 42 })
    track.enable()
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 0), pos([0], 3))))
    editor.exec(deleteSelection)
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([1], 3))))
    editor.commands.insertText('!')
    expect(track.acceptAll()).toBe(true)
    expect(editor.getHTML()).toBe('<p></p><p>two!</p>')
    editor.destroy()
  })
})

describe('HTML round trip', () => {
  it('restores author and timestamp from serialized suggestion marks', () => {
    const { editor, track } = withText('hello', 5)
    editor.exec(deleteCharBackward)
    editor.commands.insertText('p')
    const html = editor.getHTML()
    const reloaded = createEditor({ schema, history: { groupDelay: 0 } })
    reloaded.setContent(parseHTML(schema, html, document))
    const restored = new TrackChanges(reloaded, { author: 'ada', now: () => 42 })
    expect(restored.suggestions().map((s) => `${s.kind}:${s.author}:${s.timestamp}`)).toEqual(
      track.suggestions().map((s) => `${s.kind}:${s.author}:${s.timestamp}`),
    )
    expect(reloaded.getHTML()).toBe(html)
    editor.destroy()
    reloaded.destroy()
  })
})
