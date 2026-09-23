/**
 * Split view: a second pane beside the editor showing either a rendered
 * preview of the document or a second, live editor onto the same document.
 */

import {
  ADD_TO_HISTORY,
  type Editor,
  type EditorNode,
  type HTMLDocumentTheme,
  ReplaceNodesStep,
  createEditor,
  serializeToHTMLDocument,
} from '@trevixal/core'

/** Transaction meta marking a replayed transaction, so it is not replayed back. */
export const MIRROR_META = 'workspace$mirror'

/**
 * Keep two editors on one document by replaying each one's steps into the
 * other. `a` owns the undo history: edits made in `b` are recorded in `a`
 * and never in `b`, so undo in either pane undoes the same thing and the
 * two never disagree about what "undo" means.
 *
 * If a step cannot apply (the documents diverged, a rejected step, a
 * transform on one side only), the receiving editor is resynchronized from
 * the sender's document wholesale.
 */
export function mirrorEditors(a: Editor, b: Editor): () => void {
  const replay = (from: Editor, to: Editor, recordHistory: boolean): (() => void) =>
    from.onTransaction(({ transaction }) => {
      if (transaction.getMeta(MIRROR_META) === true || !transaction.docChanged) return
      if (to.isDestroyed) return
      let tr = to.state.tr
      for (const step of transaction.steps) {
        if (tr.maybeStep(step)) continue
        tr = to.state.tr
        tr.step(new ReplaceNodesStep([], 0, to.state.doc.childCount, from.state.doc.content))
        break
      }
      tr.setMeta(MIRROR_META, true)
      if (!recordHistory) tr.setMeta(ADD_TO_HISTORY, false)
      to.dispatch(tr)
    })

  const offA = replay(a, b, false)
  const offB = replay(b, a, true)
  const offTransform = b.addDispatchTransform((tr) => tr.setMeta(ADD_TO_HISTORY, false))
  return () => {
    offA()
    offB()
    offTransform()
  }
}

/**
 * Where a pane is scrolled to, said in terms both panes understand.
 *
 * Not a pixel offset, and not a percentage. The two panes are different
 * heights, the preview carries no toolbars, wraps differently, and draws a
 * diagram where the editor shows its source, so the same pixel is a
 * different place in each, and the same percentage is a different place again
 * the moment one pane holds a tall block the other does not.
 *
 * What they do agree on is the document. The preview reproduces the editor's
 * `.trevixal-content` element for element and in order, so the nth child of
 * one is the nth child of the other. An anchor names that child and how far
 * through it the reader has scrolled, which survives the two panes disagreeing
 * about how tall anything is.
 */
interface ScrollAnchor {
  /** Index of the top-level block at the top of the viewport. */
  readonly index: number
  /** How far through that block, 0 at its top and 1 at its bottom. */
  readonly offset: number
}

/** Frame to embedder: the reader scrolled the preview. */
const SCROLL_FROM_PREVIEW = 'trevixal-split:scroll'
/** Embedder to frame: put the preview here. */
const SCROLL_TO_PREVIEW = 'trevixal-split:scrollTo'

/**
 * The preview frame's half of the scroll link, and its own scroll restore.
 *
 * Self-contained, for the same reason `applyDocumentBehaviour` is: this
 * function is serialized with `toString()` and inlined into a page that has no
 * modules and no bundler, so a reference to anything outside it would be a
 * reference that does not exist by the time it runs. Everything it shares with
 * the embedder, the message names, where to scroll on arrival, arrives as an
 * argument rather than being closed over.
 */
function applyPreviewSync(
  document: Document,
  options: { index: number; offset: number; scroll: string; scrollTo: string },
): void {
  const view = document.defaultView
  const host = view?.parent
  if (!view || !host || host === view) return

  const blocks = (): HTMLElement[] => {
    const content = document.querySelector('.trevixal-content')
    // A document with settings (numbered headings, right to left) holds its
    // blocks in the one element carrying them, `data-trevixal-document` in
    // the core. Spelled out: this function runs in the preview, as source.
    const holder = content?.querySelector(':scope > [data-trevixal-document]') ?? content
    return holder ? ([...holder.children] as HTMLElement[]) : []
  }
  // Measured against the page rather than read off `offsetTop`, which is
  // relative to whichever ancestor happens to be positioned.
  const topOf = (block: HTMLElement): number => block.getBoundingClientRect().top + view.scrollY

  /**
   * Where the link last put this page, so the scroll that follows can be told
   * apart from one the reader made. -1 once it has been accounted for.
   */
  let echo = -1

  const goTo = (index: number, offset: number): void => {
    const list = blocks()
    if (list.length === 0) return
    const block = list[Math.max(0, Math.min(index, list.length - 1))]
    if (!block) return
    view.scrollTo(0, topOf(block) + block.getBoundingClientRect().height * offset)
    // Read back rather than remembered from the arithmetic above: asking for a
    // position past the end of a short page lands somewhere else, and it is
    // where it landed that the scroll event will report.
    echo = Math.round(view.scrollY)
  }

  // Straight away rather than on `load`: the preview re-renders on a timer
  // while the reader is typing, and a frame that started at the top and
  // jumped back a moment later would flash on every keystroke.
  goTo(options.index, options.offset)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => goTo(options.index, options.offset), {
      once: true,
    })
  }

  /**
   * A scroll this frame was told to make must not be reported back as one the
   * reader made, or the two panes shove each other along a pixel at a time.
   *
   * Told apart by position rather than by a quiet period. Where the link put
   * this page is something it can simply check; a timer cannot tell a late
   * echo from a reader who scrolled again quickly, and guesses wrong in the
   * direction that matters. A 250ms window here used to swallow the reader's
   * own scroll whenever it followed a synced one closely, and because the
   * report was dropped rather than delayed, the two panes then sat
   * disagreeing until something else happened to move one of them.
   */
  let pending = 0
  view.addEventListener(
    'scroll',
    () => {
      if (pending) return
      pending = view.requestAnimationFrame(() => {
        pending = 0
        const list = blocks()
        const y = view.scrollY
        // Within a pixel or two, because a fractional layout rounds.
        const told = echo >= 0 && Math.abs(y - echo) <= 2
        echo = -1
        if (told) return
        let index = 0
        let offset = 0
        for (let i = list.length - 1; i >= 0; i--) {
          const block = list[i]
          if (!block) continue
          const rect = block.getBoundingClientRect()
          const top = rect.top + view.scrollY
          if (top > y + 1) continue
          index = i
          offset = Math.max(0, Math.min(1, (y - top) / (rect.height || 1)))
          break
        }
        // `*` because a sandboxed frame has an opaque origin and cannot know
        // the embedder's. The payload is two numbers saying where this page is
        // scrolled, which is not worth addressing a secret to.
        host.postMessage({ t: options.scroll, index, offset }, '*')
      })
    },
    { passive: true },
  )

  view.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { t?: string; index?: number; offset?: number } | null
    if (!data || data.t !== options.scrollTo) return
    if (typeof data.index !== 'number' || typeof data.offset !== 'number') return
    goTo(data.index, data.offset)
  })
}

/** The preview's sync script, as the source text an inlined script needs. */
function previewSyncScript(at: ScrollAnchor): string {
  // The message names travel as arguments rather than being written out again
  // inside the frame's copy: one set of names, used at both ends, and no way
  // for the two to drift apart.
  return `(${applyPreviewSync.toString()})(document, ${JSON.stringify({
    index: at.index,
    offset: at.offset,
    scroll: SCROLL_FROM_PREVIEW,
    scrollTo: SCROLL_TO_PREVIEW,
  })})`
}

/**
 * The element that scrolls a pane, or null when the page itself does.
 *
 * Worth resolving rather than assuming: the editor surface scrolls the whole
 * page in a shell that lets the document run long, and scrolls its own box in
 * an app that gives it a fixed height. A link that guessed wrong would move
 * nothing at all.
 */
function scrollerOf(content: HTMLElement): HTMLElement | null {
  const view = content.ownerDocument.defaultView
  if (!view) return null
  let node: HTMLElement | null = content
  while (node) {
    const overflow = view.getComputedStyle(node).overflowY
    const scrolls = overflow === 'auto' || overflow === 'scroll'
    if (scrolls && node.scrollHeight > node.clientHeight + 4) return node
    node = node.parentElement
  }
  return null
}

/** Where the top of `content`'s scroller sits, in that scroller's own pixels. */
function contentBase(content: HTMLElement, scroller: HTMLElement | null): number {
  const view = content.ownerDocument.defaultView
  return scroller
    ? scroller.getBoundingClientRect().top - scroller.scrollTop
    : -(view?.scrollY ?? 0)
}

/** Where a pane in this realm is scrolled to. */
function anchorOf(content: HTMLElement): ScrollAnchor {
  const view = content.ownerDocument.defaultView
  const scroller = scrollerOf(content)
  const y = scroller ? scroller.scrollTop : (view?.scrollY ?? 0)
  const base = contentBase(content, scroller)
  const children = [...content.children] as HTMLElement[]
  for (let i = children.length - 1; i >= 0; i--) {
    const block = children[i]
    if (!block) continue
    const rect = block.getBoundingClientRect()
    const top = rect.top - base
    if (top > y + 1) continue
    return { index: i, offset: Math.max(0, Math.min(1, (y - top) / (rect.height || 1))) }
  }
  return { index: 0, offset: 0 }
}

/** How far a pane in this realm is scrolled, in its scroller's own pixels. */
function scrollTopOf(content: HTMLElement): number {
  const scroller = scrollerOf(content)
  const view = content.ownerDocument.defaultView
  return Math.round(scroller ? scroller.scrollTop : (view?.scrollY ?? 0))
}

/**
 * Scroll a pane in this realm so `at` sits at the top of its viewport, and
 * return where it actually landed, or -1 if there was nothing to scroll to.
 *
 * The caller needs the landing position to recognise the scroll event this
 * raises as the link's own echo. Read back rather than returned from the
 * arithmetic: asking for a position past the end of a short pane lands
 * somewhere else, and it is where it landed that the event will report.
 */
function scrollToAnchor(content: HTMLElement, at: ScrollAnchor): number {
  const view = content.ownerDocument.defaultView
  const children = [...content.children] as HTMLElement[]
  if (children.length === 0) return -1
  const block = children[Math.max(0, Math.min(at.index, children.length - 1))]
  if (!block) return -1
  const scroller = scrollerOf(content)
  const rect = block.getBoundingClientRect()
  const y = rect.top - contentBase(content, scroller) + rect.height * at.offset
  if (scroller) scroller.scrollTop = y
  else view?.scrollTo(0, y)
  return scrollTopOf(content)
}

export type SplitMode = 'preview' | 'mirror'
export type SplitOrientation = 'horizontal' | 'vertical'

export interface SplitViewOptions {
  /** Where the pane is appended; the host lays it out beside the editor. */
  readonly container: HTMLElement
  /** `preview` (default) renders HTML in an iframe; `mirror` opens a second editor. */
  readonly mode?: SplitMode
  /** Side-by-side (`horizontal`, default) or stacked (`vertical`). */
  readonly orientation?: SplitOrientation
  /** CSS inlined into the preview document. */
  readonly styles?: string
  /**
   * JavaScript inlined into the preview page, read on every re-render.
   *
   * The preview is a page, not an editor: nothing in it is connected to
   * anything, so without this a tab strip in there is a picture of one. The
   * titles are drawn and clicking them does nothing.
   *
   * The frame runs it itself, which is why the sandbox names scripts and not
   * `allow-same-origin`. The two together are the pair that lets a frame reach
   * out and rewrite the page embedding it; scripts alone leave the preview on
   * an opaque origin, able to run this and nothing else. It cannot read this
   * page's DOM, its cookies or its storage.
   *
   * It is the same script the downloaded file carries, so the two behave
   * alike. `@trevixal/ui` exports `documentBehaviourScript` for exactly this.
   *
   * The embedder cannot reach in either, which is the point and also the
   * constraint: whatever the pane needs from the frame it has to ask for by
   * `postMessage`, which is how the scroll link below works.
   */
  readonly script?: () => string | undefined
  /**
   * Keep both panes showing the same part of the document (default true).
   *
   * Scrolling either one moves the other to the same block, so a reader
   * comparing them is looking at the same paragraph twice rather than hunting
   * for it. Turn it off for a preview meant to be scrolled on its own.
   */
  readonly syncScroll?: boolean
  /**
   * Per-node HTML for the preview, read on every re-render.
   *
   * Syntax colours and a drawn diagram are not in the document, the first is
   * a decoration, the second an element the view appends beside the block,
   * so serializing the document alone produces neither. This is the hook that
   * puts them back: `@trevixal/ui` exports `captureRenderedBlocks` to read
   * them off the live editor and `renderedNodeHTML` to turn them into the
   * markup a standalone page needs.
   */
  readonly renderNode?: () => ((node: EditorNode) => string | null) | undefined
  /**
   * Install extensions on the mirrored editor as it is created, and return a
   * disposer.
   *
   * The mirror is a second, independent editor. It shares the document, and
   * nothing else: highlighting, diagram rendering and the click handlers
   * behind tabs and accordions are all attached per editor, so a mirror left
   * bare shows plain grey code, no diagrams, and tab titles that do not
   * respond. Give it the same extensions the primary has and the two panes
   * behave alike, which is the only reason to have a second one.
   *
   * ```ts
   * createSplitView(editor, {
   *   container,
   *   mode: 'mirror',
   *   onMirror: (pane) => {
   *     const offHighlight = codeHighlight(pane, highlighter)
   *     const offBindings = blockBindings(pane)
   *     const diagrams = diagram(pane, { render })
   *     return () => {
   *       offHighlight()
   *       offBindings()
   *       diagrams.destroy()
   *     }
   *   },
   * })
   * ```
   */
  // A host that installs nothing it needs to take down again returns nothing,
  // and requiring a no-op disposer from it would be worse than the union.
  // biome-ignore lint/suspicious/noConfusingVoidType: returning a disposer is optional
  readonly onMirror?: (mirror: Editor) => (() => void) | void
  /**
   * The palette to render the preview in, read on every re-render so the
   * pane follows a theme change rather than keeping the one it opened with.
   * `@trevixal/ui` exports `editorTheme` for this.
   */
  readonly theme?: () => HTMLDocumentTheme | undefined
  /** Quiet time after an edit before the preview re-renders (default 150). */
  readonly debounceMs?: number
}

export interface SplitView {
  readonly element: HTMLElement
  readonly mode: SplitMode
  readonly orientation: SplitOrientation
  /** The second editor while in `mirror` mode, else null. */
  readonly mirror: Editor | null
  /** The preview frame while in `preview` mode, else null. */
  readonly preview: HTMLIFrameElement | null
  setMode(mode: SplitMode): void
  setOrientation(orientation: SplitOrientation): void
  /** Re-render the preview now (a no-op in mirror mode, which is always live). */
  refresh(): void
  destroy(): void
}

export function createSplitView(editor: Editor, options: SplitViewOptions): SplitView {
  const container = options.container
  const doc = container.ownerDocument
  const win = doc.defaultView
  const debounceMs = options.debounceMs ?? 150

  const root = doc.createElement('div')
  root.className = 'trevixal-split'
  const pane = doc.createElement('div')
  pane.className = 'trevixal-split__pane'
  root.appendChild(pane)

  let mode: SplitMode = options.mode ?? 'preview'
  let orientation: SplitOrientation = options.orientation ?? 'horizontal'
  let iframe: HTMLIFrameElement | null = null
  let mirror: Editor | null = null
  let unlink: (() => void) | null = null
  /** Tears down whatever `onMirror` installed on the mirrored editor. */
  let disposeMirror: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false
  const syncScroll = options.syncScroll ?? true
  /**
   * Where the preview last said it was scrolled to.
   *
   * Kept out here because the frame cannot be read from out here. An opaque
   * origin has no `contentWindow.scrollY` to ask. It reports where it is as it
   * moves, and every re-render hands the last report back to it, so a preview
   * that re-renders while the reader is typing opens where they were rather
   * than at the top.
   */
  let previewAt: ScrollAnchor = { index: 0, offset: 0 }
  /**
   * Where the link last put each pane in this realm, so the scroll that
   * follows can be told apart from one the reader made. -1 once accounted for.
   */
  let editorEcho = -1
  let mirrorEcho = -1

  const applyOrientation = (): void => {
    root.classList.toggle('trevixal-split--horizontal', orientation === 'horizontal')
    root.classList.toggle('trevixal-split--vertical', orientation === 'vertical')
    root.dataset.orientation = orientation
  }

  const renderPreview = (): void => {
    if (!iframe) return
    const theme = options.theme?.()
    // Read now, not at construction: it describes what the live editor is
    // currently showing, and the preview's whole job is to agree with it.
    const renderNode = options.renderNode?.()
    // A re-render replaces the whole document in the frame, so everything the
    // page needs has to be in the page: the behaviour the host supplies, and
    // the scroll link, which restores the reader's position as its first act.
    const inlineJS = [options.script?.() ?? '', syncScroll ? previewSyncScript(previewAt) : '']
      .filter((part) => part !== '')
      .join('\n;\n')
    const html = serializeToHTMLDocument(editor.state.doc, {
      title: 'Preview',
      ...(options.styles ? { inlineCSS: options.styles } : {}),
      ...(renderNode ? { renderNode } : {}),
      ...(theme ? { theme } : {}),
      ...(inlineJS ? { inlineJS } : {}),
    })
    iframe.setAttribute('srcdoc', html)
  }

  const cancelTimer = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const unmount = (): void => {
    cancelTimer()
    unlink?.()
    unlink = null
    // Before the editor goes: an extension's disposer reaches into the view
    // it was installed on, and a destroyed editor no longer has one.
    disposeMirror?.()
    disposeMirror = null
    mirror?.destroy()
    mirror = null
    iframe = null
    pane.replaceChildren()
  }

  const mount = (): void => {
    unmount()
    if (mode === 'preview') {
      iframe = doc.createElement('iframe')
      iframe.className = 'trevixal-split__preview'
      // Scripts, and deliberately not `allow-same-origin`: the two together
      // are the pair that lets a frame reach out and rewrite the page that
      // embeds it. On its own this leaves the preview on an opaque origin.
      // It runs the page's own script and can touch nothing out here.
      iframe.setAttribute('sandbox', 'allow-scripts')
      iframe.setAttribute('title', 'Preview')
      pane.appendChild(iframe)
      renderPreview()
      return
    }
    const host = doc.createElement('div')
    host.className = 'trevixal-split__mirror'
    pane.appendChild(host)
    const primary = editor
    mirror = createEditor({
      schema: primary.schema,
      doc: primary.state.doc,
      element: host,
      // The primary owns the history (see mirrorEditors), so the mirror's
      // shortcuts drive it rather than an empty local stack.
      keymap: {
        'Mod-z': () => {
          primary.undo()
          return true
        },
        'Mod-Shift-z': () => {
          primary.redo()
          return true
        },
        'Mod-y': () => {
          primary.redo()
          return true
        },
      },
    })
    unlink = mirrorEditors(primary, mirror)
    // After the mirror is linked, so an extension that dispatches while it
    // installs is replayed into the primary like any other edit.
    disposeMirror = options.onMirror?.(mirror) ?? null
  }

  const scheduleRender = (): void => {
    if (destroyed || mode !== 'preview') return
    cancelTimer()
    timer = setTimeout(() => {
      timer = null
      renderPreview()
    }, debounceMs)
  }

  const offUpdate = editor.on('update', scheduleRender)

  // The preview is a document of its own: it carries a copy of the palette
  // rather than inheriting the page's, so a theme change has to be painted
  // into it. Nothing about switching theme touches the document, so `update`
  // never fires, and the pane went on showing the palette it opened with
  // until the next keystroke happened to re-render it. A white sheet beside a
  // dark editor, for as long as you were only reading.
  //
  // Watched here rather than left to the host: `theme` above promises the
  // pane follows the editor, and a promise every caller has to keep for
  // itself is one most of them will not.
  const themeObserver =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
          scheduleRender()
        })
  themeObserver?.observe(doc.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ['data-trevixal-theme', 'data-trevixal-preset'],
  })

  /** Did this scroll event come from whatever scrolls `content`? */
  const scrolledPane = (target: EventTarget | null, content: HTMLElement): boolean => {
    const scroller = scrollerOf(content)
    // A pane with no scroller of its own is scrolled by the page, and a page
    // scroll arrives on the document rather than on any element in it.
    return scroller !== null
      ? target === scroller
      : target === doc || target === doc.documentElement || target === doc.body
  }

  /**
   * Move the other pane to wherever this one just went.
   *
   * One listener, in the capture phase, because `scroll` does not bubble: on
   * an element it fires on the element and on the page it fires on the
   * document, and capturing at the document is the single place that sees
   * both without having to know in advance which of the two a pane turned out
   * to use.
   */
  let scrollFrame = 0
  const onScroll = (event: Event): void => {
    if (!syncScroll || destroyed || scrollFrame !== 0 || !win) return
    const target = event.target
    // Coalesced to one a frame. A scroll fires far faster than either pane can
    // be measured, and measuring forces layout.
    scrollFrame = win.requestAnimationFrame(() => {
      scrollFrame = 0
      if (destroyed) return
      const content = editor.view?.dom
      if (!content) return
      const mirrored = mirror?.view?.dom ?? null
      // Two panes sharing one scroller are already showing the same place, and
      // linking them would only mean each one shoving the other.
      const linked = mirrored !== null && scrollerOf(mirrored) !== scrollerOf(content)

      // Within a pixel or two, because a fractional layout rounds.
      const wasTold = (landed: number, now: number): boolean =>
        landed >= 0 && Math.abs(now - landed) <= 2

      if (scrolledPane(target, content)) {
        const told = wasTold(editorEcho, scrollTopOf(content))
        editorEcho = -1
        if (told) return
        const at = anchorOf(content)
        if (mode === 'preview') {
          // The frame is on an opaque origin, so `*` is the only target origin
          // that can reach it. Two numbers saying where to sit; no secret.
          iframe?.contentWindow?.postMessage(
            { t: SCROLL_TO_PREVIEW, index: at.index, offset: at.offset },
            '*',
          )
        } else if (linked && mirrored) {
          mirrorEcho = scrollToAnchor(mirrored, at)
        }
        return
      }

      if (linked && mirrored && scrolledPane(target, mirrored)) {
        const told = wasTold(mirrorEcho, scrollTopOf(mirrored))
        mirrorEcho = -1
        if (told) return
        editorEcho = scrollToAnchor(content, anchorOf(mirrored))
      }
    })
  }

  /**
   * The preview reporting where the reader scrolled it to.
   *
   * Checked against the frame's own window rather than against an origin: a
   * sandboxed frame has an opaque one, so there is no origin to compare, and
   * `source` is the identity that actually answers "did this come from the
   * frame I made?". Every field is checked before it is used, because any
   * page on the screen can post here.
   */
  const onMessage = (event: MessageEvent): void => {
    if (!syncScroll || destroyed || mode !== 'preview') return
    if (!iframe || event.source !== iframe.contentWindow) return
    const data = event.data as { t?: unknown; index?: unknown; offset?: unknown } | null
    if (!data || data.t !== SCROLL_FROM_PREVIEW) return
    if (typeof data.index !== 'number' || typeof data.offset !== 'number') return
    if (!Number.isFinite(data.index) || !Number.isFinite(data.offset)) return
    // Remembered whether or not the editor follows, because this is also what
    // the next re-render hands back to the frame to restore.
    previewAt = { index: data.index, offset: data.offset }
    const content = editor.view?.dom
    if (!content) return
    editorEcho = scrollToAnchor(content, previewAt)
  }

  doc.addEventListener('scroll', onScroll, { capture: true, passive: true })
  win?.addEventListener('message', onMessage)

  applyOrientation()
  mount()
  container.appendChild(root)

  return {
    element: root,
    get mode() {
      return mode
    },
    get orientation() {
      return orientation
    },
    get mirror() {
      return mirror
    },
    get preview() {
      return iframe
    },
    setMode(next) {
      if (destroyed || next === mode) return
      mode = next
      mount()
    },
    setOrientation(next) {
      orientation = next
      applyOrientation()
    },
    refresh() {
      if (destroyed) return
      cancelTimer()
      renderPreview()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      offUpdate()
      themeObserver?.disconnect()
      doc.removeEventListener('scroll', onScroll, { capture: true })
      win?.removeEventListener('message', onMessage)
      if (scrollFrame !== 0) win?.cancelAnimationFrame(scrollFrame)
      unmount()
      root.remove()
    },
  }
}
