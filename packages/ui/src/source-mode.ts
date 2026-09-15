import {
  type Editor,
  parseHTML,
  parseMarkdown,
  serializeToHTML,
  serializeToMarkdown,
} from '@trevixal/core'

export type SourceFormat = 'markdown' | 'html'

export interface SourceModeOptions {
  /** Which source to show; switchable later with `setFormat`. */
  readonly format?: SourceFormat
  /** Called after entering or leaving source mode. */
  readonly onChange?: (active: boolean, format: SourceFormat) => void
}

export interface SourceMode {
  readonly isActive: boolean
  readonly format: SourceFormat
  /** The textarea while active, for hosts that want to style or read it. */
  readonly element: HTMLElement | null
  /** Swap the rich view for the source. */
  enter(): void
  /** Leave source mode; `apply` (default true) parses the source back in. */
  exit(apply?: boolean): void
  toggle(): void
  setFormat(format: SourceFormat): void
  destroy(): void
}

/**
 * Markdown and HTML source modes: the rich surface hides and a textarea with
 * the document's source takes its place. Leaving parses the text back into
 * the document as one undoable step, so a slip in the source is a Ctrl+Z
 * away rather than a lost document.
 */
export function createSourceMode(editor: Editor, options: SourceModeOptions = {}): SourceMode {
  const view = editor.view
  if (!view) throw new Error('createSourceMode: the editor must have a view')
  const doc = view.dom.ownerDocument
  let format: SourceFormat = options.format ?? 'markdown'
  let panel: HTMLElement | null = null
  let textarea: HTMLTextAreaElement | null = null

  const serialize = (): string =>
    format === 'markdown'
      ? serializeToMarkdown(editor.state.doc)
      : serializeToHTML(editor.state.doc)

  const build = (): void => {
    panel = doc.createElement('div')
    panel.className = `trevixal-source trevixal-source--${format}`
    const bar = doc.createElement('div')
    bar.className = 'trevixal-source__bar'
    const label = doc.createElement('span')
    label.className = 'trevixal-source__label'
    label.textContent = format === 'markdown' ? 'Markdown source' : 'HTML source'
    const apply = doc.createElement('button')
    apply.type = 'button'
    apply.className = 'trevixal-source__button trevixal-source__button--primary'
    apply.textContent = 'Apply'
    apply.addEventListener('click', () => mode.exit(true))
    const cancel = doc.createElement('button')
    cancel.type = 'button'
    cancel.className = 'trevixal-source__button'
    cancel.textContent = 'Cancel'
    cancel.addEventListener('click', () => mode.exit(false))
    bar.append(label, apply, cancel)
    textarea = doc.createElement('textarea')
    textarea.className = 'trevixal-source__text'
    textarea.spellcheck = false
    textarea.setAttribute('aria-label', label.textContent)
    textarea.value = serialize()
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        mode.exit(false)
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        mode.exit(true)
      }
    })
    panel.append(bar, textarea)
  }

  const mode: SourceMode = {
    get isActive() {
      return panel !== null
    },
    get format() {
      return format
    },
    get element() {
      return panel
    },
    enter() {
      if (panel) return
      build()
      view.dom.hidden = true
      if (panel) view.dom.insertAdjacentElement('afterend', panel)
      textarea?.focus()
      options.onChange?.(true, format)
    },
    exit(apply = true) {
      if (!panel || !textarea) return
      const source = textarea.value
      panel.remove()
      panel = null
      textarea = null
      view.dom.hidden = false
      if (apply && source !== serialize()) {
        const parsed =
          format === 'markdown'
            ? parseMarkdown(source, editor.schema)
            : parseHTML(editor.schema, source, doc)
        editor.setContent(parsed, { addToHistory: true })
      }
      view.focus()
      options.onChange?.(false, format)
    },
    toggle() {
      if (panel) mode.exit(true)
      else mode.enter()
    },
    setFormat(next) {
      if (next === format) return
      const active = panel !== null
      // Re-enter so the textarea shows the other syntax of the same document.
      if (active) mode.exit(true)
      format = next
      if (active) mode.enter()
    },
    destroy() {
      if (panel) mode.exit(false)
    },
  }
  return mode
}
