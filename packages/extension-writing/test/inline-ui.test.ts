// @vitest-environment happy-dom
import {
  type Editor,
  Schema,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
} from '@trevixal/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WRITING_ISSUE_ATTR, createWritingAssistant } from '../src/assistant'
import { createWritingInlineUI, issueTitle } from '../src/inline-ui'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
const editors: Editor[] = []

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
})

function mount(html: string): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host, doc: parseHTML(schema, html, document) })
  editors.push(editor)
  return editor
}

/** "a apple" trips the article rule, which carries a mechanical suggestion. */
const ARTICLE = '<p>She ate a apple today.</p>'
/** Passive voice is a judgement: flagged, but with nothing to replace it with. */
const PASSIVE = '<p>The report was written by the team.</p>'

const spans = (editor: Editor): HTMLElement[] => [
  ...(editor.view?.dom.querySelectorAll<HTMLElement>(`[${WRITING_ISSUE_ATTR}]`) ?? []),
]

const card = (): HTMLElement => document.querySelector('.trevixal-writing-card') as HTMLElement
const menu = (): HTMLElement => document.querySelector('.trevixal-writing-menu') as HTMLElement
const items = (): string[] =>
  [...menu().querySelectorAll('[role="menuitem"]')].map((item) => item.textContent ?? '')

describe('writing decorations name the issue they came from', () => {
  it('stamps the issue id onto the painted span', () => {
    const editor = mount(ARTICLE)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const painted = spans(editor)
    expect(painted.length).toBeGreaterThan(0)
    const id = painted[0]?.getAttribute(WRITING_ISSUE_ATTR) ?? ''
    // The span names a finding that is actually in the report: without this
    // link a hover has no way to know which issue it is over.
    expect(assistant.issue(id)?.message).toContain('an')
    assistant.destroy()
  })

  it('gives the same finding the same id across re-checks', () => {
    const editor = mount(ARTICLE)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const before = assistant.report().issues.map((issue) => issue.id)
    assistant.refresh()
    expect(assistant.report().issues.map((issue) => issue.id)).toEqual(before)
    assistant.destroy()
  })
})

describe('createWritingInlineUI', () => {
  it('shows a card naming the rule when the pointer rests on a flagged word', async () => {
    const editor = mount(ARTICLE)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const ui = createWritingInlineUI(editor, assistant, { hoverDelayMs: 0 })
    expect(card().hidden).toBe(true)

    const span = spans(editor)[0] as HTMLElement
    span.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(card().hidden).toBe(false)
    // Both halves: which check fired, and what it found.
    expect(card().textContent).toContain('Article')
    expect(card().textContent).toContain('an')
    ui.destroy()
    assistant.destroy()
  })

  it('opens a menu offering the replacement when a flagged word is clicked', () => {
    const editor = mount(ARTICLE)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const ui = createWritingInlineUI(editor, assistant)

    const span = spans(editor)[0] as HTMLElement
    span.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(menu().hidden).toBe(false)
    expect(items()[0]).toBe('Replace with “an”')
    ui.destroy()
    assistant.destroy()
  })

  it('applies the replacement from the menu and closes', () => {
    const editor = mount(ARTICLE)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const ui = createWritingInlineUI(editor, assistant)
    ;(spans(editor)[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const apply = menu().querySelector<HTMLButtonElement>('[data-trevixal-writing-action="apply"]')
    apply?.click()

    expect(editor.state.doc.textContent).toContain('an apple')
    expect(menu().hidden).toBe(true)
    ui.destroy()
    assistant.destroy()
  })

  it('says so rather than offering an empty menu when there is no mechanical fix', () => {
    const editor = mount(PASSIVE)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const ui = createWritingInlineUI(editor, assistant)
    ;(spans(editor)[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(menu().hidden).toBe(false)
    expect(menu().querySelector('.trevixal-writing-menu__note')?.textContent).toContain('rewrite')
    expect(menu().querySelector('[data-trevixal-writing-action="apply"]')).toBeNull()
    ui.destroy()
    assistant.destroy()
  })

  it('stops flagging a wording once it is ignored', () => {
    const editor = mount(ARTICLE)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const ui = createWritingInlineUI(editor, assistant)
    ;(spans(editor)[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    menu().querySelector<HTMLButtonElement>('[data-trevixal-writing-action="ignore"]')?.click()

    expect(spans(editor)).toHaveLength(0)
    // The document is untouched: ignoring is not a fix.
    expect(editor.state.doc.textContent).toContain('a apple')
    assistant.clearIgnored()
    expect(spans(editor).length).toBeGreaterThan(0)
    ui.destroy()
    assistant.destroy()
  })

  it('closes on Escape, and when the document changes underneath it', () => {
    const editor = mount(ARTICLE)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const ui = createWritingInlineUI(editor, assistant)
    ;(spans(editor)[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(menu().hidden).toBe(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(menu().hidden).toBe(true)
    ;(spans(editor)[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(menu().hidden).toBe(false)
    // Every span is re-created by a re-check, so anything anchored to one is
    // pointing at an element that is no longer in the document.
    editor.commands.insertText('x')
    expect(menu().hidden).toBe(true)
    ui.destroy()
    assistant.destroy()
  })

  it('leaves no listeners or nodes behind when destroyed', () => {
    const editor = mount(ARTICLE)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const ui = createWritingInlineUI(editor, assistant)
    ui.destroy()

    expect(document.querySelector('.trevixal-writing-card')).toBeNull()
    expect(document.querySelector('.trevixal-writing-menu')).toBeNull()
    assistant.destroy()
  })

  it('names a grammar finding by its rule and everything else by its kind', () => {
    const editor = mount(PASSIVE)
    const assistant = createWritingAssistant(editor, { debounceMs: 0 })
    const passive = assistant.report().issues.find((issue) => issue.kind === 'passive')
    expect(passive && issueTitle(passive)).toBe('Passive voice')

    const other = mount(ARTICLE)
    const second = createWritingAssistant(other, { debounceMs: 0 })
    const article = second.report().issues.find((issue) => issue.rule === 'article')
    expect(article && issueTitle(article)).toBe('Article (a/an)')
    assistant.destroy()
    second.destroy()
  })
})
