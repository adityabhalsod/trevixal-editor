/**
 * The page around the editor.
 *
 * Every surface this package wires up needs somewhere to live: the menubar and
 * toolbar, the tab strip, the review bar, four sidebar panels, the two extra
 * panes, a status line and the serialized-HTML readout. Building that skeleton
 * here rather than asking the host page for it is what lets a caller mount the
 * whole editor into one empty element, a `<div>` in a React effect, a
 * `ref` in Vue, an `ElementRef` in Angular, instead of reproducing a dozen
 * ids in every framework's own template.
 *
 * The ids are the ones the stylesheet and the browser suite already know, so
 * one page hosts one full editor. That is a real limit rather than an
 * oversight: autosave, the command palette and the workspace store are all
 * per-origin singletons, and a second copy would fight the first over each.
 */

/** Copy for the header this layout puts above the editor. */
export interface FullEditorIntro {
  /** The page heading. Plain text; pass null for no heading at all. */
  readonly heading?: string | null
  /**
   * Paragraphs under the heading, each an HTML string so it can carry
   * `<code>` and `<strong>`. It is written into the page as markup, so pass
   * copy you control, never anything a reader typed.
   */
  readonly paragraphs?: readonly string[]
}

/** Every element the editor's parts attach to, built once and handed out. */
export interface FullEditorLayout {
  readonly root: HTMLElement
  readonly tabs: HTMLElement
  readonly chrome: HTMLElement
  readonly review: HTMLElement
  readonly shell: HTMLElement
  readonly sidebar: HTMLElement
  readonly toc: HTMLElement
  readonly outline: HTMLElement
  readonly history: HTMLElement
  readonly workspace: HTMLElement
  readonly editor: HTMLElement
  readonly split: HTMLElement
  readonly mirror: HTMLElement
  readonly saveStatus: HTMLElement
  readonly goal: HTMLElement
  readonly security: HTMLElement
  readonly offline: HTMLElement
  readonly uploadStatus: HTMLElement
  /** The serialized-HTML readout, or null when `showSerializedHTML` is off. */
  readonly output: HTMLElement | null
  /** The four sidebar sections, in the order they appear. */
  readonly panels: readonly HTMLElement[]
  /** Empty the host and put back the classes it arrived with. */
  destroy(): void
}

export interface LayoutOptions extends FullEditorIntro {
  /** The readout that shows the HTML a download would produce. Default true. */
  readonly showSerializedHTML?: boolean
  /** Heading over that readout. */
  readonly serializedHTMLLabel?: string
}

/** What the demo says about itself when the caller says nothing. */
export const DEFAULT_INTRO: Required<FullEditorIntro> = {
  heading: 'Trevixal: the full editor',
  paragraphs: [
    'Menubar, toolbar, dialogs and status bar, with tables and image uploads. ' +
      'Drag an image in, paste a screenshot, or use the toolbar’s image button. ' +
      'Type <code>```</code> for a code block; a language picker appears over it, and it ' +
      'edits like a code editor: Enter keeps your indentation, brackets and quotes close ' +
      'themselves, Tab indents and <code>Ctrl+Enter</code> leaves the block. Click a table ' +
      'cell for its own toolbar; drag a cell’s edge to resize its column or row (Shift ' +
      'moves that border on its own), or the handle at the table’s corner to scale the ' +
      'whole table, never past the editor’s edge. The brush copies formatting from one ' +
      'place to another, double-click it to keep painting.',
    'This build adds task lists, callouts, toggles, tabs, accordions, columns, cards, ' +
      'timelines, badges, buttons, anchors, footnotes and citations; small caps, letter ' +
      'spacing, line height and case conversion; a table of contents, document outline, ' +
      'find&nbsp;&amp; replace, a command palette (<code>Ctrl+K</code> or ' +
      '<code>Ctrl+Shift+P</code>), focus mode and fullscreen. Every one of them is on the ' +
      'toolbar and in the menus, and the toolbar’s groups drag into whatever order you ' +
      'like by their grips, which is remembered. Every shortcut a menu prints comes from the ' +
      'shortcut manager, so what you read is what fires; rebind any of it under ' +
      '<strong>Help ▸ Keyboard shortcuts</strong> and the menus reprint on the spot.',
    'Type <code>/</code> at the start of a block for the insert menu, headings, lists, ' +
      'quotes, code, tables, images, diagrams, equations, callouts, columns and toggles. ' +
      '<code>:</code> opens the emoji shortcodes (<code>:smile:</code>), and ' +
      '<strong>Insert ▸ Emoji…</strong> opens the same set as a grid.',
    '<strong>File</strong> opens and saves real files (HTML, Markdown, text and JSON), ' +
      'prints and previews. Your work autosaves to this browser with rolling backups and a ' +
      'draft you can restore. <strong>Insert</strong> adds video, audio, YouTube and Vimeo ' +
      'embeds, attachments, link cards, LaTeX equations and Mermaid diagrams. ' +
      '<strong>Table</strong> sorts, recolours cells, changes borders, and converts to and ' +
      'from text and CSV. <strong>Tools</strong> checks your writing and counts what you have ' +
      'written against a goal, and each writing check (grammar, passive voice, repeated ' +
      'words, long sentences) turns on and off on its own. <strong>View</strong> has five ' +
      'extra themes, a custom theme and custom CSS, a page view, an edit history, a document ' +
      'workspace with tabs, a side-by-side preview and a split editor, two live surfaces on ' +
      'one document.',
    '<strong>File ▸ Protect with password…</strong> encrypts everything this page saves: ' +
      'the draft and every rolling backup, with AES-256-GCM, and <strong>Download ▸ ' +
      'Encrypted document (.tvx)</strong> writes the same envelope to a file that ' +
      '<strong>Open…</strong> reads back. Give it an expiry and the deadline is sealed into ' +
      'the ciphertext. <strong>Restrictions…</strong> blocks copy, cut, paste, print, ' +
      'download or the context menu, and says so in the status line when one is attempted. ' +
      '<strong>View ▸ Read-only mode</strong> locks the surface against edits without ' +
      'touching what is saved.',
  ],
}

const PANEL_TITLES: readonly (readonly [string, string])[] = [
  ['toc', 'Contents'],
  ['outline', 'Outline'],
  ['history', 'History'],
  ['workspace', 'Documents'],
]

/** Build the whole skeleton inside `host` and hand back every part of it. */
export function createLayout(host: HTMLElement, options: LayoutOptions = {}): FullEditorLayout {
  const doc = host.ownerDocument
  const made = new Map<string, HTMLElement>()

  const make = (tag: string, id?: string, className?: string): HTMLElement => {
    const element = doc.createElement(tag)
    if (id) {
      element.id = id
      made.set(id, element)
    }
    if (className) element.className = className
    return element
  }

  const hadClasses = host.className
  // `trevixal` is what the theme tokens key off; the second class is this
  // package's own shell, so the page CSS can style the box without reaching
  // for <body>, which is not ours to style when a framework owns the page.
  host.classList.add('trevixal', 'trevixal-full-editor')
  host.replaceChildren()

  const intro = { ...DEFAULT_INTRO, ...options }
  if (intro.heading !== null) {
    const heading = make('h1')
    heading.textContent = intro.heading
    host.append(heading)
  }
  for (const paragraph of intro.paragraphs) {
    const p = make('p')
    // Copy from the caller, not from the document: see `FullEditorIntro`.
    p.innerHTML = paragraph
    host.append(p)
  }

  const tabs = make('div', 'tabs')
  const chrome = make('div', 'chrome')
  const review = make('div', 'review')
  host.append(tabs, chrome, review)

  const shell = make('div', undefined, 'editor-shell')
  const sidebar = make('aside', 'sidebar')
  sidebar.hidden = true
  const panels = PANEL_TITLES.map(([id, title]) => {
    const section = make('section', id)
    section.hidden = true
    const label = doc.createElement('h3')
    label.textContent = title
    section.append(label)
    sidebar.append(section)
    return section
  })

  const editor = make('div', 'editor')
  const split = make('div', 'split')
  split.hidden = true
  const mirror = make('div', 'mirror')
  mirror.hidden = true
  shell.append(sidebar, editor, split, mirror)
  host.append(shell)

  const statusline = make('div', undefined, 'statusline')
  const saveStatus = make('span', 'save-status')
  const goal = make('span', 'goal')
  const security = make('span', 'security')
  security.hidden = true
  const offline = make('span', 'offline')
  offline.hidden = true
  statusline.append(saveStatus, goal, security, offline)
  host.append(statusline)

  const uploadStatus = make('p', 'upload-status')
  uploadStatus.textContent = 'No uploads yet.'
  host.append(uploadStatus)

  let output: HTMLElement | null = null
  if (options.showSerializedHTML !== false) {
    const label = doc.createElement('h2')
    label.textContent = options.serializedHTMLLabel ?? 'Serialized HTML'
    output = make('div', 'output')
    output.textContent = 'Start typing…'
    host.append(label, output)
  }

  const [toc, outlinePanel, historyPanel, workspacePanel] = panels as [
    HTMLElement,
    HTMLElement,
    HTMLElement,
    HTMLElement,
  ]

  return {
    root: host,
    tabs,
    chrome,
    review,
    shell,
    sidebar,
    toc,
    outline: outlinePanel,
    history: historyPanel,
    workspace: workspacePanel,
    editor,
    split,
    mirror,
    saveStatus,
    goal,
    security,
    offline,
    uploadStatus,
    output,
    panels,
    destroy() {
      host.replaceChildren()
      host.className = hadClasses
      made.clear()
    },
  }
}
