import {
  type Editor,
  type EditorOptions,
  Schema,
  TextSelection,
  defaultMarks,
  defaultNodes,
  pos,
} from '@trevixal/core'
import { type JSX, StrictMode, act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorContent } from '../src/editor-content'
import { useEditor } from '../src/use-editor'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

const twoParagraphs = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'second line' }] },
  ],
}

let container: HTMLElement
let root: Root
let captured: Editor | null = null

function App(props: {
  options?: Partial<EditorOptions>
  editable?: boolean
}): JSX.Element {
  const editor = useEditor({ schema, ...props.options })
  captured = editor
  return <EditorContent editor={editor} editable={props.editable} />
}

beforeEach(() => {
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  captured = null
})

afterEach(() => {
  act(() => root.unmount())
})

describe('useEditor content stability', () => {
  it('re-rendering with the same content leaves the selection alone', () => {
    const options = { content: twoParagraphs }
    act(() => {
      root.render(<App options={options} />)
    })
    const editor = captured as Editor
    act(() => {
      editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([1], 3))))
    })
    const before = editor.state.selection
    act(() => {
      root.render(<App options={{ content: twoParagraphs }} />)
    })
    expect(captured).toBe(editor) // create-once: never re-instantiated
    expect(editor.state.selection.eq(before)).toBe(true)
    expect(editor.getText()).toContain('second line')
  })
})

describe('EditorContent editable prop', () => {
  it('honours editable={false} at mount', () => {
    act(() => {
      root.render(<App editable={false} />)
    })
    expect(captured?.isEditable).toBe(false)
    expect(container.querySelector('.trevixal-content')?.getAttribute('aria-readonly')).toBe('true')
  })

  it('propagates a runtime editable toggle to the view', () => {
    act(() => {
      root.render(<App editable={false} />)
    })
    act(() => {
      root.render(<App editable={true} />)
    })
    expect(captured?.isEditable).toBe(true)
    act(() => {
      root.render(<App editable={false} />)
    })
    expect(captured?.isEditable).toBe(false)
  })

  it('does not recreate the view when only editable changes', () => {
    act(() => {
      root.render(<App editable={true} />)
    })
    const surface = container.querySelector('.trevixal-content')
    act(() => {
      root.render(<App editable={false} />)
    })
    expect(container.querySelector('.trevixal-content')).toBe(surface)
  })
})

describe('onChange', () => {
  it('fires exactly once per document transaction', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(<App options={{ onChange }} />)
    })
    act(() => {
      captured?.commands.insertText('abc')
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    act(() => {
      captured?.commands.insertText('d')
    })
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('does not fire for a selection-only transaction', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(<App options={{ onChange, content: twoParagraphs }} />)
    })
    const editor = captured as Editor
    act(() => {
      editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([1], 2))))
    })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('unmount', () => {
  it('destroys the editor and survives a post-unmount dispatch', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(<App options={{ onChange }} />)
    })
    const editor = captured as Editor
    act(() => root.unmount())
    expect(editor.isDestroyed).toBe(true)
    expect(editor.view).toBeNull()
    expect(() => editor.commands.insertText('x')).not.toThrow()
    expect(onChange).not.toHaveBeenCalled()
    expect(container.querySelector('.trevixal-content')).toBeNull()
  })
})

describe('StrictMode', () => {
  it('leaves a live editor with a mounted surface after the double invoke', () => {
    act(() => {
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      )
    })
    expect(captured?.isDestroyed).toBe(false)
    expect(container.querySelectorAll('.trevixal-content')).toHaveLength(1)
    act(() => {
      captured?.commands.insertText('strict')
    })
    expect(container.querySelector('.trevixal-content')?.textContent).toBe('strict')
  })
})
