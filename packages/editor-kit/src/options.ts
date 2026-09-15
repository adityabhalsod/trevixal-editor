/**
 * What a host gets to decide, and what it gets back.
 *
 * Everything here is configuration: where to build, what to open with, whose
 * name goes on a tracked change, which corner of `localStorage` to use. The
 * assembly itself (which extensions, which menus, which panels) is the
 * package's job, and is not an option, because a build that ships half of
 * them is not what this package is for.
 */
import type { DocJSON, Editor } from '@trevixal/core'
import type { EditorUI } from '@trevixal/ui'
import type { FullEditorLayout, LayoutOptions } from './layout'

/** One line in the About dialog. */
export interface AboutRow {
  readonly term: string
  readonly description: string
}

/** What the About dialog says before the host adds anything of its own. */
export const DEFAULT_ABOUT_ROWS: readonly AboutRow[] = [
  { term: 'Packages', description: '@trevixal/core, /ui and twenty extensions' },
  { term: 'Rendering', description: 'Plain DOM, no virtual DOM and no framework' },
]

export interface FullEditorOptions extends LayoutOptions {
  /**
   * The element to build into. It is emptied first, so give the editor one of
   * its own rather than a box that already holds something.
   */
  readonly element: HTMLElement
  /** The document to open with. Defaults to the tour of every block type. */
  readonly content?: DocJSON
  /** The grey text in an empty document. */
  readonly placeholder?: string
  /** Whose name goes on a suggestion while track changes is on. */
  readonly author?: string
  /**
   * The prefix under which preferences, the autosave draft, its backups and
   * the document workspace are kept in `localStorage`. Give two editors on one
   * origin two namespaces and neither reads the other's drafts; give them the
   * same one and they share, which is sometimes the point.
   */
  readonly namespace?: string
  /**
   * Where dropped images and attachments are POSTed. The upload falls back to
   * a data URL when the endpoint is missing or refuses, so a build with no
   * server still works; pass null to skip the request and go straight to the
   * data URL.
   */
  readonly uploadEndpoint?: string | null
  /** Refuse an image larger than this, in bytes. Default 5 MB. */
  readonly maxImageBytes?: number
  /** Extra rows for the About dialog, after the package's own. */
  readonly aboutRows?: readonly AboutRow[]
  /** Called after every change, once the readouts have been refreshed. */
  readonly onChange?: (editor: Editor) => void
}

/** The mounted editor, and the one call that takes it back down. */
export interface FullEditor {
  readonly editor: Editor
  /** Every element the layout built, for a host that wants to reach one. */
  readonly layout: FullEditorLayout
  /** The menubar, toolbar and status bar, for a host that wants to drive them. */
  readonly ui: EditorUI
  /**
   * Tear it all down: panes, listeners, autosave, chrome, the editor and the
   * DOM this built. Safe to call twice. A framework that unmounts and mounts
   * again, React's strict mode does exactly that, needs this to be complete,
   * or the second editor competes with the first over the same document.
   */
  destroy(): void
}
