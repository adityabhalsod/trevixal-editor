/**
 * Document restrictions: stop copy, cut, paste, printing and the context menu
 * on the editing surface. These are guard rails against casual leakage, not
 * DRM: a determined reader can always photograph the screen, so the aim is
 * to make the blocked action fail visibly (via `onBlocked`) rather than
 * silently.
 */

import type { Editor } from '@trevixal/core'

/** Which actions are blocked (`true` = blocked). Absent means allowed. */
export interface DocumentRestrictions {
  readonly copy?: boolean
  readonly cut?: boolean
  readonly paste?: boolean
  readonly print?: boolean
  /** Read by the host UI's download / export menu via {@link restrictionsAllow}; no DOM behaviour. */
  readonly download?: boolean
  readonly contextMenu?: boolean
}

export type RestrictedAction = keyof DocumentRestrictions

export interface ApplyRestrictionsOptions {
  /** Called each time a blocked action is attempted, show a toast, log an audit event. */
  readonly onBlocked?: (action: RestrictedAction) => void
}

/** Marks the injected print stylesheet so it can be found and removed. */
export const PRINT_GUARD_ATTRIBUTE = 'data-trevixal-print-guard'
/** Hides the document and editor chrome from the printed page and from "Save as PDF". */
export const PRINT_GUARD_CSS =
  '@media print { .trevixal-content, .trevixal-ui { display: none !important } }'

/** True when the action is not blocked, the single check every menu item and shortcut should make. */
export function restrictionsAllow(
  restrictions: DocumentRestrictions | null | undefined,
  action: RestrictedAction,
): boolean {
  return !(restrictions?.[action] ?? false)
}

function isPrintShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'p'
}

/**
 * Enforce restrictions on a mounted editor. Listeners are registered in the
 * capture phase on the editing surface so they run before the view's own
 * clipboard handlers and before anything the host attached; a blocked event
 * is cancelled and stopped immediately. Returns a disposer that undoes every
 * change. A headless editor has no surface to guard, so only the flags apply.
 */
export function applyRestrictions(
  editor: Editor,
  restrictions: DocumentRestrictions,
  options: ApplyRestrictionsOptions = {},
): () => void {
  const view = editor.view
  if (!view) return () => {}
  const dom = view.dom
  const ownerDocument = dom.ownerDocument
  const disposers: (() => void)[] = []

  const blocked = (action: RestrictedAction, event: Event): void => {
    event.preventDefault()
    event.stopImmediatePropagation()
    options.onBlocked?.(action)
  }
  const guard = (
    target: EventTarget,
    type: string,
    action: RestrictedAction,
    matches: (event: Event) => boolean = () => true,
  ): void => {
    const listener = (event: Event): void => {
      if (matches(event)) blocked(action, event)
    }
    target.addEventListener(type, listener, true)
    disposers.push(() => target.removeEventListener(type, listener, true))
  }

  if (restrictions.copy) {
    guard(dom, 'copy', 'copy')
    // Dragging a selection out of the editor is a copy by another route.
    guard(dom, 'dragstart', 'copy')
  }
  if (restrictions.cut) guard(dom, 'cut', 'cut')
  if (restrictions.paste) {
    guard(dom, 'paste', 'paste')
    // Dropping text into the editor is a paste by another route.
    guard(dom, 'drop', 'paste')
  }
  if (restrictions.contextMenu) guard(dom, 'contextmenu', 'contextMenu')
  if (restrictions.print) {
    const style = ownerDocument.createElement('style')
    style.setAttribute(PRINT_GUARD_ATTRIBUTE, '')
    style.textContent = PRINT_GUARD_CSS
    ownerDocument.head.appendChild(style)
    disposers.push(() => style.remove())
    // Ctrl/Cmd+P from inside the editor never reaches the browser.
    guard(dom, 'keydown', 'print', (event) => isPrintShortcut(event as KeyboardEvent))
    // Printing started elsewhere (menu, another shortcut) cannot be cancelled, but the
    // stylesheet blanks the output; report it so the host can explain the empty page.
    const win = ownerDocument.defaultView
    if (win) {
      const onBeforePrint = (): void => options.onBlocked?.('print')
      win.addEventListener('beforeprint', onBeforePrint)
      disposers.push(() => win.removeEventListener('beforeprint', onBeforePrint))
    }
  }

  return () => {
    for (const dispose of disposers) dispose()
    disposers.length = 0
  }
}
