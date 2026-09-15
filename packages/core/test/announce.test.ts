// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAnnouncer, describeDocChange } from '../src/a11y/announce'
import { createEditor } from '../src/editor/editor'
import { Fragment } from '../src/model/fragment'
import { pos } from '../src/model/position'
import { ReplaceNodesStep } from '../src/state/steps/replace-nodes'
import { doc, h, p, testSchema } from './helpers'

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

/** `textContent` is defined on Node, several prototypes up from an element. */
function textContentDescriptor(node: object): PropertyDescriptor {
  for (let proto = Object.getPrototypeOf(node); proto; proto = Object.getPrototypeOf(proto)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'textContent')
    if (descriptor) return descriptor
  }
  throw new Error('textContent is not a property of this node')
}

const regions = (root: HTMLElement) => ({
  polite: root.querySelector('[aria-live="polite"]') as HTMLElement,
  assertive: root.querySelector('[aria-live="assertive"]') as HTMLElement,
})

describe('createAnnouncer', () => {
  it('offers a region per priority, each kept in the accessibility tree', () => {
    const announcer = createAnnouncer(document)
    const { polite, assertive } = regions(announcer.element)
    // Not `hidden` and not `display: none`: either would take the region out
    // of the accessibility tree, and nothing would ever be read from it.
    expect(announcer.element.hasAttribute('hidden')).toBe(false)
    expect(announcer.element.getAttribute('style')).not.toMatch(/display:\s*none/)
    expect(polite.getAttribute('role')).toBe('status')
    expect(assertive.getAttribute('role')).toBe('alert')
    // The whole message, not the word that changed.
    expect(polite.getAttribute('aria-atomic')).toBe('true')
    announcer.destroy()
  })

  it('says a message in the region its priority names', () => {
    const announcer = createAnnouncer(document)
    const { polite, assertive } = regions(announcer.element)
    announcer.announce('2 blocks deleted')
    expect(polite.textContent).toBe('2 blocks deleted')
    expect(assertive.textContent).toBe('')
    announcer.announce('Document expired', 'assertive')
    expect(assertive.textContent).toBe('Document expired')
    announcer.destroy()
  })

  it('says the same message twice', () => {
    // A reader watches for the text to change. Writing the value that is
    // already there says nothing, so deleting two blocks and then two more
    // would announce once, exactly when the user most needs to hear it.
    // The region is therefore emptied before each write; these are the writes.
    const announcer = createAnnouncer(document)
    const { polite } = regions(announcer.element)
    const writes: string[] = []
    const descriptor = textContentDescriptor(polite)
    Object.defineProperty(polite, 'textContent', {
      configurable: true,
      get: () => descriptor.get?.call(polite),
      set: (value: string) => {
        writes.push(value)
        descriptor.set?.call(polite, value)
      },
    })

    announcer.announce('2 blocks deleted')
    announcer.announce('2 blocks deleted')

    expect(writes).toEqual(['', '2 blocks deleted', '', '2 blocks deleted'])
    announcer.destroy()
  })

  it('clears itself so a later identical message is still a change', () => {
    vi.useFakeTimers()
    const announcer = createAnnouncer(document, { clearAfterMs: 500 })
    const { polite } = regions(announcer.element)
    announcer.announce('Heading 1')
    expect(polite.textContent).toBe('Heading 1')
    vi.advanceTimersByTime(499)
    expect(polite.textContent).toBe('Heading 1')
    vi.advanceTimersByTime(1)
    expect(polite.textContent).toBe('')
    announcer.destroy()
  })

  it('says nothing for an empty message', () => {
    const announcer = createAnnouncer(document)
    const { polite } = regions(announcer.element)
    announcer.announce('   ')
    expect(polite.textContent).toBe('')
    announcer.destroy()
  })

  it('empties on demand and leaves nothing behind when destroyed', () => {
    const announcer = createAnnouncer(document)
    announcer.announce('one', 'polite')
    announcer.announce('two', 'assertive')
    announcer.clear()
    const { polite, assertive } = regions(announcer.element)
    expect(polite.textContent).toBe('')
    expect(assertive.textContent).toBe('')
    announcer.destroy()
    expect(document.querySelector('.trevixal-announcer')).toBeNull()
  })

  it('lives where it is told to', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const announcer = createAnnouncer(document, { container: host })
    expect(host.contains(announcer.element)).toBe(true)
    announcer.destroy()
  })
})

describe('describeDocChange', () => {
  it('counts blocks that disappeared, and gets the plural right', () => {
    expect(describeDocChange(doc(p('a'), p('b'), p('c')), doc(p('a')))).toBe('2 blocks deleted')
    expect(describeDocChange(doc(p('a'), p('b')), doc(p('a')))).toBe('1 block deleted')
  })

  it('names the kind of block the caret has landed in', () => {
    const before = doc(p('a'))
    expect(describeDocChange(before, doc(h(1, 'a')), 'paragraph', 'heading')).toBe('Heading')
    // A type name is not a label: nobody wants to hear "codeBlock".
    expect(describeDocChange(before, before, 'paragraph', 'codeBlock')).toBe('Code block')
  })

  it('stays quiet about what a reader can already tell', () => {
    // Typing, and the new block an Enter makes, are both reported from the DOM
    // already. Repeating them is what makes people switch live regions off.
    expect(describeDocChange(doc(p('a')), doc(p('ab')), 'paragraph', 'paragraph')).toBeNull()
    expect(describeDocChange(doc(p('a')), doc(p('a'), p('')), 'paragraph', 'paragraph')).toBeNull()
  })
})

describe('the editing surface announces structural edits', () => {
  it('says how many blocks a single edit removed', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({
      schema: testSchema,
      element: host,
      doc: doc(p('one'), p('two'), p('three')),
    })
    const polite = host.querySelector('[aria-live="polite"]') as HTMLElement
    expect(polite).not.toBeNull()

    editor.dispatch(editor.state.tr.step(new ReplaceNodesStep([], 1, 3, Fragment.empty)))
    expect(polite.textContent).toBe('2 blocks deleted')

    editor.destroy()
  })

  it('can be turned off by a host that owns its own live region', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({
      schema: testSchema,
      element: host,
      doc: doc(p('one')),
      announce: false,
    })
    expect(host.querySelector('[aria-live]')).toBeNull()
    editor.destroy()
  })

  it('takes its regions away with it', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema: testSchema, element: host, doc: doc(p('x')) })
    expect(host.querySelector('.trevixal-announcer')).not.toBeNull()
    editor.destroy()
    expect(host.querySelector('.trevixal-announcer')).toBeNull()
  })

  it('leaves the caret alone', () => {
    // The region is off-screen and never focused; announcing must not disturb
    // where the user is typing.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({
      schema: testSchema,
      element: host,
      doc: doc(p('one'), p('two')),
    })
    editor.dispatch(editor.state.tr.step(new ReplaceNodesStep([], 1, 2, Fragment.empty)))
    expect(editor.state.selection.from).toEqual(pos([0], 0))
    editor.destroy()
  })
})
