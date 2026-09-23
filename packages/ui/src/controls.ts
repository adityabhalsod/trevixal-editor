import {
  type Editor,
  type EditorSnapshot,
  LIST_NUMBERING_SCHEMES,
  listMarker,
  listNumberingAt,
} from '@trevixal/core'
import { bindListNavigation, createDropdown } from './dropdown'
import { createIcon } from './icons'

/** A choice in a toolbar select (block format, font family, font size). */
export interface SelectOption {
  readonly value: string
  readonly label: string
  /** Inline style previewing the option in the list (font family/size). */
  readonly previewStyle?: string
}

export interface SelectControlOptions {
  readonly document: Document
  readonly options: readonly SelectOption[]
  /** Current value from the snapshot; `null` shows the placeholder. */
  readonly valueOf: (snapshot: EditorSnapshot) => string | null
  readonly onSelect: (value: string) => void
  readonly placeholder: string
  readonly ariaLabel: string
  /** Fixed trigger width, e.g. `"7.5rem"`, so the toolbar does not reflow. */
  readonly width?: string
}

export interface Control {
  readonly element: HTMLElement
  refresh(snapshot: EditorSnapshot): void
  destroy(): void
}

/** A labelled dropdown that reflects and sets one value. */
export function createSelectControl(options: SelectControlOptions): Control {
  const { document } = options
  const label = document.createElement('span')
  label.className = 'trevixal-select__label'
  label.textContent = options.placeholder

  const buttons = new Map<string, HTMLButtonElement>()
  let releaseNavigation: (() => void) | null = null
  const dropdown = createDropdown({
    document,
    className: 'trevixal-select',
    render: (panel, self) => {
      panel.setAttribute('role', 'listbox')
      panel.setAttribute('aria-label', options.ariaLabel)
      for (const option of options.options) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'trevixal-select__option'
        button.setAttribute('role', 'option')
        button.dataset.value = option.value
        button.textContent = option.label
        if (option.previewStyle) button.setAttribute('style', option.previewStyle)
        button.addEventListener('click', () => {
          self.close()
          options.onSelect(option.value)
        })
        panel.appendChild(button)
        buttons.set(option.value, button)
      }
      releaseNavigation = bindListNavigation(panel)
    },
  })

  dropdown.trigger.append(label, chevron(document))
  dropdown.trigger.setAttribute('aria-label', options.ariaLabel)
  if (options.width) dropdown.trigger.style.width = options.width

  return {
    element: dropdown.element,
    refresh(snapshot) {
      const value = options.valueOf(snapshot)
      const match = value ? options.options.find((entry) => entry.value === value) : undefined
      // A value the offered list does not carry, a 13pt size pasted in from
      // elsewhere, is still what the document says. Falling back to the
      // placeholder would claim nothing is set at all.
      label.textContent = match?.label ?? value ?? options.placeholder
      for (const [candidate, button] of buttons) {
        button.setAttribute('aria-selected', String(candidate === value))
      }
    },
    destroy() {
      releaseNavigation?.()
      dropdown.destroy()
    },
  }
}

/** The only shape a color input reports, and the only one the control emits. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** Swatches shown by the color pickers; consumers may pass their own. */
export const DEFAULT_SWATCHES: readonly string[] = [
  '#000000',
  '#404040',
  '#737373',
  '#a3a3a3',
  '#d4d4d4',
  '#ffffff',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
  '#2563eb',
  '#7c3aed',
  '#c026d3',
  '#db2777',
  '#fca5a5',
  '#fdba74',
  '#fde047',
  '#86efac',
  '#67e8f9',
  '#93c5fd',
  '#c4b5fd',
  '#f0abfc',
  '#f9a8d4',
]

export interface ColorControlOptions {
  readonly document: Document
  readonly icon: 'textColor' | 'backgroundColor'
  readonly ariaLabel: string
  readonly swatches?: readonly string[]
  readonly onSelect: (color: string) => void
  readonly onClear: () => void
  /** Current color, drawn as the underline beneath the icon. */
  readonly valueOf: (snapshot: EditorSnapshot) => string | null
}

/** An icon button with a swatch grid, a custom picker and a clear action. */
export function createColorControl(options: ColorControlOptions): Control {
  const { document } = options
  const indicator = document.createElement('span')
  indicator.className = 'trevixal-color__indicator'

  const dropdown = createDropdown({
    document,
    className: 'trevixal-color',
    render: (panel, self) => {
      panel.setAttribute('aria-label', options.ariaLabel)
      const grid = document.createElement('div')
      grid.className = 'trevixal-color__grid'
      for (const color of options.swatches ?? DEFAULT_SWATCHES) {
        const swatch = document.createElement('button')
        swatch.type = 'button'
        swatch.className = 'trevixal-color__swatch'
        swatch.style.backgroundColor = color
        swatch.dataset.color = color
        swatch.setAttribute('aria-label', color)
        swatch.addEventListener('click', () => {
          self.close()
          options.onSelect(color)
        })
        grid.appendChild(swatch)
      }
      panel.appendChild(grid)

      const custom = document.createElement('input')
      custom.type = 'color'
      custom.className = 'trevixal-color__custom'
      custom.setAttribute('aria-label', `${options.ariaLabel}: custom`)
      custom.addEventListener('change', () => {
        // Engines normalize `<input type="color">` to `#rrggbb`, but the value
        // is read back from the DOM: the control validates rather than making
        // every caller guard against a colour that is not one.
        const value = custom.value.trim()
        if (!HEX_COLOR.test(value)) return
        self.close()
        options.onSelect(value)
      })
      panel.appendChild(custom)

      const clear = document.createElement('button')
      clear.type = 'button'
      clear.className = 'trevixal-color__clear'
      clear.textContent = 'Remove color'
      clear.addEventListener('click', () => {
        self.close()
        options.onClear()
      })
      panel.appendChild(clear)
    },
  })

  const icon = createIcon(document, options.icon)
  if (icon) dropdown.trigger.appendChild(icon)
  dropdown.trigger.appendChild(indicator)
  dropdown.trigger.appendChild(chevron(document))
  dropdown.trigger.setAttribute('aria-label', options.ariaLabel)

  return {
    element: dropdown.element,
    refresh(snapshot) {
      const color = options.valueOf(snapshot)
      indicator.style.backgroundColor = color ?? 'transparent'
    },
    destroy: () => dropdown.destroy(),
  }
}

export interface TableGridOptions {
  readonly document: Document
  readonly onSelect: (rows: number, cols: number) => void
  /** Grid size offered in the picker; defaults to 10×10. */
  readonly maxRows?: number
  readonly maxCols?: number
}

/** The familiar hover-to-size grid for inserting a table. */
export function createTableGridControl(options: TableGridOptions): Control {
  const { document } = options
  const maxRows = options.maxRows ?? 10
  const maxCols = options.maxCols ?? 10

  const dropdown = createDropdown({
    document,
    className: 'trevixal-tablegrid',
    render: (panel, self) => {
      panel.setAttribute('aria-label', 'Insert table')
      const readout = document.createElement('div')
      readout.className = 'trevixal-tablegrid__readout'
      readout.textContent = '0 × 0'

      const grid = document.createElement('div')
      grid.className = 'trevixal-tablegrid__grid'
      grid.style.setProperty('--tvx-grid-cols', String(maxCols))

      const cells: HTMLButtonElement[] = []
      const highlight = (rows: number, cols: number): void => {
        cells.forEach((cell, index) => {
          const row = Math.floor(index / maxCols) + 1
          const col = (index % maxCols) + 1
          cell.classList.toggle('trevixal-tablegrid__cell--on', row <= rows && col <= cols)
        })
        readout.textContent = `${rows} × ${cols}`
      }

      for (let row = 1; row <= maxRows; row++) {
        for (let col = 1; col <= maxCols; col++) {
          const cell = document.createElement('button')
          cell.type = 'button'
          cell.className = 'trevixal-tablegrid__cell'
          cell.dataset.row = String(row)
          cell.dataset.col = String(col)
          cell.setAttribute('aria-label', `${row} by ${col} table`)
          cell.addEventListener('mouseenter', () => highlight(row, col))
          cell.addEventListener('focus', () => highlight(row, col))
          cell.addEventListener('click', () => {
            self.close()
            options.onSelect(row, col)
          })
          grid.appendChild(cell)
          cells.push(cell)
        }
      }
      grid.addEventListener('mouseleave', () => highlight(0, 0))
      panel.append(grid, readout)
    },
  })

  const icon = createIcon(document, 'table')
  if (icon) dropdown.trigger.appendChild(icon)
  dropdown.trigger.appendChild(chevron(document))
  dropdown.trigger.setAttribute('aria-label', 'Table')

  return {
    element: dropdown.element,
    refresh: () => {},
    destroy: () => dropdown.destroy(),
  }
}

/** An entry in the multilevel list gallery. */
export interface ListNumberingOption {
  /** A scheme id for `setListNumbering`, or `none` to take the list apart. */
  readonly value: string
  readonly label: string
  /** The first marker of each of the levels the tile previews. */
  readonly markers: readonly string[]
}

/** The value of the gallery's "None" entry. */
export const NO_LIST_NUMBERING = 'none'

/** How many levels a gallery tile previews, as Word's do. */
const PREVIEW_LEVELS = 3

const SCHEME_LABELS: Readonly<Record<string, string>> = {
  default: 'Numbers',
  parenthesis: 'Numbers with parentheses',
  outline: 'Outline numbers',
  'roman-outline': 'Roman outline',
  symbols: 'Symbol bullets',
}

/**
 * The gallery Word offers under Multilevel List: None, then every scheme,
 * each previewed by the first marker of its first three levels.
 */
export function defaultListNumberings(): readonly ListNumberingOption[] {
  return [
    { value: NO_LIST_NUMBERING, label: 'None', markers: [] },
    ...LIST_NUMBERING_SCHEMES.map((scheme) => ({
      value: scheme.id,
      label: SCHEME_LABELS[scheme.id] ?? scheme.id,
      markers: Array.from({ length: PREVIEW_LEVELS }, (_, level) =>
        listMarker(
          scheme,
          Array.from({ length: level + 1 }, () => 1),
        ),
      ),
    })),
  ]
}

/**
 * The gallery entry describing the selection: `none` outside a list, the
 * tree's scheme inside one, and null for a list no entry describes (plain
 * bullets, a task list), so that nothing claims to be current.
 */
export function currentListNumbering(editor: Editor, snapshot: EditorSnapshot): string | null {
  if (snapshot.listType === null) return NO_LIST_NUMBERING
  const { doc, selection } = editor.state
  return listNumberingAt(doc, selection.from.path)?.id ?? null
}

export interface ListNumberingControlOptions {
  readonly document: Document
  readonly options: readonly ListNumberingOption[]
  /** The entry describing the selection, for marking it; null marks none. */
  readonly valueOf: (snapshot: EditorSnapshot) => string | null
  readonly onSelect: (value: string) => void
}

/** Word's multilevel list gallery: a tile per scheme, drawn as it numbers. */
export function createListNumberingControl(options: ListNumberingControlOptions): Control {
  const { document } = options
  const tiles = new Map<string, HTMLButtonElement>()
  let releaseNavigation: (() => void) | null = null

  const dropdown = createDropdown({
    document,
    className: 'trevixal-listgallery',
    render: (panel, self) => {
      panel.setAttribute('aria-label', 'Multilevel list')
      const grid = document.createElement('div')
      grid.className = 'trevixal-listgallery__grid'
      for (const option of options.options) {
        const tile = document.createElement('button')
        tile.type = 'button'
        tile.className = 'trevixal-listgallery__tile'
        tile.dataset.value = option.value
        const name =
          option.markers.length > 0 ? `${option.label}: ${option.markers.join(' ')}` : option.label
        tile.setAttribute('aria-label', name)
        tile.title = name
        tile.setAttribute('aria-pressed', 'false')
        if (option.markers.length === 0) {
          const none = document.createElement('span')
          none.className = 'trevixal-listgallery__none'
          none.textContent = option.label
          tile.appendChild(none)
        }
        option.markers.forEach((marker, level) => {
          const row = document.createElement('span')
          row.className = 'trevixal-listgallery__row'
          row.style.setProperty('--tvx-level', String(level))
          const glyph = document.createElement('span')
          glyph.className = 'trevixal-listgallery__marker'
          glyph.textContent = marker
          const line = document.createElement('span')
          line.className = 'trevixal-listgallery__line'
          row.append(glyph, line)
          tile.appendChild(row)
        })
        tile.addEventListener('click', () => {
          self.close()
          options.onSelect(option.value)
        })
        grid.appendChild(tile)
        tiles.set(option.value, tile)
      }
      panel.appendChild(grid)
      releaseNavigation = bindListNavigation(panel)
    },
  })

  const icon = createIcon(document, 'multilevelList')
  if (icon) dropdown.trigger.appendChild(icon)
  dropdown.trigger.appendChild(chevron(document))
  dropdown.trigger.setAttribute('aria-label', 'Multilevel list')

  return {
    element: dropdown.element,
    refresh(snapshot) {
      const value = options.valueOf(snapshot)
      for (const [candidate, tile] of tiles) {
        tile.setAttribute('aria-pressed', String(candidate === value))
      }
    },
    destroy() {
      releaseNavigation?.()
      dropdown.destroy()
    },
  }
}

function chevron(document: Document): HTMLElement {
  const wrapper = document.createElement('span')
  wrapper.className = 'trevixal-dropdown__chevron'
  const icon = createIcon(document, 'chevronDown')
  if (icon) wrapper.appendChild(icon)
  return wrapper
}

/** Standard block formats offered by the "Paragraph" select. */
export function defaultBlockFormats(): readonly SelectOption[] {
  return [
    { value: 'paragraph', label: 'Paragraph' },
    { value: 'heading:1', label: 'Heading 1', previewStyle: 'font-size:1.5rem;font-weight:600' },
    { value: 'heading:2', label: 'Heading 2', previewStyle: 'font-size:1.3rem;font-weight:600' },
    { value: 'heading:3', label: 'Heading 3', previewStyle: 'font-size:1.15rem;font-weight:600' },
    { value: 'heading:4', label: 'Heading 4', previewStyle: 'font-weight:600' },
    { value: 'heading:5', label: 'Heading 5', previewStyle: 'font-weight:600' },
    { value: 'heading:6', label: 'Heading 6', previewStyle: 'font-weight:600' },
    { value: 'blockquote', label: 'Quote' },
    { value: 'codeBlock', label: 'Code block', previewStyle: 'font-family:monospace' },
  ]
}

/** Font stacks offered by the font select. */
export function defaultFontFamilies(): readonly SelectOption[] {
  const families = [
    ['Open Sans', "'Open Sans', system-ui, sans-serif"],
    ['System UI', 'system-ui, sans-serif'],
    ['Arial', 'Arial, Helvetica, sans-serif'],
    ['Georgia', 'Georgia, serif'],
    ['Times New Roman', "'Times New Roman', Times, serif"],
    ['Courier New', "'Courier New', Courier, monospace"],
    ['Verdana', 'Verdana, Geneva, sans-serif'],
    ['Tahoma', 'Tahoma, Geneva, sans-serif'],
  ]
  return families.map(([label, value]) => ({
    value: value as string,
    label: label as string,
    previewStyle: `font-family:${value}`,
  }))
}

/** Point sizes offered by the size select, mirroring familiar editors. */
export function defaultFontSizes(): readonly SelectOption[] {
  return ['8pt', '10pt', '12pt', '14pt', '18pt', '24pt', '36pt', '48pt'].map((size) => ({
    value: size,
    label: size,
  }))
}

/** Resolve the block-format select value from a snapshot. */
export function blockFormatValue(snapshot: EditorSnapshot): string | null {
  if (!snapshot.blockType) return null
  if (snapshot.blockType === 'heading') {
    const level = snapshot.blockAttrs?.level
    return typeof level === 'number' ? `heading:${level}` : 'heading:1'
  }
  return snapshot.blockType
}

/** Apply a block-format select value to the editor. */
export function applyBlockFormat(editor: Editor, value: string): void {
  const [type, level] = value.split(':')
  if (type === 'heading' && level) {
    editor.commands.setHeading(Number(level))
    return
  }
  if (type === 'blockquote') {
    editor.commands.wrapIn('blockquote')
    return
  }
  if (type) editor.commands.setBlockType(type)
}
