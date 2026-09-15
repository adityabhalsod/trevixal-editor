// @vitest-environment happy-dom
import {
  type DocJSON,
  type Editor,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  pos,
} from '@trevixal/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIRROR_META, createSplitView, mirrorEditors } from '../src/split'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

function docOf(...paragraphs: string[]): DocJSON {
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  }
}

const editors: Editor[] = []

beforeEach(() => {
  document.body.innerHTML = ''
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  for (const editor of editors.splice(0)) {
    if (!editor.isDestroyed) editor.destroy()
  }
})

/** A mounted editor and a container for the split pane. */
function setup(content: DocJSON = docOf('hello world')): {
  editor: Editor
  container: HTMLElement
} {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host, content })
  editors.push(editor)
  const container = document.createElement('div')
  document.body.appendChild(container)
  return { editor, container }
}

const srcdoc = (frame: HTMLIFrameElement | null): string => frame?.getAttribute('srcdoc') ?? ''

describe('createSplitView preview', () => {
  it('renders the document into a sandboxed iframe', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container })
    expect(split.mode).toBe('preview')
    expect(split.mirror).toBeNull()
    expect(container.contains(split.element)).toBe(true)
    const sandbox = split.preview?.getAttribute('sandbox') ?? ''
    expect(sandbox).toBe('allow-scripts')
    // Spelled out as its own assertion because it is the one that matters.
    // `allow-scripts` and `allow-same-origin` together are not two permissions
    // but a hole: a frame holding both can reach its embedder, rewrite this
    // very attribute and let itself out. Either alone is safe, and the day
    // somebody adds the second to fix something this should be what stops
    // them.
    expect(sandbox).not.toContain('allow-same-origin')
    expect(split.preview?.getAttribute('title')).toBe('Preview')
    expect(srcdoc(split.preview)).toContain('hello world')
    expect(srcdoc(split.preview)).toContain('<!doctype html>')
    split.destroy()
  })

  it('re-renders once the editor goes quiet', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container })
    editor.commands.insertText('X')
    expect(srcdoc(split.preview)).not.toContain('Xhello')
    vi.advanceTimersByTime(150)
    expect(srcdoc(split.preview)).toContain('Xhello world')
    split.destroy()
  })

  it('honours a custom debounce and refreshes on demand', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container, debounceMs: 500 })
    editor.commands.insertText('X')
    vi.advanceTimersByTime(499)
    expect(srcdoc(split.preview)).not.toContain('Xhello')
    vi.advanceTimersByTime(1)
    expect(srcdoc(split.preview)).toContain('Xhello')

    editor.commands.insertText('Y')
    split.refresh()
    expect(srcdoc(split.preview)).toContain('XYhello')
    split.destroy()
  })

  it('inlines the host’s stylesheet into the preview', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container, styles: 'body { color: rebeccapurple }' })
    expect(srcdoc(split.preview)).toContain('rebeccapurple')
    split.destroy()
  })

  it('stops re-rendering once destroyed', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container })
    const frame = split.preview as HTMLIFrameElement
    split.destroy()
    editor.commands.insertText('X')
    vi.advanceTimersByTime(500)
    expect(srcdoc(frame)).not.toContain('Xhello')
    expect(container.querySelector('.trevixal-split')).toBeNull()
    expect(() => split.refresh()).not.toThrow()
    expect(() => split.destroy()).not.toThrow()
  })
})

describe('createSplitView orientation and mode', () => {
  it('carries the orientation on the root element', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container })
    expect(split.orientation).toBe('horizontal')
    expect(split.element.className).toContain('trevixal-split--horizontal')
    expect(split.element.dataset.orientation).toBe('horizontal')
    split.setOrientation('vertical')
    expect(split.orientation).toBe('vertical')
    expect(split.element.className).toContain('trevixal-split--vertical')
    expect(split.element.className).not.toContain('trevixal-split--horizontal')
    split.destroy()
  })

  it('swaps between the preview and the mirror', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container })
    split.setMode('mirror')
    expect(split.mode).toBe('mirror')
    expect(split.preview).toBeNull()
    expect(split.mirror?.getText()).toBe('hello world')
    expect(split.element.querySelector('.trevixal-split__mirror')).not.toBeNull()

    const mirror = split.mirror as Editor
    split.setMode('preview')
    expect(mirror.isDestroyed).toBe(true)
    expect(split.mirror).toBeNull()
    expect(srcdoc(split.preview)).toContain('hello world')
    split.setMode('preview') // already there: nothing happens
    expect(split.mode).toBe('preview')
    split.destroy()
  })

  it('starts in mirror mode when the host asks for it', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container, mode: 'mirror', orientation: 'vertical' })
    expect(split.mode).toBe('mirror')
    expect(split.orientation).toBe('vertical')
    expect(split.mirror?.view).not.toBeNull()
    // The preview timer has nothing to do in this mode.
    editor.commands.insertText('X')
    vi.advanceTimersByTime(500)
    expect(split.mirror?.getText()).toBe('Xhello world')
    split.destroy()
  })
})

describe('createSplitView mirror', () => {
  it('propagates typing in both directions', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container, mode: 'mirror' })
    const mirror = split.mirror as Editor
    editor.commands.insertText('A')
    expect(mirror.getText()).toBe('Ahello world')
    mirror.commands.insertText('B')
    expect(editor.getText()).toBe('BAhello world')
    expect(mirror.getText()).toBe('BAhello world')
    split.destroy()
  })

  it('keeps the undo history in the primary editor', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container, mode: 'mirror' })
    const mirror = split.mirror as Editor
    mirror.commands.insertText('B')
    expect(editor.canUndo).toBe(true)
    expect(mirror.canUndo).toBe(false)
    editor.undo()
    expect(editor.getText()).toBe('hello world')
    expect(mirror.getText()).toBe('hello world')
    split.destroy()
  })

  it('undoes the primary from the mirror’s own shortcut', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container, mode: 'mirror' })
    const mirror = split.mirror as Editor
    mirror.commands.insertText('B')
    const undo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    mirror.view?.dom.dispatchEvent(undo)
    expect(undo.defaultPrevented).toBe(true)
    expect(editor.getText()).toBe('hello world')
    expect(mirror.getText()).toBe('hello world')

    mirror.view?.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    expect(editor.getText()).toBe('Bhello world')
    expect(mirror.getText()).toBe('Bhello world')
    split.destroy()
  })

  it('detaches both panes when destroyed', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container, mode: 'mirror' })
    const mirror = split.mirror as Editor
    split.destroy()
    expect(mirror.isDestroyed).toBe(true)
    expect(split.mirror).toBeNull()
    expect(container.querySelector('.trevixal-split')).toBeNull()
    expect(document.body.querySelector('.trevixal-split__mirror')).toBeNull()
    // The primary editor lives on, and nothing replays into the dead mirror.
    editor.commands.insertText('X')
    expect(editor.getText()).toBe('Xhello world')
    split.setMode('preview')
    expect(split.mode).toBe('mirror')
  })
})

describe('mirrorEditors', () => {
  it('replays steps between two headless editors', () => {
    const a = createEditor({ schema, content: docOf('one') })
    const b = createEditor({ schema, content: docOf('one') })
    editors.push(a, b)
    const off = mirrorEditors(a, b)
    a.commands.insertText('X')
    expect(b.getText()).toBe('Xone')
    b.commands.insertText('Y')
    expect(a.getText()).toBe('YXone')
    off()
    a.commands.insertText('Z')
    expect(a.getText()).toBe('YXZone')
    expect(b.getText()).toBe('YXone')
  })

  it('marks replayed transactions so they are not replayed back', () => {
    const a = createEditor({ schema, content: docOf('one') })
    const b = createEditor({ schema, content: docOf('one') })
    editors.push(a, b)
    const seen: boolean[] = []
    mirrorEditors(a, b)
    b.onTransaction(({ transaction }) => {
      if (transaction.docChanged) seen.push(transaction.getMeta(MIRROR_META) === true)
    })
    a.commands.insertText('X')
    expect(seen).toEqual([true])
    expect(a.getText()).toBe('Xone')
  })

  it('resynchronizes wholesale when a step cannot apply', () => {
    const a = createEditor({ schema, content: docOf('a longer paragraph', 'second') })
    const b = createEditor({ schema, content: docOf('short') })
    editors.push(a, b)
    mirrorEditors(a, b)
    // The step addresses a block b does not have, so b takes a's document.
    a.dispatch(a.state.tr.setSelection(new TextSelection(pos([1], 0))))
    a.commands.insertText('Q')
    expect(a.getText()).toBe('a longer paragraph\nQsecond')
    expect(b.getText()).toBe(a.getText())
    expect(b.state.doc.childCount).toBe(a.state.doc.childCount)
  })

  it('leaves a destroyed counterpart alone', () => {
    const a = createEditor({ schema, content: docOf('one') })
    const b = createEditor({ schema, content: docOf('one') })
    editors.push(a, b)
    mirrorEditors(a, b)
    b.destroy()
    expect(() => a.commands.insertText('X')).not.toThrow()
    expect(a.getText()).toBe('Xone')
  })
})

describe('createSplitView follows the theme', () => {
  // Real timers here. A MutationObserver delivers its records on a task of
  // its own, which the suite's fake clock would hold indefinitely, and the
  // thing under test is exactly that asynchronous delivery.
  beforeEach(() => {
    vi.useRealTimers()
  })

  /** Let the observer deliver, then let the debounced render run. */
  const settle = (): Promise<void> =>
    new Promise((resolve) => setTimeout(() => setTimeout(() => resolve(), 5), 5))

  it('re-renders the preview when the page changes palette', async () => {
    const { editor, container } = setup()
    let scheme: 'light' | 'dark' = 'light'
    const split = createSplitView(editor, {
      container,
      debounceMs: 0,
      theme: () => ({ scheme, tokens: { 'color-bg': scheme === 'dark' ? '#16161f' : '#ffffff' } }),
    })
    expect(srcdoc(split.preview)).toContain('#ffffff')

    // Switching theme touches no document, so `update` never fires. Left to
    // that alone the pane went on showing the palette it opened with until
    // the next keystroke, a white sheet beside a dark editor, for as long as
    // the reader was only reading.
    scheme = 'dark'
    document.documentElement.dataset.trevixalTheme = 'dark'
    await settle()

    expect(srcdoc(split.preview)).toContain('#16161f')
    expect(srcdoc(split.preview)).toContain('color-scheme: dark')
    split.destroy()
    delete document.documentElement.dataset.trevixalTheme
  })

  it('follows a preset, which changes a different attribute', async () => {
    const { editor, container } = setup()
    let reads = 0
    const split = createSplitView(editor, {
      container,
      debounceMs: 0,
      theme: () => {
        reads++
        return { scheme: 'light' }
      },
    })
    const before = reads

    document.documentElement.dataset.trevixalPreset = 'nord'
    await settle()

    expect(reads).toBeGreaterThan(before)
    split.destroy()
    delete document.documentElement.dataset.trevixalPreset
  })

  it('disconnects the observer on destroy', () => {
    // Asserted on the observer rather than on a re-render: a destroyed pane
    // declines to render anyway, so watching the output cannot tell a
    // disconnected observer from a connected one still firing into a no-op.
    // What is left behind is the leak, and that is what this checks.
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const { editor, container } = setup()
    const split = createSplitView(editor, { container, debounceMs: 0 })
    const before = disconnect.mock.calls.length

    split.destroy()

    expect(disconnect.mock.calls.length).toBeGreaterThan(before)
    disconnect.mockRestore()
  })
})

describe('createSplitView gives its panes what the editor has', () => {
  it('hands the mirrored editor to the host, and tears down what it installed', () => {
    const { editor, container } = setup()
    const installed: string[] = []
    const split = createSplitView(editor, {
      container,
      mode: 'mirror',
      onMirror: (pane) => {
        // A mirror shares the document and nothing else: highlighting is a
        // decoration layer, a diagram an element the view appends, tab titles
        // a click handler, all per editor. A bare mirror shows grey code, no
        // diagrams and titles that do not respond.
        installed.push(pane === editor ? 'primary' : 'mirror')
        return () => installed.push('disposed')
      },
    })

    expect(installed).toEqual(['mirror'])
    expect(split.mirror).not.toBeNull()

    split.destroy()
    expect(installed).toEqual(['mirror', 'disposed'])
  })

  it('disposes what it installed before switching away from mirror mode', () => {
    const { editor, container } = setup()
    const events: string[] = []
    const split = createSplitView(editor, {
      container,
      mode: 'mirror',
      onMirror: () => () => events.push('disposed'),
    })

    split.setMode('preview')

    // Before the editor goes, not after: a disposer reaches into the view it
    // was installed on, and a destroyed editor no longer has one.
    expect(events).toEqual(['disposed'])
    split.destroy()
  })

  it('lets the host draw a block into the preview itself', () => {
    const { editor, container } = setup(docOf('hello world'))
    const split = createSplitView(editor, {
      container,
      renderNode: () => (node) =>
        node.isTextblock ? '<figure class="drawn">a picture</figure>' : null,
    })

    // Syntax colours and a drawn diagram are not in the document, so
    // serializing the document alone produces neither.
    expect(srcdoc(split.preview)).toContain('<figure class="drawn">a picture</figure>')
    expect(srcdoc(split.preview)).not.toContain('hello world')
    split.destroy()
  })

  it('reads the renderer again on every re-render', () => {
    const { editor, container } = setup()
    let label = 'first'
    const split = createSplitView(editor, {
      container,
      debounceMs: 0,
      renderNode: () => (node) => (node.isTextblock ? `<p>${label}</p>` : null),
    })
    expect(srcdoc(split.preview)).toContain('first')

    label = 'second'
    split.refresh()

    expect(srcdoc(split.preview)).toContain('second')
    split.destroy()
  })

  it('inlines the host’s script into the preview page', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, {
      container,
      script: () => 'window.wired = true',
    })

    // The frame cannot be reached from out here, an opaque origin has no
    // document to touch, so behaviour has to travel inside the page. This is
    // the same script the downloaded file carries, which is what keeps a tab
    // strip behaving the same way in both.
    expect(srcdoc(split.preview)).toContain('window.wired = true')
    split.destroy()
  })

  it('reads the script again on every re-render', () => {
    const { editor, container } = setup()
    let label = 'first'
    const split = createSplitView(editor, {
      container,
      debounceMs: 0,
      script: () => `window.label = ${JSON.stringify(label)}`,
    })
    expect(srcdoc(split.preview)).toContain('"first"')

    label = 'second'
    split.refresh()

    // A re-render replaces the whole document, so a script attached once would
    // be gone from the second one onwards.
    expect(srcdoc(split.preview)).toContain('"second"')
    split.destroy()
  })
})

describe('createSplitView keeps the panes together', () => {
  it('carries the scroll link into the preview page', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container })

    // Both halves of it: the frame has to report where the reader put it, and
    // it has to accept being put somewhere.
    expect(srcdoc(split.preview)).toContain('trevixal-split:scroll')
    expect(srcdoc(split.preview)).toContain('trevixal-split:scrollTo')
    split.destroy()
  })

  it('leaves the preview alone when the link is turned off', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container, syncScroll: false })

    expect(srcdoc(split.preview)).not.toContain('trevixal-split:scroll')
    split.destroy()
  })

  it('takes a scroll report from its own frame and from nowhere else', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container })

    // happy-dom lays nothing out, so how far the pane moves cannot be measured
    // here, but whether it moved at all can, and that is the half this is
    // about: any page on the screen can post to this window, so the report has
    // to be checked against the frame it claims to come from.
    const scrolled: number[] = []
    const realScrollTo = window.scrollTo
    window.scrollTo = ((_x: number, y: number) => {
      scrolled.push(y)
    }) as typeof window.scrollTo

    const report = (source: Window | null) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { t: 'trevixal-split:scroll', index: 1, offset: 0.5 },
          source,
        }),
      )

    report(window)
    const afterImposter = scrolled.length
    report(split.preview?.contentWindow ?? null)
    const afterFrame = scrolled.length

    window.scrollTo = realScrollTo

    // Both halves. Without the second the test would pass against a pane that
    // ignored every message, including the real ones.
    expect(afterImposter).toBe(0)
    expect(afterFrame).toBe(1)
    split.destroy()
  })

  it('refuses a report that is not two numbers', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container })
    const scrolled: number[] = []
    const realScrollTo = window.scrollTo
    window.scrollTo = ((_x: number, y: number) => {
      scrolled.push(y)
    }) as typeof window.scrollTo

    for (const data of [
      { t: 'trevixal-split:scroll', index: '1', offset: 0.5 },
      { t: 'trevixal-split:scroll', index: 1 },
      { t: 'trevixal-split:scroll', index: Number.NaN, offset: 0 },
      { t: 'something-else', index: 1, offset: 0 },
      null,
    ]) {
      window.dispatchEvent(
        new MessageEvent('message', { data, source: split.preview?.contentWindow ?? null }),
      )
    }

    window.scrollTo = realScrollTo
    expect(scrolled).toEqual([])
    split.destroy()
  })

  it('stops listening once destroyed', () => {
    const { editor, container } = setup()
    const split = createSplitView(editor, { container })
    const removed: string[] = []
    const realRemove = document.removeEventListener.bind(document)
    document.removeEventListener = ((type: string, ...rest: unknown[]) => {
      removed.push(type)
      return (realRemove as (...args: unknown[]) => void)(type, ...rest)
    }) as typeof document.removeEventListener

    split.destroy()
    document.removeEventListener = realRemove

    // A pane that outlived its editor and went on measuring it every frame
    // would be a leak the page cannot see.
    expect(removed).toContain('scroll')
  })
})
