/**
 * The dialogs behind Insert ▸ Form field and filling a field in: what a new
 * field is called and asks for, and the value a reader gives it.
 */
import { type FieldKind, type FormField, fieldName } from '@trevixal/extension-forms'
import { openDialog, openInfoDialog } from '@trevixal/ui'

const KIND_TITLES: Readonly<Record<FieldKind, string>> = {
  text: 'Text box',
  checkbox: 'Tick box',
  dropdown: 'Drop-down list',
  date: 'Date',
  signature: 'Signature',
}

/** What `fieldName` takes, said for the reader. */
const NAME_RULE = 'Letters, digits, _ and -, starting with a letter or _, and no spaces.'

/** Ask what a new field is called and prompts with; null when cancelled or not a name. */
export async function askNewField(kind: FieldKind): Promise<FormField | null> {
  const values = await openDialog({
    document,
    title: KIND_TITLES[kind],
    submitLabel: 'Insert',
    body: 'The name is what a mail merge fills it from, and what a PDF form calls it.',
    fields: [
      {
        name: 'name',
        label: 'Name',
        type: 'text',
        required: true,
        placeholder: 'client_name',
        hint: NAME_RULE,
      },
      { name: 'label', label: 'Label', type: 'text', placeholder: 'Client name' },
      ...(kind === 'dropdown'
        ? [
            {
              name: 'options',
              label: 'Choices, one a line',
              type: 'textarea' as const,
              required: true,
            },
          ]
        : []),
    ],
  })
  if (!values) return null
  const name = fieldName(values.name)
  if (!name) {
    await openInfoDialog({
      document,
      title: 'Not a field name',
      body: `“${values.name ?? ''}” cannot name a field. ${NAME_RULE}`,
    })
    return null
  }
  const options = (values.options ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return { kind, name, label: values.label?.trim() ?? '', options, value: '' }
}

/** Ask a reader for a field's value; null leaves it as it was. */
export async function askFieldValue(field: FormField): Promise<string | null> {
  const label = field.label || field.name
  const values = await openDialog({
    document,
    title: label,
    submitLabel: field.kind === 'signature' ? 'Sign' : 'Fill in',
    ...(field.kind === 'signature' ? { body: 'Type your name to sign.' } : {}),
    fields: [
      field.kind === 'dropdown'
        ? {
            name: 'value',
            label,
            type: 'select',
            value: field.value || (field.options[0] ?? ''),
            options: field.options.map((option) => ({ value: option, label: option })),
          }
        : {
            name: 'value',
            label,
            type: field.kind === 'date' ? 'date' : 'text',
            value: field.value,
          },
    ],
  })
  return values ? (values.value ?? '') : null
}
