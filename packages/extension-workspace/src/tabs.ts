/**
 * The tab strip: one tab per open document, switching the editor's content
 * between them and autosaving the active one back into the store.
 */

import type { Editor } from '@trevixal/core'
import { type MenuItem, type PromptText, closeOpenMenu, defaultPrompt, openMenu } from './menu'
import {
  type DocumentMeta,
  type DocumentRecord,
  type WorkspaceStore,
  normalizeFolder,
} from './store'
import {
  BLANK_DOCUMENT,
  type DocumentTemplate,
  defaultTemplates,
  documentTitleFrom,
} from './templates'

/** Storage key holding the open tab ids and the active one. */
export const TABS_KEY = 'workspace:tabs'

export interface DocumentTabsOptions {
  /** Where the strip is appended. */
  readonly container: HTMLElement
  /** Open (and activate) this document on top of whatever was restored. */
  readonly initialDocumentId?: string
  /** Templates offered by the `+` button. Defaults to {@link defaultTemplates}. */
  readonly templates?: readonly DocumentTemplate[]
  readonly onSwitch?: (record: DocumentRecord) => void
  readonly onNewDocument?: (record: DocumentRecord) => void
  /** Quiet time after an edit before the document is written back (default 800). */
  readonly autosaveMs?: number
  /** Veto closing a tab. Defaults to allowing it. */
  readonly confirmClose?: (meta: DocumentMeta) => boolean | Promise<boolean>
  /** Veto deleting a document from a tab's menu. Defaults to allowing it. */
  readonly confirmDelete?: (meta: DocumentMeta) => boolean | Promise<boolean>
  /** Ask for a folder name. Defaults to `window.prompt`. */
  readonly promptText?: PromptText
}

export interface DocumentTabs {
  readonly element: HTMLElement
  /** Resolves once the persisted tabs have been restored and a document is loaded. */
  readonly ready: Promise<void>
  readonly activeId: string | null
  /** Open tab ids in strip order (pinned first). */
  readonly openIds: readonly string[]
  /** Open a document in a tab (if not already) and switch to it. */
  open(id: string): Promise<void>
  close(id: string): Promise<void>
  /** Create a document (blank, or from a template) and open it. */
  newDocument(template?: DocumentTemplate): Promise<DocumentRecord>
  /** Write the active document to the store now, if it has unsaved edits. */
  flush(): Promise<void>
  /** Re-render from the store. Called automatically on store changes. */
  refresh(): void
  destroy(): void
}

interface TabsStateJSON {
  readonly open: readonly string[]
  readonly active: string | null
}

function parseTabsState(raw: string | null): TabsStateJSON {
  if (raw === null) return { open: [], active: null }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return { open: [], active: null }
    const state = parsed as { open?: unknown; active?: unknown }
    return {
      open: Array.isArray(state.open)
        ? state.open.filter((id): id is string => typeof id === 'string')
        : [],
      active: typeof state.active === 'string' ? state.active : null,
    }
  } catch {
    return { open: [], active: null }
  }
}

export function createDocumentTabs(
  editor: Editor,
  store: WorkspaceStore,
  options: DocumentTabsOptions,
): DocumentTabs {
  const container = options.container
  const doc = container.ownerDocument
  const templates = options.templates ?? defaultTemplates()
  const autosaveMs = options.autosaveMs ?? 800
  const promptText = options.promptText ?? defaultPrompt

  const root = doc.createElement('div')
  root.className = 'trevixal-tabs-bar'
  root.setAttribute('role', 'tablist')
  root.setAttribute('aria-label', 'Open documents')

  const strip = doc.createElement('div')
  strip.className = 'trevixal-tabs-bar__tabs'

  const newButton = doc.createElement('button')
  newButton.type = 'button'
  newButton.className = 'trevixal-tabs-bar__new'
  newButton.textContent = '+'
  newButton.setAttribute('aria-label', 'New document')
  newButton.setAttribute('aria-haspopup', 'menu')

  root.append(strip, newButton)

  /** Open ids in opening order; pinning only affects display order. */
  let openIds: string[] = []
  let activeId: string | null = null
  /** The active document has edits not yet written to the store. */
  let dirty = false
  /** `setContent` is running: its update event is not an edit. */
  let loading = false
  let destroyed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let renamingId: string | null = null
  /** Document operations run one at a time, so a fast double-click cannot interleave two switches. */
  let queue: Promise<unknown> = Promise.resolve()

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  const ordered = (): DocumentMeta[] => {
    const metas = openIds
      .map((id) => store.meta(id))
      .filter((meta): meta is DocumentMeta => meta !== null)
    return [...metas.filter((meta) => meta.pinned), ...metas.filter((meta) => !meta.pinned)]
  }

  const persist = (): void => {
    const state: TabsStateJSON = { open: openIds, active: activeId }
    store.storage.set(TABS_KEY, JSON.stringify(state)).catch(() => undefined)
  }

  const render = (): void => {
    strip.replaceChildren()
    for (const meta of ordered()) {
      const item = doc.createElement('div')
      item.className = meta.pinned
        ? 'trevixal-tabs-bar__item trevixal-tabs-bar__item--pinned'
        : 'trevixal-tabs-bar__item'
      item.dataset.documentId = meta.id
      // The whole tab: title, menu and close, has to look active together,
      // and only the wrapper contains all three. Without this the stylesheet's
      // `[data-active='true'] > &` rule matched nothing and the open document
      // was indistinguishable from the ones behind it.
      item.dataset.active = meta.id === activeId ? 'true' : 'false'
      strip.appendChild(item)

      if (renamingId === meta.id) {
        const input = doc.createElement('input')
        input.type = 'text'
        input.className = 'trevixal-tabs-bar__rename'
        input.value = meta.title
        input.setAttribute('aria-label', 'Rename document')
        item.appendChild(input)
        input.focus()
        input.select?.()
        continue
      }

      const tab = doc.createElement('button')
      tab.type = 'button'
      tab.className = 'trevixal-tabs-bar__tab'
      tab.setAttribute('role', 'tab')
      tab.dataset.documentId = meta.id
      const active = meta.id === activeId
      tab.setAttribute('aria-selected', active ? 'true' : 'false')
      tab.tabIndex = active ? 0 : -1
      tab.title = meta.title
      if (meta.pinned) {
        const pin = doc.createElement('span')
        pin.className = 'trevixal-tabs-bar__pin'
        pin.setAttribute('aria-hidden', 'true')
        pin.textContent = '📌'
        tab.appendChild(pin)
      }
      const title = doc.createElement('span')
      title.className = 'trevixal-tabs-bar__title'
      title.textContent = meta.title
      tab.appendChild(title)
      item.appendChild(tab)

      const more = doc.createElement('button')
      more.type = 'button'
      more.className = 'trevixal-tabs-bar__more'
      more.textContent = '…'
      more.tabIndex = -1
      more.setAttribute('aria-label', `More actions for ${meta.title}`)
      more.setAttribute('aria-haspopup', 'menu')
      item.appendChild(more)

      // A pinned tab is meant to stay: it has no close affordance.
      if (!meta.pinned) {
        const close = doc.createElement('button')
        close.type = 'button'
        close.className = 'trevixal-tabs-bar__close'
        close.textContent = '×'
        close.tabIndex = -1
        close.setAttribute('aria-label', `Close ${meta.title}`)
        item.appendChild(close)
      }
    }
  }

  // ---- autosave --------------------------------------------------------------

  const cancelTimer = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const flush = async (): Promise<void> => {
    cancelTimer()
    if (!dirty || activeId === null) return
    const id = activeId
    dirty = false
    // Read the editor now: by the time the store answers, a switch may have
    // replaced its content with another document.
    const json = editor.getJSON()
    const record = await store.get(id)
    if (!record) return
    // The title follows the first heading until the user renames the tab by
    // hand, then it is theirs and stays put.
    const followsContent = record.title === documentTitleFrom(record.doc)
    const nextTitle = documentTitleFrom(json)
    await store.save(
      id,
      json,
      followsContent && nextTitle !== record.title ? { title: nextTitle } : {},
    )
  }

  const schedule = (): void => {
    cancelTimer()
    timer = setTimeout(() => {
      timer = null
      flush().catch(() => undefined)
    }, autosaveMs)
  }

  const offUpdate = editor.on('update', () => {
    if (loading || destroyed) return
    dirty = true
    schedule()
  })

  // ---- switching -------------------------------------------------------------

  const activate = async (id: string): Promise<void> => {
    if (destroyed) return
    const record = await store.get(id)
    if (!record) return
    await flush()
    if (!openIds.includes(id)) openIds.push(id)
    activeId = id
    loading = true
    try {
      editor.setContent(record.doc)
    } catch {
      // A body the schema cannot load (an extension node from another
      // build) still gets a tab; the user sees an empty page, not a crash.
      editor.setContent(BLANK_DOCUMENT)
    } finally {
      loading = false
    }
    dirty = false
    cancelTimer()
    await store.touch(id)
    render()
    persist()
    options.onSwitch?.(record)
  }

  const newDocument = async (template?: DocumentTemplate): Promise<DocumentRecord> => {
    const record = await store.create({
      doc: template ? template.doc : BLANK_DOCUMENT,
      ...(template ? { templateId: template.id } : {}),
    })
    await activate(record.id)
    options.onNewDocument?.(record)
    return record
  }

  /** Switch away from a closing or vanished active tab, or open a blank page. */
  const fallBack = async (fromIndex: number): Promise<void> => {
    const next = openIds[Math.min(fromIndex, openIds.length - 1)]
    if (next) await activate(next)
    else await newDocument()
  }

  const close = async (id: string): Promise<void> => {
    if (!openIds.includes(id)) return
    const meta = store.meta(id)
    if (meta && options.confirmClose && !(await options.confirmClose(meta))) return
    const wasActive = id === activeId
    if (wasActive) await flush()
    const index = openIds.indexOf(id)
    openIds = openIds.filter((candidate) => candidate !== id)
    if (wasActive) {
      activeId = null
      await fallBack(index)
    }
    render()
    persist()
  }

  const closeOthers = async (id: string): Promise<void> => {
    const keep = openIds.filter((candidate) => candidate === id || store.meta(candidate)?.pinned)
    if (activeId !== null && !keep.includes(activeId)) await flush()
    openIds = keep
    if (activeId === null || !keep.includes(activeId)) await activate(id)
    render()
    persist()
  }

  const remove = async (id: string): Promise<void> => {
    const meta = store.meta(id)
    if (!meta) return
    if (options.confirmDelete && !(await options.confirmDelete(meta))) return
    if (id === activeId) {
      // Whatever was typed dies with the document: never write it back.
      dirty = false
      cancelTimer()
    }
    // The store notification prunes the tab and picks the next document.
    await store.remove(id)
  }

  // ---- rename ----------------------------------------------------------------

  const startRename = (id: string): void => {
    renamingId = id
    render()
  }

  const finishRename = (value: string | null): void => {
    const id = renamingId
    if (id === null) return
    renamingId = null
    if (value?.trim() && value.trim() !== store.meta(id)?.title) {
      store.rename(id, value).catch(() => undefined)
    }
    render()
    strip.querySelector<HTMLElement>(`[role="tab"][data-document-id="${id}"]`)?.focus()
  }

  // ---- menus -----------------------------------------------------------------

  const moveToNewFolder = async (id: string): Promise<void> => {
    const name = await promptText('Folder name')
    const folder = normalizeFolder(name)
    if (folder) await store.move(id, folder)
  }

  const folderItems = (meta: DocumentMeta): MenuItem[] => [
    {
      id: 'folder:',
      label: 'No folder',
      disabled: meta.folder === null,
      onSelect: () => {
        store.move(meta.id, null).catch(() => undefined)
      },
    },
    ...store.folders().map(
      (folder): MenuItem => ({
        id: `folder:${folder}`,
        label: folder,
        disabled: meta.folder === folder,
        onSelect: () => {
          store.move(meta.id, folder).catch(() => undefined)
        },
      }),
    ),
    {
      id: 'new-folder',
      label: 'New folder…',
      separatorBefore: true,
      onSelect: () => {
        moveToNewFolder(meta.id).catch(() => undefined)
      },
    },
  ]

  const tabMenuItems = (meta: DocumentMeta): MenuItem[] => [
    {
      id: 'pin',
      label: meta.pinned ? 'Unpin' : 'Pin',
      onSelect: () => {
        store.setPinned(meta.id, !meta.pinned).catch(() => undefined)
      },
    },
    {
      id: 'favorite',
      label: meta.favorite ? 'Remove from favorites' : 'Add to favorites',
      onSelect: () => {
        store.setFavorite(meta.id, !meta.favorite).catch(() => undefined)
      },
    },
    { id: 'rename', label: 'Rename', onSelect: () => startRename(meta.id) },
    {
      id: 'duplicate',
      label: 'Duplicate',
      onSelect: () => {
        enqueue(async () => {
          const copy = await store.duplicate(meta.id)
          await activate(copy.id)
        }).catch(() => undefined)
      },
    },
    { id: 'move', label: 'Move to folder…', items: () => folderItems(meta) },
    {
      id: 'close-others',
      label: 'Close others',
      separatorBefore: true,
      onSelect: () => {
        enqueue(() => closeOthers(meta.id)).catch(() => undefined)
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      danger: true,
      onSelect: () => {
        enqueue(() => remove(meta.id)).catch(() => undefined)
      },
    },
  ]

  const openTabMenu = (id: string, anchor: HTMLElement): void => {
    const meta = store.meta(id)
    if (!meta) return
    openMenu(anchor, tabMenuItems(meta), {
      className: 'trevixal-tabs-bar__menu',
      label: `Actions for ${meta.title}`,
    })
  }

  const openNewMenu = (): void => {
    if (templates.length === 0) {
      enqueue(() => newDocument()).catch(() => undefined)
      return
    }
    const items = templates.map(
      (template): MenuItem => ({
        id: `template:${template.id}`,
        label: template.icon ? `${template.icon} ${template.name}` : template.name,
        onSelect: () => {
          enqueue(() => newDocument(template)).catch(() => undefined)
        },
      }),
    )
    openMenu(newButton, items, { className: 'trevixal-tabs-bar__menu', label: 'New document' })
  }

  // ---- events ----------------------------------------------------------------

  const itemOf = (target: EventTarget | null): { item: HTMLElement; id: string } | null => {
    const element = target as HTMLElement | null
    const item = element?.closest?.('.trevixal-tabs-bar__item') as HTMLElement | null | undefined
    const id = item?.dataset.documentId
    return item && id ? { item, id } : null
  }

  const onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null
    if (target?.closest?.('.trevixal-tabs-bar__new')) {
      openNewMenu()
      return
    }
    const hit = itemOf(target)
    if (!hit) return
    if (target?.closest('.trevixal-tabs-bar__close')) {
      enqueue(() => close(hit.id)).catch(() => undefined)
    } else if (target?.closest('.trevixal-tabs-bar__more')) {
      openTabMenu(hit.id, target.closest('.trevixal-tabs-bar__more') as HTMLElement)
    } else if (target?.closest('.trevixal-tabs-bar__tab')) {
      tabs.open(hit.id).catch(() => undefined)
    }
  }

  const onDoubleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null
    const hit = itemOf(target)
    if (hit && target?.closest?.('.trevixal-tabs-bar__tab')) startRename(hit.id)
  }

  // Middle-click closes, the way browser tabs do.
  const onAuxClick = (event: MouseEvent): void => {
    if (event.button !== 1) return
    const hit = itemOf(event.target)
    if (!hit || store.meta(hit.id)?.pinned) return
    event.preventDefault()
    enqueue(() => close(hit.id)).catch(() => undefined)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.classList.contains('trevixal-tabs-bar__rename')) {
      if (event.key === 'Enter') {
        event.preventDefault()
        finishRename((target as HTMLInputElement).value)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        finishRename(null)
      }
      return
    }
    if (!target.classList.contains('trevixal-tabs-bar__tab')) return
    const tabElements = [...strip.querySelectorAll<HTMLElement>('.trevixal-tabs-bar__tab')]
    const index = tabElements.indexOf(target)
    let next: HTMLElement | undefined
    if (event.key === 'ArrowRight') next = tabElements[(index + 1) % tabElements.length]
    else if (event.key === 'ArrowLeft') {
      next = tabElements[(index - 1 + tabElements.length) % tabElements.length]
    } else if (event.key === 'Home') next = tabElements[0]
    else if (event.key === 'End') next = tabElements[tabElements.length - 1]
    else if (event.key === 'Delete' || event.key === 'Backspace') {
      const id = target.dataset.documentId
      if (id && !store.meta(id)?.pinned) {
        event.preventDefault()
        enqueue(() => close(id)).catch(() => undefined)
      }
      return
    }
    if (!next) return
    event.preventDefault()
    next.focus()
    const id = next.dataset.documentId
    if (id) tabs.open(id).catch(() => undefined)
  }

  const onFocusOut = (event: FocusEvent): void => {
    const target = event.target as HTMLElement | null
    if (target?.classList.contains('trevixal-tabs-bar__rename') && renamingId !== null) {
      finishRename((target as HTMLInputElement).value)
    }
  }

  root.addEventListener('click', onClick)
  root.addEventListener('dblclick', onDoubleClick)
  root.addEventListener('auxclick', onAuxClick)
  root.addEventListener('keydown', onKeyDown)
  root.addEventListener('focusout', onFocusOut)

  // ---- store changes ---------------------------------------------------------

  const offStore = store.subscribe(() => {
    if (destroyed) return
    const remaining = openIds.filter((id) => store.meta(id) !== null)
    if (remaining.length !== openIds.length) {
      const index = activeId === null ? 0 : openIds.indexOf(activeId)
      const activeGone = activeId !== null && !remaining.includes(activeId)
      openIds = remaining
      if (activeGone) {
        activeId = null
        dirty = false
        cancelTimer()
        enqueue(() => fallBack(index)).catch(() => undefined)
      }
      persist()
    }
    render()
  })

  // ---- startup ---------------------------------------------------------------

  const ready = enqueue(async () => {
    const restored = parseTabsState(await store.storage.get(TABS_KEY))
    openIds = restored.open.filter((id) => store.meta(id) !== null)
    const initial =
      options.initialDocumentId && store.meta(options.initialDocumentId)
        ? options.initialDocumentId
        : null
    const target =
      initial ??
      (restored.active && openIds.includes(restored.active) ? restored.active : null) ??
      openIds[0] ??
      store.recent(1)[0]?.id ??
      store.list()[0]?.id ??
      null
    if (destroyed) return
    if (target) await activate(target)
    else await newDocument()
  })

  container.appendChild(root)

  const tabs: DocumentTabs = {
    element: root,
    ready,
    get activeId() {
      return activeId
    },
    get openIds() {
      return ordered().map((meta) => meta.id)
    },
    open(id) {
      return enqueue(async () => {
        if (id === activeId) return
        await activate(id)
      })
    },
    close(id) {
      return enqueue(() => close(id))
    },
    newDocument(template) {
      return enqueue(() => newDocument(template))
    },
    flush() {
      return enqueue(flush)
    },
    refresh: render,
    destroy() {
      if (destroyed) return
      // Save first: whatever is pending must not be lost with the strip.
      const pending = flush()
      destroyed = true
      pending.catch(() => undefined)
      cancelTimer()
      offUpdate()
      offStore()
      closeOpenMenu(doc)
      root.removeEventListener('click', onClick)
      root.removeEventListener('dblclick', onDoubleClick)
      root.removeEventListener('auxclick', onAuxClick)
      root.removeEventListener('keydown', onKeyDown)
      root.removeEventListener('focusout', onFocusOut)
      root.remove()
    },
  }
  return tabs
}
