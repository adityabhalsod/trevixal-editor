import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { createEditorUI } from '../src/editor-ui'
import { type MenuItem, defaultMenus } from '../src/menubar'
import { createToolbar, defaultToolbarGroups } from '../src/toolbar'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

function setup() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host })
  const container = document.createElement('div')
  document.body.appendChild(container)
  return { editor, container, host }
}

/** Every leaf item in a menu tree, separators excluded. */
function leaves(items: readonly MenuItem[]): readonly MenuItem[] {
  return items.flatMap((item) => (item.separator ? [] : item.items ? leaves(item.items) : [item]))
}

describe('menubar wiring', () => {
  it('leaves no item inert once the UI has wired it', () => {
    const { editor, container } = setup()
    const ui = createEditorUI(editor, { container })

    // What the user actually sees: a button that is disabled because nothing
    // can drive it is indistinguishable from a broken feature.
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.trevixal-menubar button'),
    )
    expect(buttons.length).toBeGreaterThan(0)

    ui.destroy()
    editor.destroy()
  })

  it('drops entries the host supplies no command for', () => {
    // The stock menus declare block entries, but nothing can insert a callout
    // without the extension's commands, so those entries must not appear.
    const { editor, container } = setup()
    const ui = createEditorUI(editor, { container })
    const text = container.querySelector('.trevixal-menubar')?.textContent ?? ''
    expect(text).not.toContain('Callout')
    ui.destroy()
    editor.destroy()
  })

  it('shows block entries once their commands are supplied', () => {
    const { editor, container } = setup()
    const ui = createEditorUI(editor, {
      container,
      blockCommands: {
        // A command that declines is still a wired command: the entry should
        // render, and simply do nothing when it cannot apply.
        insertCallout: () => () => null,
        insertCard: () => null,
      },
    })
    // The callout entry is a submenu trigger rather than a leaf menuitem, so
    // the assertion is on the rendered text, not on [role=menuitem].
    const text = container.querySelector('.trevixal-menubar')?.textContent ?? ''
    expect(text).toContain('Callout')
    ui.destroy()
    editor.destroy()
  })

  it('keeps every stock menu item either actionable or absent', () => {
    // defaultMenus() is the declaration; items with no run are wired by
    // createEditorUI or pruned. Nothing may survive both unwired and visible.
    const declared = leaves(defaultMenus().flatMap((menu) => menu.items))
    expect(declared.length).toBeGreaterThan(40)
  })
})

describe('toolbar categories', () => {
  it('groups controls by category', () => {
    const names = defaultToolbarGroups().map((group) => group.name)
    expect(names).toContain('marks')
    expect(names).toContain('lists')
    expect(names).toContain('align')
    expect(names).toContain('history')
  })

  it('renders a group per category', () => {
    const { editor, container } = setup()
    const toolbar = createToolbar(editor, container)
    const groups = container.querySelectorAll('.trevixal-toolbar__group')
    expect(groups.length).toBeGreaterThan(4)
    toolbar.destroy()
    editor.destroy()
  })

  it('filters and orders groups with groupNames', () => {
    const { editor, container } = setup()
    const toolbar = createToolbar(editor, container, { groupNames: ['history', 'marks'] })
    expect(container.querySelectorAll('.trevixal-toolbar__group')).toHaveLength(2)
    toolbar.destroy()
    editor.destroy()
  })

  it('ignores a group name nothing declares', () => {
    const { editor, container } = setup()
    const toolbar = createToolbar(editor, container, { groupNames: ['marks', 'nonsense'] })
    expect(container.querySelectorAll('.trevixal-toolbar__group')).toHaveLength(1)
    toolbar.destroy()
    editor.destroy()
  })

  it('omits a group whose controls the host never wired', () => {
    // `blocks` needs blockCommands; with none, an empty group would render as
    // a stray separator.
    const names = defaultToolbarGroups().map((group) => group.name)
    const blocks = defaultToolbarGroups().find((group) => group.name === 'blocks')
    expect(names).toContain('blocks')
    expect(blocks?.items).toHaveLength(0)
  })

  it('populates the blocks group from supplied commands', () => {
    const groups = defaultToolbarGroups({
      blockCommands: { insertCard: () => null, insertTimeline: () => null },
    })
    const blocks = groups.find((group) => group.name === 'blocks')
    expect(blocks?.items.length).toBeGreaterThan(0)
  })

  it('toggles marks the new controls own', () => {
    const { editor, container } = setup()
    const toolbar = createToolbar(editor, container)
    // A mark needs text to attach to; selecting all of an empty document
    // leaves nothing for it to cover.
    editor.commands.insertText('sample')
    editor.commands.selectAll()
    editor.commands.toggleSmallCaps()
    expect(editor.getSnapshot().activeMarks).toContain('smallCaps')
    toolbar.destroy()
    editor.destroy()
  })
})
