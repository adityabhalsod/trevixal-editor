// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { type Editor, createEditor } from '../src/editor/editor'
import { defaultInputRules } from '../src/input-rules/input-rules'
import { autocorrectRule, smartTypographyRules } from '../src/input-rules/typography'
import { Fragment } from '../src/model/fragment'
import { pos } from '../src/model/position'
import { TextSelection } from '../src/state/selection'
import { bold, doc, p, testSchema } from './helpers'

function fireBeforeInput(target: HTMLElement, inputType: string, data?: string): void {
  let event: Event
  try {
    event = new InputEvent('beforeinput', { inputType, data, cancelable: true, bubbles: true })
    if ((event as InputEvent).inputType !== inputType) throw new Error('init not honored')
  } catch {
    event = new Event('beforeinput', { cancelable: true, bubbles: true })
    Object.assign(event, { inputType, data: data ?? null })
  }
  target.dispatchEvent(event)
}

function mount(
  document = doc(p('')),
  options: {
    enabled?: () => boolean
    words?: () => Record<string, string>
    curlyQuotes?: () => boolean
  } = {},
): Editor {
  const host = window.document.createElement('div')
  window.document.body.appendChild(host)
  const editor = createEditor({
    schema: testSchema,
    doc: document,
    element: host,
    inputRules: [
      ...defaultInputRules(),
      ...smartTypographyRules({ enabled: options.enabled }),
      autocorrectRule({
        enabled: options.enabled,
        words: options.words,
        curlyQuotes: options.curlyQuotes,
      }),
    ],
  })
  editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 0))))
  return editor
}

function type(editor: Editor, text: string): void {
  const dom = editor.view?.dom as HTMLElement
  for (const character of text) fireBeforeInput(dom, 'insertText', character)
}

describe('smart typography as you type', () => {
  it('curls quotes open and shut, and turns an apostrophe', () => {
    const editor = mount()
    type(editor, `She said "don't" and 'fine'.`)
    expect(editor.getText()).toBe('She said “don’t” and ‘fine’.')
    editor.destroy()
  })

  it('sets dashes, the ellipsis, fractions, arrows and signs', () => {
    const editor = mount()
    type(editor, 'wait - then... 1/2 cup -> done (c) 2026 (tm)')
    expect(editor.getText()).toBe('wait – then… ½ cup → done © 2026 ™')
    editor.destroy()
  })

  it('gives back what was typed on one undo', () => {
    const editor = mount()
    type(editor, 'a "b')
    expect(editor.getText()).toBe('a “b')
    type(editor, '"')
    expect(editor.getText()).toBe('a “b”')
    editor.undo()
    expect(editor.getText()).toBe('a “b"')
    editor.destroy()
  })

  it('keeps the marks the text had', () => {
    const editor = mount(doc(p(bold('x'))))
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 1))))
    type(editor, '...')
    const node = editor.state.doc.child(0).child(0)
    expect(node.textContent).toBe('x…')
    expect(node.marks.map((mark) => mark.type.name)).toEqual(['bold'])
    editor.destroy()
  })

  it('works after an inline node, and never in code', () => {
    const withBreak = doc(
      testSchema.node('paragraph', undefined, Fragment.from([testSchema.node('hardBreak')])),
    )
    const editor = mount(withBreak)
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 1))))
    type(editor, '"x"')
    expect(editor.state.doc.child(0).textContent).toBe('“x”')
    editor.destroy()

    const code = mount(doc(testSchema.node('codeBlock', undefined, [])))
    type(code, '"a" -> b')
    expect(code.getText()).toContain('"a" -> b')
    code.destroy()
  })

  it('leaves the text alone when the character typed never went in, as at a length limit', () => {
    const host = window.document.createElement('div')
    window.document.body.appendChild(host)
    const editor = createEditor({
      schema: testSchema,
      doc: doc(p('"')),
      element: host,
      maxLength: 1,
      inputRules: smartTypographyRules(),
    })
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 1))))
    type(editor, 'x')
    expect(editor.getText()).toBe('"')
    editor.destroy()
  })

  it('does nothing while switched off', () => {
    let on = false
    const editor = mount(doc(p('')), { enabled: () => on })
    type(editor, '"a" teh ')
    expect(editor.getText()).toBe('"a" teh ')
    on = true
    type(editor, '"b"')
    expect(editor.getText()).toBe('"a" teh “b”')
    editor.destroy()
  })
})

describe('autocorrect as you type', () => {
  it('puts a misspelling right once the word ends, in the case it was typed', () => {
    const editor = mount()
    type(editor, 'Teh cat adn TEH dog recieve.')
    expect(editor.getText()).toBe('The cat and THE dog receive.')
    editor.destroy()
  })

  it('reads its list afresh, and leaves a word inside another alone', () => {
    let words: Record<string, string> = { brb: 'be right back' }
    const editor = mount(doc(p('')), { words: () => words })
    type(editor, 'brb, xbrb ')
    expect(editor.getText()).toBe('be right back, xbrb ')
    words = {}
    type(editor, 'brb ')
    expect(editor.getText()).toBe('be right back, xbrb brb ')
    editor.destroy()
  })

  it('curls the apostrophe in a correction while quotes are curled as they are typed', () => {
    let curly = true
    const editor = mount(doc(p('')), { curlyQuotes: () => curly })
    type(editor, 'dont ')
    expect(editor.getText()).toBe('don’t ')
    curly = false
    type(editor, 'dont ')
    expect(editor.getText()).toBe("don’t don't ")
    editor.destroy()
  })
})
