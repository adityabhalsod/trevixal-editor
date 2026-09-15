// @vitest-environment happy-dom
import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { createSuggestionPopup } from '../src/popup'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

describe('createSuggestionPopup', () => {
  it('renders items, marks the selection, picks on mousedown, hides on null', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema, element: host })
    editor.commands.insertText('@a')
    const picked: number[] = []
    const popup = createSuggestionPopup<{ label: string }>({
      editor,
      renderItem: (item) => item.label,
      onPick: (index) => picked.push(index),
    })
    expect(popup.element.hidden).toBe(true)

    popup.update({
      items: [{ label: 'ada' }, { label: 'alan' }],
      selectedIndex: 1,
      match: { path: [0], from: 0, to: 2, query: 'a' },
    })
    expect(popup.element.hidden).toBe(false)
    const buttons = popup.element.querySelectorAll('button')
    expect([...buttons].map((button) => button.textContent)).toEqual(['ada', 'alan'])
    expect(buttons[1]?.className).toContain('--selected')
    expect(buttons[1]?.getAttribute('aria-selected')).toBe('true')

    buttons[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(picked).toEqual([0])

    popup.update(null)
    expect(popup.element.hidden).toBe(true)
    popup.destroy()
    expect(document.querySelector('.trevixal-popup')).toBeNull()
    editor.destroy()
  })

  it('shows the empty label when there are no matches', () => {
    const editor = createEditor({ schema })
    const popup = createSuggestionPopup<string>({
      editor,
      renderItem: (item) => item,
      onPick: () => {},
      emptyLabel: 'No results',
    })
    popup.update({ items: [], selectedIndex: 0, match: { path: [0], from: 0, to: 1, query: 'zz' } })
    expect(popup.element.hidden).toBe(false)
    expect(popup.element.textContent).toBe('No results')
    popup.destroy()
    editor.destroy()
  })
})
