import { type Command, Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEditorUI } from '../src/editor-ui'
import {
  type TableToolbarCommands,
  createTableToolbar,
  openSplitCellsDialog,
} from '../src/table-toolbar'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

beforeEach(() => {
  document.body.innerHTML = ''
})

function mountEditor() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return { host, editor: createEditor({ schema, element: host }) }
}

/** The open dialog's column count, set and submitted. */
async function submitColumns(value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('.trevixal-dialog [name="columns"]')
  expect(input).not.toBeNull()
  if (input) input.value = value
  document
    .querySelector<HTMLFormElement>('.trevixal-dialog__form')
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  // The dialog resolves, then its caller runs the command.
  await Promise.resolve()
  await Promise.resolve()
}

/** A command that changes nothing, so the call is what gets tested. */
const noop: Command = (state) => state.tr

function toolbarCommands(overrides: Partial<TableToolbarCommands>): TableToolbarCommands {
  return {
    addRowBefore: noop,
    addRowAfter: noop,
    deleteRow: noop,
    addColumnBefore: noop,
    addColumnAfter: noop,
    deleteColumn: noop,
    mergeCells: noop,
    splitCell: noop,
    toggleHeaderRow: noop,
    deleteTable: noop,
    ...overrides,
  }
}

describe('openSplitCellsDialog', () => {
  it('asks for a column count from 2 to 63, starting at 2', async () => {
    const pending = openSplitCellsDialog(document)
    const input = document.querySelector<HTMLInputElement>('.trevixal-dialog [name="columns"]')
    expect(input?.type).toBe('number')
    expect([input?.value, input?.min, input?.max, input?.required]).toEqual(['2', '2', '63', true])
    // Word's dialog asks for rows too; this model spans columns only.
    expect(document.querySelector('.trevixal-dialog [name="rows"]')).toBeNull()
    await submitColumns('4')
    await expect(pending).resolves.toBe(4)
  })

  it('hands back a fraction as it is, for the command to turn down', async () => {
    const pending = openSplitCellsDialog(document)
    await submitColumns('2.5')
    await expect(pending).resolves.toBe(2.5)
  })

  it('resolves null when dismissed', async () => {
    const pending = openSplitCellsDialog(document)
    document.querySelector<HTMLButtonElement>('.trevixal-dialog__button')?.click()
    await expect(pending).resolves.toBeNull()
  })
})

describe('Split in the floating cell toolbar', () => {
  it('asks how many columns, then splits into that many', async () => {
    const { host, editor } = mountEditor()
    const split = vi.fn(() => noop)
    createTableToolbar(editor, {
      container: host,
      commands: toolbarCommands({ splitCellInto: split }),
    })
    const entry = host.querySelector<HTMLButtonElement>('[data-trevixal-item="splitCell"]')
    expect(entry?.textContent).toBe('Split cells…')
    entry?.click()
    expect(split).not.toHaveBeenCalled()
    await submitColumns('3')
    expect(split).toHaveBeenCalledWith(3)
  })

  it('un-merges straight away for a host without the dialog’s command', () => {
    const { host, editor } = mountEditor()
    const splitCell = vi.fn(noop)
    createTableToolbar(editor, { container: host, commands: toolbarCommands({ splitCell }) })
    host.querySelector<HTMLButtonElement>('[data-trevixal-item="splitCell"]')?.click()
    expect(splitCell).toHaveBeenCalledOnce()
    expect(document.querySelector('.trevixal-dialog')).toBeNull()
  })
})

describe('Split in the Table menu', () => {
  it('asks how many columns, then splits into that many', async () => {
    const { editor } = mountEditor()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const split = vi.fn(() => noop)
    const ui = createEditorUI(editor, {
      container,
      tableCommands: { insertTable: () => noop, splitCell: noop, splitCellInto: split },
    })
    ui.element.querySelector<HTMLButtonElement>('[data-trevixal-item="splitCell"]')?.click()
    await submitColumns('5')
    expect(split).toHaveBeenCalledWith(5)
    ui.destroy()
  })

  it('does nothing when the dialog is dismissed', async () => {
    const { editor } = mountEditor()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const split = vi.fn(() => noop)
    const ui = createEditorUI(editor, {
      container,
      tableCommands: { insertTable: () => noop, splitCell: noop, splitCellInto: split },
    })
    const entry = ui.element.querySelector<HTMLButtonElement>('[data-trevixal-item="splitCell"]')
    expect(entry).not.toBeNull()
    entry?.click()
    // The dialog is open, so dismissing it is what is being tested.
    expect(document.querySelector('.trevixal-dialog')).not.toBeNull()
    document.querySelector<HTMLButtonElement>('.trevixal-dialog__button')?.click()
    await Promise.resolve()
    expect(split).not.toHaveBeenCalled()
    ui.destroy()
  })
})
