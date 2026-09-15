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
import { type WorkspacePanel, createWorkspacePanel } from '../src/panel'
import { WorkspaceStore, createMemoryStorage } from '../src/store'
import { type DocumentTabs, createDocumentTabs } from '../src/tabs'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

function docOf(text: string): DocJSON {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
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

async function settle(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

interface Fixture {
  store: WorkspaceStore
  editor: Editor
  tabs: DocumentTabs
  panel: WorkspacePanel
  container: HTMLElement
}

/** Alpha at the root, Beta in `Work`, Gamma in `Work/Q3`, with a panel mounted. */
async function fixture(
  options: Parameters<typeof createWorkspacePanel>[3] extends infer O
    ? Partial<Omit<O & object, 'container'>>
    : never = {},
): Promise<Fixture> {
  let counter = 0
  const store = await WorkspaceStore.open(createMemoryStorage(), {
    idFactory: () => `doc-${++counter}`,
  })
  await store.create({ doc: docOf('alpha'), title: 'Alpha' })
  await store.create({ doc: docOf('beta'), title: 'Beta', folder: 'Work' })
  await store.create({ doc: docOf('gamma'), title: 'Gamma', folder: 'Work/Q3' })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host })
  editors.push(editor)
  const tabsHost = document.createElement('div')
  document.body.appendChild(tabsHost)
  const tabs = createDocumentTabs(editor, store, { container: tabsHost })
  await tabs.ready
  const container = document.createElement('div')
  document.body.appendChild(container)
  const panel = createWorkspacePanel(editor, store, tabs, { container, ...options })
  return { store, editor, tabs, panel, container }
}

const rowIds = (root: HTMLElement, selector = '.trevixal-workspace__row'): (string | undefined)[] =>
  [...root.querySelectorAll<HTMLElement>(selector)].map((row) => row.dataset.documentId)

function click(element: Element | null | undefined): void {
  element?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

function typeSearch(panel: WorkspacePanel, value: string): void {
  const search = panel.element.querySelector<HTMLInputElement>('.trevixal-workspace__search')
  ;(search as HTMLInputElement).value = value
  search?.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('createWorkspacePanel rendering', () => {
  it('renders a labelled sidebar with a search box and the two actions', async () => {
    const { panel, container } = await fixture()
    expect(panel.element.tagName).toBe('ASIDE')
    expect(panel.element.getAttribute('aria-label')).toBe('Workspace')
    expect(container.contains(panel.element)).toBe(true)
    const search = panel.element.querySelector<HTMLInputElement>('.trevixal-workspace__search')
    expect(search?.type).toBe('search')
    expect(search?.getAttribute('aria-label')).toBe('Search documents')
    expect(panel.element.querySelector('[data-action="new-document"]')?.textContent).toBe(
      'New document',
    )
    expect(panel.element.querySelector('[data-action="new-folder"]')?.textContent).toBe(
      'New folder',
    )
    panel.destroy()
  })

  it('renders the folder tree with the documents inside it', async () => {
    const { panel } = await fixture()
    const documents = panel.element.querySelector<HTMLElement>('[data-section="documents"]')
    const folders = [...(documents?.querySelectorAll<HTMLElement>('details') ?? [])].map(
      (details) => details.dataset.folder,
    )
    expect(folders).toEqual(['Work', 'Work/Q3'])
    expect(documents?.querySelector('[data-folder="Work"] summary')?.textContent).toContain('Work')
    // Every document has a row, wherever it is filed.
    expect(rowIds(documents as HTMLElement).sort()).toEqual(['doc-1', 'doc-2', 'doc-3'])
    expect(rowIds(documents?.querySelector('[data-folder="Work/Q3"]') as HTMLElement)).toEqual([
      'doc-3',
    ])
    panel.destroy()
  })

  it('renders each row with a title, a star and a menu button', async () => {
    const { panel } = await fixture()
    const row = panel.element.querySelector<HTMLElement>(
      '[data-section="documents"] [data-document-id="doc-1"]',
    )
    expect(row?.querySelector('.trevixal-workspace__title')?.textContent).toBe('Alpha')
    const star = row?.querySelector('.trevixal-workspace__star')
    expect(star?.getAttribute('aria-pressed')).toBe('false')
    expect(star?.getAttribute('aria-label')).toBe('Favorite Alpha')
    expect(row?.querySelector('.trevixal-workspace__more')?.getAttribute('aria-haspopup')).toBe(
      'menu',
    )
    expect(row?.draggable).toBe(true)
    panel.destroy()
  })

  it('marks the active document with aria-current', async () => {
    const { panel, tabs } = await fixture()
    const current = (): (string | undefined)[] => rowIds(panel.element, '[aria-current="true"]')
    expect(new Set(current())).toEqual(new Set([tabs.activeId]))
    await tabs.open('doc-3')
    panel.refresh()
    expect(new Set(current())).toEqual(new Set(['doc-3']))
    panel.destroy()
  })

  it('shows the recent and favorites sections only when they have something', async () => {
    const { panel, store } = await fixture()
    expect(panel.element.querySelector('[data-section="favorites"]')).toBeNull()
    await store.setFavorite('doc-2', true)
    await settle()
    expect(
      rowIds(panel.element.querySelector('[data-section="favorites"]') as HTMLElement),
    ).toEqual(['doc-2'])
    expect(panel.element.querySelector('[data-section="recent"]')).not.toBeNull()
    panel.destroy()
  })

  it('hides the optional sections when the host turns them off', async () => {
    const { panel, store } = await fixture({ showRecent: false, showFavorites: false })
    await store.setFavorite('doc-2', true)
    await settle()
    expect(panel.element.querySelector('[data-section="favorites"]')).toBeNull()
    expect(panel.element.querySelector('[data-section="recent"]')).toBeNull()
    panel.destroy()
  })

  it('says so when the workspace is empty', async () => {
    const { panel, store, tabs } = await fixture()
    // Without the strip nothing re-creates a blank document as they go.
    tabs.destroy()
    for (const meta of store.list()) await store.remove(meta.id)
    await settle()
    expect(panel.element.querySelector('.trevixal-workspace__empty')?.textContent).toBe(
      'No documents yet',
    )
    panel.destroy()
  })

  it('re-renders when the store changes', async () => {
    const { panel, store } = await fixture()
    await store.rename('doc-1', 'Renamed')
    await settle()
    expect(panel.element.textContent).toContain('Renamed')
    panel.destroy()
  })
})

describe('createWorkspacePanel search', () => {
  it('filters the list down to the matches', async () => {
    const { panel } = await fixture()
    typeSearch(panel, 'beta')
    expect(panel.element.querySelector('[data-section="results"] h3')?.textContent).toBe('Results')
    expect(rowIds(panel.element)).toEqual(['doc-2'])
    expect(panel.element.querySelector('[data-section="documents"]')).toBeNull()
    panel.destroy()
  })

  it('searches folders as well as titles', async () => {
    const { panel } = await fixture()
    typeSearch(panel, 'work')
    expect(rowIds(panel.element).sort()).toEqual(['doc-2', 'doc-3'])
    panel.destroy()
  })

  it('says when nothing matches, and restores the tree when cleared', async () => {
    const { panel } = await fixture()
    typeSearch(panel, 'nothing here')
    expect(rowIds(panel.element)).toEqual([])
    expect(panel.element.querySelector('.trevixal-workspace__empty')?.textContent).toBe(
      'No matches',
    )
    typeSearch(panel, '   ')
    expect(panel.element.querySelector('[data-section="documents"]')).not.toBeNull()
    panel.destroy()
  })
})

describe('createWorkspacePanel actions', () => {
  it('toggles a document’s favourite from the star', async () => {
    const { panel, store } = await fixture()
    const star = (): Element | null =>
      panel.element.querySelector(
        '[data-section="documents"] [data-document-id="doc-1"] .trevixal-workspace__star',
      )
    expect(star()?.textContent).toBe('☆')
    click(star())
    await settle()
    expect(store.meta('doc-1')?.favorite).toBe(true)
    expect(star()?.getAttribute('aria-pressed')).toBe('true')
    expect(star()?.textContent).toBe('★')
    click(star())
    await settle()
    expect(store.meta('doc-1')?.favorite).toBe(false)
    panel.destroy()
  })

  it('opens the document a row names', async () => {
    const { panel, tabs, editor } = await fixture()
    click(
      panel.element.querySelector(
        '[data-section="documents"] [data-document-id="doc-3"] .trevixal-workspace__title',
      ),
    )
    await settle()
    expect(tabs.activeId).toBe('doc-3')
    expect(editor.getText()).toBe('gamma')
    panel.destroy()
  })

  it('creates a document and a folder from the toolbar', async () => {
    const { panel, store, tabs } = await fixture({ promptText: () => 'Ideas' })
    click(panel.element.querySelector('[data-action="new-document"]'))
    await settle()
    expect(tabs.activeId).toBe('doc-4')
    click(panel.element.querySelector('[data-action="new-folder"]'))
    await settle()
    expect(store.folders()).toContain('Ideas')
    panel.destroy()
  })

  it('renames, duplicates and deletes from a row’s menu', async () => {
    const { panel, store } = await fixture({
      promptText: () => 'Renamed',
      confirm: () => true,
    })
    const openRowMenu = (id: string): void => {
      click(
        panel.element.querySelector(
          `[data-section="documents"] [data-document-id="${id}"] .trevixal-workspace__more`,
        ),
      )
    }
    openRowMenu('doc-1')
    click(document.querySelector('[data-menu-item="rename"]'))
    await settle()
    expect(store.meta('doc-1')?.title).toBe('Renamed')

    openRowMenu('doc-1')
    click(document.querySelector('[data-menu-item="duplicate"]'))
    await settle()
    expect(store.meta('doc-4')?.title).toBe('Copy of Renamed')

    openRowMenu('doc-4')
    click(document.querySelector('[data-menu-item="delete"]'))
    await settle()
    expect(store.meta('doc-4')).toBeNull()
    panel.destroy()
  })

  it('lets the host veto a delete', async () => {
    const { panel, store } = await fixture({ confirm: () => false })
    click(
      panel.element.querySelector(
        '[data-section="documents"] [data-document-id="doc-1"] .trevixal-workspace__more',
      ),
    )
    click(document.querySelector('[data-menu-item="delete"]'))
    await settle()
    expect(store.meta('doc-1')).not.toBeNull()
    panel.destroy()
  })

  it('moves a document to an existing folder from its menu', async () => {
    const { panel, store } = await fixture()
    click(
      panel.element.querySelector(
        '[data-section="documents"] [data-document-id="doc-1"] .trevixal-workspace__more',
      ),
    )
    click(document.querySelector('[data-menu-item="move"]'))
    click(document.querySelector('[data-menu-item="folder:Work"]'))
    await settle()
    expect(store.meta('doc-1')?.folder).toBe('Work')
    panel.destroy()
  })

  it('renames and deletes a folder from its menu', async () => {
    const { panel, store } = await fixture({ promptText: () => 'Office' })
    const folderMenu = (path: string): void => {
      click(panel.element.querySelector(`[data-folder="${path}"] .trevixal-workspace__more`))
    }
    folderMenu('Work')
    click(document.querySelector('[data-menu-item="rename-folder"]'))
    await settle()
    expect(store.folders()).toEqual(['Office', 'Office/Q3'])
    expect(store.meta('doc-2')?.folder).toBe('Office')

    folderMenu('Office/Q3')
    click(document.querySelector('[data-menu-item="delete-folder"]'))
    await settle()
    expect(store.folders()).toEqual(['Office'])
    expect(store.meta('doc-3')?.folder).toBe('Office')
    panel.destroy()
  })
})

describe('createWorkspacePanel drag and drop', () => {
  it('files a document into the folder it is dropped on', async () => {
    const { panel, store } = await fixture()
    const row = panel.element.querySelector<HTMLElement>(
      '[data-section="documents"] [data-document-id="doc-1"]',
    ) as HTMLElement
    const target = panel.element.querySelector<HTMLElement>(
      '[data-drop-folder="Work"]',
    ) as HTMLElement
    row.dispatchEvent(new Event('dragstart', { bubbles: true }))
    const over = new Event('dragover', { bubbles: true, cancelable: true })
    target.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    expect(target.closest('.trevixal-workspace__folder')?.className).toContain('--dragover')
    target.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
    await settle()
    expect(store.meta('doc-1')?.folder).toBe('Work')
    panel.destroy()
  })

  it('files a document back at the top level on the Documents heading', async () => {
    const { panel, store } = await fixture()
    const row = panel.element.querySelector<HTMLElement>(
      '[data-section="documents"] [data-document-id="doc-2"]',
    ) as HTMLElement
    row.dispatchEvent(new Event('dragstart', { bubbles: true }))
    const heading = panel.element.querySelector<HTMLElement>(
      '[data-section="documents"] [data-drop-folder=""]',
    ) as HTMLElement
    heading.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
    await settle()
    expect(store.meta('doc-2')?.folder).toBeNull()
    panel.destroy()
  })

  it('clears the drag highlight when the drag ends or leaves', async () => {
    const { panel } = await fixture()
    const row = panel.element.querySelector<HTMLElement>(
      '[data-section="documents"] [data-document-id="doc-1"]',
    ) as HTMLElement
    const target = panel.element.querySelector<HTMLElement>(
      '[data-drop-folder="Work"]',
    ) as HTMLElement
    row.dispatchEvent(new Event('dragstart', { bubbles: true }))
    target.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }))
    target.dispatchEvent(new Event('dragleave', { bubbles: true }))
    expect(panel.element.querySelector('.trevixal-workspace__folder--dragover')).toBeNull()

    target.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }))
    row.dispatchEvent(new Event('dragend', { bubbles: true }))
    expect(panel.element.querySelector('.trevixal-workspace__folder--dragover')).toBeNull()
    panel.destroy()
  })
})

describe('createWorkspacePanel lifecycle', () => {
  it('remembers which folders the user collapsed', async () => {
    const { panel } = await fixture()
    const details = panel.element.querySelector<HTMLDetailsElement>(
      '[data-folder="Work"]',
    ) as HTMLDetailsElement
    expect(details.hasAttribute('open')).toBe(true)
    details.removeAttribute('open')
    details.dispatchEvent(new Event('toggle'))
    panel.refresh()
    expect(
      panel.element.querySelector<HTMLElement>('[data-folder="Work"]')?.hasAttribute('open'),
    ).toBe(false)
    panel.destroy()
  })

  it('detaches itself and stops listening when destroyed', async () => {
    const { panel, store, container } = await fixture()
    panel.destroy()
    expect(container.querySelector('.trevixal-workspace')).toBeNull()
    await store.rename('doc-1', 'Renamed after destroy')
    await settle()
    expect(panel.element.textContent).not.toContain('Renamed after destroy')
    expect(() => panel.destroy()).not.toThrow()
  })
})
