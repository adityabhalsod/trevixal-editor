import {
  CUSTOM_LEVEL_STYLES,
  type CustomLevelStyle,
  type CustomListLevel,
  DEFAULT_LIST_NUMBERING,
  type Editor,
  LEVEL_INDENT,
  LEVEL_START,
  LIST_LEVELS,
  type ListNumberingScheme,
  customListScheme,
  levelMarker,
  listMarker,
  listNumberingAt,
} from '@trevixal/core'
import { openDialog } from './dialog'
import { defineListNumbering, nextListSchemeId, setTaskDetails, taskDetailsAt } from './list-tools'

/**
 * Format ▸ Lists ▸ Define new multilevel list… and Task due date and
 * assignee…: the list dialogs, each opened on the list at the caret.
 */

/** How the dialog names each numbering style, by its first three numbers. */
const STYLE_LABELS: Readonly<Record<CustomLevelStyle, string>> = {
  decimal: '1, 2, 3',
  'decimal-leading-zero': '01, 02, 03',
  'lower-alpha': 'a, b, c',
  'upper-alpha': 'A, B, C',
  'lower-roman': 'i, ii, iii',
  'upper-roman': 'I, II, III',
  bullet: 'Bullet',
  none: 'No number',
}

/** How many levels the preview draws: enough to show how they nest. */
const PREVIEW_LEVELS = 4

/** The bullet a level becomes when its style is switched to one. */
const DEFAULT_BULLET = '•'

/** `%1.%2.` up to `level` (0-based): an outline number's marker. */
function outlineMarker(level: number): string {
  return `${Array.from({ length: level + 1 }, (_, each) => `%${each + 1}`).join('.')}.`
}

/**
 * A scheme's levels as the dialog edits them: a defined scheme's own, or a
 * built-in one's written out, so defining a scheme starts from what the list
 * shows now, as Word's dialog does.
 */
export function editableLevels(scheme: ListNumberingScheme): CustomListLevel[] {
  if (scheme.custom) return [...scheme.custom]
  return Array.from({ length: LIST_LEVELS }, (_, level): CustomListLevel => {
    const marker = levelMarker(scheme, level)
    if (scheme.listType === 'bulletList') {
      return { style: 'bullet', text: marker, start: 1, indent: 1.5 }
    }
    const style = scheme.outline ? 'decimal' : (marker as CustomLevelStyle)
    const text = scheme.outline ? outlineMarker(level) : `%${level + 1}${scheme.suffix}`
    return { style, text, start: 1, indent: 1.5 }
  })
}

interface LevelControls {
  readonly style: HTMLSelectElement
  readonly text: HTMLInputElement
  readonly start: HTMLInputElement
  readonly indent: HTMLInputElement
}

function numberInput(
  document: Document,
  value: number,
  bounds: { min: number; max: number },
  step: string,
  label: string,
): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'number'
  input.className = 'trevixal-dialog__input'
  input.min = String(bounds.min)
  input.max = String(bounds.max)
  input.step = step
  input.value = String(value)
  input.required = true
  input.setAttribute('aria-label', label)
  return input
}

/** One level's row: its number, then its style, marker, start and indent. */
function levelRow(
  document: Document,
  level: number,
  values: CustomListLevel,
): { row: HTMLTableRowElement; controls: LevelControls } {
  const row = document.createElement('tr')
  const heading = document.createElement('th')
  heading.scope = 'row'
  heading.textContent = String(level + 1)
  const style = document.createElement('select')
  style.className = 'trevixal-dialog__input'
  style.setAttribute('aria-label', `Level ${level + 1} number style`)
  for (const each of CUSTOM_LEVEL_STYLES) {
    const option = document.createElement('option')
    option.value = each
    option.textContent = STYLE_LABELS[each]
    option.selected = each === values.style
    style.appendChild(option)
  }
  const text = document.createElement('input')
  text.type = 'text'
  text.className = 'trevixal-dialog__input'
  text.value = values.text
  text.maxLength = 24
  text.spellcheck = false
  text.setAttribute('aria-label', `Level ${level + 1} marker`)
  const start = numberInput(
    document,
    values.start,
    LEVEL_START,
    '1',
    `Level ${level + 1} starts at`,
  )
  const indent = numberInput(
    document,
    values.indent,
    LEVEL_INDENT,
    '0.1',
    `Level ${level + 1} indent`,
  )
  const cells = [style, text, start, indent].map((control) => {
    const cell = document.createElement('td')
    cell.appendChild(control)
    return cell
  })
  row.append(heading, ...cells)
  return { row, controls: { style, text, start, indent } }
}

/** The levels as the rows hold them now; anything out of bounds is the scheme's to clamp. */
function readLevels(rows: readonly LevelControls[]): CustomListLevel[] {
  return rows.map((row) => ({
    style: row.style.value as CustomLevelStyle,
    text: row.text.value,
    start: Number.parseInt(row.start.value, 10),
    indent: Number.parseFloat(row.indent.value),
  }))
}

/** Draw the first few levels as the list will number them. */
function drawPreview(preview: HTMLElement, scheme: ListNumberingScheme): void {
  const document = preview.ownerDocument
  preview.textContent = ''
  const levels = scheme.custom ?? []
  let indent = 0
  for (let level = 0; level < PREVIEW_LEVELS; level++) {
    indent += levels[level]?.indent ?? 0
    const numbers = levels.slice(0, level + 1).map((each) => each.start)
    const line = document.createElement('div')
    line.className = 'trevixal-listscheme__line'
    line.style.setProperty('--tvx-preview-indent', `${indent}em`)
    const marker = document.createElement('span')
    marker.className = 'trevixal-listscheme__marker'
    marker.textContent = listMarker(scheme, numbers)
    const bar = document.createElement('span')
    bar.className = 'trevixal-listscheme__bar'
    line.append(marker, bar)
    preview.appendChild(line)
  }
}

export interface ListSchemeDialogOptions {
  readonly document: Document
  /** The scheme to start from; a defined one is edited in place, keeping its id. */
  readonly scheme: ListNumberingScheme
  /** The id a new scheme takes when `scheme` is a built-in one. */
  readonly newId: string
}

/**
 * Word's Define New Multilevel List: a name, then each of the nine levels'
 * number style, marker, start and indent, with a preview of the first few
 * drawn as they change. Resolves with the scheme, or null when dismissed.
 */
export function openListSchemeDialog(
  options: ListSchemeDialogOptions,
): Promise<ListNumberingScheme | null> {
  const { document, scheme } = options
  const editing = scheme.custom !== undefined
  const title = editing ? 'Modify multilevel list' : 'Define new multilevel list'
  const id = editing ? scheme.id : options.newId

  const overlay = document.createElement('div')
  overlay.className = 'trevixal-dialog-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'trevixal-dialog trevixal-listscheme'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', title)
  const heading = document.createElement('h2')
  heading.className = 'trevixal-dialog__title'
  heading.textContent = title
  const form = document.createElement('form')
  form.className = 'trevixal-dialog__form'

  const nameField = document.createElement('label')
  nameField.className = 'trevixal-dialog__field'
  const nameLabel = document.createElement('span')
  nameLabel.className = 'trevixal-dialog__label'
  nameLabel.textContent = 'Name'
  const name = document.createElement('input')
  name.type = 'text'
  name.className = 'trevixal-dialog__input'
  name.maxLength = 40
  name.value = editing ? (scheme.name ?? '') : ''
  name.placeholder = `Custom ${id.slice('custom-'.length)}`
  nameField.append(nameLabel, name)

  const hint = document.createElement('p')
  hint.className = 'trevixal-dialog__hint'
  hint.textContent =
    'In a marker, %1 to %9 stand for the numbers of levels 1 to 9, so %1.%2. numbers the second level 1.1. A bullet level’s marker is its symbol. Indents are in em, from the level above.'

  const table = document.createElement('table')
  table.className = 'trevixal-listscheme__levels'
  const head = document.createElement('thead')
  const headRow = document.createElement('tr')
  for (const label of ['Level', 'Number', 'Marker', 'Start at', 'Indent']) {
    const cell = document.createElement('th')
    cell.scope = 'col'
    cell.textContent = label
    headRow.appendChild(cell)
  }
  head.appendChild(headRow)
  const body = document.createElement('tbody')
  const rows: LevelControls[] = []
  editableLevels(scheme).forEach((values, level) => {
    const { row, controls } = levelRow(document, level, values)
    body.appendChild(row)
    rows.push(controls)
  })
  table.append(head, body)
  const scroller = document.createElement('div')
  scroller.className = 'trevixal-listscheme__scroller'
  scroller.appendChild(table)

  const preview = document.createElement('div')
  preview.className = 'trevixal-listscheme__preview'
  preview.setAttribute('aria-hidden', 'true')
  const current = (): ListNumberingScheme =>
    customListScheme(id, name.value || name.placeholder, readLevels(rows))
  const redraw = (): void => drawPreview(preview, current())

  // A level switched to a bullet takes a symbol for its marker, and one
  // switched back to a number takes its own number again.
  rows.forEach((row, level) => {
    row.style.addEventListener('change', () => {
      const bullet = row.style.value === 'bullet'
      const numbered = /%[1-9]/.test(row.text.value)
      if (bullet && (numbered || row.text.value === '')) row.text.value = DEFAULT_BULLET
      if (!bullet && !numbered) row.text.value = `%${level + 1}.`
    })
  })
  form.addEventListener('input', redraw)
  form.addEventListener('change', redraw)
  redraw()

  const actions = document.createElement('div')
  actions.className = 'trevixal-dialog__actions'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'trevixal-dialog__button'
  cancel.textContent = 'Cancel'
  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.className = 'trevixal-dialog__button trevixal-dialog__button--primary'
  submit.textContent = editing ? 'Save' : 'Define'
  actions.append(cancel, submit)

  form.append(nameField, hint, scroller, preview, actions)
  dialog.append(heading, form)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)

  return new Promise((resolve) => {
    let settled = false
    const finish = (value: ListNumberingScheme | null): void => {
      if (settled) return
      settled = true
      document.removeEventListener('keydown', onKeyDown, true)
      overlay.remove()
      resolve(value)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      finish(null)
    }
    document.addEventListener('keydown', onKeyDown, true)
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      finish(current())
    })
    cancel.addEventListener('click', () => finish(null))
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) finish(null)
    })
    name.focus()
  })
}

/** Define a scheme from the list at the caret, or modify the one it has. */
export function openDefineListNumbering(editor: Editor, document: Document): void {
  const { doc, selection } = editor.state
  const scheme = listNumberingAt(doc, selection.from.path) ?? DEFAULT_LIST_NUMBERING
  void openListSchemeDialog({ document, scheme, newId: nextListSchemeId(doc) }).then((defined) => {
    editor.view?.focus()
    if (defined) editor.exec(defineListNumbering(defined))
  })
}

function openTaskDetails(editor: Editor, document: Document): void {
  const details = taskDetailsAt(editor.state)
  if (!details) return
  void openDialog({
    document,
    title: 'Task due date and assignee',
    submitLabel: 'Apply',
    body: 'Shown beside the task. Leave a box empty to clear it.',
    fields: [
      { name: 'assignee', label: 'Assigned to', type: 'text', value: details.assignee ?? '' },
      { name: 'due', label: 'Due', type: 'date', value: details.due ?? '' },
    ],
  }).then((values) => {
    editor.view?.focus()
    if (!values) return
    editor.exec(setTaskDetails({ due: values.due || null, assignee: values.assignee || null }))
  })
}

/** The Format ▸ Lists dialogs, by menu name. */
export function listDialogEntries(document: Document): [string, (editor: Editor) => void][] {
  return [
    ['defineListNumbering', (editor) => openDefineListNumbering(editor, document)],
    ['taskDetails', (editor) => openTaskDetails(editor, document)],
  ]
}
