import { type Command, Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type TableCommands, createEditorUI } from '../src/editor-ui'
import { type TableToolbarCommands, createTableToolbar } from '../src/table-toolbar'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

beforeEach(() => {
  document.body.innerHTML = ''
})

/** A command that changes nothing, so the call is what gets tested. */
const noop: Command = (state) => state.tr

function mountUI(tableCommands: Omit<TableCommands, 'insertTable'>) {
  const host = document.createElement('div')
  const container = document.createElement('div')
  document.body.append(host, container)
  const editor = createEditor({ schema, element: host })
  const ui = createEditorUI(editor, {
    container,
    tableCommands: { insertTable: () => noop, ...tableCommands },
  })
  const item = (name: string) =>
    ui.element.querySelector<HTMLButtonElement>(`[data-trevixal-item="${name}"]`)
  return { ui, item }
}

describe('the Table menu', () => {
  it('runs the command behind each AutoFit and distribute entry', () => {
    const commands = {
      autoFitContents: vi.fn(noop),
      autoFitWindow: vi.fn(noop),
      fixColumnWidths: vi.fn(noop),
      distributeRows: vi.fn(noop),
    }
    const { ui, item } = mountUI(commands)
    for (const [name, command] of Object.entries(commands)) {
      item(name)?.click()
      expect(command, name).toHaveBeenCalledOnce()
    }
    ui.destroy()
  })

  it('keeps the three AutoFit entries under one submenu, as Word does', () => {
    const { ui } = mountUI({ autoFitContents: noop, autoFitWindow: noop, fixColumnWidths: noop })
    const table = ui.menus.find((menu) => menu.label === 'Table')
    const autoFit = table?.items.find((entry) => entry.name === 'tableAutoFit')
    expect(autoFit?.items?.map((entry) => entry.label)).toEqual([
      'AutoFit contents',
      'AutoFit window',
      'Fixed column width',
    ])
    ui.destroy()
  })

  it('picks a tool up and puts it down, its entry ticked while it is held', () => {
    let held: 'draw' | 'erase' | 'paint' | null = null
    const toggleTableTool = vi.fn((tool: 'draw' | 'erase' | 'paint') => {
      held = held === tool ? null : tool
    })
    const { ui, item } = mountUI({ toggleTableTool, activeTableTool: () => held })
    const ticks = () =>
      [item('drawTable'), item('tableEraser')].map((e) => e?.getAttribute('aria-checked'))

    item('drawTable')?.click()
    expect(toggleTableTool).toHaveBeenLastCalledWith('draw')
    expect(ticks()).toEqual(['true', 'false'])
    item('tableEraser')?.click()
    expect(ticks()).toEqual(['false', 'true'])
    item('tableEraser')?.click()
    expect(ticks()).toEqual(['false', 'false'])
    ui.destroy()
  })

  it('leaves out what the host did not supply', () => {
    const { ui, item } = mountUI({ distributeColumns: noop })
    for (const name of ['drawTable', 'tableEraser', 'tableAutoFit', 'distributeRows']) {
      expect(item(name), name).toBeNull()
    }
    expect(item('distributeColumns')).not.toBeNull()
    ui.destroy()
  })
})

describe('the floating cell toolbar', () => {
  it('lists AutoFit and Distribute rows with the other sizing entries', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({ schema, element: host })
    const commands: TableToolbarCommands = {
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
      autoFitContents: noop,
      autoFitWindow: noop,
      fixColumnWidths: noop,
      distributeRows: vi.fn(noop),
      distributeColumns: noop,
      clearSizing: noop,
    }
    createTableToolbar(editor, { container: host, commands })
    const names = [...host.querySelectorAll<HTMLElement>('[data-trevixal-item]')].map(
      (entry) => entry.dataset.trevixalItem,
    )
    const sizing = names.slice(names.indexOf('autoFitContents'), names.indexOf('clearSizing') + 1)
    expect(sizing).toEqual([
      'autoFitContents',
      'autoFitWindow',
      'fixColumnWidths',
      'distributeRows',
      'distributeColumns',
      'clearSizing',
    ])
    host.querySelector<HTMLButtonElement>('[data-trevixal-item="distributeRows"]')?.click()
    expect(commands.distributeRows).toHaveBeenCalledOnce()
  })
})
