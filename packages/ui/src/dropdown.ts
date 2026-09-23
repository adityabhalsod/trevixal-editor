/**
 * The dropdown primitive shared by the menubar, the toolbar selects, the
 * color pickers and the table grid.
 *
 * It owns exactly one concern: showing a panel under a trigger button and
 * closing it again (Escape, outside click, focus loss). Panel content is
 * supplied by the caller, so adding a new kind of dropdown never means
 * touching this file.
 */

export interface DropdownOptions {
  readonly document: Document
  /** Fills the panel. Called once on creation. */
  readonly render: (panel: HTMLElement, dropdown: Dropdown) => void
  /** Called whenever the panel opens, for refreshing state. */
  readonly onOpen?: (panel: HTMLElement) => void
  readonly className?: string
}

export interface Dropdown {
  readonly element: HTMLElement
  readonly trigger: HTMLButtonElement
  readonly panel: HTMLElement
  readonly isOpen: boolean
  open(): void
  close(): void
  toggle(): void
  destroy(): void
}

const FLIPPED = 'trevixal-dropdown__panel--flipped'

/** Breathing room kept between a panel and the edge of the window. */
const EDGE_GUTTER = 8

/**
 * Open a panel inward when it would otherwise run off the right of the window.
 * A panel is positioned from its trigger, and a trigger can sit anywhere along
 * a menubar, so a wide panel under a right-hand menu would spill past the edge
 * on a narrow screen. Measured with the class cleared, so a panel that no
 * longer needs to flip goes back to opening outward.
 */
function alignPanel(element: HTMLElement, panel: HTMLElement): void {
  panel.classList.remove(FLIPPED)
  panel.style.removeProperty('right')
  const room = element.ownerDocument.documentElement.clientWidth
  const host = element.getBoundingClientRect()
  const width = panel.getBoundingClientRect().width
  if (host.left + width <= room) return
  panel.classList.add(FLIPPED)
  // Flipped, the panel's left edge sits at `host.right - width`, which on a
  // narrow screen can land off the other side of the window. Easing `right`
  // negative slides it back, since the panel is now positioned from its
  // right edge.
  const flippedLeft = host.right - width
  if (flippedLeft < EDGE_GUTTER) panel.style.right = `${flippedLeft - EDGE_GUTTER}px`
}

/**
 * The open dropdown per document, so opening one closes the others without
 * two editors on the same page (or in separate windows) sharing one global.
 */
const openDropdowns = new WeakMap<Document, Dropdown>()

export function createDropdown(options: DropdownOptions): Dropdown {
  const { document } = options
  const element = document.createElement('div')
  element.className = options.className
    ? `trevixal-dropdown ${options.className}`
    : 'trevixal-dropdown'

  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = 'trevixal-dropdown__trigger'
  trigger.setAttribute('aria-haspopup', 'true')
  trigger.setAttribute('aria-expanded', 'false')

  const panel = document.createElement('div')
  panel.className = 'trevixal-dropdown__panel'
  panel.hidden = true

  element.append(trigger, panel)

  let open = false

  const dropdown: Dropdown = {
    element,
    trigger,
    panel,
    get isOpen() {
      return open
    },
    open() {
      if (open) return
      const current = openDropdowns.get(document)
      if (current && current !== dropdown) current.close()
      open = true
      openDropdowns.set(document, dropdown)
      panel.hidden = false
      element.classList.add('trevixal-dropdown--open')
      trigger.setAttribute('aria-expanded', 'true')
      options.onOpen?.(panel)
      // After onOpen: rendering can change the panel's width.
      alignPanel(element, panel)
    },
    close() {
      if (!open) return
      open = false
      if (openDropdowns.get(document) === dropdown) openDropdowns.delete(document)
      panel.hidden = true
      element.classList.remove('trevixal-dropdown--open')
      trigger.setAttribute('aria-expanded', 'false')
    },
    toggle() {
      if (open) dropdown.close()
      else dropdown.open()
    },
    destroy() {
      dropdown.close()
      document.removeEventListener('pointerdown', onDocumentPointerDown, true)
      document.removeEventListener('keydown', onDocumentKeyDown, true)
      element.remove()
    },
  }

  // Keep the editor selection intact: never let the trigger steal focus.
  trigger.addEventListener('mousedown', (event) => event.preventDefault())
  trigger.addEventListener('click', () => dropdown.toggle())
  panel.addEventListener('mousedown', (event) => event.preventDefault())

  element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      dropdown.close()
      trigger.focus()
      event.stopPropagation()
    }
    if ((event.key === 'ArrowDown' || event.key === 'Enter') && !open && event.target === trigger) {
      dropdown.open()
      focusFirstItem(panel)
      event.preventDefault()
    }
  })

  const onDocumentPointerDown = (event: Event): void => {
    if (!open) return
    const target = event.target as globalThis.Node | null
    if (target && element.contains(target)) return
    dropdown.close()
  }
  document.addEventListener('pointerdown', onDocumentPointerDown, true)

  /**
   * Escape closes the panel wherever focus happens to be. The trigger
   * deliberately never takes focus (it must not steal the editor's
   * selection), so a menu opened with the mouse would otherwise have no
   * keyboard dismissal at all. The key event never reaches the element.
   */
  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (!open || event.key !== 'Escape') return
    if (element.contains(event.target as globalThis.Node | null)) return
    dropdown.close()
    // Answered: an Escape that closed a menu should not also leave fullscreen.
    event.preventDefault()
  }
  document.addEventListener('keydown', onDocumentKeyDown, true)

  options.render(panel, dropdown)
  return dropdown
}

/** Move focus to the first focusable control inside a panel. */
export function focusFirstItem(panel: HTMLElement): void {
  const first = panel.querySelector<HTMLElement>('button:not(:disabled), [tabindex="0"]')
  first?.focus()
}

/**
 * Arrow-key navigation for a vertical list of buttons inside a panel, with
 * Home and End jumping to the ends, the listbox keyboard contract, so a
 * long font or language list is one key from either end. Returns a disposer.
 */
export function bindListNavigation(panel: HTMLElement): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    const { key } = event
    if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return
    const items = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled)')]
    if (items.length === 0) return
    let next: HTMLElement | undefined
    if (key === 'Home') next = items[0]
    else if (key === 'End') next = items[items.length - 1]
    else {
      const current = items.indexOf(panel.ownerDocument.activeElement as HTMLElement)
      const delta = key === 'ArrowDown' ? 1 : -1
      next = items[(current + delta + items.length) % items.length]
    }
    next?.focus()
    event.preventDefault()
  }
  panel.addEventListener('keydown', onKeyDown)
  return () => panel.removeEventListener('keydown', onKeyDown)
}
