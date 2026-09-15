// @vitest-environment happy-dom
import {
  type DocJSON,
  type Editor,
  Schema,
  createEditor,
  defaultMarks,
  defaultNodes,
} from '@trevixal/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type KeyValueStorage, WorkspaceStore, createMemoryStorage } from '../src/store'
import { TABS_KEY, createDocumentTabs } from '../src/tabs'
import type { DocumentTemplate } from '../src/templates'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

/** A one-paragraph body. */
function docOf(text: string): DocJSON {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
}

/** A body whose first heading is the document's derived title. */
function headed(title: string, body: string): DocJSON {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
      { type: 'paragraph', content: [{ type: 'text', text: body }] },
    ],
  }
}

const editors: Editor[] = []

beforeEach(() => {
  document.body.innerHTML = ''
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  for (const editor of editors.splice(0)) editor.destroy()
})

/** Let every queued promise (and any timer up to `ms`) run. */
async function settle(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

async function openStore(storage: KeyValueStorage): Promise<WorkspaceStore> {
  let counter = 0
  return WorkspaceStore.open(storage, { idFactory: () => `doc-${++counter}` })
}

interface Fixture {
  storage: KeyValueStorage
  store: WorkspaceStore
  editor: Editor
  container: HTMLElement
}

/** A store with two documents, a mounted editor and a container for the strip. */
async function fixture(): Promise<Fixture> {
  const storage = createMemoryStorage()
  const store = await openStore(storage)
  await store.create({ doc: docOf('alpha'), title: 'Alpha' })
  await store.create({ doc: docOf('beta'), title: 'Beta' })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host })
  editors.push(editor)
  const container = document.createElement('div')
  document.body.appendChild(container)
  return { storage, store, editor, container }
}

const tabButton = (root: HTMLElement, id: string): HTMLElement =>
  root.querySelector<HTMLElement>(`[role="tab"][data-document-id="${id}"]`) as HTMLElement

const itemIds = (root: HTMLElement): (string | undefined)[] =>
  [...root.querySelectorAll<HTMLElement>('.trevixal-tabs-bar__item')].map(
    (item) => item.dataset.documentId,
  )

function click(element: Element | null | undefined): void {
  element?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

function press(element: Element, key: string): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('createDocumentTabs rendering', () => {
  it('opens the most recent document and renders one tab for it', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    expect(tabs.activeId).toBe('doc-1')
    expect(editor.getText()).toBe('alpha')
    expect(itemIds(tabs.element)).toEqual(['doc-1'])
    expect(tabs.element.getAttribute('role')).toBe('tablist')
    expect(tabButton(tabs.element, 'doc-1').getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('.trevixal-tabs-bar')).toBe(tabs.element)
    tabs.destroy()
  })

  it('switches the editor between two documents', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    await tabs.open('doc-2')
    expect(editor.getText()).toBe('beta')
    expect(tabs.activeId).toBe('doc-2')
    expect(itemIds(tabs.element)).toEqual(['doc-1', 'doc-2'])
    expect(tabButton(tabs.element, 'doc-1').getAttribute('aria-selected')).toBe('false')
    expect(tabButton(tabs.element, 'doc-2').getAttribute('aria-selected')).toBe('true')

    click(tabButton(tabs.element, 'doc-1'))
    await settle()
    expect(editor.getText()).toBe('alpha')
    expect(tabs.activeId).toBe('doc-1')
    tabs.destroy()
  })

  it('records the switch for the recents list and reports it to the host', async () => {
    const { store, editor, container } = await fixture()
    const switched: string[] = []
    const tabs = createDocumentTabs(editor, store, {
      container,
      onSwitch: (record) => switched.push(record.id),
    })
    await tabs.ready
    await tabs.open('doc-2')
    expect(switched).toEqual(['doc-1', 'doc-2'])
    expect([...store.recent()].map((meta) => meta.id).sort()).toEqual(['doc-1', 'doc-2'])
    tabs.destroy()
  })

  it('renders pinned tabs first and gives them no close button', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    await tabs.open('doc-2')
    await store.setPinned('doc-2', true)
    await settle()
    expect(itemIds(tabs.element)).toEqual(['doc-2', 'doc-1'])
    expect(tabs.openIds).toEqual(['doc-2', 'doc-1'])
    const pinned = tabs.element.querySelector<HTMLElement>('[data-document-id="doc-2"]')
    expect(pinned?.className).toContain('trevixal-tabs-bar__item--pinned')
    expect(pinned?.querySelector('.trevixal-tabs-bar__close')).toBeNull()
    expect(pinned?.querySelector('.trevixal-tabs-bar__pin')?.textContent).toBe('📌')
    expect(tabs.element.querySelectorAll('.trevixal-tabs-bar__close')).toHaveLength(1)
    tabs.destroy()
  })
})

describe('createDocumentTabs autosave', () => {
  it('writes an edit back to the store once the strip goes quiet', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    editor.commands.insertText('X')
    expect((await store.get('doc-1'))?.doc).toEqual(docOf('alpha'))
    await settle(800)
    expect((await store.get('doc-1'))?.doc).toEqual(docOf('Xalpha'))
    tabs.destroy()
  })

  it('honours a custom debounce and flushes on demand', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container, autosaveMs: 50 })
    await tabs.ready
    editor.commands.insertText('X')
    await settle(49)
    expect((await store.get('doc-1'))?.doc).toEqual(docOf('alpha'))
    await settle(1)
    expect((await store.get('doc-1'))?.doc).toEqual(docOf('Xalpha'))

    editor.commands.insertText('Y')
    await tabs.flush()
    expect((await store.get('doc-1'))?.doc).toEqual(docOf('XYalpha'))
    tabs.destroy()
  })

  it('lets the title follow the first heading until the tab is renamed', async () => {
    const storage = createMemoryStorage()
    const store = await openStore(storage)
    await store.create({ doc: headed('Plan', 'Body.') })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema, element: host })
    editors.push(editor)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    expect(store.meta('doc-1')?.title).toBe('Plan')

    editor.commands.insertText('New ')
    await settle(800)
    expect(store.meta('doc-1')?.title).toBe('New Plan')

    await store.rename('doc-1', 'Mine')
    editor.commands.insertText('Z')
    await settle(800)
    expect(store.meta('doc-1')?.title).toBe('Mine')
    tabs.destroy()
  })

  it('saves whatever is pending when the strip is destroyed', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    editor.commands.insertText('X')
    tabs.destroy()
    await settle(800)
    expect((await store.get('doc-1'))?.doc).toEqual(docOf('Xalpha'))
    expect(container.querySelector('.trevixal-tabs-bar')).toBeNull()
  })

  it('stops autosaving once destroyed', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    tabs.destroy()
    await settle(800)
    editor.commands.insertText('X')
    await settle(800)
    expect((await store.get('doc-1'))?.doc).toEqual(docOf('alpha'))
  })
})

describe('createDocumentTabs closing', () => {
  it('saves the document and removes its tab', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    await tabs.open('doc-2')
    editor.commands.insertText('X')
    await tabs.close('doc-2')
    expect((await store.get('doc-2'))?.doc).toEqual(docOf('Xbeta'))
    expect(tabs.openIds).toEqual(['doc-1'])
    expect(tabs.activeId).toBe('doc-1')
    expect(editor.getText()).toBe('alpha')
    expect(store.meta('doc-2')).not.toBeNull() // closed, not deleted
    tabs.destroy()
  })

  it('closes from the tab’s × button', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    await tabs.open('doc-2')
    click(tabs.element.querySelector('[data-document-id="doc-2"] .trevixal-tabs-bar__close'))
    await settle()
    expect(tabs.openIds).toEqual(['doc-1'])
    tabs.destroy()
  })

  it('lets the host veto a close', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container, confirmClose: () => false })
    await tabs.ready
    await tabs.open('doc-2')
    await tabs.close('doc-2')
    expect(tabs.openIds).toEqual(['doc-1', 'doc-2'])
    tabs.destroy()
  })

  it('opens a blank document when the last tab closes', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    await tabs.close('doc-1')
    expect(tabs.openIds).toEqual(['doc-3'])
    expect(store.meta('doc-3')?.title).toBe('Untitled')
    expect(editor.getText()).toBe('')
    tabs.destroy()
  })

  it('closes with the Delete key and with a middle click', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    await tabs.open('doc-2')
    press(tabButton(tabs.element, 'doc-2'), 'Delete')
    await settle()
    expect(tabs.openIds).toEqual(['doc-1'])

    await tabs.open('doc-2')
    tabButton(tabs.element, 'doc-2').dispatchEvent(
      new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }),
    )
    await settle()
    expect(tabs.openIds).toEqual(['doc-1'])
    tabs.destroy()
  })

  it('prunes the tab of a document deleted from the store', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    await tabs.open('doc-2')
    await store.remove('doc-2')
    await settle()
    expect(tabs.openIds).toEqual(['doc-1'])
    expect(tabs.activeId).toBe('doc-1')
    expect(editor.getText()).toBe('alpha')
    tabs.destroy()
  })
})

describe('createDocumentTabs renaming', () => {
  it('commits a double-click rename on Enter', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    tabButton(tabs.element, 'doc-1').dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
    )
    const input = tabs.element.querySelector<HTMLInputElement>('.trevixal-tabs-bar__rename')
    expect(input?.value).toBe('Alpha')
    ;(input as HTMLInputElement).value = 'Renamed'
    press(input as HTMLInputElement, 'Enter')
    await settle()
    expect(store.meta('doc-1')?.title).toBe('Renamed')
    expect(tabs.element.querySelector('.trevixal-tabs-bar__rename')).toBeNull()
    expect(tabButton(tabs.element, 'doc-1').textContent).toBe('Renamed')
    tabs.destroy()
  })

  it('cancels a rename on Escape', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    tabButton(tabs.element, 'doc-1').dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
    )
    const input = tabs.element.querySelector<HTMLInputElement>('.trevixal-tabs-bar__rename')
    ;(input as HTMLInputElement).value = 'Nope'
    press(input as HTMLInputElement, 'Escape')
    await settle()
    expect(store.meta('doc-1')?.title).toBe('Alpha')
    expect(tabs.element.querySelector('.trevixal-tabs-bar__rename')).toBeNull()
    tabs.destroy()
  })

  it('commits a rename when the input loses focus', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    tabButton(tabs.element, 'doc-1').dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
    )
    const input = tabs.element.querySelector<HTMLInputElement>('.trevixal-tabs-bar__rename')
    ;(input as HTMLInputElement).value = 'By blur'
    ;(input as HTMLInputElement).dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await settle()
    expect(store.meta('doc-1')?.title).toBe('By blur')
    tabs.destroy()
  })
})

describe('createDocumentTabs keyboard navigation', () => {
  it('moves between tabs with the arrow keys', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    await tabs.open('doc-2')
    press(tabButton(tabs.element, 'doc-2'), 'ArrowLeft')
    await settle()
    expect(tabs.activeId).toBe('doc-1')
    expect(editor.getText()).toBe('alpha')

    press(tabButton(tabs.element, 'doc-1'), 'ArrowRight')
    await settle()
    expect(tabs.activeId).toBe('doc-2')
    expect(editor.getText()).toBe('beta')

    // The ends wrap around.
    press(tabButton(tabs.element, 'doc-2'), 'ArrowRight')
    await settle()
    expect(tabs.activeId).toBe('doc-1')
    tabs.destroy()
  })

  it('jumps to the first and last tab with Home and End', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    await tabs.open('doc-2')
    press(tabButton(tabs.element, 'doc-2'), 'Home')
    await settle()
    expect(tabs.activeId).toBe('doc-1')
    press(tabButton(tabs.element, 'doc-1'), 'End')
    await settle()
    expect(tabs.activeId).toBe('doc-2')
    tabs.destroy()
  })
})

describe('createDocumentTabs persistence', () => {
  it('restores the open tabs and the active one on a second mount', async () => {
    const { storage, store, editor, container } = await fixture()
    const first = createDocumentTabs(editor, store, { container })
    await first.ready
    await first.open('doc-2')
    expect(JSON.parse((await storage.get(TABS_KEY)) as string)).toEqual({
      open: ['doc-1', 'doc-2'],
      active: 'doc-2',
    })
    first.destroy()

    const second = createDocumentTabs(editor, store, { container })
    await second.ready
    expect(second.openIds).toEqual(['doc-1', 'doc-2'])
    expect(second.activeId).toBe('doc-2')
    expect(editor.getText()).toBe('beta')
    second.destroy()
  })

  it('drops restored ids whose document is gone', async () => {
    const { storage, store, editor, container } = await fixture()
    await storage.set(TABS_KEY, JSON.stringify({ open: ['doc-1', 'ghost'], active: 'ghost' }))
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    expect(tabs.openIds).toEqual(['doc-1'])
    expect(tabs.activeId).toBe('doc-1')
    tabs.destroy()
  })

  it('starts from a corrupt tab state without complaining', async () => {
    const { storage, store, editor, container } = await fixture()
    await storage.set(TABS_KEY, 'not json')
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    expect(tabs.openIds).toEqual(['doc-1'])
    expect(tabs.activeId).toBe('doc-1')
    tabs.destroy()
  })

  it('opens the document the host asks for', async () => {
    const { storage, store, editor, container } = await fixture()
    await storage.set(TABS_KEY, JSON.stringify({ open: ['doc-1'], active: 'doc-1' }))
    const tabs = createDocumentTabs(editor, store, { container, initialDocumentId: 'doc-2' })
    await tabs.ready
    expect(tabs.activeId).toBe('doc-2')
    expect(editor.getText()).toBe('beta')
    tabs.destroy()
  })
})

describe('createDocumentTabs new documents', () => {
  it('creates a blank document and opens it', async () => {
    const { store, editor, container } = await fixture()
    const created: string[] = []
    const tabs = createDocumentTabs(editor, store, {
      container,
      onNewDocument: (record) => created.push(record.id),
    })
    await tabs.ready
    const record = await tabs.newDocument()
    expect(created).toEqual([record.id])
    expect(tabs.activeId).toBe(record.id)
    expect(editor.getText()).toBe('')
    tabs.destroy()
  })

  it('offers the templates from the + button and creates from one', async () => {
    const { store, editor, container } = await fixture()
    const template: DocumentTemplate = {
      id: 'note',
      name: 'Note',
      description: 'A note.',
      icon: '📝',
      doc: docOf('from template'),
    }
    const tabs = createDocumentTabs(editor, store, { container, templates: [template] })
    await tabs.ready
    click(tabs.element.querySelector('.trevixal-tabs-bar__new'))
    const item = document.querySelector('[data-menu-item="template:note"]')
    expect(item?.textContent).toBe('📝 Note')
    click(item)
    await settle()
    expect(editor.getText()).toBe('from template')
    expect(store.meta(tabs.activeId as string)?.templateId).toBe('note')
    tabs.destroy()
  })

  it('creates straight away when there are no templates to choose from', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container, templates: [] })
    await tabs.ready
    click(tabs.element.querySelector('.trevixal-tabs-bar__new'))
    await settle()
    expect(tabs.openIds).toHaveLength(2)
    expect(editor.getText()).toBe('')
    tabs.destroy()
  })
})

describe('createDocumentTabs tab menu', () => {
  it('pins, favourites and duplicates from the … menu', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    const openMenuFor = (id: string): void => {
      click(tabs.element.querySelector(`[data-document-id="${id}"] .trevixal-tabs-bar__more`))
    }

    openMenuFor('doc-1')
    click(document.querySelector('[data-menu-item="pin"]'))
    await settle()
    expect(store.meta('doc-1')?.pinned).toBe(true)

    openMenuFor('doc-1')
    click(document.querySelector('[data-menu-item="favorite"]'))
    await settle()
    expect(store.meta('doc-1')?.favorite).toBe(true)

    openMenuFor('doc-1')
    click(document.querySelector('[data-menu-item="duplicate"]'))
    await settle()
    expect(store.meta(tabs.activeId as string)?.title).toBe('Copy of Alpha')
    tabs.destroy()
  })

  it('deletes a document from the … menu, subject to confirmation', async () => {
    const { store, editor, container } = await fixture()
    let allow = false
    const tabs = createDocumentTabs(editor, store, { container, confirmDelete: () => allow })
    await tabs.ready
    click(tabs.element.querySelector('[data-document-id="doc-1"] .trevixal-tabs-bar__more'))
    click(document.querySelector('[data-menu-item="delete"]'))
    await settle()
    expect(store.meta('doc-1')).not.toBeNull()

    allow = true
    click(tabs.element.querySelector('[data-document-id="doc-1"] .trevixal-tabs-bar__more'))
    click(document.querySelector('[data-menu-item="delete"]'))
    await settle()
    expect(store.meta('doc-1')).toBeNull()
    tabs.destroy()
  })

  it('moves a document to a new folder through the prompt', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, {
      container,
      promptText: () => ' Work / Q3 ',
    })
    await tabs.ready
    click(tabs.element.querySelector('[data-document-id="doc-1"] .trevixal-tabs-bar__more'))
    click(document.querySelector('[data-menu-item="move"]'))
    click(document.querySelector('[data-menu-item="new-folder"]'))
    await settle()
    expect(store.meta('doc-1')?.folder).toBe('Work/Q3')
    tabs.destroy()
  })

  it('closes the other tabs but keeps the pinned ones', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    await tabs.open('doc-2')
    const third = await tabs.newDocument()
    await store.setPinned('doc-1', true)
    await settle()
    click(tabs.element.querySelector(`[data-document-id="${third.id}"] .trevixal-tabs-bar__more`))
    click(document.querySelector('[data-menu-item="close-others"]'))
    await settle()
    expect(tabs.openIds).toEqual(['doc-1', third.id])
    tabs.destroy()
  })
})

describe('createDocumentTabs active state', () => {
  it('marks the open document on the whole tab, not only its title button', async () => {
    const { store, editor, container } = await fixture()
    const tabs = createDocumentTabs(editor, store, { container })
    await tabs.ready
    await tabs.open('doc-2')

    const items = [...tabs.element.querySelectorAll<HTMLElement>('.trevixal-tabs-bar__item')]
    const active = items.map((item) => item.dataset.active)

    // A tab is three controls in a wrapper (title, menu, close) and they
    // have to look active together. The stylesheet keys on the wrapper, so
    // without this flag the open document was indistinguishable from the
    // ones behind it.
    expect(active).toEqual(['false', 'true'])
    expect(items.map((item) => item.dataset.documentId)).toEqual(['doc-1', 'doc-2'])
    tabs.destroy()
  })
})
