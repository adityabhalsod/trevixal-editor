import { type Editor, editorDocument, removeLink, updateLink } from '@trevixal/core'
import { createIcon } from './icons'

/**
 * The link editor, as a popover at the link instead of a modal over the page.
 *
 * A modal is the right shape for creating a link. There is nothing to point
 * at yet. It is the wrong shape for *editing* one: the dialog covers the
 * sentence the link sits in, and the thing you are checking is whether the
 * href matches the words around it.
 */

export interface LinkPopoverOptions {
  /**
   * Where the popover is appended. Must be a positioned ancestor of the
   * editing surface, or share its offset parent. Defaults to the surface's
   * own parent.
   */
  readonly container?: HTMLElement
  /** Gap between the link and the popover, in px. Defaults to 8. */
  readonly gap?: number
  /**
   * Open a URL. Defaults to a new tab with `noopener,noreferrer`. A link in
   * a document is untrusted content, and the opener reference is what lets a
   * hostile page rewrite the one that opened it.
   */
  readonly openURL?: (href: string) => void
}

export interface LinkPopover {
  readonly element: HTMLElement
  /** Re-read the selection and reposition. Called for you on every change. */
  refresh(): void
  /** Switch to the editing field, as the toolbar's link button may want to. */
  edit(): void
  destroy(): void
}

/** Enough of a URL to recognise; the title attribute carries the whole thing. */
const DISPLAY_LIMIT = 44

export function createLinkPopover(editor: Editor, options: LinkPopoverOptions = {}): LinkPopover {
  const view = editor.view
  const doc = editorDocument(editor, options.container, 'createLinkPopover')
  const host = options.container ?? (view?.dom.parentElement as HTMLElement)
  const gap = options.gap ?? 8
  const openURL =
    options.openURL ??
    ((href: string) => {
      doc.defaultView?.open(href, '_blank', 'noopener,noreferrer')
    })

  const root = doc.createElement('div')
  root.className = 'trevixal-linkpopover'
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', 'Link')
  root.hidden = true

  // The view holds the href; the form edits it. Only one is ever shown.
  const view_ = doc.createElement('div')
  view_.className = 'trevixal-linkpopover__view'
  const href = doc.createElement('a')
  href.className = 'trevixal-linkpopover__href'
  href.target = '_blank'
  href.rel = 'noopener noreferrer'
  view_.appendChild(href)

  const form = doc.createElement('form')
  form.className = 'trevixal-linkpopover__form'
  form.hidden = true
  const field = doc.createElement('input')
  field.type = 'url'
  field.className = 'trevixal-linkpopover__field'
  field.placeholder = 'https://…'
  field.setAttribute('aria-label', 'Link address')
  form.appendChild(field)

  const button = (
    parent: HTMLElement,
    name: string,
    label: string,
    icon: Parameters<typeof createIcon>[1],
    onClick: () => void,
  ): HTMLButtonElement => {
    const element = doc.createElement('button')
    element.type = 'button'
    element.className = 'trevixal-linkpopover__button'
    element.dataset.trevixalItem = name
    element.title = label
    element.setAttribute('aria-label', label)
    const glyph = createIcon(doc, icon)
    if (glyph) element.appendChild(glyph)
    else element.textContent = label
    element.addEventListener('mousedown', (event) => event.preventDefault())
    element.addEventListener('click', onClick)
    parent.appendChild(element)
    return element
  }

  let editing = false
  let current: string | null = null

  const stopEditing = (): void => {
    editing = false
    form.hidden = true
    view_.hidden = false
  }

  const startEditing = (): void => {
    if (!current) return
    editing = true
    view_.hidden = true
    form.hidden = false
    field.value = current
    field.focus()
    field.select()
  }

  button(view_, 'open', 'Open link', 'linkNewTab', () => {
    if (current) openURL(current)
  })
  button(view_, 'edit', 'Edit link', 'link', () => startEditing())
  button(view_, 'unlink', 'Remove link', 'unlink', () => {
    stopEditing()
    // `unsetLink` clears the *selection*, and the caret inside a link selects
    // nothing, so the link would stay exactly where it was. `removeLink`
    // takes the whole link the caret is in, which is what the button says.
    editor.exec(removeLink)
    editor.view?.focus()
  })

  const apply = (): void => {
    // Likewise: `setLink` writes over the selection, so with a bare caret it
    // stores a pending mark and leaves the link's address untouched.
    // `updateLink` rewrites the link itself, and refuses an unsafe address.
    editor.exec(updateLink({ href: field.value.trim() }))
    stopEditing()
    editor.view?.focus()
  }
  button(form, 'apply', 'Apply', 'check', apply)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    apply()
  })
  field.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    stopEditing()
    editor.view?.focus()
  })

  root.append(view_, form)
  host.appendChild(root)

  /** The rendered anchor holding the caret, or null. */
  const activeAnchor = (): HTMLAnchorElement | null => {
    const surface = editor.view?.dom
    const selection = doc.getSelection()
    const anchor = selection?.anchorNode
    if (!surface || !anchor || !surface.contains(anchor)) return null
    let node: Node | null = anchor
    while (node && node !== surface) {
      if (node instanceof HTMLAnchorElement) return node
      node = node.parentNode
    }
    return null
  }

  const refresh = (): void => {
    // While the field has focus the caret is not in the document at all;
    // hiding on that would close the popover the moment it is used.
    if (editing) return
    if (editor.isDestroyed) {
      root.hidden = true
      return
    }
    const link = editor.getSnapshot().markAttrs.link
    const value = typeof link?.href === 'string' ? link.href : null
    if (!value || !editor.isEditable) {
      current = null
      root.hidden = true
      return
    }
    current = value
    href.href = value
    href.title = value
    href.textContent =
      value.length > DISPLAY_LIMIT ? `${value.slice(0, DISPLAY_LIMIT - 1)}…` : value

    root.hidden = false
    const anchor = activeAnchor()
    const rect = anchor?.getBoundingClientRect()
    if (!rect) return
    const hostBox = host.getBoundingClientRect()
    const left = rect.left - hostBox.left - host.clientLeft + host.scrollLeft
    const top = rect.bottom - hostBox.top - host.clientTop + host.scrollTop
    const room = Math.max(0, host.clientWidth - root.offsetWidth)
    root.style.left = `${room > 0 ? Math.min(Math.max(left, 0), room) : left}px`
    root.style.top = `${top + gap}px`
  }

  const offTransaction = editor.on('transaction', refresh)
  const offSelection = editor.on('selectionUpdate', refresh)
  doc.addEventListener('selectionchange', refresh)
  refresh()

  return {
    element: root,
    refresh,
    edit: startEditing,
    destroy() {
      offTransaction()
      offSelection()
      doc.removeEventListener('selectionchange', refresh)
      root.remove()
    },
  }
}
