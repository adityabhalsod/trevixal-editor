import {
  type Command,
  type Editor,
  type EditorNode,
  type EditorState,
  Fragment,
  ReplaceNodesStep,
  insertBlockAfter,
  insertEmailLink,
  isEmailAddress,
  parseHTML,
  parseMarkdown,
  safeHref,
  serializeToMarkdown,
  setLinkTarget,
} from '@trevixal/core'
import { collectDocumentCSS } from './collect-css'
import { type DialogField, openCharacterPicker, openDialog } from './dialog'
import { printDocument } from './documents'
import { type FindReplace, createFindReplace } from './find-replace'
import type { Messages } from './i18n'
import { type Menu, type MenuItem, type Menubar, createMenubar, defaultMenus } from './menubar'
import type { ShortcutLabels } from './shortcuts'
import { type StatusBar, createStatusBar } from './status-bar'
import {
  TABLE_LINE_STYLE_ENTRIES,
  TABLE_LINE_WEIGHT_ENTRIES,
  TABLE_STYLE_OPTION_ENTRIES,
  type TableDesignCommands,
  type TableDesignState,
  type TableLineStyle,
  type TableLineWeight,
  type TableStyleOptionName,
  type TableStyleTile,
  tableStyleEntryName,
} from './table-design'
import { openSplitCellsDialog } from './table-toolbar'
import {
  type BlockCommands,
  type CodeFormatCommands,
  type Toolbar,
  type ToolbarOptions,
  createToolbar,
} from './toolbar'

/**
 * Table commands the UI drives, supplied by the host so `@trevixal/ui` does
 * not depend on `@trevixal/extension-table`. Pass `tableUICommands()` from
 * that package, or your own equivalents.
 */
export interface TableCommands {
  readonly insertTable: (rows: number, cols: number) => Command
  readonly addRowBefore?: Command
  readonly addRowAfter?: Command
  readonly deleteRow?: Command
  readonly addColumnBefore?: Command
  readonly addColumnAfter?: Command
  readonly deleteColumn?: Command
  readonly mergeCells?: Command
  readonly splitCell?: Command
  /** Word's Split Cells; when present, Table ▸ Split asks how many columns. */
  readonly splitCellInto?: (columns: number) => Command
  readonly toggleHeaderRow?: Command
  readonly deleteTable?: Command
  // Data-shaping commands, from `tableUICommands()`. Menu entries for the
  // ones a host leaves out are removed rather than shown disabled.
  readonly setCellAlign?: (align: 'left' | 'center' | 'right' | null) => Command
  readonly setCellBackground?: (color: string | null) => Command
  readonly setTableBorders?: (borders: 'all' | 'outer' | 'horizontal' | 'none' | null) => Command
  readonly setTableBorderColor?: (color: string | null) => Command
  readonly sortAscending?: Command
  readonly sortDescending?: Command
  readonly convertTextToTable?: Command
  readonly convertTableToText?: Command
  readonly insertTableFromCSV?: (csv: string) => Command
  /** Reads the table at the selection as CSV; not a command, a reader. */
  readonly csvAtSelection?: (state: EditorState) => string | null
  readonly distributeColumns?: Command
  readonly clearSizing?: Command
  /** Word's AutoFit: columns to their content, the table to the window, or the columns held as they are. */
  readonly autoFitContents?: Command
  readonly autoFitWindow?: Command
  readonly fixColumnWidths?: Command
  readonly distributeRows?: Command
  /**
   * Word's Draw Table, Eraser and Border Painter, which the pointer holds
   * rather than runs: picking one from the Table menu takes it up, picking
   * it again puts it down. `createTableTools` from the table package
   * supplies all three.
   */
  readonly toggleTableTool?: (tool: 'draw' | 'erase' | 'paint') => void
  /** The tool held now, so its menu entry shows a tick. */
  readonly activeTableTool?: () => 'draw' | 'erase' | 'paint' | null
  // Word's Table Design tab, from `tableUICommands()`. With all of them, the
  // toolbar gains the Table design dropdown; each also has Table-menu entries.
  /** The styles gallery, in order. */
  readonly tableStyles?: readonly TableStyleTile[]
  readonly setTableStyle?: (style: string | null, accentColor: string | null) => Command
  /** Word's Table Style Options, the header row included. */
  readonly toggleStyleOption?: (option: TableStyleOptionName) => Command
  /** The pen every line is drawn with; its colour is `setTableBorderColor`. */
  readonly setTableBorderStyle?: (style: TableLineStyle | null) => Command
  readonly setTableBorderWidth?: (width: TableLineWeight | null) => Command
  /** The design of the table at the selection, for the toolbar and the ticks; a reader. */
  readonly tableDesignAt?: (state: EditorState) => TableDesignState | null
}

/** Media and embed commands, from `@trevixal/extension-embed`. */
export interface EmbedCommands {
  readonly insertEmbed?: (url: string) => Command
  readonly insertVideo?: (src: string) => Command
  readonly insertAudio?: (src: string) => Command
  readonly insertIframe?: (src: string, title?: string) => Command
  readonly insertLinkCard?: (attrs: { href: string; title?: string }) => Command
  /** Opens a file picker; attachments upload rather than being typed in. */
  readonly pickAttachment?: () => void
}

/** Equation commands, from `@trevixal/extension-math`. */
export interface MathCommands {
  readonly insertMath?: (latex: string) => Command
  readonly insertMathBlock?: (latex: string) => Command
}

/** Diagram commands, from `@trevixal/extension-diagram`. */
export interface DiagramCommands {
  readonly insertDiagram?: (code?: string) => Command
}

/**
 * File-level actions the host owns, because they touch storage, the network
 * or the page: `@trevixal/ui`'s `documents` module implements all of them.
 */
export interface FileActions {
  readonly newDocument?: () => void
  readonly openDocument?: () => void
  readonly saveDocument?: () => void
  /**
   * Download in a named format: 'html' | 'markdown' | 'text' | 'json' |
   * 'docx' | 'rtf', or 'encrypted' for a password-protected `.tvx` envelope
   * (the menu entry appears only when `protectDocument` is wired too).
   */
  readonly downloadAs?: (format: string) => void
  readonly importDocument?: () => void
  readonly exportSelection?: () => void
  readonly printPreview?: () => void
  /**
   * Print the document alone; the browser's print dialog is where the PDF
   * comes from. File ▸ Print… runs this too, or prints the document itself
   * when a host leaves it out.
   */
  readonly exportPDF?: () => void
  readonly backups?: () => void
  /** Set (or lift) a password and expiry; `@trevixal/extension-security` does the crypto. */
  readonly protectDocument?: () => void
  /** Choose which of copy, cut, paste, print, download and the context menu are blocked. */
  readonly documentRestrictions?: () => void
}

/** The checks `@trevixal/extension-writing` can run; the names match its `WritingIssueKind`. */
export type WritingCheckKind = 'passive' | 'repeat' | 'grammar' | 'long'

/** Image actions the UI drives; `@trevixal/extension-image` satisfies this. */
export interface ImageActions {
  /** Open a file picker and upload whatever the user chooses. */
  readonly pickFiles: () => void
  /** Insert an image that is already hosted somewhere. */
  readonly insertImage: (attrs: { src: string; alt?: string; title?: string }) => void
}

export interface EditorUIOptions {
  /** Mount point. The menubar, toolbar and status bar are appended here. */
  readonly container: HTMLElement
  readonly menus?: readonly Menu[]
  readonly toolbar?: ToolbarOptions
  /** Hide the menubar for a compact, toolbar-only editor. */
  readonly showMenubar?: boolean
  /** Hide the word/character count bar. */
  readonly showStatusBar?: boolean
  readonly tableCommands?: TableCommands
  readonly images?: ImageActions
  /**
   * Advanced-block commands, from `@trevixal/extension-blocks`. Menu entries
   * for blocks the host does not supply are removed rather than disabled.
   */
  readonly blockCommands?: BlockCommands
  /** JSON/XML formatting, from `@trevixal/extension-format-code`. */
  readonly codeFormatCommands?: CodeFormatCommands
  /** Media embeds, from `@trevixal/extension-embed`. */
  readonly embedCommands?: EmbedCommands
  /** Equations, from `@trevixal/extension-math`. */
  readonly mathCommands?: MathCommands
  /** Diagrams, from `@trevixal/extension-diagram`. */
  readonly diagramCommands?: DiagramCommands
  /** Open, save, download, import and print. */
  readonly fileActions?: FileActions
  /** Host actions for chrome the UI does not own. */
  readonly viewActions?: ViewActions
  /**
   * Shortcut text printed beside menu entries, keyed by item name. Pass
   * `createShortcutManager().labels()` so the menus print exactly the keys
   * that fire. When given, the menus' own default labels are not used.
   */
  readonly shortcutLabels?: ShortcutLabels
  /**
   * Translations for every label the chrome renders, keyed `menu.<name>` and
   * `toolbar.<name>`. Anything missing keeps its English, so a partial
   * catalogue is a working one. `defaultMessages()` lists every key.
   */
  readonly messages?: Messages
}

/**
 * View and panel actions the host owns, because they touch layout outside the
 * editor. Menu entries whose action is absent are dropped from the menus.
 */
/**
 * A piece of chrome the View menu switches on and off, named exactly as its
 * menu entry is. Each one is a toggle, so each one has a state worth showing.
 */
export type ViewToggle =
  | 'focusMode'
  | 'typewriterMode'
  | 'fullscreen'
  | 'pageMode'
  | 'tableOfContents'
  | 'documentOutline'
  | 'historyPanel'
  | 'workspacePanel'
  | 'splitPreview'
  | 'splitEditor'
  | 'readOnly'
  | 'trackChanges'
  | 'writingAssistant'

/** Every toggle {@link ViewActions.isViewToggleOn} can be asked about. */
export const VIEW_TOGGLES: readonly ViewToggle[] = [
  'focusMode',
  'typewriterMode',
  'fullscreen',
  'pageMode',
  'tableOfContents',
  'documentOutline',
  'historyPanel',
  'workspacePanel',
  'splitPreview',
  'splitEditor',
  'readOnly',
  'trackChanges',
  'writingAssistant',
]

export interface ViewActions {
  readonly setTheme?: (theme: 'light' | 'dark' | 'system') => void
  /** Apply a named palette from `createThemeController`, or null for the plain one. */
  readonly setThemePreset?: (preset: string | null) => void
  readonly customTheme?: () => void
  readonly customCSS?: () => void
  readonly manageFonts?: () => void
  readonly toggleFocusMode?: () => void
  readonly toggleTypewriter?: () => void
  readonly toggleFullscreen?: () => void
  readonly togglePageMode?: () => void
  readonly toggleTableOfContents?: () => void
  readonly toggleOutline?: () => void
  readonly toggleHistoryPanel?: () => void
  readonly toggleWorkspace?: () => void
  readonly toggleSplitPreview?: () => void
  /** A second live editor on the same document (the workspace's mirror mode). */
  readonly toggleSplitEditor?: () => void
  readonly toggleReadOnly?: () => void
  readonly toggleTrackChanges?: () => void
  readonly setWidth?: (width: 'narrow' | 'normal' | 'wide' | 'full') => void
  readonly openCommandPalette?: (editor: Editor) => void
  readonly copyCode?: (editor: Editor) => void
  readonly formatPainter?: (editor: Editor) => void
  readonly insertEmoji?: (editor: Editor) => void
  /** Swap the rich surface for its Markdown or HTML source. */
  readonly toggleSourceMode?: (format: 'markdown' | 'html') => void
  readonly showWritingStats?: () => void
  readonly setWritingGoal?: () => void
  readonly toggleWritingAssistant?: () => void
  /** Toggle one writing check; each gets its own entry under Tools ▸ Check writing. */
  readonly toggleWritingCheck?: (kind: WritingCheckKind) => void
  /** Whether a check is on, so its menu entry shows a check mark. */
  readonly isWritingCheckEnabled?: (kind: WritingCheckKind) => boolean
  readonly toggleSpellcheck?: () => void
  /** Whether spell checking is on, so its menu entry reports the state it toggles. */
  readonly isSpellcheckEnabled?: () => boolean
  readonly customizeToolbar?: () => void
  readonly showKeyboardShortcuts?: () => void
  readonly showAbout?: () => void
  /**
   * Whether a piece of chrome is currently on, so its menu entry can show a
   * tick. Without it every one of these entries looks the same whether it is
   * on or off, and the menu stops being a place you can read the editor's
   * state from. You have to toggle something to find out what it was.
   *
   * The host owns this chrome, so only the host can answer. Anything left
   * unanswered simply renders as a plain command, exactly as before.
   */
  readonly isViewToggleOn?: (toggle: ViewToggle) => boolean
  /** The width now in force, so the four width entries show which is chosen. */
  readonly activeWidth?: () => 'narrow' | 'normal' | 'wide' | 'full'
  /**
   * The theme now in force, as the name of its menu entry (`'themeDark'`,
   * `'themeNord'`…). The theme entries behave as one radio group, so exactly
   * one of them carries the tick.
   */
  readonly activeTheme?: () => string
  /** The source format on show, or null while the rich surface is up. */
  readonly activeSourceMode?: () => 'markdown' | 'html' | null
}

export interface EditorUI {
  readonly element: HTMLElement
  readonly menubar: Menubar | null
  /**
   * The menus as actually wired: entries the host never supplied an action
   * for are already gone. {@link paletteCommandsFromMenus} turns these into
   * command-palette entries.
   */
  readonly menus: readonly Menu[]
  readonly toolbar: Toolbar
  readonly statusBar: StatusBar | null
  /**
   * The find & replace bar, created on first use by the Tools menu entry and
   * available here for a host that wants to open it from its own shortcut.
   */
  readonly findReplace: FindReplace | null
  /** Re-print the menus' shortcuts, e.g. after the user rebinds one. */
  setShortcutLabels(labels: ShortcutLabels | undefined): void
  /** The link dialog the toolbar and Insert ▸ Link open; bind it to a shortcut. */
  openLinkDialog(): void
  destroy(): void
}

/**
 * Assemble the full editing chrome: menubar, toolbar and status bar,
 * around an editor, with dialogs and the table/image plumbing already wired.
 *
 * Everything it composes is public API, so an application wanting a
 * different arrangement can call {@link createMenubar}, {@link createToolbar}
 * and the dialogs directly instead.
 */
export function createEditorUI(editor: Editor, options: EditorUIOptions): EditorUI {
  const document = options.container.ownerDocument
  const root = document.createElement('div')
  root.className = 'trevixal-ui'

  // Built on first use rather than up front: most sessions never open it, and
  // an unopened bar should cost nothing but still keep the menu item live.
  let findReplace: FindReplace | null = null
  const openFindReplace = (target: Editor): void => {
    if (!findReplace) {
      findReplace = createFindReplace(target, { container: root, startHidden: true })
    }
    findReplace.open()
  }

  const actions = createActions(editor, options, openFindReplace)
  // Wired once and kept: the command palette is built from exactly what the
  // menus ended up offering, so the two can never drift apart.
  const wiredMenus = withActions(
    options.menus ?? defaultMenus({ tableStyles: options.tableCommands?.tableStyles }),
    actions,
  )
  const menubar =
    options.showMenubar === false
      ? null
      : createMenubar(editor, root, {
          menus: wiredMenus,
          shortcutLabels: options.shortcutLabels,
          messages: options.messages,
        })

  const toolbar = createToolbar(editor, root, {
    ...options.toolbar,
    messages: options.toolbar?.messages ?? options.messages,
    onLink: options.toolbar?.onLink ?? actions.link,
    onImage: options.toolbar?.onImage ?? actions.image,
    onInsertTable:
      options.toolbar?.onInsertTable ?? ((target, rows, cols) => actions.table(target, rows, cols)),
    tableDesign: options.toolbar?.tableDesign ?? tableDesignCommands(options.tableCommands),
  })

  const statusBar = options.showStatusBar === false ? null : createStatusBar(editor, root)

  options.container.appendChild(root)
  return {
    element: root,
    menubar,
    menus: wiredMenus,
    toolbar,
    statusBar,
    get findReplace() {
      return findReplace
    },
    setShortcutLabels(labels) {
      menubar?.setShortcutLabels(labels)
    },
    openLinkDialog() {
      actions.link(editor)
    },
    destroy() {
      findReplace?.destroy()
      statusBar?.destroy()
      toolbar.destroy()
      menubar?.destroy()
      root.remove()
    },
  }
}

interface WiredActions {
  /** Handlers keyed by menu-item name, filled into items lacking a `run`. */
  readonly byName: ReadonlyMap<string, (editor: Editor) => void>
  /** Checked-state readers for host toggles that leave the document alone. */
  readonly activeByName: ReadonlyMap<string, () => boolean>
  readonly link: (editor: Editor) => void
  readonly image: (editor: Editor) => void
  readonly table: (editor: Editor, rows: number, cols: number) => void
}

function createActions(
  editor: Editor,
  options: EditorUIOptions,
  openFindReplace: (editor: Editor) => void,
): WiredActions {
  const document = options.container.ownerDocument
  const byName = new Map<string, (editor: Editor) => void>()

  const link = (target: Editor): void => {
    const attrs = target.getSnapshot().markAttrs.link
    const existingHref = typeof attrs?.href === 'string' ? attrs.href : ''
    const existingTitle = typeof attrs?.title === 'string' ? attrs.title : ''
    const anchors = documentAnchors(target.state.doc)
    const kind = linkKind(existingHref, anchors)
    const kinds = [
      { value: 'web', label: 'Web address' },
      { value: 'email', label: 'Email address' },
      ...(anchors.length > 0 ? [{ value: 'anchor', label: 'Heading in this document' }] : []),
    ]
    const fields: DialogField[] = [
      { name: 'kind', label: 'Link to', type: 'select', value: kind, options: kinds },
      {
        name: 'href',
        label: 'URL',
        // Plain text, not `url`: the browser's URL validation rejects the
        // `#section` and `mailto:` forms this dialog exists to accept.
        type: 'text',
        required: true,
        placeholder: 'https://example.com or #section',
        value: kind === 'web' ? existingHref : '',
        visibleWhen: { field: 'kind', values: ['web'] },
      },
      {
        name: 'email',
        label: 'Email address',
        type: 'email',
        required: true,
        placeholder: 'name@example.com',
        value: kind === 'email' ? existingHref.slice('mailto:'.length) : '',
        visibleWhen: { field: 'kind', values: ['email'] },
      },
      {
        name: 'anchor',
        label: 'Heading',
        type: 'select',
        options: anchors.map((entry) => ({ value: entry.id, label: entry.label })),
        value: kind === 'anchor' ? existingHref.slice(1) : anchors[0]?.id,
        visibleWhen: { field: 'kind', values: ['anchor'] },
      },
      { name: 'title', label: 'Title (optional)', type: 'text', value: existingTitle },
      {
        name: 'newTab',
        label: 'Open in new tab',
        type: 'checkbox',
        value: String(attrs?.target === '_blank'),
        hint: 'New-tab links are written with rel="noopener noreferrer".',
      },
    ]
    void openDialog({
      document,
      title: existingHref ? 'Edit link' : 'Insert link',
      submitLabel: 'Apply',
      fields,
    }).then((values) => {
      target.view?.focus()
      if (!values) return
      applyLink(target, values)
    })
  }

  const image = (target: Editor): void => {
    if (options.images) {
      options.images.pickFiles()
      return
    }
    void openDialog({
      document,
      title: 'Insert image',
      submitLabel: 'Insert',
      fields: [
        { name: 'src', label: 'Image URL', type: 'url', required: true },
        { name: 'alt', label: 'Alternative text', type: 'text' },
      ],
    }).then((values) => {
      target.view?.focus()
      if (!values?.src) return
      target.exec(insertBlockAfter('image', { src: values.src, alt: values.alt ?? '' }))
    })
  }

  const table = (target: Editor, rows: number, cols: number): void => {
    const command = options.tableCommands?.insertTable
    if (command) target.exec(command(rows, cols))
  }

  // The stock Tools menu declares findReplace with no `run`, which would
  // render it disabled; this is what makes it a working entry.
  const activeByName = new Map<string, () => boolean>()
  byName.set('findReplace', openFindReplace)
  byName.set('insertLink', link)
  byName.set('insertImage', image)
  byName.set('insertTable', (target) => table(target, 3, 3))
  byName.set('insertSpecialChar', (target) => {
    void openCharacterPicker(document).then((character) => {
      target.view?.focus()
      if (character) target.commands.insertText(character)
    })
  })
  byName.set('sourceCode', (target) => {
    void openDialog({
      document,
      title: 'Source code',
      submitLabel: 'Apply',
      fields: [{ name: 'html', label: 'HTML', type: 'textarea', value: target.getHTML() }],
    }).then((values) => {
      target.view?.focus()
      if (values?.html !== undefined) replaceDocumentHTML(target, values.html)
    })
  })
  byName.set('wordCount', (target) => {
    void openDialog({
      document,
      title: 'Word count',
      submitLabel: 'Close',
      fields: [
        { name: 'words', label: 'Words', value: String(target.getWordCount()) },
        { name: 'characters', label: 'Characters', value: String(target.getCharacterCount()) },
      ],
    })
  })

  // Clipboard entries drive the browser's own editing commands: the document
  // has no clipboard access of its own, and execCommand is the only route
  // that keeps the native cut/copy/paste behaviour and its undo entry.
  const clipboard = (command: string) => (target: Editor) => {
    target.view?.focus()
    try {
      target.view?.dom.ownerDocument.execCommand(command)
    } catch {
      // Denied by the browser (no user gesture, or a hardened context). The
      // keyboard shortcut still works, so failing quietly is right here.
    }
  }
  byName.set('cut', clipboard('cut'))
  byName.set('copy', clipboard('copy'))
  byName.set('paste', clipboard('paste'))
  byName.set('pastePlain', (target) => {
    target.view?.focus()
    // Reading the clipboard needs permission and can reject; on refusal the
    // plain paste simply does not happen rather than throwing.
    const clip = target.view?.dom.ownerDocument.defaultView?.navigator.clipboard
    void clip
      ?.readText()
      .then((text) => {
        if (text) target.commands.insertText(text)
      })
      .catch(() => undefined)
  })

  byName.set('markdownSource', (target) => {
    void openDialog({
      document,
      title: 'Markdown source',
      submitLabel: 'Apply',
      body: 'Edit the document as Markdown; applying replaces it in one undoable step.',
      fields: [
        {
          name: 'markdown',
          label: 'Markdown',
          type: 'textarea',
          value: serializeToMarkdown(target.state.doc),
        },
      ],
    }).then((values) => {
      target.view?.focus()
      if (values?.markdown === undefined) return
      target.setContent(parseMarkdown(values.markdown, target.schema), { addToHistory: true })
    })
  })

  // Advanced blocks, when the host supplies the extension's commands.
  const blocks = options.blockCommands
  if (blocks) {
    const variants = ['info', 'success', 'warning', 'danger', 'note'] as const
    for (const variant of variants) {
      const factory = blocks.insertCallout
      if (!factory) break
      const name = `callout${variant[0].toUpperCase()}${variant.slice(1)}`
      byName.set(name, (target) => target.exec(factory(variant)))
    }
    for (const count of [2, 3, 4] as const) {
      const factory = blocks.insertColumns
      if (!factory) break
      byName.set(`columns${count}`, (target) => target.exec(factory(count)))
    }
    for (const count of [2, 3] as const) {
      const factory = blocks.insertTabs
      if (!factory) break
      byName.set(`tabs${count}`, (target) => target.exec(factory(count)))
    }
    const simple: readonly [string, Command | undefined][] = [
      ['insertToggleBlock', blocks.insertToggleBlock],
      ['insertCard', blocks.insertCard],
      ['insertTimeline', blocks.insertTimeline],
      ['insertPageBreak', blocks.insertPageBreak],
      ['insertFootnote', blocks.insertFootnote],
      ['insertAccordion', blocks.insertAccordion ? blocks.insertAccordion(3) : undefined],
      ['insertReferenceList', blocks.insertReferenceList],
      ['renumberCitations', blocks.renumberCitations],
    ]
    for (const [name, command] of simple) {
      if (command) byName.set(name, (target) => target.exec(command))
    }
    const badge = blocks.insertBadge
    if (badge) {
      byName.set('insertBadge', (target) => {
        void openDialog({
          document,
          title: 'Insert badge',
          submitLabel: 'Insert',
          fields: [
            { name: 'label', label: 'Label', type: 'text', required: true },
            { name: 'tone', label: 'Tone', type: 'text', value: 'neutral' },
          ],
        }).then((values) => {
          target.view?.focus()
          if (values?.label) target.exec(badge(values.label, values.tone || 'neutral'))
        })
      })
    }
    const button = blocks.insertButton
    if (button) {
      byName.set('insertButton', (target) => {
        void openDialog({
          document,
          title: 'Insert button',
          submitLabel: 'Insert',
          fields: [
            { name: 'label', label: 'Label', type: 'text', required: true },
            { name: 'href', label: 'Link', type: 'url' },
          ],
        }).then((values) => {
          target.view?.focus()
          if (values?.label) target.exec(button(values.label, values.href ?? ''))
        })
      })
    }
    const citation = blocks.insertCitation
    if (citation) {
      byName.set('insertCitation', (target) => {
        void openDialog({
          document,
          title: 'Insert citation',
          submitLabel: 'Insert',
          body: 'The reference is added to the list at the end of the document.',
          fields: [{ name: 'text', label: 'Reference', type: 'text', required: true }],
        }).then((values) => {
          target.view?.focus()
          if (values?.text) target.exec(citation(values.text))
        })
      })
    }
    const anchor = blocks.insertAnchor
    if (anchor) {
      byName.set('insertAnchor', (target) => {
        void openDialog({
          document,
          title: 'Insert anchor',
          submitLabel: 'Insert',
          fields: [{ name: 'id', label: 'Anchor id', type: 'text', required: true }],
        }).then((values) => {
          target.view?.focus()
          // A rejected id makes the command decline, so junk is a no-op
          // rather than an anchor nobody can link to.
          if (values?.id) target.exec(anchor(values.id))
        })
      })
    }
  }

  // Code formatting, when the host supplies the extension's commands.
  const codeFormat = options.codeFormatCommands
  if (codeFormat) {
    const entries: readonly [string, Command | undefined][] = [
      ['formatJson', codeFormat.formatJSON],
      ['formatXml', codeFormat.formatXML],
      ['minifyCode', codeFormat.minify],
    ]
    for (const [name, command] of entries) {
      if (command) byName.set(name, (target) => target.exec(command))
    }
  }

  // Chrome the host owns: themes, panels, widths, palette.
  const view = options.viewActions
  if (view) {
    const themes = [
      ['themeLight', 'light'],
      ['themeDark', 'dark'],
      ['themeSystem', 'system'],
    ] as const
    for (const [name, theme] of themes) {
      const setTheme = view.setTheme
      if (setTheme) byName.set(name, () => setTheme(theme))
    }
    const widths = [
      ['widthNarrow', 'narrow'],
      ['widthNormal', 'normal'],
      ['widthWide', 'wide'],
      ['widthFull', 'full'],
    ] as const
    for (const [name, width] of widths) {
      const setWidth = view.setWidth
      if (setWidth) byName.set(name, () => setWidth(width))
    }
    const presets: readonly [string, string | null][] = [
      ['themeSepia', 'sepia'],
      ['themeNord', 'nord'],
      ['themeSolarized', 'solarized'],
      ['themeContrast', 'contrast'],
      ['themeMidnight', 'midnight'],
    ]
    for (const [name, preset] of presets) {
      const setPreset = view.setThemePreset
      if (setPreset) byName.set(name, () => setPreset(preset))
    }
    // Picking plain light or dark also drops any preset layered on top.
    if (view.setThemePreset) {
      for (const name of ['themeLight', 'themeDark', 'themeSystem']) {
        const setTheme = view.setTheme
        const setPreset = view.setThemePreset
        const mode = name === 'themeLight' ? 'light' : name === 'themeDark' ? 'dark' : 'system'
        byName.set(name, () => {
          setPreset?.(null)
          setTheme?.(mode)
        })
      }
    }
    const sourceMode = view.toggleSourceMode
    if (sourceMode) {
      byName.set('markdownMode', () => sourceMode('markdown'))
      byName.set('htmlMode', () => sourceMode('html'))
    }
    const toggles: readonly [string, (() => void) | undefined][] = [
      ['focusMode', view.toggleFocusMode],
      ['typewriterMode', view.toggleTypewriter],
      ['fullscreen', view.toggleFullscreen],
      ['pageMode', view.togglePageMode],
      ['tableOfContents', view.toggleTableOfContents],
      ['documentOutline', view.toggleOutline],
      ['historyPanel', view.toggleHistoryPanel],
      ['workspacePanel', view.toggleWorkspace],
      ['splitPreview', view.toggleSplitPreview],
      ['splitEditor', view.toggleSplitEditor],
      ['readOnly', view.toggleReadOnly],
      ['trackChanges', view.toggleTrackChanges],
      ['customTheme', view.customTheme],
      ['customCss', view.customCSS],
      ['manageFonts', view.manageFonts],
      ['writingStats', view.showWritingStats],
      ['writingGoal', view.setWritingGoal],
      ['writingAssistant', view.toggleWritingAssistant],
      ['spellcheck', view.toggleSpellcheck],
      ['customizeToolbar', view.customizeToolbar],
      ['keyboardShortcuts', view.showKeyboardShortcuts],
      ['about', view.showAbout],
    ]
    for (const [name, handler] of toggles) {
      if (handler) byName.set(name, () => handler())
    }
    // Which of those are switches rather than one-shot commands, and can
    // therefore report a state. `customTheme`, `manageFonts` and the rest of
    // the list above open something; they have nothing to be checked about.
    const toggleState = view.isViewToggleOn
    if (toggleState) {
      for (const toggle of VIEW_TOGGLES) {
        if (byName.has(toggle)) activeByName.set(toggle, () => toggleState(toggle))
      }
    }
    const currentWidth = view.activeWidth
    if (currentWidth) {
      for (const [name, width] of widths) {
        if (byName.has(name)) activeByName.set(name, () => currentWidth() === width)
      }
    }
    // Themes are a radio group spanning two lists, the three modes and the
    // five presets, so they are compared against one answer rather than each
    // keeping a flag that could disagree with the others.
    const currentTheme = view.activeTheme
    if (currentTheme) {
      for (const name of [...themes.map(([entry]) => entry), ...presets.map(([entry]) => entry)]) {
        if (byName.has(name)) activeByName.set(name, () => currentTheme() === name)
      }
    }
    const currentSource = view.activeSourceMode
    if (currentSource) {
      for (const [name, format] of [
        ['markdownMode', 'markdown'],
        ['htmlMode', 'html'],
      ] as const) {
        if (byName.has(name)) activeByName.set(name, () => currentSource() === format)
      }
    }
    const toggleCheck = view.toggleWritingCheck
    if (toggleCheck) {
      const checks: readonly [string, WritingCheckKind][] = [
        ['writingGrammar', 'grammar'],
        ['writingPassive', 'passive'],
        ['writingRepeated', 'repeat'],
        ['writingLong', 'long'],
      ]
      for (const [name, kind] of checks) {
        byName.set(name, () => toggleCheck(kind))
        const enabled = view.isWritingCheckEnabled
        if (enabled) activeByName.set(name, () => enabled(kind))
      }
    }
    // Spell check sits beside those entries and toggles the same way, so it
    // has to report its state too, without this it is the one entry in the
    // group that never lights up, and reads as a dead switch.
    const spellcheckEnabled = view.isSpellcheckEnabled
    if (spellcheckEnabled && byName.has('spellcheck')) {
      activeByName.set('spellcheck', () => spellcheckEnabled())
    }
    const editorActions: readonly [string, ((editor: Editor) => void) | undefined][] = [
      ['commandPalette', view.openCommandPalette],
      ['copyCode', view.copyCode],
      ['formatPainter', view.formatPainter],
      ['insertEmoji', view.insertEmoji],
    ]
    for (const [name, handler] of editorActions) {
      if (handler) byName.set(name, (target) => handler(target))
    }
  }

  // File actions: opening, saving and exporting all touch the page or the
  // network, so the host supplies them and unwired entries drop out.
  const files = options.fileActions
  if (files) {
    const entries: readonly [string, (() => void) | undefined][] = [
      ['newDocument', files.newDocument],
      ['openDocument', files.openDocument],
      ['saveDocument', files.saveDocument],
      ['importDocument', files.importDocument],
      ['exportSelection', files.exportSelection],
      ['printPreview', files.printPreview],
      ['documentBackups', files.backups],
      ['downloadPdf', files.exportPDF ?? files.printPreview],
      ['protectDocument', files.protectDocument],
      ['documentRestrictions', files.documentRestrictions],
    ]
    for (const [name, handler] of entries) {
      if (handler) byName.set(name, () => handler())
    }
    const download = files.downloadAs
    if (download) {
      const formats: readonly [string, string][] = [
        ['downloadHtml', 'html'],
        ['downloadMarkdown', 'markdown'],
        ['downloadText', 'text'],
        ['downloadJson', 'json'],
        ['downloadDocx', 'docx'],
        ['downloadRtf', 'rtf'],
      ]
      for (const [name, format] of formats) byName.set(name, () => download(format))
      // An encrypted download needs a password to encrypt under, so it only
      // appears alongside the protection dialog that collects one.
      if (files.protectDocument) byName.set('downloadEncrypted', () => download('encrypted'))
    }
  }

  // Print… prints the document alone, never the page around it. The host's
  // print wins: the assembled editor's is the one Ctrl+P and PDF (via print)
  // run, and it asks the document's restrictions before it opens anything.
  const hostPrint = files?.exportPDF
  byName.set(
    'print',
    hostPrint
      ? () => hostPrint()
      : (target) =>
          printDocument(target, document, { styles: () => collectDocumentCSS({ document }) }),
  )

  // Media, equations and diagrams.
  const embeds = options.embedCommands
  if (embeds) {
    const askURL = (
      title: string,
      label: string,
      run: (target: Editor, value: string, extra: string) => void,
      extraField?: string,
    ): ((target: Editor) => void) => {
      return (target) => {
        void openDialog({
          document,
          title,
          submitLabel: 'Insert',
          fields: [
            { name: 'url', label, type: 'url', required: true, placeholder: 'https://…' },
            ...(extraField ? [{ name: 'extra', label: extraField, type: 'text' as const }] : []),
          ],
        }).then((values) => {
          target.view?.focus()
          if (values?.url) run(target, values.url, values.extra ?? '')
        })
      }
    }
    if (embeds.insertEmbed) {
      const insert = embeds.insertEmbed
      byName.set(
        'insertEmbed',
        askURL('Embed a link', 'Video or page URL', (target, url) => target.exec(insert(url))),
      )
    }
    if (embeds.insertVideo) {
      const insert = embeds.insertVideo
      byName.set(
        'insertVideo',
        askURL('Insert video', 'Video file URL', (target, url) => target.exec(insert(url))),
      )
    }
    if (embeds.insertAudio) {
      const insert = embeds.insertAudio
      byName.set(
        'insertAudio',
        askURL('Insert audio', 'Audio file URL', (target, url) => target.exec(insert(url))),
      )
    }
    if (embeds.insertLinkCard) {
      const insert = embeds.insertLinkCard
      byName.set(
        'insertLinkCard',
        askURL(
          'Insert link card',
          'Page URL',
          (target, url, title) => target.exec(insert({ href: url, title: title || undefined })),
          'Title (optional)',
        ),
      )
    }
    const pick = embeds.pickAttachment
    if (pick) byName.set('insertAttachment', () => pick())
  }

  const math = options.mathCommands
  if (math) {
    const askLatex = (title: string, insert: (latex: string) => Command) => (target: Editor) => {
      void openDialog({
        document,
        title,
        submitLabel: 'Insert',
        body: 'LaTeX, without the surrounding dollar signs.',
        fields: [
          {
            name: 'latex',
            label: 'LaTeX',
            type: 'text',
            required: true,
            placeholder: 'a^2 + b^2 = c^2',
          },
        ],
      }).then((values) => {
        target.view?.focus()
        if (values?.latex) target.exec(insert(values.latex))
      })
    }
    if (math.insertMath) byName.set('insertMath', askLatex('Insert equation', math.insertMath))
    if (math.insertMathBlock) {
      byName.set('insertMathBlock', askLatex('Insert display equation', math.insertMathBlock))
    }
  }

  const diagrams = options.diagramCommands
  if (diagrams?.insertDiagram) {
    const insert = diagrams.insertDiagram
    byName.set('insertDiagram', (target) => target.exec(insert()))
  }

  // Table menu entries map straight onto the supplied commands.
  const commands = options.tableCommands
  if (commands) {
    const entries: readonly [string, Command | undefined][] = [
      ['addRowBefore', commands.addRowBefore],
      ['addRowAfter', commands.addRowAfter],
      ['deleteRow', commands.deleteRow],
      ['addColumnBefore', commands.addColumnBefore],
      ['addColumnAfter', commands.addColumnAfter],
      ['deleteColumn', commands.deleteColumn],
      ['mergeCells', commands.mergeCells],
      ['splitCell', commands.splitCell],
      ['toggleHeaderRow', commands.toggleHeaderRow],
      ['deleteTable', commands.deleteTable],
      ['sortAscending', commands.sortAscending],
      ['sortDescending', commands.sortDescending],
      ['convertTextToTable', commands.convertTextToTable],
      ['convertTableToText', commands.convertTableToText],
      ['distributeColumns', commands.distributeColumns],
      ['distributeRows', commands.distributeRows],
      ['autoFitContents', commands.autoFitContents],
      ['autoFitWindow', commands.autoFitWindow],
      ['fixColumnWidths', commands.fixColumnWidths],
      ['clearTableSizing', commands.clearSizing],
    ]
    for (const [name, command] of entries) {
      if (command) byName.set(name, (target) => target.exec(command))
    }
    const toggleTool = commands.toggleTableTool
    if (toggleTool) {
      const tools: readonly [string, 'draw' | 'erase' | 'paint'][] = [
        ['drawTable', 'draw'],
        ['tableEraser', 'erase'],
        ['borderPainter', 'paint'],
      ]
      const activeTool = commands.activeTableTool
      for (const [name, tool] of tools) {
        byName.set(name, (target) => {
          toggleTool(tool)
          // Back to the page, where the tool is used and Escape puts it down.
          target.view?.focus()
        })
        if (activeTool) activeByName.set(name, () => activeTool() === tool)
      }
    }
    wireTableDesign(editor, commands, byName, activeByName)
    // Word's Split Cells asks how many columns; without it, Split un-merges.
    const splitInto = commands.splitCellInto
    if (splitInto) {
      byName.set('splitCell', (target) => {
        void openSplitCellsDialog(document).then((columns) => {
          target.view?.focus()
          if (columns !== null) target.exec(splitInto(columns))
        })
      })
    }
    const align = commands.setCellAlign
    if (align) {
      const alignments: readonly [string, 'left' | 'center' | 'right' | null][] = [
        ['cellAlignLeft', 'left'],
        ['cellAlignCenter', 'center'],
        ['cellAlignRight', 'right'],
        ['cellAlignNone', null],
      ]
      for (const [name, value] of alignments) {
        byName.set(name, (target) => target.exec(align(value)))
      }
    }
    const background = commands.setCellBackground
    if (background) {
      byName.set('cellBackground', (target) => {
        void openDialog({
          document,
          title: 'Cell background',
          submitLabel: 'Apply',
          fields: [
            { name: 'color', label: 'Colour', type: 'color', value: '#fff8c4' },
            { name: 'clear', label: 'Remove the colour instead', type: 'checkbox' },
          ],
        }).then((values) => {
          target.view?.focus()
          if (!values) return
          target.exec(background(values.clear === 'true' ? null : values.color))
        })
      })
    }
    const borders = commands.setTableBorders
    if (borders) {
      const styles: readonly [string, 'all' | 'outer' | 'horizontal' | 'none'][] = [
        ['bordersAll', 'all'],
        ['bordersOuter', 'outer'],
        ['bordersHorizontal', 'horizontal'],
        ['bordersNone', 'none'],
      ]
      for (const [name, value] of styles) {
        byName.set(name, (target) => target.exec(borders(value)))
      }
    }
    const borderColor = commands.setTableBorderColor
    if (borderColor) {
      byName.set('borderColor', (target) => {
        void openDialog({
          document,
          title: 'Border colour',
          submitLabel: 'Apply',
          fields: [
            { name: 'color', label: 'Colour', type: 'color', value: '#d9d9e3' },
            { name: 'clear', label: 'Use the theme colour instead', type: 'checkbox' },
          ],
        }).then((values) => {
          target.view?.focus()
          if (!values) return
          target.exec(borderColor(values.clear === 'true' ? null : values.color))
        })
      })
    }
    const fromCSV = commands.insertTableFromCSV
    if (fromCSV) {
      byName.set('importCsv', (target) => {
        void openDialog({
          document,
          title: 'Import CSV',
          submitLabel: 'Insert',
          body: 'Paste comma, semicolon or tab separated values.',
          fields: [{ name: 'csv', label: 'CSV', type: 'textarea' }],
        }).then((values) => {
          target.view?.focus()
          if (values?.csv) target.exec(fromCSV(values.csv))
        })
      })
    }
    const toCSV = commands.csvAtSelection
    if (toCSV) {
      byName.set('exportCsv', (target) => {
        const csv = toCSV(target.state)
        if (csv === null) return
        void openDialog({
          document,
          title: 'Table as CSV',
          submitLabel: 'Close',
          body: 'Copy this into a spreadsheet.',
          fields: [{ name: 'csv', label: 'CSV', type: 'textarea', value: csv }],
        })
      })
    }
  }

  return { byName, activeByName, link, image, table }
}

/** A place a link can point at inside the document: a heading with an id, or an anchor. */
interface DocumentAnchor {
  readonly id: string
  readonly label: string
}

/** Every heading id and anchor in the document, in reading order. */
function documentAnchors(doc: EditorNode): DocumentAnchor[] {
  const found: DocumentAnchor[] = []
  const seen = new Set<string>()
  const visit = (node: EditorNode): void => {
    const id = node.attrs.id
    if (typeof id === 'string' && id.length > 0 && !seen.has(id)) {
      if (node.type.name === 'heading') {
        seen.add(id)
        found.push({ id, label: node.textContent.trim() || id })
      } else if (node.type.name === 'anchor') {
        seen.add(id)
        found.push({ id, label: `Anchor: ${id}` })
      }
    }
    if (!node.isText) for (const child of node.content.children) visit(child)
  }
  visit(doc)
  return found
}

/** Which tab of the link dialog an existing href belongs on. */
function linkKind(href: string, anchors: readonly DocumentAnchor[]): 'web' | 'email' | 'anchor' {
  if (href.startsWith('mailto:')) return 'email'
  if (href.startsWith('#') && anchors.some((entry) => entry.id === href.slice(1))) return 'anchor'
  return 'web'
}

/**
 * Turn the link dialog's values into a link. Every branch validates before it
 * writes, so a mistyped address or an unsafe scheme is a no-op rather than a
 * dead or dangerous link.
 */
function applyLink(target: Editor, values: Readonly<Record<string, string>>): void {
  const tab: '_blank' | null = values.newTab === 'true' ? '_blank' : null
  const title = values.title?.trim() || undefined
  if (values.kind === 'email') {
    const address = (values.email ?? '').trim()
    if (!isEmailAddress(address)) return
    // With nothing selected the address itself becomes the linked text.
    if (target.state.selection.empty) {
      target.exec(insertEmailLink(address, { target: tab }))
      return
    }
    if (target.commands.setLink(`mailto:${address}`, title)) target.exec(setLinkTarget(tab))
    return
  }
  const href = values.kind === 'anchor' ? `#${values.anchor ?? ''}` : (values.href ?? '').trim()
  if (href === '#' || !safeHref(href)) return
  if (target.commands.setLink(href, title)) target.exec(setLinkTarget(tab))
}

/**
 * Table ▸ Table style, Style options, Line style and Line weight, each entry
 * ticked while the table at the selection has it. Header row keeps its own
 * wiring above; here it only gains its tick.
 */
function wireTableDesign(
  editor: Editor,
  commands: TableCommands,
  byName: Map<string, (editor: Editor) => void>,
  activeByName: Map<string, () => boolean>,
): void {
  const read = commands.tableDesignAt
  const design = (): TableDesignState | null => (read ? read(editor.state) : null)
  const tick = (name: string, isOn: (current: TableDesignState) => boolean): void => {
    if (!read || !byName.has(name)) return
    activeByName.set(name, () => {
      const current = design()
      return current !== null && isOn(current)
    })
  }

  const setStyle = commands.setTableStyle
  if (setStyle) {
    for (const tile of commands.tableStyles ?? []) {
      const name = tableStyleEntryName(tile)
      byName.set(name, (target) => target.exec(setStyle(tile.style, tile.accentColor)))
      tick(
        name,
        (current) => current.style === tile.style && current.accentColor === tile.accentColor,
      )
    }
  }
  const toggleOption = commands.toggleStyleOption
  for (const { value, entry } of TABLE_STYLE_OPTION_ENTRIES) {
    if (toggleOption && !byName.has(entry)) {
      byName.set(entry, (target) => target.exec(toggleOption(value)))
    }
    tick(entry, (current) => current.options[value])
  }
  const setLineStyle = commands.setTableBorderStyle
  if (setLineStyle) {
    for (const { value, entry } of TABLE_LINE_STYLE_ENTRIES) {
      byName.set(entry, (target) => target.exec(setLineStyle(value)))
      tick(entry, (current) => current.borderStyle === value)
    }
  }
  const setLineWeight = commands.setTableBorderWidth
  if (setLineWeight) {
    for (const { value, entry } of TABLE_LINE_WEIGHT_ENTRIES) {
      byName.set(entry, (target) => target.exec(setLineWeight(value)))
      tick(entry, (current) => current.borderWidth === value)
    }
  }
}

/**
 * What the toolbar's Table design dropdown drives, when the host supplied
 * every part of it; the dropdown is left out otherwise.
 */
function tableDesignCommands(commands: TableCommands | undefined): TableDesignCommands | undefined {
  if (!commands) return undefined
  const {
    tableStyles,
    tableDesignAt,
    setTableStyle,
    toggleStyleOption,
    setTableBorders,
    setTableBorderStyle,
    setTableBorderWidth,
    setTableBorderColor,
    setCellBackground,
    toggleTableTool,
    activeTableTool,
  } = commands
  if (
    !tableStyles ||
    !tableDesignAt ||
    !setTableStyle ||
    !toggleStyleOption ||
    !setTableBorders ||
    !setTableBorderStyle ||
    !setTableBorderWidth ||
    !setTableBorderColor ||
    !setCellBackground
  ) {
    return undefined
  }
  return {
    styles: tableStyles,
    designAt: tableDesignAt,
    setStyle: setTableStyle,
    toggleOption: toggleStyleOption,
    setBorders: setTableBorders,
    setBorderStyle: setTableBorderStyle,
    setBorderWidth: setTableBorderWidth,
    setBorderColor: setTableBorderColor,
    setShading: setCellBackground,
    ...(toggleTableTool
      ? {
          toggleBorderPainter: () => toggleTableTool('paint'),
          isBorderPainterOn: () => activeTableTool?.() === 'paint',
        }
      : {}),
  }
}

/**
 * Give menu items that declare no `run` the matching wired handler, and drop
 * the ones nothing can drive.
 *
 * An item with no `run` renders permanently disabled, which reads as a broken
 * feature rather than an absent one. So an entry the host has not wired, a
 * block command from an extension that is not installed, say, is removed
 * outright, along with any submenu and any separator run it leaves behind.
 */
function withActions(menus: readonly Menu[], actions: WiredActions): readonly Menu[] {
  const wire = (item: MenuItem): MenuItem | null => {
    if (item.separator) return item
    if (item.items) {
      const items = item.items.map(wire).filter((entry): entry is MenuItem => entry !== null)
      return hasAction(items) ? { ...item, items: tidySeparators(items) } : null
    }
    if (item.run) return item
    const handler = actions.byName.get(item.name)
    if (!handler) return null
    const active = actions.activeByName.get(item.name)
    return active ? { ...item, run: handler, isActive: () => active() } : { ...item, run: handler }
  }
  return menus
    .map((menu) => ({
      ...menu,
      items: tidySeparators(
        menu.items.map(wire).filter((entry): entry is MenuItem => entry !== null),
      ),
    }))
    .filter((menu) => hasAction(menu.items))
}

/** Whether a list holds anything the user can actually pick. */
function hasAction(items: readonly MenuItem[]): boolean {
  return items.some((item) => !item.separator)
}

/** Collapse the leading, trailing and doubled separators pruning leaves. */
function tidySeparators(items: readonly MenuItem[]): readonly MenuItem[] {
  const kept: MenuItem[] = []
  for (const item of items) {
    if (item.separator && (kept.length === 0 || kept[kept.length - 1]?.separator)) continue
    kept.push(item)
  }
  while (kept.length > 0 && kept[kept.length - 1]?.separator) kept.pop()
  return kept
}

/** Replace the whole document with parsed, sanitized HTML. */
function replaceDocumentHTML(editor: Editor, html: string): void {
  const parsed = parseHTML(editor.schema, html, editor.view?.dom.ownerDocument)
  const content = parsed.content.childCount > 0 ? parsed.content : Fragment.empty
  editor.dispatch(
    editor.state.tr.step(new ReplaceNodesStep([], 0, editor.state.doc.childCount, content)),
  )
}
