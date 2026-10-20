/** A modal dialog's parts, built in the kit's dialog look (see `@trevixal/ui`'s `openDialog`). */
export interface Modal {
  readonly dialog: HTMLElement
  /** Where the dialog's own content goes, between the title and the buttons. */
  readonly body: HTMLElement
  readonly actions: HTMLElement
  /** A button in the row at the foot; the primary one is the default action. */
  button(label: string, primary?: boolean): HTMLButtonElement
  /** Take the dialog down. Escape does the same, and calls `onDismiss`. */
  close(): void
}

/**
 * A modal dialog with a title, a body the caller fills and a row of buttons,
 * in the same elements and classes as the kit's other dialogs, so it looks
 * and behaves like them. Escape dismisses it.
 */
export function openModal(document: Document, title: string, onDismiss: () => void): Modal {
  const overlay = document.createElement('div')
  overlay.className = 'trevixal-dialog-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'trevixal-dialog'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', title)
  const heading = document.createElement('h2')
  heading.className = 'trevixal-dialog__title'
  heading.textContent = title
  const body = document.createElement('div')
  body.className = 'trevixal-dialog__form'
  const actions = document.createElement('div')
  actions.className = 'trevixal-dialog__actions'
  dialog.append(heading, body, actions)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onDismiss()
  }
  document.addEventListener('keydown', onKey, true)
  return {
    dialog,
    body,
    actions,
    button(label, primary = false) {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = primary
        ? 'trevixal-dialog__button trevixal-dialog__button--primary'
        : 'trevixal-dialog__button'
      element.textContent = label
      actions.appendChild(element)
      return element
    },
    close() {
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
    },
  }
}
