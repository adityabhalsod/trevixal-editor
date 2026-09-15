/**
 * A minimal context menu for the tab strip and the workspace panel: a list
 * of buttons under an anchor, with one level of submenus, closed by Escape,
 * by choosing an item, or by pointing anywhere else.
 *
 * Written here rather than imported from `@trevixal/ui` so this package has
 * no dependency beyond core.
 */

export interface MenuItem {
  /** Stable hook for tests and styling: rendered as `data-menu-item`. */
  readonly id: string
  readonly label: string
  readonly onSelect?: () => void
  /** Lazily built submenu; the item then opens it instead of selecting. */
  readonly items?: () => readonly MenuItem[]
  readonly danger?: boolean
  readonly disabled?: boolean
  readonly separatorBefore?: boolean
}

export interface MenuOptions {
  /** Block class of the menu (`trevixal-tabs-bar__menu`); items get `<class>-item`. */
  readonly className: string
  readonly label?: string
  readonly onClose?: () => void
}

export interface Menu {
  readonly element: HTMLElement
  readonly isOpen: boolean
  close(): void
}

/** The open menu per document, so opening one closes any other. */
const openMenus = new WeakMap<Document, Menu>()

export function openMenu(
  anchor: HTMLElement,
  items: readonly MenuItem[],
  options: MenuOptions,
): Menu {
  const doc = anchor.ownerDocument
  openMenus.get(doc)?.close()

  const element = doc.createElement('div')
  element.className = options.className
  element.setAttribute('role', 'menu')
  if (options.label) element.setAttribute('aria-label', options.label)
  element.style.position = 'absolute'
  const rect = anchor.getBoundingClientRect()
  const view = doc.defaultView
  element.style.top = `${rect.bottom + (view?.scrollY ?? 0)}px`
  element.style.left = `${rect.left + (view?.scrollX ?? 0)}px`

  let open = true
  /** Submenu stack: the lists above the one currently shown. */
  const trail: (readonly MenuItem[])[] = []

  const itemClass = `${options.className}-item`

  const render = (list: readonly MenuItem[]): void => {
    element.replaceChildren()
    if (trail.length > 0) {
      const back = doc.createElement('button')
      back.type = 'button'
      back.className = `${itemClass} ${itemClass}--back`
      back.setAttribute('role', 'menuitem')
      back.dataset.menuItem = 'back'
      back.textContent = '‹ Back'
      element.appendChild(back)
    }
    for (const item of list) {
      if (item.separatorBefore) {
        const separator = doc.createElement('div')
        separator.className = `${options.className}-separator`
        separator.setAttribute('role', 'separator')
        element.appendChild(separator)
      }
      const button = doc.createElement('button')
      button.type = 'button'
      button.className = item.danger ? `${itemClass} ${itemClass}--danger` : itemClass
      button.setAttribute('role', 'menuitem')
      button.dataset.menuItem = item.id
      button.textContent = item.items ? `${item.label} ›` : item.label
      if (item.items) button.setAttribute('aria-haspopup', 'menu')
      if (item.disabled) button.disabled = true
      element.appendChild(button)
    }
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }

  let current = items

  const onClick = (event: Event): void => {
    const target = (event.target as HTMLElement | null)?.closest?.('[data-menu-item]') as
      | HTMLButtonElement
      | null
      | undefined
    if (!target || target.disabled) return
    event.preventDefault()
    if (target.dataset.menuItem === 'back') {
      current = trail.pop() ?? items
      render(current)
      return
    }
    const item = current.find((candidate) => candidate.id === target.dataset.menuItem)
    if (!item) return
    if (item.items) {
      trail.push(current)
      current = item.items()
      render(current)
      return
    }
    menu.close()
    item.onSelect?.()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      menu.close()
      anchor.focus()
      return
    }
    if (event.key === 'ArrowLeft' && trail.length > 0) {
      event.preventDefault()
      current = trail.pop() ?? items
      render(current)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const buttons = [...element.querySelectorAll<HTMLElement>('button:not(:disabled)')]
    if (buttons.length === 0) return
    const index = buttons.indexOf(doc.activeElement as HTMLElement)
    const delta = event.key === 'ArrowDown' ? 1 : -1
    buttons[(index + delta + buttons.length) % buttons.length]?.focus()
    event.preventDefault()
  }

  const onDocumentPointerDown = (event: Event): void => {
    const target = event.target as globalThis.Node | null
    if (target && (element.contains(target) || anchor.contains(target))) return
    menu.close()
  }

  const menu: Menu = {
    element,
    get isOpen() {
      return open
    },
    close() {
      if (!open) return
      open = false
      if (openMenus.get(doc) === menu) openMenus.delete(doc)
      element.removeEventListener('click', onClick)
      element.removeEventListener('keydown', onKeyDown)
      doc.removeEventListener('pointerdown', onDocumentPointerDown, true)
      doc.removeEventListener('mousedown', onDocumentPointerDown, true)
      anchor.setAttribute('aria-expanded', 'false')
      element.remove()
      options.onClose?.()
    },
  }

  element.addEventListener('click', onClick)
  element.addEventListener('keydown', onKeyDown)
  doc.addEventListener('pointerdown', onDocumentPointerDown, true)
  doc.addEventListener('mousedown', onDocumentPointerDown, true)
  anchor.setAttribute('aria-expanded', 'true')
  openMenus.set(doc, menu)
  doc.body.appendChild(element)
  render(items)
  return menu
}

/** Close whatever menu is open in a document, if any. */
export function closeOpenMenu(doc: Document): void {
  openMenus.get(doc)?.close()
}

/** The default text prompt: the browser's, when there is one. */
export function defaultPrompt(message: string, defaultValue?: string): string | null {
  const fn = (globalThis as { prompt?: (message: string, value?: string) => string | null }).prompt
  return typeof fn === 'function' ? fn(message, defaultValue) : null
}

export type PromptText = (
  message: string,
  defaultValue?: string,
) => string | null | Promise<string | null>
