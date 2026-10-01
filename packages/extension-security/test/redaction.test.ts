// @vitest-environment happy-dom
import {
  type Editor,
  type EditorNode,
  Schema,
  TREVIXAL_MIME,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
  serializeToHTML,
} from '@trevixal/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  REDACTED,
  applyRestrictions,
  hasRedactions,
  protectRedactionsOnCopy,
  redactDocument,
  redactionMarks,
  toggleRedaction,
} from '../src'

const schema = new Schema({
  nodes: defaultNodes(),
  marks: { ...defaultMarks(), ...redactionMarks() },
})
const redaction = schema.marks.redaction
const bold = schema.marks.bold
if (!redaction || !bold) throw new Error('expected the redaction and bold marks')

/** "Pay Sam Jones 40,000 now", with "Sam Jones 40,000" redacted, "Jones" also bold. */
function salaryLine(): EditorNode {
  return schema.node('doc', undefined, [
    schema.node('paragraph', undefined, [
      schema.text('Pay '),
      schema.text('Sam ', [redaction.create()]),
      schema.text('Jones', [bold.create(), redaction.create()]),
      schema.text(' 40,000', [redaction.create()]),
      schema.text(' now'),
    ]),
  ])
}

const editors: Editor[] = []

function mount(doc: EditorNode): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host, doc })
  editors.push(editor)
  return editor
}

function fireClipboard(target: HTMLElement, type: 'copy' | 'cut'): Record<string, string> {
  const store: Record<string, string> = {}
  const event = new Event(type, { cancelable: true, bubbles: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (mime: string) => store[mime] ?? '',
      setData: (mime: string, value: string) => {
        store[mime] = value
      },
    },
  })
  target.dispatchEvent(event)
  return store
}

function selectAllText(editor: Editor): void {
  const block = editor.state.doc.child(0)
  editor.dispatch(
    editor.state.tr.setSelection(
      new TextSelection(pos([0], 0), pos([0], block.textContent.length)),
    ),
  )
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
  document.body.innerHTML = ''
})

describe('a reader’s copy', () => {
  it('has one fixed stand-in for a redacted run, however it was split', () => {
    const redacted = redactDocument(salaryLine())
    expect(redacted.textContent).toBe(`Pay ${REDACTED} now`)
    const html = serializeToHTML(redacted)
    expect(html).toContain(`<span class="trevixal-redacted" data-redacted="">${REDACTED}</span>`)
    expect(html).not.toContain('Jones')
    expect(html).not.toContain('40,000')
  })

  it('leaves a document with nothing redacted as it was', () => {
    const doc = schema.node('doc', undefined, [
      schema.node('paragraph', undefined, [schema.text('Nothing secret')]),
    ])
    expect(hasRedactions(doc)).toBe(false)
    expect(redactDocument(doc).eq(doc)).toBe(true)
  })
})

describe('the redaction mark', () => {
  it('comes back from its HTML', () => {
    const back = parseHTML(schema, serializeToHTML(salaryLine()), document)
    expect(hasRedactions(back)).toBe(true)
    expect(redactDocument(back).textContent).toBe(`Pay ${REDACTED} now`)
  })

  it('is put on the selected words by the command', () => {
    const editor = mount(
      schema.node('doc', undefined, [schema.node('paragraph', undefined, [schema.text('Secret')])]),
    )
    selectAllText(editor)
    expect(editor.exec(toggleRedaction)).toBe(true)
    expect(hasRedactions(editor.state.doc)).toBe(true)
  })
})

describe('copying redacted text', () => {
  it('puts the stand-in on the clipboard, in every type', () => {
    const editor = mount(salaryLine())
    const dispose = protectRedactionsOnCopy(editor)
    selectAllText(editor)
    const clipboard = fireClipboard(editor.view?.dom as HTMLElement, 'copy')
    expect(clipboard['text/plain']).toBe(`Pay ${REDACTED} now`)
    for (const value of Object.values(clipboard)) expect(value).not.toContain('Jones')
    expect(clipboard[TREVIXAL_MIME]).toContain(REDACTED)
    dispose()
  })

  it('still redacts a cut, which deletes the words it read', () => {
    const editor = mount(salaryLine())
    protectRedactionsOnCopy(editor)
    selectAllText(editor)
    const clipboard = fireClipboard(editor.view?.dom as HTMLElement, 'cut')
    expect(clipboard['text/plain']).toBe(`Pay ${REDACTED} now`)
    expect(editor.state.doc.textContent).toBe('')
  })

  it('writes nothing at all when copying is restricted', () => {
    const editor = mount(salaryLine())
    protectRedactionsOnCopy(editor)
    applyRestrictions(editor, { copy: true })
    selectAllText(editor)
    expect(fireClipboard(editor.view?.dom as HTMLElement, 'copy')).toEqual({})
  })
})

describe('what a reader’s copy keeps', () => {
  it('keeps every block it did not change as the same node', () => {
    const plain = schema.node('paragraph', undefined, [schema.text('Nothing secret')])
    const doc = schema.node('doc', undefined, [plain, ...salaryLine().content.children])
    const redacted = redactDocument(doc)
    expect(redacted.child(0)).toBe(plain)
    expect(redacted.child(1)).not.toBe(doc.child(1))
  })
})
