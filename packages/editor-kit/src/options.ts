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
import type { MentionEvent, MentionUser } from '@trevixal/extension-comments'
import type { SynonymLookup, WritingProvider } from '@trevixal/extension-writing'
import type { EditorUI, Messages } from '@trevixal/ui'
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
  /**
   * A pasted link's page title, fetched by the host, as uploads are sent:
   * with it, a pasted address shows as its page's title. Without it, the
   * editor asks nothing of the network and the address stays as pasted.
   */
  readonly fetchLinkTitle?: (href: string) => Promise<string | null>
  /**
   * A web page's HTML, for File ▸ Import from a web address. The browser can
   * only fetch a page that allows it, so a host with a server passes one that
   * fetches on the server's side. Without it, the browser tries directly.
   */
  readonly fetchPage?: (url: string) => Promise<string>
  /**
   * Whether an outside address answers, for Tools ▸ Check links. Defaults to
   * a request with no CORS, which tells a dead address from a live one; pass
   * null for a check that stays offline.
   */
  readonly checkLinkURL?: ((href: string) => Promise<'ok' | 'broken' | 'unknown'>) | null
  /**
   * The PlantUML server that draws PlantUML blocks; the public one by
   * default. A diagram's source goes to it in the picture's address, so pass
   * your own server, or null to leave PlantUML undrawn.
   */
  readonly plantumlServer?: string | null
  /**
   * A map tile URL template, `{z}`, `{x}` and `{y}` in it, for Insert ▸ Map:
   * any provider's. OpenStreetMap's by default, with its credit.
   */
  readonly mapTiles?: string
  /** The credit the map tiles ask for. */
  readonly mapAttribution?: string
  /**
   * The writing assistant behind Tools ▸ Writing assistant: an object with
   * the actions it can do and an `assist` that does one. The kit sends
   * nothing anywhere itself; by default it rewrites and summarises by rule,
   * in the page. Pass a provider over your own model to rewrite, summarise,
   * translate and continue; null hides the menu.
   */
  readonly writingProvider?: WritingProvider | null
  /** The people a comment can mention with `@`; none by default. */
  readonly users?: readonly MentionUser[]
  /** Called once for each person a new comment or reply mentions, to send them a note. */
  readonly onMention?: (event: MentionEvent) => void
  /**
   * Synonyms for Right-click ▸ a word: a function over your own word list or
   * a thesaurus service. A small built-in English list by default; null
   * leaves right-click to the browser.
   */
  readonly thesaurus?: SynonymLookup | null
  /**
   * The chrome's translations, by language code, each loaded only when it is
   * chosen: `{ de: () => import('@trevixal/ui/locales/de').then((m) => m.default) }`.
   * With any given, View ▸ Language offers them beside English, and the
   * choice is remembered. Arabic mirrors the chrome.
   */
  readonly languages?: Readonly<Record<string, () => Promise<Messages>>>
  /**
   * Minutes with nothing typed, clicked or scrolled before a password-protected
   * document locks the screen until the password is given again. 10 by
   * default; 0 turns the timer off, leaving File ▸ Lock now.
   */
  readonly autoLockMinutes?: number
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
