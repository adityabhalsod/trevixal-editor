// @vitest-environment happy-dom
import { type Editor, Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PRINT_GUARD_ATTRIBUTE,
  PRINT_GUARD_CSS,
  applyRestrictions,
  restrictionsAllow,
} from '../src'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
const content = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'confidential' }] }],
}

const editors: Editor[] = []

function mountedEditor(): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, content, element: host })
  editors.push(editor)
  return editor
}

function dom(editor: Editor): HTMLElement {
  const view = editor.view
  if (!view) throw new Error('expected a mounted editor')
  return view.dom
}

/** Dispatch a cancelable bubbling event and report whether it was cancelled and whether it reached a later listener. */
function fire(target: HTMLElement, type: string, init: EventInit = {}) {
  const downstream = vi.fn()
  target.addEventListener(type, downstream)
  const event = new Event(type, { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  target.removeEventListener(type, downstream)
  return { prevented: event.defaultPrevented, reachedOthers: downstream.mock.calls.length > 0 }
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
  document.body.innerHTML = ''
  for (const style of document.head.querySelectorAll('style')) style.remove()
})

describe('restrictionsAllow', () => {
  it('allows everything when nothing is restricted', () => {
    expect(restrictionsAllow(undefined, 'copy')).toBe(true)
    expect(restrictionsAllow(null, 'print')).toBe(true)
    expect(restrictionsAllow({}, 'download')).toBe(true)
    expect(restrictionsAllow({ copy: false }, 'copy')).toBe(true)
  })

  it('blocks exactly the flagged actions', () => {
    const restrictions = { copy: true, download: true }
    expect(restrictionsAllow(restrictions, 'copy')).toBe(false)
    expect(restrictionsAllow(restrictions, 'download')).toBe(false)
    expect(restrictionsAllow(restrictions, 'cut')).toBe(true)
    expect(restrictionsAllow(restrictions, 'paste')).toBe(true)
    expect(restrictionsAllow(restrictions, 'contextMenu')).toBe(true)
  })
})

describe('applyRestrictions', () => {
  it('is a no-op on a headless editor', () => {
    const editor = createEditor({ schema, content })
    const dispose = applyRestrictions(editor, { copy: true, print: true })
    expect(editor.view).toBeNull()
    expect(document.head.querySelector(`style[${PRINT_GUARD_ATTRIBUTE}]`)).toBeNull()
    expect(() => dispose()).not.toThrow()
  })

  it('blocks copy and dragstart when copy is restricted, and reports it', () => {
    const editor = mountedEditor()
    const onBlocked = vi.fn()
    applyRestrictions(editor, { copy: true }, { onBlocked })
    expect(fire(dom(editor), 'copy')).toEqual({ prevented: true, reachedOthers: false })
    expect(fire(dom(editor), 'dragstart')).toEqual({ prevented: true, reachedOthers: false })
    expect(onBlocked.mock.calls).toEqual([['copy'], ['copy']])
  })

  it('blocks cut, paste, drop and the context menu individually', () => {
    const editor = mountedEditor()
    const onBlocked = vi.fn()
    applyRestrictions(editor, { cut: true, paste: true, contextMenu: true }, { onBlocked })
    expect(fire(dom(editor), 'cut').prevented).toBe(true)
    expect(fire(dom(editor), 'paste').prevented).toBe(true)
    expect(fire(dom(editor), 'drop').prevented).toBe(true)
    expect(fire(dom(editor), 'contextmenu').prevented).toBe(true)
    expect(onBlocked.mock.calls).toEqual([['cut'], ['paste'], ['paste'], ['contextMenu']])
  })

  it('leaves unrestricted actions alone', () => {
    const editor = mountedEditor()
    const onBlocked = vi.fn()
    applyRestrictions(editor, { cut: true }, { onBlocked })
    expect(fire(dom(editor), 'copy')).toEqual({ prevented: false, reachedOthers: true })
    expect(fire(dom(editor), 'contextmenu')).toEqual({ prevented: false, reachedOthers: true })
    expect(onBlocked).not.toHaveBeenCalled()
  })

  it('runs before listeners the host attached earlier (capture phase)', () => {
    const editor = mountedEditor()
    const host = vi.fn()
    dom(editor).addEventListener('copy', host)
    applyRestrictions(editor, { copy: true })
    dom(editor).dispatchEvent(new Event('copy', { bubbles: true, cancelable: true }))
    expect(host).not.toHaveBeenCalled()
  })

  it('the disposer restores normal behaviour', () => {
    const editor = mountedEditor()
    const onBlocked = vi.fn()
    const dispose = applyRestrictions(editor, { copy: true, contextMenu: true }, { onBlocked })
    expect(fire(dom(editor), 'copy').prevented).toBe(true)
    dispose()
    expect(fire(dom(editor), 'copy')).toEqual({ prevented: false, reachedOthers: true })
    expect(fire(dom(editor), 'contextmenu').prevented).toBe(false)
    expect(onBlocked).toHaveBeenCalledTimes(1)
    expect(() => dispose()).not.toThrow()
  })

  it('injects the print guard stylesheet and removes it on dispose', () => {
    const editor = mountedEditor()
    const dispose = applyRestrictions(editor, { print: true })
    const style = document.head.querySelector(`style[${PRINT_GUARD_ATTRIBUTE}]`)
    expect(style).not.toBeNull()
    expect(style?.textContent).toBe(PRINT_GUARD_CSS)
    expect(PRINT_GUARD_CSS).toContain('@media print')
    expect(PRINT_GUARD_CSS).toContain('.trevixal-content')
    expect(PRINT_GUARD_CSS).toContain('.trevixal-ui')
    expect(PRINT_GUARD_CSS).toContain('display: none !important')
    dispose()
    expect(document.head.querySelector(`style[${PRINT_GUARD_ATTRIBUTE}]`)).toBeNull()
  })

  it('does not inject the print guard unless print is restricted', () => {
    const editor = mountedEditor()
    applyRestrictions(editor, { copy: true })
    expect(document.head.querySelector(`style[${PRINT_GUARD_ATTRIBUTE}]`)).toBeNull()
  })

  it('reports beforeprint while active and stops after dispose', () => {
    const editor = mountedEditor()
    const onBlocked = vi.fn()
    const dispose = applyRestrictions(editor, { print: true }, { onBlocked })
    window.dispatchEvent(new Event('beforeprint'))
    expect(onBlocked).toHaveBeenCalledWith('print')
    dispose()
    window.dispatchEvent(new Event('beforeprint'))
    expect(onBlocked).toHaveBeenCalledTimes(1)
  })

  it('swallows the print shortcut inside the editor but not other keys', () => {
    const editor = mountedEditor()
    const onBlocked = vi.fn()
    applyRestrictions(editor, { print: true }, { onBlocked })
    const print = new KeyboardEvent('keydown', {
      key: 'p',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    dom(editor).dispatchEvent(print)
    expect(print.defaultPrevented).toBe(true)
    // Plain 'p' is not the shortcut (and is not bound by the editor's own keymap either).
    const other = new KeyboardEvent('keydown', { key: 'p', bubbles: true, cancelable: true })
    dom(editor).dispatchEvent(other)
    expect(other.defaultPrevented).toBe(false)
    expect(onBlocked.mock.calls).toEqual([['print']])
  })
})
