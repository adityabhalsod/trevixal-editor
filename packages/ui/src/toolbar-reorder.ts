/**
 * Rearranging toolbar groups by their grips, the way Office toolbars move.
 *
 * A pointer drag on a grip shows an insertion bar and moves the group where
 * it is released. From the keyboard, Space or Enter on a grip picks the group
 * up, the arrow keys move it, Enter drops it and Escape puts it back. The
 * order lives in the DOM, nothing here knows what a group holds, and
 * `onReorder` reports each change so a host can remember it.
 */

const GROUP = 'trevixal-toolbar__group'
const GRIP = 'trevixal-toolbar__grip'
/** Pointer travel before a press on a grip is a drag rather than a click. */
const DRAG_THRESHOLD = 4
/** Half the toolbar's gap: the insertion bar sits between two groups, not on one. */
const BAR_OFFSET = 2

export interface GroupReorderOptions {
  readonly onReorder?: (order: readonly string[]) => void
}

export interface GroupReorder {
  destroy(): void
}

/** A box as `getBoundingClientRect` reports it. */
export interface Box {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

/** Where a dragged group lands: before the group at `before`, or at the end. */
export interface DropTarget {
  readonly before: number | null
  /** The insertion bar, in the same coordinate space as the boxes. */
  readonly x: number
  readonly top: number
  readonly height: number
}

/** The toolbar's groups, in their current order. */
export function groupElements(root: HTMLElement): HTMLElement[] {
  return [...root.children].filter((child) => child.classList.contains(GROUP)) as HTMLElement[]
}

export function groupOrder(root: HTMLElement): readonly string[] {
  return groupElements(root).map((group) => group.dataset.trevixalGroup ?? '')
}

/**
 * Put the groups in `order`. Names it does not mention keep their relative
 * order after the ones it does, and names it mentions that are not present
 * are ignored, so a remembered order survives a group being added or removed.
 */
export function applyGroupOrder(root: HTMLElement, order: readonly string[]): void {
  const groups = groupElements(root)
  const last = groups[groups.length - 1]
  if (!last) return
  const anchor = last.nextSibling
  const named = new Map(groups.map((group) => [group.dataset.trevixalGroup ?? '', group]))
  const listed = order
    .map((name) => named.get(name))
    .filter((group): group is HTMLElement => group !== undefined)
  const rest = groups.filter((group) => !listed.includes(group))
  for (const group of [...listed, ...rest]) root.insertBefore(group, anchor)
}

/**
 * Where a group dragged to (x, y) should land, given every group's box in DOM
 * order and which one is being dragged. The row is chosen by y, then the slot
 * by x: before the first group in that row whose centre the pointer has not
 * passed, else after the row's last.
 */
export function dropTargetAt(
  boxes: readonly Box[],
  dragged: number,
  x: number,
  y: number,
): DropTarget | null {
  const others = boxes
    .map((box, index) => ({ box, index }))
    // A group hidden by toolbar customization measures as an empty box at the
    // origin. Left in, it wins "nearest row" for any pointer above the bar and
    // anchors the drop bar to a group that is not on screen.
    .filter(({ box, index }) => index !== dragged && box.right > box.left && box.bottom > box.top)
  if (others.length === 0) return null

  const containing = others.find(({ box }) => y >= box.top && y <= box.bottom)
  const nearest =
    containing ??
    others.reduce((best, entry) => (distance(entry.box, y) < distance(best.box, y) ? entry : best))
  // A row is every group whose top agrees with the nearest one's.
  const row = others
    .filter(({ box }) => Math.abs(box.top - nearest.box.top) < 1)
    .sort((a, b) => a.box.left - b.box.left)

  const slot = row.find(({ box }) => x < (box.left + box.right) / 2)
  if (slot) {
    return {
      before: slot.index,
      x: slot.box.left - BAR_OFFSET,
      top: slot.box.top,
      height: slot.box.bottom - slot.box.top,
    }
  }
  const last = row[row.length - 1]
  if (!last) return null
  // After the row's last group is before whatever follows it in DOM order,
  // the next row's first group, or nothing.
  const following = others.find(({ index }) => index > last.index)
  return {
    before: following?.index ?? null,
    x: last.box.right + BAR_OFFSET,
    top: last.box.top,
    height: last.box.bottom - last.box.top,
  }
}

function distance(box: Box, y: number): number {
  return y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0
}

/** Move `group` before `before` (or to the end). False when it is already there. */
function place(root: HTMLElement, group: HTMLElement, before: HTMLElement | null): boolean {
  const groups = groupElements(root)
  const last = groups[groups.length - 1]
  const target = before ?? last?.nextSibling ?? null
  if (target === group || group.nextSibling === target) return false
  root.insertBefore(group, target)
  return true
}

interface Press {
  readonly pointerId: number
  readonly grip: HTMLElement
  readonly group: HTMLElement
  readonly startX: number
  readonly startY: number
  dragging: boolean
  target: DropTarget | null
}

interface Grab {
  readonly grip: HTMLElement
  readonly group: HTMLElement
  /** The order at pick-up, restored by Escape. */
  readonly original: readonly HTMLElement[]
}

export function bindGroupReorder(
  root: HTMLElement,
  options: GroupReorderOptions = {},
): GroupReorder {
  const doc = root.ownerDocument

  // Announcements for the keyboard path: a live region present to screen
  // readers only.
  const live = doc.createElement('div')
  live.className = 'trevixal-toolbar__live'
  live.setAttribute('aria-live', 'polite')
  live.setAttribute('aria-atomic', 'true')
  root.appendChild(live)
  const announce = (message: string): void => {
    // Cleared first, so a repeated message is read again.
    live.textContent = ''
    live.textContent = message
  }

  const bar = doc.createElement('div')
  bar.className = 'trevixal-toolbar__drop'
  bar.hidden = true
  root.appendChild(bar)

  const labelOf = (group: HTMLElement): string =>
    group.dataset.trevixalGroupLabel ?? group.dataset.trevixalGroup ?? 'This'
  const positionOf = (group: HTMLElement): string => {
    const groups = groupElements(root)
    return `position ${groups.indexOf(group) + 1} of ${groups.length}`
  }
  const report = (): void => options.onReorder?.(groupOrder(root))

  // ---- pointer -----------------------------------------------------------------

  let press: Press | null = null

  const showBar = (target: DropTarget | null): void => {
    if (!target) {
      bar.hidden = true
      return
    }
    const origin = root.getBoundingClientRect()
    bar.style.left = `${target.x - origin.left - 1}px`
    bar.style.top = `${target.top - origin.top}px`
    bar.style.height = `${target.height}px`
    bar.hidden = false
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || press) return
    const grip = (event.target as Element | null)?.closest?.(`.${GRIP}`) as HTMLElement | null
    const group = grip?.closest(`.${GROUP}`) as HTMLElement | null
    if (!grip || !group || !root.contains(group)) return
    press = {
      pointerId: event.pointerId,
      grip,
      group,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      target: null,
    }
    // The editor keeps its selection: a grip is never a text target.
    event.preventDefault()
    try {
      grip.setPointerCapture(event.pointerId)
    } catch {
      // A synthetic event has no active pointer to capture; moves still reach
      // the toolbar while the pointer stays over it.
    }
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!press || event.pointerId !== press.pointerId) return
    if (!press.dragging) {
      if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) < DRAG_THRESHOLD) {
        return
      }
      press.dragging = true
      root.classList.add('trevixal-toolbar--reordering')
      press.group.classList.add(`${GROUP}--dragging`)
    }
    const groups = groupElements(root)
    press.target = dropTargetAt(
      groups.map((group) => group.getBoundingClientRect()),
      groups.indexOf(press.group),
      event.clientX,
      event.clientY,
    )
    showBar(press.target)
  }

  const endPress = (): Press | null => {
    const current = press
    press = null
    if (!current) return null
    root.classList.remove('trevixal-toolbar--reordering')
    current.group.classList.remove(`${GROUP}--dragging`)
    bar.hidden = true
    try {
      current.grip.releasePointerCapture(current.pointerId)
    } catch {
      // Nothing was captured.
    }
    return current
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (!press || event.pointerId !== press.pointerId) return
    const current = endPress()
    if (!current?.dragging || !current.target) return
    const groups = groupElements(root)
    const before = current.target.before === null ? null : (groups[current.target.before] ?? null)
    if (place(root, current.group, before)) report()
  }

  const onPointerCancel = (event: PointerEvent): void => {
    if (press && event.pointerId === press.pointerId) endPress()
  }

  // ---- keyboard ------------------------------------------------------------------

  let grab: Grab | null = null
  /** Set while this module moves the focused grip, so its blur is not a departure. */
  let moving = false

  const setGrabbed = (current: Grab, on: boolean): void => {
    current.grip.setAttribute('aria-pressed', String(on))
    current.group.classList.toggle(`${GROUP}--grabbed`, on)
  }

  const pickUp = (grip: HTMLElement, group: HTMLElement): void => {
    grab = { grip, group, original: groupElements(root) }
    setGrabbed(grab, true)
    const hint = 'Use the arrow keys to move it, Enter to drop it, Escape to cancel.'
    announce(`${labelOf(group)} group grabbed, ${positionOf(group)}. ${hint}`)
  }

  /** Re-insert `group` and keep focus on its grip through the move. */
  const relocate = (group: HTMLElement, before: Node | null, grip: HTMLElement): void => {
    moving = true
    root.insertBefore(group, before)
    grip.focus()
    moving = false
  }

  const moveGrabbed = (to: number): void => {
    if (!grab) return
    const groups = groupElements(root)
    const from = groups.indexOf(grab.group)
    const index = Math.max(0, Math.min(groups.length - 1, to))
    if (index === from) {
      announce(`${labelOf(grab.group)} group is already ${index === 0 ? 'first' : 'last'}.`)
      return
    }
    const anchor = index > from ? (groups[index]?.nextSibling ?? null) : (groups[index] ?? null)
    relocate(grab.group, anchor, grab.grip)
    announce(`${labelOf(grab.group)} group, ${positionOf(grab.group)}.`)
  }

  const drop = (): void => {
    if (!grab) return
    const current = grab
    grab = null
    setGrabbed(current, false)
    const changed = groupElements(root).some((group, index) => group !== current.original[index])
    announce(`${labelOf(current.group)} group dropped, ${positionOf(current.group)}.`)
    if (changed) report()
  }

  const cancel = (): void => {
    if (!grab) return
    const current = grab
    grab = null
    setGrabbed(current, false)
    const groups = groupElements(root)
    const anchor = groups[groups.length - 1]?.nextSibling ?? null
    moving = true
    for (const group of current.original) root.insertBefore(group, anchor)
    current.grip.focus()
    moving = false
    announce(
      `Move cancelled. ${labelOf(current.group)} group is back at ${positionOf(current.group)}.`,
    )
  }

  const onGripKeyDown = (event: KeyboardEvent): void => {
    const grip = event.currentTarget as HTMLElement
    const group = grip.closest(`.${GROUP}`) as HTMLElement | null
    if (!group) return
    if (!grab) {
      if (event.key !== ' ' && event.key !== 'Enter') return
      pickUp(grip, group)
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (grab.group !== group) return
    const at = groupElements(root).indexOf(group)
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        moveGrabbed(at - 1)
        break
      case 'ArrowRight':
      case 'ArrowDown':
        moveGrabbed(at + 1)
        break
      case 'Home':
        moveGrabbed(0)
        break
      case 'End':
        moveGrabbed(Number.MAX_SAFE_INTEGER)
        break
      case 'Enter':
      case ' ':
        drop()
        break
      case 'Escape':
        cancel()
        break
      default:
        return
    }
    // Handled here, so the toolbar's own arrow-key navigation stays out of it.
    event.preventDefault()
    event.stopPropagation()
  }

  const onGripBlur = (): void => {
    // Leaving the grip mid-move keeps the order as it stands rather than
    // silently undoing it; only Escape puts things back.
    if (!moving && grab) drop()
  }

  const grips = [...root.querySelectorAll<HTMLElement>(`.${GRIP}`)]
  for (const grip of grips) {
    grip.addEventListener('keydown', onGripKeyDown)
    grip.addEventListener('blur', onGripBlur)
  }
  root.addEventListener('pointerdown', onPointerDown)
  root.addEventListener('pointermove', onPointerMove)
  root.addEventListener('pointerup', onPointerUp)
  root.addEventListener('pointercancel', onPointerCancel)

  return {
    destroy() {
      endPress()
      if (grab) {
        setGrabbed(grab, false)
        grab = null
      }
      for (const grip of grips) {
        grip.removeEventListener('keydown', onGripKeyDown)
        grip.removeEventListener('blur', onGripBlur)
      }
      root.removeEventListener('pointerdown', onPointerDown)
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerup', onPointerUp)
      root.removeEventListener('pointercancel', onPointerCancel)
      live.remove()
      bar.remove()
    },
  }
}
