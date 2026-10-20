/** How much of the screen's bottom an on-screen keyboard covers, in px, on the chrome's root. */
export const KEYBOARD_INSET_PROPERTY = '--tvx-keyboard-inset'

/**
 * Keep `--tvx-keyboard-inset` on `target` at the height an on-screen
 * keyboard takes from the bottom of the screen, 0px without one. The
 * stylesheet parks the phone toolbar on top of it, so the bar rides above
 * the keyboard rather than under it. Returns a disposer.
 */
export function trackVirtualKeyboard(target: HTMLElement): () => void {
  const view = target.ownerDocument.defaultView
  const viewport = view?.visualViewport
  if (!view || !viewport) return () => {}
  const update = (): void => {
    const covered = view.innerHeight - viewport.height - viewport.offsetTop
    target.style.setProperty(KEYBOARD_INSET_PROPERTY, `${Math.max(0, Math.round(covered))}px`)
  }
  update()
  viewport.addEventListener('resize', update)
  viewport.addEventListener('scroll', update)
  return () => {
    viewport.removeEventListener('resize', update)
    viewport.removeEventListener('scroll', update)
    target.style.removeProperty(KEYBOARD_INSET_PROPERTY)
  }
}
