/**
 * The two reports under Tools that read the whole document: its
 * accessibility, and the text it shares with the rest of the workspace.
 * Each lists what it found, and each finding takes the reader to the place.
 */
import {
  type Editor,
  NodeSelection,
  type Path,
  TextSelection,
  nodeAtPath,
  nodeFromJSON,
  pos,
} from '@trevixal/core'
import {
  ACCESSIBILITY_KIND_LABELS,
  auditAccessibility,
  findDuplicatePassages,
  openFindingsReport,
} from '@trevixal/extension-writing'
import { editorTheme } from '@trevixal/ui'
import type { DocumentWorkspace } from './workspace'

/** Select a range of a textblock, or a whole node, and bring it into view. */
function goTo(editor: Editor, path: Path, from?: number, to?: number): void {
  const node = nodeAtPath(editor.state.doc, path)
  if (!node) return
  const selection =
    from !== undefined && to !== undefined
      ? new TextSelection(pos(path, from), pos(path, to))
      : node.isTextblock
        ? new TextSelection(pos(path, 0))
        : new NodeSelection(path)
  editor.dispatch(editor.state.tr.setSelection(selection))
  editor.view?.focus()
  editor.view?.scrollSelectionIntoView()
}

/** Tools ▸ Accessibility check…: alt text, headings, links, contrast and tables. */
export async function showAccessibilityReport(editor: Editor): Promise<void> {
  const background = editorTheme(editor)?.tokens['color-bg']
  const issues = auditAccessibility(editor.state.doc, background ? { background } : {})
  await openFindingsReport(document, {
    title: 'Accessibility check',
    empty:
      'Nothing found: every image has alt text, the headings go in order, and every link says where it goes.',
    findings: issues.map((issue) => ({
      heading: ACCESSIBILITY_KIND_LABELS[issue.kind],
      message: issue.message,
      go: () => goTo(editor, issue.path, issue.from, issue.to),
    })),
  })
}

/** Tools ▸ Find duplicate text…: sentences another workspace document also has. */
export async function showDuplicateText(
  editor: Editor,
  workspace: DocumentWorkspace,
): Promise<void> {
  const store = await workspace.store()
  const active = workspace.activeId()
  const others = []
  for (const meta of store.list()) {
    if (meta.id === active) continue
    const record = await store.get(meta.id)
    if (record)
      others.push({ id: meta.id, title: meta.title, doc: nodeFromJSON(editor.schema, record.doc) })
  }
  const passages = findDuplicatePassages(editor.state.doc, others)
  await openFindingsReport(document, {
    title: 'Duplicate text',
    empty:
      others.length === 0
        ? 'There are no other documents in the workspace to compare with.'
        : 'No sentence here appears in another document of the workspace.',
    findings: passages.map((passage) => ({
      heading: `Also in ${passage.foundIn.map((where) => `“${where.title}”`).join(', ')}`,
      message: passage.text,
      go: () => goTo(editor, passage.path, passage.from, passage.to),
    })),
  })
}
