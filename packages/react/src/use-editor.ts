import { type Editor, type EditorOptions, type EditorSnapshot, createEditor } from '@trevixal/core'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/**
 * Create an editor for the lifetime of the component. The instance is created
 * eagerly (headless creation touches no DOM, so this is SSR-safe) and
 * destroyed on unmount; StrictMode's double-invoked effects are handled by
 * recreating a destroyed instance.
 */
export function useEditor(options: EditorOptions): Editor {
  const [editor, setEditor] = useState<Editor>(() => createEditor(options))
  // The options object identity changes per render by design; the editor is
  // intentionally created once per mount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: create-once semantics
  useEffect(() => {
    let current = editor
    if (current.isDestroyed) {
      current = createEditor(options)
      setEditor(current)
    }
    return () => current.destroy()
  }, [])
  return editor
}

const emptySubscribe = (): (() => void) => () => {}

/**
 * Subscribe to the editor's toolbar snapshot via `useSyncExternalStore`.
 * The snapshot is reference-stable between transactions, so components
 * re-render only when the editor state actually changed, typing never
 * re-renders the React tree hosting the editor surface itself.
 */
export function useEditorSnapshot(editor: Editor | null): EditorSnapshot | null {
  const subscribe = useCallback(
    (listener: () => void) => (editor ? editor.subscribe(listener) : emptySubscribe()),
    [editor],
  )
  const read = useCallback(() => (editor ? editor.getSnapshot() : null), [editor])
  return useSyncExternalStore(subscribe, read, read)
}
