import {
  type Attrs,
  type Editor,
  type EditorNode,
  type EditorOptions,
  type EditorSnapshot,
  EditorView,
  type NodeViewFactory,
  SetNodeAttrsStep,
  createEditor,
  nodeAtPath,
  pathOfElement,
} from '@trevixal/core'
import {
  type Component,
  type PropType,
  type ShallowRef,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  render,
  shallowRef,
  watch,
} from 'vue'

/** Props handed to a Vue component rendered as a node view. */
export interface NodeViewProps {
  readonly node: EditorNode
  readonly editor: Editor
  /** Merge new attributes into this node through an ordinary transaction. */
  readonly updateAttrs: (attrs: Attrs) => void
}

/**
 * Turn a Vue component into a node view.
 *
 * The component is rendered into a container the editor owns, with `render`
 * rather than a second `createApp`, so it shares the host application's
 * context and is torn down with the node it belongs to.
 *
 * The node is passed by value and re-rendered on every update, rather than
 * handed a reactive proxy: the document is immutable, so a new node *is* the
 * change, and a proxy over it would only invite someone to write to a node
 * that no longer exists.
 */
function nodeViewFactory(component: Component, editor: Editor): NodeViewFactory {
  return (node) => {
    const dom = document.createElement('div')
    dom.dataset.trevixalNodeView = ''
    // An atom's DOM is not editable: the component owns what is inside it.
    dom.contentEditable = 'false'

    const updateAttrs = (attrs: Attrs): void => {
      const view = editor.view
      if (!view) return
      // Resolved at click time, not at render time: the node may have moved
      // since, and a stale path would write to whatever is there now.
      const path = pathOfElement(view.dom, view.renderer, dom)
      if (!path) return
      const current = nodeAtPath(editor.state.doc, path)
      if (!current) return
      editor.dispatch(
        editor.state.tr.step(new SetNodeAttrsStep(path, { ...current.attrs, ...attrs })),
      )
    }

    const draw = (next: EditorNode): void => {
      render(h(component, { node: next, editor, updateAttrs }), dom)
    }
    draw(node)

    return {
      dom,
      update(next) {
        draw(next)
        return true
      },
      destroy() {
        render(null, dom)
      },
    }
  }
}

/**
 * Create an editor for the component's lifetime. Creation is headless and
 * DOM-free (SSR-safe); the DOM view attaches via `<EditorContent>`.
 */
export function useEditor(options: EditorOptions): ShallowRef<Editor | null> {
  const editorRef = shallowRef<Editor | null>(createEditor(options))
  onBeforeUnmount(() => {
    editorRef.value?.destroy()
    editorRef.value = null
  })
  return editorRef
}

/** The editor's toolbar snapshot as a shallow ref, updated per transaction. */
export function useEditorSnapshot(
  editorRef: ShallowRef<Editor | null>,
): ShallowRef<EditorSnapshot | null> {
  const snapshot = shallowRef<EditorSnapshot | null>(null)
  let unsubscribe: (() => void) | null = null
  watch(
    editorRef,
    (editor) => {
      unsubscribe?.()
      unsubscribe = editor
        ? editor.subscribe(() => {
            snapshot.value = editor.getSnapshot()
          })
        : null
      snapshot.value = editor?.getSnapshot() ?? null
    },
    { immediate: true },
  )
  onBeforeUnmount(() => unsubscribe?.())
  return snapshot
}

/**
 * Mounts the contenteditable surface. The editor DOM lives outside Vue's
 * virtual DOM, typing never triggers component re-renders.
 */
export const EditorContent = defineComponent({
  name: 'TrevixalEditorContent',
  props: {
    editor: { type: Object as PropType<Editor | null>, default: null },
    /** Vue components rendered as node views, keyed by node type name. */
    nodeViews: {
      type: Object as PropType<Readonly<Record<string, Component>>>,
      default: undefined,
    },
    placeholder: { type: String, default: undefined },
    editable: { type: Boolean, default: true },
    autofocus: { type: Boolean, default: false },
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let view: EditorView | null = null

    const attach = (editor: Editor | null): void => {
      view?.destroy()
      view = null
      if (editor && !editor.isDestroyed && host.value) {
        const nodeViews: Record<string, NodeViewFactory> = {}
        for (const [name, component] of Object.entries(props.nodeViews ?? {})) {
          nodeViews[name] = nodeViewFactory(component, editor)
        }
        view = new EditorView(editor, host.value, {
          placeholder: props.placeholder,
          editable: props.editable,
          autofocus: props.autofocus,
          ...(Object.keys(nodeViews).length > 0 ? { nodeViews } : {}),
        })
      }
    }

    onMounted(() => attach(props.editor))
    watch(
      () => props.editor,
      (editor) => attach(editor),
    )
    watch(
      () => props.editable,
      (editable) => view?.setEditable(editable),
    )
    onBeforeUnmount(() => {
      view?.destroy()
      view = null
    })

    return () => h('div', { ref: host, 'data-trevixal-editor': '' })
  },
})
