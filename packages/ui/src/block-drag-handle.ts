import {
  type Announcer,
  type Editor,
  MoveNodeStep,
  createAnnouncer,
  editorDocument,
} from '@trevixal/core'
import { createBlockMenu } from './block-menu'
import { createIcon } from './icons'

/**
 * A grip beside the block under the pointer, for dragging it somewhere else.
 *
 * The move goes through `MoveNodeStep`, so the block keeps its identity: a
 * caret, a decoration or an upload in flight inside it survives the move
 * rather than being restored afterwards.
 *
 * Dragging is not the only way in. The grip is a real button: Space picks the
 * block up, the arrow keys move it, Enter drops it and Escape puts it back.
 * The same contract the toolbar's group grips use, announced the same way,
 * because a reordering gesture only available to a mouse is not available at
 * all to a good many people.
 *
 * Clicked rather than dragged, the grip opens the block menu (turn into,
 * duplicate, move, copy a link, delete); Shift+F10 or the menu key opens it
 * from the keyboard.
 */

/** How far past the grip, in px, a pointer may overshoot on its way to it. */
const MARGIN_SLACK = 12

/**
 * How far, in em, a list's fold chevrons reach out past the list's own edge
 * (`--tvx-fold-gutter` in the stylesheet): the grip goes beyond them, or it
 * covers the chevron of the list's first item and takes its clicks.
 */
const FOLD_CHEVRON_REACH_EM = 0.8

export interface BlockDragHandleOptions {
  /**
   * Where the grip and the drop indicator are appended. Must be a positioned
   * ancestor of the editing surface, or share its offset parent. Defaults to
   * the surface's own parent.
   */
  readonly container?: HTMLElement
  /** Distance from the block's left edge to the grip, in px. Defaults to 6. */
  readonly gap?: number
  /**
   * Announce each keyboard step. Defaults to a live region of its own; pass
   * one in to share the host's.
   */
  readonly announcer?: Announcer
}

export interface BlockDragHandle {
  readonly element: HTMLElement
  /** Hide the grip and abandon any move in progress. */
  reset(): void
  destroy(): void
}

export function createBlockDragHandle(
  editor: Editor,
  options: BlockDragHandleOptions = {},
): BlockDragHandle {
  const view = editor.view
  const doc = editorDocument(editor, options.container, 'createBlockDragHandle')
  const host = options.container ?? (view?.dom.parentElement as HTMLElement)
  const gap = options.gap ?? 6
  const announcer = options.announcer ?? createAnnouncer(doc, { container: host })
  const ownsAnnouncer = !options.announcer

  const grip = doc.createElement('button')
  grip.type = 'button'
  grip.className = 'trevixal-blockgrip'
  grip.dataset.trevixalItem = 'blockGrip'
  grip.title = 'Drag to move this block, or click for its menu'
  grip.setAttribute('aria-label', 'Move this block')
  grip.setAttribute('aria-haspopup', 'menu')
  grip.hidden = true
  const glyph = createIcon(doc, 'grip')
  if (glyph) grip.appendChild(glyph)

  const indicator = doc.createElement('div')
  indicator.className = 'trevixal-blockgrip__drop'
  indicator.hidden = true

  host.append(grip, indicator)
  const menu = createBlockMenu(editor, { container: host, announcer })

  /** The index of the top-level block the grip currently belongs to. */
  let hovered: number | null = null
  /** The index being moved, once a move has started. */
  let carrying: number | null = null
  /** Where a press on the grip began, to tell a click from a drag. */
  let pressedAt: number | null = null

  const blocks = (): HTMLElement[] => {
    const surface = editor.view?.dom
    if (!surface) return []
    const renderer = editor.view?.renderer
    return [...surface.children].filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && renderer?.modelOf.get(child) !== undefined,
    )
  }

  const place = (index: number): void => {
    const element = blocks()[index]
    if (!element) {
      grip.hidden = true
      return
    }
    const box = element.getBoundingClientRect()
    const hostBox = host.getBoundingClientRect()
    grip.hidden = false
    // Beside where the block's lines start: its right edge in right-to-left text.
    const style = doc.defaultView?.getComputedStyle(element)
    const rtl = style?.direction === 'rtl'
    const clearance = element.matches('ul, ol')
      ? FOLD_CHEVRON_REACH_EM * Number.parseFloat(style?.fontSize ?? '16')
      : 0
    const x = rtl ? box.right + gap + clearance : box.left - grip.offsetWidth - gap - clearance
    grip.style.left = `${x - hostBox.left - host.clientLeft + host.scrollLeft}px`
    grip.style.top = `${box.top - hostBox.top - host.clientTop + host.scrollTop}px`
  }

  /** Show the line where a drop would land: before block `at`. */
  const showDrop = (at: number): void => {
    const list = blocks()
    const before = list[at]
    const last = list[list.length - 1]
    const anchor = before ?? last
    if (!anchor) return
    const box = anchor.getBoundingClientRect()
    const hostBox = host.getBoundingClientRect()
    indicator.hidden = false
    indicator.style.left = `${box.left - hostBox.left - host.clientLeft + host.scrollLeft}px`
    indicator.style.width = `${box.width}px`
    const edge = before ? box.top : box.bottom
    indicator.style.top = `${edge - hostBox.top - host.clientTop + host.scrollTop}px`
  }

  /** The gap nearest a vertical position: 0..count, "before block n". */
  const gapNear = (clientY: number): number => {
    const list = blocks()
    for (let index = 0; index < list.length; index++) {
      const box = (list[index] as HTMLElement).getBoundingClientRect()
      if (clientY < box.top + box.height / 2) return index
    }
    return list.length
  }

  /**
   * Splice target for a drop in gap `g`. Removing the carried block first
   * shifts every gap after it down by one. The classic off-by-one that puts
   * a block one place short of where it was dropped.
   */
  const targetFor = (from: number, g: number): number => (g > from ? g - 1 : g)

  const finish = (from: number, to: number): void => {
    indicator.hidden = true
    carrying = null
    grip.removeAttribute('aria-pressed')
    if (from === to) return
    editor.dispatch(editor.state.tr.step(new MoveNodeStep([], from, to)))
    announcer.announce(`Block moved to position ${to + 1}`)
    hovered = to
    place(to)
  }

  // ------------------------------------------------------------- pointer

  /**
   * Whether the pointer is over the text or the margin beside it, where the
   * grip hangs. The grip sits at a block's first line, so a hand heading for
   * it from lower down the block crosses that margin first: leaving the
   * surface there is on the way to the grip, not away from the editor.
   */
  const nearSurface = (event: PointerEvent): boolean => {
    const surface = editor.view?.dom
    if (!surface) return false
    const target = event.target
    if (target instanceof Node && (surface.contains(target) || grip.contains(target))) return true
    const box = surface.getBoundingClientRect()
    const reach = grip.offsetWidth + gap + MARGIN_SLACK
    const rtl = doc.defaultView?.getComputedStyle(surface).direction === 'rtl'
    const left = rtl ? box.left : box.left - reach
    const right = rtl ? box.right + reach : box.right
    return (
      event.clientX >= left &&
      event.clientX <= right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom
    )
  }

  /** A press on the grip that ended where the grip never heard it end: put the block back. */
  const dropPress = (): void => {
    if (pressedAt === null) return
    pressedAt = null
    indicator.hidden = true
    carrying = null
    grip.removeAttribute('aria-pressed')
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (carrying !== null) {
      // No button down while a press is carrying: it came up over a frame,
      // which Firefox does not report to the grip.
      if (event.buttons === 0) dropPress()
      return
    }
    if (!editor.isEditable) return
    if (!nearSurface(event)) {
      grip.hidden = true
      return
    }
    const list = blocks()
    const index = list.findIndex((element) => {
      const box = element.getBoundingClientRect()
      return event.clientY >= box.top && event.clientY <= box.bottom
    })
    if (index < 0) return
    hovered = index
    place(index)
  }

  const onGripDown = (event: PointerEvent): void => {
    if (hovered === null) return
    event.preventDefault()
    menu.close()
    pressedAt = event.clientY
    carrying = hovered
    grip.setAttribute('aria-pressed', 'true')
    grip.setPointerCapture(event.pointerId)
    showDrop(carrying)
  }

  const onGripMove = (event: PointerEvent): void => {
    if (carrying === null) return
    showDrop(gapNear(event.clientY))
  }

  /** Pointer travel under which a press is a click, in px. */
  const CLICK_SLOP = 4

  const onGripUp = (event: PointerEvent): void => {
    if (carrying === null) return
    const from = carrying
    const clicked = pressedAt !== null && Math.abs(event.clientY - pressedAt) < CLICK_SLOP
    pressedAt = null
    finish(from, clicked ? from : targetFor(from, gapNear(event.clientY)))
    if (clicked) menu.open(from, grip)
  }

  // ------------------------------------------------------------ keyboard

  const onGripKey = (event: KeyboardEvent): void => {
    const count = blocks().length
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault()
      if (hovered !== null && carrying === null) menu.open(hovered, grip)
      return
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (carrying === null) {
        if (hovered === null) return
        carrying = hovered
        grip.setAttribute('aria-pressed', 'true')
        showDrop(carrying)
        announcer.announce(`Block ${carrying + 1} of ${count} picked up. Use the arrow keys.`)
      } else {
        const at = carrying
        finish(at, at)
        announcer.announce('Dropped')
      }
      return
    }
    if (event.key === 'Escape' && carrying !== null) {
      event.preventDefault()
      indicator.hidden = true
      carrying = null
      grip.removeAttribute('aria-pressed')
      announcer.announce('Move cancelled')
      return
    }
    if (carrying === null) return
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const to = event.key === 'ArrowUp' ? carrying - 1 : carrying + 1
    if (to < 0 || to >= count) return
    // Applied a step at a time, so each press is its own undo and the reader
    // is told where the block now is rather than where it will be.
    editor.dispatch(editor.state.tr.step(new MoveNodeStep([], carrying, to)))
    carrying = to
    hovered = to
    place(to)
    showDrop(to)
    announcer.announce(`Position ${to + 1} of ${count}`)
  }

  doc.addEventListener('pointermove', onPointerMove)
  grip.addEventListener('pointerdown', onGripDown)
  grip.addEventListener('pointermove', onGripMove)
  grip.addEventListener('pointerup', onGripUp)
  // A press the browser takes back (a touch that turned into a scroll) or
  // whose capture it drops ends without a pointerup.
  grip.addEventListener('pointercancel', dropPress)
  grip.addEventListener('lostpointercapture', dropPress)
  grip.addEventListener('keydown', onGripKey)

  return {
    element: grip,
    reset() {
      menu.close()
      indicator.hidden = true
      carrying = null
      hovered = null
      grip.hidden = true
      grip.removeAttribute('aria-pressed')
    },
    destroy() {
      doc.removeEventListener('pointermove', onPointerMove)
      menu.destroy()
      grip.remove()
      indicator.remove()
      if (ownsAnnouncer) announcer.destroy()
    },
  }
}
