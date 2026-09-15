// @vitest-environment happy-dom
import {
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  deleteCharBackward,
  pos,
} from '@trevixal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TrackChanges,
  createTrackChangesBar,
  nextSuggestion,
  suggestionAt,
  trackChangesMarks,
} from '../src'

const schema = new Schema({
  nodes: defaultNodes(),
  marks: { ...defaultMarks(), ...trackChangesMarks() },
})

let container: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
})

function mount(text = 'abcdef') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({
    schema,
    element: host,
    history: { groupDelay: 0 },
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  })
  const track = new TrackChanges(editor, { author: 'ada', now: () => 42 })
  return { editor, track }
}

const caret = (editor: ReturnType<typeof mount>['editor'], offset: number) =>
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], offset))))

/** "abcdef" with "a" struck (0..1) and "X" suggested at the end (6..7). */
function suggested() {
  const { editor, track } = mount()
  track.enable()
  caret(editor, 1)
  editor.exec(deleteCharBackward)
  caret(editor, 6)
  editor.commands.insertText('X')
  return { editor, track }
}

const button = (name: string): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>(`.trevixal-trackchanges__${name}`)
  if (!found) throw new Error(`missing ${name}`)
  return found
}
const countText = () => container.querySelector('.trevixal-trackchanges__count')?.textContent

describe('suggestionAt / nextSuggestion', () => {
  it('finds the suggestion touching the caret, edges inclusive', () => {
    const { editor, track } = suggested()
    caret(editor, 0)
    expect(suggestionAt(track, editor.state)?.kind).toBe('deletion')
    caret(editor, 1)
    expect(suggestionAt(track, editor.state)?.kind).toBe('deletion')
    caret(editor, 3)
    expect(suggestionAt(track, editor.state)).toBeNull()
    caret(editor, 7)
    expect(suggestionAt(track, editor.state)?.kind).toBe('insertion')
    editor.destroy()
  })

  it('steps forward and backward in document order, skipping the current one', () => {
    const { editor, track } = suggested()
    caret(editor, 3)
    expect(nextSuggestion(track, editor.state, 1)?.kind).toBe('insertion')
    expect(nextSuggestion(track, editor.state, -1)?.kind).toBe('deletion')
    caret(editor, 0)
    expect(nextSuggestion(track, editor.state, -1)).toBeNull()
    expect(nextSuggestion(track, editor.state, 1)?.kind).toBe('insertion')
    caret(editor, 7)
    expect(nextSuggestion(track, editor.state, 1)).toBeNull()
    expect(nextSuggestion(track, editor.state, -1)?.kind).toBe('deletion')
    editor.destroy()
  })
})

describe('track changes bar', () => {
  it('renders a labelled toolbar with the author', () => {
    const { editor, track } = mount()
    const bar = createTrackChangesBar(editor, track, { container, author: 'ada' })
    expect(bar.element.getAttribute('role')).toBe('toolbar')
    expect(bar.element.getAttribute('aria-label')).toBe('Track changes')
    expect(button('toggle').getAttribute('aria-pressed')).toBe('false')
    expect(button('toggle').title).toBe('Suggesting as ada')
    expect(container.querySelector('.trevixal-trackchanges__author')?.textContent).toBe('as ada')
    expect(countText()).toBe('No suggestions')
    bar.destroy()
    editor.destroy()
  })

  it('toggles suggesting mode and reflects it in aria-pressed', () => {
    const { editor, track } = mount()
    const onChange = vi.fn()
    const bar = createTrackChangesBar(editor, track, { container, onChange })
    button('toggle').click()
    expect(track.isEnabled).toBe(true)
    expect(button('toggle').getAttribute('aria-pressed')).toBe('true')
    expect(button('toggle').classList.contains('trevixal-trackchanges__toggle--on')).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith({ enabled: true, count: 0 })
    button('toggle').click()
    expect(track.isEnabled).toBe(false)
    expect(button('toggle').getAttribute('aria-pressed')).toBe('false')
    bar.destroy()
    editor.destroy()
  })

  it('keeps the live count in step with the document', () => {
    const { editor, track } = mount()
    const bar = createTrackChangesBar(editor, track, { container })
    track.enable()
    caret(editor, 6)
    editor.commands.insertText('X')
    expect(countText()).toBe('1 suggestion')
    caret(editor, 1)
    editor.exec(deleteCharBackward)
    expect(countText()).toBe('2 suggestions')
    editor.undo()
    expect(countText()).toBe('1 suggestion')
    bar.destroy()
    editor.destroy()
  })

  it('enables Accept/Reject only while the caret is on a suggestion', () => {
    const { editor, track } = suggested()
    const bar = createTrackChangesBar(editor, track, { container })
    caret(editor, 3)
    expect(button('accept').disabled).toBe(true)
    expect(button('reject').disabled).toBe(true)
    caret(editor, 7)
    expect(button('accept').disabled).toBe(false)
    expect(button('reject').disabled).toBe(false)
    bar.destroy()
    editor.destroy()
  })

  it('accepts the suggestion at the caret', () => {
    const { editor, track } = suggested()
    const bar = createTrackChangesBar(editor, track, { container })
    caret(editor, 7)
    button('accept').click()
    expect(editor.getText()).toBe('abcdefX')
    expect(track.suggestions().map((s) => s.kind)).toEqual(['deletion'])
    expect(countText()).toBe('1 suggestion')
    bar.destroy()
    editor.destroy()
  })

  it('rejects the suggestion at the caret', () => {
    const { editor, track } = suggested()
    const bar = createTrackChangesBar(editor, track, { container })
    caret(editor, 0)
    button('reject').click()
    expect(editor.getText()).toBe('abcdefX')
    expect(track.suggestions().map((s) => s.kind)).toEqual(['insertion'])
    bar.destroy()
    editor.destroy()
  })

  it('accepts and rejects everything, disabling the buttons when nothing is pending', () => {
    const { editor, track } = suggested()
    const bar = createTrackChangesBar(editor, track, { container })
    expect(button('accept-all').disabled).toBe(false)
    button('accept-all').click()
    expect(editor.getHTML()).toBe('<p>bcdefX</p>')
    expect(button('accept-all').disabled).toBe(true)
    expect(button('reject-all').disabled).toBe(true)
    caret(editor, 1)
    editor.exec(deleteCharBackward)
    button('reject-all').click()
    expect(editor.getHTML()).toBe('<p>bcdefX</p>')
    bar.destroy()
    editor.destroy()
  })

  it('Next and Previous select the neighbouring suggestion range', () => {
    const { editor, track } = suggested()
    const bar = createTrackChangesBar(editor, track, { container })
    caret(editor, 3)
    button('next').click()
    expect(editor.state.selection.from).toEqual(pos([0], 6))
    expect(editor.state.selection.to).toEqual(pos([0], 7))
    expect(button('next').disabled).toBe(true)
    button('previous').click()
    expect(editor.state.selection.from).toEqual(pos([0], 0))
    expect(editor.state.selection.to).toEqual(pos([0], 1))
    expect(button('previous').disabled).toBe(true)
    // Landing on a suggestion arms Accept for it.
    expect(button('accept').disabled).toBe(false)
    bar.destroy()
    editor.destroy()
  })

  it('reports every action through onChange', () => {
    const { editor, track } = suggested()
    const onChange = vi.fn()
    const bar = createTrackChangesBar(editor, track, { container, onChange })
    button('accept-all').click()
    expect(onChange).toHaveBeenCalledWith({ enabled: true, count: 0 })
    bar.destroy()
    editor.destroy()
  })

  it('stops updating once destroyed', () => {
    const { editor, track } = mount()
    const bar = createTrackChangesBar(editor, track, { container })
    bar.destroy()
    expect(container.querySelector('.trevixal-trackchanges')).toBeNull()
    track.enable()
    caret(editor, 6)
    editor.commands.insertText('X')
    expect(bar.element.querySelector('.trevixal-trackchanges__count')?.textContent).toBe(
      'No suggestions',
    )
    editor.destroy()
  })
})

describe('createTrackChangesBar external toggles', () => {
  it('follows suggestion mode being switched on from somewhere else', () => {
    const { editor, track } = mount()
    const bar = createTrackChangesBar(editor, track, { container })
    const toggle = container.querySelector('.trevixal-trackchanges__toggle') as HTMLElement
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    // The View menu, a shortcut, a host button: switching modes changes no
    // document, so it raises no transaction, and a bar listening only to the
    // editor never hears it. It then reads "off" while every keystroke is in
    // fact being recorded as a suggestion, and the next click on the bar
    // turns suggesting off rather than on, which is what the reader sees.
    track.enable()

    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    track.disable()
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    bar.destroy()
  })

  it('stops listening once destroyed', () => {
    const { editor, track } = mount()
    const bar = createTrackChangesBar(editor, track, { container })
    bar.destroy()
    // No listener left behind to write into a detached bar.
    expect(() => track.enable()).not.toThrow()
  })
})
