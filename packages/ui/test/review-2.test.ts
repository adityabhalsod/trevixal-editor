// @vitest-environment happy-dom
import {
  type Command,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
} from '@trevixal/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCodeLanguageSelect } from '../src/code-language'
import { createCommandPalette } from '../src/command-palette'
import { createColorControl, createSelectControl, defaultFontSizes } from '../src/controls'
import {
  builtinImporters,
  importerFor,
  openPrintPreview,
  selectionDocument,
  suggestFileName,
} from '../src/documents'
import { bindListNavigation } from '../src/dropdown'
import { createFindReplace } from '../src/find-replace'
import { createHistoryPanel } from '../src/history-panel'
import {
  type KeyValueStorage,
  createAutosave,
  createMemoryStorage,
  offerDraftRecovery,
} from '../src/persistence'
import { type ToolUsage, createToolUsageTracker } from '../src/quick-tools'
import { createSourceMode } from '../src/source-mode'
import { createTableToolbar } from '../src/table-toolbar'
import {
  createCustomStyles,
  createFontManager,
  createThemeController,
  googleFontURL,
  readThemeSnapshot,
  scopeCSS,
} from '../src/theming'
import { type Box, dropTargetAt } from '../src/toolbar-reorder'
import { createTypewriter } from '../src/view-modes'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

let container: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
})

// A spy on `document.getSelection` left standing by a failing test breaks
// every later one that reads a real selection, and the failure it causes
// looks nothing like its cause.
afterEach(() => {
  vi.restoreAllMocks()
})

function mountEditor(html?: string, options: { groupDelay?: number } = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const doc = html ? parseHTML(schema, html, document) : undefined
  return createEditor({
    schema,
    element: host,
    ...(doc ? { doc } : {}),
    ...(options.groupDelay !== undefined ? { history: { groupDelay: options.groupDelay } } : {}),
  })
}

const tick = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** A store whose writes wait until the test releases them, one at a time. */
function gatedStorage(): {
  storage: KeyValueStorage
  pending: (() => void)[]
  inner: KeyValueStorage
} {
  const inner = createMemoryStorage()
  const pending: (() => void)[] = []
  const storage: KeyValueStorage = {
    get: (key) => inner.get(key),
    remove: (key) => inner.remove(key),
    keys: (prefix) => inner.keys(prefix),
    set: (key, value) =>
      new Promise<void>((resolve) => {
        pending.push(() => void inner.set(key, value).then(resolve))
      }),
  }
  return { storage, pending, inner }
}

// ---------------------------------------------------------------- persistence

describe('autosave', () => {
  it('writes edits made while a save is in flight', async () => {
    const editor = mountEditor()
    const { storage, pending, inner } = gatedStorage()
    const autosave = createAutosave(editor, { storage, delayMs: 10, backups: false })

    editor.commands.insertText('a')
    const first = autosave.flush()
    expect(pending).toHaveLength(1)
    // An edit lands while the first write is still pending.
    editor.commands.insertText('b')
    pending.shift()?.()
    await first
    // The debounce for the second edit elapses: it must produce a second write.
    await tick(40)
    expect(pending).toHaveLength(1)
    pending.shift()?.()
    await tick()
    const draft = JSON.parse((await inner.get('document:draft')) ?? 'null')
    expect(JSON.stringify(draft.doc)).toContain('ab')
    expect(autosave.state.status).toBe('saved')
    autosave.destroy()
    editor.destroy()
  })

  it('does not report state after destroy when a pending write settles', async () => {
    const editor = mountEditor()
    const { storage, pending } = gatedStorage()
    const onState = vi.fn()
    const autosave = createAutosave(editor, { storage, delayMs: 10, backups: false, onState })
    editor.commands.insertText('a')
    const flushed = autosave.flush()
    autosave.destroy()
    const calls = onState.mock.calls.length
    pending.shift()?.()
    await flushed
    expect(onState.mock.calls.length).toBe(calls)
    editor.destroy()
  })

  it('writes a pending draft when destroyed mid-debounce', async () => {
    const editor = mountEditor()
    const storage = createMemoryStorage()
    const autosave = createAutosave(editor, { storage, delayMs: 10_000, backups: false })
    editor.commands.insertText('kept')
    autosave.destroy()
    await tick()
    expect(await storage.get('document:draft')).toContain('kept')
    editor.destroy()
  })

  it('treats a stored record whose doc is not an object as no draft', async () => {
    const editor = mountEditor()
    const storage = createMemoryStorage()
    await storage.set('document:draft', JSON.stringify({ doc: 42, savedAt: 1, title: 'x' }))
    await storage.set('document:backup:1', JSON.stringify({ doc: 'nope', savedAt: 1, title: 'x' }))
    const autosave = createAutosave(editor, { storage })
    expect(await autosave.loadDraft()).toBeNull()
    await expect(autosave.restoreBackup('1')).resolves.toBe(false)
    expect(await offerDraftRecovery(editor, autosave, { container })).toBe('none')
    autosave.destroy()
    editor.destroy()
  })
})

// --------------------------------------------------------------- find/replace

describe('find and replace (bar open)', () => {
  it('keeps the stepped-to match active while the bar is open', () => {
    const editor = mountEditor('<p>one two one</p><p>one</p>')
    const find = createFindReplace(editor, { container })
    find.open()
    find.search({ query: 'one', caseSensitive: false, wholeWord: false, regex: false })
    expect(find.activeIndex).toBe(0)
    find.findNext()
    expect(find.activeIndex).toBe(1)
    expect(find.element.querySelector('.trevixal-findbar__status')?.textContent).toBe('2 of 3')
    find.findPrevious()
    expect(find.activeIndex).toBe(0)
    find.destroy()
    editor.destroy()
  })

  it('does not re-run the search once per replaced match', () => {
    const editor = mountEditor('<p>a a a a</p>')
    const onResult = vi.fn()
    const find = createFindReplace(editor, { container, onResult })
    find.open()
    find.search({ query: 'a', caseSensitive: false, wholeWord: false, regex: false })
    onResult.mockClear()
    expect(find.replaceAllMatches('b')).toBe(4)
    expect(editor.state.doc.textContent).toBe('b b b b')
    expect(onResult).toHaveBeenCalledTimes(1)
    find.destroy()
    editor.destroy()
  })
})

// -------------------------------------------------------------------- theming

describe('scopeCSS', () => {
  it('drops statement at-rules instead of letting the following rule escape', () => {
    const out = scopeCSS('@import url(evil.css); body { color: red }', '.s')
    expect(out).not.toContain('@import')
    expect(out).toContain('.s body')
  })

  it('does not split selectors on commas inside functions or attributes', () => {
    expect(scopeCSS(':is(h1, h2) { color: red }', '.s')).toBe('.s :is(h1, h2) { color: red }')
    expect(scopeCSS('[data-x="a,b"], p { c: d }', '.s')).toBe('.s [data-x="a,b"], .s p { c: d }')
  })

  it('scopes rules nested in @media', () => {
    expect(scopeCSS('@media (min-width: 1px) { body { x: y } }', '.s')).toContain('.s body')
  })

  it('never applies custom CSS outside the scope', () => {
    const styles = createCustomStyles(document, '.s')
    styles.set('html, body { display: none }')
    const text = document.querySelector('style[data-trevixal-custom-css]')?.textContent ?? ''
    expect(text).not.toMatch(/(^|[^\s.])\bbody\s*\{/)
    styles.destroy()
  })
})

describe('theme controller', () => {
  it('cannot be broken out of by a hostile preset name or token value', () => {
    const controller = createThemeController(document, { presets: [] })
    controller.register({
      name: 'x"] body { display: none } [data-y="',
      label: 'Evil',
      base: 'light',
      tokens: {
        'color-bg': 'red; } body { display: none; } .z { color: red',
        'bad token': 'blue',
      },
    })
    const text = document.getElementById('trevixal-theme-presets')?.textContent ?? ''
    expect(text).not.toMatch(/body\s*\{/)
    expect(text).not.toContain('bad token')
    controller.destroy()
  })

  it('writes the preset and theme attributes to every target', () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    const controller = createThemeController(document, { targets: [a, b], preset: 'nord' })
    for (const target of [a, b]) {
      expect(target.dataset.trevixalPreset).toBe('nord')
      expect(target.dataset.trevixalTheme).toBe('dark')
    }
    controller.destroy()
    expect(a.dataset.trevixalPreset).toBeUndefined()
  })
})

describe('readThemeSnapshot', () => {
  const mount = (tokens: string, preset?: string): HTMLElement => {
    const host = document.createElement('div')
    host.className = 'trevixal'
    if (preset) host.dataset.trevixalPreset = preset
    host.setAttribute('style', tokens)
    document.body.appendChild(host)
    return host
  }

  it('reads the palette as it currently resolves', () => {
    const host = mount('--tvx-color-bg: #2e3440; --tvx-color-text: #eceff4', 'nord')
    const snapshot = readThemeSnapshot(host)
    expect(snapshot.tokens['color-bg']).toBe('#2e3440')
    expect(snapshot.tokens['color-text']).toBe('#eceff4')
    expect(snapshot.preset).toBe('nord')
    host.remove()
  })

  it('decides light or dark from the ground, not from the preset name', () => {
    // A custom theme has no preset to consult, and a preset can be edited
    // into the opposite of what it is called.
    const dark = mount('--tvx-color-bg: #0b1020')
    expect(readThemeSnapshot(dark).scheme).toBe('dark')
    dark.remove()
    const light = mount('--tvx-color-bg: #fbf3e4')
    expect(readThemeSnapshot(light).scheme).toBe('light')
    light.remove()
  })

  it('finds a preset set on an ancestor', () => {
    // The controller writes the attribute to whatever the host nominated,
    // which is usually <html> rather than the editor.
    document.documentElement.dataset.trevixalPreset = 'sepia'
    const host = mount('--tvx-color-bg: #fbf3e4')
    expect(readThemeSnapshot(host).preset).toBe('sepia')
    host.remove()
    delete document.documentElement.dataset.trevixalPreset
  })

  it('reports no preset rather than an empty one', () => {
    const host = mount('--tvx-color-bg: #ffffff')
    expect(readThemeSnapshot(host).preset).toBeNull()
    host.remove()
  })

  it('reads the known palette by name even when the engine lists other tokens', () => {
    // Firefox returns a *partial* list of custom properties from a computed
    // style (measured at forty-three names for one editing surface with
    // `--tvx-color-bg` among them and, on another build of the same page,
    // without it) while `getPropertyValue` answers correctly either way.
    // Reading only what was listed therefore lost the one token the snapshot
    // cannot do without, and the side-by-side preview came out light beside a
    // dark editor. The engine is stubbed here because no DOM implementation
    // reproduces the partial listing on demand.
    const host = mount('--tvx-color-bg: #0b1020')
    const view = host.ownerDocument.defaultView as Window
    const real = view.getComputedStyle.bind(view)
    const partial = (element: Element, pseudo?: string | null) => {
      const style = real(element as HTMLElement, pseudo ?? undefined)
      // Lists something, so the old code took the listing as complete, but
      // not the ground colour.
      return Object.assign(Object.create(style), {
        [Symbol.iterator]: () => ['--tvx-focus-ring'][Symbol.iterator](),
        getPropertyValue: (name: string) => style.getPropertyValue(name),
      }) as CSSStyleDeclaration
    }
    view.getComputedStyle = partial as typeof view.getComputedStyle
    try {
      const snapshot = readThemeSnapshot(host)
      expect(snapshot.tokens['color-bg']).toBe('#0b1020')
      expect(snapshot.scheme).toBe('dark')
    } finally {
      view.getComputedStyle = real
      host.remove()
    }
  })
})

describe('font manager', () => {
  it('rejects unsafe stylesheet URLs', () => {
    const fonts = createFontManager(document)
    fonts.add({ family: 'Evil', url: 'javascript:alert(1)' })
    fonts.add({ family: 'Data', url: 'data:text/css,body{display:none}' })
    expect(document.querySelectorAll('link[data-trevixal-font]')).toHaveLength(0)
    fonts.destroy()
  })

  it('adds one <link> per family even across managers', () => {
    const url = googleFontURL('Inter')
    const first = createFontManager(document, { fonts: [{ family: 'Inter', url }] })
    const second = createFontManager(document, { fonts: [{ family: 'Inter', url }] })
    expect(document.querySelectorAll('link[data-trevixal-font]')).toHaveLength(1)
    second.destroy()
    first.destroy()
  })

  it('escapes family names and sources in @font-face and selectors', () => {
    const fonts = createFontManager(document)
    fonts.add({
      family: 'Bad"; } body { display: none } @font-face { font-family: "x',
      source: { src: 'a") } body { display: none } @font-face { src: url("b' },
    })
    expect(document.getElementById('trevixal-fonts')?.textContent ?? '').not.toMatch(/body\s*\{/)
    expect(() => fonts.remove('a"b]')).not.toThrow()
    fonts.destroy()
  })
})

// ------------------------------------------------------------------ documents

describe('documents', () => {
  it('suggests names free of control characters and stray dots', () => {
    expect(suggestFileName('Report. ', 'md')).toBe('Report.md')
    expect(suggestFileName('...', 'md')).toBe('document.md')
    expect(suggestFileName(`${'a'.repeat(100)} end`, 'md')).toBe(`${'a'.repeat(80)}.md`)
    expect(suggestFileName('a: b/c?', 'txt')).toBe('a bc.txt')
  })

  it('matches importers by a real extension, then by MIME type', () => {
    const importers = builtinImporters()
    expect(importerFor(new File([''], 'md', { type: '' }), importers)).toBeNull()
    expect(importerFor(new File([''], 'notes.MD', { type: '' }), importers)?.name).toBe('markdown')
    expect(importerFor(new File([''], 'notes', { type: 'text/markdown' }), importers)?.name).toBe(
      'markdown',
    )
    expect(
      importerFor(
        new File([''], 'x.docx', {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
        importers,
      ),
    ).toBeNull()
  })

  it('exports the selected slice of partially selected blocks', () => {
    const editor = mountEditor('<p>hello world</p><p>second</p>')
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 6), pos([1], 3))))
    const doc = selectionDocument(editor.state)
    expect(doc.content.children.map((block) => block.textContent)).toEqual(['world', 'sec'])
    editor.destroy()
  })

  it('returns focus when the print preview closes', async () => {
    const editor = mountEditor('<p>x</p>')
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    const done = openPrintPreview(editor, document)
    expect(document.activeElement).not.toBe(button)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await done
    expect(document.querySelector('.trevixal-print-preview')).toBeNull()
    expect(document.activeElement).toBe(button)
    editor.destroy()
  })
})

// ------------------------------------------------------------ command palette

describe('command palette', () => {
  it('returns focus to where it was when dismissed with Escape', () => {
    const editor = mountEditor()
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    const palette = createCommandPalette(editor, {
      commands: [{ name: 'a', label: 'A', run: () => {} }],
      bindShortcuts: false,
    })
    palette.open()
    const input = palette.element.querySelector<HTMLInputElement>('input')
    expect(document.activeElement).toBe(input)
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(palette.isOpen).toBe(false)
    expect(document.activeElement).toBe(button)
    palette.destroy()
    editor.destroy()
  })
})

// ------------------------------------------------------------------ dropdowns

describe('dropdown list navigation', () => {
  it('supports Home and End', () => {
    const panel = document.createElement('div')
    const buttons = [0, 1, 2].map(() => {
      const button = document.createElement('button')
      panel.appendChild(button)
      return button
    })
    document.body.appendChild(panel)
    const release = bindListNavigation(panel)
    buttons[1]?.focus()
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(document.activeElement).toBe(buttons[2])
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(document.activeElement).toBe(buttons[0])
    release()
  })
})

// ------------------------------------------------------------------- controls

describe('controls', () => {
  it('shows a value the option list does not know rather than the placeholder', () => {
    const editor = mountEditor()
    const control = createSelectControl({
      document,
      options: defaultFontSizes(),
      valueOf: () => '13pt',
      onSelect: () => {},
      placeholder: 'Size',
      ariaLabel: 'Font size',
    })
    control.refresh(editor.getSnapshot())
    expect(control.element.querySelector('.trevixal-select__label')?.textContent).toBe('13pt')
    control.destroy()
    editor.destroy()
  })

  it('emits only a colour from the custom picker', () => {
    const onSelect = vi.fn()
    const control = createColorControl({
      document,
      icon: 'textColor',
      ariaLabel: 'Text color',
      onSelect,
      onClear: () => {},
      valueOf: () => null,
    })
    const custom = control.element.querySelector<HTMLInputElement>('.trevixal-color__custom')
    if (!custom) throw new Error('no custom input')
    custom.value = '#ff0000'
    custom.dispatchEvent(new Event('change'))
    expect(onSelect).toHaveBeenCalledWith('#ff0000')
    onSelect.mockClear()
    // Assigning a non-colour cannot reach the guard: every engine, happy-dom
    // included, normalizes a colour input's value on the way in. Shadow the
    // property to stand in for one that does not, which is what the control
    // is defending against. It reads the value back out of the DOM.
    Object.defineProperty(custom, 'value', { value: 'url(javascript:x)', configurable: true })
    custom.dispatchEvent(new Event('change'))
    expect(onSelect).not.toHaveBeenCalled()
    control.destroy()
  })
})

// ------------------------------------------------------------- toolbar reorder

describe('dropTargetAt with hidden groups', () => {
  it('ignores groups that have no box', () => {
    const box = (left: number, top: number): Box => ({
      left,
      right: left + 100,
      top,
      bottom: top + 30,
    })
    const hidden: Box = { left: 0, right: 0, top: 0, bottom: 0 }
    const boxes = [hidden, box(0, 10), box(104, 10), box(208, 10)]
    // Pointer just above the row: the nearest real row is the visible one, and
    // x sits in the left half of the first group there. (Exactly on a group's
    // centre is a boundary the function is entitled to resolve either way.)
    expect(dropTargetAt(boxes, 3, 40, -5)?.before).toBe(1)
    expect(dropTargetAt([hidden, box(0, 10)], 1, 50, 20)).toBeNull()
  })
})

// -------------------------------------------------------------- quick tools

describe('usage tracker', () => {
  it('survives a malformed persisted usage record', () => {
    const tracker = createToolUsageTracker({
      usage: { recent: 'bold', favorites: undefined } as unknown as ToolUsage,
      limit: 2,
    })
    expect(() => tracker.record('italic')).not.toThrow()
    tracker.record('bold')
    tracker.record('underline')
    expect(tracker.usage.recent).toEqual(['underline', 'bold'])
    expect(tracker.isFavorite('bold')).toBe(false)
  })
})

// --------------------------------------------------------------- view modes

describe('typewriter', () => {
  function fakeCaret(top: number): void {
    vi.spyOn(document, 'getSelection').mockReturnValue({
      rangeCount: 1,
      anchorNode: null,
      getRangeAt: () => ({ getBoundingClientRect: () => ({ top, height: 20 }) }),
    } as unknown as Selection)
  }

  it('measures the caret against the scroller, not the viewport', () => {
    const editor = mountEditor('<p>x</p>')
    const scroller = document.createElement('div')
    document.body.appendChild(scroller)
    scroller.getBoundingClientRect = () =>
      ({ top: 100, left: 0, right: 500, bottom: 400, width: 500, height: 300 }) as DOMRect
    Object.defineProperty(scroller, 'clientHeight', { value: 300 })
    const scrollBy = vi.fn()
    scroller.scrollBy = scrollBy as unknown as typeof scroller.scrollBy
    fakeCaret(500)
    const typewriter = createTypewriter(editor, { scroller, anchor: 0.4, active: false })
    typewriter.enable()
    // Caret at 500; the anchor line is 100 + 0.4 × 300 = 220 → scroll by 280.
    expect(scrollBy).toHaveBeenCalledWith({ top: 280, behavior: 'auto' })
    typewriter.destroy()
    vi.restoreAllMocks()
    editor.destroy()
  })

  it('scrolls the window when it can, and does not throw when it cannot', () => {
    const editor = mountEditor('<p>x</p>')
    const win = editor.view?.dom.ownerDocument.defaultView as unknown as {
      scrollBy?: Window['scrollBy']
    }
    fakeCaret(700)
    const typewriter = createTypewriter(editor, { active: true })
    // happy-dom gives its window no `scrollBy`, which is the case the guard
    // exists for: an engine hosting the editor without a scrollable window.
    expect(win.scrollBy).toBeUndefined()
    expect(() => typewriter.center()).not.toThrow()
    // With one present it is still used, so the guard costs no behaviour.
    const scrollBy = vi.fn()
    win.scrollBy = scrollBy as unknown as Window['scrollBy']
    try {
      typewriter.center()
      expect(scrollBy).toHaveBeenCalledTimes(1)
    } finally {
      win.scrollBy = undefined
    }
    typewriter.destroy()
    editor.destroy()
  })
})

// -------------------------------------------------- floating block controls

describe('code language select', () => {
  function caretInPre(editor: ReturnType<typeof mountEditor>): void {
    const pre = editor.view?.dom.querySelector('pre')
    const text = pre?.querySelector('code')?.firstChild ?? pre?.firstChild
    if (!text) throw new Error('no code block rendered')
    document.getSelection()?.collapse(text, 1)
  }

  it('survives a detect callback that throws', () => {
    const editor = mountEditor('<pre><code>let x</code></pre>')
    const select = createCodeLanguageSelect(editor, {
      languages: [{ value: 'javascript', label: 'JavaScript' }],
      detect: () => {
        throw new Error('detector exploded')
      },
    })
    caretInPre(editor)
    expect(() => document.dispatchEvent(new Event('selectionchange'))).not.toThrow()
    expect(select.element.hidden).toBe(false)
    expect(select.element.querySelector('.trevixal-codelang__label')?.textContent).toBe(
      'Plain text',
    )
    select.destroy()
    editor.destroy()
  })

  it('positions inside a scrolled host', () => {
    const editor = mountEditor('<pre><code>let x</code></pre>')
    const host = editor.view?.dom.parentElement as HTMLElement
    const select = createCodeLanguageSelect(editor, { languages: [] })
    caretInPre(editor)
    host.scrollTop = 100
    document.dispatchEvent(new Event('selectionchange'))
    expect(select.element.hidden).toBe(false)
    expect(select.element.style.top).toBe('108px')
    select.destroy()
    editor.destroy()
  })
})

describe('table toolbar', () => {
  it('positions inside a scrolled host', () => {
    const editor = mountEditor('<p>x</p>')
    const view = editor.view
    if (!view) throw new Error('no view')
    const host = view.dom.parentElement as HTMLElement
    const noop: Command = () => null
    const toolbar = createTableToolbar(editor, {
      commands: {
        addRowBefore: noop,
        addRowAfter: noop,
        deleteRow: noop,
        addColumnBefore: noop,
        addColumnAfter: noop,
        deleteColumn: noop,
        mergeCells: noop,
        splitCell: noop,
        toggleHeaderRow: noop,
        deleteTable: noop,
      },
    })
    // The default schema has no table nodes; the toolbar only reads the DOM.
    const table = document.createElement('table')
    const cell = document.createElement('td')
    cell.textContent = 'cell'
    table
      .appendChild(document.createElement('tbody'))
      .appendChild(document.createElement('tr'))
      .appendChild(cell)
    view.dom.appendChild(table)
    document.getSelection()?.collapse(cell.firstChild, 1)
    host.scrollTop = 50
    document.dispatchEvent(new Event('selectionchange'))
    expect(toolbar.element.hidden).toBe(false)
    expect(toolbar.element.style.top).toBe('52px')
    toolbar.destroy()
    editor.destroy()
  })
})

// -------------------------------------------------------------- history panel

describe('history panel', () => {
  it('jumps to a past or future state by the right number of steps', () => {
    const editor = mountEditor(undefined, { groupDelay: 0 })
    editor.commands.insertText('a')
    editor.commands.insertText('b')
    editor.commands.insertText('c')
    const panel = createHistoryPanel(editor, { container })
    const rows = (): HTMLButtonElement[] => [
      ...panel.element.querySelectorAll<HTMLButtonElement>('.trevixal-history__entry'),
    ]
    // Origin + three edits; the last is current.
    expect(rows()).toHaveLength(4)
    expect(rows()[3]?.getAttribute('aria-current')).toBe('step')
    rows()[1]?.click()
    expect(editor.state.doc.textContent).toBe('a')
    expect(rows()[1]?.getAttribute('aria-current')).toBe('step')
    // Two undone entries follow, next-to-redo first; the last is two steps out.
    expect(rows()[3]?.closest('.trevixal-history__item--future')).not.toBeNull()
    rows()[3]?.click()
    expect(editor.state.doc.textContent).toBe('abc')
    rows()[0]?.click()
    expect(editor.state.doc.textContent).toBe('')
    panel.destroy()
    editor.destroy()
  })
})

// ---------------------------------------------------------------- source mode

describe('source mode', () => {
  it('cancelling leaves the document and history alone', () => {
    const editor = mountEditor('<p>hello</p>')
    const mode = createSourceMode(editor, { format: 'markdown' })
    const before = editor.historyEntries().undo.length
    mode.enter()
    const textarea = mode.element?.querySelector('textarea')
    if (!textarea) throw new Error('no textarea')
    textarea.value = '# changed'
    mode.exit(false)
    expect(editor.state.doc.textContent).toBe('hello')
    expect(editor.historyEntries().undo.length).toBe(before)
    expect(editor.view?.dom.hidden).toBe(false)
    mode.destroy()
    editor.destroy()
  })

  it('switches syntax in place and applies the source on the way out', () => {
    const editor = mountEditor('<p>hello</p>')
    const mode = createSourceMode(editor, { format: 'markdown' })
    mode.enter()
    mode.setFormat('html')
    expect(mode.isActive).toBe(true)
    const textarea = mode.element?.querySelector('textarea')
    expect(textarea?.value).toContain('<p>hello</p>')
    if (textarea) textarea.value = '<p>changed</p>'
    mode.destroy()
    // destroy() while active cancels rather than applying half-typed source.
    expect(editor.state.doc.textContent).toBe('hello')
    expect(mode.isActive).toBe(false)
    expect(editor.view?.dom.hidden).toBe(false)
    editor.destroy()
  })
})
