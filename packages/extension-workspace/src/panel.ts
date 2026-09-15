/**
 * The workspace sidebar: search, favorites, recents and a folder tree of
 * every document, with drag-to-folder and a per-row action menu. It reads
 * the store's index synchronously and re-renders on every store change.
 */

import type { Editor } from '@trevixal/core'
import { type MenuItem, type PromptText, closeOpenMenu, defaultPrompt, openMenu } from './menu'
import { type DocumentMeta, type WorkspaceStore, normalizeFolder, parentFolder } from './store'
import type { DocumentTabs } from './tabs'

export interface WorkspacePanelOptions {
  readonly container: HTMLElement
  /** Show the recently opened section (default true). */
  readonly showRecent?: boolean
  /** Show the favorites section (default true). */
  readonly showFavorites?: boolean
  /** How many recents to list (default 5). */
  readonly recentLimit?: number
  /** Veto a delete. Defaults to allowing it. */
  readonly confirm?: (message: string, meta: DocumentMeta) => boolean | Promise<boolean>
  /** Ask for a name. Defaults to `window.prompt`. */
  readonly promptText?: PromptText
  readonly ariaLabel?: string
}

export interface WorkspacePanel {
  readonly element: HTMLElement
  /** Rebuild from the store. Called automatically on store changes. */
  refresh(): void
  destroy(): void
}

interface FolderNode {
  readonly path: string | null
  readonly name: string
  readonly children: Map<string, FolderNode>
  readonly docs: DocumentMeta[]
}

/** Arrange folders and documents into a tree rooted at the top level. */
function buildTree(folders: readonly string[], docs: readonly DocumentMeta[]): FolderNode {
  const root: FolderNode = { path: null, name: '', children: new Map(), docs: [] }
  const nodeFor = (path: string | null): FolderNode => {
    if (path === null) return root
    let node = root
    let current = ''
    for (const segment of path.split('/')) {
      current = current ? `${current}/${segment}` : segment
      let child = node.children.get(segment)
      if (!child) {
        child = { path: current, name: segment, children: new Map(), docs: [] }
        node.children.set(segment, child)
      }
      node = child
    }
    return node
  }
  for (const folder of folders) nodeFor(folder)
  for (const meta of docs) nodeFor(meta.folder).docs.push(meta)
  return root
}

const byTitle = (a: DocumentMeta, b: DocumentMeta): number => a.title.localeCompare(b.title)

export function createWorkspacePanel(
  editor: Editor,
  store: WorkspaceStore,
  tabs: DocumentTabs,
  options: WorkspacePanelOptions,
): WorkspacePanel {
  const container = options.container
  const doc = container.ownerDocument
  const showRecent = options.showRecent ?? true
  const showFavorites = options.showFavorites ?? true
  const recentLimit = options.recentLimit ?? 5
  const confirm = options.confirm ?? (() => true)
  const promptText = options.promptText ?? defaultPrompt

  const root = doc.createElement('aside')
  root.className = 'trevixal-workspace'
  root.setAttribute('aria-label', options.ariaLabel ?? 'Workspace')

  const toolbar = doc.createElement('div')
  toolbar.className = 'trevixal-workspace__toolbar'

  const search = doc.createElement('input')
  search.type = 'search'
  search.className = 'trevixal-workspace__search'
  search.placeholder = 'Search documents'
  search.setAttribute('aria-label', 'Search documents')

  const newDocButton = doc.createElement('button')
  newDocButton.type = 'button'
  newDocButton.className = 'trevixal-workspace__action'
  newDocButton.dataset.action = 'new-document'
  newDocButton.textContent = 'New document'

  const newFolderButton = doc.createElement('button')
  newFolderButton.type = 'button'
  newFolderButton.className = 'trevixal-workspace__action'
  newFolderButton.dataset.action = 'new-folder'
  newFolderButton.textContent = 'New folder'

  toolbar.append(search, newDocButton, newFolderButton)

  const body = doc.createElement('div')
  body.className = 'trevixal-workspace__body'
  root.append(toolbar, body)

  let query = ''
  /** Folders the user collapsed; everything else renders open. */
  const collapsed = new Set<string>()
  /** The row being dragged, for environments whose drop event carries no data. */
  let draggingId: string | null = null
  let destroyed = false

  // ---- rendering -------------------------------------------------------------

  const renderRow = (meta: DocumentMeta): HTMLElement => {
    const row = doc.createElement('li')
    row.className = 'trevixal-workspace__row'
    row.dataset.documentId = meta.id
    row.draggable = true
    row.setAttribute('draggable', 'true')
    if (meta.id === tabs.activeId) row.setAttribute('aria-current', 'true')

    const title = doc.createElement('button')
    title.type = 'button'
    title.className = 'trevixal-workspace__title'
    title.textContent = meta.title
    title.title = meta.folder ? `${meta.folder}/${meta.title}` : meta.title

    const star = doc.createElement('button')
    star.type = 'button'
    star.className = 'trevixal-workspace__star'
    star.setAttribute('aria-pressed', meta.favorite ? 'true' : 'false')
    star.setAttribute('aria-label', `Favorite ${meta.title}`)
    star.textContent = meta.favorite ? '★' : '☆'

    const more = doc.createElement('button')
    more.type = 'button'
    more.className = 'trevixal-workspace__more'
    more.textContent = '…'
    more.setAttribute('aria-label', `More actions for ${meta.title}`)
    more.setAttribute('aria-haspopup', 'menu')

    row.append(title, star, more)
    return row
  }

  const renderSection = (
    key: string,
    heading: string,
    docs: readonly DocumentMeta[],
    emptyLabel?: string,
  ): HTMLElement => {
    const section = doc.createElement('section')
    section.className = 'trevixal-workspace__section'
    section.dataset.section = key
    const title = doc.createElement('h3')
    title.className = 'trevixal-workspace__heading'
    title.textContent = heading
    section.appendChild(title)
    if (docs.length === 0 && emptyLabel) {
      const empty = doc.createElement('p')
      empty.className = 'trevixal-workspace__empty'
      empty.textContent = emptyLabel
      section.appendChild(empty)
      return section
    }
    const list = doc.createElement('ul')
    list.className = 'trevixal-workspace__list'
    for (const meta of docs) list.appendChild(renderRow(meta))
    section.appendChild(list)
    return section
  }

  const renderFolder = (node: FolderNode): HTMLElement => {
    const list = doc.createElement('ul')
    list.className = 'trevixal-workspace__list'
    list.dataset.folder = node.path ?? ''
    const children = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))
    for (const child of children) {
      const path = child.path as string
      const item = doc.createElement('li')
      item.className = 'trevixal-workspace__folder-item'
      const details = doc.createElement('details')
      details.className = 'trevixal-workspace__folder'
      details.dataset.folder = path
      if (!collapsed.has(path)) details.setAttribute('open', '')
      const summary = doc.createElement('summary')
      summary.className = 'trevixal-workspace__folder-heading'
      summary.dataset.dropFolder = path
      const name = doc.createElement('span')
      name.className = 'trevixal-workspace__folder-name'
      name.textContent = child.name
      const more = doc.createElement('button')
      more.type = 'button'
      more.className = 'trevixal-workspace__more'
      more.textContent = '…'
      more.setAttribute('aria-label', `More actions for folder ${child.name}`)
      more.setAttribute('aria-haspopup', 'menu')
      summary.append(name, more)
      details.append(summary, renderFolder(child))
      item.appendChild(details)
      list.appendChild(item)
    }
    for (const meta of [...node.docs].sort(byTitle)) list.appendChild(renderRow(meta))
    return list
  }

  const render = (): void => {
    body.replaceChildren()
    if (query.trim()) {
      body.appendChild(renderSection('results', 'Results', store.search(query), 'No matches'))
      return
    }
    if (showFavorites) {
      const favorites = store.favorites()
      if (favorites.length > 0) body.appendChild(renderSection('favorites', 'Favorites', favorites))
    }
    if (showRecent) {
      const recent = store.recent(recentLimit)
      if (recent.length > 0) body.appendChild(renderSection('recent', 'Recent', recent))
    }
    const section = doc.createElement('section')
    section.className = 'trevixal-workspace__section'
    section.dataset.section = 'documents'
    const heading = doc.createElement('h3')
    heading.className = 'trevixal-workspace__heading'
    heading.textContent = 'Documents'
    // Dropping on the heading files a document back at the top level.
    heading.dataset.dropFolder = ''
    section.appendChild(heading)
    const all = store.list()
    if (all.length === 0) {
      const empty = doc.createElement('p')
      empty.className = 'trevixal-workspace__empty'
      empty.textContent = 'No documents yet'
      section.appendChild(empty)
    } else {
      section.appendChild(renderFolder(buildTree(store.folders(), all)))
    }
    body.appendChild(section)
  }

  // ---- actions ---------------------------------------------------------------

  const openDocument = async (id: string): Promise<void> => {
    await tabs.open(id)
    editor.view?.focus()
  }

  const renameDocument = async (meta: DocumentMeta): Promise<void> => {
    const name = await promptText('Document title', meta.title)
    if (name?.trim()) await store.rename(meta.id, name)
  }

  const deleteDocument = async (meta: DocumentMeta): Promise<void> => {
    if (!(await confirm(`Delete "${meta.title}"?`, meta))) return
    await store.remove(meta.id)
  }

  const moveToNewFolder = async (meta: DocumentMeta): Promise<void> => {
    const folder = normalizeFolder(await promptText('Folder name'))
    if (folder) await store.move(meta.id, folder)
  }

  const createFolder = async (parent: string | null): Promise<void> => {
    const name = normalizeFolder(await promptText('Folder name'))
    if (!name) return
    await store.createFolder(parent ? `${parent}/${name}` : name)
  }

  const renameFolder = async (path: string): Promise<void> => {
    const leaf = path.split('/').pop() ?? path
    const name = normalizeFolder(await promptText('Folder name', leaf))
    if (!name || name === leaf) return
    const parent = parentFolder(path)
    await store.renameFolder(path, parent ? `${parent}/${name}` : name)
  }

  const run = (task: Promise<unknown>): void => {
    task.catch(() => undefined)
  }

  const folderItems = (meta: DocumentMeta): MenuItem[] => [
    {
      id: 'folder:',
      label: 'No folder',
      disabled: meta.folder === null,
      onSelect: () => run(store.move(meta.id, null)),
    },
    ...store.folders().map(
      (folder): MenuItem => ({
        id: `folder:${folder}`,
        label: folder,
        disabled: meta.folder === folder,
        onSelect: () => run(store.move(meta.id, folder)),
      }),
    ),
    {
      id: 'new-folder',
      label: 'New folder…',
      separatorBefore: true,
      onSelect: () => run(moveToNewFolder(meta)),
    },
  ]

  const rowMenuItems = (meta: DocumentMeta): MenuItem[] => [
    { id: 'open', label: 'Open', onSelect: () => run(openDocument(meta.id)) },
    { id: 'rename', label: 'Rename', onSelect: () => run(renameDocument(meta)) },
    { id: 'move', label: 'Move to…', items: () => folderItems(meta) },
    {
      id: 'favorite',
      label: meta.favorite ? 'Remove from favorites' : 'Add to favorites',
      onSelect: () => run(store.setFavorite(meta.id, !meta.favorite)),
    },
    { id: 'duplicate', label: 'Duplicate', onSelect: () => run(store.duplicate(meta.id)) },
    {
      id: 'delete',
      label: 'Delete',
      danger: true,
      separatorBefore: true,
      onSelect: () => run(deleteDocument(meta)),
    },
  ]

  const folderMenuItems = (path: string): MenuItem[] => [
    { id: 'new-subfolder', label: 'New subfolder', onSelect: () => run(createFolder(path)) },
    { id: 'rename-folder', label: 'Rename folder', onSelect: () => run(renameFolder(path)) },
    {
      id: 'delete-folder',
      label: 'Delete folder',
      danger: true,
      separatorBefore: true,
      onSelect: () => run(store.removeFolder(path)),
    },
  ]

  // ---- events ----------------------------------------------------------------

  const rowOf = (target: EventTarget | null): { row: HTMLElement; meta: DocumentMeta } | null => {
    const element = target as HTMLElement | null
    const row = element?.closest?.('.trevixal-workspace__row') as HTMLElement | null | undefined
    const meta = row?.dataset.documentId ? store.meta(row.dataset.documentId) : null
    return row && meta ? { row, meta } : null
  }

  const onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.closest?.('[data-action="new-document"]')) {
      run(tabs.newDocument())
      return
    }
    if (target.closest?.('[data-action="new-folder"]')) {
      run(createFolder(null))
      return
    }
    const folderMore = target.closest?.(
      '.trevixal-workspace__folder-heading .trevixal-workspace__more',
    )
    if (folderMore) {
      // Inside a <summary>, so the click would also toggle the folder.
      event.preventDefault()
      const path = (folderMore.closest('.trevixal-workspace__folder') as HTMLElement | null)
        ?.dataset.folder
      if (path) {
        openMenu(folderMore as HTMLElement, folderMenuItems(path), {
          className: 'trevixal-workspace__menu',
          label: `Actions for folder ${path}`,
        })
      }
      return
    }
    const hit = rowOf(target)
    if (!hit) return
    if (target.closest('.trevixal-workspace__star')) {
      run(store.setFavorite(hit.meta.id, !hit.meta.favorite))
    } else if (target.closest('.trevixal-workspace__more')) {
      openMenu(target.closest('.trevixal-workspace__more') as HTMLElement, rowMenuItems(hit.meta), {
        className: 'trevixal-workspace__menu',
        label: `Actions for ${hit.meta.title}`,
      })
    } else {
      run(openDocument(hit.meta.id))
    }
  }

  const onInput = (): void => {
    query = search.value
    render()
  }

  // `toggle` does not bubble; the capture phase still visits ancestors.
  const onToggle = (event: Event): void => {
    const details = event.target as HTMLElement | null
    const path = details?.dataset?.folder
    if (!details || path === undefined || details.tagName !== 'DETAILS') return
    if (details.hasAttribute('open')) collapsed.delete(path)
    else collapsed.add(path)
  }

  const onDragStart = (event: DragEvent): void => {
    const hit = rowOf(event.target)
    if (!hit) return
    draggingId = hit.meta.id
    event.dataTransfer?.setData('text/plain', hit.meta.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  const dropTargetOf = (target: EventTarget | null): HTMLElement | null =>
    ((target as HTMLElement | null)?.closest?.('[data-drop-folder]') as HTMLElement | null) ?? null

  const highlight = (target: HTMLElement | null, on: boolean): void => {
    const folder = target?.closest('.trevixal-workspace__folder') ?? target
    folder?.classList.toggle('trevixal-workspace__folder--dragover', on)
  }

  const onDragOver = (event: DragEvent): void => {
    const target = dropTargetOf(event.target)
    if (!target) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    highlight(target, true)
  }

  const onDragLeave = (event: DragEvent): void => {
    highlight(dropTargetOf(event.target), false)
  }

  const onDrop = (event: DragEvent): void => {
    const target = dropTargetOf(event.target)
    if (!target) return
    event.preventDefault()
    highlight(target, false)
    const id = event.dataTransfer?.getData('text/plain') || draggingId
    draggingId = null
    if (!id || !store.meta(id)) return
    const folder = target.dataset.dropFolder || null
    run(store.move(id, folder))
  }

  const onDragEnd = (): void => {
    draggingId = null
    for (const element of root.querySelectorAll('.trevixal-workspace__folder--dragover')) {
      element.classList.remove('trevixal-workspace__folder--dragover')
    }
  }

  root.addEventListener('click', onClick)
  search.addEventListener('input', onInput)
  root.addEventListener('toggle', onToggle, true)
  root.addEventListener('dragstart', onDragStart as EventListener)
  root.addEventListener('dragover', onDragOver as EventListener)
  root.addEventListener('dragleave', onDragLeave as EventListener)
  root.addEventListener('drop', onDrop as EventListener)
  root.addEventListener('dragend', onDragEnd)

  const offStore = store.subscribe(() => {
    if (!destroyed) render()
  })

  render()
  container.appendChild(root)

  return {
    element: root,
    refresh: render,
    destroy() {
      if (destroyed) return
      destroyed = true
      offStore()
      closeOpenMenu(doc)
      root.removeEventListener('click', onClick)
      search.removeEventListener('input', onInput)
      root.removeEventListener('toggle', onToggle, true)
      root.removeEventListener('dragstart', onDragStart as EventListener)
      root.removeEventListener('dragover', onDragOver as EventListener)
      root.removeEventListener('dragleave', onDragLeave as EventListener)
      root.removeEventListener('drop', onDrop as EventListener)
      root.removeEventListener('dragend', onDragEnd)
      root.remove()
    },
  }
}
