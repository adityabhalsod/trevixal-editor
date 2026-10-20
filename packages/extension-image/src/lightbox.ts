import type { Editor } from '@trevixal/core'

/** The class the lightbox's overlay carries. */
export const LIGHTBOX_CLASS = 'trevixal-lightbox'

/**
 * Open an image full size on a double click, over the page: the images of
 * its gallery, or of the whole document when it is in none, stepped through
 * with the arrow keys or the buttons beside it. Escape, the close button or
 * a click on the dark around it closes it again. Returns a disposer.
 */
export function enableLightbox(editor: Editor): () => void {
  const view = editor.view
  if (!view) return () => {}
  const document = view.dom.ownerDocument
  let closeOpen: (() => void) | null = null

  const open = (images: readonly HTMLImageElement[], start: number): void => {
    closeOpen?.()
    let index = start
    const overlay = document.createElement('div')
    overlay.className = LIGHTBOX_CLASS
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', 'Image')
    const picture = document.createElement('img')
    picture.className = `${LIGHTBOX_CLASS}__image`
    const caption = document.createElement('p')
    caption.className = `${LIGHTBOX_CLASS}__caption`
    const button = (label: string, symbol: string, modifier: string): HTMLButtonElement => {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = `${LIGHTBOX_CLASS}__button ${LIGHTBOX_CLASS}__button--${modifier}`
      element.setAttribute('aria-label', label)
      element.textContent = symbol
      return element
    }
    const previous = button('Previous image', '‹', 'previous')
    const next = button('Next image', '›', 'next')
    const close = button('Close', '×', 'close')
    overlay.append(picture, caption, previous, next, close)
    const show = (): void => {
      const source = images[index]
      if (!source) return
      picture.src = source.currentSrc || source.src
      picture.alt = source.alt
      const figure = source.closest('figure')?.querySelector('figcaption')?.textContent
      caption.textContent = figure || source.alt || ''
      const counter = images.length > 1 ? ` (${index + 1} of ${images.length})` : ''
      overlay.setAttribute('aria-label', `${source.alt || 'Image'}${counter}`)
      previous.hidden = images.length < 2
      next.hidden = images.length < 2
    }
    const step = (by: number): void => {
      index = (index + by + images.length) % images.length
      show()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismiss()
      else if (event.key === 'ArrowRight') step(1)
      else if (event.key === 'ArrowLeft') step(-1)
      else return
      event.preventDefault()
    }
    const dismiss = (): void => {
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
      closeOpen = null
      view.focus()
    }
    previous.addEventListener('click', () => step(-1))
    next.addEventListener('click', () => step(1))
    close.addEventListener('click', dismiss)
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) dismiss()
    })
    document.addEventListener('keydown', onKey, true)
    document.body.appendChild(overlay)
    show()
    close.focus()
    closeOpen = dismiss
  }

  const onDoubleClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof HTMLImageElement) || !view.dom.contains(target) || !target.src) return
    const scope = target.closest('.trevixal-gallery') ?? view.dom
    const images = [...scope.querySelectorAll<HTMLImageElement>('img.trevixal-image')].filter(
      (image) => image.src,
    )
    const start = images.indexOf(target)
    if (start < 0) return
    event.preventDefault()
    open(images, start)
  }
  view.dom.addEventListener('dblclick', onDoubleClick)
  return () => {
    view.dom.removeEventListener('dblclick', onDoubleClick)
    closeOpen?.()
  }
}
