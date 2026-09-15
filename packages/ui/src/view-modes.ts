import { type Editor, type EditorNode, inlineLength, textblocks } from '@trevixal/core'

/** Class applied to the fullscreen target when the native API is unavailable. */
const FALLBACK_CLASS = 'trevixal-fullscreen'
/** The decoration layer focus mode owns. */
const FOCUS_LAYER = 'focus-mode'

// ---------------------------------------------------------------- fullscreen

export interface FullscreenToggleOptions {
  /**
   * The element that goes fullscreen: usually the wrapper around the chrome
   * and the content. Defaults to the view's parent.
   */
  readonly target?: HTMLElement
  /**
   * Where the button is appended. Omit to build the button without mounting
   * it, and place `toggle.element` yourself.
   */
  readonly container?: HTMLElement
  readonly label?: string
  /** Called after every state change, with the new state. */
  readonly onChange?: (fullscreen: boolean) => void
}

export interface FullscreenToggle {
  readonly element: HTMLButtonElement
  readonly isFullscreen: boolean
  /** Enter fullscreen. Resolves false when neither route worked. */
  enter(): Promise<boolean>
  exit(): Promise<void>
  toggle(): Promise<boolean>
  destroy(): void
}

/**
 * A fullscreen toggle over the Fullscreen API, with a CSS-class fallback.
 *
 * `requestFullscreen` rejects whenever the call is not tied to a user gesture,
 * and is missing outright in some embedded views and in test environments, so
 * the rejection is treated as a normal outcome, not an error: the target gets
 * a fixed-position class instead, and the button keeps working. That means the
 * caller never has to know which route is in play.
 */
export function createFullscreenToggle(
  editor: Editor,
  options: FullscreenToggleOptions = {},
): FullscreenToggle {
  const view = editor.view
  const target = options.target ?? (view?.dom.parentElement as HTMLElement | undefined)
  if (!target) throw new Error('createFullscreenToggle: no target element')
  const doc = target.ownerDocument

  const button = doc.createElement('button')
  button.type = 'button'
  button.className = 'trevixal-viewmode__button'
  button.dataset.trevixalViewmode = 'fullscreen'
  button.setAttribute('aria-pressed', 'false')
  const label = options.label ?? 'Fullscreen'
  button.title = label
  button.setAttribute('aria-label', label)
  button.textContent = label
  button.addEventListener('mousedown', (event) => event.preventDefault())

  /** True while either route has us fullscreen. */
  const isOn = (): boolean =>
    doc.fullscreenElement === target || target.classList.contains(FALLBACK_CLASS)

  const sync = (): void => {
    const on = isOn()
    button.setAttribute('aria-pressed', String(on))
    target.classList.toggle('trevixal-viewmode--fullscreen', on)
    options.onChange?.(on)
  }

  const useFallback = (): void => {
    target.classList.add(FALLBACK_CLASS)
    sync()
  }

  const enter = async (): Promise<boolean> => {
    if (isOn()) return true
    const request = (target as HTMLElement & { requestFullscreen?: () => Promise<void> })
      .requestFullscreen
    if (typeof request !== 'function') {
      useFallback()
      return true
    }
    try {
      await request.call(target)
      sync()
      return true
    } catch {
      // Rejected: most often "not called from a user gesture", sometimes a
      // permissions policy. Either way the fallback still gives the user the
      // distraction-free view they asked for.
      useFallback()
      return true
    }
  }

  const exit = async (): Promise<void> => {
    target.classList.remove(FALLBACK_CLASS)
    if (doc.fullscreenElement === target && typeof doc.exitFullscreen === 'function') {
      try {
        await doc.exitFullscreen()
      } catch {
        // Already out, or the document lost the permission; the class is gone
        // either way, so the view is correct.
      }
    }
    sync()
  }

  const toggle = async (): Promise<boolean> => {
    if (isOn()) {
      await exit()
      return false
    }
    return enter()
  }

  const onClick = (): void => {
    void toggle()
  }
  button.addEventListener('click', onClick)

  // The user can leave native fullscreen with Escape, which fires no click.
  const onFullscreenChange = (): void => sync()
  doc.addEventListener('fullscreenchange', onFullscreenChange)

  options.container?.appendChild(button)
  sync()

  return {
    element: button,
    get isFullscreen() {
      return isOn()
    },
    enter,
    exit,
    toggle,
    destroy() {
      button.removeEventListener('click', onClick)
      doc.removeEventListener('fullscreenchange', onFullscreenChange)
      target.classList.remove(FALLBACK_CLASS, 'trevixal-viewmode--fullscreen')
      button.remove()
    },
  }
}

// --------------------------------------------------------------- focus mode

export interface FocusModeOptions {
  /** Start with focus mode on (default false). */
  readonly active?: boolean
  /**
   * Dim whole paragraphs (`'block'`, the default) or only the sentence around
   * the caret is out of scope here, blocks are what the model exposes.
   */
  readonly onChange?: (active: boolean) => void
}

export interface FocusMode {
  readonly isActive: boolean
  enable(): void
  disable(): void
  toggle(): boolean
  destroy(): void
}

/**
 * Typewriter-style focus mode: every block except the one holding the caret is
 * dimmed.
 *
 * The dimming is a decoration, not a document change or an inline style on the
 * rendered node, so it survives re-renders, composes with search highlighting
 * and code tokens through the layer system, and leaves nothing behind in the
 * saved document.
 */
export function createFocusMode(editor: Editor, options: FocusModeOptions = {}): FocusMode {
  let active = options.active === true

  const paint = (): void => {
    const view = editor.view
    if (!view) return
    if (!active) {
      view.setDecorationLayer(FOCUS_LAYER, null)
      return
    }
    const focused = editor.state.selection.to.path.join('.')
    // Decorations are inline ranges, so "dim this block" is expressed as one
    // range covering the block's whole inline content.
    const dimmed = new Map<EditorNode, { from: number; to: number; className: string }[]>()
    for (const { path, node } of textblocks(editor.state.doc)) {
      if (path.join('.') === focused) continue
      const length = inlineLength(node.content)
      if (length === 0) continue
      dimmed.set(node, [{ from: 0, to: length, className: 'trevixal-focus-dimmed' }])
    }
    view.setDecorationLayer(FOCUS_LAYER, (node) => dimmed.get(node) ?? null)
  }

  const setBodyClass = (): void => {
    // Empty blocks carry no inline range to decorate, so the class on the
    // surface lets CSS dim them too.
    editor.view?.dom.classList.toggle('trevixal-content--focus-mode', active)
  }

  const offTransaction = editor.on('transaction', paint)
  const offSelection = editor.on('selectionUpdate', paint)

  setBodyClass()
  paint()

  return {
    get isActive() {
      return active
    },
    enable() {
      if (active) return
      active = true
      setBodyClass()
      paint()
      options.onChange?.(true)
    },
    disable() {
      if (!active) return
      active = false
      setBodyClass()
      paint()
      options.onChange?.(false)
    },
    toggle() {
      if (active) this.disable()
      else this.enable()
      return active
    },
    destroy() {
      offTransaction()
      offSelection()
      editor.view?.setDecorationLayer(FOCUS_LAYER, null)
      editor.view?.dom.classList.remove('trevixal-content--focus-mode')
    },
  }
}

// -------------------------------------------------------------- editor width

/** Named content widths, matching the choices writing apps usually offer. */
export const EDITOR_WIDTHS = {
  narrow: '38rem',
  normal: '48rem',
  wide: '64rem',
  full: '100%',
} as const

export type EditorWidth = keyof typeof EDITOR_WIDTHS | (string & {})

/**
 * Set the content column's width.
 *
 * Named presets map to a token-free length; anything else is passed through as
 * a CSS length, so a host with its own measure can supply `'72ch'`. The value
 * lands on a custom property rather than `style.width`, so the stylesheet
 * decides how the measure is applied (margins, padding, print overrides).
 */
export function setEditorWidth(element: HTMLElement, width: EditorWidth): void {
  const preset = (EDITOR_WIDTHS as Record<string, string | undefined>)[width]
  const value = preset ?? width
  // Reject anything that is not a plain length-ish token: this value goes into
  // a custom property that CSS will evaluate.
  if (!/^[\w.%-]+$/.test(value)) return
  element.style.setProperty('--tvx-editor-width', value)
  element.dataset.trevixalWidth = preset ? String(width) : 'custom'
}

// -------------------------------------------------------------- typewriter

export interface TypewriterOptions {
  /**
   * Where the caret's line is held, as a fraction of the scrolling area's
   * height. 0.5 is dead centre; 0.4 sits it slightly above, which most
   * people find easier to read from.
   */
  readonly anchor?: number
  /** The scrolling element; the window by default. */
  readonly scroller?: HTMLElement
  readonly active?: boolean
}

export interface Typewriter {
  readonly isActive: boolean
  enable(): void
  disable(): void
  toggle(): boolean
  /** Recentre now, without waiting for the next keystroke. */
  center(): void
  destroy(): void
}

/**
 * Typewriter scrolling: the line being edited stays put and the document
 * moves under it, the way a typewriter's platen does.
 *
 * It only ever scrolls: the caret and the document are untouched, and it
 * moves nothing when the line is already close to where it belongs, so
 * ordinary typing does not jitter the page.
 */
export function createTypewriter(editor: Editor, options: TypewriterOptions = {}): Typewriter {
  let active = options.active === true
  const anchor = options.anchor ?? 0.4
  const view = editor.view
  const doc = view?.dom.ownerDocument
  const win = doc?.defaultView

  const caretTop = (): number | null => {
    if (!view || !doc || !win) return null
    const selection = doc.getSelection?.()
    if (!selection || selection.rangeCount === 0) return null
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    // A collapsed caret in an empty block can measure zero; fall back to the
    // block element, which always has a box.
    if (rect.height > 0 || rect.top !== 0) return rect.top
    const node = selection.anchorNode
    const element = node?.nodeType === 1 ? (node as HTMLElement) : node?.parentElement
    return element?.getBoundingClientRect().top ?? null
  }

  const center = (): void => {
    if (!active || !win) return
    const top = caretTop()
    if (top === null) return
    const scroller = options.scroller
    const height = scroller ? scroller.clientHeight : win.innerHeight
    // `top` is in viewport coordinates, so the anchor line has to be too: a
    // scroller that does not start at the top of the window would otherwise
    // be off by its own offset, and typing would scroll the wrong way.
    const origin = scroller ? scroller.getBoundingClientRect().top : 0
    const target = origin + height * anchor
    const delta = top - target
    // A dead band: without it every keystroke nudges the page by a pixel or
    // two, which reads as the document shivering.
    if (Math.abs(delta) < 12) return
    // Not every engine hosting the editor gives its window a scroller.
    if (scroller) scroller.scrollBy({ top: delta, behavior: 'auto' })
    else win.scrollBy?.({ top: delta, behavior: 'auto' })
  }

  const offSelection = editor.on('selectionUpdate', center)
  const offTransaction = editor.on('transaction', center)
  if (active) center()

  return {
    get isActive() {
      return active
    },
    enable() {
      active = true
      center()
    },
    disable() {
      active = false
    },
    toggle() {
      active = !active
      if (active) center()
      return active
    },
    center,
    destroy() {
      offSelection()
      offTransaction()
    },
  }
}
