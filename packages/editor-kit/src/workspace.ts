/**
 * The other documents: the store they live in, the tab strip across the top
 * and the folder sidebar beside it.
 *
 * All three are built on first use and at most once. The strip owns the tab
 * bar and autosaves into the store, so a second one would fight the first
 * over both, which is why `open` is memoized rather than guarded by the
 * caller.
 */
import type { Editor } from '@trevixal/core'
import {
  type BacklinksPanel,
  type DocumentMeta,
  WorkspaceStore,
  createBacklinksPanel,
  createDocumentTabs,
  createWorkspacePanel,
  createWebStorage as createWorkspaceStorage,
  enableTransclusions,
  includableBlocks,
  insertTransclusion,
  wikiLinks,
} from '@trevixal/extension-workspace'
import { createSuggestionPopup, openDialog, openInfoDialog } from '@trevixal/ui'

export interface DocumentWorkspaceContext {
  editor: Editor
  /** Where the tab strip goes. */
  stripHost: HTMLElement
  /** Where the folder sidebar goes. */
  panelHost: HTMLElement
  /** Prefix for this editor's slice of local storage. */
  namespace: string
}

export interface DocumentWorkspace {
  /** The store, opened once and shared by the strip and the sidebar. */
  store(): ReturnType<typeof WorkspaceStore.open>
  /** Put the strip and the sidebar up, if they are not up already. */
  open(): Promise<void>
  /** Whether the strip is up. False while a first `open` is still in flight. */
  isOpen(): boolean
  /** Open a document in its tab, putting the strip up first when it is not. */
  openDocument(id: string): Promise<void>
  /** Ask which document, or which block of one, to include here, and include it. */
  includeDocument(): Promise<void>
  /** The document on screen, once the strip is up. */
  activeId(): string | null
  destroy(): void
}

export function createDocumentWorkspace(context: DocumentWorkspaceContext): DocumentWorkspace {
  const { editor, stripHost, panelHost, namespace } = context
  let strip: Awaited<ReturnType<typeof buildWorkspace>> | null = null
  let storePromise: ReturnType<typeof WorkspaceStore.open> | null = null
  let workspacePromise: Promise<Awaited<ReturnType<typeof buildWorkspace>>> | null = null
  let backlinksPanel: BacklinksPanel | null = null

  function documentStore(): ReturnType<typeof WorkspaceStore.open> {
    storePromise ??= WorkspaceStore.open(
      createWorkspaceStorage(window.localStorage, `${namespace}:workspace:`),
    )
    return storePromise
  }

  async function buildWorkspace() {
    const store = await documentStore()
    // Untitled here, so the store names it after its first heading and the
    // name keeps following it, as every other document's does.
    if (store.list().length === 0) await store.create({ doc: editor.getJSON() })
    // The strip carries pin, favourite, rename, folder and delete on each tab's
    // menu, and its `+` offers the templates; the panel adds recents,
    // favourites and the folder tree beside them.
    const built = createDocumentTabs(editor, store, {
      container: stripHost,
      onSwitch: () => void backlinksPanel?.refresh(),
    })
    createWorkspacePanel(editor, store, built, { container: panelHost })
    // What links to the open document, under the folders.
    backlinksPanel = createBacklinksPanel({
      container: panelHost,
      store,
      currentId: () => built.activeId,
      open: (id) => void built.open(id),
    })
    await built.ready
    return built
  }

  // `[[` links to another document, from the first keystroke: the store is
  // opened for the list, and the strip only when a link is followed.
  const wikiPopup = createSuggestionPopup<DocumentMeta>({
    editor,
    renderItem: (meta) => meta.title || 'Untitled',
    detailOf: (meta) => meta.folder ?? undefined,
    onPick: (index) => wiki.select(index),
    emptyLabel: 'No matching document',
  })
  const openDocument = async (id: string): Promise<void> => {
    workspacePromise ??= buildWorkspace()
    strip = await workspacePromise
    await strip.open(id)
  }
  const wiki = wikiLinks(editor, {
    store: documentStore(),
    open: (id) => void openDocument(id),
    onState: wikiPopup.update,
    currentId: () => strip?.activeId ?? null,
  })
  // Inclusions from other documents, read again whenever one is saved.
  const transclusions = enableTransclusions(editor, {
    store: documentStore(),
    open: (id) => void openDocument(id),
  })

  async function includeDocument(): Promise<void> {
    const store = await documentStore()
    const current = strip?.activeId ?? null
    const options: { value: string; label: string }[] = []
    for (const meta of store.list()) {
      if (meta.id === current) continue
      const record = await store.get(meta.id)
      if (!record) continue
      const title = meta.title || 'Untitled'
      options.push({ value: meta.id, label: `${title} (the whole document)` })
      for (const block of includableBlocks(record.doc)) {
        options.push({ value: `${meta.id}#${block.id}`, label: `${title} › ${block.label}` })
      }
    }
    if (options.length === 0) {
      await openInfoDialog({
        document,
        title: 'Include from workspace',
        body: 'There is no other document to include yet. View ▸ Documents opens the workspace, and its + adds one.',
      })
      return
    }
    const values = await openDialog({
      document,
      title: 'Include from workspace',
      submitLabel: 'Include',
      body: 'It shows here as it is there, and follows it as that document changes.',
      fields: [
        { name: 'source', label: 'Include', type: 'select', value: options[0]?.value, options },
      ],
    })
    editor.view?.focus()
    const [id, block] = (values?.source ?? '').split('#')
    const record = id ? await store.get(id) : null
    if (!record) return
    editor.exec(
      insertTransclusion({ id: record.id, title: record.title, doc: record.doc }, block ?? null),
    )
  }

  return {
    store: documentStore,
    async open() {
      workspacePromise ??= buildWorkspace()
      strip = await workspacePromise
    },
    isOpen: () => strip !== null,
    openDocument,
    includeDocument,
    activeId: () => strip?.activeId ?? null,
    destroy: () => {
      transclusions.dispose()
      wiki.dispose()
      wikiPopup.destroy?.()
      backlinksPanel?.destroy()
      strip?.destroy()
    },
  }
}
