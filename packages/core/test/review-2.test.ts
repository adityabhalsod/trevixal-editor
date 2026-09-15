// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { insertContent, insertText } from '../src/commands/commands'
import { liftListItem, sinkListItem } from '../src/commands/lists'
import { type Editor, type EditorOptions, createEditor } from '../src/editor/editor'
import { NEW_HISTORY_GROUP } from '../src/history/history'
import { applyInputRules, defaultInputRules } from '../src/input-rules/input-rules'
import { Fragment } from '../src/model/fragment'
import type { EditorNode } from '../src/model/node'
import { Schema } from '../src/model/schema'
import { defaultMarks, defaultNodes } from '../src/schema/basic'
import { escapeHTML, serializeToHTML } from '../src/serialize/html'
import { parseHTML } from '../src/serialize/parse-html'
import type { EditorState } from '../src/state/editor-state'
import { SetNodeAttrsStep } from '../src/state/steps/attrs-step'
import type { EditorView } from '../src/view/editor-view'
import { bold, br, cursor, doc, p, stateWith, testSchema, text } from './helpers'

const rules = defaultInputRules()

function codeBlock(source: string, language: string | null = null): EditorNode {
  return testSchema.node(
    'codeBlock',
    { language },
    source ? Fragment.of(testSchema.text(source)) : Fragment.empty,
  )
}

function taskList(...items: EditorNode[]): EditorNode {
  return testSchema.node('taskList', undefined, Fragment.from(items))
}

function task(checked: boolean, ...blocks: EditorNode[]): EditorNode {
  return testSchema.node('taskItem', { checked }, Fragment.from(blocks))
}

function apply(state: EditorState, tr: ReturnType<EditorState['tr']['step']> | null): EditorState {
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

function mount(options: Partial<EditorOptions> = {}): { editor: Editor; view: EditorView } {
  const host = window.document.createElement('div')
  window.document.body.appendChild(host)
  const editor = createEditor({ schema: testSchema, element: host, ...options })
  return { editor, view: editor.view as EditorView }
}

function fireClipboard(target: HTMLElement, data: Record<string, string>): void {
  const event = new Event('paste', { cancelable: true, bubbles: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (mime: string) => data[mime] ?? '',
      setData: () => {},
    },
  })
  target.dispatchEvent(event)
}

beforeEach(() => {
  window.document.body.innerHTML = ''
})

describe('autolink input rule', () => {
  it('links exactly the URL when trailing punctuation is left out', () => {
    const state = stateWith(doc(p('go to https://x.dev/a.')), cursor([0], 22))
    const next = apply(state, applyInputRules(state, ' ', rules))
    const block = next.doc.child(0)
    const linked = block.content.children.filter((child) =>
      child.marks.some((mark) => mark.type.name === 'link'),
    )
    expect(linked.map((child) => child.textContent)).toEqual(['https://x.dev/a'])
    expect(block.textContent).toBe('go to https://x.dev/a. ')
  })
})

describe('input rules inside code', () => {
  it.each([
    ['#', ' '],
    ['>', ' '],
    ['``', '`'],
    ['i-', '-'],
  ])('leave "%s%s" as source text in a code block', (before, typed) => {
    const state = stateWith(doc(codeBlock(before)), cursor([0], before.length))
    expect(applyInputRules(state, typed, rules)).toBeNull()
  })

  it('does not turn -- into an em dash inside inline code', () => {
    const code = testSchema.text('a-', [testSchema.mark('code')])
    const state = stateWith(doc(p(code)), cursor([0], 2))
    expect(applyInputRules(state, '-', rules)).toBeNull()
  })

  it('does not nest a bullet list inside a task item on "- "', () => {
    const state = stateWith(doc(taskList(task(false, p('-')))), cursor([0, 0, 0], 1))
    expect(applyInputRules(state, ' ', rules)).toBeNull()
  })
})

describe('paste into a code block', () => {
  it('keeps multi-line plain text inside the block', () => {
    const { editor, view } = mount({ doc: doc(codeBlock('')) })
    fireClipboard(view.dom, { 'text/plain': 'a\nb' })
    expect(editor.state.doc.childCount).toBe(1)
    expect(editor.state.doc.child(0).type.name).toBe('codeBlock')
    expect(editor.getText()).toBe('a\nb')
  })

  it('pastes HTML as its plain text', () => {
    const { editor, view } = mount({ doc: doc(codeBlock('')) })
    fireClipboard(view.dom, {
      'text/html': '<p><strong>x</strong></p><p>y</p>',
      'text/plain': 'x\ny',
    })
    expect(editor.getHTML()).toBe('<pre><code>x\ny</code></pre>')
  })
})

describe('insertContent into a restricted block', () => {
  it('drops marks the target block does not allow', () => {
    const state = stateWith(doc(codeBlock('')), cursor([0], 0))
    const next = apply(state, insertContent([bold('x')])(state))
    expect(next.doc.child(0).child(0).marks).toHaveLength(0)
    expect(next.doc.child(0).textContent).toBe('x')
  })

  it('turns a hard break into a newline where only text is allowed', () => {
    const state = stateWith(doc(codeBlock('')), cursor([0], 0))
    const next = apply(state, insertContent([text('a'), br(), text('b')])(state))
    expect(next.doc.eq(doc(codeBlock('a\nb')))).toBe(true)
  })
})

describe('history after undo', () => {
  it('starts a fresh group for the next edit', () => {
    const editor = createEditor({
      schema: testSchema,
      doc: doc(p('')),
      history: { groupDelay: 10_000 },
    })
    editor.commands.insertText('a')
    const second = insertText('b')(editor.state)
    editor.dispatch((second as NonNullable<typeof second>).setMeta(NEW_HISTORY_GROUP, true))
    editor.undo()
    expect(editor.getText()).toBe('a')
    editor.commands.insertText('c')
    expect(editor.historyEntries().undo).toHaveLength(2)
    editor.undo()
    expect(editor.getText()).toBe('a')
  })
})

describe('nested task lists', () => {
  it('liftListItem round-trips with sinkListItem', () => {
    const original = doc(taskList(task(false, p('a')), task(true, p('b'))))
    const state = stateWith(original, cursor([0, 1, 0], 0))
    const sunk = apply(state, sinkListItem(state))
    const lifted = apply(sunk, liftListItem(sunk))
    expect(lifted.doc.eq(original)).toBe(true)
  })
})

describe('atom re-render', () => {
  const cardSchema = new Schema({
    nodes: {
      ...defaultNodes(),
      card: {
        group: 'block',
        atom: true,
        attrs: { title: { default: null } },
        toHTML: (node) =>
          typeof node.attrs.title === 'string'
            ? {
                tag: 'div',
                attrs: { class: 'card' },
                innerHTML: `<b>${escapeHTML(node.attrs.title)}</b>`,
              }
            : { tag: 'div', attrs: { class: 'card' } },
      },
    },
    marks: defaultMarks(),
  })

  it('clears the body when the spec stops providing one', () => {
    const initial = cardSchema.node('doc', undefined, [
      cardSchema.node('paragraph'),
      cardSchema.node('card', { title: 'Hi' }),
    ])
    const { editor, view } = mount({ schema: cardSchema, doc: initial })
    const card = view.dom.querySelector('.card') as HTMLElement
    expect(card.innerHTML).toBe('<b>Hi</b>')
    editor.dispatch(editor.state.tr.step(new SetNodeAttrsStep([1], { title: null })))
    expect((view.dom.querySelector('.card') as HTMLElement).innerHTML).toBe('')
  })
})

describe('code block language in HTML', () => {
  it('survives a serialize/parse round trip', () => {
    const html = serializeToHTML(doc(codeBlock('x', 'ts')))
    expect(html).toBe('<pre data-language="ts"><code>x</code></pre>')
    expect(parseHTML(testSchema, html).child(0).attrs.language).toBe('ts')
  })

  it('reads the language-* class other renderers put on the code element', () => {
    const parsed = parseHTML(testSchema, '<pre><code class="language-js">y</code></pre>')
    expect(parsed.child(0).attrs.language).toBe('js')
  })

  it('refuses a language that could not be a language name', () => {
    const html = serializeToHTML(doc(codeBlock('x', 'a"b onload=x')))
    expect(html).toBe('<pre><code>x</code></pre>')
  })
})

describe('IME reconciliation', () => {
  it('keeps composed text in a block that holds an inline atom', () => {
    const { editor, view } = mount({ doc: doc(p('a', br(), 'b')) })
    const content = view.dom.firstElementChild as HTMLElement
    const last = [...content.childNodes].find(
      (node) => node.nodeType === 3 && node.textContent === 'b',
    ) as Text
    view.dom.dispatchEvent(new Event('compositionstart'))
    last.textContent = 'bx'
    view.dom.dispatchEvent(new Event('compositionend'))
    expect(editor.state.doc.eq(doc(p('a', br(), 'bx')))).toBe(true)
  })
})
