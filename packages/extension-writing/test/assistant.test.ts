// @vitest-environment happy-dom
import {
  type Editor,
  Schema,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
} from '@trevixal/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type WritingIssue,
  type WritingIssueKind,
  blockText,
  createWritingAssistant,
} from '../src/assistant'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

const editors: Editor[] = []

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
})

/** An editor with a real view, so the decoration layer paints. */
function mount(html?: string): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const doc = html ? parseHTML(schema, html, document) : undefined
  const editor = createEditor({ schema, element: host, ...(doc ? { doc } : {}) })
  editors.push(editor)
  return editor
}

function headless(html?: string): Editor {
  const doc = html ? parseHTML(schema, html, document) : undefined
  const editor = createEditor({ schema, ...(doc ? { doc } : {}) })
  editors.push(editor)
  return editor
}

/** The text of every decoration of one kind, in document order. */
function decorated(editor: Editor, kind: WritingIssueKind | 'all' = 'all'): string[] {
  const selector = kind === 'all' ? '.trevixal-writing' : `.trevixal-writing--${kind}`
  return [...(editor.view?.dom.querySelectorAll(selector) ?? [])].map(
    (element) => element.textContent ?? '',
  )
}

const PASSIVE_AND_REPEAT = '<p>The report was written by the team. this is is bad.</p>'

describe('createWritingAssistant decorations', () => {
  it('paints a class per issue kind without touching the document', () => {
    const editor = mount(PASSIVE_AND_REPEAT)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    expect(decorated(editor, 'passive')).toEqual(['was written by'])
    expect(decorated(editor, 'repeat')).toEqual(['is is'])
    expect(decorated(editor, 'grammar')).toEqual(['t'])
    expect(editor.getHTML()).toBe(PASSIVE_AND_REPEAT)
    assistant.destroy()
  })

  it('reports every issue with a path and block offsets that address its text', () => {
    const editor = mount(PASSIVE_AND_REPEAT)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const block = editor.state.doc.content.children[0]
    const text = blockText(block as never)
    const { issues } = assistant.report()
    expect(issues.map((issue) => issue.kind)).toEqual(['passive', 'grammar', 'repeat'])
    for (const issue of issues) {
      expect(issue.path).toEqual([0])
      expect(text.slice(issue.from, issue.to)).toBe(issue.text)
    }
    assistant.destroy()
  })

  it('removes a kind when it is switched off and brings it back', () => {
    const editor = mount(PASSIVE_AND_REPEAT)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    expect(assistant.isEnabled('passive')).toBe(true)
    assistant.setEnabled('passive', false)
    expect(assistant.isEnabled('passive')).toBe(false)
    expect(decorated(editor, 'passive')).toEqual([])
    expect(decorated(editor, 'repeat')).toEqual(['is is'])
    expect(assistant.report().issues.some((issue) => issue.kind === 'passive')).toBe(false)
    assistant.setEnabled('passive', true)
    expect(decorated(editor, 'passive')).toEqual(['was written by'])
    assistant.destroy()
  })

  it('keeps doubled words under the repeat toggle, not the grammar one', () => {
    const editor = mount(PASSIVE_AND_REPEAT)
    const assistant = createWritingAssistant(editor, { repeated: false, debounceMs: 0 })
    expect(decorated(editor, 'repeat')).toEqual([])
    expect(assistant.report().issues.some((issue) => issue.text === 'is is')).toBe(false)
    assistant.destroy()
  })

  it('leaves long sentences alone until they are asked for', () => {
    const long = `<p>${'word '.repeat(30).trim()}.</p>`
    const off = createWritingAssistant(mount(long), { debounceMs: 0 })
    expect(off.report().issues.some((issue) => issue.kind === 'long')).toBe(false)
    off.destroy()
    const editor = mount(long)
    const on = createWritingAssistant(editor, { longSentences: true, debounceMs: 0 })
    const issue = on.report().issues.find((candidate) => candidate.kind === 'long')
    expect(issue?.message).toBe('Long sentence (30 words)')
    expect(decorated(editor, 'long').join('')).toBe(`${'word '.repeat(30).trim()}.`)
    on.destroy()
  })

  it('skips code blocks, which are not prose', () => {
    const editor = mount('<p>this is is bad.</p><pre><code>the the was written by x</code></pre>')
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const { issues } = assistant.report()
    expect(issues.every((issue) => issue.path[0] === 0)).toBe(true)
    expect(editor.view?.dom.querySelectorAll('pre .trevixal-writing')).toHaveLength(0)
    // The code block's words are out of the statistics too.
    expect(assistant.report().analysis.words).toBe(4)
    assistant.destroy()
  })

  it('drops every decoration when destroyed and stops re-checking', () => {
    const editor = mount(PASSIVE_AND_REPEAT)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const spy = vi.spyOn(editor.view as never, 'setDecorationLayer')
    assistant.destroy()
    expect(spy).toHaveBeenCalledWith('writing', null)
    expect(decorated(editor)).toEqual([])
    editor.commands.insertText('The vase was broken by him. ')
    expect(decorated(editor)).toEqual([])
    assistant.destroy() // idempotent
  })

  it('paints under its own layer key', () => {
    const editor = mount(PASSIVE_AND_REPEAT)
    const spy = vi.spyOn(editor.view as never, 'setDecorationLayer')
    const assistant = createWritingAssistant(editor, { layer: 'prose', debounceMs: 0 })
    expect(spy.mock.calls.every((call) => call[0] === 'prose')).toBe(true)
    assistant.destroy()
    expect(spy).toHaveBeenCalledWith('prose', null)
  })
})

describe('createWritingAssistant re-checking', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-checks after the debounce and tells the host', () => {
    const editor = mount('<p>All fine here.</p>')
    const reports: number[] = []
    const assistant = createWritingAssistant(editor, {
      debounceMs: 200,
      onReport: (report) => reports.push(report.issues.length),
    })
    expect(reports).toEqual([0])
    editor.commands.insertText('The vase was broken. ')
    expect(reports).toHaveLength(1)
    vi.advanceTimersByTime(200)
    expect(reports).toEqual([0, 1])
    expect(decorated(editor, 'passive')).toEqual(['was broken'])
    assistant.destroy()
  })

  it('flushes a pending re-check when the report is asked for', () => {
    const editor = mount('<p>All fine here.</p>')
    const assistant = createWritingAssistant(editor, { debounceMs: 200 })
    editor.commands.insertText('The vase was broken. ')
    expect(assistant.report().issues.map((issue) => issue.kind)).toEqual(['passive'])
    // The pending timer was consumed, not left to fire a second time.
    vi.advanceTimersByTime(500)
    expect(assistant.report().issues).toHaveLength(1)
    assistant.destroy()
  })

  it('does not re-check after destroy, even with a timer in flight', () => {
    const editor = mount('<p>All fine here.</p>')
    const reports: number[] = []
    const assistant = createWritingAssistant(editor, {
      debounceMs: 200,
      onReport: (report) => reports.push(report.issues.length),
    })
    editor.commands.insertText('The vase was broken. ')
    assistant.destroy()
    vi.advanceTimersByTime(500)
    expect(reports).toEqual([0])
  })
})

describe('applySuggestion', () => {
  it('replaces the flagged range in the document', () => {
    const editor = mount('<p>this is is bad.</p>')
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const repeat = assistant.report().issues.find((issue) => issue.kind === 'repeat')
    expect(assistant.applySuggestion(repeat as WritingIssue)).toBe(true)
    expect(editor.getText()).toBe('this is bad.')
    assistant.refresh()
    expect(decorated(editor, 'repeat')).toEqual([])
    assistant.destroy()
  })

  it('applies a grammar fix and keeps the surrounding marks', () => {
    const editor = mount('<p>I saw <strong>a apple</strong> today.</p>')
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const article = assistant
      .report()
      .issues.find((issue) => issue.rule === 'article') as WritingIssue
    expect(assistant.applySuggestion(article)).toBe(true)
    expect(editor.getText()).toBe('I saw an apple today.')
    expect(editor.getHTML()).toContain('<strong>an apple</strong>')
    assistant.destroy()
  })

  it('refuses an issue with no suggestion', () => {
    const editor = mount(PASSIVE_AND_REPEAT)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const passive = assistant
      .report()
      .issues.find((issue) => issue.kind === 'passive') as WritingIssue
    expect(passive.suggestion).toBeUndefined()
    expect(assistant.applySuggestion(passive)).toBe(false)
    expect(editor.getHTML()).toBe(PASSIVE_AND_REPEAT)
    assistant.destroy()
  })

  it('refuses a stale issue whose text has moved on', () => {
    const editor = mount('<p>this is is bad.</p>')
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const repeat = assistant.report().issues.find((issue) => issue.kind === 'repeat')
    const stale: WritingIssue = { ...(repeat as WritingIssue), text: 'was was' }
    expect(assistant.applySuggestion(stale)).toBe(false)
    expect(assistant.applySuggestion({ ...(repeat as WritingIssue), path: [9] })).toBe(false)
    expect(editor.getText()).toBe('this is is bad.')
    assistant.destroy()
  })

  it('refuses everything once destroyed', () => {
    const editor = mount('<p>this is is bad.</p>')
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const repeat = assistant.report().issues.find((issue) => issue.kind === 'repeat')
    assistant.destroy()
    expect(assistant.applySuggestion(repeat as WritingIssue)).toBe(false)
    expect(editor.getText()).toBe('this is is bad.')
  })
})

describe('goTo', () => {
  it('selects the issue range in the editor', () => {
    const editor = mount(PASSIVE_AND_REPEAT)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const passive = assistant
      .report()
      .issues.find((issue) => issue.kind === 'passive') as WritingIssue
    assistant.goTo(passive)
    const { selection } = editor.state
    expect(selection.empty).toBe(false)
    expect(selection.from.offset).toBe(passive.from)
    expect(selection.to.offset).toBe(passive.to)
    assistant.destroy()
  })

  it('does nothing for an unknown path or after destroy', () => {
    const editor = mount(PASSIVE_AND_REPEAT)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const passive = assistant
      .report()
      .issues.find((issue) => issue.kind === 'passive') as WritingIssue
    expect(() => assistant.goTo({ ...passive, path: [7] })).not.toThrow()
    assistant.destroy()
    expect(() => assistant.goTo(passive)).not.toThrow()
  })
})

describe('inline atoms and headless editors', () => {
  it('keeps offsets aligned across a hard break', () => {
    const editor = mount('<p>first line<br>The report was written by the team.</p>')
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const block = editor.state.doc.content.children[0]
    const text = blockText(block as never)
    // The break is one placeholder character, so a word never spans it.
    expect(text).toHaveLength(
      'first line'.length + 1 + 'The report was written by the team.'.length,
    )
    expect(text.slice(22, 36)).toBe('was written by')
    const passive = assistant
      .report()
      .issues.find((issue) => issue.kind === 'passive') as WritingIssue
    expect([passive.from, passive.to]).toEqual([22, 36])
    expect(decorated(editor, 'passive')).toEqual(['was written by'])
    assistant.destroy()
  })

  it('treats the atom as whitespace, not as a word', () => {
    const editor = headless('<p>word<br>word</p>')
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    // "word word" across a break is still a doubled word.
    expect(assistant.report().issues.map((issue) => issue.kind)).toContain('repeat')
    expect(assistant.report().analysis.words).toBe(2)
    assistant.destroy()
  })

  it('analyses a headless editor without painting or throwing', () => {
    const editor = headless('<p>The report was written by the team.</p><p>Second line here.</p>')
    expect(editor.view).toBeNull()
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const report = assistant.report()
    expect(report.analysis.words).toBe(10)
    expect(report.analysis.sentences).toBe(2)
    expect(report.issues.map((issue) => issue.path)).toEqual([[0]])
    expect(() => assistant.destroy()).not.toThrow()
  })

  it('joins the blocks with a newline for the whole-document analysis', () => {
    const editor = headless('<p>One line.</p><p>Two lines.</p>')
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    expect(assistant.report().analysis.paragraphs).toBe(2)
    assistant.destroy()
  })
})
