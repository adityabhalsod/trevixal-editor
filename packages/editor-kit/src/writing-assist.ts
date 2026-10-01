/**
 * Tools ▸ Writing assistant: the selection (or, to continue, the text before
 * the caret) goes to the host's provider, a dialog shows what came back for
 * the reader to edit, and only what they accept goes into the document.
 */
import {
  type Editor,
  type EditorNode,
  Fragment,
  ReplaceNodesStep,
  TextSelection,
  blocksInRange,
  insertContent,
  insertText,
  pos,
  sliceInline,
} from '@trevixal/core'
import { type AssistAction, AssistError, type WritingProvider } from '@trevixal/extension-writing'
import { UI_LANGUAGES, openDialog, openInfoDialog } from '@trevixal/ui'

/** How much of the text before the caret a provider is given to continue from. */
const CONTINUE_CONTEXT = 2000

const TITLES: Readonly<Record<AssistAction, string>> = {
  rewrite: 'Rewrite',
  summarise: 'Summary',
  translate: 'Translation',
  continue: 'Continue writing',
}

/** The selected text, a block a line. */
function selectedText(editor: Editor): string {
  const { doc, selection } = editor.state
  return blocksInRange(doc, selection.from, selection.to)
    .map((block) => block.node.withContent(sliceInline(block.node.content, block.from, block.to)))
    .map((block) => block.textContent)
    .join('\n')
    .trim()
}

/** The text before the caret, the end of it, to continue from. */
function textBefore(editor: Editor): string {
  const { doc, selection } = editor.state
  const start = pos([0], 0)
  return blocksInRange(doc, start, selection.to)
    .map((block) => block.node.textContent.slice(0, block.to))
    .join('\n')
    .slice(-CONTINUE_CONTEXT)
}

/** A modal that says the assistant is working, with Cancel. */
function showProgress(title: string, cancel: () => void): { close(): void } {
  const overlay = document.createElement('div')
  overlay.className = 'trevixal-dialog-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'trevixal-dialog'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', title)
  dialog.setAttribute('aria-busy', 'true')
  const heading = document.createElement('h2')
  heading.className = 'trevixal-dialog__title'
  heading.textContent = title
  const body = document.createElement('p')
  body.className = 'trevixal-dialog__body'
  body.textContent = 'Asking the writing assistant…'
  const actions = document.createElement('div')
  actions.className = 'trevixal-dialog__actions'
  const stop = document.createElement('button')
  stop.type = 'button'
  stop.className = 'trevixal-dialog__button'
  stop.textContent = 'Cancel'
  stop.addEventListener('click', cancel)
  actions.append(stop)
  dialog.append(heading, body, actions)
  overlay.append(dialog)
  document.body.append(overlay)
  stop.focus()
  return { close: () => overlay.remove() }
}

/** Put text in: one line as typing would, several as paragraphs. */
function putText(editor: Editor, text: string): void {
  const lines = text.split(/\n+/).filter((line) => line.trim() !== '')
  if (lines.length <= 1) {
    editor.exec(insertText(lines[0] ?? ''))
    return
  }
  const paragraph = editor.schema.nodeType('paragraph')
  editor.exec(
    insertContent(
      lines.map(
        (line): EditorNode => paragraph.create(undefined, Fragment.of(editor.schema.text(line))),
      ),
    ),
  )
}

/** Run one assistant action over the selection, and apply what the reader accepts. */
export async function runAssist(
  editor: Editor,
  provider: WritingProvider,
  action: AssistAction,
): Promise<void> {
  const text = action === 'continue' ? textBefore(editor) : selectedText(editor)
  if (text === '') {
    await openInfoDialog({
      document,
      title: TITLES[action],
      body:
        action === 'continue'
          ? 'Write a little first: the assistant continues from the text before the caret.'
          : 'Select the text for the assistant to work on first.',
    })
    editor.view?.focus()
    return
  }
  let language: string | undefined
  if (action === 'translate') {
    const values = await openDialog({
      document,
      title: 'Translate selection',
      submitLabel: 'Translate',
      fields: [
        {
          name: 'language',
          label: 'Into',
          type: 'select',
          value: 'en',
          options: UI_LANGUAGES.map((entry) => ({ value: entry.code, label: entry.name })),
        },
      ],
    })
    if (!values?.language) {
      editor.view?.focus()
      return
    }
    language = values.language
  }
  // The range the answer is for, kept while the provider thinks.
  const range = editor.state.selection
  const controller = new AbortController()
  const progress = showProgress(TITLES[action], () => controller.abort())
  let answer: string
  try {
    answer = await provider.assist(
      { action, text, ...(language ? { language } : {}) },
      { signal: controller.signal },
    )
  } catch (error) {
    progress.close()
    editor.view?.focus()
    if (controller.signal.aborted) return
    await openInfoDialog({
      document,
      title: TITLES[action],
      body: error instanceof AssistError ? error.message : 'The writing assistant did not answer.',
    })
    return
  }
  progress.close()
  const values = await openDialog({
    document,
    title: TITLES[action],
    submitLabel: action === 'rewrite' || action === 'translate' ? 'Replace' : 'Insert',
    cancelLabel: 'Discard',
    fields: [{ name: 'text', label: 'Result', type: 'textarea', value: answer }],
  })
  editor.view?.focus()
  const accepted = values?.text?.trim()
  if (!accepted) return
  if (action === 'rewrite' || action === 'translate') {
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(range.from, range.to)))
    putText(editor, accepted)
    return
  }
  if (action === 'summarise') {
    // Below the selection, as a paragraph of its own.
    const path = range.to.path
    const parent = path.slice(0, -1)
    const at = (path[path.length - 1] ?? 0) + 1
    const paragraph = editor.schema
      .nodeType('paragraph')
      .create(undefined, Fragment.of(editor.schema.text(accepted)))
    const tr = editor.state.tr
    tr.step(new ReplaceNodesStep(parent, at, at, Fragment.of(paragraph)))
    tr.setSelection(new TextSelection(pos([...parent, at], accepted.length)))
    editor.dispatch(tr)
    return
  }
  // Continued from the caret, a space before it when the text needs one.
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(range.to)))
  putText(editor, /\s$/.test(text) ? accepted : ` ${accepted}`)
}
