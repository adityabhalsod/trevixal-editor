import {
  type Editor,
  type NamedStyle,
  type StyleKind,
  type StyleProps,
  characterStyleAt,
  documentStyles,
  newStyleId,
  nodeAtPath,
  paragraphStyleOf,
} from '@trevixal/core'
import { type DialogField, openDialog } from './dialog'
import { createIcon } from './icons'

/**
 * Word's Styles pane: every paragraph and character style the document has,
 * each shown in its own look. Click one to apply it (a character style a
 * second time takes it off again); Modify… changes it, and every paragraph or
 * run in it follows at once; New style… makes one of the writer's own. The
 * styles at the caret are marked as pressed.
 */

export interface StylesPaneOptions {
  /** Where the pane goes. */
  readonly container: HTMLElement
}

export interface StylesPane {
  readonly element: HTMLElement
  /** Redraw from the document now. Called on every update anyway. */
  refresh(): void
  destroy(): void
}

const HEADINGS: Readonly<Record<StyleKind, string>> = {
  paragraph: 'Paragraph styles',
  character: 'Character styles',
}

/** A style's name drawn in its look, as far as a list row can show it. */
function previewOf(props: StyleProps): string {
  const declarations: string[] = []
  if (props.fontFamily) declarations.push(`font-family: ${props.fontFamily}`)
  if (props.color) declarations.push(`color: ${props.color}`)
  if (props.bold !== undefined) declarations.push(`font-weight: ${props.bold ? 700 : 400}`)
  if (props.italic !== undefined)
    declarations.push(`font-style: ${props.italic ? 'italic' : 'normal'}`)
  if (props.underline) declarations.push('text-decoration-line: underline')
  return declarations.join('; ')
}

/** The select a three-way switch is: as the style it is based on, on, or off. */
function switchField(name: string, label: string, value: boolean | undefined): DialogField {
  return {
    name,
    label,
    type: 'select',
    value: value === undefined ? '' : value ? 'on' : 'off',
    options: [
      { value: '', label: 'As based on' },
      { value: 'on', label: 'On' },
      { value: 'off', label: 'Off' },
    ],
  }
}

function numberOf(value: string | undefined): number | undefined {
  const number = Number.parseFloat((value ?? '').replace(',', '.'))
  return Number.isFinite(number) ? number : undefined
}

function switchOf(value: string | undefined): boolean | undefined {
  return value === 'on' ? true : value === 'off' ? false : undefined
}

/** A font stack as typed, a name of several words quoted as CSS wants it: Times New Roman. */
function fontStackOf(value: string | undefined): string | undefined {
  const families = (value ?? '')
    .split(',')
    .map((family) => family.trim())
    .filter(Boolean)
    .map((family) => (/\s/.test(family) && !/^(["']).*\1$/.test(family) ? `"${family}"` : family))
  return families.length > 0 ? families.join(', ') : undefined
}

/** The props a style dialog's values set. Blank is "as the style is based on". */
function propsOf(values: Readonly<Record<string, string>>, kind: StyleKind): StyleProps {
  const props: Record<string, unknown> = {
    fontFamily: fontStackOf(values.fontFamily),
    fontSize: numberOf(values.fontSize),
    color: values.colorChoice === 'custom' ? values.color : undefined,
    bold: switchOf(values.bold),
    italic: switchOf(values.italic),
    underline: switchOf(values.underline),
  }
  if (kind === 'paragraph') {
    props.align = values.align || undefined
    props.spaceBefore = numberOf(values.spaceBefore)
    props.spaceAfter = numberOf(values.spaceAfter)
    props.lineHeight = numberOf(values.lineHeight)
  }
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined))
}

/**
 * The fields a style is edited in. A new style also asks for its name and
 * kind, and shows the paragraph fields only while the kind is paragraph.
 */
function styleFields(style: NamedStyle | null): DialogField[] {
  const props = style?.props ?? {}
  const kind = style?.kind ?? 'paragraph'
  const onlyParagraph = style ? {} : { visibleWhen: { field: 'kind', values: ['paragraph'] } }
  const fields: DialogField[] = []
  if (!style || !style.builtIn) {
    fields.push({
      name: 'name',
      label: 'Name',
      type: 'text',
      value: style?.name ?? '',
      required: true,
    })
  }
  if (!style) {
    fields.push({
      name: 'kind',
      label: 'Style for',
      type: 'select',
      value: 'paragraph',
      options: [
        { value: 'paragraph', label: 'Paragraphs' },
        { value: 'character', label: 'Text in a paragraph' },
      ],
    })
  }
  fields.push(
    {
      name: 'fontFamily',
      label: 'Font',
      type: 'text',
      value: props.fontFamily ?? '',
      placeholder: 'As based on',
    },
    {
      name: 'fontSize',
      label: 'Size (pt)',
      type: 'text',
      value: props.fontSize === undefined ? '' : String(props.fontSize),
      placeholder: 'As based on',
    },
    {
      name: 'colorChoice',
      label: 'Colour',
      type: 'select',
      value: props.color ? 'custom' : '',
      options: [
        { value: '', label: 'As based on' },
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      name: 'color',
      label: 'Text colour',
      type: 'color',
      value: props.color && /^#[0-9a-f]{6}$/i.test(props.color) ? props.color : '#000000',
      visibleWhen: { field: 'colorChoice', values: ['custom'] },
    },
    switchField('bold', 'Bold', props.bold),
    switchField('italic', 'Italic', props.italic),
    switchField('underline', 'Underline', props.underline),
  )
  if (kind === 'paragraph') {
    fields.push(
      {
        name: 'align',
        label: 'Alignment',
        type: 'select',
        value: props.align ?? '',
        options: [
          { value: '', label: 'As based on' },
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Centre' },
          { value: 'right', label: 'Right' },
          { value: 'justify', label: 'Justified' },
        ],
        ...onlyParagraph,
      },
      {
        name: 'spaceBefore',
        label: 'Space before (pt)',
        type: 'text',
        value: props.spaceBefore === undefined ? '' : String(props.spaceBefore),
        ...onlyParagraph,
      },
      {
        name: 'spaceAfter',
        label: 'Space after (pt)',
        type: 'text',
        value: props.spaceAfter === undefined ? '' : String(props.spaceAfter),
        ...onlyParagraph,
      },
      {
        name: 'lineHeight',
        label: 'Line spacing (×)',
        type: 'text',
        value: props.lineHeight === undefined ? '' : String(props.lineHeight),
        placeholder: '1.15',
        ...onlyParagraph,
      },
    )
  }
  return fields
}

export function createStylesPane(editor: Editor, options: StylesPaneOptions): StylesPane {
  const document = options.container.ownerDocument
  const root = document.createElement('section')
  root.className = 'trevixal-styles'
  root.setAttribute('aria-label', 'Styles')
  options.container.appendChild(root)

  const applyButtons = new Map<string, HTMLButtonElement>()
  let drawn: unknown = Symbol('never drawn')

  /** A button that leaves the editor's selection where it is. */
  const button = (className: string, label: string, onClick: () => void): HTMLButtonElement => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = className
    element.addEventListener('mousedown', (event) => event.preventDefault())
    element.addEventListener('click', onClick)
    if (label) element.setAttribute('aria-label', label)
    return element
  }

  const apply = (style: NamedStyle): void => {
    if (style.kind === 'paragraph') editor.commands.setParagraphStyle(style.id)
    else editor.commands.toggleCharacterStyle(style.id)
    editor.view?.focus()
  }

  const modify = (style: NamedStyle | null): void => {
    void openDialog({
      document,
      title: style ? `Modify ${style.name}` : 'New style',
      submitLabel: style ? 'Save' : 'Create',
      body: style
        ? 'Everything in this style changes with it.'
        : 'Made from what is set here, and applied to the selection.',
      fields: styleFields(style),
    }).then((values) => {
      editor.view?.focus()
      if (!values) return
      const kind: StyleKind =
        style?.kind ?? (values.kind === 'character' ? 'character' : 'paragraph')
      const name = values.name?.trim() || style?.name || ''
      const id = style?.id ?? newStyleId(editor.state.doc, name)
      editor.commands.setStyle({ id, name, kind, props: propsOf(values, kind) })
      if (!style) apply({ id, name, kind, builtIn: false, props: {} })
    })
  }

  const remove = (style: NamedStyle): void => {
    editor.commands.deleteStyle(style.id)
    editor.view?.focus()
  }

  const build = (): void => {
    root.replaceChildren()
    applyButtons.clear()
    const styles = documentStyles(editor.state.doc)
    for (const kind of ['paragraph', 'character'] as const) {
      // A level under the panel's own title (the kit's sidebar gives each panel an h3).
      const heading = document.createElement('h4')
      heading.className = 'trevixal-styles__heading'
      heading.textContent = HEADINGS[kind]
      const list = document.createElement('ul')
      list.className = 'trevixal-styles__list'
      for (const style of styles.filter((each) => each.kind === kind)) {
        const row = document.createElement('li')
        row.className = 'trevixal-styles__row'
        row.dataset.styleId = style.id
        const choose = button('trevixal-styles__apply', '', () => apply(style))
        choose.textContent = style.name
        choose.setAttribute('aria-pressed', 'false')
        choose.dataset.trevixalStyle = style.id
        const look = previewOf(style.props)
        if (look) choose.setAttribute('style', look)
        const change = button('trevixal-styles__action', `Modify ${style.name}…`, () =>
          modify(style),
        )
        change.title = 'Modify…'
        const pencil = createIcon(document, 'edit')
        if (pencil) change.appendChild(pencil)
        row.append(choose, change)
        if (!style.builtIn) {
          const drop = button('trevixal-styles__action', `Delete ${style.name}`, () =>
            remove(style),
          )
          drop.title = 'Delete'
          const bin = createIcon(document, 'trash')
          if (bin) drop.appendChild(bin)
          row.appendChild(drop)
        }
        applyButtons.set(`${kind}:${style.id}`, choose)
        list.appendChild(row)
      }
      root.append(heading, list)
    }
    const create = button('trevixal-styles__new', '', () => modify(null))
    create.textContent = 'New style…'
    root.appendChild(create)
  }

  /** Mark the styles at the caret as pressed. */
  const mark = (): void => {
    const state = editor.state
    const block = nodeAtPath(state.doc, state.selection.from.path)
    const paragraph = block?.isTextblock ? paragraphStyleOf(block) : null
    const character = characterStyleAt(state)
    for (const [key, element] of applyButtons) {
      const [kind, id] = key.split(':')
      const pressed = kind === 'paragraph' ? id === paragraph : id === character
      element.setAttribute('aria-pressed', String(pressed))
    }
  }

  const refresh = (): void => {
    const styles = editor.state.doc.attrs.styles
    if (styles !== drawn) {
      drawn = styles
      build()
    }
    mark()
  }
  refresh()
  const stop = editor.on('update', refresh)

  return {
    element: root,
    refresh,
    destroy() {
      stop()
      root.remove()
    },
  }
}
