// @vitest-environment happy-dom
import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { type SlashCommandState, defaultSlashCommands, fuzzyFilter, slashCommand } from '../src'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('fuzzyFilter', () => {
  const items = defaultSlashCommands()

  it('ranks prefix matches first', () => {
    const result = fuzzyFilter(items, 'head')
    expect(result[0]?.id).toBe('heading1')
  })

  it('matches keywords and subsequences', () => {
    expect(fuzzyFilter(items, 'h2')[0]?.id).toBe('heading2')
    expect(fuzzyFilter(items, 'ul')[0]?.id).toBe('bulletList')
    expect(fuzzyFilter(items, 'dvdr')[0]?.id).toBe('horizontalRule') // subsequence of "divider"
  })

  it('drops non-matches', () => {
    expect(fuzzyFilter(items, 'zzz')).toEqual([])
  })
})

describe('slashCommand', () => {
  function setup() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema, element: host })
    const states: (SlashCommandState | null)[] = []
    const handle = slashCommand(editor, { onState: (state) => states.push(state) })
    return { editor, states, handle }
  }

  it('only opens at the start of a block', async () => {
    const { editor, states } = setup()
    editor.commands.insertText('some /txt')
    await flush()
    expect(states.length).toBe(0)
    editor.destroy()
  })

  it('runs the chosen command and removes the trigger text', async () => {
    const { editor, states, handle } = setup()
    editor.commands.insertText('/head')
    await flush()
    const open = states.at(-1)
    expect(open?.items[0]?.id).toBe('heading1')
    handle.select(0)
    expect(editor.getHTML()).toBe('<h1></h1>')
    expect(states.at(-1)).toBeNull()
    editor.destroy()
  })

  it('turns a block into a list via the menu', async () => {
    const { editor, handle } = setup()
    editor.commands.insertText('/bullet')
    await flush()
    handle.select(0)
    expect(editor.getHTML()).toBe('<ul><li><p></p></li></ul>')
    editor.destroy()
  })
})
