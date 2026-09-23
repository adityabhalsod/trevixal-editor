# The UI kit

`@trevixal/ui` is the editing chrome: menubar, toolbar, dialogs, status bar,
popups, panels, persistence, theming and export plumbing. It is entirely
optional, and it depends on **none** of the extension packages.

## Assembling the chrome

`createEditorUI` mounts the menubar, toolbar, dialogs and status bar, wired to
the editor. You pass in the capabilities you have, and **menu entries whose
action you have not supplied are dropped from the menus** rather than left
disabled. A menu entry that seems to have vanished is almost always this, not
a CSS bug.

```ts
import { createEditorUI } from '@trevixal/ui'
import { tableUICommands } from '@trevixal/extension-table'
import { blockUICommands } from '@trevixal/extension-blocks'
import { embedUICommands } from '@trevixal/extension-embed'
import { mathUICommands } from '@trevixal/extension-math'
import { diagramUICommands } from '@trevixal/extension-diagram'
import { codeFormatUICommands } from '@trevixal/extension-format-code'

const ui = createEditorUI(editor, {
  container: document.querySelector('#chrome'),
  tableCommands: tableUICommands(),           // Table menu + grid picker
  blockCommands: blockUICommands(),           // callouts, columns, tabs, ...
  embedCommands: embedUICommands(),           // video, audio, embeds, cards
  mathCommands: mathUICommands(),             // equations
  diagramCommands: diagramUICommands(),       // Insert > Diagram
  codeFormatCommands: codeFormatUICommands(), // Format JSON / XML, Minify
  images: { pickFiles: () => images.pickFiles(), insertImage: (a) => images.insertImage(a) },
  fileActions: { saveDocument, openDocument, downloadAs, importDocument },
  viewActions: { setTheme, toggleFocusMode, toggleReadOnly },
  shortcutLabels: shortcuts.labels(),         // what the menus print
})

ui.menus       // the wired menu tree, feed it to the command palette
ui.toolbar
ui.statusBar
ui.findReplace
ui.openLinkDialog()
```

### The host contracts

| Option | Type | Drives |
| --- | --- | --- |
| `tableCommands` | `TableCommands` | The Table menu and grid: `insertTable(rows, cols)` plus optional row, column, merge, split, header and delete commands, `setCellAlign`, `setCellBackground`, `setTableBorders`, `setTableBorderColor`, `sortAscending` / `sortDescending`, `convertTextToTable`, `convertTableToText`, `insertTableFromCSV`, `csvAtSelection`, `distributeColumns`, `clearSizing` |
| `images` | `ImageActions` | `pickFiles()`, `insertImage({ src, alt?, title? })`: the image button and dialog |
| `blockCommands` | from `blockUICommands()` | Insert > Callout, Toggle, Columns, Card, Timeline, Tabs, Accordion, Badge, Button, Anchor, Footnote, Citation, References, Page break |
| `embedCommands` | `EmbedCommands` | `insertEmbed(url)`, `insertVideo`, `insertAudio`, `insertIframe`, `insertLinkCard`, `pickAttachment` |
| `mathCommands` | `MathCommands` | `insertMath(latex)`, `insertMathBlock(latex)` |
| `diagramCommands` | `DiagramCommands` | `insertDiagram(code?)` |
| `codeFormatCommands` | from `codeFormatUICommands()` | Format JSON, Format XML, Minify |
| `fileActions` | `FileActions` | `newDocument`, `openDocument`, `saveDocument`, `downloadAs(format)`, `importDocument`, `exportSelection`, `printPreview`, `exportPDF` (File > Print... runs it too; a host without one still prints the document alone, never the page around it), `backups`, `protectDocument`, `documentRestrictions` |
| `viewActions` | `ViewActions` | Theme (`setTheme`, `setThemePreset`, `customTheme`, `customCSS`, `manageFonts`), modes (`toggleFocusMode`, `toggleTypewriter`, `toggleFullscreen`, `togglePageMode`), panels (`toggleTableOfContents`, `toggleOutline`, `toggleHistoryPanel`, `toggleWorkspace`, `toggleSplitPreview`, `toggleSplitEditor`), `toggleReadOnly`, `toggleTrackChanges`, `setWidth`, `openCommandPalette`, `copyCode`, `formatPainter`, `insertEmoji`, `toggleSourceMode('markdown' \| 'html')`, writing (`showWritingStats`, `setWritingGoal`, `toggleWritingAssistant`, `toggleWritingCheck(kind)`, `isWritingCheckEnabled`, `toggleSpellcheck`, `isSpellcheckEnabled`), `customizeToolbar`, `showKeyboardShortcuts`, `showAbout`, and the state readbacks `isViewToggleOn(toggle)`, `activeWidth()`, `activeTheme()`, `activeSourceMode()` that put a tick beside whatever is currently on |
| `menus`, `toolbar`, `showMenubar`, `showStatusBar`, `shortcutLabels`, `messages` | | Replace the menu tree, pass `ToolbarOptions`, hide pieces, print the shortcut manager's labels, translate |

### Menus that report state

An entry that switches something on shows a tick while it is on, and says so
through `aria-checked`. The chrome the entry drives belongs to the host, so
only the host can answer for it:

```ts
viewActions: {
  toggleFocusMode: () => focus.toggle(),
  isViewToggleOn: (toggle) => (toggle === 'focusMode' ? focus.isActive : false),
  activeWidth: () => currentWidth,   // the four width entries as one radio group
  activeTheme: () => 'themeDark',    // and the theme entries as another
}
```

Leave a question unanswered and the entry stays a plain command. The state is
recomputed as the menu opens, not on the next transaction, because half of
what these entries report is chrome and none of that changes the document.

## Piece by piece

Every part is available on its own, and layouts are data:

```ts
import { createToolbar, defaultToolbarGroups } from '@trevixal/ui'

createToolbar(editor, container, {
  groups: [
    ...defaultToolbarGroups().filter((group) => group.name !== 'color'),
    {
      name: 'custom',
      items: [{ name: 'shout', label: 'Shout', icon: 'bold', run: (e) => e.commands.insertText('!!!') }],
    },
  ],
  reorderable: true,
  groupOrder: savedOrder,                   // restores a remembered order without hiding new groups
  onReorder: (order) => remember(order),
})
```

| Area | Exports |
| --- | --- |
| Chrome | `createEditorUI`, `createMenubar` + `defaultMenus`, `createToolbar` + `defaultToolbarGroups` + `defaultToolbarItems`, `createStatusBar` |
| Controls | `createSelectControl`, `createColorControl` (`DEFAULT_SWATCHES`), `createTableGridControl`, `defaultBlockFormats`, `defaultFontFamilies`, `defaultFontSizes` (8 to 48 pt), `applyBlockFormat`, `blockFormatValue` |
| Primitives | `createDropdown`, `bindListNavigation`, `focusFirstItem`, `createIcon` + `iconNames()` (154 icons) |
| Popups and dialogs | `createSuggestionPopup`, `openDialog`, `openConfirmDialog`, `openInfoDialog`, `openCharacterPicker` (`SPECIAL_CHARACTERS`) |
| Code | `createCodeLanguageSelect` (floating picker with detection), `createTableToolbar` (floating table controls) |
| Navigation | `createTableOfContents`, `createDocumentOutline` + `defaultOutlineBlockKinds`, `createFindReplace` + `compileSearch` + `findAll`, `createCommandPalette` + `paletteCommandsFromMenus` + `filterCommands` + `fuzzyScore`, `createHistoryPanel` |
| Shortcuts | `createShortcutManager({ actions, overrides?, onChange?, scopes?, isMac? })`, `openShortcutsDialog`, `formatShortcut`, `parseShortcut` |
| View modes | `createFocusMode`, `createTypewriter`, `createFullscreenToggle`, `setEditorWidth` + `EDITOR_WIDTHS` (narrow 38rem, normal 48rem, wide 64rem, full) |
| Files | `builtinExporters({ scripts? })` (html, markdown, text, json), `builtinImporters()`, `exportDocument`, `importFile`, `importerFor`, `acceptFor`, `pickFile`, `readFileText`, `downloadFile`, `suggestFileName`, `documentTitle`, `selectionDocument`, `textToDocument`, `printDocument`, `openPrintPreview`, `printableHTML`, `editorTheme` |
| Source modes | `createSourceMode(editor, { format: 'markdown' \| 'html' })` |
| Persistence | `createAutosave(editor, { storage, key?, delayMs?, backups?: { intervalMs?, keep? } \| false, onState? })`, `createAutosaveIndicator`, `offerDraftRecovery`, `openBackupsDialog`, `createWebStorage`, `createMemoryStorage`, `formatSavedAt` |
| Theming | `createThemeController(document, { targets?, mode?, preset?, presets?, onChange? })`, `defaultThemePresets`, `buildCustomTheme` + `CUSTOM_THEME_TOKENS`, `readThemeSnapshot`, `createFontManager` + `googleFontURL`, `createCustomStyles` + `scopeCSS`, `createPageView` + `PAGE_SIZES`, `parseColor`, `isDarkColor`, `mixColors` |
| Quick tools | `createQuickInsertControl`, `createRecentToolsControl`, `createToolUsageTracker`, `openCustomizeToolbarDialog`, `applyGroupOrder`, `bindGroupReorder`, `groupOrder` |
| Export support | `collectDocumentCSS`, `captureRenderedBlocks`, `rasterizeDiagrams`, `renderedNodeHTML`, `documentBehaviourScript` |
| Translation | `defaultMessages()`, the `messages` option |

## Translation

Every label the chrome renders goes through a catalogue keyed by what the
thing *is*, not by the English it happens to use:

```ts
createEditorUI(editor, {
  container,
  messages: { 'menu.file': 'Fichier', 'toolbar.bold': 'Gras' },
})
```

Anything you leave out keeps its English, so a partial catalogue is a working
one. `defaultMessages()` returns every key with the text it would otherwise
show (268 keys); print it to see what there is to translate. It is derived
from the menus and toolbar rather than written out beside them, so the key
list is complete by construction. Keying on names rather than English is the
point: a catalogue keyed on the words breaks the day somebody rewords a label,
and breaks silently.

## Accessibility

WAI-ARIA menubar and toolbar patterns: roving tabindex, arrow-key navigation,
`aria-pressed` and `aria-checked` state, `Escape` to dismiss, and controls
that never steal focus from the editor. Toolbar grips work from the keyboard
too: `Space` picks a group up, the arrow keys move it, `Enter` drops it,
`Escape` puts it back, and a live region announces each step. The browser
suite runs an axe-core audit over the editor and its chrome on load, with a
menu open, with a dialog open, and in the dark theme with contrast included.

## The worked example

[`@trevixal/editor-kit`](../guide/full-editor) is the complete worked example
of everything above: its `mount.ts`
wires the editor and its chrome, and the files beside it hold the shortcut
table, the security wiring, the suggestion menus, the floating controls, the
file actions, the split panes and the workspace.
