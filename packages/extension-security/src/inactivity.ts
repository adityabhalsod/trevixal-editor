/** What counts as someone at the keyboard: typing, pointing, scrolling, touching. */
const ACTIVITY_EVENTS = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'] as const

/**
 * Call `onIdle` once nothing has happened in the page for `idleMs`: no key,
 * no pointer, no scroll. Each sign of activity starts the wait again, and
 * after `onIdle` the next one starts it too, so a lock screen left alone
 * reports again rather than going quiet. Returns a disposer.
 */
export function watchInactivity(
  document: Document,
  idleMs: number,
  onIdle: () => void,
): () => void {
  if (!Number.isFinite(idleMs) || idleMs <= 0) {
    throw new RangeError(`watchInactivity: idleMs must be a positive number, got ${idleMs}`)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const restart = (): void => {
    clearTimeout(timer)
    timer = setTimeout(onIdle, idleMs)
  }
  for (const type of ACTIVITY_EVENTS) {
    document.addEventListener(type, restart, { capture: true, passive: true })
  }
  restart()
  return () => {
    clearTimeout(timer)
    for (const type of ACTIVITY_EVENTS) document.removeEventListener(type, restart, true)
  }
}
