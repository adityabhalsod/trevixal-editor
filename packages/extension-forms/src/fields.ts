import {
  type Command,
  type EditorNode,
  Fragment,
  type NodeSpec,
  type Path,
  ReplaceInlineStep,
  inlineSize,
  insertInlineNode,
  nodeAtPath,
  textblocks,
} from '@trevixal/core'

/**
 * Content controls: a field in the text for someone to fill in, as Word's
 * are. Each is an inline atom with a kind, a name (what a mail merge fills
 * it from, and what a PDF form calls it), a label to prompt with, and the
 * value filled in so far.
 */

export const FORM_FIELD = 'formField'

export type FieldKind = 'text' | 'checkbox' | 'dropdown' | 'date' | 'signature'

export const FIELD_KINDS: readonly FieldKind[] = [
  'text',
  'checkbox',
  'dropdown',
  'date',
  'signature',
]

/** A field as its attrs hold it. */
export interface FormField {
  readonly kind: FieldKind
  readonly name: string
  readonly label: string
  /** A dropdown's choices. */
  readonly options: readonly string[]
  /** What is filled in: text, a choice, `YYYY-MM-DD`, `true`/`false`, a typed signature. */
  readonly value: string
}

/** A field name: letters, digits, `_` and `-`, as CSV headers and PDF forms both take. */
export function fieldName(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z_][\w-]{0,63}$/.test(value.trim())
    ? value.trim()
    : null
}

export function fieldKind(value: unknown): FieldKind {
  return FIELD_KINDS.find((kind) => kind === value) ?? 'text'
}

function parseOptions(value: unknown): string[] {
  if (typeof value !== 'string' || value === '') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((each): each is string => typeof each === 'string')
      : []
  } catch {
    return []
  }
}

/** The field a `formField` node holds. */
export function formFieldOf(node: EditorNode): FormField {
  return {
    kind: fieldKind(node.attrs.kind),
    name: fieldName(node.attrs.name) ?? 'field',
    label: typeof node.attrs.label === 'string' ? node.attrs.label : '',
    options: parseOptions(node.attrs.options),
    value: typeof node.attrs.value === 'string' ? node.attrs.value : '',
  }
}

/** What a field shows in the text: its value, or its label waiting for one. */
export function fieldDisplay(field: FormField): string {
  if (field.kind === 'checkbox') return field.value === 'true' ? '☒' : '☐'
  if (field.value !== '') return field.value
  return field.label || field.name
}

/** The `formField` node, to merge into a schema's nodes. */
export function formFieldNodes(): Record<string, NodeSpec> {
  return {
    [FORM_FIELD]: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: {
        kind: { default: 'text' },
        name: { default: 'field' },
        label: { default: '' },
        options: { default: null },
        value: { default: '' },
      },
      toHTML: (node) => {
        const field = formFieldOf(node)
        const attrs: Record<string, string> = {
          class: `trevixal-field trevixal-field--${field.kind}`,
          'data-form-field': field.kind,
          'data-name': field.name,
          role: field.kind === 'checkbox' ? 'checkbox' : 'button',
          'aria-label': field.label || field.name,
        }
        if (field.kind === 'checkbox') attrs['aria-checked'] = String(field.value === 'true')
        if (field.label) attrs['data-label'] = field.label
        if (field.options.length > 0) attrs['data-options'] = JSON.stringify(field.options)
        if (field.value !== '') attrs['data-value'] = field.value
        if (field.value === '' && field.kind !== 'checkbox') attrs['data-empty'] = ''
        // Text, not markup: what every serializer writes for an atom, Markdown too.
        return { tag: 'span', attrs, text: fieldDisplay(field) }
      },
      parseHTML: [
        {
          tag: 'span',
          attribute: 'data-form-field',
          getAttrs: (element) => {
            const name = fieldName(element.getAttribute('data-name'))
            if (!name) return false
            return {
              kind: fieldKind(element.getAttribute('data-form-field')),
              name,
              label: element.getAttribute('data-label') ?? '',
              options: element.getAttribute('data-options'),
              value: element.getAttribute('data-value') ?? '',
            }
          },
        },
      ],
    },
  }
}

/** Put a field in at the caret. Declines for a name that is not one. */
export function insertFormField(
  field: Omit<FormField, 'value'> & { readonly value?: string },
): Command {
  const name = fieldName(field.name)
  return (state) =>
    name && state.schema.nodes[FORM_FIELD]
      ? insertInlineNode(FORM_FIELD, {
          kind: field.kind,
          name,
          label: field.label.trim().slice(0, 120),
          options: field.options.length > 0 ? JSON.stringify(field.options) : null,
          value: field.value ?? '',
        })(state)
      : null
}

/** A field in the document, where it is. */
export interface FieldAt {
  readonly path: Path
  readonly offset: number
  readonly node: EditorNode
  readonly field: FormField
}

/** Every field in the document, in order. */
export function formFields(doc: EditorNode): FieldAt[] {
  const found: FieldAt[] = []
  for (const { path, node } of textblocks(doc)) {
    let offset = 0
    for (const child of node.content.children) {
      if (child.type.name === FORM_FIELD) {
        found.push({ path, offset, node: child, field: formFieldOf(child) })
      }
      offset += inlineSize(child)
    }
  }
  return found
}

/** Fill in the field at `path` and `offset`. */
export function setFieldValue(path: Path, offset: number, value: string): Command {
  return (state) => {
    const block = nodeAtPath(state.doc, path)
    let at = 0
    for (const child of block?.content.children ?? []) {
      if (at === offset && child.type.name === FORM_FIELD) {
        const tr = state.tr
        tr.step(
          new ReplaceInlineStep(
            path,
            offset,
            offset + inlineSize(child),
            Fragment.of(child.type.create({ ...child.attrs, value })),
          ),
        )
        tr.setSelection(state.selection)
        return tr
      }
      at += inlineSize(child)
    }
    return null
  }
}
