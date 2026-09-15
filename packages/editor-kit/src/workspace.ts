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
  WorkspaceStore,
  createDocumentTabs,
  createWorkspacePanel,
  createWebStorage as createWorkspaceStorage,
} from '@trevixal/extension-workspace'

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
  destroy(): void
}

export function createDocumentWorkspace(context: DocumentWorkspaceContext): DocumentWorkspace {
  const { editor, stripHost, panelHost, namespace } = context
  let strip: Awaited<ReturnType<typeof buildWorkspace>> | null = null
  let storePromise: ReturnType<typeof WorkspaceStore.open> | null = null
  let workspacePromise: Promise<Awaited<ReturnType<typeof buildWorkspace>>> | null = null

  function documentStore(): ReturnType<typeof WorkspaceStore.open> {
    storePromise ??= WorkspaceStore.open(
      createWorkspaceStorage(window.localStorage, `${namespace}:workspace:`),
    )
    return storePromise
  }

  async function buildWorkspace() {
    const store = await documentStore()
    if (store.list().length === 0) {
      await store.create({ title: 'Welcome', doc: editor.getJSON() })
    }
    // The strip carries pin, favourite, rename, folder and delete on each tab's
    // menu, and its `+` offers the templates; the panel adds recents,
    // favourites and the folder tree beside them.
    const built = createDocumentTabs(editor, store, { container: stripHost })
    createWorkspacePanel(editor, store, built, { container: panelHost })
    await built.ready
    return built
  }

  return {
    store: documentStore,
    async open() {
      workspacePromise ??= buildWorkspace()
      strip = await workspacePromise
    },
    isOpen: () => strip !== null,
    destroy: () => strip?.destroy(),
  }
}
