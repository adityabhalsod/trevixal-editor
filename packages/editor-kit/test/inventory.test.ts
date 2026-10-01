import { afterEach, beforeEach, expect, test } from 'vitest'
import { mountFullEditor } from '../src/mount'
import type { FullEditor } from '../src/options'

let host: HTMLElement
let mounted: FullEditor | null = null

beforeEach(() => {
  window.localStorage.clear()
  document.body.replaceChildren()
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  mounted?.destroy()
  mounted = null
})

/**
 * Everything one call wires up, counted.
 *
 * The risk in reorganising `mountFullEditor` is not that the editor stops
 * opening, every other suite would catch that immediately, but that one
 * entry among three hundred quietly stops being registered. Nothing else
 * enumerates them, so this does.
 *
 * Read the numbers as a net rather than a specification: raise one
 * deliberately when something is genuinely added, and treat a fall as a
 * question to answer before going further.
 */
test('registers every menu and menu entry it did before', () => {
  mounted = mountFullEditor({ element: host })
  const menus = (mounted.ui.menus ?? []).map((menu) => [menu.label, menu.items.length] as const)

  expect(Object.fromEntries(menus)).toEqual({
    // Front matter..., Import from a web address..., Download a workspace
    // folder..., Save version..., Lock now, Unlock with a passkey... and Sign
    // document... among them.
    File: 23,
    // Paste special..., Go to... and Add caret at next match among them.
    Edit: 15,
    // Image gallery..., Camera photo..., Screenshot..., Drawing..., Record
    // audio... and Video chapters... among them; then Graphviz diagram,
    // PlantUML diagram and the Code submenu, Include from workspace...,
    // Snippet..., Margin note, Poll..., Map... and Show only when...; Import
    // sources... and the Citation style submenu; Comment... and the Form
    // field submenu.
    Insert: 63,
    // Document fonts... among them.
    Format: 32,
    // Check links..., Compare with a file..., Snippets..., Template
    // variables..., Redact selection, Lock selected blocks, Locked
    // sections..., Accessibility check..., Find duplicate text..., and the
    // Writing assistant, Macro and Key bindings submenus, and Audit log...,
    // among them; Mail merge....
    Tools: 39,
    // Insert caption..., Freeze header row, Freeze first column, Cell padding
    // and the rule before them. Then the data tools: Formula..., Column type,
    // Filter rows..., Show all rows, Hide column, Show hidden columns, Insert
    // chart and their rule.
    Table: 50,
    // The Toolbar presets, Reduce motion and Dyslexia-friendly font, and their
    // rule, the Comments panel and Present; Language only appears for a host
    // that passes catalogues.
    View: 28,
    Help: 3,
  })
})

test('renders the whole chrome, not just the menus', () => {
  mounted = mountFullEditor({ element: host })
  const count = (selector: string) => host.querySelectorAll(selector).length

  expect({
    menuTriggers: count('.trevixal-menubar__trigger'),
    toolbarGroups: count('[data-trevixal-group]'),
    toolbarItems: count('.trevixal-toolbar [data-trevixal-item]'),
    everythingNamed: count('[data-trevixal-item]'),
  }).toEqual({
    menuTriggers: 8,
    toolbarGroups: 14,
    toolbarItems: 65,
    // The five list tools under Format > Lists, and ten Table entries: the
    // three above, Top / Middle / Bottom and the four paddings. Then fourteen
    // more for the Table menu's data tools and their submenus, and nine for
    // media: the six Insert entries above and the image toolbar's Mark up,
    // Decorative and Gallery.
    // Then eleven for the developer tools: Front matter..., MDX (.mdx), the
    // Graphviz and PlantUML diagrams, the Code submenu's four and the Key
    // bindings submenu's three. Then four for the editing workflow: Import
    // from a web address..., Save version..., Include from workspace... and
    // Compare with a file.... Then seven for the keyboard: Paste special...,
    // Go to..., Add caret at next match, Snippet..., Snippets..., Record
    // macro and Play macro. Then five for the file formats: the one-file web
    // page, OpenDocument, EPUB and LaTeX downloads, and the folder download.
    // Then five for the advanced blocks: Margin note, Poll..., Map..., Show
    // only when... and Template variables....
    everythingNamed: 503,
  })
})

test('every menu entry that carries an action can be run', () => {
  mounted = mountFullEditor({ element: host })
  // An entry with no action is dropped by `createEditorUI` by design, so one
  // that survived into `ui.menus` and has neither an action nor a submenu
  // would be an entry that renders and does nothing.
  for (const menu of mounted.ui.menus ?? []) {
    for (const item of menu.items) {
      if (item.separator) continue
      const usable = Boolean(item.run ?? item.items ?? item.name)
      expect(usable, `${menu.label} ▸ ${item.label ?? '?'} does nothing`).toBe(true)
    }
  }
})

/**
 * The parts built by hand, outside the chrome literal.
 *
 * The two tests above count what `createEditorUI` builds from one object.
 * These eleven are separate calls in the body of the mount, and nothing else in
 * the package asserts they happened: a mount that quietly stopped installing
 * the bubble menu, or one of the two suggestion popups, would still pass
 * every other test here and show up only as a feature that does nothing.
 *
 * Each count is structural: corners of a resize frame, one popup per
 * trigger, so none of them moves when the seeded document changes.
 */
test('installs the suggestion popups and every floating control', () => {
  mounted = mountFullEditor({ element: host })
  const count = (selector: string) => document.querySelectorAll(selector).length

  expect({
    suggestionPopups: count('.trevixal-popup'),
    bubbleMenu: count('.trevixal-bubble'),
    linkPopover: count('.trevixal-linkpopover'),
    blockDragHandle: count('.trevixal-blockgrip'),
    tableToolbar: count('.trevixal-tabletoolbar'),
    tableResizeGuide: count('.trevixal-resize-guide'),
    tableResizeCorner: count('.trevixal-table-resize-handle'),
    tableDrawGuide: count('.trevixal-draw-guide'),
    imageToolbar: count('.trevixal-image-toolbar'),
    imageResizeHandles: count('.trevixal-image-handles__handle'),
    codeLanguageSelect: count('.trevixal-codelang'),
  }).toEqual({
    suggestionPopups: 3,
    bubbleMenu: 1,
    linkPopover: 1,
    blockDragHandle: 1,
    tableToolbar: 1,
    tableResizeGuide: 1,
    tableResizeCorner: 1,
    tableDrawGuide: 1,
    imageToolbar: 1,
    imageResizeHandles: 4,
    codeLanguageSelect: 1,
  })
})
