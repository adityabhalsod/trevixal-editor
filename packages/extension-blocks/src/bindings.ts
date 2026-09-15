import { ADD_TO_HISTORY, type Editor, SetNodeAttrsStep, pathOfElement } from '@trevixal/core'
import { setAccordionItemOpenAt } from './accordion'
import { activateTabAt } from './tabs'

/**
 * The DOM half of the container blocks.
 *
 * Tabs and accordions look interactive, and `<details>` really is, but the
 * document is the source of truth, so a click on a tab title and a native
 * fold both have to be written back as attribute changes. Without this, a
 * user's folding would vanish on the next render and never survive a save.
 *
 * Folding is a view preference rather than an edit, so these transactions
 * stay out of the undo history.
 */
export function blockBindings(editor: Editor): () => void {
  const view = editor.view
  if (!view) return () => undefined
  const root = view.dom

  /** The model path of the element a DOM event landed in. */
  const pathOf = (element: Element | null): readonly number[] | null => {
    if (!element) return null
    return pathOfElement(root, view.renderer, element as HTMLElement)
  }

  const onMouseDown = (event: MouseEvent): void => {
    const target = event.target as Element | null
    const title = target?.closest?.('.trevixal-tabs__title')
    if (!title) return
    const panel = title.closest('.trevixal-tabs__panel')
    const path = pathOf(panel)
    if (!path) return
    const tr = activateTabAt(editor.state, [...path])
    // Already the active tab: leave the click alone so the caret can land in
    // the title and the user can rename it.
    if (!tr) return
    event.preventDefault()
    editor.dispatch(tr.setMeta(ADD_TO_HISTORY, false))
  }

  /**
   * `<details>` toggles itself; we mirror the result into the model. The
   * event does not bubble, so it is caught in the capture phase.
   */
  const onToggle = (event: Event): void => {
    const element = event.target as HTMLElement | null
    if (!element || element.tagName !== 'DETAILS') return
    const open = (element as HTMLDetailsElement).open
    const path = pathOf(element)
    if (!path) return
    const node = nodeAt(editor, path)
    if (!node) return

    if (node.type.name === 'accordionItem') {
      // The command closes the siblings itself when the accordion is
      // exclusive, so opening one item shuts the rest in the same step.
      const tr = setAccordionItemOpenAt(editor.state.tr, [...path], open)
      if (!tr) return
      editor.dispatch(tr.setMeta(ADD_TO_HISTORY, false))
      return
    }

    if (node.type.name === 'toggleBlock' && node.attrs.open !== open) {
      editor.dispatch(
        editor.state.tr
          .step(new SetNodeAttrsStep([...path], { ...node.attrs, open }))
          .setMeta(ADD_TO_HISTORY, false),
      )
    }
  }

  root.addEventListener('mousedown', onMouseDown)
  root.addEventListener('toggle', onToggle, true)
  return () => {
    root.removeEventListener('mousedown', onMouseDown)
    root.removeEventListener('toggle', onToggle, true)
  }
}

/** The node at a path in the editor's current document, or null. */
function nodeAt(editor: Editor, path: readonly number[]) {
  let node = editor.state.doc
  for (const index of path) {
    const child = node.content.maybeChild(index)
    if (!child) return null
    node = child
  }
  return node
}
