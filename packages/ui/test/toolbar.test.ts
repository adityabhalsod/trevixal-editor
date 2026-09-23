import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type QuickInsertItem,
  createToolUsageTracker,
  openCustomizeToolbarDialog,
  quickInsertItemsFromMenus,
} from '../src/quick-tools'
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

  it('hides and shows groups in place, without rebuilding the bar', () => {
    const toolbar = createToolbar(createEditor({ schema }), container, { reorderable: true })
    const every = toolbar.groups.map((group) => group.name)
    expect(every).toEqual(toolbar.getGroupOrder())
    expect(toolbar.groups.find((group) => group.name === 'lists')?.label).toBe('Lists')
    const bold = toolbar.element.querySelector('[data-trevixal-item="bold"]')

    toolbar.setVisibleGroups(['history', 'marks'])
    expect(toolbar.getGroupOrder()).toEqual(['history', 'marks'])
    // A hidden group leaves the bar, so neither the arrow keys nor a grip reach it.
    expect(toolbar.element.querySelector('[data-trevixal-item="bulletList"]')).toBeNull()
    // It is still listed, so the Customize dialog can offer it back.
    expect(toolbar.groups.map((group) => group.name)).toEqual(every)

    toolbar.setVisibleGroups(every)
    expect(toolbar.getGroupOrder()).toEqual(every)
    // The same controls come back, not rebuilt ones.
    expect(toolbar.element.querySelector('[data-trevixal-item="bold"]')).toBe(bold)
  })
})

describe('quick access', () => {
  let container: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  function mount(insertItems: () => readonly QuickInsertItem[] = () => []) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema, element: host })
    const tracker = createToolUsageTracker()
    const toolbar = createToolbar(editor, container, { quickAccess: { insertItems, tracker } })
    return { editor, tracker, toolbar }
  }

  it('leads the bar as one group, a + and a tray, that moves like the rest', () => {
    const { toolbar } = mount()
    expect(toolbar.getGroupOrder()[0]).toBe('quick')
    expect(toolbar.groups[0]).toEqual({ name: 'quick', label: 'Quick access' })
    expect(
      toolbar.element.querySelector('[data-trevixal-group="quick"] .trevixal-quickinsert'),
    ).not.toBeNull()
  })

  it('offers back the tools used, pinned ones first', () => {
    const { editor, tracker, toolbar } = mount()
    const tray = (): (string | undefined)[] =>
      [...toolbar.element.querySelectorAll<HTMLElement>('[data-trevixal-recent]')].map(
        (button) => button.dataset.trevixalRecent,
      )
    const button = (selector: string) => toolbar.element.querySelector<HTMLButtonElement>(selector)
    expect(tray()).toEqual([])
    button('[data-trevixal-item="bold"]')?.click()
    button('[data-trevixal-item="italic"]')?.click()
    expect(tray()).toEqual(['italic', 'bold'])

    button('[data-trevixal-recent="bold"]')?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    )
    expect(tracker.isFavorite('bold')).toBe(true)
    expect(tray()).toEqual(['bold', 'italic'])

    // A tool used from the tray runs, and shows its state as the bar does,
    // without the tray shuffling under the pointer.
    expect(button('[data-trevixal-recent="italic"]')?.getAttribute('aria-pressed')).toBe('true')
    button('[data-trevixal-recent="italic"]')?.click()
    expect(editor.getSnapshot().activeMarks).not.toContain('italic')
    expect(button('[data-trevixal-recent="italic"]')?.getAttribute('aria-pressed')).toBe('false')
    expect(tracker.usage.recent).toEqual(['italic', 'bold'])
  })

  it('searches what it can insert, and Enter inserts the best match', () => {
    const rule = vi.fn()
    const { toolbar } = mount(() => [
      { name: 'insertImage', label: 'Image…', run: vi.fn() },
      { name: 'insertHorizontalRule', label: 'Horizontal rule', run: rule },
      { name: 'removeLink', label: 'Remove link', run: vi.fn(), isEnabled: () => false },
    ])
    const quick = toolbar.element.querySelector<HTMLElement>('.trevixal-quickinsert')
    if (!quick) throw new Error('no quick insert')
    quick.querySelector<HTMLButtonElement>('.trevixal-dropdown__trigger')?.click()
    const labels = (): (string | null)[] =>
      [...quick.querySelectorAll('.trevixal-quickinsert__label')].map((label) => label.textContent)
    // What cannot apply here is left out, not offered as a button that does nothing.
    expect(labels()).toEqual(['Image…', 'Horizontal rule'])

    const search = quick.querySelector<HTMLInputElement>('.trevixal-quickinsert__search')
    if (!search) throw new Error('no search box')
    const press = (key: string): void => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    }
    press('ArrowDown')
    expect(document.activeElement?.textContent).toBe('Image…')
    search.value = 'rule'
    search.dispatchEvent(new Event('input'))
    expect(labels()).toEqual(['Horizontal rule'])
    press('Enter')
    expect(rule).toHaveBeenCalledOnce()
    expect(quick.classList.contains('trevixal-dropdown--open')).toBe(false)
  })

  it('builds its list from menus, naming a submenu’s entries after it', () => {
    const run = vi.fn()
    const items = quickInsertItemsFromMenus([
      {
        name: 'insert',
        label: 'Insert',
        items: [
          { name: 'insertImage', label: 'Image…', icon: 'image', run },
          { name: 'sep', label: '', separator: true },
          {
            name: 'callout',
            label: 'Callout',
            items: [{ name: 'calloutInfo', label: 'Info', run }],
          },
          // No `run`: the host never wired it.
          { name: 'unwired', label: 'Not wired' },
        ],
      },
    ])
    expect(items.map((item) => item.label)).toEqual(['Image…', 'Callout: Info'])
    expect(items[0]?.icon).toBe('image')
  })
})

describe('customize toolbar dialog', () => {
  it('keeps focus on a moved group, and gives it back on close', async () => {
    document.body.innerHTML = ''
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const onApply = vi.fn()
    const closed = openCustomizeToolbarDialog({
      document,
      groups: [
        { name: 'a', label: 'A' },
        { name: 'b', label: 'B' },
        { name: 'c', label: 'C' },
      ],
      visible: ['a', 'b', 'c'],
      onApply,
    })
    const button = (label: string) =>
      document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
    button('Move A down')?.click()
    // Moved to second place, with focus still on the button to press again.
    expect(document.activeElement).toBe(button('Move A down'))
    button('Move A down')?.click()
    // At the bottom that button is disabled, so focus goes to the other one.
    expect(document.activeElement).toBe(button('Move A up'))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    await closed
    expect(document.activeElement).toBe(opener)
    expect(onApply).not.toHaveBeenCalled()
  })
})
