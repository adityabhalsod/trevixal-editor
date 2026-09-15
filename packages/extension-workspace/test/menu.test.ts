// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type MenuItem, closeOpenMenu, openMenu } from '../src/menu'

let anchor: HTMLButtonElement

beforeEach(() => {
  document.body.innerHTML = ''
  anchor = document.createElement('button')
  anchor.type = 'button'
  document.body.appendChild(anchor)
})

function click(element: Element | null | undefined): void {
  element?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

function press(element: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  element.dispatchEvent(event)
  return event
}

describe('openMenu', () => {
  it('renders the ARIA menu pattern and marks the anchor expanded', () => {
    const menu = openMenu(anchor, [{ id: 'one', label: 'One' }], {
      className: 'demo-menu',
      label: 'Demo',
    })
    expect(menu.element.getAttribute('role')).toBe('menu')
    expect(menu.element.getAttribute('aria-label')).toBe('Demo')
    expect(menu.element.className).toBe('demo-menu')
    expect(document.body.contains(menu.element)).toBe(true)
    expect(anchor.getAttribute('aria-expanded')).toBe('true')
    const item = menu.element.querySelector('[data-menu-item="one"]')
    expect(item?.getAttribute('role')).toBe('menuitem')
    expect(item?.textContent).toBe('One')
    menu.close()
    expect(anchor.getAttribute('aria-expanded')).toBe('false')
    expect(document.body.contains(menu.element)).toBe(false)
  })

  it('renders separators, danger and disabled items', () => {
    const menu = openMenu(
      anchor,
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B', disabled: true },
        { id: 'c', label: 'C', danger: true, separatorBefore: true },
      ],
      { className: 'demo-menu' },
    )
    expect(menu.element.querySelector('[role="separator"]')?.className).toBe('demo-menu-separator')
    expect(menu.element.querySelector<HTMLButtonElement>('[data-menu-item="b"]')?.disabled).toBe(
      true,
    )
    expect(menu.element.querySelector('[data-menu-item="c"]')?.className).toContain(
      'demo-menu-item--danger',
    )
    menu.close()
  })

  it('runs an item and closes', () => {
    const chosen = vi.fn()
    const menu = openMenu(anchor, [{ id: 'one', label: 'One', onSelect: chosen }], {
      className: 'demo-menu',
    })
    click(menu.element.querySelector('[data-menu-item="one"]'))
    expect(chosen).toHaveBeenCalledTimes(1)
    expect(menu.isOpen).toBe(false)
  })

  it('ignores a disabled item', () => {
    const chosen = vi.fn()
    const menu = openMenu(anchor, [{ id: 'one', label: 'One', disabled: true, onSelect: chosen }], {
      className: 'demo-menu',
    })
    click(menu.element.querySelector('[data-menu-item="one"]'))
    expect(chosen).not.toHaveBeenCalled()
    expect(menu.isOpen).toBe(true)
    menu.close()
  })

  it('opens a submenu and comes back', () => {
    const chosen = vi.fn()
    const items: MenuItem[] = [
      {
        id: 'more',
        label: 'More',
        items: () => [{ id: 'deep', label: 'Deep', onSelect: chosen }],
      },
    ]
    const menu = openMenu(anchor, items, { className: 'demo-menu' })
    const trigger = menu.element.querySelector('[data-menu-item="more"]')
    expect(trigger?.textContent).toBe('More ›')
    expect(trigger?.getAttribute('aria-haspopup')).toBe('menu')
    click(trigger)
    expect(menu.element.querySelector('[data-menu-item="deep"]')).not.toBeNull()
    click(menu.element.querySelector('[data-menu-item="back"]'))
    expect(menu.element.querySelector('[data-menu-item="deep"]')).toBeNull()
    expect(menu.element.querySelector('[data-menu-item="more"]')).not.toBeNull()
    click(menu.element.querySelector('[data-menu-item="more"]'))
    click(menu.element.querySelector('[data-menu-item="deep"]'))
    expect(chosen).toHaveBeenCalledTimes(1)
    expect(menu.isOpen).toBe(false)
  })

  it('leaves a submenu with ArrowLeft', () => {
    const menu = openMenu(
      anchor,
      [{ id: 'more', label: 'More', items: () => [{ id: 'deep', label: 'Deep' }] }],
      { className: 'demo-menu' },
    )
    click(menu.element.querySelector('[data-menu-item="more"]'))
    press(menu.element, 'ArrowLeft')
    expect(menu.element.querySelector('[data-menu-item="more"]')).not.toBeNull()
    menu.close()
  })

  it('moves focus with the arrow keys, wrapping around', () => {
    const menu = openMenu(
      anchor,
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      { className: 'demo-menu' },
    )
    expect((document.activeElement as HTMLElement).dataset.menuItem).toBe('a')
    press(menu.element, 'ArrowDown')
    expect((document.activeElement as HTMLElement).dataset.menuItem).toBe('b')
    press(menu.element, 'ArrowDown')
    expect((document.activeElement as HTMLElement).dataset.menuItem).toBe('a')
    press(menu.element, 'ArrowUp')
    expect((document.activeElement as HTMLElement).dataset.menuItem).toBe('b')
    menu.close()
  })

  it('closes on Escape and gives the anchor its focus back', () => {
    const closed = vi.fn()
    const menu = openMenu(anchor, [{ id: 'a', label: 'A' }], {
      className: 'demo-menu',
      onClose: closed,
    })
    const event = press(menu.element, 'Escape')
    expect(event.defaultPrevented).toBe(true)
    expect(menu.isOpen).toBe(false)
    expect(document.activeElement).toBe(anchor)
    expect(closed).toHaveBeenCalledTimes(1)
    menu.close()
    expect(closed).toHaveBeenCalledTimes(1) // closing twice is a no-op
  })

  it('closes when something else is pointed at, but not itself', () => {
    const menu = openMenu(anchor, [{ id: 'a', label: 'A' }], { className: 'demo-menu' })
    menu.element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(menu.isOpen).toBe(true)
    anchor.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(menu.isOpen).toBe(true)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(menu.isOpen).toBe(false)
  })

  it('keeps at most one menu open per document', () => {
    const first = openMenu(anchor, [{ id: 'a', label: 'A' }], { className: 'demo-menu' })
    const second = openMenu(anchor, [{ id: 'b', label: 'B' }], { className: 'demo-menu' })
    expect(first.isOpen).toBe(false)
    expect(second.isOpen).toBe(true)
    closeOpenMenu(document)
    expect(second.isOpen).toBe(false)
    expect(() => closeOpenMenu(document)).not.toThrow()
  })
})
