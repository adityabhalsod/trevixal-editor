/**
 * @trevixal/extension-workspace. A document store with folders, templates,
 * recents and favorites; a tab strip that switches the editor between
 * documents and autosaves; a workspace sidebar; and a split view with a
 * live preview or a mirrored second editor.
 */

export {
  type CreateDocumentOptions,
  DOC_KEY_PREFIX,
  type DocumentMeta,
  type DocumentRecord,
  INDEX_KEY,
  type KeyValueStorage,
  type SaveDocumentOptions,
  type WorkspaceBundle,
  type WorkspaceListener,
  WorkspaceStore,
  type WorkspaceStoreOptions,
  createMemoryStorage,
  createWebStorage,
  deriveTitle,
  normalizeFolder,
  parentFolder,
  randomId,
} from './store'
export {
  BLANK_DOCUMENT,
  type DocumentTemplate,
  defaultTemplates,
  documentTitleFrom,
  templateToDoc,
} from './templates'
export { type Menu, type MenuItem, type MenuOptions, type PromptText, openMenu } from './menu'
export { type DocumentTabs, type DocumentTabsOptions, TABS_KEY, createDocumentTabs } from './tabs'
export { type WorkspacePanel, type WorkspacePanelOptions, createWorkspacePanel } from './panel'
export {
  MIRROR_META,
  type SplitMode,
  type SplitOrientation,
  type SplitView,
  type SplitViewOptions,
  createSplitView,
  mirrorEditors,
} from './split'
