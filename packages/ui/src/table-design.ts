import type { Command, Editor, EditorState } from '@trevixal/core'
import { type Control, chevron } from './controls'
import { bindListNavigation, createDropdown } from './dropdown'
import { type IconName, createIcon } from './icons'

/** One tile of the Table Styles gallery, as the table package lists it. */
export interface TableStyleTile {
  readonly label: string
  readonly style: string | null
  readonly accentColor: string | null
}

/** Word's Table Style Options, the header row included. */
export type TableStyleOptionName =
  | 'headerRow'
  | 'firstColumn'
  | 'lastColumn'
  | 'totalRow'
  | 'bandedRows'
  | 'bandedColumns'

export type TableLineStyle = 'solid' | 'dashed' | 'dotted' | 'double'
export type TableLineWeight = '0.5pt' | '1.5pt' | '2.25pt' | '3pt'
export type TableBorderPreset = 'all' | 'outer' | 'horizontal' | 'none'

/** The table holding the selection, as the Table design controls show it. */
export interface TableDesignState {
  readonly style: string | null
  readonly accentColor: string | null
  readonly options: Readonly<Record<TableStyleOptionName, boolean>>
  readonly borders: TableBorderPreset | null
  readonly borderStyle: TableLineStyle
  readonly borderWidth: TableLineWeight
  readonly borderColor: string | null
}

/**
 * What the Table design control drives, injected by the host so this package
 * does not depend on the table extension; `createEditorUI` builds it from
 * `tableUICommands()`.
 */
export interface TableDesignCommands {
  /** The gallery, in the order it is shown. */
  readonly styles: readonly TableStyleTile[]
  /** The table at the selection, or null outside one; a reader, not a command. */
  readonly designAt: (state: EditorState) => TableDesignState | null
  readonly setStyle: (style: string | null, accentColor: string | null) => Command
  readonly toggleOption: (option: TableStyleOptionName) => Command
  readonly setBorders: (borders: TableBorderPreset | null) => Command
  readonly setBorderStyle: (style: TableLineStyle) => Command
  readonly setBorderWidth: (width: TableLineWeight) => Command
  readonly setBorderColor: (color: string | null) => Command
  readonly setShading: (color: string | null) => Command
  /** Word's Border Painter; the button is left out without it. */
  readonly toggleBorderPainter?: () => void
  readonly isBorderPainterOn?: () => boolean
}

/**
 * One choice the Table design controls offer, as the dropdown labels it and
 * as the Table menu lists it, so the two cannot drift apart.
 */
export interface TableDesignEntry<Value> {
  readonly value: Value
  readonly label: string
  /** The Table menu entry's name. */
  readonly entry: string
  readonly icon: IconName
}

/** The options in Word's order: its first column, then its second. */
export const TABLE_STYLE_OPTION_ENTRIES: readonly TableDesignEntry<TableStyleOptionName>[] = [
  // The header row keeps the name its menu entry has always had.
  { value: 'headerRow', label: 'Header row', entry: 'toggleHeaderRow', icon: 'tableHeaderRow' },
  { value: 'totalRow', label: 'Total row', entry: 'tableTotalRow', icon: 'tableTotalRow' },
  { value: 'bandedRows', label: 'Banded rows', entry: 'tableBandedRows', icon: 'tableBandedRows' },
  {
    value: 'firstColumn',
    label: 'First column',
    entry: 'tableFirstColumn',
    icon: 'tableFirstColumn',
  },
  { value: 'lastColumn', label: 'Last column', entry: 'tableLastColumn', icon: 'tableLastColumn' },
  {
    value: 'bandedColumns',
    label: 'Banded columns',
    entry: 'tableBandedColumns',
    icon: 'tableBandedColumns',
  },
]

export const TABLE_LINE_STYLE_ENTRIES: readonly TableDesignEntry<TableLineStyle>[] = [
  { value: 'solid', label: 'Solid', entry: 'tableLineSolid', icon: 'lineSolid' },
  { value: 'dashed', label: 'Dashed', entry: 'tableLineDashed', icon: 'lineDashed' },
  { value: 'dotted', label: 'Dotted', entry: 'tableLineDotted', icon: 'lineDotted' },
  { value: 'double', label: 'Double', entry: 'tableLineDouble', icon: 'lineDouble' },
]

export const TABLE_LINE_WEIGHT_ENTRIES: readonly TableDesignEntry<TableLineWeight>[] = [
  { value: '0.5pt', label: '½ pt', entry: 'tableLineWeightHalf', icon: 'lineWeight' },
  { value: '1.5pt', label: '1½ pt', entry: 'tableLineWeightOneAndHalf', icon: 'lineWeight' },
  { value: '2.25pt', label: '2¼ pt', entry: 'tableLineWeightTwoAndQuarter', icon: 'lineWeight' },
  { value: '3pt', label: '3 pt', entry: 'tableLineWeightThree', icon: 'lineWeight' },
]

/** The Table menu entry for one style of the gallery: `Blue header` is `tableStyleBlueHeader`. */
export function tableStyleEntryName(tile: TableStyleTile): string {
  const words = tile.label.split(/\s+/).filter((word) => word.length > 0)
  return `tableStyle${words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('')}`
}

const PRESET_LABELS: readonly (readonly [TableBorderPreset, string])[] = [
  ['all', 'All'],
  ['outer', 'Outside'],
  ['horizontal', 'Rows'],
  ['none', 'None'],
]

/** How each option is written on a rendered table, for the previews to wear. */
const OPTION_ATTRIBUTES: readonly (readonly [TableStyleOptionName, string])[] = [
  ['firstColumn', 'data-first-column'],
  ['lastColumn', 'data-last-column'],
  ['totalRow', 'data-total-row'],
  ['bandedRows', 'data-banded-rows'],
  ['bandedColumns', 'data-banded-columns'],
]

/** Light fills a cell's text still reads on: two neutrals, then a tint of each accent. */
const SHADES: readonly string[] = [
  '#f2f2f2',
  '#fff2cc',
  '#dce6f0',
  '#fbe5d6',
  '#d9ead3',
  '#dbeef9',
  '#f2dcef',
  '#e2f0d9',
]

/** Pen colours besides the gallery's accents. */
const INKS: readonly string[] = ['#000000', '#7f7f7f']

/** A preview is this many rows by this many columns: enough to show bands and a total row. */
const PREVIEW_ROWS = 4
const PREVIEW_COLUMNS = 5

export interface TableDesignControlOptions {
  readonly document: Document
  readonly editor: Editor
  readonly commands: TableDesignCommands
}

/**
 * Word's Table Design tab as one toolbar dropdown: the six Table Style
 * Options, the styles gallery drawn as small tables, Shading, and the pen,
 * with the Border Painter. Enabled while the selection is in a table.
 *
 * The options, shading and pen apply at once and leave the panel open, so a
 * table can be worked on without reopening it; picking a style, or the
 * painter, closes it.
 */
export function createTableDesignControl(options: TableDesignControlOptions): Control {
  const { document, editor, commands } = options
  const run = (command: Command): void => {
    editor.exec(command)
  }

  const optionButtons = new Map<TableStyleOptionName, HTMLButtonElement>()
  const tiles: { readonly choice: TableStyleTile; readonly button: HTMLButtonElement }[] = []
  const presets = new Map<TableBorderPreset, HTMLButtonElement>()
  const lines = new Map<TableLineStyle, HTMLButtonElement>()
  const weights = new Map<TableLineWeight, HTMLButtonElement>()
  const pens: { readonly color: string | null; readonly button: HTMLButtonElement }[] = []
  let painter: HTMLButtonElement | null = null
  let releaseNavigation: (() => void) | null = null
  /** The options the previews were last drawn with. */
  let previewedWith = ''

  const button = (className: string, label: string, onClick: () => void): HTMLButtonElement => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = className
    element.setAttribute('aria-label', label)
    element.title = label
    element.addEventListener('click', onClick)
    return element
  }

  const section = (heading: string, ...content: HTMLElement[]): HTMLElement => {
    const element = document.createElement('div')
    element.className = 'trevixal-tabledesign__section'
    const title = document.createElement('p')
    title.className = 'trevixal-tabledesign__heading'
    title.textContent = heading
    element.append(title, ...content)
    return element
  }

  const row = (label: string, ...content: HTMLElement[]): HTMLElement => {
    const element = document.createElement('div')
    element.className = 'trevixal-tabledesign__row'
    const caption = document.createElement('span')
    caption.className = 'trevixal-tabledesign__label'
    caption.textContent = label
    element.append(caption, ...content)
    return element
  }

  const optionsGrid = (): HTMLElement => {
    const grid = document.createElement('div')
    grid.className = 'trevixal-tabledesign__options'
    for (const { value: option, label } of TABLE_STYLE_OPTION_ENTRIES) {
      const toggle = button('trevixal-tabledesign__option', label, () =>
        run(commands.toggleOption(option)),
      )
      toggle.setAttribute('role', 'checkbox')
      toggle.setAttribute('aria-checked', 'false')
      const box = document.createElement('span')
      box.className = 'trevixal-tabledesign__box'
      const text = document.createElement('span')
      text.textContent = label
      toggle.append(box, text)
      optionButtons.set(option, toggle)
      grid.appendChild(toggle)
    }
    return grid
  }

  const stylesGrid = (close: () => void): HTMLElement => {
    const grid = document.createElement('div')
    grid.className = 'trevixal-tabledesign__styles'
    for (const choice of commands.styles) {
      const tile = button('trevixal-tabledesign__tile', choice.label, () => {
        close()
        run(commands.setStyle(choice.style, choice.accentColor))
      })
      tile.setAttribute('aria-pressed', 'false')
      tiles.push({ choice, button: tile })
      grid.appendChild(tile)
    }
    return grid
  }

  const swatch = (color: string, label: string, onClick: () => void): HTMLButtonElement => {
    const element = button('trevixal-tabledesign__swatch', label, onClick)
    element.style.backgroundColor = color
    return element
  }

  const choice = (label: string, onClick: () => void, content?: HTMLElement): HTMLButtonElement => {
    const element = button('trevixal-tabledesign__choice', label, onClick)
    if (content) element.appendChild(content)
    else element.textContent = label
    return element
  }

  const shadingRow = (): HTMLElement =>
    row(
      'Fill',
      ...SHADES.map((color) =>
        swatch(color, `Shading ${color}`, () => run(commands.setShading(color))),
      ),
      choice('No colour', () => run(commands.setShading(null))),
    )

  const bordersRows = (close: () => void): HTMLElement[] => {
    const presetButtons = PRESET_LABELS.map(([preset, label]) => {
      const element = choice(label, () => run(commands.setBorders(preset)))
      presets.set(preset, element)
      return element
    })
    const lineButtons = TABLE_LINE_STYLE_ENTRIES.map(({ value: style, label }) => {
      const sample = document.createElement('span')
      sample.className = 'trevixal-tabledesign__sample'
      sample.dataset.style = style
      const element = choice(label, () => run(commands.setBorderStyle(style)), sample)
      lines.set(style, element)
      return element
    })
    const weightButtons = TABLE_LINE_WEIGHT_ENTRIES.map(({ value: weight, label }) => {
      const element = choice(label, () => run(commands.setBorderWidth(weight)))
      weights.set(weight, element)
      return element
    })
    const accents = [
      ...new Set(
        commands.styles.flatMap((tile) => (tile.accentColor === null ? [] : [tile.accentColor])),
      ),
    ]
    const automatic = choice('Automatic', () => run(commands.setBorderColor(null)))
    pens.push({ color: null, button: automatic })
    const penButtons = [...INKS, ...accents].map((color) => {
      const element = swatch(color, `Pen colour ${color}`, () =>
        run(commands.setBorderColor(color)),
      )
      pens.push({ color, button: element })
      return element
    })
    const rows = [
      row('Borders', ...presetButtons),
      row('Line', ...lineButtons),
      row('Weight', ...weightButtons),
      row('Pen colour', automatic, ...penButtons),
    ]
    const toggle = commands.toggleBorderPainter
    if (toggle) {
      painter = choice('Border painter', () => {
        close()
        toggle()
      })
      painter.classList.add('trevixal-tabledesign__painter')
      painter.setAttribute('aria-pressed', 'false')
      const icon = createIcon(document, 'borderPainter')
      if (icon) painter.prepend(icon)
      rows.push(painter)
    }
    return rows
  }

  const dropdown = createDropdown({
    document,
    className: 'trevixal-tabledesign',
    render: (panel, self) => {
      panel.setAttribute('aria-label', 'Table design')
      const close = () => self.close()
      panel.append(
        section('Table style options', optionsGrid()),
        section('Table styles', stylesGrid(close)),
        section('Shading', shadingRow()),
        section('Borders', ...bordersRows(close)),
      )
      releaseNavigation = bindListNavigation(panel)
    },
    onOpen: () => show(commands.designAt(editor.state)),
  })

  const trigger = dropdown.trigger
  const icon = createIcon(document, 'tableDesign')
  if (icon) trigger.appendChild(icon)
  trigger.appendChild(chevron(document))
  trigger.setAttribute('aria-label', 'Table design')
  trigger.title = 'Table design'

  /** Mark what the table has now, and draw the previews with its options. */
  const show = (design: TableDesignState | null): void => {
    trigger.disabled = design === null
    if (design === null) {
      dropdown.close()
      return
    }
    for (const [option, toggle] of optionButtons) {
      toggle.setAttribute('aria-checked', String(design.options[option]))
    }
    const key = JSON.stringify(design.options)
    for (const { choice: tile, button: element } of tiles) {
      const current =
        tile.style === design.style && tile.accentColor === (design.accentColor ?? null)
      element.setAttribute('aria-pressed', String(current))
      if (key !== previewedWith) element.replaceChildren(preview(document, tile, design.options))
    }
    previewedWith = key
    for (const [preset, element] of presets) {
      element.setAttribute('aria-pressed', String((design.borders ?? 'all') === preset))
    }
    for (const [style, element] of lines) {
      element.setAttribute('aria-pressed', String(design.borderStyle === style))
    }
    for (const [weight, element] of weights) {
      element.setAttribute('aria-pressed', String(design.borderWidth === weight))
    }
    for (const { color, button: element } of pens) {
      element.setAttribute('aria-pressed', String(color === design.borderColor))
    }
    painter?.setAttribute('aria-pressed', String(commands.isBorderPainterOn?.() ?? false))
  }

  return {
    element: dropdown.element,
    refresh: () => show(commands.designAt(editor.state)),
    destroy() {
      releaseNavigation?.()
      dropdown.destroy()
    },
  }
}

/** A small table wearing a style and the table's options: the gallery's tile face. */
function preview(
  document: Document,
  tile: TableStyleTile,
  options: Readonly<Record<TableStyleOptionName, boolean>>,
): HTMLTableElement {
  const table = document.createElement('table')
  table.className = 'trevixal-tabledesign__preview'
  table.setAttribute('aria-hidden', 'true')
  if (tile.style) table.dataset.tableStyle = tile.style
  if (tile.style && tile.accentColor) {
    table.dataset.accentColor = tile.accentColor
    table.style.setProperty('--tvx-table-accent', tile.accentColor)
  }
  for (const [option, attribute] of OPTION_ATTRIBUTES) {
    if (options[option]) table.setAttribute(attribute, '')
  }
  for (let rowIndex = 0; rowIndex < PREVIEW_ROWS; rowIndex++) {
    const tr = document.createElement('tr')
    for (let column = 0; column < PREVIEW_COLUMNS; column++) {
      tr.appendChild(document.createElement(rowIndex === 0 && options.headerRow ? 'th' : 'td'))
    }
    table.appendChild(tr)
  }
  return table
}
