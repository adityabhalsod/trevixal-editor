import { type Editor, TextSelection, positionFromDOMPoint } from '@trevixal/core'

/**
 * Following a reference inside the document: a cross-reference, an entry in
 * a table of figures or the index, a footnote or endnote marker, a link to a
 * block. Each carries its target as `data-href="#id"`, a span rather than an
 * `<a>` because a real link imports as a link mark.
 *
 * In the editor it takes Ctrl+click (⌘+click on a Mac), as in Word: a plain
 * click has to leave the caret where it lands. A page opened from `#id`
 * scrolls to the block of that id, which is what "Copy link to block" is for.
 */

/** The element a `#id` names inside `root`: an element with the id, or an index term's words. */
export function referenceTarget(root: ParentNode, hash: string): HTMLElement | null {
  const id = hash.replace(/^#/, '')
  if (!id) return null
  let decoded = id
  try {
    decoded = decodeURIComponent(id)
  } catch {
    // A malformed escape is a literal id, which is how the browser reads it too.
  }
  // Compared as attribute values rather than written into a selector: a hash
  // is whatever the address holds, and one decoding to a line break is not a
  // selector any escaping of quotes makes valid.
  const named = (attribute: string): HTMLElement | null => {
    for (const element of root.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
      if (element.getAttribute(attribute) === decoded) return element
    }
    return null
  }
  return named('id') ?? named('data-index-term')
}

/** Put the caret at the start of `target`, and bring it into view. */
function goTo(editor: Editor, target: HTMLElement): void {
  const view = editor.view
  if (!view) return
  target.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  const position = positionFromDOMPoint(view.dom, view.renderer, target, 0)
  if (!position) return
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(position)))
  view.focus()
}

export interface ReferenceNavigation {
  destroy(): void
}

/** Follow references on Ctrl/⌘+click, and the page's own `#id` on load and when it changes. */
export function createReferenceNavigation(editor: Editor): ReferenceNavigation {
  const surface = editor.view?.dom
  const window = surface?.ownerDocument.defaultView
  if (!surface || !window) return { destroy() {} }

  const onClick = (event: MouseEvent): void => {
    if (!(event.ctrlKey || event.metaKey)) return
    const source = (event.target as Element | null)?.closest?.('[data-href^="#"]')
    const hash = source?.getAttribute('data-href')
    const target = hash ? referenceTarget(surface, hash) : null
    if (!target) return
    event.preventDefault()
    goTo(editor, target)
  }

  const onHash = (): void => {
    const target = referenceTarget(surface, window.location.hash)
    if (target) goTo(editor, target)
  }

  surface.addEventListener('click', onClick)
  window.addEventListener('hashchange', onHash)
  onHash()
  return {
    destroy() {
      surface.removeEventListener('click', onClick)
      window.removeEventListener('hashchange', onHash)
    },
  }
}
