/**
 * View ▸ Present: the document as slides, one top-level heading each, full
 * screen. The arrow keys, Space and Page Up/Down move between slides, Home
 * and End go to the ends, N shows the speaker's notes (the slide's note
 * callouts), and Escape ends the show. A click on the slide moves on.
 */
import { type Editor, escapeHTML, serializeToHTML } from '@trevixal/core'
import { type Slide, documentSlides } from '@trevixal/extension-export'

/** Keys that move on a slide, and keys that go back one. */
const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'])
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'])

function slideHTML(slide: Slide): string {
  const title = slide.title
    ? `<h1 class="trevixal-presentation__title">${escapeHTML(slide.title)}</h1>`
    : ''
  return title + slide.blocks.map((block) => serializeToHTML(block)).join('')
}

/** Show the presentation; resolves once it ends. */
export function openPresentation(editor: Editor): Promise<void> {
  const slides = documentSlides(editor.state.doc)
  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text = '',
  ): HTMLElementTagNameMap[K] => {
    const created = document.createElement(tag)
    created.className = className
    if (text) created.textContent = text
    return created
  }
  const overlay = make('div', 'trevixal-presentation')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Presentation')
  overlay.tabIndex = -1
  const stage = make('section', 'trevixal-presentation__slide trevixal-content')
  stage.setAttribute('aria-live', 'polite')
  const notes = make('aside', 'trevixal-presentation__notes')
  notes.setAttribute('aria-label', 'Speaker notes')
  notes.hidden = true
  const bar = make('div', 'trevixal-presentation__bar')
  const counter = make('span', 'trevixal-presentation__counter')
  const button = (label: string, run: () => void): HTMLButtonElement => {
    const control = make('button', 'trevixal-presentation__button', label)
    control.type = 'button'
    control.addEventListener('click', (event) => {
      event.stopPropagation()
      run()
    })
    bar.append(control)
    return control
  }
  let index = 0

  const show = (next: number): void => {
    index = Math.max(0, Math.min(slides.length - 1, next))
    const slide = slides[index]
    stage.innerHTML = slide ? slideHTML(slide) : ''
    notes.replaceChildren(
      ...(slide?.notes.length
        ? slide.notes.map((note) => make('p', 'trevixal-presentation__note', note))
        : [make('p', 'trevixal-presentation__note', 'No notes for this slide.')]),
    )
    counter.textContent = `${index + 1} / ${slides.length}`
  }

  return new Promise((resolve) => {
    let fullscreen = false
    let finished = false
    const finish = (): void => {
      if (finished) return
      finished = true
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      if (document.fullscreenElement === overlay) void document.exitFullscreen().catch(() => {})
      overlay.remove()
      editor.view?.focus()
      resolve()
    }
    // In full screen the browser keeps Escape for itself and leaves full
    // screen with it, so leaving full screen is what ends the show there.
    const onFullscreenChange = (): void => {
      if (document.fullscreenElement === overlay) fullscreen = true
      else if (fullscreen) finish()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') finish()
      else if (NEXT_KEYS.has(event.key)) show(index + 1)
      else if (PREVIOUS_KEYS.has(event.key)) show(index - 1)
      else if (event.key === 'Home') show(0)
      else if (event.key === 'End') show(slides.length - 1)
      else if (event.key.toLowerCase() === 'n') notes.hidden = !notes.hidden
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    button('Previous', () => show(index - 1))
    button('Next', () => show(index + 1))
    button('Notes', () => {
      notes.hidden = !notes.hidden
    })
    button('End show', finish)
    bar.prepend(counter)
    stage.addEventListener('click', () => show(index + 1))
    overlay.append(stage, notes, bar)
    document.body.append(overlay)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    show(0)
    overlay.focus()
    // Full screen where the browser allows it; a window works as well without.
    overlay.requestFullscreen?.().catch(() => {})
  })
}
