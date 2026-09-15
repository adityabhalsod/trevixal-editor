import type { Editor } from '@trevixal/core'
import { DEFAULT_DIAGRAM_LANGUAGES, diagramLanguageOf } from './commands'

/** What a {@link DiagramRenderer} is told about the block it draws. */
export interface DiagramRenderContext {
  /** The block's language, normalized to lower case (`'mermaid'`). */
  readonly language: string
  /**
   * An id unique to this render call and safe to use as a DOM id, Mermaid
   * and friends need one for the scratch element they draw into.
   */
  readonly id: string
}

/**
 * Turns diagram source into SVG/HTML markup, synchronously or not. The host
 * supplies it (Mermaid via `createMermaidRenderer`, or anything else), which
 * keeps this package free of runtime dependencies; the markup is inserted
 * verbatim, trusted as the host's own output.
 */
export type DiagramRenderer = (
  code: string,
  context: DiagramRenderContext,
) => Promise<string> | string

export interface DiagramOptions {
  readonly render: DiagramRenderer
  /** Code block languages that get a preview; `['mermaid']` by default. Matched case-insensitively. */
  readonly languages?: readonly string[]
  /**
   * Quiet time after an edit before changed blocks re-render; 300ms by
   * default so rendering never competes with typing. 0 renders synchronously
   * on every transaction.
   */
  readonly debounceMs?: number
  /**
   * Text shown while a block's first render is pending; `'Rendering diagram…'`
   * by default. Later re-renders keep the previous diagram in place (dimmed via
   * the pending class) so the block does not jump between sizes.
   */
  readonly placeholder?: string
  /** Prefix of the message shown when the renderer throws or rejects. */
  readonly errorLabel?: string
}

export interface DiagramController {
  /**
   * Re-render every diagram from scratch, ignoring the cache, after a theme
   * change, say, and resolve once every render has settled (which also makes
   * it the way tests wait for asynchronous renderers).
   */
  refresh(): Promise<void>
  /** Hide previews without tearing down; re-enabling restores them from cache. */
  setEnabled(enabled: boolean): void
  /** Remove every preview and stop listening to the editor. */
  destroy(): void
}

/** Class of the preview element appended inside a diagram block's `<pre>`. */
export const DIAGRAM_PREVIEW_CLASS = 'trevixal-diagram'
const PENDING_CLASS = `${DIAGRAM_PREVIEW_CLASS}--pending`
const ERROR_CLASS = `${DIAGRAM_PREVIEW_CLASS}--error`
/** Every keystroke in a diagram mints a new cache key, so the cache is bounded. */
const CACHE_LIMIT = 64

type Outcome =
  | { readonly ok: true; readonly html: string }
  | { readonly ok: false; readonly message: string }

/** What a preview element currently displays, to skip DOM writes that would change nothing. */
interface Shown {
  readonly generation: number
  readonly kind: 'ok' | 'error' | 'pending'
  readonly key: string
}

interface RenderRequest {
  readonly language: string
  readonly code: string
}

function noopController(): DiagramController {
  return {
    refresh: () => Promise.resolve(),
    setEnabled: () => undefined,
    destroy: () => undefined,
  }
}

/**
 * Render a live preview under every code block written in a diagram language.
 *
 * The preview is chrome, not content: a non-editable widget element appended
 * inside the block's `<pre>` after its `<code>`, which the renderer's inline
 * rebuilds leave alone and the position mapper skips, so the document model
 * and its serialized HTML never see it. Results are cached by language and
 * code, so caret moves and edits elsewhere cost nothing, and a stale
 * asynchronous result can never overwrite a newer one. A result is only ever
 * shown by blocks whose code still matches it. Returns a no-op controller for
 * a headless editor.
 */
export function diagram(editor: Editor, options: DiagramOptions): DiagramController {
  const view = editor.view
  if (!view) return noopController()

  const languages = options.languages ?? DEFAULT_DIAGRAM_LANGUAGES
  const debounceMs = Math.max(0, options.debounceMs ?? 300)
  const placeholder = options.placeholder ?? 'Rendering diagram…'
  const errorLabel = options.errorLabel ?? 'Diagram could not be rendered'
  const surface = view.dom
  const document = surface.ownerDocument

  const cache = new Map<string, Outcome>()
  const inflight = new Map<string, Promise<void>>()
  const shown = new WeakMap<HTMLElement, Shown>()
  /** Keys whose render waits for the debounce timer. */
  const queued = new Map<string, RenderRequest>()
  /** Bumped by `refresh()` so every preview counts as out of date. */
  let generation = 0
  let renderCount = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let enabled = true
  let composing = false
  let destroyed = false

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const previewIn = (pre: HTMLElement): HTMLElement | null => {
    for (const child of pre.children) {
      if (child.classList.contains(DIAGRAM_PREVIEW_CLASS)) return child as HTMLElement
    }
    return null
  }

  const ensurePreview = (pre: HTMLElement, language: string): HTMLElement => {
    let preview = previewIn(pre)
    if (!preview) {
      preview = document.createElement('div')
      preview.className = DIAGRAM_PREVIEW_CLASS
      preview.setAttribute('contenteditable', 'false')
      preview.dataset.trevixalWidget = 'true'
      pre.appendChild(preview)
    }
    if (preview.dataset.trevixalDiagram !== language) preview.dataset.trevixalDiagram = language
    return preview
  }

  const removePreviews = (): void => {
    for (const pre of surface.querySelectorAll('pre')) previewIn(pre)?.remove()
  }

  const cacheKey = (language: string, code: string): string => `${language}\n${code}`

  const cacheGet = (key: string): Outcome | undefined => {
    const outcome = cache.get(key)
    if (outcome) {
      // Re-insert so the most recently used entries are the last to go.
      cache.delete(key)
      cache.set(key, outcome)
    }
    return outcome
  }

  const cacheSet = (key: string, outcome: Outcome): void => {
    cache.delete(key)
    cache.set(key, outcome)
    if (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
  }

  const sameShown = (a: Shown | undefined, b: Shown): boolean =>
    a !== undefined && a.generation === b.generation && a.kind === b.kind && a.key === b.key

  const show = (preview: HTMLElement, key: string, outcome: Outcome): void => {
    const next: Shown = { generation, kind: outcome.ok ? 'ok' : 'error', key }
    if (sameShown(shown.get(preview), next)) return
    shown.set(preview, next)
    preview.classList.remove(PENDING_CLASS)
    if (outcome.ok) {
      preview.classList.remove(ERROR_CLASS)
      preview.innerHTML = outcome.html
    } else {
      preview.classList.add(ERROR_CLASS)
      preview.textContent = outcome.message
    }
  }

  const showPending = (preview: HTMLElement, key: string): void => {
    const next: Shown = { generation, kind: 'pending', key }
    const previous = shown.get(preview)
    if (sameShown(previous, next)) return
    shown.set(preview, next)
    preview.classList.add(PENDING_CLASS)
    // A diagram already on screen stays (dimmed by the class) until its
    // replacement arrives; anything else gives way to the placeholder.
    if (previous?.kind !== 'ok') {
      preview.classList.remove(ERROR_CLASS)
      preview.textContent = placeholder
    }
  }

  const describe = (error: unknown): string => {
    let detail = ''
    if (error instanceof Error) detail = error.message
    else if (typeof error === 'string') detail = error
    return detail ? `${errorLabel}: ${detail}` : errorLabel
  }

  const outcomeOf = (html: unknown): Outcome =>
    typeof html === 'string'
      ? { ok: true, html }
      : { ok: false, message: describe('the renderer returned no markup') }

  /** An asynchronous result landed: cache it and let matching blocks pick it up. */
  const settle = (key: string, outcome: Outcome): void => {
    inflight.delete(key)
    if (destroyed) return
    cacheSet(key, outcome)
    sync(false)
  }

  /** Start one render; true when it finished synchronously (result already cached). */
  const startRender = (key: string, request: RenderRequest): boolean => {
    if (inflight.has(key)) return false
    renderCount += 1
    const context = { language: request.language, id: `trevixal-diagram-${renderCount}` }
    let result: Promise<string> | string
    try {
      result = options.render(request.code, context)
    } catch (error) {
      cacheSet(key, { ok: false, message: describe(error) })
      return true
    }
    if (typeof result === 'string') {
      cacheSet(key, { ok: true, html: result })
      return true
    }
    inflight.set(
      key,
      result.then(
        (html) => settle(key, outcomeOf(html)),
        (error: unknown) => settle(key, { ok: false, message: describe(error) }),
      ),
    )
    return false
  }

  const flush = (): void => {
    clearTimer()
    if (destroyed || !enabled || composing) return
    let settledNow = false
    for (const [key, request] of queued) {
      if (startRender(key, request)) settledNow = true
    }
    queued.clear()
    if (settledNow) sync(false)
  }

  const schedule = (immediate: boolean): void => {
    clearTimer()
    if (queued.size === 0) return
    if (immediate || debounceMs === 0) {
      flush()
      return
    }
    timer = setTimeout(flush, debounceMs)
  }

  /**
   * Reconcile previews with the rendered document: attach one to every
   * diagram block (a rebuilt block loses it), drop it from blocks that are no
   * longer diagrams, paint cached results, and queue renders for the rest.
   */
  const sync = (immediate: boolean): void => {
    if (destroyed || !enabled || composing) return
    const current = editor.view
    if (!current) return
    queued.clear()
    for (const pre of current.dom.querySelectorAll('pre')) {
      const node = current.renderer.modelOf.get(pre)
      const language = node ? diagramLanguageOf(node, languages) : null
      if (!node || !language) {
        previewIn(pre)?.remove()
        continue
      }
      const key = cacheKey(language, node.textContent)
      const preview = ensurePreview(pre, language)
      const cached = cacheGet(key)
      if (cached) {
        show(preview, key, cached)
        continue
      }
      // Evicted from the cache but still on screen: nothing to redo.
      const visible = shown.get(preview)
      if (visible?.generation === generation && visible.key === key && visible.kind !== 'pending') {
        continue
      }
      showPending(preview, key)
      if (!inflight.has(key)) queued.set(key, { language, code: node.textContent })
    }
    schedule(immediate)
  }

  const onCompositionStart = (): void => {
    composing = true
  }
  const onCompositionEnd = (): void => {
    composing = false
    sync(false)
  }
  surface.addEventListener('compositionstart', onCompositionStart)
  surface.addEventListener('compositionend', onCompositionEnd)
  const unsubscribe = editor.on('transaction', () => sync(false))
  sync(true)

  return {
    async refresh() {
      if (destroyed || !enabled) return
      generation += 1
      cache.clear()
      sync(true)
      // Settling a render can queue another (the code changed meanwhile), so
      // wait in rounds until nothing is in flight.
      while (inflight.size > 0) await Promise.all([...inflight.values()])
    },
    setEnabled(value) {
      if (destroyed || enabled === value) return
      enabled = value
      if (value) {
        sync(true)
        return
      }
      clearTimer()
      queued.clear()
      removePreviews()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      clearTimer()
      unsubscribe()
      surface.removeEventListener('compositionstart', onCompositionStart)
      surface.removeEventListener('compositionend', onCompositionEnd)
      removePreviews()
      queued.clear()
      cache.clear()
      inflight.clear()
    },
  }
}
