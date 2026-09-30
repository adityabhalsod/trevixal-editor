/** One line of a report: what was found, and how to get to it. */
export interface Finding {
  readonly heading: string
  readonly message: string
  /** Take the reader to it; the dialog closes first. */
  readonly go?: () => void
}

export interface FindingsReport {
  readonly title: string
  /** What the dialog says when there is nothing to report. */
  readonly empty: string
  readonly findings: readonly Finding[]
  /** Buttons beside Close, a download of the report, say; each closes the dialog first. */
  readonly actions?: readonly { readonly label: string; readonly run: () => void }[]
}

/**
 * A modal list of findings, each with a Go to button, in the kit's dialog
 * look (see `@trevixal/ui`'s `openDialog`). Escape or Close dismisses it.
 * Resolves once it is closed.
 */
export function openFindingsReport(document: Document, report: FindingsReport): Promise<void> {
  const element = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text = '',
  ): HTMLElementTagNameMap[K] => {
    const created = document.createElement(tag)
    created.className = className
    created.textContent = text
    return created
  }
  const overlay = element('div', 'trevixal-dialog-overlay')
  const dialog = element('div', 'trevixal-dialog trevixal-findings')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', report.title)
  const count = report.findings.length
  const summary =
    count === 0
      ? report.empty
      : count === 1
        ? 'One thing to look at.'
        : `${count} things to look at.`
  dialog.append(
    element('h2', 'trevixal-dialog__title', report.title),
    element('p', 'trevixal-dialog__body', summary),
  )
  const list = element('ul', 'trevixal-findings__list')
  const actions = element('div', 'trevixal-dialog__actions')
  const close = element(
    'button',
    'trevixal-dialog__button trevixal-dialog__button--primary',
    'Close',
  )
  close.type = 'button'
  const extra = (report.actions ?? []).map((action) => {
    const button = element('button', 'trevixal-dialog__button', action.label)
    button.type = 'button'
    return { button, action }
  })
  actions.append(...extra.map((entry) => entry.button), close)

  return new Promise((resolve) => {
    const finish = (): void => {
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
      resolve()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      finish()
    }
    for (const finding of report.findings) {
      const item = element('li', 'trevixal-findings__item')
      item.append(
        element('strong', 'trevixal-findings__heading', finding.heading),
        element('span', 'trevixal-findings__message', finding.message),
      )
      if (finding.go) {
        const go = element('button', 'trevixal-dialog__button', 'Go to')
        go.type = 'button'
        go.addEventListener('click', () => {
          finish()
          finding.go?.()
        })
        item.append(go)
      }
      list.append(item)
    }
    if (count > 0) dialog.append(list)
    dialog.append(actions)
    overlay.append(dialog)
    document.body.append(overlay)
    close.addEventListener('click', finish)
    for (const { button, action } of extra) {
      button.addEventListener('click', () => {
        finish()
        action.run()
      })
    }
    document.addEventListener('keydown', onKey, true)
    close.focus()
  })
}
