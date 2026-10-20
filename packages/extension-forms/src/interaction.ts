import { type Editor, inlineSize, pathsEqual } from '@trevixal/core'
import { type FormField, formFields, setFieldValue } from './fields'

export interface FormFieldsOptions {
  /**
   * Ask for a field's new value, from a dialog of the host's: text, a date,
   * a choice, a typed signature. Null leaves it as it was.
   */
  readonly fill: (field: FormField) => Promise<string | null>
}

/** The keys that fill in a selected field, as they press a button. */
const ACTIVATE_KEYS: readonly string[] = ['Enter', ' ']

/**
 * Filling the fields in: a click on a checkbox ticks or clears it, a click
 * on any other field asks for its value; Enter or Space on a selected field
 * (Shift and an arrow key select one) does the same. Returns a disposer.
 */
export function enableFormFields(editor: Editor, options: FormFieldsOptions): () => void {
  const view = editor.view
  if (!view) return () => {}

  /** Fill in the field `index`-th in the document. */
  const activate = (index: number): void => {
    const found = formFields(editor.state.doc)[index]
    if (!found) return
    if (found.field.kind === 'checkbox') {
      editor.exec(
        setFieldValue(found.path, found.offset, found.field.value === 'true' ? 'false' : 'true'),
      )
      return
    }
    void options.fill(found.field).then((value) => {
      editor.view?.focus()
      // Found again: the document may have moved on while the dialog was up.
      const current = formFields(editor.state.doc)[index] ?? found
      if (value !== null) editor.exec(setFieldValue(current.path, current.offset, value))
    })
  }

  /** The index of the field the selection covers exactly, or -1. */
  const selectedField = (): number => {
    const { from, to } = editor.state.selection
    if (!pathsEqual(from.path, to.path)) return -1
    return formFields(editor.state.doc).findIndex(
      (field) =>
        pathsEqual(field.path, from.path) &&
        field.offset === from.offset &&
        field.offset + inlineSize(field.node) === to.offset,
    )
  }

  const onClick = (event: MouseEvent): void => {
    const element = (event.target as Element | null)?.closest?.('[data-form-field]')
    if (!element || !view.dom.contains(element) || !editor.isEditable) return
    event.preventDefault()
    // The fields render in document order.
    activate([...view.dom.querySelectorAll('[data-form-field]')].indexOf(element))
  }
  // An interceptor, not a listener: it runs before the key bindings, so a
  // host's Enter (a list's, a table's) does not also split the paragraph.
  const removeKeys = view.addKeydownInterceptor((event) => {
    if (!ACTIVATE_KEYS.includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) {
      return false
    }
    const index = selectedField()
    if (index < 0) return false
    activate(index)
    return true
  })
  view.dom.addEventListener('click', onClick)
  return () => {
    view.dom.removeEventListener('click', onClick)
    removeKeys()
  }
}
