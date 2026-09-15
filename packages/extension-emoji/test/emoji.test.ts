// @vitest-environment happy-dom
import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { type EmojiState, defaultEmoji, emoji, searchEmoji } from '../src'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('searchEmoji', () => {
  it('finds by shortcode prefix first, then keywords', () => {
    const result = searchEmoji('fi')
    expect(result.slice(0, 2).map((item) => item.name)).toEqual(['fire', 'fish'])
    expect(searchEmoji('lol')[0]?.name).toBe('laughing')
  })

  it('keeps the full set for an empty query', () => {
    expect(searchEmoji('')).toHaveLength(defaultEmoji().length)
  })
})

describe('emoji', () => {
  it('replaces the :query trigger with the picked character', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema, element: host })
    const states: (EmojiState | null)[] = []
    const handle = emoji(editor, { onState: (state) => states.push(state) })
    editor.commands.insertText('ship it :rock')
    await flush()
    expect(states.at(-1)?.items[0]?.name).toBe('rocket')
    handle.select(0)
    expect(editor.getText()).toBe('ship it 🚀')
    // Caret lands after the emoji.
    editor.commands.insertText('!')
    expect(editor.getText()).toBe('ship it 🚀!')
    editor.destroy()
  })

  it('stays closed below the minimum query length', async () => {
    const editor = createEditor({ schema })
    const states: (EmojiState | null)[] = []
    emoji(editor, { minQueryLength: 2, onState: (state) => states.push(state) })
    editor.commands.insertText(':f')
    await flush()
    expect(states.at(-1)?.items).toEqual([])
    editor.commands.insertText('i')
    await flush()
    expect(states.at(-1)?.items.map((item) => item.name)).toContain('fire')
    editor.destroy()
  })
})
