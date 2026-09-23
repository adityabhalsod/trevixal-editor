import {
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
} from '@trevixal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCommandPalette,
  filterCommands,
  fuzzyScore,
  paletteCommandsFromMenus,
} from '../src/command-palette'
import { createEditorUI } from '../src/editor-ui'
import { createFindReplace, findAll } from '../src/find-replace'
import { createDocumentOutline } from '../src/outline'
import { createTableOfContents } from '../src/table-of-contents'
import {
  EDITOR_WIDTHS,
  createFocusMode,
  createFullscreenToggle,
  setEditorWidth,
} from '../src/view-modes'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

let container: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
})

/** An editor with a real view, so decoration layers and geometry are live. */
function mountEditor(html?: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const doc = html ? parseHTML(schema, html, document) : undefined
  return createEditor({ schema, element: host, ...(doc ? { doc } : {}) })
}

/** Move the caret without going through the DOM. */
function selectAt(editor: ReturnType<typeof mountEditor>, path: number[], offset = 0): void {
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos(path, offset))))
}

describe('table of contents', () => {
  it('lists every heading in document order', () => {
    const editor = mountEditor('<h1>Intro</h1><p>body</p><h2>Details</h2><h2>More</h2>')
    const toc = createTableOfContents(editor, { container })

    expect(toc.entries.map((entry) => entry.text)).toEqual(['Intro', 'Details', 'More'])
    expect(toc.entries.map((entry) => entry.level)).toEqual([1, 2, 2])
    toc.destroy()
    editor.destroy()
  })

  it('nests a skipped level without orphaning a list', () => {
    // h1 → h3 is the common real-world jump; it must still produce one <ul>
    // per opened depth with an <li> parent, never a <ul> hanging off nothing.
    const editor = mountEditor('<h1>Top</h1><h3>Deep</h3><h2>Middle</h2>')
    const toc = createTableOfContents(editor, { container })

    const lists = toc.element.querySelectorAll('ul')
    for (const list of lists) {
      if (list === toc.element.firstElementChild) continue
      expect(list.parentElement?.tagName).toBe('LI')
    }
    expect(toc.element.querySelectorAll('li')).toHaveLength(3)
    toc.destroy()
    editor.destroy()
  })

  it('shows an empty state for a document with no headings', () => {
    const editor = mountEditor('<p>just prose</p>')
    const toc = createTableOfContents(editor, { container, emptyLabel: 'Nothing here' })

    expect(toc.entries).toHaveLength(0)
    expect(toc.element.querySelector('.trevixal-toc__empty')?.textContent).toBe('Nothing here')
    expect(toc.element.querySelector('ul')).toBeNull()
    toc.destroy()
    editor.destroy()
  })

  it('updates after the document is edited', () => {
    const editor = mountEditor('<h1>First</h1>')
    const toc = createTableOfContents(editor, { container })
    expect(toc.entries.map((entry) => entry.text)).toEqual(['First'])

    // Typing at the end of the heading.
    selectAt(editor, [0], 5)
    editor.commands.insertText(' draft')
    expect(toc.entries[0]?.text).toBe('First draft')

    // A brand new heading appears in the list without any manual refresh.
    editor.commands.splitBlock()
    editor.commands.setHeading(2)
    editor.commands.insertText('Second')
    expect(toc.entries.map((entry) => entry.text)).toEqual(['First draft', 'Second'])
    expect(toc.element.querySelectorAll('li')).toHaveLength(2)
    toc.destroy()
    editor.destroy()
  })

  it('moves the selection into the heading a link points at', () => {
    const editor = mountEditor('<h1>One</h1><p>body</p><h2>Two</h2>')
    const toc = createTableOfContents(editor, { container, onNavigate: () => {} })

    const links = [...toc.element.querySelectorAll<HTMLElement>('.trevixal-toc__link')]
    expect(links.map((link) => link.textContent)).toEqual(['One', 'Two'])
    // The h2 is the third block, so clicking its entry must land on path [2].
    links[1]?.click()
    expect(editor.state.selection.to).toEqual({ path: [2], offset: 0 })
    toc.destroy()
    editor.destroy()
  })

  it('removes its DOM and stops listening when destroyed', () => {
    const editor = mountEditor('<h1>One</h1>')
    const toc = createTableOfContents(editor, { container })
    const before = toc.entries.length
    toc.destroy()

    expect(container.querySelector('.trevixal-toc')).toBeNull()
    // A transaction after destroy must not re-run refresh.
    editor.commands.selectAll()
    editor.commands.insertText('changed entirely')
    expect(toc.entries).toHaveLength(before)
    editor.destroy()
  })
})

describe('document outline', () => {
  it('lists headings and notable blocks with nesting depth', () => {
    const editor = mountEditor(
      '<h1>Top</h1><p>text</p><h2>Sub</h2><pre><code>code()</code></pre><blockquote><p>q</p></blockquote>',
    )
    const outline = createDocumentOutline(editor, { container })

    const types = outline.entries.map((entry) => entry.type)
    expect(types).toContain('heading')
    expect(types).toContain('codeBlock')
    expect(types).toContain('blockquote')
    // The code block sits under h1 > h2, so it is two levels in.
    const code = outline.entries.find((entry) => entry.type === 'codeBlock')
    expect(code?.depth).toBe(2)
    outline.destroy()
    editor.destroy()
  })

  it('highlights the row holding the selection and follows it', () => {
    const editor = mountEditor('<h1>Top</h1><p>body</p><h2>Sub</h2><p>more</p>')
    const outline = createDocumentOutline(editor, { container })

    const active = () =>
      outline.element.querySelector<HTMLElement>('.trevixal-outline__row--active')?.textContent

    selectAt(editor, [1])
    // Paragraph after the h1 still lights up that h1.
    expect(active()).toContain('Top')
    outline.destroy()
    editor.destroy()
  })

  it('shows an empty state and cleans up on destroy', () => {
    const editor = mountEditor('<p></p>')
    const outline = createDocumentOutline(editor, { container, emptyLabel: 'Nothing' })
    expect(outline.element.querySelector('.trevixal-outline__empty')?.textContent).toBe('Nothing')

    outline.destroy()
    expect(container.querySelector('.trevixal-outline')).toBeNull()
    editor.destroy()
  })
})

describe('find and replace', () => {
  it('finds every occurrence and reports the count', () => {
    const editor = mountEditor('<p>one two one</p><p>one</p>')
    const find = createFindReplace(editor, { container })

    const result = find.search({
      query: 'one',
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    })
    expect(result.error).toBeNull()
    expect(result.matches).toHaveLength(3)
    expect(find.activeIndex).toBe(0)
    expect(find.element.querySelector('.trevixal-findbar__status')?.textContent).toBe('1 of 3')
    find.destroy()
    editor.destroy()
  })

  it('honours case sensitivity and whole-word matching', () => {
    const editor = mountEditor('<p>Cat cat catalog</p>')
    const find = createFindReplace(editor, { container })

    expect(
      find.search({ query: 'cat', caseSensitive: true, wholeWord: false, regex: false }).matches,
    ).toHaveLength(2)
    expect(
      find.search({ query: 'cat', caseSensitive: false, wholeWord: true, regex: false }).matches,
    ).toHaveLength(2)
    find.destroy()
    editor.destroy()
  })

  it('walks forward and backward through the matches, wrapping around', () => {
    const editor = mountEditor('<p>a a a</p>')
    const find = createFindReplace(editor, { container })
    find.search({ query: 'a', caseSensitive: false, wholeWord: false, regex: false })

    expect(find.activeIndex).toBe(0)
    find.findNext()
    expect(find.activeIndex).toBe(1)
    find.findPrevious()
    find.findPrevious()
    expect(find.activeIndex).toBe(2) // wrapped past the start
    find.destroy()
    editor.destroy()
  })

  it('replaces just the active match', () => {
    const editor = mountEditor('<p>dog dog</p>')
    const find = createFindReplace(editor, { container })
    find.search({ query: 'dog', caseSensitive: false, wholeWord: false, regex: false })

    expect(find.replaceCurrent('cat')).toBe(true)
    expect(editor.getText()).toContain('cat dog')
    find.destroy()
    editor.destroy()
  })

  it('replaces every match in one pass', () => {
    const editor = mountEditor('<p>x y x</p><p>x</p>')
    const find = createFindReplace(editor, { container })
    find.search({ query: 'x', caseSensitive: false, wholeWord: false, regex: false })

    expect(find.replaceAllMatches('z')).toBe(3)
    expect(editor.getText()).not.toContain('x')
    expect(find.matches).toHaveLength(0)
    find.destroy()
    editor.destroy()
  })

  it('matches with a regular expression when the flag is on', () => {
    const editor = mountEditor('<p>a1 b22 c333</p>')
    const find = createFindReplace(editor, { container })

    const result = find.search({
      query: '[a-z]\\d+',
      caseSensitive: false,
      wholeWord: false,
      regex: true,
    })
    expect(result.matches).toHaveLength(3)
    find.destroy()
    editor.destroy()
  })

  it('reports an invalid regular expression instead of throwing', () => {
    const editor = mountEditor('<p>anything</p>')
    const find = createFindReplace(editor, { container })

    // An unclosed group is what the user has on screen mid-typing; it must
    // surface as a message, not an exception.
    const search = () =>
      find.search({
        query: '([a-z',
        caseSensitive: false,
        wholeWord: false,
        regex: true,
      })
    expect(search).not.toThrow()

    const result = search()
    expect(result.error).toBeTruthy()
    expect(result.matches).toHaveLength(0)
    const error = find.element.querySelector<HTMLElement>('.trevixal-findbar__error')
    expect(error?.hidden).toBe(false)
    expect(error?.textContent).toContain('Invalid pattern')
    find.destroy()
    editor.destroy()
  })

  it('terminates on a pattern whose matches are all zero-length', () => {
    const editor = mountEditor('<p>aaaaaaaaaa</p>')
    const find = createFindReplace(editor, { container })

    // `a*` matches the empty string at every position, and `(?:)` matches
    // nothing at all: without stepping lastIndex forward, exec loops forever.
    for (const pattern of ['(?:)', 'a*', '^', '\\b']) {
      const result = find.search({
        query: pattern,
        caseSensitive: false,
        wholeWord: false,
        regex: true,
      })
      expect(result.error).toBeNull()
      // Zero-length hits are discarded, so nothing is highlighted.
      expect(result.matches.every((match) => match.to > match.from)).toBe(true)
    }
    find.destroy()
    editor.destroy()
  })

  it('caps the match count rather than decorating an unbounded number', () => {
    const editor = mountEditor(`<p>${'ab '.repeat(200)}</p>`)
    const result = findAll(
      editor.state.doc,
      { query: '[ab]', caseSensitive: false, wholeWord: false, regex: true },
      10,
    )
    expect(result.matches).toHaveLength(10)
    expect(result.truncated).toBe(true)
    editor.destroy()
  })

  it('installs its highlights under its own decoration layer', () => {
    const editor = mountEditor('<p>find me</p>')
    const spy = vi.spyOn(editor.view!, 'setDecorationLayer')
    const find = createFindReplace(editor, { container })
    find.search({ query: 'me', caseSensitive: false, wholeWord: false, regex: false })

    // Never the shared 'search' key another feature might own.
    const keys = spy.mock.calls.map((call) => call[0])
    expect(keys.every((key) => key === 'find-replace')).toBe(true)
    find.destroy()
    editor.destroy()
  })

  it('clears highlights and DOM when destroyed', () => {
    const editor = mountEditor('<p>gone</p>')
    const find = createFindReplace(editor, { container })
    find.search({ query: 'gone', caseSensitive: false, wholeWord: false, regex: false })
    const spy = vi.spyOn(editor.view!, 'setDecorationLayer')

    find.destroy()
    expect(spy).toHaveBeenCalledWith('find-replace', null)
    expect(container.querySelector('.trevixal-findbar')).toBeNull()

    // A later transaction must not re-run the search.
    expect(() => editor.commands.insertText('more')).not.toThrow()
    editor.destroy()
  })
})

describe('command palette', () => {
  const commands = () => [
    { name: 'bold', label: 'Bold', group: 'Format', run: vi.fn() },
    { name: 'bulletList', label: 'Bullet List', keywords: ['ul'], group: 'Format', run: vi.fn() },
    { name: 'table', label: 'Insert Table', group: 'Insert', run: vi.fn() },
  ]

  it('scores a subsequence and rejects a non-match', () => {
    expect(fuzzyScore('bl', 'Bullet List')).not.toBeNull()
    expect(fuzzyScore('zzz', 'Bullet List')).toBeNull()
    // A word-boundary match outranks the same letters buried mid-word.
    const boundary = fuzzyScore('bl', 'Bullet List') as number
    const buried = fuzzyScore('bl', 'unbelievable') as number
    expect(boundary).toBeGreaterThan(buried)
  })

  it('filters by label and by keyword', () => {
    const list = commands()
    expect(filterCommands(list, 'bold').map((entry) => entry.name)).toEqual(['bold'])
    expect(filterCommands(list, 'ul').map((entry) => entry.name)).toContain('bulletList')
    expect(filterCommands(list, '')).toHaveLength(3)
  })

  it('renders matching rows as the query is typed', () => {
    const editor = mountEditor('<p>hi</p>')
    const palette = createCommandPalette(editor, { commands: commands(), container })
    palette.open()

    expect(palette.element.querySelectorAll('.trevixal-palette__item')).toHaveLength(3)
    const input = palette.element.querySelector<HTMLInputElement>('.trevixal-palette__input')!
    input.value = 'table'
    input.dispatchEvent(new Event('input'))

    const rendered = [...palette.element.querySelectorAll('.trevixal-palette__label')].map(
      (row) => row.textContent,
    )
    expect(rendered).toEqual(['Insert Table'])
    palette.destroy()
    editor.destroy()
  })

  it('runs the highlighted command on Enter and closes', () => {
    const editor = mountEditor('<p>hi</p>')
    const list = commands()
    const palette = createCommandPalette(editor, { commands: list, container })
    palette.open()

    const input = palette.element.querySelector<HTMLInputElement>('.trevixal-palette__input')!
    input.value = 'insert table'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(list[2]?.run).toHaveBeenCalledTimes(1)
    expect(palette.isOpen).toBe(false)
    palette.destroy()
    editor.destroy()
  })

  it('moves the highlight with the arrow keys', () => {
    const editor = mountEditor('<p>hi</p>')
    const palette = createCommandPalette(editor, { commands: commands(), container })
    palette.open()
    const input = palette.element.querySelector<HTMLInputElement>('.trevixal-palette__input')!

    const selectedLabel = () =>
      palette.element.querySelector('.trevixal-palette__item--selected .trevixal-palette__label')
        ?.textContent

    expect(selectedLabel()).toBe('Bold')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(selectedLabel()).toBe('Bullet List')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(selectedLabel()).toBe('Insert Table') // wrapped
    palette.destroy()
    editor.destroy()
  })

  it('steps over rows that cannot run', () => {
    const editor = mountEditor('<p>hi</p>')
    const off = (name: string, label: string) => ({
      name,
      label,
      run: vi.fn(),
      isEnabled: () => false,
    })
    const palette = createCommandPalette(editor, {
      commands: [off('first', 'Off first'), ...commands(), off('last', 'Off last')],
      container,
    })
    palette.open()
    const input = palette.element.querySelector<HTMLInputElement>('.trevixal-palette__input')!
    const selectedLabel = () =>
      palette.element.querySelector('.trevixal-palette__item--selected .trevixal-palette__label')
        ?.textContent
    // The first row that can run, not the disabled one above it.
    expect(selectedLabel()).toBe('Bold')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(selectedLabel()).toBe('Insert Table') // wrapped, past both disabled rows
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(selectedLabel()).toBe('Bold')
    palette.destroy()
    editor.destroy()
  })

  it('lists what was run last first, until something is typed', () => {
    const editor = mountEditor('<p>hi</p>')
    const list = commands()
    const onRecent = vi.fn()
    const palette = createCommandPalette(editor, {
      commands: list,
      container,
      // `gone` names a command this session does not offer: kept, not shown.
      recent: ['table', 'gone'],
      onRecent,
    })
    const input = palette.element.querySelector<HTMLInputElement>('.trevixal-palette__input')!
    const headings = () =>
      [...palette.element.querySelectorAll('.trevixal-palette__group')].map(
        (row) => row.textContent,
      )
    const labels = () =>
      [...palette.element.querySelectorAll('.trevixal-palette__label')].map(
        (row) => row.textContent,
      )
    palette.open()
    expect(headings()[0]).toBe('Recently used')
    // Listed once, first, rather than again under its own menu.
    expect(labels()).toEqual(['Insert Table', 'Bold', 'Bullet List'])

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(list[0]?.run).toHaveBeenCalledOnce()
    expect(onRecent).toHaveBeenLastCalledWith(['bold', 'table', 'gone'])

    palette.open()
    expect(labels().slice(0, 2)).toEqual(['Bold', 'Insert Table'])
    input.value = 'bul'
    input.dispatchEvent(new Event('input'))
    // A search ranks everything; the recent heading would only get in the way.
    expect(headings()).not.toContain('Recently used')
    palette.destroy()
    editor.destroy()
  })

  it('closes on Escape', () => {
    const editor = mountEditor('<p>hi</p>')
    const palette = createCommandPalette(editor, { commands: commands(), container })
    palette.open()
    const input = palette.element.querySelector<HTMLInputElement>('.trevixal-palette__input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(palette.isOpen).toBe(false)
    palette.destroy()
    editor.destroy()
  })

  it('opens on Ctrl+K and on Ctrl+Shift+P', () => {
    const editor = mountEditor('<p>hi</p>')
    const palette = createCommandPalette(editor, { commands: commands(), container })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
    expect(palette.isOpen).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
    expect(palette.isOpen).toBe(false)

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'P', ctrlKey: true, shiftKey: true, bubbles: true }),
    )
    expect(palette.isOpen).toBe(true)
    palette.destroy()
    editor.destroy()
  })

  it('unbinds its global shortcut when destroyed', () => {
    const editor = mountEditor('<p>hi</p>')
    const palette = createCommandPalette(editor, { commands: commands(), container })
    palette.destroy()

    expect(container.querySelector('.trevixal-palette-overlay')).toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
    expect(palette.isOpen).toBe(false)
    editor.destroy()
  })
})

describe('palette commands derived from menus', () => {
  const run = vi.fn()
  const menus = [
    {
      name: 'file',
      label: 'File',
      items: [
        { name: 'save', label: 'Save', icon: 'save', shortcut: 'Ctrl+S', run },
        { name: 'sep', label: '', separator: true },
        {
          name: 'downloadAs',
          label: 'Download as',
          items: [{ name: 'docx', label: 'Word document (.docx)', icon: 'fileWord', run }],
        },
        // No `run`: the host never wired it, so it is inert in the menu too.
        { name: 'unwired', label: 'Not wired', icon: 'save' },
      ],
    },
    { name: 'edit', label: 'Edit', items: [{ name: 'save', label: 'Save again', run }] },
  ]

  it('offers a submenu’s children rather than the submenu', () => {
    const commands = paletteCommandsFromMenus(menus)
    const names = commands.map((entry) => entry.name)
    expect(names).toContain('docx')
    // The parent is a heading, not something you can run.
    expect(names).not.toContain('downloadAs')
    // …but the parent's label is kept as a keyword, so searching for the
    // submenu still surfaces what is inside it. Each haystack is scored on its
    // own, so this is one word, not 'download docx'.
    expect(filterCommands(commands, 'download').map((e) => e.name)).toContain('docx')
    expect(commands.find((e) => e.name === 'docx')?.keywords).toEqual(['Download as'])
  })

  it('carries the icon, shortcut and menu across', () => {
    const save = paletteCommandsFromMenus(menus).find((entry) => entry.name === 'save')
    expect(save?.icon).toBe('save')
    expect(save?.shortcut).toBe('Ctrl+S')
    expect(save?.group).toBe('File')
  })

  it('prints the keys a shortcut manager says fire, as the menus do', () => {
    const labelled = paletteCommandsFromMenus(menus, { save: 'Ctrl+Alt+S' })
    expect(labelled.find((entry) => entry.name === 'save')?.shortcut).toBe('Ctrl+Alt+S')
    // A manager that knows nothing of an entry prints nothing beside it.
    const unknown = paletteCommandsFromMenus(menus, {})
    expect(unknown.find((entry) => entry.name === 'save')?.shortcut).toBeUndefined()
  })

  it('skips entries with no action and never offers one twice', () => {
    const names = paletteCommandsFromMenus(menus).map((entry) => entry.name)
    expect(names).not.toContain('unwired')
    // `save` appears under File and Edit; one command is enough.
    expect(names.filter((name) => name === 'save')).toHaveLength(1)
  })
})

describe('view modes', () => {
  it('falls back to a class when the Fullscreen API is unavailable', async () => {
    const editor = mountEditor('<p>hi</p>')
    const target = document.createElement('div')
    document.body.appendChild(target)
    const toggle = createFullscreenToggle(editor, { target, container })

    // happy-dom exposes no requestFullscreen, which is exactly the case the
    // fallback exists for.
    expect(await toggle.enter()).toBe(true)
    expect(target.classList.contains('trevixal-fullscreen')).toBe(true)
    expect(toggle.isFullscreen).toBe(true)
    expect(toggle.element.getAttribute('aria-pressed')).toBe('true')

    await toggle.exit()
    expect(target.classList.contains('trevixal-fullscreen')).toBe(false)
    toggle.destroy()
    editor.destroy()
  })

  it('falls back when requestFullscreen rejects without a user gesture', async () => {
    const editor = mountEditor('<p>hi</p>')
    const target = document.createElement('div')
    document.body.appendChild(target)
    const page = document.documentElement as unknown as { requestFullscreen?: () => Promise<void> }
    page.requestFullscreen = () =>
      Promise.reject(new Error('API can only be initiated by a user gesture'))

    const toggle = createFullscreenToggle(editor, { target, container })
    expect(await toggle.enter()).toBe(true)
    expect(target.classList.contains('trevixal-fullscreen')).toBe(true)
    // The browser was refused, so it will not say how to leave; the hint does.
    expect(target.querySelector('.trevixal-fullscreen__hint')).not.toBeNull()
    toggle.destroy()
    Reflect.deleteProperty(page, 'requestFullscreen')
    editor.destroy()
  })

  it('takes the whole page fullscreen, so what opens on <body> still shows', async () => {
    const editor = mountEditor('<p>hi</p>')
    const target = document.createElement('div')
    document.body.appendChild(target)
    // happy-dom has neither half of the API, so both are stood in for here.
    let fullscreenElement: Element | null = null
    const page = document.documentElement as unknown as { requestFullscreen?: () => Promise<void> }
    page.requestFullscreen = vi.fn(async () => {
      fullscreenElement = document.documentElement
    })
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    })
    const toggle = createFullscreenToggle(editor, { target, container })
    try {
      await toggle.enter()
      expect(page.requestFullscreen).toHaveBeenCalledOnce()
      expect(target.classList.contains('trevixal-fullscreen')).toBe(true)
      // The browser shows its own notice for its own fullscreen.
      expect(target.querySelector('.trevixal-fullscreen__hint')).toBeNull()

      // Escape there is the browser's: all the page hears is the change.
      fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
      await Promise.resolve()
      expect(toggle.isFullscreen).toBe(false)
      expect(target.classList.contains('trevixal-fullscreen')).toBe(false)
    } finally {
      toggle.destroy()
      Reflect.deleteProperty(document, 'fullscreenElement')
      Reflect.deleteProperty(page, 'requestFullscreen')
      editor.destroy()
    }
  })

  it('leaves the fallback on Escape, and says so on the way in', async () => {
    const editor = mountEditor('<p>hi</p>')
    const target = document.createElement('div')
    document.body.appendChild(target)
    const toggle = createFullscreenToggle(editor, { target, container })
    const escapeKey = (): KeyboardEvent =>
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })

    await toggle.enter()
    // The browser tells you how to leave its own fullscreen; the fallback has to.
    expect(target.querySelector('.trevixal-fullscreen__hint')?.textContent).toContain('Esc')
    document.dispatchEvent(escapeKey())
    await Promise.resolve()
    expect(toggle.isFullscreen).toBe(false)
    expect(target.querySelector('.trevixal-fullscreen__hint')).toBeNull()

    // An Escape something else already answered, closing a popup, stays in.
    await toggle.enter()
    const answered = escapeKey()
    answered.preventDefault()
    document.dispatchEvent(answered)
    await Promise.resolve()
    expect(toggle.isFullscreen).toBe(true)
    toggle.destroy()
    editor.destroy()
  })

  it('removes its button and classes on destroy', () => {
    const editor = mountEditor('<p>hi</p>')
    const target = document.createElement('div')
    document.body.appendChild(target)
    const toggle = createFullscreenToggle(editor, { target, container })
    target.classList.add('trevixal-fullscreen')

    toggle.destroy()
    expect(container.querySelector('[data-trevixal-viewmode]')).toBeNull()
    expect(target.classList.contains('trevixal-fullscreen')).toBe(false)
    editor.destroy()
  })

  it('dims every block but the selected one through a decoration layer', () => {
    const editor = mountEditor('<p>first</p><p>second</p>')
    const spy = vi.spyOn(editor.view!, 'setDecorationLayer')
    const focus = createFocusMode(editor)

    focus.enable()
    expect(focus.isActive).toBe(true)
    expect(editor.view?.dom.classList.contains('trevixal-content--focus-mode')).toBe(true)
    // Its own layer key, so code highlighting and search survive alongside.
    expect(spy.mock.calls.map((call) => call[0]).every((key) => key === 'focus-mode')).toBe(true)

    const dimmed = editor.view?.dom.querySelectorAll('.trevixal-focus-dimmed') ?? []
    // The caret is in the first paragraph, so only the second is dimmed.
    expect(dimmed).toHaveLength(1)
    expect(dimmed[0]?.textContent).toBe('second')

    focus.disable()
    expect(editor.view?.dom.querySelectorAll('.trevixal-focus-dimmed')).toHaveLength(0)
    focus.destroy()
    editor.destroy()
  })

  it('clears its layer and class when destroyed', () => {
    const editor = mountEditor('<p>a</p><p>b</p>')
    const focus = createFocusMode(editor, { active: true })
    const spy = vi.spyOn(editor.view!, 'setDecorationLayer')

    focus.destroy()
    expect(spy).toHaveBeenCalledWith('focus-mode', null)
    expect(editor.view?.dom.classList.contains('trevixal-content--focus-mode')).toBe(false)
    // Transactions after destroy must not repaint.
    editor.commands.insertText('more')
    expect(editor.view?.dom.querySelectorAll('.trevixal-focus-dimmed')).toHaveLength(0)
    editor.destroy()
  })

  it('sets a named width and passes a custom length through', () => {
    const element = document.createElement('div')
    setEditorWidth(element, 'narrow')
    expect(element.style.getPropertyValue('--tvx-editor-width')).toBe(EDITOR_WIDTHS.narrow)
    expect(element.dataset.trevixalWidth).toBe('narrow')

    setEditorWidth(element, '72ch')
    expect(element.style.getPropertyValue('--tvx-editor-width')).toBe('72ch')
    expect(element.dataset.trevixalWidth).toBe('custom')
  })

  it('rejects a width that is not a plain length', () => {
    const element = document.createElement('div')
    setEditorWidth(element, 'normal')
    // A value with parentheses or spaces could smuggle CSS into the property.
    setEditorWidth(element, 'calc(100% + url(x))')
    expect(element.style.getPropertyValue('--tvx-editor-width')).toBe(EDITOR_WIDTHS.normal)
  })
})

describe('find and replace in the assembled chrome', () => {
  it('makes the menubar entry live instead of shipping it disabled', () => {
    const editor = mountEditor('<p>needle</p>')
    const ui = createEditorUI(editor, { container })

    const item = ui.element.querySelector<HTMLButtonElement>('[data-trevixal-item="findReplace"]')
    // An item with no `run` renders disabled, which is what this used to be.
    expect(item).not.toBeNull()
    expect(item?.disabled).toBe(false)

    item?.click()
    expect(ui.findReplace?.isOpen).toBe(true)
    expect(ui.element.querySelector('.trevixal-findbar')).not.toBeNull()

    ui.destroy()
    expect(container.querySelector('.trevixal-findbar')).toBeNull()
    editor.destroy()
  })
})
