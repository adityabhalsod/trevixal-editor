import { type Editor, listSchemesCSS, namedStylesCSS } from '@trevixal/core'

/**
 * The editor's named styles, drawn: the document's own definitions (a Normal
 * it changed, styles it made, the list schemes it defined) as a stylesheet
 * scoped to this editing surface alone, so two editors on a page can each
 * have their own Normal. Redrawn only when the definitions change; every
 * paragraph in a style, and every list in a scheme, follows at once, since
 * each is drawn by the one rule.
 */

let scopes = 0

export interface NamedStyleSheet {
  destroy(): void
}

export function createNamedStyleSheet(editor: Editor): NamedStyleSheet {
  const view = editor.view
  if (!view) return { destroy() {} }
  const document = view.dom.ownerDocument
  const scope = String(++scopes)
  view.dom.setAttribute('data-trevixal-style-scope', scope)
  const sheet = document.createElement('style')
  sheet.setAttribute('data-trevixal-named-styles', scope)
  document.head.appendChild(sheet)

  // Outranks the stylesheet's own look for the built-in styles, whichever loads last.
  const selector = `.trevixal-content[data-trevixal-style-scope="${scope}"]`
  let drawnStyles: unknown
  let drawnSchemes: unknown
  const draw = (): void => {
    const { doc } = editor.state
    if (doc.attrs.styles === drawnStyles && doc.attrs.listSchemes === drawnSchemes) return
    drawnStyles = doc.attrs.styles
    drawnSchemes = doc.attrs.listSchemes
    sheet.textContent = [namedStylesCSS(doc, selector), listSchemesCSS(doc, selector)]
      .filter(Boolean)
      .join('\n')
  }
  draw()
  const stop = editor.on('update', draw)
  return {
    destroy() {
      stop()
      sheet.remove()
      view.dom.removeAttribute('data-trevixal-style-scope')
    },
  }
}
