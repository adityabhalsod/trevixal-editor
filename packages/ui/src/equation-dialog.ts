import { type Command, type Editor, NodeSelection, nodeAtPath, pathOfElement } from '@trevixal/core'

/**
 * The equation dialog: the LaTeX, a palette that writes it for you, and a
 * preview of what it draws. A structure's first `{}` takes the caret, so a
 * fraction is typed numerator first, as in Word's equation editor.
 */

/** One palette button: what it shows, and the LaTeX it puts in. */
interface PaletteEntry {
  readonly label: string
  readonly latex: string
  /** What a screen reader says for it, when the label is a symbol. */
  readonly name: string
}

interface PaletteGroup {
  readonly name: string
  readonly entries: readonly PaletteEntry[]
}

const entry = (label: string, latex: string, name: string): PaletteEntry => ({ label, latex, name })

export const EQUATION_PALETTE: readonly PaletteGroup[] = [
  {
    name: 'Structures',
    entries: [
      entry('a⁄b', '\\frac{}{}', 'Fraction'),
      entry('√', '\\sqrt{}', 'Square root'),
      entry('xⁿ', '^{}', 'Power'),
      entry('xₙ', '_{}', 'Subscript'),
      entry('∑', '\\sum_{i=1}^{n}', 'Sum'),
      entry('∫', '\\int_{a}^{b}', 'Integral'),
      entry('lim', '\\lim_{x \\to \\infty}', 'Limit'),
      entry('( )', '\\left(  \\right)', 'Brackets'),
      entry('[⋯]', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', 'Matrix'),
    ],
  },
  {
    name: 'Greek',
    entries: [
      entry('α', '\\alpha', 'alpha'),
      entry('β', '\\beta', 'beta'),
      entry('γ', '\\gamma', 'gamma'),
      entry('δ', '\\delta', 'delta'),
      entry('θ', '\\theta', 'theta'),
      entry('λ', '\\lambda', 'lambda'),
      entry('μ', '\\mu', 'mu'),
      entry('π', '\\pi', 'pi'),
      entry('σ', '\\sigma', 'sigma'),
      entry('φ', '\\phi', 'phi'),
      entry('ω', '\\omega', 'omega'),
      entry('Δ', '\\Delta', 'capital delta'),
      entry('Σ', '\\Sigma', 'capital sigma'),
      entry('Ω', '\\Omega', 'capital omega'),
    ],
  },
  {
    name: 'Operators',
    entries: [
      entry('±', '\\pm', 'plus or minus'),
      entry('×', '\\times', 'times'),
      entry('÷', '\\div', 'divided by'),
      entry('·', '\\cdot', 'dot'),
      entry('≠', '\\neq', 'not equal'),
      entry('≤', '\\leq', 'less or equal'),
      entry('≥', '\\geq', 'greater or equal'),
      entry('≈', '\\approx', 'approximately'),
      entry('∞', '\\infty', 'infinity'),
      entry('→', '\\rightarrow', 'arrow'),
      entry('⇒', '\\Rightarrow', 'implies'),
      entry('∈', '\\in', 'element of'),
      entry('∀', '\\forall', 'for all'),
      entry('∃', '\\exists', 'there exists'),
      entry('∂', '\\partial', 'partial'),
      entry('∇', '\\nabla', 'nabla'),
    ],
  },
  {
    name: 'Chemistry',
    entries: [
      entry('H₂O', '\\ce{H2O}', 'Chemical formula'),
      entry('⇌', '\\ce{A <=> B}', 'Equilibrium'),
      entry('→Δ', '\\ce{A ->[heat] B}', 'Reaction with a condition'),
      entry('SO₄²⁻', '\\ce{SO4^2-}', 'Ion'),
    ],
  },
]

export interface EquationDialogOptions {
  readonly document: Document
  readonly title: string
  readonly submitLabel?: string
  /** The source to start from, editing an equation that is there. */
  readonly latex?: string
  /** Offer "Number this equation", ticked or not; left out for inline formulas. */
  readonly numbered?: boolean
  /** Draw LaTeX as the document does, for the preview; trusted markup. */
  readonly render?: (latex: string, display: boolean) => string
  /** Whether the formula stands on its own line, which is how the preview draws it. */
  readonly display?: boolean
}

export interface EquationDialogResult {
  readonly latex: string
  readonly numbered: boolean
}

/**
 * Put LaTeX in at the textarea's caret, over what is selected, and leave the
 * caret in the first empty `{}` it brought, or after it.
 */
export function insertAtCaret(area: HTMLTextAreaElement, latex: string): void {
  const start = area.selectionStart ?? area.value.length
  const end = area.selectionEnd ?? start
  area.value = area.value.slice(0, start) + latex + area.value.slice(end)
  const hole = latex.indexOf('{}')
  const caret = start + (hole >= 0 ? hole + 1 : latex.length)
  area.setSelectionRange(caret, caret)
}

/** Open the dialog; resolves with the LaTeX and the numbering, or null when cancelled. */
export function openEquationDialog(
  options: EquationDialogOptions,
): Promise<EquationDialogResult | null> {
  const { document } = options
  const overlay = document.createElement('div')
  overlay.className = 'trevixal-dialog-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'trevixal-dialog trevixal-equation'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', options.title)
  const heading = document.createElement('h2')
  heading.className = 'trevixal-dialog__title'
  heading.textContent = options.title
  const form = document.createElement('form')
  form.className = 'trevixal-dialog__form'

  const palette = document.createElement('div')
  palette.className = 'trevixal-equation__palette'
  palette.setAttribute('role', 'toolbar')
  palette.setAttribute('aria-label', 'Equation palette')
  const area = document.createElement('textarea')
  area.className = 'trevixal-dialog__input trevixal-equation__source'
  area.name = 'latex'
  area.rows = 3
  area.required = true
  area.spellcheck = false
  area.placeholder = 'a^2 + b^2 = c^2'
  area.value = options.latex ?? ''
  area.setAttribute('aria-label', 'LaTeX')

  for (const group of EQUATION_PALETTE) {
    const set = document.createElement('div')
    set.className = 'trevixal-equation__group'
    set.setAttribute('role', 'group')
    set.setAttribute('aria-label', group.name)
    for (const item of group.entries) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trevixal-equation__key'
      button.textContent = item.label
      button.title = `${item.name}: ${item.latex}`
      button.setAttribute('aria-label', item.name)
      button.addEventListener('click', () => {
        insertAtCaret(area, item.latex)
        area.focus()
        redraw()
      })
      set.appendChild(button)
    }
    palette.appendChild(set)
  }

  const preview = document.createElement('div')
  preview.className = 'trevixal-equation__preview'
  preview.setAttribute('aria-live', 'polite')
  const redraw = (): void => {
    const latex = area.value.trim()
    if (!options.render || !latex) {
      preview.textContent = latex ? '' : 'The equation shows here as you type it.'
      return
    }
    preview.innerHTML = options.render(latex, options.display === true)
  }
  area.addEventListener('input', redraw)

  const source = document.createElement('label')
  source.className = 'trevixal-dialog__field'
  const caption = document.createElement('span')
  caption.className = 'trevixal-dialog__label'
  caption.textContent = 'LaTeX'
  source.append(caption, area)
  form.append(palette, source, preview)

  let numbered: HTMLInputElement | null = null
  if (options.numbered !== undefined) {
    const row = document.createElement('label')
    row.className = 'trevixal-dialog__field trevixal-dialog__field--inline'
    numbered = document.createElement('input')
    numbered.type = 'checkbox'
    numbered.name = 'numbered'
    numbered.className = 'trevixal-dialog__input trevixal-dialog__input--checkbox'
    numbered.checked = options.numbered
    const label = document.createElement('span')
    label.className = 'trevixal-dialog__label'
    label.textContent = 'Number this equation, as (1), (2)…'
    row.append(numbered, label)
    form.appendChild(row)
  }

  const actions = document.createElement('div')
  actions.className = 'trevixal-dialog__actions'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'trevixal-dialog__button'
  cancel.textContent = 'Cancel'
  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.className = 'trevixal-dialog__button trevixal-dialog__button--primary'
  submit.textContent = options.submitLabel ?? 'Insert'
  actions.append(cancel, submit)
  form.appendChild(actions)
  dialog.append(heading, form)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)
  redraw()

  return new Promise((resolve) => {
    let settled = false
    const finish = (result: EquationDialogResult | null): void => {
      if (settled) return
      settled = true
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
      resolve(result)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      finish(null)
    }
    document.addEventListener('keydown', onKey, true)
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const latex = area.value.trim()
      if (!latex) return
      finish({ latex, numbered: numbered?.checked === true })
    })
    cancel.addEventListener('click', () => finish(null))
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) finish(null)
    })
    area.focus()
    area.setSelectionRange(area.value.length, area.value.length)
  })
}

/** What editing an equation in place needs from the math extension. */
export interface EquationEditCommands {
  readonly setMathLatex: (latex: string) => Command
  readonly setMathNumbered?: (numbered: boolean) => Command
  readonly render?: (latex: string, display: boolean) => string
}

/**
 * Double-click an equation to edit it in the equation dialog, its palette
 * and preview included; a display equation's numbering is there too.
 * Returns a disposer.
 */
export function bindEquationEditing(editor: Editor, commands: EquationEditCommands): () => void {
  const view = editor.view
  if (!view) return () => {}
  const document = view.dom.ownerDocument
  const onDoubleClick = (event: MouseEvent): void => {
    const element = (event.target as Element | null)?.closest?.('.trevixal-math')
    if (!(element instanceof HTMLElement) || !view.dom.contains(element)) return
    const path = pathOfElement(view.dom, view.renderer, element)
    const node = path ? nodeAtPath(editor.state.doc, path) : null
    if (!path || !node) return
    event.preventDefault()
    const select = (): void => {
      editor.dispatch(editor.state.tr.setSelection(new NodeSelection(path)))
    }
    select()
    const block = node.type.name === 'mathBlock'
    void openEquationDialog({
      document,
      title: 'Edit equation',
      submitLabel: 'Apply',
      latex: typeof node.attrs.latex === 'string' ? node.attrs.latex : '',
      numbered: block && commands.setMathNumbered ? node.attrs.numbered === true : undefined,
      render: commands.render,
      display: block,
    }).then((result) => {
      if (result) {
        select()
        editor.exec(commands.setMathLatex(result.latex))
        if (block && commands.setMathNumbered)
          editor.exec(commands.setMathNumbered(result.numbered))
      }
      // Focus last, so the page takes the equation's selection, not a caret.
      view.focus()
    })
  }
  view.dom.addEventListener('dblclick', onDoubleClick)
  return () => view.dom.removeEventListener('dblclick', onDoubleClick)
}
