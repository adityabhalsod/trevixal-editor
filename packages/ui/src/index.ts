// Toolbar
export {
  type BlockCommands,
  type ReferenceTargetInfo,
  type CodeFormatCommands,
  createToolbar,
  defaultToolbarGroups,
  defaultToolbarItems,
  type FormatPainterState,
  QUICK_ACCESS_GROUP,
  type QuickAccessOptions,
  type Toolbar,
  type ToolbarControl,
  type ToolbarGroup,
  type ToolbarGroupInfo,
  type ToolbarItem,
  type ToolbarOptions,
  type ToolbarPreset,
  TOOLBAR_PRESETS,
  toolbarPresetGroups,
} from './toolbar'

// List tools: sort, fold, task details, defined multilevel schemes
export {
  bindListFolding,
  defineListNumbering,
  highlightOverdueTasks,
  isFoldable,
  type ListSortDirection,
  localToday,
  nextListSchemeId,
  revealSelection,
  setListItemFolded,
  setTaskDetails,
  sortList,
  type TaskDetails,
  taskDetailsAt,
  toggleListItemFold,
} from './list-tools'
export {
  editableLevels,
  listDialogEntries,
  openDefineListNumbering,
  openListSchemeDialog,
  type ListSchemeDialogOptions,
} from './list-dialogs'

// Menubar
export {
  CELL_PADDING_ENTRIES,
  createMenubar,
  defaultMenus,
  type Menu,
  type MenuItem,
  type Menubar,
  type MenubarOptions,
} from './menubar'

// Controls
export {
  applyBlockFormat,
  blockFormatValue,
  type ColorControlOptions,
  type Control,
  createColorControl,
  createListNumberingControl,
  createSelectControl,
  createTableGridControl,
  currentListNumbering,
  defaultBlockFormats,
  defaultFontFamilies,
  defaultFontSizes,
  defaultListNumberings,
  definedListNumberings,
  DEFAULT_SWATCHES,
  type ListNumberingControlOptions,
  type ListNumberingOption,
  NO_LIST_NUMBERING,
  type SelectControlOptions,
  type SelectOption,
  type TableGridOptions,
} from './controls'

// Dropdown primitive
export {
  bindListNavigation,
  createDropdown,
  type Dropdown,
  type DropdownOptions,
  focusFirstItem,
} from './dropdown'

// Floating selection menu, link editor and block grip
export {
  type BubbleMenu,
  type BubbleMenuOptions,
  createBubbleMenu,
  defaultBubbleItems,
} from './bubble-menu'
export { type LinkPopover, type LinkPopoverOptions, createLinkPopover } from './link-popover'
export {
  type BlockTarget,
  blockTargets,
  brokenInternalLinks,
  type CheckLinksOptions,
  checkLinks,
  enableLinkTitles,
  ensureBlockId,
  type LinkRef,
  type LinkReport,
  type LinkStatus,
  linksIn,
  openLinkReport,
  reachableURL,
  selectLink,
} from './link-tools'
export {
  type ComparisonOptions,
  type ComparisonRow,
  type WordPart,
  compareDocuments,
  comparisonCounts,
  openComparison,
  wordDiff,
} from './compare'
export { clipWebPage, fetchPageHTML } from './web-clip'
export {
  EQUATION_PALETTE,
  type EquationDialogOptions,
  type EquationDialogResult,
  bindEquationEditing,
  insertAtCaret,
  openEquationDialog,
} from './equation-dialog'
export { type GoToTarget, goToLine, goToTargets, openGoToDialog } from './go-to'
export { type MacroStep, type Macros, createMacros } from './macros'
export { type MultipleCarets, enableMultipleCarets } from './multi-caret'
export {
  type Snippet,
  type SnippetStore,
  abbreviationAt,
  enableSnippetExpansion,
  expandAbbreviation,
  insertSnippet,
  isAbbreviation,
  openSnippetsDialog,
  selectionContent,
  textContent as snippetText,
} from './snippets'
export {
  type KeyPreset,
  type KeyPresetOptions,
  type VimMode,
  installKeyPreset,
} from './key-presets'
export {
  type BlockDragHandle,
  type BlockDragHandleOptions,
  createBlockDragHandle,
} from './block-drag-handle'
// Line numbers in the margin, and following references to their targets
export {
  createLineNumbers,
  type LineNumbers,
  type LineNumbersOptions,
  type MeasuredLine,
  measureLines,
  numberLinesIn,
} from './line-numbers'
export { createTabLayout, layoutTabsIn, type TabLayout } from './tab-layout'
export { createNamedStyleSheet, type NamedStyleSheet } from './named-style-sheet'
export { createStylesPane, type StylesPane, type StylesPaneOptions } from './styles-pane'
export {
  createReferenceNavigation,
  type ReferenceNavigation,
  referenceTarget,
} from './reference-navigation'

// Floating code-language select
export {
  type CodeLanguageOption,
  type CodeLanguageSelect,
  type CodeLanguageSelectOptions,
  createCodeLanguageSelect,
} from './code-language'

// Floating table toolbar
export {
  createTableToolbar,
  type TableToolbar,
  type TableToolbarCommands,
  type TableToolbarOptions,
} from './table-toolbar'

// Translation
export {
  ARIA_SUFFIX,
  createTranslator,
  defaultMessages,
  MENU_KEY,
  type Messages,
  TOOLBAR_GROUP_KEY,
  TOOLBAR_KEY,
  type Translator,
} from './i18n'
export { languageItemName, type UILanguage, UI_LANGUAGES } from './languages'

// CSS collection, for exporting a self-contained document
export { type CollectCSSOptions, collectDocumentCSS } from './collect-css'
export {
  type RenderedBlock,
  type RenderedDocument,
  type RenderedImage,
  type RenderedRun,
  captureRenderedBlocks,
  rasterizeDiagrams,
  renderedNodeHTML,
} from './export-render'
export { bindDocumentBehaviour, documentBehaviourScript } from './export-script'

// Dialogs
export {
  type CharacterPickerOptions,
  type ConfirmDialogOptions,
  type DialogField,
  type DialogOptions,
  type DialogValues,
  type InfoDialogOptions,
  type InfoRow,
  openCharacterPicker,
  openConfirmDialog,
  openDialog,
  openInfoDialog,
  type PickerCharacter,
  SPECIAL_CHARACTERS,
} from './dialog'

// Status bar
export { createStatusBar, type StatusBar, type StatusBarOptions } from './status-bar'

// Icons
export { createIcon, type IconName, iconNames } from './icons'

// Suggestion popup
export {
  createSuggestionPopup,
  type SuggestionPopup,
  type SuggestionPopupOptions,
} from './popup'

// Table of contents
export {
  createTableOfContents,
  type TableOfContents,
  type TableOfContentsOptions,
  type TocEntry,
} from './table-of-contents'

// Document outline
export {
  createDocumentOutline,
  defaultOutlineBlockKinds,
  type DocumentOutline,
  type DocumentOutlineOptions,
  type OutlineBlockKind,
  type OutlineEntry,
} from './outline'

// Find and replace
export {
  compileSearch,
  createFindReplace,
  findAll,
  type FindReplace,
  type FindReplaceOptions,
  type FindReplaceQuery,
  type FindReplaceResult,
} from './find-replace'

// Command palette
export {
  type CommandPalette,
  type CommandPaletteOptions,
  createCommandPalette,
  filterCommands,
  fuzzyScore,
  type PaletteCommand,
  paletteCommandsFromMenus,
} from './command-palette'

// View modes
export {
  createFocusMode,
  createFullscreenToggle,
  createTypewriter,
  EDITOR_WIDTHS,
  type EditorWidth,
  type FocusMode,
  type FocusModeOptions,
  type FullscreenToggle,
  type FullscreenToggleOptions,
  setEditorWidth,
  type Typewriter,
  type TypewriterOptions,
} from './view-modes'

// Keyboard shortcut manager
export {
  createShortcutManager,
  formatShortcut,
  isApplePlatform,
  openShortcutsDialog,
  parseShortcut,
  type ResolvedShortcut,
  type ShortcutAction,
  type ShortcutLabels,
  type ShortcutManager,
  type ShortcutManagerOptions,
  type ShortcutOverrides,
} from './shortcuts'

// Open, save, export, import and print
export {
  acceptFor,
  builtinExporters,
  builtinImporters,
  type BuiltinExporterOptions,
  documentTitle,
  type DocumentExporter,
  type DocumentImporter,
  downloadFile,
  type DownloadOptions,
  editorTheme,
  exportDocument,
  type ExportContext,
  type ExportOptions,
  type ImportContext,
  type ImportOptions,
  importFile,
  importerFor,
  readDocumentFile,
  openPrintPreview,
  pickFile,
  printDocument,
  printableHTML,
  type PrintOptions,
  repeatHeaderRowsIn,
  readFileText,
  selectionDocument,
  suggestFileName,
  textToDocument,
} from './documents'

// Markdown and HTML source modes
export {
  createSourceMode,
  type SourceFormat,
  type SourceMode,
  type SourceModeOptions,
} from './source-mode'

// Autosave, draft recovery and local backups
export {
  type Autosave,
  type AutosaveIndicator,
  type AutosaveIndicatorOptions,
  type AutosaveOptions,
  type AutosaveState,
  type AutosaveStatus,
  type Backup,
  type BackupOptions,
  type BackupsDialogOptions,
  createAutosave,
  createAutosaveIndicator,
  createMemoryStorage,
  createWebStorage,
  type DraftRecoveryOptions,
  formatSavedAt,
  type KeyValueStorage,
  offerDraftRecovery,
  openBackupsDialog,
  type SavedDocument,
} from './persistence'

// Undo history panel
export { createHistoryPanel, type HistoryPanel, type HistoryPanelOptions } from './history-panel'

// Themes, fonts, custom CSS and the page view
export {
  buildCustomTheme,
  currentTheme,
  createCustomStyles,
  createFontManager,
  createPageView,
  createThemeController,
  CUSTOM_THEME_TOKENS,
  followPageSetup,
  type CustomStyles,
  type CustomThemeInput,
  defaultThemePresets,
  type FontDefinition,
  type FontManager,
  type FontManagerOptions,
  googleFontURL,
  isDarkColor,
  mixColors,
  PAGE_SIZES,
  type PageMode,
  type PageView,
  type PageViewOptions,
  parseColor,
  parseTheme,
  readThemeSnapshot,
  scopeCSS,
  serializeTheme,
  THEME_FILE_FORMAT,
  type ThemeController,
  type ThemeControllerOptions,
  type ThemeMode,
  ThemeFileError,
  type ThemePreset,
  type ThemeSnapshot,
} from './theming'

// The document's own theme and fonts, saved with it
export {
  bindDocumentTheme,
  DOCUMENT_THEME,
  documentFonts,
  documentTheme,
  type DocumentFonts,
  setDocumentFonts,
  setDocumentTheme,
} from './document-appearance'

// Reduced motion
export { MOTION_ATTRIBUTE, scrollBehavior } from './motion'

// Long documents
export {
  enableLongDocumentMode,
  LONG_DOCUMENT_ATTRIBUTE,
  LONG_DOCUMENT_BLOCKS,
} from './long-document'

// Phones
export { KEYBOARD_INSET_PROPERTY, trackVirtualKeyboard } from './mobile'

// Dictation and read-aloud
export { createSpeech, type Speech, type SpeechOptions } from './speech'

// Quick insert, recent tools, favourites and toolbar customization
export {
  createQuickInsertControl,
  createRecentToolsControl,
  createToolUsageTracker,
  EMPTY_USAGE,
  openCustomizeToolbarDialog,
  quickInsertItemsFromMenus,
  type CustomizeToolbarOptions,
  type QuickInsertItem,
  type QuickInsertOptions,
  type RecentToolsOptions,
  type ToolUsage,
  type ToolUsageTracker,
  type ToolUsageTrackerOptions,
} from './quick-tools'

// Toolbar group reordering (also driven by the toolbar's own options)
export {
  applyGroupOrder,
  bindGroupReorder,
  type GroupReorder,
  type GroupReorderOptions,
  groupOrder,
} from './toolbar-reorder'

// Assembled chrome
export {
  type ChromeLanguage,
  type CodeCommands,
  createEditorUI,
  type DiagramCommands,
  type EditorUI,
  type EditorUIOptions,
  type EmbedCommands,
  type FileActions,
  type ImageActions,
  type MathCommands,
  type SecurityCommands,
  type TableColumnType,
  type TableCommands,
  type TableRowFilter,
  type TableLayoutState,
  VIEW_TOGGLES,
  type ViewActions,
  type ViewToggle,
  type WritingCheckKind,
} from './editor-ui'
