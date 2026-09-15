import {
  type Editor,
  type EditorSnapshot,
  EditorView,
  type EditorViewOptions,
} from '@trevixal/core'

/** Options for the `use:trevixalEditor` action. */
export interface EditorActionOptions {
  readonly editor: Editor
  readonly placeholder?: string
  readonly editable?: boolean
  readonly autofocus?: boolean
  readonly nodeViews?: EditorViewOptions['nodeViews']
}

export interface EditorAction {
  update(options: EditorActionOptions): void
  destroy(): void
}

/**
 * Svelte action mounting the editor view on an element:
 * `<div use:trevixalEditor={{ editor }} />`. Works with Svelte 4 stores and
 * Svelte 5 runes alike: the binding itself has no Svelte dependency.
 */
export function trevixalEditor(node: HTMLElement, options: EditorActionOptions): EditorAction {
  let current = options
  let view = attach(node, current)
  return {
    update(next: EditorActionOptions) {
      if (next.editor !== current.editor) {
        view?.destroy()
        view = attach(node, next)
      } else if (next.editable !== current.editable) {
        view?.setEditable(next.editable !== false)
      }
      current = next
    },
    destroy() {
      view?.destroy()
      view = null
    },
  }
}

function attach(node: HTMLElement, options: EditorActionOptions): EditorView | null {
  if (options.editor.isDestroyed) return null
  return new EditorView(options.editor, node, {
    placeholder: options.placeholder,
    editable: options.editable,
    autofocus: options.autofocus,
    nodeViews: options.nodeViews,
  })
}

/** Svelte store contract (`subscribe`), usable as `$snapshot` in components. */
export interface SnapshotStore {
  subscribe(run: (snapshot: EditorSnapshot) => void): () => void
}

/** The editor's toolbar snapshot as a Svelte-compatible readable store. */
export function editorStore(editor: Editor): SnapshotStore {
  return {
    subscribe(run) {
      run(editor.getSnapshot())
      return editor.subscribe(() => run(editor.getSnapshot()))
    },
  }
}
