import {
  type Command,
  type Editor,
  type EditorNode,
  type EditorState,
  Fragment,
  ReplaceNodesStep,
  SetNodeAttrsStep,
  TextSelection,
  attrsEq,
  cleanPastedHTML,
  frontMatterOf,
  insertBlockAfter,
  insertContent,
  insertEmailLink,
  isEmailAddress,
  nodeAtPath,
  parseHTML,
  parseMarkdown,
  pos,
  safeHref,
  serializeToMarkdown,
  setDocumentAttrs,
  setLinkTarget,
  templateVariables,
} from '@trevixal/core'
import { collectDocumentCSS } from './collect-css'
import { type DialogField, openCharacterPicker, openDialog, openInfoDialog } from './dialog'
import { pickFile, printDocument, readFileText } from './documents'
import { bindEquationEditing, openEquationDialog } from './equation-dialog'
import { type FindReplace, createFindReplace } from './find-replace'
import { openGoToDialog } from './go-to'
import type { Messages } from './i18n'
import { typeText } from './key-presets'
import { languageItemName } from './languages'
import {
  type LinkStatus,
  blockTargets,
  checkLinks,
  ensureBlockId,
  openLinkReport,
} from './link-tools'
import { listDialogEntries } from './list-dialogs'
import { bindListFolding, highlightOverdueTasks } from './list-tools'
import { enableLongDocumentMode } from './long-document'
import { type Macros, createMacros } from './macros'
import {
  CELL_PADDING_ENTRIES,
  type Menu,
  type MenuItem,
  type Menubar,
  createMenubar,
  defaultMenus,
} from './menubar'
import { trackVirtualKeyboard } from './mobile'
import { type MultipleCarets, enableMultipleCarets } from './multi-caret'
import { createNamedStyleSheet } from './named-style-sheet'
import { openPageSetupDialog, openSectionBreakDialog } from './page-setup-dialog'
import { paragraphFormatEntries } from './paragraph-dialogs'
import { referenceEntries } from './reference-dialogs'
import type { ShortcutLabels } from './shortcuts'
import {
  type SnippetStore,
  enableSnippetExpansion,
  insertSnippet,
  openSnippetsDialog,
} from './snippets'
import { parseMarkdownSource } from './source-mode'
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
  type ToolbarPreset,
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
  readonly splitCellInto?: (columns: number, rows?: number) => Command
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
  // How the table sits on the page and in its cells, from `tableUICommands()`.
  /** The header row held at the top of the window while a long table scrolls by. */
  readonly toggleFreezeHeaderRow?: Command
  readonly toggleFreezeFirstColumn?: Command
  /** Word's cell margins for the whole table; Table ▸ Cell padding offers four. */
  readonly setCellPadding?: (padding: string | null) => Command
  readonly setCellVerticalAlign?: (align: 'top' | 'middle' | 'bottom' | null) => Command
  /** How the table at the selection is laid out, for the ticks; a reader. */
  readonly tableLayoutAt?: (state: EditorState) => TableLayoutState | null
  // A table as data, from `tableUICommands()`.
  /** Word's table formula, `SUM(ABOVE)` and the like, in an optional number format. */
  readonly insertFormula?: (expression: string, format: string | null) => Command
  /** The formula the dialog starts from: the one at the caret, or the one Word suggests; a reader. */
  readonly formulaAt?: (state: EditorState) => { expression: string; format: string | null }
  readonly setColumnType?: (type: TableColumnType) => Command
  /** The caret's column's type, for the ticks; a reader. */
  readonly columnTypeAt?: (state: EditorState) => TableColumnType | null
  readonly filterRows?: (filter: TableRowFilter) => Command
  readonly showAllRows?: Command
  readonly hideColumn?: Command
  readonly showAllColumns?: Command
  /** The table's columns by header, for the filter dialog to offer; a reader. */
  readonly tableColumnLabels?: (state: EditorState) => readonly string[]
  readonly insertChart?: (kind: 'bar' | 'line' | 'pie') => Command
}

/** What a table column holds, as `setColumnType` takes it. */
export type TableColumnType = 'text' | 'number' | 'currency' | 'percentage' | 'date' | 'checkbox'

/** A row filter, as `filterRows` takes it. */
export interface TableRowFilter {
  readonly column: number
  readonly condition:
    | 'contains'
    | 'notContains'
    | 'equals'
    | 'greater'
    | 'less'
    | 'empty'
    | 'notEmpty'
  readonly value?: string
}

/** What {@link TableCommands.tableLayoutAt} reads off the table at the selection. */
export interface TableLayoutState {
  readonly freezeHeader: boolean
  readonly freezeColumn: boolean
  readonly cellPadding: string | null
  /** The caret's cell's; top reads as null. */
  readonly verticalAlign: 'top' | 'middle' | 'bottom' | null
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
  /** Record from the microphone and insert the recording with its waveform. */
  readonly recordAudio?: () => void
  /** The selected video's chapters, one a line (`1:30 Setting up`); empty text takes them off. */
  readonly setVideoChapters?: (text: string | null) => Command
  /** The selected video's chapters, for the dialog; null without a video selected. A reader. */
  readonly videoChaptersAt?: (state: EditorState) => string | null
}

/** Equation commands, from `@trevixal/extension-math`. */
export interface MathCommands {
  readonly insertMath?: (latex: string) => Command
  /** A display equation, numbered when asked. */
  readonly insertMathBlock?: (latex: string, numbered?: boolean) => Command
  /** With these, a double-click on an equation edits it. */
  readonly setMathLatex?: (latex: string) => Command
  readonly setMathNumbered?: (numbered: boolean) => Command
  /** Draw LaTeX as the document does, for the equation dialog's preview. */
  readonly render?: (latex: string, display: boolean) => string
}

/** Diagram commands, from `@trevixal/extension-diagram`. */
export interface DiagramCommands {
  readonly insertDiagram?: (code?: string) => Command
  /** A Graphviz (DOT) diagram, and a PlantUML one, beside Mermaid's. */
  readonly insertGraphviz?: () => Command
  readonly insertPlantUML?: () => Command
}

/** Code block commands, from `@trevixal/extension-code-highlight`. */
export interface CodeCommands {
  /** A terminal session, a prompt ready for the first command. */
  readonly insertTerminal?: () => Command
  /** Two versions of some code as one diff, the changes coloured. */
  readonly insertCodeDiff?: (before: string, after: string, title?: string) => Command
  /** A block of JavaScript or HTML to run from the code bar. */
  readonly insertRunnableCode?: (language: 'javascript' | 'html') => Command
}

/** Redaction, locked sections and the lock screen, from `@trevixal/extension-security`. */
export interface SecurityCommands {
  /** Black out the selected words, or bring back ones already blacked out. */
  readonly toggleRedaction?: Command
  /** Lock the selected blocks as one section no edit can change. */
  readonly lockSection?: Command
  /** List the locked sections, to unlock one. */
  readonly manageLockedSections?: () => void
  /** Hide the document behind the password now, as the inactivity timer would. */
  readonly lockNow?: () => void
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
  /** Keep the document as it is now under a name, to come back to or compare against. */
  readonly saveVersion?: () => void
  /** Compare the document with a file, side by side. */
  readonly compareWithFile?: () => void
  /** Clip a web page's article into the document. */
  readonly importFromURL?: () => void
  /** Download every document in a workspace folder at once, as one archive. */
  readonly exportFolder?: () => void
  /** Set (or lift) a password and expiry; `@trevixal/extension-security` does the crypto. */
  readonly protectDocument?: () => void
  /** Choose which of copy, cut, paste, print, download and the context menu are blocked. */
  readonly documentRestrictions?: () => void
  /** Sign the document with the author's key, so a change after it shows. */
  readonly signDocument?: () => void
  /** Register a passkey that unlocks a protected document beside its password. */
  readonly addPasskey?: () => void
}

/** The checks `@trevixal/extension-writing` can run; the names match its `WritingIssueKind`. */
export type WritingCheckKind =
  | 'passive'
  | 'repeat'
  | 'grammar'
  | 'long'
  | 'inclusive'
  | 'tone'
  | 'cliche'

/** Image actions the UI drives; `@trevixal/extension-image` satisfies this. */
export interface ImageActions {
  /** Open a file picker and upload whatever the user chooses. */
  readonly pickFiles: () => void
  /** Insert an image that is already hosted somewhere. */
  readonly insertImage: (attrs: { src: string; alt?: string; title?: string }) => void
  /** Pick several images and put them in as one gallery. */
  readonly pickGallery?: () => void
  /** Take a photo with the camera and insert it. */
  readonly capturePhoto?: () => void
  /** Take a screenshot of a screen, window or tab and insert it. */
  readonly captureScreen?: () => void
  /** Open the drawing board, and insert what is drawn on it. */
  readonly insertDrawing?: () => void
}

export interface EditorUIOptions {
  /** Mount point. The menubar, toolbar and status bar are appended here. */
  readonly container: HTMLElement
  /**
   * Links: `checkURL` says whether an outside address answers, for Tools ▸
   * Check links. Without it, outside links are only checked for being well
   * formed; the host decides whether the editor reaches out at all.
   */
  readonly links?: { readonly checkURL?: (href: string) => Promise<LinkStatus> }
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
  /** Terminal, diff and runnable code blocks, from `@trevixal/extension-code-highlight`. */
  readonly codeCommands?: CodeCommands
  /** Redaction, locked sections and Lock now, from `@trevixal/extension-security`. */
  readonly securityCommands?: SecurityCommands
  /**
   * Where snippets are kept. With it, Insert ▸ Snippet and Tools ▸ Snippets
   * appear, and abbreviations expand as they are typed.
   */
  readonly snippets?: SnippetStore
  /** What the document workspace offers the Insert menu. */
  readonly workspaceCommands?: {
    /** Include a document, or a block of one, kept in step with it. */
    readonly includeDocument?: () => void
  }
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
  /** The language `messages` is in, as `lang` takes it, with its direction; English by default. */
  readonly language?: Omit<ChromeLanguage, 'messages'>
}

/** What {@link EditorUI.setLanguage} takes: a catalogue and the language it is in. */
export interface ChromeLanguage {
  /** BCP 47 code, set as the chrome's `lang`. */
  readonly code: string
  readonly direction?: 'ltr' | 'rtl'
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
  | 'smartTypography'
  | 'autocorrect'
  | 'stylesPane'
  | 'documentTheme'
  | 'reducedMotion'
  | 'dyslexiaFont'
  | 'readingHeatmap'
  | 'commentsPanel'
  | 'dictation'
  | 'readAloud'

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
  'smartTypography',
  'autocorrect',
  'stylesPane',
  'documentTheme',
  'reducedMotion',
  'dyslexiaFont',
  'readingHeatmap',
  'commentsPanel',
  'dictation',
  'readAloud',
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
  /** Curly quotes, dashes and symbols as you type (Word's AutoFormat), on or off. */
  readonly toggleSmartTypography?: () => void
  /** Misspellings put right as you type (Word's AutoCorrect), on or off. */
  readonly toggleAutocorrect?: () => void
  /** Edit the AutoCorrect list. */
  readonly autocorrectOptions?: () => void
  /** Show or hide the Styles pane, which the host lays out. */
  readonly toggleStylesPane?: () => void
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
  /** Standard keys, or Emacs's or Vim's for moving and editing. */
  readonly setKeyPreset?: (preset: 'standard' | 'emacs' | 'vim') => void
  /** The key preset in force, so its entry under Tools ▸ Key bindings shows the tick. */
  readonly activeKeyPreset?: () => 'standard' | 'emacs' | 'vim'
  /** Show the chrome in another language, by its code in `UI_LANGUAGES`. */
  readonly setLanguage?: (code: string) => void
  /** The codes `setLanguage` can switch to; entries for the rest are left out. */
  readonly languages?: readonly string[]
  /** The language in force, so its entry under View ▸ Language shows the tick. */
  readonly activeLanguage?: () => string
  /** Read a theme from a JSON file and apply it. */
  readonly importTheme?: () => void
  /** Download the theme in force as a JSON file. */
  readonly exportTheme?: () => void
  /** Keep the theme in force with the document, or stop keeping it. */
  readonly toggleDocumentTheme?: () => void
  /** Choose the document's body and heading fonts, saved in its styles. */
  readonly documentFonts?: () => void
  /** Show a preset's toolbar groups and hide the rest. */
  readonly setToolbarPreset?: (preset: ToolbarPreset) => void
  /** The preset the toolbar matches, if any, so its entry shows the tick. */
  readonly activeToolbarPreset?: () => ToolbarPreset | null
  /**
   * Ask the host's writing assistant to rewrite, summarise or translate the
   * selection, or to continue from the caret. Only the actions named in
   * `assistActions` get an entry.
   */
  readonly assist?: (action: 'rewrite' | 'summarise' | 'translate' | 'continue') => void
  readonly assistActions?: readonly ('rewrite' | 'summarise' | 'translate' | 'continue')[]
  /** Type what the microphone hears at the caret, or stop. */
  readonly toggleDictation?: () => void
  /** Read the document aloud from the caret, the caret following the voice, or stop. */
  readonly toggleReadAloud?: () => void
  /** Who changed the document, when, and by how much, with a download of it. */
  readonly showAuditLog?: () => void
  /** Put a form field in at the caret: `@trevixal/extension-forms` holds it. */
  readonly insertFormField?: (kind: 'text' | 'checkbox' | 'dropdown' | 'date' | 'signature') => void
  /** One document per row of a CSV or JSON file, downloaded together. */
  readonly mailMerge?: () => void
  /** Show the document as slides, one top-level heading each. */
  readonly present?: () => void
  /** Comment on the selected text: `@trevixal/extension-comments` keeps the threads. */
  readonly addComment?: () => void
  /** Show or hide the comment threads beside the document. */
  readonly toggleComments?: () => void
  /** Tint each sentence by how hard it reads, or take the tint off. */
  readonly toggleReadingHeatmap?: () => void
  /** List what would trip up a reader with a screen reader or low vision. */
  readonly checkAccessibility?: () => void
  /** List the sentences other documents in the workspace also have. */
  readonly findDuplicateText?: () => void
  /** Transitions, animations and smooth scrolling off, or back on. */
  readonly toggleReducedMotion?: () => void
  /** A font and spacing easier to read with dyslexia, or the document's own. */
  readonly toggleDyslexiaFont?: () => void
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
  /** Re-print the menus' and the toolbar's shortcuts, e.g. after the user rebinds one. */
  setShortcutLabels(labels: ShortcutLabels | undefined): void
  /**
   * Show the chrome in another language: every menu and toolbar label from
   * `messages`, `lang` set for it, and a right-to-left language mirroring it.
   */
  setLanguage(language: ChromeLanguage): void
  /** The link dialog the toolbar and Insert ▸ Link open; bind it to a shortcut. */
  openLinkDialog(): void
  /** The macro recorder behind Tools ▸ Macro; bind its `play` to a key. */
  readonly macros: Macros
  /** The extra carets; bind `addNextMatch` to a key. */
  readonly carets: MultipleCarets
  /** Open the Go to dialog; bind it to a key. */
  openGoTo(): void
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

  const macros = createMacros(editor)
  const carets = enableMultipleCarets(editor)
  const actions = createActions(editor, options, openFindReplace, { macros, carets })
  // Wired once and kept: the command palette is built from exactly what the
  // menus ended up offering, so the two can never drift apart.
  const wiredMenus = withRecording(
    withActions(
      options.menus ?? defaultMenus({ tableStyles: options.tableCommands?.tableStyles }),
      actions,
    ),
    macros,
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
    shortcutLabels: options.toolbar?.shortcutLabels ?? options.shortcutLabels,
  })

  const statusBar = options.showStatusBar === false ? null : createStatusBar(editor, root)

  // A right-to-left document mirrors the chrome with it: menus open from the
  // right, the toolbar runs right to left, as a right-to-left reader expects.
  // So does a right-to-left language for the chrome, whatever the document.
  let chromeDirection = options.language?.direction ?? 'ltr'
  if (options.language) root.lang = options.language.code
  const syncDirection = (): void => {
    if (editor.state.doc.attrs.direction === 'rtl' || chromeDirection === 'rtl') {
      root.setAttribute('dir', 'rtl')
    } else root.removeAttribute('dir')
  }
  syncDirection()
  const stopSyncingDirection = editor.on('update', syncDirection)
  // A long document leaves the blocks off screen to the browser to skip.
  const stopLongDocument = enableLongDocumentMode(editor)
  // On a phone the toolbar sits at the bottom, above the on-screen keyboard.
  const stopKeyboard = trackVirtualKeyboard(root)
  // The document's named styles, drawn on this surface: a Normal it changed,
  // styles of its own, and the list schemes it defined.
  const namedStyles = createNamedStyleSheet(editor)
  // A fold's chevron opens and shuts it, and a caret is never left hidden in
  // one; a task past its date is marked for its chip to say so.
  const stopFolding = bindListFolding(editor)
  const stopOverdue = highlightOverdueTasks(editor)
  // Abbreviations expand as they are typed, when the host keeps snippets.
  const stopSnippets = options.snippets
    ? enableSnippetExpansion(editor, options.snippets)
    : () => {}
  // A double-click on an equation opens it in the equation dialog.
  const math = options.mathCommands
  const setMathLatex = math?.setMathLatex
  const stopEquationEditing = setMathLatex
    ? bindEquationEditing(editor, {
        setMathLatex,
        setMathNumbered: math.setMathNumbered,
        render: math.render,
      })
    : () => {}

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
      toolbar.setShortcutLabels(labels)
    },
    setLanguage(language) {
      menubar?.setMessages(language.messages)
      toolbar.setMessages(language.messages)
      root.lang = language.code
      chromeDirection = language.direction ?? 'ltr'
      syncDirection()
    },
    openLinkDialog() {
      actions.link(editor)
    },
    macros,
    carets,
    openGoTo() {
      openGoToDialog(document, editor)
    },
    destroy() {
      stopSnippets()
      macros.destroy()
      carets.destroy()
      stopSyncingDirection()
      stopLongDocument()
      stopKeyboard()
      stopFolding()
      stopOverdue()
      stopEquationEditing()
      namedStyles.destroy()
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
  tools: { readonly macros: Macros; readonly carets: MultipleCarets },
): WiredActions {
  const document = options.container.ownerDocument
  const byName = new Map<string, (editor: Editor) => void>()

  const link = (target: Editor): void => {
    const attrs = target.getSnapshot().markAttrs.link
    const existingHref = typeof attrs?.href === 'string' ? attrs.href : ''
    const existingTitle = typeof attrs?.title === 'string' ? attrs.title : ''
    const anchors = documentAnchors(target.state.doc)
    const blocks = blockTargets(target.state.doc)
    const kind = linkKind(existingHref, anchors)
    const kinds = [
      { value: 'web', label: 'Web address' },
      { value: 'email', label: 'Email address' },
      ...(anchors.length > 0 ? [{ value: 'anchor', label: 'Heading in this document' }] : []),
      ...(blocks.length > 0 ? [{ value: 'block', label: 'Any block in this document' }] : []),
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
      {
        name: 'block',
        label: 'Block',
        type: 'select',
        options: blocks.map((entry) => ({ value: String(entry.index), label: entry.label })),
        value: String(blocks[0]?.index ?? ''),
        visibleWhen: { field: 'kind', values: ['block'] },
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
  // Word's Go To, paste special, snippets, macros and more carets.
  byName.set('goTo', (target) => openGoToDialog(document, target))
  byName.set('pasteSpecial', (target) => openPasteSpecial(document, target))
  byName.set('addNextMatch', () => void tools.carets.addNextMatch())
  byName.set('macroRecord', () => {
    if (tools.macros.recording) tools.macros.stop()
    else tools.macros.record()
  })
  activeByName.set('macroRecord', () => tools.macros.recording)
  byName.set('macroPlay', () => void tools.macros.play())
  const snippets = options.snippets
  if (snippets) {
    byName.set('manageSnippets', (target) => void openSnippetsDialog(document, target, snippets))
    byName.set('insertSnippet', (target) => {
      const list = snippets.list()
      if (list.length === 0) {
        void openSnippetsDialog(document, target, snippets)
        return
      }
      void openDialog({
        document,
        title: 'Insert snippet',
        submitLabel: 'Insert',
        fields: [
          {
            name: 'snippet',
            label: 'Snippet',
            type: 'select',
            value: '0',
            options: list.map((snippet, index) => ({
              value: String(index),
              label: `${snippet.name} (${snippet.abbreviation})`,
            })),
          },
        ],
      }).then((values) => {
        const snippet = values ? list[Number(values.snippet)] : undefined
        if (snippet) target.exec(insertSnippet(snippet))
        target.view?.focus()
      })
    })
  }

  // The YAML a Markdown file keeps above its text, for a document that has a place for it.
  byName.set('frontMatter', (target) => {
    if (!target.schema.topType.spec.attrs?.frontMatter) return
    void openDialog({
      document,
      title: 'Front matter',
      submitLabel: 'Save',
      body: 'The YAML a Markdown file keeps above its text, between two lines of three dashes: a title, tags, a date. Markdown and MDX downloads carry it.',
      fields: [
        {
          name: 'yaml',
          label: 'YAML',
          type: 'textarea',
          value: frontMatterOf(target.state.doc.attrs.frontMatter) ?? '',
          placeholder: 'title: My post\ntags: [notes]',
        },
      ],
    }).then((values) => {
      target.view?.focus()
      if (!values) return
      target.exec(setDocumentAttrs({ frontMatter: frontMatterOf(values.yaml) }))
    })
  })
  // How the document is set on paper: the print, the page view and Word follow it.
  byName.set('pageSetup', (target) => {
    if (!target.schema.topType.spec.attrs?.pageSetup) return
    void openPageSetupDialog(target, document)
  })
  byName.set('checkLinks', (target) => {
    void checkLinks(target.state.doc, { checkURL: options.links?.checkURL }).then((reports) =>
      openLinkReport(document, target, reports),
    )
  })
  byName.set('insertImage', image)
  // The rest of the image entries are the host's: they need its storage.
  for (const [name, action] of [
    ['insertGallery', options.images?.pickGallery],
    ['capturePhoto', options.images?.capturePhoto],
    ['captureScreen', options.images?.captureScreen],
    ['insertDrawing', options.images?.insertDrawing],
  ] as const) {
    if (action) byName.set(name, () => action())
  }
  byName.set('insertTable', (target) => table(target, 3, 3))
  byName.set('insertSpecialChar', (target) => {
    void openCharacterPicker(document).then((character) => {
      target.view?.focus()
      if (character) target.commands.insertText(character)
    })
  })
  // Format ▸ Borders and shading…, Format ▸ Drop cap ▸ Drop cap options…
  for (const [name, run] of paragraphFormatEntries(document)) byName.set(name, run)
  // Format ▸ Lists ▸ Define new multilevel list…, Task due date and assignee…
  for (const [name, run] of listDialogEntries(document)) byName.set(name, run)
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
      target.setContent(parseMarkdownSource(target, values.markdown), { addToHistory: true })
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
    const sectionBreak = blocks.insertSectionBreak
    if (sectionBreak) {
      byName.set('insertSectionBreak', (target) => {
        void openSectionBreakDialog(target, document, sectionBreak)
      })
    }
    const marginNote = blocks.insertMarginNote
    if (marginNote) byName.set('insertMarginNote', (target) => target.exec(marginNote('yellow')))
    const poll = blocks.insertPoll
    if (poll) {
      byName.set('insertPoll', (target) => {
        void openDialog({
          document,
          title: 'Insert poll',
          submitLabel: 'Insert',
          fields: [
            { name: 'question', label: 'Question', type: 'text', required: true },
            {
              name: 'options',
              label: 'Choices, one a line',
              type: 'textarea',
              required: true,
              placeholder: 'Tuesday\nThursday',
            },
          ],
        }).then((values) => {
          target.view?.focus()
          const choices = (values?.options ?? '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
          if (values?.question && choices.length >= 2) target.exec(poll(values.question, choices))
        })
      })
    }
    const map = blocks.insertMap
    if (map) {
      byName.set('insertMap', (target) => {
        void openDialog({
          document,
          title: 'Insert map',
          submitLabel: 'Insert',
          fields: [
            {
              name: 'place',
              label: 'Latitude, longitude',
              type: 'text',
              required: true,
              placeholder: '51.5074, -0.1278',
            },
            { name: 'label', label: 'Name the place (optional)', type: 'text' },
            { name: 'zoom', label: 'Zoom, 1 to 18', type: 'number', value: '13' },
          ],
        }).then((values) => {
          target.view?.focus()
          if (!values?.place) return
          target.exec(map(values.place, values.label?.trim() ?? '', Number(values.zoom) || 13))
        })
      })
    }
    const conditional = blocks.wrapInConditional
    if (conditional) {
      byName.set('insertConditional', (target) => {
        void openDialog({
          document,
          title: 'Show only when',
          submitLabel: 'Apply',
          body: 'The selected blocks show in a download only while this template variable is set, or set to the value given. Tools ▸ Template variables sets them.',
          fields: [
            {
              name: 'variable',
              label: 'Variable',
              type: 'text',
              required: true,
              placeholder: 'plan',
            },
            { name: 'equals', label: 'Equal to (optional)', type: 'text', placeholder: 'pro' },
          ],
        }).then((values) => {
          target.view?.focus()
          if (values?.variable) target.exec(conditional(values.variable, values.equals || null))
        })
      })
    }
    const setVariables = blocks.setTemplateVariables
    if (setVariables) {
      byName.set('templateVariables', (target) => {
        const current = templateVariables(target.state.doc.attrs.variables)
        void openDialog({
          document,
          title: 'Template variables',
          submitLabel: 'Save',
          body: 'One a line, name = value. Content shown only when a variable is set follows these.',
          fields: [
            {
              name: 'variables',
              label: 'Variables',
              type: 'textarea',
              value: Object.entries(current)
                .map(([name, value]) => `${name} = ${value}`)
                .join('\n'),
              placeholder: 'plan = pro',
            },
          ],
        }).then((values) => {
          target.view?.focus()
          if (!values) return
          const next: Record<string, string> = {}
          for (const line of (values.variables ?? '').split('\n')) {
            const match = /^\s*([A-Za-z_][\w-]*)\s*=\s*(.*?)\s*$/.exec(line)
            if (match) next[match[1] as string] = match[2] as string
          }
          target.exec(setVariables(next))
        })
      })
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
        // With sources in the list already, one of them can be cited again.
        const choices = blocks.referenceChoices?.(target.state.doc) ?? []
        const fields: DialogField[] =
          choices.length === 0
            ? [{ name: 'text', label: 'Reference', type: 'text', required: true }]
            : [
                {
                  name: 'cite',
                  label: 'Cite',
                  type: 'select',
                  value: '',
                  options: [
                    { value: '', label: 'A new reference' },
                    ...choices.map((choice) => ({ value: choice.id, label: choice.label })),
                  ],
                },
                {
                  name: 'text',
                  label: 'New reference',
                  type: 'text',
                  visibleWhen: { field: 'cite', values: [''] },
                },
              ]
        void openDialog({
          document,
          title: 'Insert citation',
          submitLabel: 'Insert',
          body: 'The reference is added to the list at the end of the document.',
          fields,
        }).then((values) => {
          target.view?.focus()
          if (values?.cite) target.exec(citation('', values.cite))
          else if (values?.text) target.exec(citation(values.text))
        })
      })
    }
    const setCitationStyle = blocks.setCitationStyle
    if (setCitationStyle) {
      for (const style of ['apa', 'mla', 'chicago', 'ieee']) {
        const name = `citationStyle-${style}`
        byName.set(name, (target) => {
          const command = setCitationStyle(style)
          if (command) target.exec(command)
        })
        const current = blocks.citationStyle
        if (current) activeByName.set(name, () => current(editor.state.doc) === style)
      }
    }
    const importSources = blocks.importSources
    if (importSources) {
      byName.set('importSources', (target) => {
        void pickFile(document, '.bib,.json,application/json,application/x-bibtex,text/plain')
          .then(async (file) => {
            if (!file) return
            target.exec(importSources(await readFileText(file)))
            // The new entries take their places in the list's style.
            const style = blocks.citationStyle?.(target.state.doc)
            const restyle = style ? setCitationStyle?.(style) : null
            if (restyle) target.exec(restyle)
          })
          .catch(async (error: unknown) => {
            if ((error as Error | null)?.name !== 'SourceFileError') throw error
            await openInfoDialog({
              document,
              title: 'No sources found',
              body: `${(error as Error).message} Import a BibTeX (.bib) or CSL-JSON (.json) file.`,
            })
          })
          .finally(() => target.view?.focus())
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
    // Captions, cross-references, their lists, the index and endnotes.
    for (const [name, run] of referenceEntries(blocks, document)) byName.set(name, run)
    // Table ▸ Insert caption… is Insert ▸ Caption…, which starts on Table in a table.
    const caption = byName.get('insertCaption')
    if (caption) byName.set('tableCaption', caption)
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
    const keyPresets = [
      ['keysStandard', 'standard'],
      ['keysEmacs', 'emacs'],
      ['keysVim', 'vim'],
    ] as const
    const setKeyPreset = view.setKeyPreset
    if (setKeyPreset) {
      for (const [name, preset] of keyPresets) byName.set(name, () => setKeyPreset(preset))
      const activeKeyPreset = view.activeKeyPreset
      if (activeKeyPreset) {
        for (const [name, preset] of keyPresets) {
          activeByName.set(name, () => activeKeyPreset() === preset)
        }
      }
    }
    const setLanguage = view.setLanguage
    if (setLanguage) {
      for (const code of view.languages ?? []) {
        const name = languageItemName(code)
        byName.set(name, () => setLanguage(code))
        const activeLanguage = view.activeLanguage
        if (activeLanguage) activeByName.set(name, () => activeLanguage() === code)
      }
    }
    const assist = view.assist
    if (assist) {
      const entries = [
        ['assistRewrite', 'rewrite'],
        ['assistSummarise', 'summarise'],
        ['assistTranslate', 'translate'],
        ['assistContinue', 'continue'],
      ] as const
      for (const [name, action] of entries) {
        if (view.assistActions?.includes(action)) byName.set(name, () => assist(action))
      }
    }
    const formField = view.insertFormField
    if (formField) {
      const kinds = [
        ['formText', 'text'],
        ['formCheckbox', 'checkbox'],
        ['formDropdown', 'dropdown'],
        ['formDate', 'date'],
        ['formSignature', 'signature'],
      ] as const
      for (const [name, kind] of kinds) byName.set(name, () => formField(kind))
    }
    const toolbarPresets = [
      ['toolbarMinimal', 'minimal'],
      ['toolbarWriting', 'writing'],
      ['toolbarDeveloper', 'developer'],
      ['toolbarFull', 'full'],
    ] as const
    const setToolbarPreset = view.setToolbarPreset
    if (setToolbarPreset) {
      for (const [name, preset] of toolbarPresets) {
        byName.set(name, () => setToolbarPreset(preset))
        const activePreset = view.activeToolbarPreset
        if (activePreset) activeByName.set(name, () => activePreset() === preset)
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
      ['importTheme', view.importTheme],
      ['exportTheme', view.exportTheme],
      ['documentTheme', view.toggleDocumentTheme],
      ['documentFonts', view.documentFonts],
      ['reducedMotion', view.toggleReducedMotion],
      ['dyslexiaFont', view.toggleDyslexiaFont],
      ['manageFonts', view.manageFonts],
      ['writingStats', view.showWritingStats],
      ['writingGoal', view.setWritingGoal],
      ['writingAssistant', view.toggleWritingAssistant],
      ['readingHeatmap', view.toggleReadingHeatmap],
      ['insertComment', view.addComment],
      ['present', view.present],
      ['auditLog', view.showAuditLog],
      ['mailMerge', view.mailMerge],
      ['dictation', view.toggleDictation],
      ['readAloud', view.toggleReadAloud],
      ['commentsPanel', view.toggleComments],
      ['accessibilityCheck', view.checkAccessibility],
      ['findDuplicates', view.findDuplicateText],
      ['spellcheck', view.toggleSpellcheck],
      ['smartTypography', view.toggleSmartTypography],
      ['autocorrect', view.toggleAutocorrect],
      ['autocorrectOptions', view.autocorrectOptions],
      ['stylesPane', view.toggleStylesPane],
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
        ['writingInclusive', 'inclusive'],
        ['writingTone', 'tone'],
        ['writingCliches', 'cliche'],
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
      ['saveVersion', files.saveVersion],
      ['compareDocuments', files.compareWithFile],
      ['importFromUrl', files.importFromURL],
      ['exportFolder', files.exportFolder],
      ['downloadPdf', files.exportPDF ?? files.printPreview],
      ['protectDocument', files.protectDocument],
      ['documentRestrictions', files.documentRestrictions],
      ['signDocument', files.signDocument],
      ['addPasskey', files.addPasskey],
    ]
    for (const [name, handler] of entries) {
      if (handler) byName.set(name, () => handler())
    }
    const download = files.downloadAs
    if (download) {
      const formats: readonly [string, string][] = [
        ['downloadHtml', 'html'],
        ['downloadMarkdown', 'markdown'],
        ['downloadMdx', 'mdx'],
        ['downloadText', 'text'],
        ['downloadJson', 'json'],
        ['downloadDocx', 'docx'],
        ['downloadRtf', 'rtf'],
        ['downloadOdt', 'odt'],
        ['downloadEpub', 'epub'],
        ['downloadLatex', 'latex'],
        ['downloadPptx', 'pptx'],
        ['downloadPdfForm', 'pdfForm'],
        ['downloadHtmlSingle', 'htmlSingle'],
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
    const record = embeds.recordAudio
    if (record) byName.set('recordAudio', () => record())
    const chapters = embeds.setVideoChapters
    const chaptersAt = embeds.videoChaptersAt
    if (chapters && chaptersAt) {
      byName.set('videoChapters', (target) => {
        const current = chaptersAt(target.state)
        // The video is the one selected now; focus coming back after the
        // dialog can turn that selection into a caret beside it.
        const selection = target.state.selection
        void openDialog({
          document,
          title: 'Video chapters',
          submitLabel: 'Save',
          body:
            current === null
              ? 'Select a video first: click it, then choose Video chapters again.'
              : 'One chapter a line, its start then its title, as a video description lists them.',
          fields:
            current === null
              ? []
              : [
                  {
                    name: 'chapters',
                    label: 'Chapters',
                    type: 'textarea',
                    value: current,
                    placeholder: '0:00 Introduction\n1:30 Setting up',
                  },
                ],
        }).then((values) => {
          target.view?.focus()
          if (!values || current === null) return
          target.exec((state) => state.tr.setSelection(selection))
          target.exec(chapters(values.chapters ?? ''))
        })
      })
    }
  }

  const math = options.mathCommands
  if (math) {
    // The equation dialog: the LaTeX, a palette that writes it, and a preview.
    const insertMath = math.insertMath
    if (insertMath) {
      byName.set('insertMath', (target) => {
        void openEquationDialog({ document, title: 'Insert equation', render: math.render }).then(
          (result) => {
            if (result) target.exec(insertMath(result.latex))
            target.view?.focus()
          },
        )
      })
    }
    const insertMathBlock = math.insertMathBlock
    if (insertMathBlock) {
      byName.set('insertMathBlock', (target) => {
        void openEquationDialog({
          document,
          title: 'Insert display equation',
          render: math.render,
          display: true,
          numbered: false,
        }).then((result) => {
          // The new equation is selected, and the next insert goes after it.
          // Focus afterwards, so the selection it hands the page is that one.
          if (result) target.exec(insertMathBlock(result.latex, result.numbered))
          target.view?.focus()
        })
      })
    }
  }

  const diagrams = options.diagramCommands
  if (diagrams?.insertDiagram) {
    const insert = diagrams.insertDiagram
    byName.set('insertDiagram', (target) => target.exec(insert()))
  }
  const graphviz = diagrams?.insertGraphviz
  if (graphviz) byName.set('insertGraphviz', (target) => target.exec(graphviz()))
  const plantUML = diagrams?.insertPlantUML
  if (plantUML) byName.set('insertPlantUML', (target) => target.exec(plantUML()))

  const include = options.workspaceCommands?.includeDocument
  if (include) byName.set('insertTransclusion', () => include())

  const code = options.codeCommands
  const terminal = code?.insertTerminal
  if (terminal) byName.set('insertTerminal', (target) => target.exec(terminal()))
  const runnable = code?.insertRunnableCode
  if (runnable) {
    byName.set('insertRunnableJs', (target) => target.exec(runnable('javascript')))
    byName.set('insertRunnableHtml', (target) => target.exec(runnable('html')))
  }
  const codeDiff = code?.insertCodeDiff
  if (codeDiff) {
    byName.set('insertCodeDiff', (target) => {
      void openDialog({
        document,
        title: 'Diff of two versions',
        submitLabel: 'Insert',
        fields: [
          { name: 'before', label: 'Before', type: 'textarea' },
          { name: 'after', label: 'After', type: 'textarea' },
          { name: 'title', label: 'Title (optional)', type: 'text', placeholder: 'src/app.ts' },
        ],
      }).then((values) => {
        target.view?.focus()
        if (!values) return
        const title = values.title?.trim() || undefined
        target.exec(codeDiff(values.before ?? '', values.after ?? '', title))
      })
    })
  }

  const security = options.securityCommands
  const redaction = security?.toggleRedaction
  if (redaction) byName.set('redactSelection', (target) => target.exec(redaction))
  const lockSection = security?.lockSection
  if (lockSection) byName.set('lockSection', (target) => target.exec(lockSection))
  const manageLocked = security?.manageLockedSections
  if (manageLocked) byName.set('lockedSections', () => manageLocked())
  const lockNow = security?.lockNow
  if (lockNow) byName.set('lockNow', () => lockNow())

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
    // Word's Split Cells asks how many columns and rows; without it, Split un-merges.
    const splitInto = commands.splitCellInto
    if (splitInto) {
      byName.set('splitCell', (target) => {
        void openSplitCellsDialog(document).then((choice) => {
          target.view?.focus()
          if (choice !== null) target.exec(splitInto(choice.columns, choice.rows))
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
    wireTableLayout(editor, commands, byName, activeByName)
    wireTableData(editor, document, commands, byName, activeByName)
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
  if (values.kind === 'block') {
    // A block with no id yet is given one: its words, made into a name.
    const index = Number(values.block)
    const selection = target.state.selection
    const ensured = Number.isInteger(index) ? ensureBlockId(target.state, index) : null
    if (!ensured) return
    if (ensured.tr) target.dispatch(ensured.tr.setSelection(selection))
    if (target.commands.setLink(`#${ensured.id}`, title)) target.exec(setLinkTarget(tab))
    return
  }
  const href = values.kind === 'anchor' ? `#${values.anchor ?? ''}` : (values.href ?? '').trim()
  if (href === '#' || !safeHref(href)) return
  if (target.commands.setLink(href, title)) target.exec(setLinkTarget(tab))
}

/** The number formats the Formula dialog offers, Word's list. */
const FORMULA_FORMATS: readonly { value: string; label: string }[] = [
  { value: '', label: 'As worked out' },
  { value: '0', label: '0' },
  { value: '0.00', label: '0.00' },
  { value: '#,##0', label: '#,##0' },
  { value: '#,##0.00', label: '#,##0.00' },
  { value: '0%', label: '0%' },
  { value: '0.00%', label: '0.00%' },
  { value: '$#,##0.00', label: '$#,##0.00' },
  { value: '£#,##0.00', label: '£#,##0.00' },
  { value: '€#,##0.00', label: '€#,##0.00' },
]

const COLUMN_TYPE_ENTRIES: readonly [string, TableColumnType][] = [
  ['columnTypeText', 'text'],
  ['columnTypeNumber', 'number'],
  ['columnTypeCurrency', 'currency'],
  ['columnTypePercentage', 'percentage'],
  ['columnTypeDate', 'date'],
  ['columnTypeCheckbox', 'checkbox'],
]

const FILTER_CONDITION_CHOICES: readonly { value: TableRowFilter['condition']; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'notContains', label: 'Does not contain' },
  { value: 'equals', label: 'Equals' },
  { value: 'greater', label: 'Is greater than' },
  { value: 'less', label: 'Is less than' },
  { value: 'empty', label: 'Is empty' },
  { value: 'notEmpty', label: 'Is not empty' },
]

/** The Table menu's data entries: Formula…, Column type, Filter rows…, hiding and charts. */
function wireTableData(
  editor: Editor,
  document: Document,
  commands: TableCommands,
  byName: Map<string, (editor: Editor) => void>,
  activeByName: Map<string, () => boolean>,
): void {
  const insertFormula = commands.insertFormula
  if (insertFormula) {
    byName.set('tableFormula', (target) => {
      const current = commands.formulaAt?.(target.state) ?? {
        expression: 'SUM(ABOVE)',
        format: null,
      }
      void openDialog({
        document,
        title: 'Formula',
        submitLabel: 'Insert',
        fields: [
          {
            name: 'expression',
            label: 'Formula',
            value: `=${current.expression}`,
            required: true,
            hint: 'SUM, AVERAGE, COUNT, MIN, MAX or PRODUCT of ABOVE, BELOW, LEFT, RIGHT, or cells such as B2:B5.',
          },
          {
            name: 'format',
            label: 'Number format',
            type: 'select',
            value: current.format ?? '',
            options: FORMULA_FORMATS,
          },
        ],
      }).then((values) => {
        target.view?.focus()
        if (values) target.exec(insertFormula(values.expression ?? '', values.format || null))
      })
    })
  }
  const setType = commands.setColumnType
  if (setType) {
    for (const [name, type] of COLUMN_TYPE_ENTRIES) {
      byName.set(name, (target) => target.exec(setType(type)))
      const read = commands.columnTypeAt
      if (read) activeByName.set(name, () => read(editor.state) === type)
    }
  }
  const filter = commands.filterRows
  if (filter) {
    byName.set('filterRows', (target) => {
      const labels = commands.tableColumnLabels?.(target.state) ?? []
      if (labels.length === 0) return
      void openDialog({
        document,
        title: 'Filter rows',
        submitLabel: 'Filter',
        body: 'Rows that do not match are hidden, not deleted. Show all rows brings them back.',
        fields: [
          {
            name: 'column',
            label: 'Column',
            type: 'select',
            value: '0',
            options: labels.map((label, index) => ({ value: String(index), label })),
          },
          {
            name: 'condition',
            label: 'Show rows where the cell',
            type: 'select',
            value: 'contains',
            options: FILTER_CONDITION_CHOICES,
          },
          {
            name: 'value',
            label: 'Value',
            visibleWhen: {
              field: 'condition',
              values: ['contains', 'notContains', 'equals', 'greater', 'less'],
            },
          },
        ],
      }).then((values) => {
        target.view?.focus()
        if (!values) return
        const condition = (values.condition ?? 'contains') as TableRowFilter['condition']
        target.exec(filter({ column: Number(values.column), condition, value: values.value ?? '' }))
      })
    })
  }
  for (const [name, command] of [
    ['showAllRows', commands.showAllRows],
    ['hideColumn', commands.hideColumn],
    ['showAllColumns', commands.showAllColumns],
  ] as const) {
    if (command) byName.set(name, (target) => target.exec(command))
  }
  const chart = commands.insertChart
  if (chart) {
    for (const [name, kind] of [
      ['chartBar', 'bar'],
      ['chartLine', 'line'],
      ['chartPie', 'pie'],
    ] as const) {
      byName.set(name, (target) => target.exec(chart(kind)))
    }
  }
}

/**
 * Table ▸ Freeze header row, Freeze first column, Cell padding and the
 * vertical half of Cell alignment, each ticked while the table at the
 * selection has it.
 */
function wireTableLayout(
  editor: Editor,
  commands: TableCommands,
  byName: Map<string, (editor: Editor) => void>,
  activeByName: Map<string, () => boolean>,
): void {
  const read = commands.tableLayoutAt
  const wire = (name: string, command: Command, isOn: (layout: TableLayoutState) => boolean) => {
    byName.set(name, (target) => target.exec(command))
    if (!read) return
    activeByName.set(name, () => {
      const layout = read(editor.state)
      return layout !== null && isOn(layout)
    })
  }
  if (commands.toggleFreezeHeaderRow) {
    wire('freezeHeaderRow', commands.toggleFreezeHeaderRow, (layout) => layout.freezeHeader)
  }
  if (commands.toggleFreezeFirstColumn) {
    wire('freezeFirstColumn', commands.toggleFreezeFirstColumn, (layout) => layout.freezeColumn)
  }
  const padding = commands.setCellPadding
  if (padding) {
    for (const entry of CELL_PADDING_ENTRIES) {
      wire(entry.name, padding(entry.padding), (layout) => layout.cellPadding === entry.padding)
    }
  }
  const vertical = commands.setCellVerticalAlign
  if (vertical) {
    const alignments: readonly [string, 'middle' | 'bottom' | null][] = [
      ['cellAlignTop', null],
      ['cellAlignMiddle', 'middle'],
      ['cellAlignBottom', 'bottom'],
    ]
    for (const [name, value] of alignments) {
      wire(name, vertical(value), (layout) => (layout.verticalAlign ?? null) === value)
    }
  }
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

/** The menu entries that start, stop and play a macro, which a macro does not record. */
const MACRO_ENTRIES = new Set(['macroRecord', 'macroPlay'])

/** Every entry's run noted by the macro recorder as it runs, so a macro can play it back. */
function withRecording(menus: readonly Menu[], macros: Macros): readonly Menu[] {
  const wrap = (item: MenuItem): MenuItem => {
    if (item.items) return { ...item, items: item.items.map(wrap) }
    const run = item.run
    if (!run || MACRO_ENTRIES.has(item.name)) return item
    return {
      ...item,
      run: (target) => {
        macros.note(item.name, run)
        run(target)
      },
    }
  }
  return menus.map((menu) => ({ ...menu, items: menu.items.map(wrap) }))
}

/**
 * Paste special: what is on the clipboard, as text in the style around the
 * caret, as Markdown, as a code block, or with its own formatting.
 */
function openPasteSpecial(document: Document, target: Editor): void {
  const clipboard = document.defaultView?.navigator.clipboard
  void openDialog({
    document,
    title: 'Paste special',
    submitLabel: 'Paste',
    body: 'What is on the clipboard, put in the way you choose.',
    fields: [
      {
        name: 'as',
        label: 'Paste as',
        type: 'select',
        value: 'text',
        options: [
          { value: 'text', label: 'Text only, in the style around it' },
          { value: 'markdown', label: 'Markdown, turned into formatting' },
          { value: 'code', label: 'A code block' },
          { value: 'formatted', label: 'With its own formatting' },
        ],
      },
    ],
  }).then(async (values) => {
    target.view?.focus()
    if (!values || !clipboard) return
    try {
      if (values.as === 'formatted' && typeof clipboard.read === 'function') {
        const html = await clipboardHTML(clipboard)
        if (html) {
          const parsed = parseHTML(target.schema, cleanPastedHTML(html), document)
          target.exec(insertContent(parsed.content.children))
          return
        }
      }
      const text = await clipboard.readText()
      if (!text) return
      if (values.as === 'markdown') {
        target.exec(insertContent(parseMarkdown(text, target.schema).content.children))
      } else if (values.as === 'code') {
        target.exec(insertCodeBlockAfter(text.replace(/\r\n?/g, '\n')))
      } else {
        typeText(target, text.replace(/\r\n?/g, '\n'))
      }
    } catch {
      // Reading the clipboard needs permission; refused, nothing is pasted.
    }
  })
}

/** The HTML on the clipboard, when it holds some. */
async function clipboardHTML(clipboard: Clipboard): Promise<string | null> {
  for (const item of await clipboard.read()) {
    if (item.types.includes('text/html')) return (await item.getType('text/html')).text()
  }
  return null
}

/** A code block of `text` in place of an empty paragraph at the caret, or after the block there. */
function insertCodeBlockAfter(text: string): Command {
  return (state) => {
    const type = state.schema.nodes.codeBlock
    const path = state.selection.to.path
    if (!type || path.length === 0) return null
    const parentPath = path.slice(0, -1)
    const index = path[path.length - 1] as number
    const block = nodeAtPath(state.doc, path)
    const waiting = block?.type.name === 'paragraph' && block.content.childCount === 0
    const at = waiting ? index : index + 1
    const code = type.create(
      undefined,
      text ? Fragment.of(state.schema.text(text)) : Fragment.empty,
    )
    return state.tr
      .step(new ReplaceNodesStep(parentPath, at, waiting ? index + 1 : at, Fragment.of(code)))
      .setSelection(new TextSelection(pos([...parentPath, at], text.length)))
  }
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
  const tr = editor.state.tr.step(new ReplaceNodesStep([], 0, editor.state.doc.childCount, content))
  // The source carries the document's settings on its wrapper; edited there,
  // they are applied with the rest.
  if (!attrsEq(tr.doc.attrs, parsed.attrs)) tr.step(new SetNodeAttrsStep([], parsed.attrs))
  editor.dispatch(tr)
}
