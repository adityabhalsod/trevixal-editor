// @vitest-environment happy-dom
import {
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  pos,
} from '@trevixal/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBlockDragHandle } from '../src/block-drag-handle'
import { createBubbleMenu, defaultBubbleItems } from '../src/bubble-menu'
import { createLinkPopover } from '../src/link-popover'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

let host: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.appendChild(host)
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/** An editor on an empty paragraph, mounted inside the shared host. */
function mount() {
  const surface = document.createElement('div')
  host.appendChild(surface)
  return createEditor({ schema, element: surface })
}

/** happy-dom lays nothing out, so anything measured has to be told its box. */
function stubRect(element: Element, rect: Partial<DOMRect>): void {
  const box = { left: 0, top: 0, width: 100, height: 20, ...rect }
  element.getBoundingClientRect = () =>
    ({
      ...box,
      right: box.left + box.width,
      bottom: box.top + box.height,
      x: box.left,
      y: box.top,
      toJSON: () => ({}),
    }) as DOMRect
}

/** A selection over the whole first paragraph, reported to the DOM too. */
function selectAll(editor: ReturnType<typeof createEditor>, rect?: Partial<DOMRect>): void {
  editor.commands.selectAll()
  const surface = editor.view?.dom as HTMLElement
  const range = {
    // The real code checks the range is inside the surface before pointing a
    // bubble at it, so the stand-in has to say where it lives.
    commonAncestorContainer: surface,
    getBoundingClientRect: () => ({}),
  } as unknown as Range
  stubRect(range as unknown as Element, rect ?? { left: 40, top: 60, width: 120, height: 18 })
  vi.spyOn(document, 'getSelection').mockReturnValue({
    rangeCount: 1,
    anchorNode: surface,
    getRangeAt: () => range,
  } as unknown as Selection)
}

describe('bubble menu', () => {
  it('offers the inline actions and nothing that belongs in a toolbar', () => {
    // A bubble covers the text it is about, so every extra control is one
    // more thing in the way of reading it.
    const names = defaultBubbleItems().map((item) => item.name)
    expect(names).toEqual(['bold', 'italic', 'underline', 'strikethrough', 'code', 'highlight'])
  })

  it('stays hidden while nothing is selected', () => {
    const editor = mount()
    const bubble = createBubbleMenu(editor, { container: host })
    expect(bubble.element.hidden).toBe(true)
    bubble.destroy()
    editor.destroy()
  })

  it('appears over a selection and toggles a mark through it', () => {
    const editor = mount()
    editor.commands.insertText('hello world')
    const bubble = createBubbleMenu(editor, { container: host })
    stubRect(host, { left: 0, top: 0, width: 800, height: 400 })
    selectAll(editor)
    bubble.refresh()
    expect(bubble.element.hidden).toBe(false)

    const bold = bubble.element.querySelector<HTMLElement>('[data-trevixal-item="bold"]')
    expect(bold).not.toBeNull()
    bold?.click()
    expect(editor.getHTML()).toContain('<strong>')
    bubble.destroy()
    editor.destroy()
  })

  it('stays away from a code block, where a mark would mean nothing', () => {
    const editor = mount()
    editor.commands.insertText('const x = 1')
    editor.commands.setCodeBlock()
    const bubble = createBubbleMenu(editor, { container: host })
    stubRect(host, { left: 0, top: 0, width: 800, height: 400 })
    selectAll(editor)
    bubble.refresh()
    expect(bubble.element.hidden).toBe(true)
    bubble.destroy()
    editor.destroy()
  })

  it('honours a host that has its own rule about when to show', () => {
    const editor = mount()
    editor.commands.insertText('hello')
    const bubble = createBubbleMenu(editor, { container: host, shouldShow: () => false })
    stubRect(host, { left: 0, top: 0, width: 800, height: 400 })
    selectAll(editor)
    bubble.refresh()
    expect(bubble.element.hidden).toBe(true)
    bubble.destroy()
    editor.destroy()
  })

  it('takes itself away when destroyed', () => {
    const editor = mount()
    const bubble = createBubbleMenu(editor, { container: host })
    expect(host.querySelector('.trevixal-bubble')).not.toBeNull()
    bubble.destroy()
    expect(host.querySelector('.trevixal-bubble')).toBeNull()
    editor.destroy()
  })
})

describe('link popover', () => {
  const withLink = () => {
    const editor = mount()
    editor.commands.insertText('trevixal')
    editor.commands.selectAll()
    editor.commands.setLink('https://example.com/a/very/long/path/that/keeps/going/for/ages')
    return editor
  }

  it('stays hidden while the caret is not in a link', () => {
    const editor = mount()
    editor.commands.insertText('plain')
    const popover = createLinkPopover(editor, { container: host })
    expect(popover.element.hidden).toBe(true)
    popover.destroy()
    editor.destroy()
  })

  it('shows the address of the link the caret is in', () => {
    const editor = withLink()
    const popover = createLinkPopover(editor, { container: host })
    popover.refresh()
    expect(popover.element.hidden).toBe(false)
    const href = popover.element.querySelector<HTMLAnchorElement>('.trevixal-linkpopover__href')
    expect(href?.getAttribute('href')).toContain('example.com')
    // Shortened for the eye, whole in the tooltip.
    expect(href?.textContent?.length).toBeLessThanOrEqual(44)
    expect(href?.title).toContain('for/ages')
    popover.destroy()
    editor.destroy()
  })

  it('opens the link in a new tab with the opener cut', () => {
    // A link in a document is untrusted content: leaving `window.opener`
    // connected lets the page it opens rewrite the one that opened it.
    const editor = withLink()
    const opened: string[] = []
    const popover = createLinkPopover(editor, {
      container: host,
      openURL: (value) => opened.push(value),
    })
    popover.refresh()
    popover.element.querySelector<HTMLElement>('[data-trevixal-item="open"]')?.click()
    expect(opened).toEqual(['https://example.com/a/very/long/path/that/keeps/going/for/ages'])
    const anchor = popover.element.querySelector<HTMLAnchorElement>('.trevixal-linkpopover__href')
    expect(anchor?.rel).toBe('noopener noreferrer')
    popover.destroy()
    editor.destroy()
  })

  it('edits the address in place', () => {
    const editor = withLink()
    const popover = createLinkPopover(editor, { container: host })
    popover.refresh()
    popover.element.querySelector<HTMLElement>('[data-trevixal-item="edit"]')?.click()

    const field = popover.element.querySelector<HTMLInputElement>('.trevixal-linkpopover__field')
    expect(field).not.toBeNull()
    expect(field?.value).toContain('example.com')
    if (field) field.value = 'https://trevixal.dev/'
    popover.element.querySelector<HTMLElement>('[data-trevixal-item="apply"]')?.click()
    expect(editor.getHTML()).toContain('https://trevixal.dev/')
    popover.destroy()
    editor.destroy()
  })

  it('refuses an address that is not a document reference', () => {
    // The field is a text box on a page that renders whatever it is given, so
    // what it accepts is a security boundary, not a convenience.
    const editor = withLink()
    const popover = createLinkPopover(editor, { container: host })
    popover.refresh()
    popover.element.querySelector<HTMLElement>('[data-trevixal-item="edit"]')?.click()
    const field = popover.element.querySelector<HTMLInputElement>('.trevixal-linkpopover__field')
    if (field) field.value = 'javascript:alert(1)'
    popover.element.querySelector<HTMLElement>('[data-trevixal-item="apply"]')?.click()
    expect(editor.getHTML()).not.toContain('javascript:')
    popover.destroy()
    editor.destroy()
  })

  it('removes the link without touching the words', () => {
    const editor = withLink()
    const popover = createLinkPopover(editor, { container: host })
    popover.refresh()
    popover.element.querySelector<HTMLElement>('[data-trevixal-item="unlink"]')?.click()
    expect(editor.getHTML()).not.toContain('<a ')
    expect(editor.getText()).toBe('trevixal')
    popover.destroy()
    editor.destroy()
  })
})

describe('block drag handle', () => {
  const threeBlocks = () => {
    const editor = mount()
    editor.commands.insertText('one')
    editor.commands.splitBlock()
    editor.commands.insertText('two')
    editor.commands.splitBlock()
    editor.commands.insertText('three')
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 0))))
    return editor
  }

  it('starts out of the way', () => {
    const editor = threeBlocks()
    const handle = createBlockDragHandle(editor, { container: host })
    expect(handle.element.hidden).toBe(true)
    handle.destroy()
    editor.destroy()
  })

  it('is a real button, so the gesture is not mouse-only', () => {
    // A reordering affordance available only to a pointer is not available at
    // all to anyone using a keyboard or a screen reader.
    const editor = threeBlocks()
    const handle = createBlockDragHandle(editor, { container: host })
    expect(handle.element.tagName).toBe('BUTTON')
    expect(handle.element.getAttribute('aria-label')).toBe('Move this block')
    handle.destroy()
    editor.destroy()
  })

  it('moves a block with Space, the arrow keys and Enter', () => {
    const editor = threeBlocks()
    const surface = editor.view?.dom as HTMLElement
    for (const child of [...surface.children]) stubRect(child, { top: 0, height: 20 })
    stubRect(host, { left: 0, top: 0, width: 800, height: 400 })
    const handle = createBlockDragHandle(editor, { container: host })

    // Hovering the first block is what the pointer would do; the keyboard
    // path starts from the same place.
    surface.dispatchEvent(
      new PointerEvent('pointermove', { clientY: 10, bubbles: true }) as PointerEvent,
    )
    const press = (key: string) =>
      handle.element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

    press(' ')
    expect(handle.element.getAttribute('aria-pressed')).toBe('true')
    press('ArrowDown')
    expect(editor.state.doc.child(0).textContent).toBe('two')
    expect(editor.state.doc.child(1).textContent).toBe('one')
    press('Enter')
    expect(handle.element.hasAttribute('aria-pressed')).toBe(false)

    handle.destroy()
    editor.destroy()
  })

  it('puts the block back when the move is abandoned', () => {
    const editor = threeBlocks()
    const surface = editor.view?.dom as HTMLElement
    for (const child of [...surface.children]) stubRect(child, { top: 0, height: 20 })
    stubRect(host, { left: 0, top: 0, width: 800, height: 400 })
    const handle = createBlockDragHandle(editor, { container: host })
    surface.dispatchEvent(new PointerEvent('pointermove', { clientY: 10, bubbles: true }))

    const before = editor.getText()
    handle.element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    handle.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(handle.element.hasAttribute('aria-pressed')).toBe(false)
    expect(editor.getText()).toBe(before)

    handle.destroy()
    editor.destroy()
  })

  it('will not walk a block off either end', () => {
    const editor = threeBlocks()
    const surface = editor.view?.dom as HTMLElement
    for (const child of [...surface.children]) stubRect(child, { top: 0, height: 20 })
    stubRect(host, { left: 0, top: 0, width: 800, height: 400 })
    const handle = createBlockDragHandle(editor, { container: host })
    surface.dispatchEvent(new PointerEvent('pointermove', { clientY: 10, bubbles: true }))

    const before = editor.getText()
    handle.element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    handle.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(editor.getText()).toBe(before)

    handle.destroy()
    editor.destroy()
  })

  it('takes its grip and its drop line away when destroyed', () => {
    const editor = threeBlocks()
    const handle = createBlockDragHandle(editor, { container: host })
    expect(host.querySelector('.trevixal-blockgrip')).not.toBeNull()
    expect(host.querySelector('.trevixal-blockgrip__drop')).not.toBeNull()
    handle.destroy()
    expect(host.querySelector('.trevixal-blockgrip')).toBeNull()
    expect(host.querySelector('.trevixal-blockgrip__drop')).toBeNull()
    editor.destroy()
  })
})
