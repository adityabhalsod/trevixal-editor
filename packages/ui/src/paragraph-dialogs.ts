import {
  BORDER_STYLES,
  type BorderSide,
  type BorderStyle,
  DROP_CAP_LINES,
  type DropCapKind,
  type Editor,
  MAX_BORDER_WIDTH,
  TAB_ALIGNMENTS,
  TAB_LEADERS,
  type TabStop,
  dropCapOf,
  paragraphBorderOf,
  paragraphShadingOf,
  tabStopsOf,
} from '@trevixal/core'
import { openDialog } from './dialog'

/**
 * Format ▸ Borders and shading…, Format ▸ Drop cap ▸ Drop cap options… and
 * Format ▸ Tabs…: Word's paragraph dialogs, each opened on the paragraph at
 * the caret and applied to every paragraph the selection touches.
 */

/** Word's border presets, as sides. */
const BORDER_PRESETS: readonly { value: string; label: string; sides: readonly BorderSide[] }[] = [
  { value: 'none', label: 'None', sides: [] },
  { value: 'box', label: 'Box', sides: ['top', 'right', 'bottom', 'left'] },
  { value: 'top', label: 'Top', sides: ['top'] },
  { value: 'bottom', label: 'Bottom', sides: ['bottom'] },
  { value: 'topBottom', label: 'Top and bottom', sides: ['top', 'bottom'] },
  { value: 'left', label: 'Left', sides: ['left'] },
  { value: 'right', label: 'Right', sides: ['right'] },
]

const STYLE_LABELS: Readonly<Record<BorderStyle, string>> = {
  solid: 'Solid',
  dashed: 'Dashed',
  dotted: 'Dotted',
  double: 'Double',
}

/** The preset a set of sides matches, or `box` for any other combination. */
function presetOf(sides: readonly BorderSide[]): string {
  const key = [...sides].sort().join(' ')
  const found = BORDER_PRESETS.find((preset) => [...preset.sides].sort().join(' ') === key)
  return found?.value ?? 'box'
}

/** A colour input's value: `#rrggbb` only, which is all `<input type=color>` takes. */
function colorValue(value: string | null, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
}

function openBorders(editor: Editor, document: Document): void {
  const attrs = editor.getSnapshot().blockAttrs ?? {}
  const border = paragraphBorderOf(attrs)
  const shading = paragraphShadingOf(attrs)
  void openDialog({
    document,
    title: 'Borders and shading',
    submitLabel: 'Apply',
    body: 'Applied to every paragraph the selection touches.',
    fields: [
      {
        name: 'sides',
        label: 'Border',
        type: 'select',
        value: border ? presetOf(border.sides) : 'none',
        options: BORDER_PRESETS.map(({ value, label }) => ({ value, label })),
      },
      {
        name: 'style',
        label: 'Style',
        type: 'select',
        value: border?.style ?? 'solid',
        options: BORDER_STYLES.map((style) => ({ value: style, label: STYLE_LABELS[style] })),
        visibleWhen: {
          field: 'sides',
          values: BORDER_PRESETS.slice(1).map((preset) => preset.value),
        },
      },
      {
        name: 'width',
        label: 'Width (px)',
        type: 'number',
        value: String(border?.width ?? 1),
        min: 1,
        max: MAX_BORDER_WIDTH,
        visibleWhen: {
          field: 'sides',
          values: BORDER_PRESETS.slice(1).map((preset) => preset.value),
        },
      },
      {
        name: 'lineColor',
        label: 'Colour',
        type: 'select',
        value: border?.color ? 'custom' : 'auto',
        options: [
          { value: 'auto', label: 'Automatic' },
          { value: 'custom', label: 'Custom' },
        ],
        visibleWhen: {
          field: 'sides',
          values: BORDER_PRESETS.slice(1).map((preset) => preset.value),
        },
      },
      {
        name: 'color',
        label: 'Line colour',
        type: 'color',
        value: colorValue(border?.color ?? null, '#000000'),
        visibleWhen: { field: 'lineColor', values: ['custom'] },
      },
      {
        name: 'fill',
        label: 'Shading',
        type: 'select',
        value: shading ? 'custom' : 'none',
        options: [
          { value: 'none', label: 'No fill' },
          { value: 'custom', label: 'Colour' },
        ],
      },
      {
        name: 'shading',
        label: 'Fill colour',
        type: 'color',
        value: colorValue(shading, '#fff3c4'),
        visibleWhen: { field: 'fill', values: ['custom'] },
      },
    ],
  }).then((values) => {
    editor.view?.focus()
    if (!values) return
    const sides = BORDER_PRESETS.find((preset) => preset.value === values.sides)?.sides ?? []
    const style = BORDER_STYLES.find((each) => each === values.style) ?? 'solid'
    const width = Number.parseInt(values.width ?? '1', 10)
    editor.commands.setParagraphBorder(
      sides.length === 0
        ? null
        : {
            sides,
            style,
            width: Number.isFinite(width) ? width : 1,
            color: values.lineColor === 'custom' ? (values.color ?? null) : null,
          },
    )
    editor.commands.setParagraphShading(values.fill === 'custom' ? (values.shading ?? null) : null)
  })
}

function openDropCap(editor: Editor, document: Document): void {
  const current = dropCapOf(editor.getSnapshot().blockAttrs ?? {})
  void openDialog({
    document,
    title: 'Drop cap',
    submitLabel: 'Apply',
    fields: [
      {
        name: 'kind',
        label: 'Position',
        type: 'select',
        value: current?.kind ?? 'drop',
        options: [
          { value: 'none', label: 'None' },
          { value: 'drop', label: 'Dropped' },
          { value: 'margin', label: 'In margin' },
        ],
      },
      {
        name: 'lines',
        label: 'Lines to drop',
        type: 'number',
        value: String(current?.lines ?? DROP_CAP_LINES.default),
        min: DROP_CAP_LINES.min,
        max: DROP_CAP_LINES.max,
        visibleWhen: { field: 'kind', values: ['drop', 'margin'] },
      },
    ],
  }).then((values) => {
    editor.view?.focus()
    if (!values) return
    const kind: DropCapKind | null =
      values.kind === 'drop' || values.kind === 'margin' ? values.kind : null
    editor.commands.setDropCap(kind, Number.parseInt(values.lines ?? '', 10))
  })
}

/** Points in one of each unit a tab stop may be typed in. */
const POINTS_PER: Readonly<Record<string, number>> = { pt: 1, in: 72, cm: 72 / 2.54, mm: 72 / 25.4 }

/**
 * Tab stops as the dialog lists them, one a line: a position with its unit
 * (centimetres unless it says otherwise), an alignment, then a leader when
 * there is one: `15 cm right dot`.
 */
export function tabStopLines(stops: readonly TabStop[]): string {
  return stops
    .map((stop) => {
      const centimetres = Math.round((stop.position / (POINTS_PER.cm as number)) * 100) / 100
      const leader = stop.leader === 'none' ? '' : ` ${stop.leader}`
      const align = stop.align === 'center' ? 'centre' : stop.align
      return `${centimetres} cm ${align}${leader}`
    })
    .join('\n')
}

/** The lines back as stops. A line whose position does not read is skipped. */
export function parseTabStopLines(text: string): TabStop[] {
  const stops: TabStop[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(\d+(?:[.,]\d+)?)\s*(pt|in|cm|mm)?\b\s*(.*)$/i.exec(line)
    if (!match) continue
    const value = Number.parseFloat((match[1] as string).replace(',', '.'))
    const unit = (match[2] ?? 'cm').toLowerCase()
    // Centre as the rest of the interface spells it, and center as the attribute does.
    const words = (match[3] ?? '')
      .toLowerCase()
      .replace(/\bcentre\b/g, 'center')
      .split(/\s+/)
    const position = value * (POINTS_PER[unit] ?? 1)
    if (!Number.isFinite(position) || position <= 0) continue
    stops.push({
      position: Math.round(position * 100) / 100,
      align: TAB_ALIGNMENTS.find((align) => words.includes(align)) ?? 'left',
      leader: TAB_LEADERS.find((leader) => leader !== 'none' && words.includes(leader)) ?? 'none',
    })
  }
  return stops
}

function openTabStops(editor: Editor, document: Document): void {
  const stops = tabStopsOf(editor.getSnapshot().blockAttrs ?? {})
  void openDialog({
    document,
    title: 'Tabs',
    submitLabel: 'Set',
    body: 'Tab takes the text after it to the next stop. Past the last one, stops fall every half inch.',
    fields: [
      {
        name: 'stops',
        label: 'Tab stops',
        type: 'textarea',
        value: tabStopLines(stops),
        placeholder: '15 cm right dot',
        hint: 'One a line: where (cm, in, mm or pt), then left, centre, right or decimal, then dot, hyphen or underscore to lead to it.',
      },
    ],
  }).then((values) => {
    editor.view?.focus()
    if (!values) return
    const set = parseTabStopLines(values.stops ?? '')
    editor.commands.setTabStops(set.length > 0 ? set : null)
  })
}

/** The Format menu's paragraph dialogs, by menu name. */
export function paragraphFormatEntries(document: Document): [string, (editor: Editor) => void][] {
  return [
    ['bordersAndShading', (editor) => openBorders(editor, document)],
    ['dropCapOptions', (editor) => openDropCap(editor, document)],
    ['tabStops', (editor) => openTabStops(editor, document)],
  ]
}
