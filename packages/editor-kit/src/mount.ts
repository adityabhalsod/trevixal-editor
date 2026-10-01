/**
 * The complete editor: every package the workspace ships, assembled into one
 * call. Menubar, toolbar, dialogs and status bar; tables, images, media,
 * equations and diagrams; suggestions and track changes; writing checks,
 * autosave, themes and a document workspace.
 *
 * Read `features.ts` alongside this file: the capabilities that are not part
 * of the document model are configured there, and wired up here. `layout.ts`
 * builds the page this hangs the parts on.
 */
import {
  AUTOCORRECT_WORDS,
  type Editor,
  FormatPainter,
  autocorrectRule,
  createEditor,
  defaultInputRules,
  describeFormat,
  mergeKeymaps,
  paragraphCount,
  sentenceCount,
  serializeToHTMLDocument,
  smartTypographyRules,
} from '@trevixal/core'
import {
  blockBindings,
  blockKeymap,
  blockUICommands,
  enableAdvancedBlocks,
  installFieldUpdater,
  parseCoordinates,
} from '@trevixal/extension-blocks'
import {
  codeBlockLines,
  codeHighlight,
  copyToClipboard,
  createHighlighter,
  insertCodeDiff,
  insertRunnableCode,
  insertTerminal,
} from '@trevixal/extension-code-highlight'
import { createCommentsPanel } from '@trevixal/extension-comments'
import {
  EVERY_DIAGRAM_LANGUAGE,
  PLANTUML_SERVER,
  createGraphvizRenderer,
  createMermaidRenderer,
  createPlantUMLRenderer,
  diagram,
  diagramUICommands,
} from '@trevixal/extension-diagram'
import {
  attachments,
  embedUICommands,
  enableChapterLinks,
  enableEmbedSelection,
  formatTime,
  insertAudio,
  openAudioRecorder,
} from '@trevixal/extension-embed'
import { codeFormatUICommands } from '@trevixal/extension-format-code'
import { enableFormFields, insertFormField } from '@trevixal/extension-forms'
import {
  type ImageStorage,
  capturePhoto,
  captureScreen,
  createDataURLStorage,
  createFallbackStorage,
  createFetchStorage,
  enableDrawingEditing,
  enableLightbox,
  image,
  insertDrawing,
  openDrawingEditor,
  promptForAltText,
  setImageAlt,
  setImageDecorative,
  updateDrawing,
} from '@trevixal/extension-image'
import { mathUICommands } from '@trevixal/extension-math'
import {
  enableSectionLocks,
  lockSection,
  protectRedactionsOnCopy,
  toggleRedaction,
} from '@trevixal/extension-security'
import {
  createTableTools,
  enableCellCheckboxes,
  enableCellSelection,
  highlightActiveCell,
  installFormulaUpdater,
  markGridColumns,
  tableKeymap,
  tableUICommands,
} from '@trevixal/extension-table'
import { TrackChanges, createTrackChangesBar } from '@trevixal/extension-track-changes'
import {
  COMMON_SYNONYMS,
  analyzeText,
  createReadingHeatmap,
  createRulesProvider,
  createWritingAssistant,
  createWritingInlineUI,
  enableThesaurus,
  goalProgress,
  isSpellcheckEnabled,
  setSpellcheck,
  wordListThesaurus,
} from '@trevixal/extension-writing'
import {
  type Messages,
  type PaletteCommand,
  type ToolbarPreset,
  UI_LANGUAGES,
  bindDocumentTheme,
  collectDocumentCSS,
  createCommandPalette,
  createDocumentOutline,
  createEditorUI,
  createFocusMode,
  createFullscreenToggle,
  createShortcutManager,
  createSpeech,
  createStylesPane,
  createTableOfContents,
  createTypewriter,
  currentTheme,
  documentTheme,
  editorTheme,
  enableLinkTitles,
  installKeyPreset,
  openConfirmDialog,
  openCustomizeToolbarDialog,
  openDialog,
  openInfoDialog,
  paletteCommandsFromMenus,
  quickInsertItemsFromMenus,
  reachableURL,
  serializeTheme,
  setDocumentTheme,
  setEditorWidth,
  toolbarPresetGroups,
} from '@trevixal/ui'
import { applyReading, askDocumentFonts, exportTheme, importTheme } from './appearance'
import { autocorrectLines, parseAutocorrectLines } from './autocorrect'
import { initialContent } from './content'
import {
  askCustomCSS,
  askCustomTheme,
  askFont,
  createChrome,
  createHistoryToggle,
  createOfflineIndicator,
  createSaving,
  createUsage,
  loadPreferences,
  savePreferences,
  showStatistics,
} from './features'
import { createFileActions } from './file-actions'
import { createFloatingControls } from './floating'
import { askFieldValue, askNewField } from './forms'
import { createLayout } from './layout'
import { DEFAULT_ABOUT_ROWS, type FullEditor, type FullEditorOptions } from './options'
import { createSplitPanes } from './panes'
import { openPresentation } from './presentation'
import { createFullSchema } from './schema'
import { DEFAULT_AUTO_LOCK_MINUTES, createDocumentSecurity } from './security'
import { shortcutActions } from './shortcuts'
import { createSuggestionMenus } from './suggestions'
import { createDocumentTrust } from './trust'
import { createDocumentWorkspace } from './workspace'
import { runAssist } from './writing-assist'
import { showAccessibilityReport, showDuplicateText } from './writing-reports'

// A chart's series, in the chrome's accent and then hues as dark: Mermaid's
// own first colour is a lavender barely darker than the page.
const CHART_PALETTE = '#4f46e5, #d97706, #059669, #dc2626, #0284c7, #7c3aed'

/**
 * Build the whole editor inside `options.element` and return a handle to it.
 *
 * Call it once per page. The parts it assembles include several that are
 * singletons by nature, the autosave draft, the workspace store, the command
 * palette on `document.body`, so a second mount on the same namespace would
 * have two editors writing over one another's saves.
 */
export function mountFullEditor(options: FullEditorOptions): FullEditor {
  const layout = createLayout(options.element, options)
  /** Everything that has to be taken back at `destroy`, in creation order. */
  const disposers: (() => void)[] = []
  const namespace = options.namespace ?? 'trevixal'
  const author = options.author ?? 'You'
  // Distinguishing "not set" from "deliberately none": the default posts to a
  // demo endpoint that need not exist, because the storage falls back to a
  // data URL either way, and null says skip the attempt entirely.
  const uploadEndpoint =
    options.uploadEndpoint === undefined ? '/api/uploads' : options.uploadEndpoint

  // ---------------------------------------------------------------- schema

  const schema = createFullSchema({
    ...(options.mapTiles ? { tiles: options.mapTiles } : {}),
    ...(options.mapAttribution ? { attribution: options.mapAttribution } : {}),
  })

  const storage: ImageStorage = createFallbackStorage([
    ...(uploadEndpoint === null ? [] : [createFetchStorage({ endpoint: uploadEndpoint })]),
    createDataURLStorage(),
  ])

  const editorHost = layout.editor
  const editorShell = layout.shell
  const chromeHost = layout.chrome

  let preferences = loadPreferences(`${namespace}:preferences`)
  const remember = (next: Partial<typeof preferences>): void => {
    preferences = { ...preferences, ...next }
    savePreferences(`${namespace}:preferences`, preferences)
  }

  const editor = createEditor({
    schema,
    content: options.content ?? initialContent,
    element: editorHost,
    // Both bind Enter. Spreading them would keep only the last one, and the
    // other extension would quietly stop answering the key.
    keymap: mergeKeymaps(tableKeymap(), blockKeymap()),
    // Word's AutoFormat and AutoCorrect as you type, on until Tools turns them
    // off; each reads the preference on every keystroke, so the switch acts at once.
    inputRules: [
      ...defaultInputRules(),
      ...smartTypographyRules({ enabled: () => preferences.smartTypography !== false }),
      autocorrectRule({
        enabled: () => preferences.autocorrect !== false,
        words: () => preferences.autocorrectWords ?? AUTOCORRECT_WORDS,
        curlyQuotes: () => preferences.smartTypography !== false,
      }),
    ],
    placeholder: options.placeholder ?? 'Write something…',
    onChange: () => {
      renderOutput()
      refreshStatus()
      options.onChange?.(editor)
    },
  })

  // ------------------------------------------------------- document extensions

  // A locked section refuses any edit that would change it. First among the
  // transforms, so it judges the edit alone: field and formula updates added
  // after it may still renumber what a section shows.
  disposers.push(
    enableSectionLocks(editor, {
      onBlocked: () =>
        security.report('That section is locked: Tools ▸ Locked sections… unlocks it'),
    }),
  )
  // Redacted words are copied, cut and dragged as their stand-in.
  disposers.push(protectRedactionsOnCopy(editor))
  disposers.push(highlightActiveCell(editor))
  disposers.push(markGridColumns(editor))
  // Double click a cell to select it, drag to take in more. The highlighter
  // above is what makes the result visible.
  disposers.push(enableCellSelection(editor))
  disposers.push(enableCellCheckboxes(editor))
  // Table ▸ Draw table and Eraser: tools the pointer holds over the page.
  const tableTools = createTableTools(editor, { container: editorHost })
  disposers.push(() => tableTools.destroy())
  // One highlighter for every surface: a split pane installs the same one
  // rather than building a second with its own caches.
  const highlighter = createHighlighter({ autoDetect: true })
  disposers.push(codeHighlight(editor, highlighter))
  // Numbered, picked-out and changed lines, and the bar that unfolds a folded block.
  disposers.push(codeBlockLines(editor))
  // Tabs and accordions write their folded state back into the document, so a
  // section left open is still open after a reload.
  disposers.push(blockBindings(editor))
  // Polls count votes, maps zoom and move, and each block shown only when a
  // variable is set says whether it is.
  disposers.push(
    enableAdvancedBlocks(editor, {
      editMap: async (place) => {
        const values = await openDialog({
          document,
          title: 'Map',
          submitLabel: 'Apply',
          fields: [
            {
              name: 'place',
              label: 'Latitude, longitude',
              type: 'text',
              value: `${place.lat}, ${place.lng}`,
            },
            { name: 'label', label: 'Name the place', type: 'text', value: place.label },
            { name: 'zoom', label: 'Zoom, 1 to 18', type: 'number', value: String(place.zoom) },
          ],
        })
        editor.view?.focus()
        const at = values ? parseCoordinates(values.place ?? '') : null
        if (!values || !at) return null
        return { ...at, label: values.label?.trim() ?? '', zoom: Number(values.zoom) || place.zoom }
      },
    }),
  )

  // Mermaid and Graphviz are fetched from a CDN the first time a block of
  // theirs renders, so the page costs nothing until a diagram is used.
  // PlantUML is drawn by a server, the public one unless the host says.
  let mermaidRenderer: ReturnType<typeof createMermaidRenderer> | null = null
  let graphvizRenderer: ReturnType<typeof createGraphvizRenderer> | null = null
  const plantumlServer =
    options.plantumlServer === undefined ? PLANTUML_SERVER : options.plantumlServer
  const plantumlRenderer = plantumlServer ? createPlantUMLRenderer(plantumlServer) : null
  /** One diagram in whichever language its block names. */
  const drawDiagram: Parameters<typeof diagram>[1]['render'] = async (code, context) => {
    if (context.language === 'plantuml') {
      if (!plantumlRenderer) throw new Error('PlantUML is not drawn in this editor')
      return plantumlRenderer(code, context)
    }
    if (context.language === 'dot' || context.language === 'graphviz') {
      if (!graphvizRenderer) {
        const { loadGraphviz } = await import('@trevixal/extension-diagram')
        graphvizRenderer = createGraphvizRenderer(await loadGraphviz())
      }
      return graphvizRenderer(code, context)
    }
    if (!mermaidRenderer) {
      const { loadMermaid } = await import('@trevixal/extension-diagram')
      mermaidRenderer = createMermaidRenderer(await loadMermaid(), {
        themeVariables: { xyChart: { plotColorPalette: CHART_PALETTE } },
      })
    }
    return mermaidRenderer(code, context)
  }
  /** Shared, so a split pane draws through the same loaded renderers as the editor. */
  const renderDiagram: Parameters<typeof diagram>[1]['render'] = async (code, context) => {
    const drawn = await drawDiagram(code, context)
    // A diagram that lands after the preview has rendered is a diagram the
    // preview does not have. Drawing one is not an edit, it appends an element
    // beside the block rather than changing the document, so nothing schedules
    // another render, and the pane would go on showing an empty plate until the
    // next keystroke happened to refresh it. Mermaid is fetched from a CDN on
    // first use, so this is the ordinary case on a cold load, not a rare one.
    panes.refreshPreview()
    return drawn
  }
  const diagrams = diagram(editor, { render: renderDiagram, languages: EVERY_DIAGRAM_LANGUAGE })

  const uploadStatus = layout.uploadStatus
  const images = image(editor, {
    storage,
    maxBytes: options.maxImageBytes ?? 5 * 1024 * 1024,
    deleteOnRemove: true,
    onUpload: (upload) => {
      if (!uploadStatus) return
      uploadStatus.textContent =
        upload.state === 'uploading'
          ? `Uploading ${upload.fileName}… ${Math.round((upload.progress ?? 0) * 100)}%`
          : `${upload.fileName}: ${upload.state}`
    },
    onError: (message) => {
      if (uploadStatus) uploadStatus.textContent = `Upload failed: ${message}`
    },
  })

  // Media in the editor: images open full size on a double click, a video's
  // chapter links seek its player, and a drawing opens to edit on a double
  // click. A new image asks for its alt text.
  disposers.push(enableLightbox(editor))
  disposers.push(enableChapterLinks(editor))
  if (options.fetchLinkTitle) disposers.push(enableLinkTitles(editor, options.fetchLinkTitle))
  disposers.push(enableEmbedSelection(editor))
  disposers.push(
    enableDrawingEditing(editor, (path, data) => {
      void openDrawingEditor(document, data).then((next) => {
        editor.view?.focus()
        if (next) editor.exec(updateDrawing(path, next))
      })
    }),
  )
  // One question at a time: pictures picked together finish uploading one
  // after another, and each prompt stacked over the last would say nothing
  // of which picture it was for.
  let describing = false
  disposers.push(
    promptForAltText(editor, (path) => {
      if (describing) return
      describing = true
      void openDialog({
        document,
        title: 'Describe this image',
        submitLabel: 'Save',
        cancelLabel: 'Skip',
        body: 'What it shows, for anyone who cannot see it. A decorative image needs none.',
        fields: [
          { name: 'alt', label: 'Alt text', type: 'text' },
          { name: 'decorative', label: 'Decorative only', type: 'checkbox' },
        ],
      }).then((values) => {
        describing = false
        editor.view?.focus()
        if (!values) return
        if (values.decorative === 'true') editor.exec(setImageDecorative(true, path))
        else if (values.alt?.trim()) editor.exec(setImageAlt(values.alt.trim(), path))
      })
    }),
  )

  // Non-image files dropped on the editor become attachment chips.
  const files = attachments(editor, {
    storage,
    onError: (message) => {
      if (uploadStatus) uploadStatus.textContent = `Attachment failed: ${message}`
    },
  })

  const painter = new FormatPainter(editor, { onChange: () => ui.toolbar.refresh() })

  // ------------------------------------------------------- suggestion menus

  /**
   * Run a wired menu entry by name, as picking it from its menu would. Found
   * when it runs, because the menus are wired further down: the `/` menu's
   * Video opens Insert ▸ Video… this way, and Ctrl+F the find bar.
   */
  function runMenuEntry(name: string): void {
    paletteCommandsFromMenus(ui.menus)
      .find((command) => command.name === name)
      ?.run(editor)
  }

  const suggestions = createSuggestionMenus(editor, images, runMenuEntry)
  // The two extensions say `dispose` rather than `destroy`, so they go in
  // this list; their popups are UI, and go on the destroy list at the end.
  disposers.push(() => suggestions.dispose())

  // --------------------------------------------------------- review surfaces

  const track = new TrackChanges(editor, { author })
  // Caption numbers, cross-references, tables of figures and the index kept
  // current inside each edit. The updater has to run after track changes, so
  // it sees the transaction actually applied: an edit it has added field steps
  // to is no longer one track changes can record. Track changes adds itself
  // when Suggesting is switched on, so the updater goes back on after it.
  // Table formulas' results are kept current the same way, and for the same reason.
  let removeFieldUpdater = installFieldUpdater(editor)
  let removeFormulaUpdater = installFormulaUpdater(editor)
  const stopFollowingTrackChanges = track.onEnabledChange(() => {
    removeFieldUpdater()
    removeFormulaUpdater()
    removeFieldUpdater = installFieldUpdater(editor)
    removeFormulaUpdater = installFormulaUpdater(editor)
  })
  disposers.push(() => {
    stopFollowingTrackChanges()
    removeFieldUpdater()
    removeFormulaUpdater()
  })
  const writing = createWritingAssistant(editor, { longSentences: true })
  // Tools ▸ Check writing ▸ Reading heat map: every sentence tinted by how hard it reads.
  const heatmap = createReadingHeatmap(editor)
  disposers.push(() => heatmap.destroy())
  // Right-click a word for its synonyms, from the host's thesaurus or a small built-in list.
  if (options.thesaurus !== null) {
    disposers.push(
      enableThesaurus(editor, {
        lookup: options.thesaurus ?? wordListThesaurus(COMMON_SYNONYMS),
      }),
    )
  }
  // Point at any wavy underline for what was flagged; click it for the fix.
  // Ctrl+. opens the same menu for the issue under the caret.
  const writingUI = createWritingInlineUI(editor, writing)

  // ------------------------------------------------------------------ chrome

  const chrome = createChrome(editor, editorShell, layout.root, preferences, remember)
  // A document saved with a theme opens in it; the reader's own comes back after.
  disposers.push(bindDocumentTheme(editor, chrome.theme))
  const applyReadingPreferences = (): void =>
    applyReading(layout.root, {
      reducedMotion: preferences.reducedMotion === true,
      dyslexiaFont: preferences.dyslexiaFont === true,
    })
  applyReadingPreferences()
  // A right-to-left document mirrors the whole editor with it: the chrome, the
  // sidebar and the panes, as well as the text.
  // The root is the host's own element, so a `dir` it came with is its
  // direction whenever the document has none, and it is handed back as lent.
  const hostDirection = layout.root.getAttribute('dir')
  const restoreDirection = (): void => {
    if (hostDirection === null) layout.root.removeAttribute('dir')
    else layout.root.setAttribute('dir', hostDirection)
  }
  const syncDirection = (): void => {
    if (editor.state.doc.attrs.direction === 'rtl') layout.root.setAttribute('dir', 'rtl')
    else restoreDirection()
  }
  syncDirection()
  const stopSyncingDirection = editor.on('update', syncDirection)
  disposers.push(() => {
    stopSyncingDirection()
    restoreDirection()
  })
  const focus = createFocusMode(editor)
  const fullscreen = createFullscreenToggle(editor, { target: editorShell })
  const typewriter = createTypewriter(editor)

  const tocPanel = layout.toc
  const outlinePanel = layout.outline
  const historyPanel = layout.history
  const workspacePanel = layout.workspace
  const statusHost = layout.saveStatus
  const splitHost = layout.split

  const contents = createTableOfContents(editor, { container: tocPanel })
  const outline = createDocumentOutline(editor, { container: outlinePanel })
  // Format ▸ Styles pane: every named style, applied, changed and made there.
  const stylesPane = createStylesPane(editor, { container: layout.styles })
  const reviewBar = createTrackChangesBar(editor, track, { container: layout.review, author })
  // Comment threads in the sidebar, saved with the document.
  const comments = createCommentsPanel(editor, {
    container: layout.comments,
    author: () => author,
    users: () => options.users ?? [],
    onMention: options.onMention,
  })
  disposers.push(() => comments.destroy())

  // A sub-namespace of its own, not the bare namespace: protecting the
  // document re-writes every key this store can see through the encrypted
  // one, and a prefix that also covered the preferences and the workspace
  // would encrypt those too, leaving the panels that read them unable to.
  const saving = createSaving(editor, statusHost, editorShell, `${namespace}:autosave:`)
  const toggleHistory = createHistoryToggle(editor, historyPanel)
  const usage = createUsage(preferences, remember)

  /** Show or hide a sidebar panel, and the sidebar with the last of them. */
  function togglePanel(panel: HTMLElement): void {
    panel.hidden = !panel.hidden
    fitSidebar()
  }

  /** The sidebar shows while any of its panels does. */
  function fitSidebar(): void {
    layout.sidebar.hidden = layout.panels.every((section) => section.hidden)
  }

  // ----------------------------------------------------------- key presets

  // Emacs's chords or Vim's modes over the editor's own keys, as chosen under
  // Tools ▸ Key bindings; Vim's mode shows in the status line.
  const showKeyMode = (mode: string | null): void => {
    layout.keyMode.hidden = mode === null
    layout.keyMode.textContent = mode ? `-- ${mode.toUpperCase()} --` : ''
  }
  let keyPreset = preferences.keyPreset ?? 'standard'
  let removeKeyPreset = installKeyPreset(editor, keyPreset, { onMode: showKeyMode })
  const setKeyPreset = (next: 'standard' | 'emacs' | 'vim'): void => {
    removeKeyPreset()
    keyPreset = next
    removeKeyPreset = installKeyPreset(editor, next, { onMode: showKeyMode })
    remember({ keyPreset: next })
    editor.view?.focus()
  }
  disposers.push(() => removeKeyPreset())

  // ------------------------------------------------------------- workspace

  const workspace = createDocumentWorkspace({
    editor,
    stripHost: layout.tabs,
    panelHost: workspacePanel,
    namespace,
  })

  // -------------------------------------------------------------- split panes

  const panes = createSplitPanes({
    editor,
    previewHost: splitHost,
    mirrorHost: layout.mirror,
    highlighter,
    render: renderDiagram,
  })

  // -------------------------------------------------------------- shortcuts

  // Verbs, not handles: half of what these reach for is built further down,
  // and every one of them is only ever called from a keypress.
  const shortcutList = shortcutActions({
    addComment: () => runMenuEntry('insertComment'),
    addNextMatch: () => void ui.carets.addNextMatch(),
    flushAutosave: () => void saving.autosave.flush(),
    newDocument: () => void newDocument(),
    openDocument: () => void openDocument(),
    // Through the menu entry, which builds the bar on first use: asking for
    // `ui.findReplace` found nothing until the menu had, so Ctrl+F did nothing.
    openFindReplace: () => runMenuEntry('findReplace'),
    openLinkDialog: () => ui.openLinkDialog(),
    openGoTo: () => ui.openGoTo(),
    openPalette: () => palette.open(),
    pickEmoji: () => void suggestions.pickEmoji(),
    playMacro: () => void ui.macros.play(),
    printDocument: (preview) => print(preview),
    protectDocument: () => void protectDocument(),
    toggleFocusMode: () => focus.toggle(),
    toggleFullscreen: () => void fullscreen.toggle(),
    toggleSplitEditor: () => panes.toggleMirror(),
  })

  const shortcuts = createShortcutManager(editor, {
    // Each noted by the macro recorder as it runs, so Ctrl+B in a macro plays
    // back as Bold; playing one is not part of the macro.
    actions: shortcutList.map((action) =>
      action.name === 'macroPlay'
        ? action
        : {
            ...action,
            run: (target: Editor) => {
              ui.macros.note(action.name, action.run)
              action.run(target)
            },
          },
    ),
    overrides: preferences.shortcuts,
    onChange: (overrides) => {
      remember({ shortcuts: overrides })
      // Re-print immediately: a menu that still advertises the old key after a
      // rebind is worse than one that prints nothing.
      ui.setShortcutLabels(shortcuts.labels())
    },
    scopes: [editorHost, chromeHost],
  })

  // --------------------------------------------------------- command palette

  // The store once open, for the palette's recently opened documents.
  let openedStore: Awaited<ReturnType<typeof workspace.store>> | null = null
  void workspace.store().then((store) => {
    openedStore = store
  })
  /** The documents opened most recently, but the one on screen, as palette entries. */
  const recentDocumentCommands = (): PaletteCommand[] => {
    const current = workspace.activeId()
    return (openedStore?.recent(8) ?? [])
      .filter((meta) => meta.id !== current)
      .map((meta) => ({
        name: `recentDocument-${meta.id}`,
        label: `Open ${meta.title || 'Untitled'}`,
        group: 'Recent documents',
        icon: 'folderOpen',
        keywords: ['recent', 'document', meta.folder ?? ''],
        run: () => void workspace.openDocument(meta.id),
      }))
  }
  const palette = createCommandPalette(editor, {
    container: document.body,
    // The whole menu tree is on offer, so the list is long. It scrolls, and the
    // filter narrows it the moment anything is typed; capping it at the default
    // 50 would hide entries from anyone browsing rather than searching.
    maxResults: 300,
    // What was run last opens the list, and is remembered across visits.
    recent: preferences.paletteRecent,
    onRecent: (recent) => remember({ paletteRecent: recent }),
    // Collected on open, from the menus as actually wired. Hand-listing them
    // meant the palette offered a dozen commands while the menus offered two
    // hundred, and every feature added since had to be remembered twice.
    commands: () => [
      // The workspace's recently opened documents first, each a jump to it.
      ...recentDocumentCommands(),
      // With the manager's labels, so Link reads Ctrl+Shift+K here as it does
      // in the menu, and a rebind shows the next time the palette opens.
      ...paletteCommandsFromMenus(ui.menus, shortcuts.labels()),
      // Demo-only, with no menu entry to derive from.
      {
        name: 'resetToolbar',
        label: 'Reset toolbar layout',
        // Appended after the derived list, so it has to share the group the
        // derived list ends on or the palette prints that heading twice. Help is
        // also where `Customize toolbar…` lives, which is what this resets.
        group: 'Help',
        icon: 'sliders',
        run: () => {
          ui.toolbar.setVisibleGroups(ui.toolbar.groups.map((group) => group.name))
          remember({ toolbarOrder: undefined, toolbarGroups: undefined })
        },
      },
    ],
  })

  // ----------------------------------------------------------------- security

  const security = createDocumentSecurity({
    editor,
    layout,
    saving,
    autoLockMinutes: options.autoLockMinutes ?? DEFAULT_AUTO_LOCK_MINUTES,
    passkey: () => trust.passkey(),
  })
  // Signatures, the audit log and passkeys.
  const trust = createDocumentTrust({
    editor,
    layout,
    namespace,
    author,
    isProtected: () => security.isProtected(),
  })
  disposers.push(() => trust.destroy())
  // Destructured so the menu and shortcut wiring below reads as it did when
  // these three were declared here.
  const { protectDocument, print } = security
  const editRestrictions = security.editRestrictions

  // ------------------------------------------------------------- file actions

  const { openDocument, download, compareWithFile, importFromURL, exportFolder, mailMerge } =
    createFileActions(editor, security, options.fetchPage)
  // A click on a field fills it in: a tick box ticks, the rest ask.
  disposers.push(enableFormFields(editor, { fill: askFieldValue }))

  // -------------------------------------------------- stats, goals and status

  async function showStats(): Promise<void> {
    // Five is enough to see what the document is about; the full list is a
    // table, and this is a summary dialog.
    const analysis = analyzeText(editor.getText(), { keywords: { limit: 5 } })
    await showStatistics({
      words: editor.getWordCount(),
      characters: editor.getCharacterCount(),
      sentences: sentenceCount(editor.state.doc),
      paragraphs: paragraphCount(editor.state.doc),
      readingTime: analysis.readingTime.label,
      speakingTime: analysis.speakingTime.label,
      readability: `${analysis.readabilityLabel} (${Math.round(analysis.fleschReadingEase)})`,
      passive: analysis.passive.length,
      repeated: analysis.repeated.length,
      keywords: analysis.keywords,
    })
  }

  /** Insert ▸ Comment…: a thread on the selected text, the panel opened to show it. */
  async function askComment(): Promise<void> {
    if (editor.state.selection.empty) {
      await openInfoDialog({
        document,
        title: 'Nothing selected',
        body: 'Select the words the comment is about, then choose Insert ▸ Comment again.',
      })
      editor.view?.focus()
      return
    }
    const values = await openDialog({
      document,
      title: 'Comment',
      submitLabel: 'Comment',
      fields: [
        {
          name: 'text',
          label: 'Comment',
          type: 'textarea',
          required: true,
          placeholder:
            (options.users ?? []).length > 0 ? 'Type @ and a name to mention someone' : '',
        },
      ],
    })
    editor.view?.focus()
    if (!values?.text) return
    if (comments.addComment(values.text) && layout.comments.hidden) togglePanel(layout.comments)
  }

  /** Keep the document as it is now under a name, to come back to or compare against. */
  async function askVersionName(): Promise<void> {
    const values = await openDialog({
      document,
      title: 'Save version',
      submitLabel: 'Save',
      body: 'A named version is kept however many backups come after it. File ▸ Local backups compares or restores it.',
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Sent to Sam' },
      ],
    })
    editor.view?.focus()
    if (values?.name) await saving.autosave.saveVersion(values.name)
  }

  /** Start over, keeping the current text reachable in the local backups. */
  async function newDocument(): Promise<void> {
    const ok = await openConfirmDialog({
      document,
      title: 'New document',
      body: 'This replaces what is on screen. Your current text stays in the local backups.',
      confirmLabel: 'New document',
    })
    if (ok) editor.setContent({ type: 'doc', content: [{ type: 'paragraph' }] })
  }

  async function askGoal(): Promise<void> {
    const values = await openDialog({
      document,
      title: 'Writing goal',
      submitLabel: 'Set',
      fields: [
        {
          name: 'target',
          label: 'Target word count',
          type: 'number',
          value: String(preferences.goal ?? 500),
        },
      ],
    })
    if (!values) return
    remember({ goal: Number(values.target) || undefined })
    refreshStatus()
  }

  /**
   * Tools ▸ AutoCorrect options…: the whole list, one entry a line. An edited
   * list replaces the built-in one; an empty box brings the built-in one back.
   */
  async function askAutocorrect(): Promise<void> {
    const values = await openDialog({
      document,
      title: 'AutoCorrect',
      submitLabel: 'Save',
      body: 'Each word on the left is replaced by the one on the right as you type.',
      fields: [
        {
          name: 'words',
          label: 'Replace as you type',
          type: 'textarea',
          value: autocorrectLines(preferences.autocorrectWords ?? AUTOCORRECT_WORDS),
          hint: 'One a line, as typo -> correction. Empty the box for the built-in list.',
        },
      ],
    })
    editor.view?.focus()
    if (!values) return
    const words = (values.words ?? '').trim()
    remember({ autocorrectWords: words ? parseAutocorrectLines(words) : undefined })
  }

  /** The goal readout beside the autosave status. */
  function refreshStatus(): void {
    const goalHost = layout.goal
    if (!preferences.goal) {
      goalHost.textContent = ''
      return
    }
    const progress = goalProgress(
      { target: preferences.goal, unit: 'words' },
      { words: editor.getWordCount(), characters: editor.getCharacterCount() },
    )
    goalHost.textContent = `${progress.label} (${progress.percent}%)`
  }

  // ------------------------------------------------------------------ output

  function renderOutput(): void {
    const output = layout.output
    if (!output) return
    output.textContent = serializeToHTMLDocument(editor.state.doc, {
      title: 'Trevixal document',
      baseURL: window.location.origin,
      inlineCSS: collectDocumentCSS(),
      // The pane shows the file a download would produce, theme and all.
      theme: editorTheme(editor),
      styleSheets: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
        (link) => link.getAttribute('href') ?? '',
      ),
    })
  }

  // -------------------------------------------------------------- the chrome

  // Dictation and read-aloud, where the browser has the Web Speech API. Each
  // start and stop refreshes the menus, so their ticks follow.
  const speech = createSpeech(editor, { onChange: () => ui.toolbar.refresh() })
  disposers.push(() => speech.destroy())

  // The writing assistant's provider: the host's, the in-page rules, or none.
  const writingProvider =
    options.writingProvider === null ? null : (options.writingProvider ?? createRulesProvider())

  // ---------------------------------------------------------------- language

  const loaders = options.languages ?? {}
  /** The chrome's languages this host can load; English only has a place beside another. */
  const languageCodes = UI_LANGUAGES.map((entry) => entry.code).filter((code) =>
    code === 'en' ? Object.keys(loaders).length > 0 : code in loaders,
  )
  let language = 'en'

  /** Show the chrome in a language, loading its catalogue first, and remember it. */
  async function switchLanguage(code: string): Promise<void> {
    const entry = UI_LANGUAGES.find((candidate) => candidate.code === code)
    const load = loaders[code]
    if (!entry || (code !== 'en' && !load)) return
    let messages: Messages | undefined
    try {
      messages = load ? await load() : undefined
    } catch {
      await openInfoDialog({
        document,
        title: 'Language not available',
        body: `The ${entry.name} labels could not be loaded, so the menus stay as they are.`,
      })
      return
    }
    ui.setLanguage({ code, direction: entry.direction, messages })
    language = code
    remember({ language: code === 'en' ? undefined : code })
  }

  /**
   * Every group the toolbar was built with, known once it is. The menus ask
   * which preset is on while they are being built, before the toolbar is.
   */
  let toolbarGroupNames: readonly string[] = []

  /** The preset the toolbar's shown groups match, if they match one. */
  function activeToolbarPreset(): ToolbarPreset | null {
    const all = toolbarGroupNames
    if (all.length === 0) return null
    const shown = preferences.toolbarGroups ?? all
    const presets: readonly ToolbarPreset[] = ['minimal', 'writing', 'developer', 'full']
    const matches = (preset: ToolbarPreset): boolean => {
      const groups = toolbarPresetGroups(preset, all)
      return groups.length === shown.length && groups.every((name) => shown.includes(name))
    }
    return presets.find(matches) ?? null
  }

  let readOnly = false
  let spellcheckOn = true
  let writingOn = true

  /** Every check Tools ▸ Check writing can turn on, in the order the menu lists them. */
  const WRITING_CHECKS = [
    'grammar',
    'passive',
    'repeat',
    'long',
    'inclusive',
    'tone',
    'cliche',
  ] as const

  const ui = createEditorUI(editor, {
    container: chromeHost,
    toolbar: {
      reorderable: true,
      groupOrder: preferences.toolbarOrder,
      onReorder: (order) => remember({ toolbarOrder: order }),
      blockCommands: blockUICommands(),
      codeFormatCommands: codeFormatUICommands(),
      onFormatPainter: (_editor, event) => {
        if (event.detail > 1) return
        if (painter.state.armed) painter.apply()
        else painter.copy()
      },
      formatPainterState: () => ({
        armed: painter.state.armed,
        locked: painter.state.locked,
        description: painter.state.format ? describeFormat(painter.state.format) : null,
      }),
      onToggleTableOfContents: () => togglePanel(tocPanel),
      onToggleOutline: () => togglePanel(outlinePanel),
      onCommandPalette: () => palette.open(),
      onToggleFocusMode: () => focus.toggle(),
      onToggleFullscreen: () => void fullscreen.toggle(),
      // Collected as the "+" opens, from the menus as wired: everything under
      // Insert, and a table, which Insert leaves to the Table menu.
      quickAccess: {
        tracker: usage,
        insertItems: () =>
          quickInsertItemsFromMenus(
            ui.menus.flatMap((menu) => {
              if (menu.name === 'insert') return [menu]
              if (menu.name !== 'table') return []
              return [{ ...menu, items: menu.items.filter((item) => item.name === 'insertTable') }]
            }),
          ),
      },
    },
    tableCommands: {
      ...tableUICommands({ editor }),
      toggleTableTool: (tool) => tableTools.toggle(tool),
      activeTableTool: () => tableTools.tool,
    },
    blockCommands: blockUICommands(),
    codeFormatCommands: codeFormatUICommands(),
    embedCommands: {
      ...embedUICommands(),
      pickAttachment: () => files.pickFiles(),
      recordAudio: () => {
        void openAudioRecorder(document).then(async (recording) => {
          editor.view?.focus()
          if (!recording) return
          const stored = await storage.upload(recording.file, {})
          editor.exec(
            insertAudio({
              src: stored.url,
              waveform: recording.waveform,
              title: `Recording, ${formatTime(recording.seconds)}`,
            }),
          )
        })
      },
    },
    mathCommands: mathUICommands(),
    diagramCommands: diagramUICommands(),
    codeCommands: { insertTerminal, insertCodeDiff, insertRunnableCode },
    securityCommands: {
      toggleRedaction,
      lockSection,
      manageLockedSections: () => void security.manageLockedSections(),
      lockNow: () => void security.lockNow(),
    },
    // Quick Parts, kept with the preferences: Insert ▸ Snippet, and their
    // abbreviations expanding as they are typed.
    snippets: {
      list: () => preferences.snippets ?? [],
      save: (snippets) => remember({ snippets }),
    },
    workspaceCommands: { includeDocument: () => void workspace.includeDocument() },
    images: {
      pickFiles: () => images.pickFiles(),
      insertImage: (attrs) => images.insertImage(attrs),
      pickGallery: () => images.pickFiles({ gallery: true }),
      capturePhoto: () => {
        void capturePhoto(document).then((file) => {
          editor.view?.focus()
          if (file) void images.uploadFiles([file])
        })
      },
      captureScreen: () => {
        void captureScreen(document).then((file) => {
          editor.view?.focus()
          if (file) void images.uploadFiles([file])
        })
      },
      insertDrawing: () => {
        void openDrawingEditor(document).then((data) => {
          editor.view?.focus()
          if (data) editor.exec(insertDrawing(data))
        })
      },
    },
    shortcutLabels: shortcuts.labels(),
    links: {
      checkURL: options.checkLinkURL === null ? undefined : (options.checkLinkURL ?? reachableURL),
    },
    fileActions: {
      newDocument: () => void newDocument(),
      openDocument: () => void openDocument(),
      saveDocument: () => void saving.autosave.flush(),
      downloadAs: (format) => void download(format),
      importDocument: () => void openDocument(),
      exportSelection: () => void download('html', true),
      printPreview: () => print(true),
      exportPDF: () => print(false),
      backups: () => void saving.openBackups(),
      saveVersion: () => void askVersionName(),
      compareWithFile: () => void compareWithFile(),
      importFromURL: () => void importFromURL(),
      exportFolder: () => void workspace.store().then((store) => exportFolder(store)),
      protectDocument: () => void protectDocument(),
      documentRestrictions: () => void editRestrictions(),
      signDocument: () => void trust.signDocument(),
      addPasskey: () => void trust.addPasskey(),
    },
    viewActions: {
      setTheme: (theme) => chrome.theme.setMode(theme),
      setThemePreset: (preset) => chrome.theme.setPreset(preset),
      customTheme: () =>
        void askCustomTheme(chrome.theme, (preset) =>
          remember({ customTheme: serializeTheme(preset) }),
        ),
      importTheme: () =>
        void importTheme(chrome.theme).then((preset) => {
          if (preset) remember({ customTheme: serializeTheme(preset) })
        }),
      exportTheme: () => exportTheme(chrome.theme),
      toggleDocumentTheme: () =>
        editor.exec(
          setDocumentTheme(documentTheme(editor.state.doc) ? null : currentTheme(chrome.theme)),
        ),
      documentFonts: () => void askDocumentFonts(editor, chrome.fonts),
      toggleReducedMotion: () => {
        remember({ reducedMotion: preferences.reducedMotion !== true })
        applyReadingPreferences()
      },
      toggleDyslexiaFont: () => {
        remember({ dyslexiaFont: preferences.dyslexiaFont !== true })
        applyReadingPreferences()
      },
      setLanguage: (code) => void switchLanguage(code),
      languages: languageCodes,
      activeLanguage: () => language,
      setToolbarPreset: (preset) => {
        const visible = toolbarPresetGroups(preset, toolbarGroupNames)
        ui.toolbar.setVisibleGroups(visible)
        remember({ toolbarGroups: visible, toolbarOrder: visible })
      },
      activeToolbarPreset: () => activeToolbarPreset(),
      customCSS: () => void askCustomCSS(chrome.styles, (css) => remember({ customCSS: css })),
      manageFonts: () => void askFont(chrome.fonts, () => ui.toolbar.refresh()),
      setWidth: (width) => setEditorWidth(editorShell, width),
      toggleFocusMode: () => focus.toggle(),
      toggleTypewriter: () => typewriter.toggle(),
      toggleFullscreen: () => void fullscreen.toggle(),
      togglePageMode: () => chrome.page.toggle(),
      toggleTableOfContents: () => togglePanel(tocPanel),
      toggleOutline: () => togglePanel(outlinePanel),
      toggleStylesPane: () => togglePanel(layout.styles),
      // The history toggle shows and hides its own section as it builds and
      // drops the panel; toggling the section again would undo that.
      toggleHistoryPanel: () => {
        toggleHistory()
        fitSidebar()
      },
      toggleWorkspace: () => {
        togglePanel(workspacePanel)
        if (!workspacePanel.hidden && !workspace.isOpen()) void workspace.open()
      },
      toggleSplitPreview: () => panes.togglePreview(),
      toggleSplitEditor: () => panes.toggleMirror(),
      insertEmoji: () => void suggestions.pickEmoji(),
      toggleReadOnly: () => {
        readOnly = !readOnly
        // The core view owns editability; there is no permission layer above it.
        editor.setEditable(!readOnly)
      },
      toggleTrackChanges: () => {
        if (track.isEnabled) track.disable()
        else track.enable()
      },
      toggleSourceMode: (format) => {
        chrome.source.setFormat(format)
        chrome.source.toggle()
      },
      showWritingStats: () => void showStats(),
      setWritingGoal: () => void askGoal(),
      toggleWritingAssistant: () => {
        writingOn = !writingOn
        for (const kind of WRITING_CHECKS) writing.setEnabled(kind, writingOn)
      },
      toggleWritingCheck: (kind) => writing.setEnabled(kind, !writing.isEnabled(kind)),
      toggleReadingHeatmap: () => heatmap.toggle(),
      addComment: () => void askComment(),
      present: () => void openPresentation(editor),
      showAuditLog: () => void trust.showAuditLog(),
      insertFormField: (kind) =>
        void askNewField(kind).then((field) => {
          editor.view?.focus()
          if (field) editor.exec(insertFormField(field))
        }),
      mailMerge: () => void mailMerge(),
      ...(speech.canDictate ? { toggleDictation: () => speech.toggleDictation() } : {}),
      ...(speech.canReadAloud ? { toggleReadAloud: () => speech.toggleReadAloud() } : {}),
      ...(writingProvider
        ? {
            assist: (action) => void runAssist(editor, writingProvider, action),
            assistActions: writingProvider.actions,
          }
        : {}),
      toggleComments: () => togglePanel(layout.comments),
      checkAccessibility: () => void showAccessibilityReport(editor),
      findDuplicateText: () => void showDuplicateText(editor, workspace),
      isWritingCheckEnabled: (kind) => writing.isEnabled(kind),
      toggleSmartTypography: () =>
        remember({ smartTypography: preferences.smartTypography === false }),
      toggleAutocorrect: () => remember({ autocorrect: preferences.autocorrect === false }),
      setKeyPreset,
      activeKeyPreset: () => keyPreset,
      autocorrectOptions: () => void askAutocorrect(),
      toggleSpellcheck: () => {
        spellcheckOn = !spellcheckOn
        setSpellcheck(editor, spellcheckOn)
      },
      // Read back from the surface rather than the local flag, so the menu
      // cannot drift out of step with the attribute that does the work.
      isSpellcheckEnabled: () => isSpellcheckEnabled(editor),
      // What every View entry reports back. Each answer is read from the thing
      // that actually holds the state, the panel's own `hidden`, the live
      // controller, the surface's attribute, rather than from a flag kept
      // beside it, so a menu tick cannot disagree with the editor.
      isViewToggleOn: (toggle) => {
        switch (toggle) {
          case 'focusMode':
            return focus.isActive
          case 'typewriterMode':
            return typewriter.isActive
          case 'fullscreen':
            return fullscreen.isFullscreen
          case 'pageMode':
            return chrome.page.mode === 'paged'
          case 'tableOfContents':
            return !tocPanel.hidden
          case 'documentOutline':
            return !outlinePanel.hidden
          case 'historyPanel':
            return !historyPanel.hidden
          case 'workspacePanel':
            return !workspacePanel.hidden
          case 'splitPreview':
            return panes.isPreviewOpen()
          case 'splitEditor':
            return panes.isMirrorOpen()
          case 'readOnly':
            return !editor.isEditable
          case 'trackChanges':
            return track.isEnabled
          case 'writingAssistant':
            return writingOn
          case 'stylesPane':
            return !layout.styles.hidden
          case 'smartTypography':
            return preferences.smartTypography !== false
          case 'autocorrect':
            return preferences.autocorrect !== false
          case 'documentTheme':
            return documentTheme(editor.state.doc) !== null
          case 'reducedMotion':
            return preferences.reducedMotion === true
          case 'dyslexiaFont':
            return preferences.dyslexiaFont === true
          case 'readingHeatmap':
            return heatmap.isShown
          case 'commentsPanel':
            return !layout.comments.hidden
          case 'dictation':
            return speech.isDictating
          case 'readAloud':
            return speech.isReading
          default:
            return false
        }
      },
      activeWidth: () => {
        const width = editorShell.dataset.trevixalWidth
        return width === 'narrow' || width === 'wide' || width === 'full' ? width : 'normal'
      },
      // One answer for both theme lists: the preset wins when there is one,
      // because that is what the reader is looking at.
      activeTheme: () => {
        const preset = chrome.theme.preset
        if (preset) return `theme${preset.charAt(0).toUpperCase()}${preset.slice(1)}`
        const mode = chrome.theme.mode
        return `theme${mode.charAt(0).toUpperCase()}${mode.slice(1)}`
      },
      activeSourceMode: () => (chrome.source.isActive ? chrome.source.format : null),
      customizeToolbar: () => {
        void openCustomizeToolbarDialog({
          document,
          groups: ui.toolbar.groups,
          visible: ui.toolbar.getGroupOrder(),
          onApply: (visible) => {
            ui.toolbar.setVisibleGroups(visible)
            remember({ toolbarGroups: visible, toolbarOrder: visible })
          },
        })
      },
      openCommandPalette: () => palette.open(),
      copyCode: (target) => {
        const block = target.state.doc
        void copyToClipboard(document, block.textContent)
      },
      formatPainter: () => painter.copy(),
      showKeyboardShortcuts: () => void shortcuts.openDialog(document),
      showAbout: () => {
        void openInfoDialog({
          document,
          title: 'About Trevixal',
          body: 'A modular rich-text editor built from a small immutable core.',
          rows: [...DEFAULT_ABOUT_ROWS, ...(options.aboutRows ?? [])],
        })
      },
    },
  })

  toolbarGroupNames = ui.toolbar.groups.map((group) => group.name)
  // The language chosen last time, loaded as the page opens.
  if (preferences.language) void switchLanguage(preferences.language)

  // Every group is built, the hidden ones too, so Customize toolbar can bring
  // one back on the spot rather than reloading the page to build it.
  const savedGroups = preferences.toolbarGroups
  if (savedGroups) {
    ui.toolbar.setVisibleGroups(
      ui.toolbar.getGroupOrder().filter((name) => savedGroups.includes(name)),
    )
  }

  // ------------------------------------------------------- floating controls

  const floating = createFloatingControls(editor, editorHost, images)

  // ---------------------------------------------------------- toolbar wiring

  // Double-click locks the format painter on; Escape cancels it.
  ui.toolbar.element
    .querySelector('[data-trevixal-item="formatPainter"]')
    ?.addEventListener('dblclick', () => painter.copyAndLock())
  const cancelPainter = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') painter.cancel()
  }
  document.addEventListener('keydown', cancelPainter)

  // ---------------------------------------------------------------- startup

  renderOutput()
  refreshStatus()
  togglePanel(tocPanel)
  togglePanel(outlinePanel)
  disposers.push(createOfflineIndicator(layout.offline))

  // The tab strip is otherwise invisible until someone finds View ▸ Documents,
  // which hides the whole workspace from anyone not looking for it. Once the
  // store holds more than one document there is something to switch between,
  // so the strip opens itself.
  void workspace.store().then((store) => {
    if (store.list().length < 2) return
    void workspace.open()
  })

  // Offer the draft last, so it wins over the seeded document if it is newer.
  void saving.recover()

  let destroyed = false
  return {
    editor,
    layout,
    ui,
    destroy() {
      if (destroyed) return
      destroyed = true
      document.removeEventListener('keydown', cancelPainter)
      // Panes first: each holds a second editor or an iframe on this document,
      // and tearing the document down under them is what leaves a detached
      // surface still listening.
      panes.destroy()
      security.release()
      // Everything built above, written out rather than collected as it was
      // made, because the order matters in places and because a part left off
      // this list is a listener or a timer that outlives the page, which is
      // exactly the bug `destroy` exists to stop. A framework that unmounts
      // and mounts again, as React's strict mode does on every first render,
      // finds it immediately.
      for (const part of [
        diagrams,
        writingUI,
        writing,
        contents,
        outline,
        stylesPane,
        reviewBar,
        floating,
        suggestions.slashPopup,
        suggestions.emojiPopup,
        images,
        files,
        // `track` and `painter` are not here, and need not be: neither owns a
        // listener or a timer of its own, one is marks on the document, the
        // other a copied format, and both go with the editor below.
        chrome.theme,
        chrome.fonts,
        chrome.styles,
        chrome.page,
        chrome.source,
        focus,
        fullscreen,
        typewriter,
        shortcuts,
        palette,
        workspace,
        saving.autosave,
        ui,
      ]) {
        part?.destroy()
      }
      for (const dispose of disposers.splice(0)) dispose()
      editor.destroy()
      layout.destroy()
    },
  }
}
