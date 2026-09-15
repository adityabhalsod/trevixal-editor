# React

```sh
npm install @trevixal/core @trevixal/react @trevixal/ui
```

```tsx
import { Schema, defaultNodes, defaultMarks } from '@trevixal/core'
import { useEditor, useEditorSnapshot, EditorContent } from '@trevixal/react'
import '@trevixal/ui/styles.css'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

function Bold({ editor }) {
  const snapshot = useEditorSnapshot(editor)
  return (
    <button
      aria-pressed={snapshot?.activeMarks.includes('bold')}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => editor.commands.toggleMark('bold')}
    >
      Bold
    </button>
  )
}

export function Editor() {
  const editor = useEditor({ schema })
  return (
    <div className="trevixal">
      <Bold editor={editor} />
      <EditorContent editor={editor} placeholder="Write something…" />
    </div>
  )
}
```

`onMouseDown` is cancelled rather than handled on `click`: a toolbar must not
take the selection the command is about to act on.

## Typing does not re-render your tree

The editor's DOM lives **outside** React's reconciliation, React mounts an
empty container and the view owns what is inside it. A component that does not
call `useEditorSnapshot` renders zero additional times while somebody types;
there is a test that asserts exactly that.

A component that *does* subscribe re-renders only when the state it shows
changes. The snapshot keeps its identity while nothing a toolbar would draw
differently has changed, so ten keystrokes cost two renders. The first,
which flips `canUndo`, and nothing after it.

## React components inside the document

```tsx
import type { NodeViewProps } from '@trevixal/react'

function Counter({ node, updateAttrs }: NodeViewProps) {
  return (
    <button onClick={() => updateAttrs({ count: Number(node.attrs.count) + 1 })}>
      {String(node.attrs.count)}
    </button>
  )
}

<EditorContent editor={editor} nodeViews={{ counter: Counter }} />
```

Node views render through portals, so they are ordinary components with hooks
and context. Hold no state in one: read it from `node`, write it with
`updateAttrs`, and undo will rewind your component along with the document.

A runnable version of all of this is in `examples/react`.
