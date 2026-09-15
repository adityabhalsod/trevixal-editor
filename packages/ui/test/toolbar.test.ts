import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createToolbar } from '../src/toolbar'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

describe('createToolbar', () => {
  let container: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  it('renders the ARIA toolbar pattern', () => {
    const editor = createEditor({ schema })
    const toolbar = createToolbar(editor, container)
    expect(toolbar.element.getAttribute('role')).toBe('toolbar')
    const buttons = [...toolbar.element.querySelectorAll('.trevixal-toolbar__button')]
    expect(buttons.length).toBeGreaterThan(5)
    // Exactly one control is tabbable at a time (roving tabindex).
    const tabbable = toolbar.element.querySelectorAll('[tabindex="0"]')
    expect(tabbable).toHaveLength(1)
    expect(buttons.every((b) => b.getAttribute('aria-label'))).toBe(true)
  })

  it('dispatches commands and reflects state', () => {
    const editor = createEditor({ schema })
    const toolbar = createToolbar(editor, container)
    editor.commands.insertText('hi')
    editor.commands.selectAll()
    const bold = toolbar.element.querySelector<HTMLButtonElement>('[data-trevixal-item="bold"]')
    expect(bold?.getAttribute('aria-pressed')).toBe('false')
    bold?.click()
    expect(editor.isActive('bold')).toBe(true)
    expect(bold?.getAttribute('aria-pressed')).toBe('true')
  })

  it('disables undo/redo appropriately', () => {
    const editor = createEditor({ schema })
    const toolbar = createToolbar(editor, container)
    const undo = toolbar.element.querySelector<HTMLButtonElement>('[data-trevixal-item="undo"]')
    expect(undo?.disabled).toBe(true)
    editor.commands.insertText('x')
    expect(undo?.disabled).toBe(false)
    undo?.click()
    expect(editor.getText()).toBe('')
  })

  it('cleans up on destroy', () => {
    const editor = createEditor({ schema })
    const toolbar = createToolbar(editor, container)
    toolbar.destroy()
    expect(container.querySelector('.trevixal-toolbar')).toBeNull()
  })
})

describe('createToolbar: rearranging groups', () => {
  let container: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  const gripOf = (toolbar: ReturnType<typeof createToolbar>, name: string): HTMLButtonElement =>
    toolbar.element.querySelector(`[data-trevixal-grip="${name}"]`) as HTMLButtonElement
  const press = (target: Element, key: string): void => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  }

  it('renders no grips unless asked', () => {
    const toolbar = createToolbar(createEditor({ schema }), container)
    expect(toolbar.element.querySelector('.trevixal-toolbar__grip')).toBeNull()
  })

  it('gives every group a labelled grip when reorderable', () => {
    const toolbar = createToolbar(createEditor({ schema }), container, { reorderable: true })
    const groups = toolbar.element.querySelectorAll('.trevixal-toolbar__group')
    const grips = toolbar.element.querySelectorAll('.trevixal-toolbar__grip')
    expect(grips.length).toBe(groups.length)
    expect(gripOf(toolbar, 'lists').getAttribute('aria-label')).toBe('Move Lists group')
    // Grips join the roving order rather than adding tab stops.
    expect(toolbar.element.querySelectorAll('[tabindex="0"]')).toHaveLength(1)
  })

  it('starts in the remembered order without hiding unmentioned groups', () => {
    const editor = createEditor({ schema })
    const stock = createToolbar(editor, document.createElement('div')).getGroupOrder()
    const toolbar = createToolbar(editor, container, {
      groupOrder: ['history', 'lists', 'no-such-group'],
    })
    const names = toolbar.getGroupOrder()
    expect(names.slice(0, 2)).toEqual(['history', 'lists'])
    expect(names).toHaveLength(stock.length)
    expect([...names].sort()).toEqual([...stock].sort())
  })

  it('moves a group with the keyboard and reports the new order', () => {
    const onReorder = vi.fn()
    const toolbar = createToolbar(createEditor({ schema }), container, {
      reorderable: true,
      onReorder,
    })
    const before = toolbar.getGroupOrder()
    const grip = gripOf(toolbar, 'lists')
    grip.focus()
    press(grip, ' ')
    expect(grip.getAttribute('aria-pressed')).toBe('true')
    press(grip, 'ArrowLeft')
    press(grip, 'ArrowLeft')
    press(grip, 'Enter')
    expect(grip.getAttribute('aria-pressed')).toBe('false')

    const after = toolbar.getGroupOrder()
    expect(after.indexOf('lists')).toBe(before.indexOf('lists') - 2)
    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(onReorder).toHaveBeenCalledWith(after)
    // The grip travels with its group.
    expect(gripOf(toolbar, 'lists').closest('[data-trevixal-group]')).toBe(
      toolbar.element.querySelectorAll('.trevixal-toolbar__group')[after.indexOf('lists')],
    )
    expect(toolbar.element.querySelector('.trevixal-toolbar__live')?.textContent).toContain(
      'Lists group dropped',
    )
  })

  it('puts the group back on Escape', () => {
    const onReorder = vi.fn()
    const toolbar = createToolbar(createEditor({ schema }), container, {
      reorderable: true,
      onReorder,
    })
    const before = toolbar.getGroupOrder()
    const grip = gripOf(toolbar, 'align')
    press(grip, 'Enter')
    press(grip, 'End')
    const moved = toolbar.getGroupOrder()
    expect(moved[moved.length - 1]).toBe('align')
    press(grip, 'Escape')
    expect(toolbar.getGroupOrder()).toEqual(before)
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('leaves the arrow keys to navigation until a grip is picked up', () => {
    const toolbar = createToolbar(createEditor({ schema }), container, { reorderable: true })
    const before = toolbar.getGroupOrder()
    press(gripOf(toolbar, 'align'), 'ArrowLeft')
    expect(toolbar.getGroupOrder()).toEqual(before)
  })

  it('can be reordered programmatically', () => {
    const toolbar = createToolbar(createEditor({ schema }), container)
    toolbar.setGroupOrder(['history', 'align'])
    expect(toolbar.getGroupOrder().slice(0, 2)).toEqual(['history', 'align'])
  })
})
