import {
  type Command,
  type Editor,
  MAX_COLUMNS,
  MAX_PAGE_MARGIN,
  type PageSection,
  type PageSetup,
  pageMargin,
  pageOrientation,
  pageSetupOf,
  paperSize,
  setDocumentAttrs,
  storedPageSetup,
} from '@trevixal/core'
import { type DialogField, openDialog } from './dialog'
import { PAGE_SIZES } from './theming'

/**
 * File ▸ Page setup and Insert ▸ Section break: how the document is set on
 * paper, and where a section with pages of its own starts. The print, its
 * preview, the page view and the Word export all follow them.
 */

const ORIENTATIONS = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
] as const

const PAGE_FIELD_HINT = '{page} is the page number, {pages} the number of pages.'

const MARGIN_SIDES = [
  ['top', 'Top margin (mm)'],
  ['bottom', 'Bottom margin (mm)'],
  ['left', 'Left margin (mm)'],
  ['right', 'Right margin (mm)'],
] as const

/** A number the reader typed, or null for none. */
const typedNumber = (value: string | undefined): number | null =>
  value === undefined || value.trim() === '' ? null : Number(value)

/** Ask for the document's page setup, and keep it with the document. */
export async function openPageSetupDialog(editor: Editor, document: Document): Promise<void> {
  const setup = pageSetupOf(editor.state.doc.attrs.pageSetup)
  const fields: DialogField[] = [
    {
      name: 'size',
      label: 'Paper',
      type: 'select',
      value: setup.size,
      options: Object.entries(PAGE_SIZES).map(([value, { label }]) => ({ value, label })),
    },
    {
      name: 'orientation',
      label: 'Orientation',
      type: 'select',
      value: setup.orientation,
      options: ORIENTATIONS,
    },
    ...MARGIN_SIDES.map(
      ([side, label]): DialogField => ({
        name: side,
        label,
        type: 'number',
        value: String(setup.margins[side]),
        min: 0,
        max: MAX_PAGE_MARGIN,
      }),
    ),
    { name: 'header', label: 'Header', type: 'text', value: setup.header, hint: PAGE_FIELD_HINT },
    {
      name: 'footer',
      label: 'Footer',
      type: 'text',
      value: setup.footer,
      placeholder: 'Page {page} of {pages}',
      hint: PAGE_FIELD_HINT,
    },
    {
      name: 'watermark',
      label: 'Watermark',
      type: 'text',
      value: setup.watermark,
      placeholder: 'Draft',
    },
  ]
  const values = await openDialog({ document, title: 'Page setup', submitLabel: 'Save', fields })
  editor.view?.focus()
  if (!values) return
  const margin = (side: (typeof MARGIN_SIDES)[number][0]): number =>
    pageMargin(typedNumber(values[side])) ?? setup.margins[side]
  const next: PageSetup = {
    size: paperSize(values.size) ?? setup.size,
    orientation: pageOrientation(values.orientation) ?? setup.orientation,
    margins: {
      top: margin('top'),
      right: margin('right'),
      bottom: margin('bottom'),
      left: margin('left'),
    },
    header: values.header ?? '',
    footer: values.footer ?? '',
    watermark: values.watermark ?? '',
  }
  editor.exec(setDocumentAttrs({ pageSetup: storedPageSetup(next) }))
}

/** Ask what the new section changes, and put its break in after the current block. */
export async function openSectionBreakDialog(
  editor: Editor,
  document: Document,
  insert: (section: PageSection) => Command,
): Promise<void> {
  const values = await openDialog({
    document,
    title: 'Section break',
    submitLabel: 'Insert',
    body: 'What follows, up to the next section break, is set on pages of its own.',
    fields: [
      {
        name: 'orientation',
        label: 'Orientation',
        type: 'select',
        value: '',
        options: [{ value: '', label: 'As the document' }, ...ORIENTATIONS],
      },
      {
        name: 'columns',
        label: 'Columns',
        type: 'select',
        value: '',
        options: [
          { value: '', label: 'As the document' },
          ...Array.from({ length: MAX_COLUMNS }, (_, index) => ({
            value: String(index + 1),
            label: String(index + 1),
          })),
        ],
      },
      {
        name: 'margin',
        label: 'Margins (mm)',
        type: 'number',
        min: 0,
        max: MAX_PAGE_MARGIN,
        hint: 'All four sides. Leave it empty for the document’s.',
      },
    ],
  })
  editor.view?.focus()
  if (!values) return
  editor.exec(
    insert({
      orientation: pageOrientation(values.orientation),
      columns: typedNumber(values.columns),
      margin: pageMargin(typedNumber(values.margin)),
    }),
  )
}
