/**
 * Small modal dialogs for the toolbar and menu actions.
 *
 * Built on `<dialog>` where available, with a plain overlay fallback so the
 * kit works in older engines and in test DOMs.
 */

export interface DialogField {
  readonly name: string
  readonly label: string
  readonly type?:
    | 'text'
    | 'url'
    | 'number'
    | 'checkbox'
    | 'textarea'
    | 'select'
    | 'color'
    | 'password'
    | 'email'
    | 'date'
  readonly value?: string
  readonly placeholder?: string
  readonly required?: boolean
  /** Choices for a `select` field. */
  readonly options?: readonly { readonly value: string; readonly label: string }[]
  /** Small print under the control. */
  readonly hint?: string
  /**
   * Bounds for a `number` field. The browser holds a submit to them, so a
   * value out of range never reaches the caller.
   */
  readonly min?: number
  readonly max?: number
  /**
   * Show this field only while another field holds one of `values`. A URL
   * box that only appears when the "kind" select says "web address". A hidden
   * field is disabled, so `required` does not block submit and its value
   * comes back as an empty string.
   */
  readonly visibleWhen?: { readonly field: string; readonly values: readonly string[] }
}

export interface DialogOptions {
  readonly document: Document
  readonly title: string
  readonly fields: readonly DialogField[]
  readonly submitLabel?: string
  readonly cancelLabel?: string
  /** Leading prose above the fields. */
  readonly body?: string
}

export type DialogValues = Readonly<Record<string, string>>

/**
 * Show a modal form and resolve with its values, or null when dismissed.
 * The promise settles exactly once, and the dialog cleans itself up.
 */
export function openDialog(options: DialogOptions): Promise<DialogValues | null> {
  const { document } = options
  const overlay = document.createElement('div')
  overlay.className = 'trevixal-dialog-overlay'

  const dialog = document.createElement('div')
  dialog.className = 'trevixal-dialog'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', options.title)

  const heading = document.createElement('h2')
  heading.className = 'trevixal-dialog__title'
  heading.textContent = options.title

  const form = document.createElement('form')
  form.className = 'trevixal-dialog__form'

  if (options.body) {
    const body = document.createElement('p')
    body.className = 'trevixal-dialog__body'
    body.textContent = options.body
    form.appendChild(body)
  }

  const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>()
  const rows = new Map<string, HTMLElement>()
  for (const field of options.fields) {
    const row = document.createElement('label')
    row.className = 'trevixal-dialog__field'
    if (field.type === 'checkbox') row.classList.add('trevixal-dialog__field--inline')
    const caption = document.createElement('span')
    caption.className = 'trevixal-dialog__label'
    caption.textContent = field.label

    const control = createFieldControl(document, field)
    control.className = 'trevixal-dialog__input'
    if (field.type === 'checkbox') control.classList.add('trevixal-dialog__input--checkbox')
    control.name = field.name
    if ('placeholder' in control && field.placeholder) control.placeholder = field.placeholder
    if (field.required) control.required = true

    if (field.type === 'checkbox') row.append(control, caption)
    else row.append(caption, control)
    if (field.hint) {
      const hint = document.createElement('span')
      hint.className = 'trevixal-dialog__hint'
      hint.textContent = field.hint
      row.appendChild(hint)
    }
    form.appendChild(row)
    inputs.set(field.name, control)
    rows.set(field.name, row)
  }

  // Conditional fields follow the control they depend on, live.
  const applyVisibility = (): void => {
    for (const field of options.fields) {
      if (!field.visibleWhen) continue
      const controller = inputs.get(field.visibleWhen.field)
      const row = rows.get(field.name)
      const control = inputs.get(field.name)
      if (!controller || !row || !control) continue
      const shown = field.visibleWhen.values.includes(controller.value)
      row.hidden = !shown
      control.disabled = !shown
    }
  }
  for (const field of options.fields) {
    const controller = field.visibleWhen ? inputs.get(field.visibleWhen.field) : undefined
    controller?.addEventListener('change', applyVisibility)
    controller?.addEventListener('input', applyVisibility)
  }
  applyVisibility()

  const actions = document.createElement('div')
  actions.className = 'trevixal-dialog__actions'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'trevixal-dialog__button'
  cancel.textContent = options.cancelLabel ?? 'Cancel'
  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.className = 'trevixal-dialog__button trevixal-dialog__button--primary'
  submit.textContent = options.submitLabel ?? 'Save'
  actions.append(cancel, submit)
  form.appendChild(actions)

  dialog.append(heading, form)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)

  return new Promise<DialogValues | null>((resolve) => {
    let settled = false
    const finish = (values: DialogValues | null): void => {
      if (settled) return
      settled = true
      document.removeEventListener('keydown', onKeyDown, true)
      overlay.remove()
      resolve(values)
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish(null)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const values: Record<string, string> = {}
      for (const [name, control] of inputs) {
        if (control.disabled) {
          values[name] = ''
          continue
        }
        values[name] =
          control instanceof HTMLInputElement && control.type === 'checkbox'
            ? String(control.checked)
            : control.value
      }
      finish(values)
    })
    cancel.addEventListener('click', () => finish(null))
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) finish(null)
    })

    const first = [...inputs.values()][0]
    first?.focus()
    if (first instanceof HTMLTextAreaElement) caretToStart(first)
  })
}

/**
 * Put a text box's caret before its first character. A box focused with its
 * value already set has the caret after the last line and scrolls there, so
 * a list or a source would open at its end.
 */
export function caretToStart(box: HTMLTextAreaElement): void {
  box.setSelectionRange(0, 0)
  box.scrollTop = 0
}

/** Build the form control a field asks for, seeded with its value. */
function createFieldControl(
  document: Document,
  field: DialogField,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (field.type === 'textarea') {
    const area = document.createElement('textarea')
    area.value = field.value ?? ''
    area.rows = 8
    return area
  }
  if (field.type === 'select') {
    const select = document.createElement('select')
    for (const option of field.options ?? []) {
      const entry = document.createElement('option')
      entry.value = option.value
      entry.textContent = option.label
      if (option.value === field.value) entry.selected = true
      select.appendChild(entry)
    }
    return select
  }
  const input = document.createElement('input')
  input.type = field.type ?? 'text'
  if (field.type === 'checkbox') input.checked = field.value === 'true'
  else input.value = field.value ?? ''
  if (field.min !== undefined) input.min = String(field.min)
  if (field.max !== undefined) input.max = String(field.max)
  return input
}

export interface ConfirmDialogOptions {
  readonly document: Document
  readonly title: string
  readonly body?: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  /** Style the confirm button as destructive. */
  readonly danger?: boolean
}

/** A yes/no modal; resolves true only when the user confirms. */
export function openConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  const { document } = options
  const overlay = document.createElement('div')
  overlay.className = 'trevixal-dialog-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'trevixal-dialog trevixal-dialog--confirm'
  dialog.setAttribute('role', 'alertdialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', options.title)
  const heading = document.createElement('h2')
  heading.className = 'trevixal-dialog__title'
  heading.textContent = options.title
  dialog.appendChild(heading)
  if (options.body) {
    const body = document.createElement('p')
    body.className = 'trevixal-dialog__body'
    body.textContent = options.body
    dialog.appendChild(body)
  }
  const actions = document.createElement('div')
  actions.className = 'trevixal-dialog__actions'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'trevixal-dialog__button'
  cancel.textContent = options.cancelLabel ?? 'Cancel'
  const confirm = document.createElement('button')
  confirm.type = 'button'
  confirm.className = `trevixal-dialog__button trevixal-dialog__button--primary${
    options.danger ? ' trevixal-dialog__button--danger' : ''
  }`
  confirm.textContent = options.confirmLabel ?? 'OK'
  actions.append(cancel, confirm)
  dialog.appendChild(actions)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)

  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (value: boolean): void => {
      if (settled) return
      settled = true
      document.removeEventListener('keydown', onKeyDown, true)
      overlay.remove()
      resolve(value)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish(false)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    confirm.addEventListener('click', () => finish(true))
    cancel.addEventListener('click', () => finish(false))
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) finish(false)
    })
    confirm.focus()
  })
}

/** One row of an info dialog's table: a term and its description. */
export interface InfoRow {
  readonly term: string
  readonly description: string
}

export interface InfoDialogOptions {
  readonly document: Document
  readonly title: string
  /** Leading prose, shown above any rows. */
  readonly body?: string
  /** Definition rows, e.g. a shortcut and what it does. */
  readonly rows?: readonly InfoRow[]
  readonly closeLabel?: string
}

/**
 * Show a modal with information rather than a form, and resolve when it
 * closes. Same dismissal rules as {@link openDialog}: Escape, the button, or
 * a click on the backdrop.
 */
export function openInfoDialog(options: InfoDialogOptions): Promise<void> {
  const { document } = options
  const overlay = document.createElement('div')
  overlay.className = 'trevixal-dialog-overlay'

  const dialog = document.createElement('div')
  dialog.className = 'trevixal-dialog trevixal-dialog--info'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', options.title)

  const heading = document.createElement('h2')
  heading.className = 'trevixal-dialog__title'
  heading.textContent = options.title
  dialog.appendChild(heading)

  if (options.body) {
    const body = document.createElement('p')
    body.className = 'trevixal-dialog__body'
    body.textContent = options.body
    dialog.appendChild(body)
  }

  if (options.rows?.length) {
    // A <dl> rather than a table: these are term/description pairs, and the
    // grid layout in CSS gives them aligned columns anyway.
    const list = document.createElement('dl')
    list.className = 'trevixal-dialog__rows'
    for (const row of options.rows) {
      const term = document.createElement('dt')
      term.className = 'trevixal-dialog__term'
      term.textContent = row.term
      const description = document.createElement('dd')
      description.className = 'trevixal-dialog__description'
      description.textContent = row.description
      list.append(term, description)
    }
    dialog.appendChild(list)
  }

  const actions = document.createElement('div')
  actions.className = 'trevixal-dialog__actions'
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'trevixal-dialog__button trevixal-dialog__button--primary'
  close.textContent = options.closeLabel ?? 'Close'
  actions.appendChild(close)
  dialog.appendChild(actions)

  overlay.appendChild(dialog)
  document.body.appendChild(overlay)

  return new Promise<void>((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      document.removeEventListener('keydown', onKeyDown, true)
      overlay.remove()
      resolve()
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)

    close.addEventListener('click', finish)
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) finish()
    })

    close.focus()
  })
}

/** Characters offered by the "special character" picker. */
export const SPECIAL_CHARACTERS: readonly string[] = [
  '©',
  '®',
  '™',
  '°',
  '±',
  '×',
  '÷',
  '≠',
  '≈',
  '≤',
  '≥',
  '∞',
  '€',
  '£',
  '¥',
  '¢',
  '§',
  '¶',
  '†',
  '‡',
  '•',
  '…',
  '‰',
  'µ',
  '←',
  '→',
  '↑',
  '↓',
  '↔',
  '⇒',
  '⇔',
  '∴',
  '√',
  '∑',
  '∏',
  '∫',
  'α',
  'β',
  'γ',
  'δ',
  'π',
  'σ',
  'ω',
  'Ω',
  'Δ',
  'Σ',
  '“',
  '”',
]

/** A picker entry: the glyph to insert, and a name for its tooltip and label. */
export interface PickerCharacter {
  readonly char: string
  readonly label: string
  /**
   * The category it is filed under, an emoji's "Smileys & Emotion". Entries
   * with groups get a heading each, a bar of the groups to jump between, and
   * a search box over every label.
   */
  readonly group?: string
  /** More words the search box finds it by: an emoji's short code and synonyms. */
  readonly keywords?: readonly string[]
}

/** Text as the search box compares it: lower case, `_` read as a space. */
const searchable = (text: string): string => text.toLowerCase().replace(/_/g, ' ')

export interface CharacterPickerOptions {
  /** Dialog heading (default "Special character"). */
  readonly title?: string
  /** Extra class on the grid, e.g. to widen it for emoji. */
  readonly className?: string
}

/**
 * Show a grid of characters; resolves with the chosen one, or null. Entries
 * may carry a label (an emoji's shortcode), which becomes the tooltip and the
 * accessible name; bare strings label themselves.
 */
export function openCharacterPicker(
  document: Document,
  characters: readonly (string | PickerCharacter)[] = SPECIAL_CHARACTERS,
  options: CharacterPickerOptions = {},
): Promise<string | null> {
  const title = options.title ?? 'Special character'
  const overlay = document.createElement('div')
  overlay.className = 'trevixal-dialog-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'trevixal-dialog trevixal-dialog--chars'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', title)

  const heading = document.createElement('h2')
  heading.className = 'trevixal-dialog__title'
  heading.textContent = title

  const entries = characters.map((entry) =>
    typeof entry === 'string' ? { char: entry, label: entry } : entry,
  )
  const grouped = entries.some((entry) => entry.group)
  const extra = options.className ? ` ${options.className}` : ''
  // Grouped, the grids sit in sections under one scrolling box; otherwise
  // the one grid is the box.
  const box = document.createElement('div')
  box.className = grouped ? `trevixal-charpicker__sections${extra}` : `trevixal-charpicker${extra}`
  dialog.append(heading)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)

  return new Promise<string | null>((resolve) => {
    let settled = false
    const finish = (value: string | null): void => {
      if (settled) return
      settled = true
      document.removeEventListener('keydown', onKeyDown, true)
      overlay.remove()
      resolve(value)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') finish(null)
    }
    document.addEventListener('keydown', onKeyDown, true)

    const words = new Map<HTMLButtonElement, string>()
    const itemFor = ({ char, label, keywords }: PickerCharacter): HTMLButtonElement => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trevixal-charpicker__item'
      button.textContent = char
      button.setAttribute('aria-label', label)
      if (label !== char) button.title = label
      button.dataset.trevixalChar = label
      button.addEventListener('click', () => finish(char))
      words.set(button, searchable([label, ...(keywords ?? [])].join(' ')))
      return button
    }
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) finish(null)
    })

    if (!grouped) {
      box.append(...entries.map(itemFor))
      dialog.append(box)
      box.querySelector('button')?.focus()
      return
    }

    const sections = new Map<string, HTMLElement>()
    for (const entry of entries) {
      const name = entry.group ?? ''
      let section = sections.get(name)
      if (!section) {
        section = document.createElement('section')
        section.className = 'trevixal-charpicker__section'
        section.setAttribute('aria-label', name)
        const label = document.createElement('h3')
        label.className = 'trevixal-charpicker__heading'
        label.textContent = name
        const grid = document.createElement('div')
        grid.className = 'trevixal-charpicker'
        section.append(label, grid)
        sections.set(name, section)
        box.appendChild(section)
      }
      section.lastElementChild?.appendChild(itemFor(entry))
    }

    // A button per group, its first character for a face, that scrolls the
    // box to the group's heading.
    const bar = document.createElement('div')
    bar.className = 'trevixal-charpicker__groups'
    bar.setAttribute('role', 'toolbar')
    bar.setAttribute('aria-label', 'Categories')
    for (const [name, section] of sections) {
      const jump = document.createElement('button')
      jump.type = 'button'
      jump.className = 'trevixal-charpicker__group'
      jump.textContent = section.querySelector('.trevixal-charpicker__item')?.textContent ?? name
      jump.title = name
      jump.setAttribute('aria-label', name)
      jump.addEventListener('click', () => {
        box.scrollTop = section.offsetTop - box.offsetTop
      })
      bar.appendChild(jump)
    }

    const search = document.createElement('input')
    search.type = 'search'
    search.className = 'trevixal-charpicker__search'
    search.placeholder = 'Search'
    search.setAttribute('aria-label', `Search ${title.toLowerCase()}`)
    const empty = document.createElement('p')
    empty.className = 'trevixal-charpicker__empty'
    empty.textContent = 'Nothing matches'
    empty.hidden = true
    search.addEventListener('input', () => {
      const query = searchable(search.value.trim())
      let shown = 0
      for (const section of sections.values()) {
        let inSection = 0
        for (const button of section.querySelectorAll<HTMLButtonElement>('button')) {
          const hit = query === '' || (words.get(button) ?? '').includes(query)
          button.hidden = !hit
          if (hit) inSection += 1
        }
        section.hidden = inSection === 0
        shown += inSection
      }
      bar.hidden = query !== ''
      empty.hidden = shown > 0
    })
    // Enter picks the first match, as a search box over a list should.
    search.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      box.querySelector<HTMLButtonElement>('.trevixal-charpicker__item:not([hidden])')?.click()
    })

    dialog.append(search, bar, box, empty)
    search.focus()
  })
}
