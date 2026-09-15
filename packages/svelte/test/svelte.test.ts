import {
  type EditorSnapshot,
  Schema,
  createEditor,
  defaultMarks,
  defaultNodes,
} from '@trevixal/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { editorStore, trevixalEditor } from '../src/index'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('trevixalEditor action', () => {
  it('mounts and destroys the view', () => {
    const editor = createEditor({ schema })
    const node = document.createElement('div')
    document.body.appendChild(node)
    const action = trevixalEditor(node, { editor })
    expect(node.querySelector('.trevixal-content')).not.toBeNull()
    editor.commands.insertText('salut')
    expect(node.textContent).toBe('salut')
    action.destroy()
    expect(node.querySelector('.trevixal-content')).toBeNull()
    editor.destroy()
  })

  it('update swaps editors and toggles editable', () => {
    const first = createEditor({ schema })
    const second = createEditor({ schema })
    const node = document.createElement('div')
    document.body.appendChild(node)
    const action = trevixalEditor(node, { editor: first })
    action.update({ editor: second })
    expect(second.view).not.toBeNull()
    action.update({ editor: second, editable: false })
    expect(second.isEditable).toBe(false)
    action.destroy()
    first.destroy()
    second.destroy()
  })
})

describe('editorStore', () => {
  it('implements the Svelte store contract', () => {
    const editor = createEditor({ schema })
    const seen: EditorSnapshot[] = []
    const unsubscribe = editorStore(editor).subscribe((snapshot) => seen.push(snapshot))
    expect(seen).toHaveLength(1) // immediate emission, per the contract
    editor.commands.insertText('x')
    editor.commands.setHeading(1)
    expect(seen.length).toBeGreaterThanOrEqual(3)
    expect(seen[seen.length - 1]?.blockType).toBe('heading')
    unsubscribe()
    const count = seen.length
    editor.commands.insertText('y')
    expect(seen.length).toBe(count)
    editor.destroy()
  })
})
