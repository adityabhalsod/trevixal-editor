/**
 * Set to `reduced` on an ancestor to ask for no motion inside it, as the
 * operating system's reduced-motion setting does for the whole page.
 */
export const MOTION_ATTRIBUTE = 'data-trevixal-motion'

/**
 * How to scroll to something: at once when motion is reduced, by the
 * editor's switch or the operating system's, and smoothly otherwise. CSS
 * cannot reach a script's own `scrollIntoView`, so every smooth scroll asks.
 */
export function scrollBehavior(element: Element): ScrollBehavior {
  if (element.closest(`[${MOTION_ATTRIBUTE}="reduced"]`)) return 'auto'
  const view = element.ownerDocument.defaultView
  return view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}
