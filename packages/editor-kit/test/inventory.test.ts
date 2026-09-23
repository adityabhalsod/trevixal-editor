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
    File: 15,
    Edit: 12,
    Insert: 35,
    Format: 20,
    Tools: 21,
    Table: 27,
    View: 22,
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
    toolbarGroups: 13,
    toolbarItems: 62,
    everythingNamed: 311,
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
 * These ten are separate calls in the body of the mount, and nothing else in
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
    imageToolbar: count('.trevixal-image-toolbar'),
    imageResizeHandles: count('.trevixal-image-handles__handle'),
    codeLanguageSelect: count('.trevixal-codelang'),
  }).toEqual({
    suggestionPopups: 2,
    bubbleMenu: 1,
    linkPopover: 1,
    blockDragHandle: 1,
    tableToolbar: 1,
    tableResizeGuide: 1,
    tableResizeCorner: 1,
    imageToolbar: 1,
    imageResizeHandles: 4,
    codeLanguageSelect: 1,
  })
})
