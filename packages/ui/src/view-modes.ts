import { type Editor, type EditorNode, inlineLength, textblocks } from '@trevixal/core'

/** Makes the fullscreen target cover the window, on either route there. */
const COVER_CLASS = 'trevixal-fullscreen'
/** How long the "press Esc" hint stays up when the browser shows none of its own. */
const HINT_MS = 3000
/** The decoration layer focus mode owns. */
const FOCUS_LAYER = 'focus-mode'

// ---------------------------------------------------------------- fullscreen

export interface FullscreenToggleOptions {
  /**
   * The element that fills the screen: usually the wrapper around the chrome
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
  /** Enter fullscreen. Resolves true once the target covers the window. */
  enter(): Promise<boolean>
  exit(): Promise<void>
  toggle(): Promise<boolean>
  destroy(): void
}

/**
 * A fullscreen toggle: the target covers the window, and the Fullscreen API
 * takes the page to the whole screen underneath it.
 *
 * The page goes fullscreen rather than the target, because the browser draws
 * nothing outside the fullscreen element, and the palette, the slash menu and
 * every dialog are appended to `<body>`: with the target itself fullscreen,
 * each of them would open where it cannot be seen.
 *
 * `requestFullscreen` rejects whenever the call is not tied to a user gesture,
 * and is missing outright in some embedded views and in test environments, so
 * the rejection is treated as a normal outcome, not an error: the target still
 * covers the window, and a hint says how to leave, which the browser only says
 * for its own fullscreen. Escape leaves on either route.
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

  /** Whether the page's fullscreen is ours to leave, rather than the host's. */
  let ownsPageFullscreen = false
  let hint: HTMLElement | null = null
  let hintTimer: ReturnType<typeof setTimeout> | null = null

  const isOn = (): boolean => target.classList.contains(COVER_CLASS)

  const sync = (): void => {
    const on = isOn()
    button.setAttribute('aria-pressed', String(on))
    target.classList.toggle('trevixal-viewmode--fullscreen', on)
    options.onChange?.(on)
  }

  const dropHint = (): void => {
    if (hintTimer !== null) clearTimeout(hintTimer)
    hintTimer = null
    hint?.remove()
    hint = null
  }

  const showHint = (): void => {
    dropHint()
    hint = doc.createElement('div')
    hint.className = 'trevixal-fullscreen__hint'
    hint.setAttribute('role', 'status')
    hint.textContent = 'Press Esc to exit full screen'
    target.appendChild(hint)
    hintTimer = setTimeout(dropHint, HINT_MS)
  }

  const enter = async (): Promise<boolean> => {
    if (isOn()) return true
    target.classList.add(COVER_CLASS)
    sync()
    const page = doc.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> }
    // Fullscreen already, the host's doing, and there is nothing to ask for.
    if (doc.fullscreenElement) return true
    if (typeof page.requestFullscreen !== 'function') {
      showHint()
      return true
    }
    try {
      await page.requestFullscreen()
      ownsPageFullscreen = true
    } catch {
      // Rejected: most often "not called from a user gesture", sometimes a
      // permissions policy. The cover alone is still the distraction-free
      // view the user asked for.
      showHint()
    }
    return true
  }

  const exit = async (): Promise<void> => {
    target.classList.remove(COVER_CLASS)
    dropHint()
    if (ownsPageFullscreen) {
      // Cleared first, so the change this causes is not taken for the user
      // leaving the browser's fullscreen on their own.
      ownsPageFullscreen = false
      if (doc.fullscreenElement && typeof doc.exitFullscreen === 'function') {
        try {
          await doc.exitFullscreen()
        } catch {
          // Already out, or the document lost the permission; the cover is
          // gone either way, so the view is correct.
        }
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

  // Escape in the browser's fullscreen is the browser's, and never reaches the
  // page: leaving it is heard here, and takes the cover with it.
  const onFullscreenChange = (): void => {
    if (!ownsPageFullscreen || doc.fullscreenElement) return
    ownsPageFullscreen = false
    void exit()
  }
  doc.addEventListener('fullscreenchange', onFullscreenChange)

  // Escape leaves the cover too, as it leaves the browser's fullscreen. One a
  // popup, a menu or a dialog already answered was closing that instead.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented || !isOn()) return
    void exit()
  }
  doc.addEventListener('keydown', onKeyDown)

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
      doc.removeEventListener('keydown', onKeyDown)
      dropHint()
      target.classList.remove(COVER_CLASS, 'trevixal-viewmode--fullscreen')
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
