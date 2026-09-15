import { type Editor, editorDocument } from '@trevixal/core'

export interface CopyCodeButtonOptions {
  /** Node type to decorate; `"codeBlock"` by default. */
  readonly nodeName?: string
  /**
   * Where the buttons are appended. Must be a positioned ancestor of the
   * editor surface (or share its offset parent). Each button is positioned
   * absolutely within it. Defaults to the surface's own parent element.
   */
  readonly container?: HTMLElement
  /** How long the "Copied" / "Failed" state stays visible. */
  readonly resetDelay?: number
  /** Label text, overridable for localization. */
  readonly labels?: {
    readonly idle?: string
    readonly copied?: string
    readonly failed?: string
  }
}

const DEFAULT_LABELS = { idle: 'Copy', copied: 'Copied', failed: 'Failed' } as const

/** Clipboard state a button can be in; drives both label and `data-state`. */
type State = 'idle' | 'copied' | 'failed'

/**
 * Puts a copy button on every code block. The pattern every docs site uses.
 * Buttons are chrome, never document content: they live in the container
 * alongside the editor surface, so no step, no decoration and no node view is
 * involved, and the document is untouched by copying.
 *
 * Follows the floating-control shape of `createTableToolbar`: measure the
 * target block, position within the host's coordinate space, and re-run on
 * every transaction so the buttons track edits, scrolling and reflow.
 */
export function createCopyCodeButtons(
  editor: Editor,
  options: CopyCodeButtonOptions = {},
): () => void {
  const view = editor.view
  const doc = editorDocument(editor, options.container, 'createCopyCodeButtons')

  const nodeName = options.nodeName ?? 'codeBlock'
  const resetDelay = options.resetDelay ?? 1600
  const labels = { ...DEFAULT_LABELS, ...options.labels }
  const host = options.container ?? (view?.dom.parentElement as HTMLElement)

  /** One button per code block, keyed by the `<pre>` it belongs to. */
  const buttons = new Map<HTMLElement, HTMLButtonElement>()
  const timers = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>()
  let disposed = false

  const setState = (button: HTMLButtonElement, state: State): void => {
    button.dataset.state = state
    button.textContent = labels[state]
    // A transient state must always fall back to idle, even if the user never
    // interacts again, otherwise a stale "Copied" lies about the clipboard.
    const existing = timers.get(button)
    if (existing) clearTimeout(existing)
    if (state === 'idle') {
      timers.delete(button)
      return
    }
    timers.set(
      button,
      setTimeout(() => {
        timers.delete(button)
        if (!disposed) setState(button, 'idle')
      }, resetDelay),
    )
  }

  const copy = (text: string): Promise<boolean> => copyToClipboard(doc, text)

  const attachButton = (pre: HTMLElement): HTMLButtonElement => {
    const button = doc.createElement('button')
    button.type = 'button'
    button.className = 'trevixal-copycode'
    button.dataset.state = 'idle'
    button.textContent = labels.idle
    button.setAttribute('aria-label', 'Copy code to clipboard')
    // A control over the document must never steal the selection it acts on.
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', (event) => {
      event.preventDefault()
      // Read the text at click time: the block may have been edited since.
      const code = pre.querySelector('code') ?? pre
      void copy(code.textContent ?? '').then((ok) => {
        if (!disposed) setState(button, ok ? 'copied' : 'failed')
      })
    })
    host.appendChild(button)
    return button
  }

  /**
   * The tag the renderer gives this node type, read from the type's own
   * `toHTML` spec. The renderer builds elements from exactly that, so this
   * stays correct for a custom `nodeName` and for a schema that renders code
   * blocks as something other than `<pre>`.
   */
  const selector = ((): string => {
    const type = editor.state.schema.nodes[nodeName]
    return type?.spec.toHTML?.(type.create())?.tag ?? 'pre'
  })()

  const update = (): void => {
    const current = editor.view
    if (!current) return
    const blocks = [...current.dom.querySelectorAll<HTMLElement>(selector)]
    const seen = new Set<HTMLElement>()
    const hostBox = host.getBoundingClientRect()

    for (const pre of blocks) {
      seen.add(pre)
      let button = buttons.get(pre)
      if (!button) {
        button = attachButton(pre)
        buttons.set(pre, button)
      }
      // Anchor to the block's top-right corner in the host's coordinate
      // space, so no page-level scroll offset ever enters the maths.
      const box = pre.getBoundingClientRect()
      button.style.left = `${box.right - hostBox.left - button.offsetWidth - 6}px`
      button.style.top = `${box.top - hostBox.top + 6}px`
    }

    // Blocks the user deleted take their buttons, and pending timers, away.
    for (const [pre, button] of buttons) {
      if (seen.has(pre)) continue
      const timer = timers.get(button)
      if (timer) clearTimeout(timer)
      timers.delete(button)
      button.remove()
      buttons.delete(pre)
    }
  }

  // `transaction` covers every document change, including the ones that add
  // or remove a code block; positions are re-measured on each run.
  const offTransaction = editor.on('transaction', update)
  update()

  return () => {
    disposed = true
    offTransaction()
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    for (const button of buttons.values()) button.remove()
    buttons.clear()
  }
}

/**
 * Copy `text`, preferring the async Clipboard API and falling back to the
 * legacy `execCommand` path. The promise rejects on a denied permission or
 * an insecure (non-HTTPS) context, and an unhandled rejection there would
 * both lose the error and leave a button stuck, so it is always caught and
 * always resolved into a definite success or failure.
 */
export async function copyToClipboard(doc: Document, text: string): Promise<boolean> {
  const clipboard = doc.defaultView?.navigator?.clipboard
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text)
      return true
    } catch {
      // Fall through: the legacy path still works in some of these cases.
    }
  }
  return copyByExecCommand(doc, text)
}

/**
 * The pre-Clipboard-API copy path: a `execCommand('copy')` over a hidden,
 * off-screen textarea. Still the only route in an insecure context, and the
 * fallback when the async API is denied.
 */
function copyByExecCommand(doc: Document, text: string): boolean {
  const area = doc.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.setAttribute('aria-hidden', 'true')
  // Off-screen rather than `display: none`: a hidden element cannot be
  // selected, and without a selection `execCommand('copy')` copies nothing.
  area.style.position = 'fixed'
  area.style.top = '-9999px'
  area.style.opacity = '0'
  doc.body.appendChild(area)
  try {
    area.select()
    // Older engines need an explicit range; `select()` alone is unreliable.
    area.setSelectionRange(0, text.length)
    return doc.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}
