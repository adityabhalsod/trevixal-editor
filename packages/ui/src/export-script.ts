/**
 * The behaviour a saved page needs to match the editor it was saved from.
 *
 * Almost nothing does: a toggle and an accordion export as real `<details>`
 * elements and collapse on their own, and every other block is laid out by
 * CSS alone. Two things are not so lucky, and both are handled here.
 *
 * It is written once, as a function, and reached two ways. Usually the source
 * is inlined into the page and the page runs it itself
 * ({@link documentBehaviourScript}). That is what a downloaded file gets, and
 * what the side-by-side preview gets, so a tab strip behaves the same way in
 * both. A tab that worked in a preview and not in the saved file would be
 * worse than one that did nothing in either.
 *
 * The other way is for a document the caller already holds and can reach into
 * (a print window, a node the host rendered itself) where there is no page
 * load to hang a script on ({@link bindDocumentBehaviour}).
 */

/**
 * Everything a rendered Trevixal document needs to behave like the editor.
 *
 * Deliberately self-contained: it closes over nothing, takes the document it
 * works on, and uses only DOM globals, because {@link documentBehaviourScript}
 * serializes this very function and inlines it into a page that has no modules
 * and no bundler. A reference to anything outside it would be a reference that
 * does not exist by the time it runs.
 */
function applyDocumentBehaviour(document: Document): void {
  const PANEL = '.trevixal-tabs__panel'
  const TITLE = '.trevixal-tabs__title'

  /**
   * A tab strip is laid out from the `data-active` attribute on each panel,
   * and only the editor ever moved it. In a saved file the titles are inert:
   * the strip opens on whichever panel was active when it was exported and
   * stays there, which reads as a broken page rather than a static one.
   */
  // Direct children only, throughout: a tab strip nested inside a panel has
  // panels of its own, and the outer strip must not claim them. Filtered off
  // `children` rather than asked for with `:scope >`, which says the same
  // thing but leans on selector support this has no way to check for, and
  // where it is missing the strip does not misbehave, it does nothing at all.
  const panelsOf = (strip: Element): Element[] =>
    [...strip.children].filter((child) => child.matches(PANEL))
  const titleOf = (panel: Element): HTMLElement | null =>
    ([...panel.children].find((child) => child.matches(TITLE)) as HTMLElement | undefined) ?? null

  const show = (panel: Element | undefined): void => {
    const strip = panel?.parentElement
    if (!panel || !strip) return
    for (const sibling of panelsOf(strip)) {
      const on = sibling === panel
      sibling.setAttribute('data-active', on ? 'true' : 'false')
      const title = titleOf(sibling)
      if (!title) continue
      title.setAttribute('aria-expanded', on ? 'true' : 'false')
      // Only the selected tab takes Tab focus; the arrows move within the strip.
      title.tabIndex = on ? 0 : -1
    }
  }

  for (const strip of document.querySelectorAll('.trevixal-tabs')) {
    const panels = panelsOf(strip)
    show(panels.find((panel) => panel.getAttribute('data-active') === 'true') ?? panels[0])
  }

  // Duck-typed, not `instanceof Element`. When this runs inside the page it
  // wired, the two are the same test, but `bindDocumentBehaviour` attaches it
  // from the document's *embedder*, and then `Element` here is the parent
  // window's constructor while the click target comes from the other
  // document's. They are different constructors, `instanceof` is false for
  // every element, and the strip silently stops responding while still
  // looking wired.
  const titleFrom = (target: EventTarget | null): Element | null => {
    const element = target as Element | null
    return element && typeof element.closest === 'function' ? element.closest(TITLE) : null
  }

  document.addEventListener('click', (event) => {
    const panel = titleFrom(event.target)?.closest(PANEL)
    if (panel) show(panel)
  })

  /**
   * The titles are buttons, so the keyboard has to work too. A control that
   * announces itself as pressable and then ignores Enter is worse than one
   * that never claimed to be pressable. The arrows move along the strip as
   * well, which is what anyone who has met a tab strip will try.
   */
  document.addEventListener('keydown', (event) => {
    const title = titleFrom(event.target)
    const panel = title?.closest(PANEL)
    const strip = panel?.parentElement
    if (!panel || !strip) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      show(panel)
      return
    }
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const panels = panelsOf(strip)
    const next = panels[(panels.indexOf(panel) + step + panels.length) % panels.length]
    if (!next) return
    show(next)
    titleOf(next)?.focus()
  })

  /**
   * YouTube will not start a player for a page it cannot place: opened from
   * disk there is no origin to send, and the frame fills with its own
   * "Video player configuration error. Error 153" instead of the video. No
   * attribute changes that, measured against every combination of `sandbox`,
   * `referrerpolicy` and `loading`, and the page cannot see inside the frame
   * to know it happened, so the swap is made up front, from the one condition
   * that is visible: where this page was itself opened from.
   *
   * YouTube alone. Vimeo and ordinary iframes were measured loading perfectly
   * well from a local file, and replacing those would break embeds that work.
   */
  const protocol = document.location ? document.location.protocol : 'http:'
  if (protocol !== 'http:' && protocol !== 'https:') {
    for (const frame of document.querySelectorAll('iframe.trevixal-embed--youtube')) {
      const src = frame.getAttribute('src')
      if (!src) continue
      const link = document.createElement('a')
      link.className = 'trevixal-embed trevixal-embed--offsite'
      link.href = src
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      const label = document.createElement('strong')
      label.className = 'trevixal-embed__label'
      label.textContent = frame.getAttribute('title') || 'Watch the video'
      const note = document.createElement('span')
      note.className = 'trevixal-embed__note'
      // Says what clicking does, and why there is no player to click instead.
      note.textContent = 'Opens on YouTube. A video cannot play inside a page opened from a file.'
      link.append(label, note)
      frame.replaceWith(link)
    }
  }
}

/**
 * Wire a rendered document in place: tab strips switch, and a YouTube embed
 * in a page opened from disk becomes a link to the video.
 *
 * For a document the caller already holds and can reach into, a print window,
 * a node the host rendered itself. Anything that loads as a page of its own
 * takes {@link documentBehaviourScript} instead and runs it, which is what
 * both a saved file and the side-by-side preview do.
 *
 * Worth knowing before reaching for this: a document whose scripting has been
 * disabled, a sandboxed frame without `allow-scripts`, invokes no listener
 * at all in WebKit, whichever realm attached it. Behaviour bound from outside
 * such a frame is inert there while looking perfectly well wired.
 */
export function bindDocumentBehaviour(document: Document): void {
  applyDocumentBehaviour(document)
}

/**
 * The script an exported page carries, as source text. It has to run in a
 * file that loads nothing, so it is inlined rather than shipped as a module.
 *
 * `builtinExporters` inlines this by default. Pass `scripts: () => ''` to
 * write a page with no script in it at all; the only cost is a tab strip
 * frozen on the panel that was open when it was saved.
 */
export function documentBehaviourScript(): string {
  // Serialized from the function above rather than written out again beside
  // it. A second copy is a copy that drifts, and the two would drift in the
  // worst possible way: the preview and the saved file disagreeing about what
  // the same tab strip does.
  return `(${applyDocumentBehaviour.toString()})(document)`
}
