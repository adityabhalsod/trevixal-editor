// @vitest-environment happy-dom
import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { describe, expect, it, vi } from 'vitest'
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

  it('keeps the highlighted row in view as the selection moves through a long list', () => {
    const editor = createEditor({ schema })
    const popup = createSuggestionPopup<string>({
      editor,
      renderItem: (item) => item,
      onPick: () => {},
    })
    // Rows 30px tall in a popup that shows three of them.
    const box = (top: number, height: number) =>
      ({ top, bottom: top + height, left: 0, right: 100, width: 100, height }) as DOMRect
    const geometry = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this === popup.element) return box(0, 90)
        const index = [...popup.element.children].indexOf(this)
        return box(index * 30 - popup.element.scrollTop, 30)
      })
    const show = (selectedIndex: number): void =>
      popup.update({
        items: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        selectedIndex,
        match: { path: [0], from: 0, to: 1, query: '' },
      })
    show(0)
    expect(popup.element.scrollTop).toBe(0)
    show(5)
    // Row 5 spans 150 to 180, so the popup scrolls until its bottom is showing.
    expect(popup.element.scrollTop).toBe(90)
    show(4)
    // Already in view: the list stays put rather than jumping back to the top.
    expect(popup.element.scrollTop).toBe(90)
    show(1)
    expect(popup.element.scrollTop).toBe(30)
    geometry.mockRestore()
    popup.destroy()
    editor.destroy()
  })

  it('draws an icon and a description when it is told them', () => {
    const editor = createEditor({ schema })
    const popup = createSuggestionPopup<{ title: string; about: string }>({
      editor,
      renderItem: (item) => item.title,
      iconOf: () => 'table',
      detailOf: (item) => item.about,
      onPick: () => {},
    })
    popup.update({
      items: [{ title: 'Table', about: 'Rows and columns' }],
      selectedIndex: 0,
      match: { path: [0], from: 0, to: 1, query: '' },
    })
    const row = popup.element.querySelector('button')
    expect(row?.querySelector('svg')).not.toBeNull()
    expect(row?.querySelector('.trevixal-popup__label')?.textContent).toBe('Table')
    expect(row?.querySelector('.trevixal-popup__detail')?.textContent).toBe('Rows and columns')
    popup.destroy()
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
