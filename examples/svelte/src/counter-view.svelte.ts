import {
  type Attrs,
  type Editor,
  type NodeViewFactory,
  SetNodeAttrsStep,
  nodeAtPath,
  pathOfElement,
} from '@trevixal/core'
import { mount, unmount } from 'svelte'
import Counter from './Counter.svelte'

/**
 * Mount a Svelte component as a node view.
 *
 * `@trevixal/svelte` takes factories rather than components, because it
 * imports nothing from Svelte, which is what lets one build serve Svelte 4
 * and 5 alike. Mounting is therefore yours, and this is all of it.
 *
 * The file is named `.svelte.ts` so the compiler treats it as Svelte source:
 * `$state` is a rune, and runes are only legal in compiled files.
 */
export function counterView(editor: Editor): NodeViewFactory {
  return (node) => {
    const dom = document.createElement('div')
    // The component owns what is inside it; no caret goes in there.
    dom.contentEditable = 'false'

    const updateAttrs = (attrs: Attrs): void => {
      const view = editor.view
      if (!view) return
      // Resolved on click: the node may have moved since it was drawn.
      const path = pathOfElement(view.dom, view.renderer, dom)
      if (!path) return
      const current = nodeAtPath(editor.state.doc, path)
      if (!current) return
      editor.dispatch(
        editor.state.tr.step(new SetNodeAttrsStep(path, { ...current.attrs, ...attrs })),
      )
    }

    const props = $state({ node, updateAttrs })
    const instance = mount(Counter, { target: dom, props })
    return {
      dom,
      update(next) {
        props.node = next
        return true
      },
      destroy() {
        void unmount(instance)
      },
    }
  }
}
