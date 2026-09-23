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
  FormatPainter,
  createEditor,
  describeFormat,
  mergeKeymaps,
  paragraphCount,
  sentenceCount,
  serializeToHTMLDocument,
} from '@trevixal/core'
import {
  blockBindings,
  blockKeymap,
  blockUICommands,
  installFieldUpdater,
} from '@trevixal/extension-blocks'
import {
  codeHighlight,
  copyToClipboard,
  createHighlighter,
} from '@trevixal/extension-code-highlight'
import { createMermaidRenderer, diagram, diagramUICommands } from '@trevixal/extension-diagram'
import { attachments, embedUICommands } from '@trevixal/extension-embed'
import { codeFormatUICommands } from '@trevixal/extension-format-code'
import {
  type ImageStorage,
  createDataURLStorage,
  createFallbackStorage,
  createFetchStorage,
  image,
} from '@trevixal/extension-image'
import { mathUICommands } from '@trevixal/extension-math'
import {} from '@trevixal/extension-security'
import {
  createTableTools,
  enableCellSelection,
  highlightActiveCell,
  tableKeymap,
  tableUICommands,
} from '@trevixal/extension-table'
import { TrackChanges, createTrackChangesBar } from '@trevixal/extension-track-changes'
import {
  analyzeText,
  createWritingAssistant,
  createWritingInlineUI,
  goalProgress,
  isSpellcheckEnabled,
  setSpellcheck,
} from '@trevixal/extension-writing'
import {
  collectDocumentCSS,
  createCommandPalette,
  createDocumentOutline,
  createEditorUI,
  createFocusMode,
  createFullscreenToggle,
  createShortcutManager,
  createTableOfContents,
  createTypewriter,
  editorTheme,
  openConfirmDialog,
  openCustomizeToolbarDialog,
  openDialog,
  openInfoDialog,
  paletteCommandsFromMenus,
  quickInsertItemsFromMenus,
  setEditorWidth,
} from '@trevixal/ui'
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
import { createLayout } from './layout'
import { DEFAULT_ABOUT_ROWS, type FullEditor, type FullEditorOptions } from './options'
import { createSplitPanes } from './panes'
import { createFullSchema } from './schema'
import { createDocumentSecurity } from './security'
import { shortcutActions } from './shortcuts'
import { createSuggestionMenus } from './suggestions'
import { createDocumentWorkspace } from './workspace'

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

  const schema = createFullSchema()

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
    placeholder: options.placeholder ?? 'Write something…',
    onChange: () => {
      renderOutput()
      refreshStatus()
      options.onChange?.(editor)
    },
  })

  // ------------------------------------------------------- document extensions

  disposers.push(highlightActiveCell(editor))
  // Double click a cell to select it, drag to take in more. The highlighter
  // above is what makes the result visible.
  disposers.push(enableCellSelection(editor))
  // Table ▸ Draw table and Eraser: tools the pointer holds over the page.
  const tableTools = createTableTools(editor, { container: editorHost })
  disposers.push(() => tableTools.destroy())
  // One highlighter for every surface: a split pane installs the same one
  // rather than building a second with its own caches.
  const highlighter = createHighlighter({ autoDetect: true })
  disposers.push(codeHighlight(editor, highlighter))
  // Tabs and accordions write their folded state back into the document, so a
  // section left open is still open after a reload.
  disposers.push(blockBindings(editor))

  // Mermaid is fetched from a CDN the first time a diagram block renders, so
  // the page costs nothing until a diagram is actually used.
  let mermaidRenderer: ReturnType<typeof createMermaidRenderer> | null = null
  /** Shared, so a split pane draws through the same loaded Mermaid as the editor. */
  const renderDiagram: Parameters<typeof diagram>[1]['render'] = async (code, context) => {
    if (!mermaidRenderer) {
      const { loadMermaid } = await import('@trevixal/extension-diagram')
      mermaidRenderer = createMermaidRenderer(await loadMermaid())
    }
    const drawn = await mermaidRenderer(code, context)
    // A diagram that lands after the preview has rendered is a diagram the
    // preview does not have. Drawing one is not an edit, it appends an element
    // beside the block rather than changing the document, so nothing schedules
    // another render, and the pane would go on showing an empty plate until the
    // next keystroke happened to refresh it. Mermaid is fetched from a CDN on
    // first use, so this is the ordinary case on a cold load, not a rare one.
    panes.refreshPreview()
    return drawn
  }
  const diagrams = diagram(editor, { render: renderDiagram })

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
  let removeFieldUpdater = installFieldUpdater(editor)
  const stopFollowingTrackChanges = track.onEnabledChange(() => {
    removeFieldUpdater()
    removeFieldUpdater = installFieldUpdater(editor)
  })
  disposers.push(() => {
    stopFollowingTrackChanges()
    removeFieldUpdater()
  })
  const writing = createWritingAssistant(editor, { longSentences: true })
  // Point at any wavy underline for what was flagged; click it for the fix.
  // Ctrl+. opens the same menu for the issue under the caret.
  const writingUI = createWritingInlineUI(editor, writing)

  // ------------------------------------------------------------------ chrome

  const chrome = createChrome(editor, editorShell, layout.root, preferences, remember)
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
  const reviewBar = createTrackChangesBar(editor, track, { container: layout.review, author })

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
    layout.sidebar.hidden = layout.panels.every((section) => section.hidden)
  }

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
    flushAutosave: () => void saving.autosave.flush(),
    newDocument: () => void newDocument(),
    openDocument: () => void openDocument(),
    // Through the menu entry, which builds the bar on first use: asking for
    // `ui.findReplace` found nothing until the menu had, so Ctrl+F did nothing.
    openFindReplace: () => runMenuEntry('findReplace'),
    openLinkDialog: () => ui.openLinkDialog(),
    openPalette: () => palette.open(),
    pickEmoji: () => void suggestions.pickEmoji(),
    printDocument: (preview) => print(preview),
    protectDocument: () => void protectDocument(),
    toggleFocusMode: () => focus.toggle(),
    toggleFullscreen: () => void fullscreen.toggle(),
    toggleSplitEditor: () => panes.toggleMirror(),
  })

  const shortcuts = createShortcutManager(editor, {
    actions: shortcutList,
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

  const security = createDocumentSecurity({ editor, layout, saving })
  // Destructured so the menu and shortcut wiring below reads as it did when
  // these three were declared here.
  const { protectDocument, print } = security
  const editRestrictions = security.editRestrictions

  // ------------------------------------------------------------- file actions

  const { openDocument, download } = createFileActions(editor, security)

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

  let readOnly = false
  let spellcheckOn = true
  let writingOn = true

  /** Every check Tools ▸ Check writing can turn on, in the order the menu lists them. */
  const WRITING_CHECKS = ['grammar', 'passive', 'repeat', 'long'] as const

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
    embedCommands: { ...embedUICommands(), pickAttachment: () => files.pickFiles() },
    mathCommands: mathUICommands(),
    diagramCommands: diagramUICommands(),
    images: {
      pickFiles: () => images.pickFiles(),
      insertImage: (attrs) => images.insertImage(attrs),
    },
    shortcutLabels: shortcuts.labels(),
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
      protectDocument: () => void protectDocument(),
      documentRestrictions: () => void editRestrictions(),
    },
    viewActions: {
      setTheme: (theme) => chrome.theme.setMode(theme),
      setThemePreset: (preset) => chrome.theme.setPreset(preset),
      customTheme: () => void askCustomTheme(chrome.theme),
      customCSS: () => void askCustomCSS(chrome.styles, (css) => remember({ customCSS: css })),
      manageFonts: () => void askFont(chrome.fonts, () => ui.toolbar.refresh()),
      setWidth: (width) => setEditorWidth(editorShell, width),
      toggleFocusMode: () => focus.toggle(),
      toggleTypewriter: () => typewriter.toggle(),
      toggleFullscreen: () => void fullscreen.toggle(),
      togglePageMode: () => chrome.page.toggle(),
      toggleTableOfContents: () => togglePanel(tocPanel),
      toggleOutline: () => togglePanel(outlinePanel),
      toggleHistoryPanel: () => {
        toggleHistory()
        togglePanel(historyPanel)
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
      isWritingCheckEnabled: (kind) => writing.isEnabled(kind),
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
