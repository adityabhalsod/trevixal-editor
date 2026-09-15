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
 * The adapter takes node-view *factories* rather than components, because
 * this package imports nothing from Svelte. That is what lets one build
 * serve Svelte 4 stores and Svelte 5 runes alike. Mounting is therefore the
 * host's handful of lines, and this is them in full.
 *
 * The file is named `.svelte.ts` so the compiler treats it as Svelte source:
 * `$state` is a rune, and runes are only legal in compiled files.
 */
export function counterView(editor: Editor): NodeViewFactory {
  return (node) => {
    const dom = document.createElement('div')
    // The component owns what is inside it: the editor must not put a caret
    // in there.
    dom.contentEditable = 'false'

    const updateAttrs = (attrs: Attrs): void => {
      const view = editor.view
      if (!view) return
      // Resolved at click time. The node may have moved since it was drawn,
      // and a path captured then would write to whatever is there now.
      const path = pathOfElement(view.dom, view.renderer, dom)
      if (!path) return
      const current = nodeAtPath(editor.state.doc, path)
      if (!current) return
      editor.dispatch(
        editor.state.tr.step(new SetNodeAttrsStep(path, { ...current.attrs, ...attrs })),
      )
    }

    // Reactive, so an update redraws in place rather than re-mounting, which
    // would lose focus and any state the component holds.
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
