import {
  type Editor,
  type EditorNode,
  EditorView,
  type NodeViewFactory,
  SetNodeAttrsStep,
  nodeAtPath,
  pathOfElement,
} from '@trevixal/core'
import { type ComponentType, type ReactElement, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Props handed to a React node-view component rendered inside the document. */
export interface NodeViewProps {
  readonly node: EditorNode
  readonly editor: Editor
  /** Merge new attributes into this node via a regular transaction. */
  readonly updateAttrs: (attrs: Record<string, unknown>) => void
}

export interface EditorContentProps {
  readonly editor: Editor | null
  /** React components rendered as node views (via portals into the document). */
  readonly nodeViews?: Readonly<Record<string, ComponentType<NodeViewProps>>>
  readonly placeholder?: string
  readonly editable?: boolean
  readonly autofocus?: boolean
  readonly className?: string
}

interface PortalEntry {
  readonly id: string
  readonly name: string
  readonly element: HTMLElement
  readonly node: EditorNode
}

let nextViewId = 0

/**
 * Mounts the contenteditable surface. The editor DOM lives outside React's
 * reconciliation, typing updates it directly and never re-renders the tree.
 * Node-view components render through portals into widget elements the core
 * renderer owns.
 */
export function EditorContent(props: EditorContentProps): ReactElement {
  const { editor, nodeViews, placeholder, editable, autofocus, className } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [portals, setPortals] = useState<ReadonlyMap<string, PortalEntry>>(new Map())

  // Recreating the view is only correct when the editor instance changes;
  // the remaining props are mount-time view configuration.
  // biome-ignore lint/correctness/useExhaustiveDependencies: view options are mount-time config
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!editor || editor.isDestroyed || !host) return

    const factories: Record<string, NodeViewFactory> = {}
    for (const name of Object.keys(nodeViews ?? {})) {
      factories[name] = (node) => {
        const id = `trevixal-nv-${nextViewId++}`
        const element = host.ownerDocument.createElement('div')
        element.dataset.trevixalNodeView = name
        setPortals((previous) => new Map(previous).set(id, { id, name, element, node }))
        return {
          dom: element,
          update(next) {
            setPortals((previous) => {
              const map = new Map(previous)
              map.set(id, { id, name, element, node: next })
              return map
            })
            return true
          },
          destroy() {
            setPortals((previous) => {
              const map = new Map(previous)
              map.delete(id)
              return map
            })
          },
        }
      }
    }

    const view = new EditorView(editor, host, {
      nodeViews: factories,
      placeholder,
      editable,
      autofocus,
    })
    viewRef.current = view
    return () => {
      viewRef.current = null
      view.destroy()
      setPortals(new Map())
    }
  }, [editor])

  // `editable` is the one view option that has to stay live: flipping it must
  // reach the mounted view instead of waiting for the next editor instance.
  useLayoutEffect(() => {
    viewRef.current?.setEditable(editable !== false)
  }, [editable])

  const updateAttrsFor = (element: HTMLElement) => (attrs: Record<string, unknown>) => {
    const view = editor?.view
    if (!editor || !view) return
    const path = pathOfElement(view.dom, view.renderer, element)
    if (!path) return
    const node = nodeAtPath(editor.state.doc, path)
    if (!node) return
    editor.dispatch(editor.state.tr.step(new SetNodeAttrsStep(path, { ...node.attrs, ...attrs })))
  }

  return (
    <>
      <div ref={hostRef} className={className} data-trevixal-editor="" />
      {editor &&
        [...portals.values()].map((entry) => {
          const Component = nodeViews?.[entry.name]
          if (!Component) return null
          return createPortal(
            <Component
              node={entry.node}
              editor={editor}
              updateAttrs={updateAttrsFor(entry.element)}
            />,
            entry.element,
            entry.id,
          )
        })}
    </>
  )
}
