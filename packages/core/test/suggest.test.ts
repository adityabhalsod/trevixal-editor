// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createEditor } from '../src/editor/editor'
import { findTrigger, suggestion } from '../src/suggest/suggest'
import { cursor, doc, p, stateWith, testSchema } from './helpers'

describe('findTrigger', () => {
  it('matches a trigger at the start of a block', () => {
    const state = stateWith(doc(p('@al')), cursor([0], 3))
    expect(findTrigger(state, { char: '@' })).toEqual({
      path: [0],
      from: 0,
      to: 3,
      query: 'al',
    })
  })

  it('matches a trigger after whitespace mid-block', () => {
    const state = stateWith(doc(p('hello @wo')), cursor([0], 9))
    expect(findTrigger(state, { char: '@' })).toMatchObject({ from: 6, to: 9, query: 'wo' })
  })

  it('rejects a trigger glued to a word (email addresses)', () => {
    const state = stateWith(doc(p('mail me a@b')), cursor([0], 11))
    expect(findTrigger(state, { char: '@' })).toBeNull()
  })

  it('rejects when the query contains whitespace unless allowed', () => {
    const state = stateWith(doc(p('@two words')), cursor([0], 10))
    expect(findTrigger(state, { char: '@' })).toBeNull()
    expect(findTrigger(state, { char: '@', allowSpaces: true })).toMatchObject({
      query: 'two words',
    })
  })

  it('honours startOfBlock', () => {
    const mid = stateWith(doc(p('see /cmd')), cursor([0], 8))
    expect(findTrigger(mid, { char: '/', startOfBlock: true })).toBeNull()
    const start = stateWith(doc(p('/cmd')), cursor([0], 4))
    expect(findTrigger(start, { char: '/', startOfBlock: true })).toMatchObject({ query: 'cmd' })
  })

  it('returns null when the caret is not right after the run', () => {
    const state = stateWith(doc(p('@query')), cursor([0], 0))
    expect(findTrigger(state, { char: '@' })).toBeNull()
  })
})

describe('suggestion', () => {
  it('drives start / update / exit callbacks from transactions', () => {
    const editor = createEditor({ schema: testSchema })
    const events: string[] = []
    const dispose = suggestion(editor, {
      char: '@',
      onStart: (match) => events.push(`start:${match.query}`),
      onUpdate: (match) => events.push(`update:${match.query}`),
      onExit: () => events.push('exit'),
    })
    editor.commands.insertText('@')
    editor.commands.insertText('a')
    editor.commands.insertText('l')
    editor.commands.insertText(' ') // space ends the (no-spaces) trigger
    expect(events).toEqual(['start:', 'update:a', 'update:al', 'exit'])
    dispose()
    editor.destroy()
  })

  it('intercepts keys only while a trigger is active', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema: testSchema, element: host })
    const seen: string[] = []
    suggestion(editor, {
      char: '@',
      onKeyDown: (event) => {
        seen.push(event.key)
        return event.key === 'Enter'
      },
    })
    const press = (key: string): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true })
      editor.view?.dom.dispatchEvent(event)
      return event
    }
    // Inactive: keys flow to the keymap untouched.
    press('Enter')
    expect(seen).toEqual([])
    editor.commands.insertText('@x')
    const consumed = press('Enter')
    expect(seen).toEqual(['Enter'])
    expect(consumed.defaultPrevented).toBe(true)
    editor.destroy()
  })
})
