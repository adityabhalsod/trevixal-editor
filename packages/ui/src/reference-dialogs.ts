import {
  type Command,
  type Editor,
  type EditorNode,
  NodeSelection,
  type Selection,
  nodeAtPath,
  serializeToText,
} from '@trevixal/core'
import { openDialog, openInfoDialog } from './dialog'
import { selectionDocument } from './documents'
import type { BlockCommands, ReferenceTargetInfo } from './toolbar'

/**
 * The Insert menu's reference entries: Caption…, Cross-reference…, Table of
 * figures, Mark index entry…, Index and Endnote, each wired to the commands
 * `@trevixal/extension-blocks` supplies, and left out where it supplies none.
 */

/** The words a caption starts with. They are document text, so a reader can change them. */
const CAPTION_LABELS = { figure: 'Figure', table: 'Table', equation: 'Equation' } as const

type CaptionKindName = keyof typeof CAPTION_LABELS

const CAPTION_KINDS = Object.keys(CAPTION_LABELS) as CaptionKindName[]

/** What the selection is on, to start the dialog on the likely label. */
function captionKindAt(editor: Editor): CaptionKindName {
  const selection = editor.state.selection
  const path = selection instanceof NodeSelection ? selection.path : selection.from.path
  for (let depth = path.length; depth >= 0; depth--) {
    const name = nodeAtPath(editor.state.doc, path.slice(0, depth))?.type.name
    if (name === 'table') return 'table'
    if (name === 'mathBlock') return 'equation'
  }
  return 'figure'
}

/** How the cross-reference dialog lists a target. */
function describe(target: ReferenceTargetInfo): string {
  switch (target.kind) {
    case 'heading':
      return `Heading: ${target.full || target.label}`
    case 'footnote':
      return `Footnote ${target.number}`
    case 'endnote':
      return `Endnote ${target.number}`
    default:
      return target.full || target.label
  }
}

/**
 * Run `command` on the selection a dialog was opened over. `exec` first reads
 * the selection back from the browser, which has no way to show a selected
 * image or equation, so after a dialog a caption meant for the figure would
 * go wherever the browser's caret was. While the document is unchanged the
 * saved selection is still exact, and the command runs on it directly.
 */
function execOnSelection(
  editor: Editor,
  selection: Selection,
  doc: EditorNode,
  command: Command,
): void {
  if (editor.state.doc !== doc) {
    editor.exec(command)
    return
  }
  if (!editor.state.selection.eq(selection)) {
    editor.dispatch(editor.state.tr.setSelection(selection))
  }
  const tr = command(editor.state)
  if (tr) editor.dispatch(tr)
}

const FORMATS = [
  { value: 'label', label: 'Label and number ("Figure 2", or a heading’s number)' },
  { value: 'number', label: 'Number only' },
  { value: 'text', label: 'Text only' },
  { value: 'full', label: 'All of it ("Figure 2: A cat")' },
] as const

/** The entries to wire, by menu name, for the commands `blocks` offers. */
export function referenceEntries(
  blocks: BlockCommands,
  document: Document,
): [name: string, run: (editor: Editor) => void][] {
  const entries: [string, (editor: Editor) => void][] = []

  for (const [name, command] of [
    ['insertEndnote', blocks.insertEndnote],
    ['insertDocumentIndex', blocks.insertDocumentIndex],
  ] as const) {
    if (command) entries.push([name, (target) => void target.exec(command)])
  }

  const captionList = blocks.insertCaptionList
  if (captionList) {
    for (const kind of CAPTION_KINDS) {
      entries.push([`captionList-${kind}`, (target) => void target.exec(captionList(kind))])
    }
  }

  const caption = blocks.insertCaption
  if (caption) {
    entries.push([
      'insertCaption',
      (target) => {
        const { selection, doc } = target.state
        void openDialog({
          document,
          title: 'Insert caption',
          submitLabel: 'Insert',
          body: 'Numbered in order with the others of its kind, and renumbered as they move.',
          fields: [
            {
              name: 'kind',
              label: 'Label',
              type: 'select',
              value: captionKindAt(target),
              options: CAPTION_KINDS.map((kind) => ({ value: kind, label: CAPTION_LABELS[kind] })),
            },
            { name: 'text', label: 'Caption', type: 'text', placeholder: 'What it shows' },
          ],
        }).then((values) => {
          target.view?.focus()
          if (!values) return
          const kind = CAPTION_KINDS.find((each) => each === values.kind) ?? 'figure'
          execOnSelection(
            target,
            selection,
            doc,
            caption(kind, CAPTION_LABELS[kind], values.text ?? ''),
          )
        })
      },
    ])
  }

  const crossReference = blocks.insertCrossReference
  const targetsOf = blocks.referenceTargets
  if (crossReference && targetsOf) {
    entries.push([
      'insertCrossReference',
      (target) => {
        const targets = targetsOf(target.state.doc)
        if (targets.length === 0) {
          void openInfoDialog({
            document,
            title: 'Insert cross-reference',
            body: 'There is nothing to refer to yet. Add a heading, a caption or a footnote first.',
          })
          return
        }
        void openDialog({
          document,
          title: 'Insert cross-reference',
          submitLabel: 'Insert',
          body: 'It follows its target: renumber the figures and it reads the new number.',
          fields: [
            {
              name: 'target',
              label: 'Refer to',
              type: 'select',
              value: '0',
              options: targets.map((entry, index) => ({
                value: String(index),
                label: describe(entry),
              })),
            },
            { name: 'format', label: 'Show', type: 'select', value: 'label', options: FORMATS },
          ],
        }).then((values) => {
          target.view?.focus()
          const chosen = values ? targets[Number(values.target)] : undefined
          if (values && chosen) target.exec(crossReference(chosen, values.format ?? 'label'))
        })
      },
    ])
  }

  const markEntry = blocks.markIndexEntry
  if (markEntry) {
    entries.push([
      'markIndexEntry',
      (target) => {
        const words = serializeToText(selectionDocument(target.state)).replace(/\s+/g, ' ').trim()
        if (target.state.selection.empty || !words) {
          void openInfoDialog({
            document,
            title: 'Mark index entry',
            body: 'Select the words to index first.',
          })
          return
        }
        void openDialog({
          document,
          title: 'Mark index entry',
          submitLabel: 'Mark',
          body: 'Insert ▸ Index lists every marked entry, with a link to each place it is marked.',
          fields: [
            { name: 'entry', label: 'Main entry', type: 'text', value: words, required: true },
            { name: 'sub', label: 'Subentry', type: 'text', placeholder: 'Optional' },
          ],
        }).then((values) => {
          target.view?.focus()
          if (!values?.entry) return
          target.exec(markEntry(values.entry, values.sub ?? ''))
        })
      },
    ])
  }
  return entries
}
