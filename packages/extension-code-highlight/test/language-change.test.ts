// @vitest-environment happy-dom
import {
  Fragment,
  ReplaceInlineStep,
  Schema,
  SetNodeAttrsStep,
  createEditor,
  defaultMarks,
  defaultNodes,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { codeHighlight, createHighlighter } from '../src'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

function codeDoc(...blocks: [string | null, string][]) {
  return {
    type: 'doc',
    content: blocks.map(([language, text]) => ({
      type: 'codeBlock',
      attrs: { language },
      content: [{ type: 'text', text }],
    })),
  }
}

function setup(...blocks: [string | null, string][]) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host, content: codeDoc(...blocks) as never })
  const dispose = codeHighlight(editor, createHighlighter())
  return { editor, host, dispose }
}

/** Set one block's language directly, without moving the selection. */
function setLanguage(
  editor: ReturnType<typeof setup>['editor'],
  index: number,
  language: string | null,
): void {
  const node = editor.state.doc.child(index)
  editor.dispatch(editor.state.tr.step(new SetNodeAttrsStep([index], { ...node.attrs, language })))
}

describe('changing a code block language', () => {
  it('re-highlights the block without touching its text', () => {
    // Regression: the renderer reused a textblock's inline DOM whenever the
    // content matched, so a decoration source keyed on an *attribute*, the
    // language here, never got a chance to run again.
    const { editor, host, dispose } = setup(['sql', 'SELECT name FROM users'])
    expect(host.querySelectorAll('.tvx-tok-keyword')).toHaveLength(2)

    setLanguage(editor, 0, 'python')
    // SELECT is not a Python keyword, so that highlight must be gone.
    expect(host.innerHTML).not.toContain('>SELECT</span>')
    expect(editor.getText()).toBe('SELECT name FROM users')

    setLanguage(editor, 0, null)
    expect(host.querySelectorAll('[class^="tvx-tok-"]')).toHaveLength(0)
    expect(editor.getText()).toBe('SELECT name FROM users')

    dispose()
    editor.destroy()
  })

  it('highlights a block that starts with no language once one is set', () => {
    const { editor, host, dispose } = setup([null, 'const x = 1'])
    expect(host.querySelectorAll('[class^="tvx-tok-"]')).toHaveLength(0)

    setLanguage(editor, 0, 'javascript')
    expect(host.querySelectorAll('.tvx-tok-keyword').length).toBeGreaterThan(0)

    dispose()
    editor.destroy()
  })

  it('leaves the other blocks alone', () => {
    const { editor, host, dispose } = setup(
      ['javascript', 'const a = 1'],
      ['javascript', 'const b = 2'],
    )
    const keywordsIn = (index: number) =>
      host.querySelectorAll('pre')[index]?.querySelectorAll('.tvx-tok-keyword').length ?? -1

    expect(keywordsIn(0)).toBe(1)
    expect(keywordsIn(1)).toBe(1)

    setLanguage(editor, 0, null)
    expect(keywordsIn(0)).toBe(0)
    expect(keywordsIn(1)).toBe(1) // untouched

    dispose()
    editor.destroy()
  })

  it('re-tokenizes when the code changes after a language change', () => {
    const { editor, host, dispose } = setup(['javascript', 'const a = 1'])
    setLanguage(editor, 0, 'python')
    // `const` is not a Python keyword.
    expect(host.querySelectorAll('.tvx-tok-keyword')).toHaveLength(0)

    // Replace the block's text; the new content must be tokenized as Python.
    editor.dispatch(
      editor.state.tr.step(
        new ReplaceInlineStep(
          [0],
          0,
          editor.state.doc.child(0).textContent.length,
          Fragment.from([schema.text('def f(): pass')]),
        ),
      ),
    )
    expect(editor.getText()).toBe('def f(): pass')
    expect(host.querySelectorAll('.tvx-tok-keyword').length).toBeGreaterThan(0)

    dispose()
    editor.destroy()
  })
})
