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
} from '@trevixal/core'
import { afterEach, describe, expect, it } from 'vitest'
import { auditAccessibility, contrastRatio } from '../src/accessibility'
import { createWritingAssistant } from '../src/assistant'
import { findDuplicatePassages } from '../src/duplicates'
import { createReadingHeatmap, readingLevel } from '../src/heatmap'
import { AssistError, createRulesProvider } from '../src/provider'
import { CLICHES, INCLUSIVE_TERMS, TONE_PHRASES, findPhrases } from '../src/style-checks'
import { COMMON_SYNONYMS, enableThesaurus, wordListThesaurus } from '../src/thesaurus'

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

describe('the word lists', () => {
  it('offer the inclusive word, in the casing of the one it replaces', () => {
    const [found] = findPhrases('Ask the Chairman first.', INCLUSIVE_TERMS)
    expect(found).toMatchObject({ index: 8, length: 8, suggestion: 'Chair' })
    expect(findPhrases('The chairmanship', INCLUSIVE_TERMS)).toEqual([])
  })

  it('take an empty intensifier out with its space, but not the first word of a sentence', () => {
    const [within] = findPhrases('It is very good.', TONE_PHRASES)
    expect(within).toMatchObject({ index: 6, length: 5, suggestion: '' })
    const [first] = findPhrases('Very good.', TONE_PHRASES)
    expect(first?.suggestion).toBeUndefined()
  })

  it('find a cliché across a line of spaces, and jargon with its plain word', () => {
    const found = findPhrases('At the end  of the day we utilize it.', CLICHES)
    expect(found.map((match) => match.suggestion ?? match.message.slice(0, 5))).toEqual([
      '“at t',
      'use',
    ])
  })

  it('run in the assistant as their own kinds, tone and clichés only when asked', () => {
    const editor = mount('<p>The chairman will utilize it.</p>')
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    expect(assistant.report().issues.map((issue) => issue.kind)).toEqual(['inclusive'])
    assistant.setEnabled('cliche', true)
    expect(assistant.report().issues.map((issue) => issue.kind)).toEqual(['inclusive', 'cliche'])
    const [inclusive] = assistant.report().issues
    expect(inclusive && assistant.applySuggestion(inclusive)).toBe(true)
    expect(editor.state.doc.textContent).toBe('The chair will utilize it.')
    assistant.destroy()
  })
})

describe('the reading heat map', () => {
  it('grades a sentence by its words and its length', () => {
    expect(readingLevel('The cat sat on the mat.').level).toBe('easy')
    expect(
      readingLevel(
        'Organisational interdependencies necessitate comprehensive institutional reconfiguration.',
      ).level,
    ).toBe('very-hard')
  })

  it('tints each sentence only while it is shown', () => {
    const editor = mount(
      '<p>The cat sat. Institutional reconfiguration necessitates deliberation.</p>',
    )
    const heatmap = createReadingHeatmap(editor)
    const heat = () => editor.view?.dom.querySelectorAll('.trevixal-heat') ?? []
    expect(heat()).toHaveLength(0)
    heatmap.show()
    expect([...heat()].map((span) => span.className)).toEqual([
      'trevixal-heat trevixal-heat--easy',
      'trevixal-heat trevixal-heat--very-hard',
    ])
    heatmap.hide()
    expect(heat()).toHaveLength(0)
    heatmap.destroy()
  })
})

describe('the accessibility audit', () => {
  it('finds skipped headings, vague links and faint text', () => {
    const doc = parseHTML(
      schema,
      [
        '<h1>Report</h1>',
        '<h3>Details</h3>',
        '<p>Read <a href="https://example.com">click here</a> or <a href="https://example.com/a">the annual report</a>.</p>',
        '<p><span style="color: #bbbbbb">Faint</span> and <span style="color: #222222">dark</span>.</p>',
      ].join(''),
      document,
    )
    const issues = auditAccessibility(doc)
    expect(issues.map((issue) => issue.kind)).toEqual(['heading-order', 'link-text', 'contrast'])
    expect(issues[1]).toMatchObject({ path: [2], from: 5, to: 15 })
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21)
    expect(contrastRatio('not a colour', '#ffffff')).toBeNull()
  })
})

describe('the thesaurus', () => {
  it('offers synonyms for the word right-clicked, and swaps the chosen one in', () => {
    const editor = mount('<p>A Good plan</p>')
    const stop = enableThesaurus(editor, { lookup: wordListThesaurus(COMMON_SYNONYMS) })
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 3))))
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    editor.view?.dom.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    const items = [...document.querySelectorAll('.trevixal-thesaurus [role="menuitem"]')]
    expect(items.map((item) => item.textContent)).toEqual([
      'Fine',
      'Excellent',
      'Sound',
      'Solid',
      'Decent',
    ])
    ;(items[1] as HTMLButtonElement).click()
    expect(editor.state.doc.textContent).toBe('A Excellent plan')
    expect(document.querySelector('.trevixal-thesaurus')).toBeNull()
    stop()
  })

  it('leaves the browser its menu over a word it has nothing for', () => {
    const editor = mount('<p>Zebra</p>')
    const stop = enableThesaurus(editor, { lookup: wordListThesaurus(COMMON_SYNONYMS) })
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 2))))
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    editor.view?.dom.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    stop()
  })
})

describe('duplicate text', () => {
  it('finds a sentence another document also has, whatever its case and spacing', () => {
    const doc = parseHTML(
      schema,
      '<p>Short one. The quarterly figures are reviewed by the whole board each spring.</p>',
      document,
    )
    const other = parseHTML(
      schema,
      '<p>the quarterly figures are  reviewed by the whole board each spring!</p>',
      document,
    )
    const found = findDuplicatePassages(doc, [{ id: 'b', title: 'Board notes', doc: other }])
    expect(found).toEqual([
      {
        path: [0],
        from: 11,
        to: 77,
        text: 'The quarterly figures are reviewed by the whole board each spring.',
        foundIn: [{ id: 'b', title: 'Board notes' }],
      },
    ])
  })
})

describe('the rules provider', () => {
  it('rewrites plainly and summarises by first sentences, and offers only those', async () => {
    const provider = createRulesProvider()
    expect(provider.actions).toEqual(['rewrite', 'summarise'])
    const signal = new AbortController().signal
    await expect(
      provider.assist(
        { action: 'rewrite', text: 'We will utilize the very best tools.' },
        { signal },
      ),
    ).resolves.toBe('We will use the best tools.')
    await expect(
      provider.assist(
        { action: 'summarise', text: 'First point. More detail.\nSecond point here. Aside.' },
        { signal },
      ),
    ).resolves.toBe('First point. Second point here.')
    await expect(provider.assist({ action: 'translate', text: 'Hi' }, { signal })).rejects.toThrow(
      AssistError,
    )
  })
})
