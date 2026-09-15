import { Schema, defaultMarks, defaultNodes } from '@trevixal/core'
import { mountFullEditor } from '@trevixal/editor-kit'
import { EditorContent, useEditor, useEditorSnapshot } from '@trevixal/react'
import '@trevixal/ui/styles.css'
import '@trevixal/editor-kit/styles.css'
import '../../shared/page.css'
import '../../shared/panel.css'
import { StrictMode, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * The whole editor, mounted from a React effect.
 *
 * There is nothing to configure beyond where it goes and which corner of
 * `localStorage` it keeps its drafts in: the schema, the twenty extensions,
 * the menus, the panels and the panes all live in `@trevixal/editor-kit`.
 *
 * The effect is the important part, not the markup. `mountFullEditor` reaches
 * for `window` the moment it is called, so it cannot run during a render,
 * and its cleanup has to be complete, because React's strict mode mounts,
 * unmounts and mounts again before the page is ever interactive. A `destroy`
 * that left anything behind would show up here as two editors fighting over
 * one autosave draft, in development only, which is the worst kind of bug to
 * be handed.
 */
function FullEditor() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = host.current
    if (!element) return
    const editor = mountFullEditor({
      element,
      namespace: 'trevixal:react',
      aboutRows: [{ term: 'Framework', description: 'React 19, mounted from an effect' }],
    })
    return () => editor.destroy()
  }, [])

  return <div ref={host} data-testid="full-editor" />
}

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

const MARKS = [
  { name: 'bold', label: 'B' },
  { name: 'italic', label: 'I' },
  { name: 'underline', label: 'U' },
] as const

/**
 * The toolbar subscribes to a snapshot, so it re-renders when the *state it
 * shows* changes, not on every keystroke.
 */
function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const renders = useRef(0)
  renders.current += 1
  const snapshot = useEditorSnapshot(editor)
  if (!editor) return null
  return (
    <div className="bar">
      {MARKS.map((mark) => (
        <button
          key={mark.name}
          type="button"
          aria-pressed={snapshot?.activeMarks.includes(mark.name) ?? false}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.commands.toggleMark(mark.name)}
        >
          {mark.label}
        </button>
      ))}
      <span className="count">toolbar renders: {renders.current}</span>
    </div>
  )
}

/**
 * Rendered beside the toolbar and never subscribed to anything. Its count is
 * the point of this panel: it stays at 1 however much you type, because the
 * editor's DOM lives outside React's reconciliation.
 */
function Bystander() {
  const renders = useRef(0)
  renders.current += 1
  return <span className="count">bystander renders: {renders.current}</span>
}

/** The adapter on its own: `useEditor`, a snapshot, and no prebuilt chrome. */
function Adapter() {
  const editor = useEditor({ schema, ariaLabel: 'React adapter example' })
  return (
    <section className="panel">
      <h2>The adapter on its own</h2>
      <p className="note">
        The same engine with none of the chrome, bound by <code>@trevixal/react</code>. Type, then
        watch the two counters: the bystander never re-renders, and the toolbar only does when the
        formatting under the caret changes.
      </p>
      <Toolbar editor={editor} />
      <Bystander />
      <EditorContent editor={editor} placeholder="Write something…" />
    </section>
  )
}

function App() {
  return (
    <>
      <FullEditor />
      <main className="trevixal">
        <Adapter />
      </main>
    </>
  )
}

const root = document.querySelector('#root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
