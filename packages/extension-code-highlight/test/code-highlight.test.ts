// @vitest-environment happy-dom
import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { type Highlighter, codeHighlight } from '../src'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

/** Toy highlighter: marks every `const` / `return` keyword. */
const keywords: Highlighter = {
  highlight(code) {
    const tokens = []
    const pattern = /\b(const|return)\b/g
    let match = pattern.exec(code)
    while (match) {
      tokens.push({ from: match.index, to: match.index + match[0].length, className: 'tok-kw' })
      match = pattern.exec(code)
    }
    return tokens
  },
}

function setup() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host })
  return { editor, view: editor.view }
}

describe('codeHighlight', () => {
  it('decorates code blocks and leaves other blocks alone', () => {
    const { editor, view } = setup()
    editor.commands.setCodeBlock()
    editor.commands.insertText('const x = 1')
    const dispose = codeHighlight(editor, keywords)
    const spans = view?.dom.querySelectorAll('.tok-kw') ?? []
    expect([...spans].map((span) => span.textContent)).toEqual(['const'])
    expect(view?.dom.querySelector('pre code .tok-kw')).not.toBeNull()
    dispose()
    expect(view?.dom.querySelector('.tok-kw')).toBeNull()
    editor.destroy()
  })

  it('re-tokenizes a block as it changes', () => {
    const { editor, view } = setup()
    editor.commands.setCodeBlock()
    codeHighlight(editor, keywords)
    editor.commands.insertText('return a')
    expect(view?.dom.querySelectorAll('.tok-kw')).toHaveLength(1)
    editor.commands.insertText('; const b')
    expect(view?.dom.querySelectorAll('.tok-kw')).toHaveLength(2)
    editor.destroy()
  })

  it('never touches the document model', () => {
    const { editor } = setup()
    editor.commands.setCodeBlock()
    codeHighlight(editor, keywords)
    editor.commands.insertText('const x')
    expect(editor.getHTML()).toBe('<pre><code>const x</code></pre>')
    editor.destroy()
  })
})
