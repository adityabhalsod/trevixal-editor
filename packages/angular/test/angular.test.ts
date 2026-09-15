// @vitest-environment happy-dom
import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAngularEditor, editorSnapshotSignal } from '../src/index'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

let host: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.appendChild(host)
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('editorSnapshotSignal', () => {
  it('starts at the editor’s current state', () => {
    const editor = createEditor({ schema })
    const { snapshot, unsubscribe } = editorSnapshotSignal(editor)
    expect(snapshot()?.blockType).toBe('paragraph')
    expect(snapshot()?.canUndo).toBe(false)
    unsubscribe()
    editor.destroy()
  })

  it('follows the document', () => {
    const editor = createEditor({ schema, element: host })
    const { snapshot, unsubscribe } = editorSnapshotSignal(editor)
    editor.commands.insertText('hello')
    editor.commands.selectAll()
    editor.commands.toggleMark('bold')
    expect(snapshot()?.activeMarks).toContain('bold')
    expect(snapshot()?.canUndo).toBe(true)
    unsubscribe()
    editor.destroy()
  })

  it('changes only when the state a toolbar shows changes', () => {
    // The snapshot is reference-stable, which is the whole point: a template
    // reading it re-renders when the formatting changes, not on every key.
    const editor = createEditor({ schema, element: host })
    const { snapshot, unsubscribe } = editorSnapshotSignal(editor)
    editor.commands.insertText('abc')
    const before = snapshot()
    editor.commands.insertText('d')
    expect(snapshot()).toBe(before)

    editor.commands.selectAll()
    editor.commands.toggleMark('italic')
    expect(snapshot()).not.toBe(before)
    unsubscribe()
    editor.destroy()
  })

  it('stops following once unsubscribed', () => {
    const editor = createEditor({ schema, element: host })
    const { snapshot, unsubscribe } = editorSnapshotSignal(editor)
    unsubscribe()
    const before = snapshot()
    editor.commands.insertText('hello')
    editor.commands.selectAll()
    editor.commands.toggleMark('bold')
    expect(snapshot()).toBe(before)
    editor.destroy()
  })

  it('is read-only, so a template cannot write to it', () => {
    const editor = createEditor({ schema })
    const { snapshot, unsubscribe } = editorSnapshotSignal(editor)
    expect('set' in snapshot).toBe(false)
    unsubscribe()
    editor.destroy()
  })
})

describe('createAngularEditor', () => {
  it('creates the editor without touching the DOM', () => {
    // A component builds this in a field initialiser, before its template
    // exists, and a server has no DOM at all.
    const binding = createAngularEditor({ schema })
    expect(binding.editor.view).toBeNull()
    expect(document.querySelector('.trevixal-content')).toBeNull()
    expect(binding.snapshot()?.blockType).toBe('paragraph')
    binding.destroy()
  })

  it('mounts the surface where it is told, and takes it away again', () => {
    const binding = createAngularEditor({ schema })
    const detach = binding.attach(host)
    expect(host.querySelector('.trevixal-content')).not.toBeNull()
    binding.editor.commands.insertText('typed')
    expect(host.querySelector('.trevixal-content')?.textContent).toBe('typed')
    detach()
    expect(host.querySelector('.trevixal-content')).toBeNull()
    binding.destroy()
  })

  it('replaces the view rather than stacking a second one', () => {
    // A host that re-renders its container attaches again; two live views on
    // one document would both try to own the DOM.
    const binding = createAngularEditor({ schema })
    binding.attach(host)
    binding.attach(host)
    expect(host.querySelectorAll('.trevixal-content')).toHaveLength(1)
    binding.destroy()
  })

  it('carries view options through', () => {
    const binding = createAngularEditor({ schema, view: { placeholder: 'Write…' } })
    binding.attach(host)
    const surface = host.querySelector<HTMLElement>('.trevixal-content')
    expect(surface?.dataset.trevixalPlaceholder).toBe('Write…')
    binding.destroy()
  })

  it('lets attach override what the binding was created with', () => {
    const binding = createAngularEditor({ schema, view: { placeholder: 'Write…' } })
    binding.attach(host, { placeholder: 'Something else' })
    const surface = host.querySelector<HTMLElement>('.trevixal-content')
    expect(surface?.dataset.trevixalPlaceholder).toBe('Something else')
    binding.destroy()
  })

  it('leaves nothing behind when destroyed', () => {
    const binding = createAngularEditor({ schema })
    binding.attach(host)
    binding.destroy()
    expect(host.querySelector('.trevixal-content')).toBeNull()
    expect(binding.editor.isDestroyed).toBe(true)
  })

  it('survives being destroyed twice', () => {
    // `DestroyRef` and an explicit teardown can both fire; neither should
    // throw because the other went first.
    const binding = createAngularEditor({ schema })
    binding.attach(host)
    binding.destroy()
    expect(() => binding.destroy()).not.toThrow()
  })
})
