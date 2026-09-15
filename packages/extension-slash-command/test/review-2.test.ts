// @vitest-environment happy-dom
import {
  type Editor,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  pos,
} from '@trevixal/core'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  type SlashCommandItem,
  type SlashCommandState,
  defaultSlashCommands,
  fuzzyFilter,
  runSlashCommand,
  slashCommand,
} from '../src'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

interface Harness {
  readonly editor: Editor
  readonly states: (SlashCommandState | null)[]
  readonly handle: { select(index: number): void; dispose(): void }
  press(key: string): boolean
  beforeInput(inputType: string, data?: string): Event
}

function setup(items?: readonly SlashCommandItem[]): Harness {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host })
  const states: (SlashCommandState | null)[] = []
  const handle = slashCommand(editor, { items, onState: (state) => states.push(state) })
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

describe('slash trigger detection', () => {
  it('never opens mid-word (a/b)', async () => {
    const { editor, states } = setup()
    editor.commands.insertText('a/b')
    await flush()
    expect(states).toEqual([])
    editor.destroy()
  })

  it('never opens after whitespace mid-block: it is start-of-block only', async () => {
    const { editor, states } = setup()
    editor.commands.insertText('word /he')
    await flush()
    expect(states).toEqual([])
    editor.destroy()
  })

  it('closes as soon as the query takes a space', async () => {
    const { editor, states } = setup()
    editor.commands.insertText('/head')
    await flush()
    expect(states.at(-1)).not.toBeNull()
    editor.commands.insertText(' ')
    await flush()
    expect(states.at(-1)).toBeNull()
    editor.destroy()
  })

  it('closes when backspacing past the slash', async () => {
    const { editor, states, beforeInput } = setup()
    editor.commands.insertText('/h')
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

describe('slash keyboard handling', () => {
  it('wraps ArrowUp/ArrowDown at both ends', async () => {
    const { editor, states, press } = setup()
    editor.commands.insertText('/')
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
    editor.commands.insertText('/he')
    await flush()
    expect(press('Escape')).toBe(true)
    expect(states.at(-1)).toBeNull()
    expect(press('Escape')).toBe(false)
    editor.destroy()
  })

  it('falls through on Enter when nothing matches', async () => {
    const { editor, press, beforeInput } = setup()
    editor.commands.insertText('/zzzz')
    await flush()
    expect(press('Enter')).toBe(false)
    beforeInput('insertParagraph')
    expect(editor.getJSON().content).toHaveLength(2)
    editor.destroy()
  })

  it('consumes Enter when the menu has matches', async () => {
    const { editor, press } = setup()
    editor.commands.insertText('/head')
    await flush()
    expect(press('Enter')).toBe(true)
    expect(editor.getHTML()).toBe('<h1></h1>')
    editor.destroy()
  })
})

describe('runSlashCommand', () => {
  it('removes exactly the trigger text and nothing else, then runs', () => {
    const editor = createEditor({ schema })
    editor.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '/h1 keep me' }] }],
    })
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 3))))
    const item = defaultSlashCommands().find((entry) => entry.id === 'heading1') as SlashCommandItem
    runSlashCommand(editor, item, { path: [0], from: 0, to: 3, query: 'h1' })
    expect(editor.getText()).toBe(' keep me')
    expect(editor.getJSON().content?.[0]?.type).toBe('heading')
    editor.destroy()
  })

  it('reports one close (a single null state) when a pick closes the menu', async () => {
    const { editor, states, handle } = setup()
    editor.commands.insertText('/head')
    await flush()
    const before = states.filter((state) => state === null).length
    handle.select(0)
    await flush()
    expect(states.filter((state) => state === null).length - before).toBe(1)
    editor.destroy()
  })
})

describe('fuzzyFilter ranking', () => {
  const items: SlashCommandItem[] = [
    { id: 'sub', title: 'x c o d e y', run: () => {} }, // subsequence only
    { id: 'mid', title: 'block code', run: () => {} }, // substring
    { id: 'pre', title: 'code block', run: () => {} }, // prefix
  ]

  it('ranks prefix above substring above subsequence', () => {
    expect(fuzzyFilter(items, 'code').map((item) => item.id)).toEqual(['pre', 'mid', 'sub'])
  })

  it('is stable for equally scoring items', () => {
    const equal: SlashCommandItem[] = [
      { id: 'a', title: 'code alpha', run: () => {} },
      { id: 'b', title: 'code beta', run: () => {} },
      { id: 'c', title: 'code gamma', run: () => {} },
    ]
    expect(fuzzyFilter(equal, 'code').map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(fuzzyFilter([...equal].reverse(), 'code').map((item) => item.id)).toEqual([
      'c',
      'b',
      'a',
    ])
  })

  it('matches keywords as well as titles', () => {
    const withKeywords: SlashCommandItem[] = [
      { id: 'plain', title: 'Nothing', run: () => {} },
      { id: 'kw', title: 'Divider', keywords: ['hr', 'rule'], run: () => {} },
    ]
    expect(fuzzyFilter(withKeywords, 'hr').map((item) => item.id)).toEqual(['kw'])
  })
})

describe('slash dispose', () => {
  it('stops listening so a replacement handle does not double-run', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema, element: host })
    let runs = 0
    const items: SlashCommandItem[] = [{ id: 'count', title: 'Counter', run: () => void runs++ }]
    const first = slashCommand(editor, { items, onState: () => {} })
    first.dispose()
    const second = slashCommand(editor, { items, onState: () => {} })
    editor.commands.insertText('/count')
    await flush()
    second.select(0)
    expect(runs).toBe(1)
    editor.destroy()
  })
})
