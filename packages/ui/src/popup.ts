import {
  type Editor,
  type SuggestionListState,
  TextSelection,
  domPointFromPosition,
} from '@trevixal/core'
import { scrollRowIntoView } from './command-palette'
import { type IconName, createIcon } from './icons'

export interface SuggestionPopupOptions<T> {
  readonly editor: Editor
  /** Label for one item (plain text; build your own DOM for richer rows). */
  readonly renderItem: (item: T) => string
  /** An icon to draw before an item's label. */
  readonly iconOf?: (item: T) => IconName | undefined
  /** A quieter line under an item's label, saying what it does. */
  readonly detailOf?: (item: T) => string | undefined
  /** Mouse selection: forward to the suggestion handle's `select(index)`. */
  readonly onPick: (index: number) => void
  /** Message shown when the query has no matches (default: hide). */
  readonly emptyLabel?: string
}

export interface SuggestionPopup<T> {
  /** Feed the `onState` callback of the slash or emoji trigger straight in here. */
  update(state: SuggestionListState<T> | null): void
  readonly element: HTMLElement
  destroy(): void
}

/**
 * A minimal, keyboard-driven popup for the suggestion extensions. Renders
 * into `document.body`, positioned under the caret. Bring your own popup if
 * you need richer rows. The extensions only speak `onState`.
 */
export function createSuggestionPopup<T>(options: SuggestionPopupOptions<T>): SuggestionPopup<T> {
  const doc = options.editor.view?.dom.ownerDocument ?? document
  const element = doc.createElement('div')
  element.className = 'trevixal-popup'
  element.setAttribute('role', 'listbox')
  element.hidden = true
  doc.body.appendChild(element)

  const update = (state: SuggestionListState<T> | null): void => {
    if (!state || (state.items.length === 0 && !options.emptyLabel)) {
      element.hidden = true
      element.replaceChildren()
      return
    }
    element.hidden = false
    const rows = state.items.map((item, index) => {
      const button = doc.createElement('button')
      button.type = 'button'
      button.className =
        index === state.selectedIndex
          ? 'trevixal-popup__item trevixal-popup__item--selected'
          : 'trevixal-popup__item'
      button.setAttribute('role', 'option')
      button.setAttribute('aria-selected', String(index === state.selectedIndex))
      const label = options.renderItem(item)
      const icon = options.iconOf?.(item)
      const detail = options.detailOf?.(item)
      if (icon || detail) {
        button.classList.add('trevixal-popup__item--rich')
        // A row without an icon keeps the icon's column, so labels line up.
        button.appendChild((icon ? createIcon(doc, icon) : null) ?? doc.createElement('span'))
        const text = doc.createElement('span')
        text.className = 'trevixal-popup__label'
        text.textContent = label
        button.appendChild(text)
        if (detail) {
          const line = doc.createElement('span')
          line.className = 'trevixal-popup__detail'
          line.textContent = detail
          button.appendChild(line)
        }
      } else {
        button.textContent = label
      }
      // mousedown, not click: the editor must keep focus and the trigger range.
      button.addEventListener('mousedown', (event) => {
        event.preventDefault()
        options.onPick(index)
      })
      return button
    })
    if (rows.length === 0 && options.emptyLabel) {
      const empty = doc.createElement('span')
      empty.className = 'trevixal-popup__empty'
      empty.textContent = options.emptyLabel
      element.replaceChildren(empty)
    } else {
      // Rebuilding empties the popup, which resets its scroll. Put it back so
      // the list stays put, then bring the highlighted row into view: the
      // popup is shorter than the slash menu, and arrowing past its last
      // visible row would otherwise move the highlight out of sight.
      const scroll = element.scrollTop
      element.replaceChildren(...rows)
      element.scrollTop = scroll
      const selected = rows[state.selectedIndex]
      if (selected) scrollRowIntoView(element, selected)
    }
    position()
  }

  const position = (): void => {
    const view = options.editor.view
    const selection = options.editor.state.selection
    if (!view || !(selection instanceof TextSelection)) return
    const point = domPointFromPosition(view.dom, view.renderer, selection.head)
    if (!point) return
    try {
      const range = doc.createRange()
      range.setStart(point.node, point.offset)
      range.collapse(true)
      const rect = range.getBoundingClientRect()
      const win = doc.defaultView
      element.style.left = `${rect.left + (win?.scrollX ?? 0)}px`
      element.style.top = `${rect.bottom + (win?.scrollY ?? 0) + 4}px`
    } catch {
      // Geometry APIs vary across test environments; the popup still shows.
    }
  }

  return {
    element,
    update,
    destroy: () => element.remove(),
  }
}
