// @vitest-environment happy-dom
import { type Editor, Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { trevixalEditor } from '../src/index'
import { counterView } from './counter-view.svelte'

/**
 * The interactive counter block, as a Svelte component inside the document.
 *
 * The adapter takes node-view *factories* rather than components, because
 * this package imports nothing from Svelte. That is what lets one build
 * serve Svelte 4 stores and Svelte 5 runes alike. Mounting is therefore the
 * host's three lines, shown here in full so they can be copied.
 */

const schema = new Schema({
  nodes: {
    ...defaultNodes(),
    counter: {
      group: 'block',
      atom: true,
      attrs: { count: { default: 0 } },
      toHTML: (node) => ({ tag: 'div', attrs: { 'data-counter': String(node.attrs.count) } }),
    },
  },
  marks: defaultMarks(),
})

const content = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
    { type: 'counter', attrs: { count: 1 } },
  ],
}

let host: HTMLElement
let editor: Editor
let action: { destroy(): void } | null = null

beforeEach(() => {
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.appendChild(host)
  editor = createEditor({ schema, content })
  action = trevixalEditor(host, { editor, nodeViews: { counter: counterView(editor) } })
})

afterEach(() => {
  action?.destroy()
  action = null
  editor.destroy()
})

const button = () => host.querySelector<HTMLButtonElement>('[data-testid="counter"]')

describe('Svelte node views (interactive counter block)', () => {
  it('renders the component inside the editing surface', () => {
    expect(button()?.textContent?.trim()).toBe('count: 1')
    expect(host.querySelector('.trevixal-content')?.contains(button())).toBe(true)
  })

  it('a click changes the document, and the document redraws the component', async () => {
    button()?.click()
    expect(editor.getJSON().content?.[1]).toEqual({ type: 'counter', attrs: { count: 2 } })
    await Promise.resolve()
    expect(button()?.textContent?.trim()).toBe('count: 2')
  })

  it('the change is an ordinary edit, so undo takes it back', async () => {
    button()?.click()
    await Promise.resolve()
    expect(button()?.textContent?.trim()).toBe('count: 2')
    editor.undo()
    await Promise.resolve()
    expect(button()?.textContent?.trim()).toBe('count: 1')
  })

  it('survives typing elsewhere without being torn down', () => {
    const before = button()
    editor.commands.insertText('x')
    expect(button()).toBe(before)
    expect(editor.getText()).toContain('xhi')
  })

  it('is taken down with the view', () => {
    action?.destroy()
    action = null
    expect(host.querySelector('[data-testid="counter"]')).toBeNull()
  })
})
