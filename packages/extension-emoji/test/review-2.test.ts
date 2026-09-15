// @vitest-environment happy-dom
import { type Editor, Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  type EmojiItem,
  type EmojiState,
  defaultEmoji,
  emoji,
  insertEmoji,
  searchEmoji,
} from '../src'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

interface Harness {
  readonly editor: Editor
  readonly states: (EmojiState | null)[]
  readonly handle: { select(index: number): void; dispose(): void }
  press(key: string): boolean
  beforeInput(inputType: string, data?: string): Event
}

function setup(items?: readonly EmojiItem[]): Harness {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host })
  const states: (EmojiState | null)[] = []
  const handle = emoji(editor, { items, onState: (state) => states.push(state) })
  const dom = editor.view?.dom as HTMLElement
  return {
    editor,
    states,
    handle,
    press: (key) => {
      const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true })
      dom.dispatchEvent(event)
      return event.defaultPrevented
    },
    beforeInput: (inputType, data) => {
      let event: Event
      try {
        event = new InputEvent('beforeinput', {
          inputType,
          data,
          cancelable: true,
          bubbles: true,
        } as InputEventInit)
        if ((event as InputEvent).inputType !== inputType) throw new Error('init ignored')
      } catch {
        event = new Event('beforeinput', { cancelable: true, bubbles: true })
        Object.assign(event, { inputType, data: data ?? null })
      }
      dom.dispatchEvent(event)
      return event
    },
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('emoji trigger detection', () => {
  it('never opens mid-word (a:b, or a URL)', async () => {
    const { editor, states } = setup()
    editor.commands.insertText('a:b')
    await flush()
    expect(states).toEqual([])
    editor.commands.insertText(' https://x')
    await flush()
    expect(states).toEqual([])
    editor.destroy()
  })

  it('closes as soon as the query takes a space', async () => {
    const { editor, states } = setup()
    editor.commands.insertText(':fi')
    await flush()
    expect(states.at(-1)).not.toBeNull()
    editor.commands.insertText(' ')
    await flush()
    expect(states.at(-1)).toBeNull()
    editor.destroy()
  })

  it('closes when backspacing past the colon', async () => {
    const { editor, states, beforeInput } = setup()
    editor.commands.insertText(':f')
    await flush()
    expect(states.at(-1)).not.toBeNull()
    beforeInput('deleteContentBackward')
    await flush()
    expect(states.at(-1)).not.toBeNull()
    beforeInput('deleteContentBackward')
    await flush()
    expect(states.at(-1)).toBeNull()
    editor.destroy()
  })
})

describe('emoji keyboard handling', () => {
  it('wraps ArrowUp/ArrowDown at both ends', async () => {
    const { editor, states, press } = setup()
    editor.commands.insertText(':fi')
    await flush()
    const count = states.at(-1)?.items.length ?? 0
    expect(count).toBeGreaterThan(1)
    expect(press('ArrowUp')).toBe(true)
    expect(states.at(-1)?.selectedIndex).toBe(count - 1)
    expect(press('ArrowDown')).toBe(true)
    expect(states.at(-1)?.selectedIndex).toBe(0)
    editor.destroy()
  })

  it('dismisses on Escape and lets a second Escape fall through', async () => {
    const { editor, states, press } = setup()
    editor.commands.insertText(':fi')
    await flush()
    expect(press('Escape')).toBe(true)
    expect(states.at(-1)).toBeNull()
    expect(press('Escape')).toBe(false)
    editor.destroy()
  })

  it('falls through on Enter when nothing matches', async () => {
    const { editor, press, beforeInput } = setup()
    editor.commands.insertText(':zzzz')
    await flush()
    expect(press('Enter')).toBe(false)
    beforeInput('insertParagraph')
    expect(editor.getJSON().content).toHaveLength(2)
    editor.destroy()
  })

  it('falls through on Enter while below the minimum query length', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema, element: host })
    emoji(editor, { minQueryLength: 3, onState: () => {} })
    editor.commands.insertText(':f')
    await flush()
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true })
    editor.view?.dom.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    editor.destroy()
  })
})

describe('insertEmoji', () => {
  it('replaces the trigger with the character and leaves the caret after it', async () => {
    const { editor, handle } = setup()
    editor.commands.insertText('go :rocket')
    await flush()
    handle.select(0)
    expect(editor.getText()).toBe('go 🚀')
    editor.commands.insertText('!')
    expect(editor.getText()).toBe('go 🚀!')
    editor.destroy()
  })

  it('keeps the caret right of multi-code-unit emoji', () => {
    const editor = createEditor({ schema })
    editor.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: ':rain' }] }],
    })
    const rain = defaultEmoji().find((item) => item.name === 'rain') as EmojiItem
    insertEmoji(editor, rain, { path: [0], from: 0, to: 5, query: 'rain' })
    editor.commands.insertText('|')
    expect(editor.getText()).toBe(`${rain.char}|`)
    editor.destroy()
  })

  it('reports one close (a single null state) when a pick closes the popup', async () => {
    const { editor, states, handle } = setup()
    editor.commands.insertText(':rocket')
    await flush()
    const before = states.filter((state) => state === null).length
    handle.select(0)
    await flush()
    expect(states.filter((state) => state === null).length - before).toBe(1)
    editor.destroy()
  })
})

describe('searchEmoji', () => {
  it('matches shortcode prefixes ahead of shortcode substrings and keywords', () => {
    const names = searchEmoji('heart').map((item) => item.name)
    expect(names[0]).toBe('heart') // exact prefix wins
    expect(names).toContain('heart_eyes')
    expect(names).toContain('broken_heart') // substring of the shortcode
    expect(searchEmoji('lol').map((item) => item.name)).toContain('laughing') // keyword only
  })

  it('is case insensitive', () => {
    expect(searchEmoji('ROCKET').map((item) => item.name)).toContain('rocket')
  })

  it('handles unicode input without throwing', () => {
    expect(() => searchEmoji('🔥')).not.toThrow()
    expect(() => searchEmoji('café')).not.toThrow()
    expect(searchEmoji('café')).toEqual([])
  })

  it('searches a custom set instead of the built-ins', () => {
    const custom: EmojiItem[] = [{ name: 'blob', char: '🫠', keywords: ['melt'] }]
    expect(searchEmoji('melt', custom).map((item) => item.name)).toEqual(['blob'])
    expect(searchEmoji('rocket', custom)).toEqual([])
  })
})

describe('defaultEmoji', () => {
  it('has no duplicate shortcodes and no duplicate characters', () => {
    const items = defaultEmoji()
    const names = items.map((item) => item.name)
    const chars = items.map((item) => item.char)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(chars).size).toBe(chars.length)
  })
})

describe('emoji dispose', () => {
  it('stops listening so a replacement handle does not double-insert', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema, element: host })
    const first = emoji(editor, { onState: () => {} })
    first.dispose()
    const second = emoji(editor, { onState: () => {} })
    editor.commands.insertText(':rocket')
    await flush()
    second.select(0)
    expect(editor.getText()).toBe('🚀')
    editor.destroy()
  })
})
