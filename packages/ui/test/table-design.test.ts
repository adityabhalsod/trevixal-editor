import { type Command, Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type TableCommands, createEditorUI } from '../src/editor-ui'
import {
  type TableDesignCommands,
  type TableDesignState,
  type TableStyleTile,
  createTableDesignControl,
  tableStyleEntryName,
} from '../src/table-design'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

beforeEach(() => {
  document.body.innerHTML = ''
})

/** A command that changes nothing, so the call is what gets tested. */
const noop: Command = (state) => state.tr

const STYLES: readonly TableStyleTile[] = [
  { label: 'Table grid', style: null, accentColor: null },
  { label: 'Grid', style: 'grid', accentColor: null },
  { label: 'Blue header', style: 'header', accentColor: '#156082' },
]

/** A table as the fake reader reports it; tests change it to move the controls. */
function designState(): { current: TableDesignState | null } {
  return {
    current: {
      style: 'header',
      accentColor: '#156082',
      options: {
        headerRow: true,
        firstColumn: false,
        lastColumn: false,
        totalRow: false,
        bandedRows: true,
        bandedColumns: false,
      },
      borders: null,
      borderStyle: 'solid',
      borderWidth: '0.5pt',
      borderColor: null,
    },
  }
}

function fakeCommands(state: { current: TableDesignState | null }) {
  return {
    styles: STYLES,
    designAt: () => state.current,
    setStyle: vi.fn(() => noop),
    toggleOption: vi.fn(() => noop),
    setBorders: vi.fn(() => noop),
    setBorderStyle: vi.fn(() => noop),
    setBorderWidth: vi.fn(() => noop),
    setBorderColor: vi.fn(() => noop),
    setShading: vi.fn(() => noop),
    toggleBorderPainter: vi.fn(),
    isBorderPainterOn: () => false,
  } satisfies TableDesignCommands
}

function mountControl(commands: TableDesignCommands) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host })
  const control = createTableDesignControl({ document, editor, commands })
  document.body.appendChild(control.element)
  control.refresh(editor.getSnapshot())
  const panel = control.element.querySelector('.trevixal-dropdown__panel') as HTMLElement
  const byLabel = (label: string) =>
    panel.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  const trigger = control.element.querySelector('.trevixal-dropdown__trigger') as HTMLButtonElement
  return { control, editor, panel, byLabel, trigger }
}

describe('the Table design dropdown', () => {
  it('is enabled only while the selection is in a table', () => {
    const state = designState()
    const { control, editor, trigger } = mountControl(fakeCommands(state))
    expect(trigger.disabled).toBe(false)
    state.current = null
    control.refresh(editor.getSnapshot())
    expect(trigger.disabled).toBe(true)
  })

  it('ticks the table style options the table has, and toggles one when pressed', () => {
    const commands = fakeCommands(designState())
    const { byLabel } = mountControl(commands)
    expect(byLabel('Header row')?.getAttribute('aria-checked')).toBe('true')
    expect(byLabel('Banded rows')?.getAttribute('aria-checked')).toBe('true')
    expect(byLabel('Total row')?.getAttribute('aria-checked')).toBe('false')
    byLabel('Total row')?.click()
    expect(commands.toggleOption).toHaveBeenCalledWith('totalRow')
  })

  it('draws every style as a small table wearing the options, the current one pressed', () => {
    const commands = fakeCommands(designState())
    const { panel, byLabel } = mountControl(commands)
    const tiles = panel.querySelectorAll('.trevixal-tabledesign__tile')
    expect(tiles).toHaveLength(3)
    expect(byLabel('Blue header')?.getAttribute('aria-pressed')).toBe('true')
    expect(byLabel('Grid')?.getAttribute('aria-pressed')).toBe('false')
    const preview = byLabel('Blue header')?.querySelector('table') as HTMLTableElement
    expect(preview.dataset.tableStyle).toBe('header')
    expect(preview.style.getPropertyValue('--tvx-table-accent')).toBe('#156082')
    expect(preview.hasAttribute('data-banded-rows')).toBe(true)
    // The header row option makes the first row header cells.
    expect(preview.rows[0]?.cells[0]?.tagName).toBe('TH')
    byLabel('Grid')?.click()
    expect(commands.setStyle).toHaveBeenCalledWith('grid', null)
  })

  it('shades cells, and sets the borders and the pen', () => {
    const commands = fakeCommands(designState())
    const { byLabel } = mountControl(commands)
    byLabel('Shading #fff2cc')?.click()
    byLabel('No colour')?.click()
    byLabel('Outside')?.click()
    byLabel('Dashed')?.click()
    byLabel('2¼ pt')?.click()
    byLabel('Pen colour #7f7f7f')?.click()
    byLabel('Automatic')?.click()
    expect(commands.setShading.mock.calls).toEqual([['#fff2cc'], [null]])
    expect(commands.setBorders).toHaveBeenCalledWith('outer')
    expect(commands.setBorderStyle).toHaveBeenCalledWith('dashed')
    expect(commands.setBorderWidth).toHaveBeenCalledWith('2.25pt')
    expect(commands.setBorderColor.mock.calls).toEqual([['#7f7f7f'], [null]])
  })

  it('marks the pen the table is drawn with', () => {
    const state = designState()
    if (state.current)
      state.current = { ...state.current, borderStyle: 'double', borderWidth: '3pt' }
    const { byLabel } = mountControl(fakeCommands(state))
    expect(byLabel('Double')?.getAttribute('aria-pressed')).toBe('true')
    expect(byLabel('Solid')?.getAttribute('aria-pressed')).toBe('false')
    expect(byLabel('3 pt')?.getAttribute('aria-pressed')).toBe('true')
    // No borders chosen is all of them.
    expect(byLabel('All')?.getAttribute('aria-pressed')).toBe('true')
    expect(byLabel('Automatic')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('hands the pointer to the Border Painter, and leaves the button out without it', () => {
    const commands = fakeCommands(designState())
    const { byLabel } = mountControl(commands)
    byLabel('Border painter')?.click()
    expect(commands.toggleBorderPainter).toHaveBeenCalledOnce()

    document.body.innerHTML = ''
    const {
      toggleBorderPainter: _toggle,
      isBorderPainterOn: _on,
      ...rest
    } = fakeCommands(designState())
    const bare = mountControl(rest)
    expect(bare.byLabel('Border painter')).toBeNull()
  })
})

describe('Table design in the editor UI', () => {
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
      ui.element.querySelector<HTMLButtonElement>(
        `.trevixal-menubar [data-trevixal-item="${name}"]`,
      )
    return { ui, item }
  }

  function fullCommands(state: { current: TableDesignState | null }) {
    return {
      tableStyles: STYLES,
      tableDesignAt: () => state.current,
      setTableStyle: vi.fn(() => noop),
      toggleStyleOption: vi.fn(() => noop),
      toggleHeaderRow: vi.fn(noop),
      setTableBorders: vi.fn(() => noop),
      setTableBorderStyle: vi.fn(() => noop),
      setTableBorderWidth: vi.fn(() => noop),
      setTableBorderColor: vi.fn(() => noop),
      setCellBackground: vi.fn(() => noop),
    }
  }

  it('puts the dropdown in the toolbar once every part of it is supplied', () => {
    const complete = mountUI(fullCommands(designState()))
    expect(
      complete.ui.element.querySelector('.trevixal-toolbar .trevixal-tabledesign'),
    ).not.toBeNull()
    complete.ui.destroy()

    const { setCellBackground: _shading, ...partial } = fullCommands(designState())
    const without = mountUI(partial)
    expect(without.ui.element.querySelector('.trevixal-tabledesign')).toBeNull()
    without.ui.destroy()
  })

  it('lists every style under Table ▸ Table style, ticking the one the table has', () => {
    const commands = fullCommands(designState())
    const { ui, item } = mountUI(commands)
    const table = ui.menus.find((menu) => menu.label === 'Table')
    const group = table?.items.find((entry) => entry.name === 'tableStyles')
    expect(group?.items?.map((entry) => entry.label)).toEqual(['Table grid', 'Grid', 'Blue header'])
    const blue = item(
      tableStyleEntryName({ label: 'Blue header', style: 'header', accentColor: '#156082' }),
    )
    blue?.click()
    expect(commands.setTableStyle).toHaveBeenCalledWith('header', '#156082')
    expect(blue?.getAttribute('aria-checked')).toBe('true')
    ui.destroy()
  })

  it('offers the style options, the header row among them, each with a tick', () => {
    const commands = fullCommands(designState())
    const { ui, item } = mountUI(commands)
    const table = ui.menus.find((menu) => menu.label === 'Table')
    const options = table?.items.find((entry) => entry.name === 'tableStyleOptions')
    expect(options?.items?.map((entry) => entry.label)).toEqual([
      'Header row',
      'Total row',
      'Banded rows',
      'First column',
      'Last column',
      'Banded columns',
    ])
    item('tableBandedColumns')?.click()
    expect(commands.toggleStyleOption).toHaveBeenCalledWith('bandedColumns')
    // Header row keeps its own command, and now reports its state.
    item('toggleHeaderRow')?.click()
    expect(commands.toggleHeaderRow).toHaveBeenCalledOnce()
    expect(item('toggleHeaderRow')?.getAttribute('aria-checked')).toBe('true')
    expect(item('tableBandedRows')?.getAttribute('aria-checked')).toBe('true')
    ui.destroy()
  })

  it('sets the pen from Table ▸ Line style and Line weight', () => {
    const commands = fullCommands(designState())
    const { ui, item } = mountUI(commands)
    item('tableLineDotted')?.click()
    item('tableLineWeightThree')?.click()
    expect(commands.setTableBorderStyle).toHaveBeenCalledWith('dotted')
    expect(commands.setTableBorderWidth).toHaveBeenCalledWith('3pt')
    expect(item('tableLineSolid')?.getAttribute('aria-checked')).toBe('true')
    ui.destroy()
  })

  it('picks up the Border Painter like the other table tools', () => {
    let held: 'draw' | 'erase' | 'paint' | null = null
    const toggleTableTool = vi.fn((tool: 'draw' | 'erase' | 'paint') => {
      held = held === tool ? null : tool
    })
    const { ui, item } = mountUI({ toggleTableTool, activeTableTool: () => held })
    item('borderPainter')?.click()
    expect(toggleTableTool).toHaveBeenCalledWith('paint')
    expect(item('borderPainter')?.getAttribute('aria-checked')).toBe('true')
    ui.destroy()
  })
})
