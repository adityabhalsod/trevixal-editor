// @vitest-environment happy-dom
import {
  type Editor,
  Schema,
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
  createAuditLog,
  createSigningKeys,
  derToRaw,
  documentDigest,
  setDocumentSignature,
  signDocument,
  verifyDocument,
} from '../src'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
const editors: Editor[] = []

function mount(html: string): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host, doc: parseHTML(schema, html, document) })
  editors.push(editor)
  return editor
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
  document.body.innerHTML = ''
})

describe('signatures', () => {
  it('check out on the document signed, and say when it has changed since', async () => {
    const editor = mount('<p>Terms agreed.</p>')
    const keys = await createSigningKeys()
    const record = await signDocument(editor.state.doc, keys, 'Ada', 1000)
    editor.exec(setDocumentSignature(record))
    // The signature covers everything but itself.
    expect(await documentDigest(editor.state.doc)).toBe(record.digest)
    expect(await verifyDocument(editor.state.doc)).toMatchObject({ state: 'valid', signer: 'Ada' })

    // It travels with the saved page, and still checks out there.
    const saved = parseHTML(schema, serializeToHTML(editor.state.doc), document)
    expect((await verifyDocument(saved)).state).toBe('valid')

    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 13))))
    editor.commands.insertText(' Mostly.')
    expect((await verifyDocument(editor.state.doc)).state).toBe('changed')
  })

  it('refuse a signature someone else’s key did not make', async () => {
    const editor = mount('<p>Terms agreed.</p>')
    const record = await signDocument(editor.state.doc, await createSigningKeys(), 'Ada')
    const other = await signDocument(editor.state.doc, await createSigningKeys(), 'Mallory')
    editor.exec(setDocumentSignature({ ...record, value: other.value }))
    expect((await verifyDocument(editor.state.doc)).state).toBe('invalid')
    expect((await verifyDocument(mount('<p>Plain</p>').state.doc)).state).toBe('unsigned')
  })

  it('reads a DER signature as the raw pair WebCrypto checks', () => {
    const r = new Uint8Array(32).fill(1)
    const s = new Uint8Array(32).fill(2)
    // r with a sign byte in front, as DER writes a high first bit.
    r[0] = 0x80
    const der = new Uint8Array([0x30, 69, 0x02, 33, 0, ...r, 0x02, 32, ...s])
    const raw = derToRaw(der)
    expect([...raw.subarray(0, 32)]).toEqual([...r])
    expect([...raw.subarray(32)]).toEqual([...s])
  })
})

describe('the audit log', () => {
  it('groups one person’s edits close together, and writes the log as CSV', () => {
    const editor = mount('<p>Draft</p>')
    let time = 0
    let author = 'Ada'
    const log = createAuditLog(editor, { author: () => author, now: () => time })
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 5))))
    editor.commands.insertText(' one')
    time = 30_000
    editor.commands.insertText(' two')
    time = 200_000
    author = 'Sam'
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 12), pos([0], 13))))
    editor.commands.deleteSelection()
    const entries = log.entries()
    expect(entries.map((entry) => [entry.author, entry.inserted, entry.deleted])).toEqual([
      ['Ada', 8, 0],
      ['Sam', 0, 1],
    ])
    expect(entries[0]?.where).toBe('Draft one two')
    const csv = log.toCSV().split('\r\n')
    expect(csv[0]).toBe('Started,Ended,Author,Inserted,Deleted,Formatting,Where')
    expect(csv[1]).toBe(
      '1970-01-01T00:00:00.000Z,1970-01-01T00:00:30.000Z,Ada,8,0,no,Draft one two',
    )
    log.destroy()
  })
})
