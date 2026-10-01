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
  serializeToMarkdown,
  splitBlock,
} from '@trevixal/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MergeFileError,
  enableFormFields,
  formFieldNodes,
  formFields,
  insertFormField,
  mergeDocument,
  parseCSV,
  parseMergeRows,
  pdfString,
  rowName,
  serializeToPDFForm,
} from '../src'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...formFieldNodes() },
  marks: defaultMarks(),
})
const editors: Editor[] = []

function mount(html: string): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({
    schema,
    element: host,
    doc: parseHTML(schema, html, document),
    // Enter bound as a host binds it, so a field's Enter is seen to win over it.
    keymap: { Enter: (target) => target.exec(splitBlock) },
  })
  editors.push(editor)
  return editor
}

/** A letter: Dear {name field}, a tick box and a dropdown. */
function letter(): Editor {
  const editor = mount('<p>Dear </p><p>Agree </p><p>Plan </p>')
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 5))))
  editor.exec(insertFormField({ kind: 'text', name: 'name', label: 'Name', options: [] }))
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([1], 6))))
  editor.exec(insertFormField({ kind: 'checkbox', name: 'agree', label: 'I agree', options: [] }))
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([2], 5))))
  editor.exec(
    insertFormField({ kind: 'dropdown', name: 'plan', label: 'Plan', options: ['Basic', 'Pro'] }),
  )
  return editor
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
  document.body.innerHTML = ''
})

describe('form fields', () => {
  it('sit in the text, show their label until filled, and come back from the page', () => {
    const editor = letter()
    const html = serializeToHTML(editor.state.doc)
    expect(html).toContain('data-form-field="text" data-name="name"')
    expect(html).toContain('>Name</span>')
    expect(html).toContain('data-options="[&quot;Basic&quot;,&quot;Pro&quot;]"')
    const back = parseHTML(schema, html, document)
    expect(formFields(back).map(({ field }) => [field.kind, field.name])).toEqual([
      ['text', 'name'],
      ['checkbox', 'agree'],
      ['dropdown', 'plan'],
    ])
  })

  it('tick on a click, and ask for any other value', async () => {
    const editor = letter()
    const asked: string[] = []
    const stop = enableFormFields(editor, {
      fill: async (field) => {
        asked.push(field.name)
        return field.name === 'name' ? 'Ada' : null
      },
    })
    const click = (name: string) =>
      (editor.view?.dom.querySelector(`[data-name="${name}"]`) as HTMLElement).click()
    click('agree')
    expect(formFields(editor.state.doc)[1]?.field.value).toBe('true')
    click('name')
    await Promise.resolve()
    await Promise.resolve()
    expect(asked).toEqual(['name'])
    expect(formFields(editor.state.doc)[0]?.field.value).toBe('Ada')
    stop()
  })

  it('fill in from the keyboard: Enter or Space on a selected field', async () => {
    const editor = letter()
    const asked: string[] = []
    const stop = enableFormFields(editor, {
      fill: async (field) => {
        asked.push(field.name)
        return 'Ada'
      },
    })
    const press = (key: string): boolean =>
      editor.view?.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      ) ?? true
    const select = (block: number, from: number, to: number): void =>
      editor.dispatch(
        editor.state.tr.setSelection(new TextSelection(pos([block], from), pos([block], to))),
      )
    // A caret beside a field types as ever: a space is a space.
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([1], 7))))
    expect(press(' ')).toBe(true)
    expect(formFields(editor.state.doc)[1]?.field.value).toBe('')
    select(1, 6, 7)
    expect(press(' ')).toBe(false)
    expect(formFields(editor.state.doc)[1]?.field.value).toBe('true')
    select(0, 5, 6)
    expect(press('Enter')).toBe(false)
    // The key fills the field in and does nothing else: no paragraph split.
    expect(editor.state.doc.childCount).toBe(3)
    await Promise.resolve()
    await Promise.resolve()
    expect(asked).toEqual(['name'])
    expect(formFields(editor.state.doc)[0]?.field.value).toBe('Ada')
    stop()
  })
})

describe('mail merge', () => {
  it('reads CSV with quotes, and JSON, into rows', () => {
    expect(parseCSV('a,b\n"x, y","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ])
    expect(parseMergeRows('name,plan\nAda,Pro\nSam,Basic\n')).toEqual([
      { name: 'Ada', plan: 'Pro' },
      { name: 'Sam', plan: 'Basic' },
    ])
    expect(parseMergeRows('[{"name":"Ada","age":36}]')).toEqual([{ name: 'Ada', age: '36' }])
    expect(() => parseMergeRows('name\n')).toThrow(MergeFileError)
  })

  it('fills each field and placeholder of a copy from its row', () => {
    const editor = letter()
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([2], 5))))
    editor.commands.insertText(' for {{name}} ')
    const merged = mergeDocument(editor.state.doc, { name: 'Ada', agree: 'true', plan: 'Pro' })
    expect(formFields(merged).map(({ field }) => field.value)).toEqual(['Ada', 'true', 'Pro'])
    expect(merged.child(2).textContent).toContain('for Ada')
    // A field is written as what it holds wherever the text goes, Markdown too.
    expect(serializeToMarkdown(merged)).toContain('Dear Ada')
    expect(rowName({ name: 'Ada / Lovelace' }, 0)).toBe('Ada  Lovelace')
    expect(rowName({ name: '' }, 4)).toBe('Document 5')
  })
})

describe('the PDF form', () => {
  it('writes a real field for each one, at a valid cross-reference', () => {
    const editor = letter()
    const bytes = serializeToPDFForm(
      mergeDocument(editor.state.doc, { name: 'Ada', agree: 'true', plan: 'Pro' }),
      { title: 'Letter' },
    )
    const file = String.fromCharCode(...bytes)
    expect(file.startsWith('%PDF-1.7')).toBe(true)
    expect(file).toContain('/AcroForm')
    expect(file).toContain('/FT /Tx /V (Ada)')
    expect(file).toContain('/FT /Btn /V /Yes /AS /Yes')
    expect(file).toContain('/FT /Ch /Ff 131072 /Opt [(Basic) (Pro)] /V (Pro)')
    // Every entry of the cross-reference table points at its object.
    const xref = Number(/startxref\n(\d+)/.exec(file)?.[1])
    const entries = file.slice(xref).split('\n').slice(3)
    entries
      .filter((line) => / 00000 n $/.test(line))
      .forEach((line, index) => {
        const offset = Number(line.slice(0, 10))
        expect(file.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`)
      })
    expect(pdfString('a (b) \\ ’')).toBe('(a \\(b\\) \\\\ \\222)')
  })
})
