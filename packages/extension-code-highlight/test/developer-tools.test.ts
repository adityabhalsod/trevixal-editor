// @vitest-environment happy-dom
import {
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  insertText,
  nodeFromJSON,
  pos,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import {
  BUNDLED_LANGUAGES,
  codeBlockLines,
  copyableCode,
  createHighlighter,
  enableCodeRunner,
  insertCodeDiff,
  insertRunnableCode,
  insertTerminal,
  lineDiff,
  runnerDocument,
} from '../src'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

function mount(blocks: unknown[]) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return createEditor({
    schema,
    element: host,
    doc: nodeFromJSON(schema, { type: 'doc', content: blocks } as never),
  })
}

const code = (text: string, attrs: Record<string, unknown> = {}) => ({
  type: 'codeBlock',
  attrs,
  content: [{ type: 'text', text }],
})

describe('diffs', () => {
  it('keeps shared lines and marks what was removed and added', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toBe(' a\n-b\n+B\n c\n+d')
    expect(lineDiff('same', 'same')).toBe(' same')
  })

  it('puts the diff in a block in the diff language, coloured line by line', () => {
    const editor = mount([{ type: 'paragraph' }])
    editor.exec(insertCodeDiff('let a = 1', 'let a = 2', 'app.js'))
    const block = editor.state.doc.child(0)
    expect(block.attrs).toMatchObject({ language: 'diff', title: 'app.js' })
    expect(block.textContent).toBe('-let a = 1\n+let a = 2')

    const tokens = createHighlighter().highlight(block.textContent, 'diff')
    expect(tokens.map((token) => token.className)).toEqual(['tvx-tok-deleted', 'tvx-tok-inserted'])
    editor.destroy()
  })
})

describe('terminal sessions', () => {
  it('copies the commands without their prompts, and not their output', () => {
    const session = '$ npm install\nadded 1 package\n$ npm test -- \\\n  --watch\nok'
    expect(copyableCode(session, 'console')).toBe('npm install\nnpm test -- \\\n  --watch')
  })

  it('copies other code, and a session with no prompt, as it is', () => {
    expect(copyableCode('$ not a prompt here', 'shell')).toBe('$ not a prompt here')
    expect(copyableCode('just output', 'console')).toBe('just output')
  })

  it('never takes a # line for a command', () => {
    expect(copyableCode('# install\n$ make', 'terminal')).toBe('make')
  })

  it('starts a new session at a prompt, the caret after it', () => {
    const editor = mount([{ type: 'paragraph', content: [{ type: 'text', text: 'Run:' }] }])
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 4))))
    editor.exec(insertTerminal())
    expect(editor.state.doc.child(1).attrs.language).toBe('console')
    expect(editor.state.doc.child(1).textContent).toBe('$ ')
    expect(editor.state.selection.from).toEqual(pos([1], 2))
    editor.destroy()
  })

  it('offers Terminal and Diff among the bundled languages', () => {
    expect(BUNDLED_LANGUAGES.map((language) => language.name)).toEqual(
      expect.arrayContaining(['console', 'diff']),
    )
  })
})

describe('code block lines', () => {
  it('numbers every line, and bands the lines picked out', () => {
    const editor = mount([code('one\ntwo\n\nfour', { lineNumbers: true, highlightLines: '2,4' })])
    const dispose = codeBlockLines(editor)
    const markers = [...(editor.view?.dom.querySelectorAll('.trevixal-code-line') ?? [])]

    expect(markers.map((marker) => marker.getAttribute('data-line'))).toEqual(['1', '2', '3', '4'])
    expect(
      markers.map((marker) => marker.classList.contains('trevixal-code-line--highlight')),
    ).toEqual([false, true, false, true])
    // The markers are chrome: the code is exactly what was typed.
    expect(editor.state.doc.child(0).textContent).toBe('one\ntwo\n\nfour')
    dispose()
    expect(editor.view?.dom.querySelector('.trevixal-code-line')).toBeNull()
    editor.destroy()
  })

  it('bands a diff’s added and removed lines without numbering them', () => {
    const editor = mount([code(' same\n-old\n+new', { language: 'diff' })])
    codeBlockLines(editor)
    const markers = [...(editor.view?.dom.querySelectorAll('.trevixal-code-line') ?? [])]
    expect(markers.map((marker) => marker.className)).toEqual([
      'trevixal-code-line trevixal-code-line--removed',
      'trevixal-code-line trevixal-code-line--added',
    ])
    editor.destroy()
  })

  it('unfolds a folded block from the bar over its hidden lines', () => {
    const lines = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join('\n')
    const editor = mount([code(lines, { collapsed: true })])
    codeBlockLines(editor)
    const button = editor.view?.dom.querySelector<HTMLButtonElement>(
      '.trevixal-code-expand__button',
    )
    expect(button?.textContent).toBe('Show all 12 lines')
    button?.click()
    expect(editor.state.doc.child(0).attrs.collapsed).toBe(false)
    expect(editor.view?.dom.querySelector('.trevixal-code-expand')).toBeNull()
    editor.destroy()
  })
})

describe('running code', () => {
  it('runs a script where it can reach nothing: its own origin-less frame, no network', () => {
    const page = runnerDocument('console.log("</script>")', 'javascript', 'run-1')
    expect(page).toContain("default-src 'none'")
    expect(page).not.toContain('console.log("</script>")')
    expect(page).toContain('console.log("<\\/script>")')
  })

  it('shows what a run printed under its block, and clears it when the code changes', () => {
    const editor = mount([code("console.log('hi')", { language: 'javascript' })])
    const runner = enableCodeRunner(editor)
    expect(runner.run([0])).toBe(true)
    const output = editor.view?.dom.querySelector('pre .trevixal-code-output')
    const frame = output?.querySelector('iframe')
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts')

    const token = /const token = "([^"]+)"/.exec(frame?.srcdoc ?? '')?.[1]
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { trevixalRun: token, kind: 'log', text: 'hi' },
        source: frame?.contentWindow ?? null,
      }),
    )
    expect(output?.querySelector('.trevixal-code-output__line')?.textContent).toBe('hi')

    // Changing the code makes the output stale, so it goes.
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 0))))
    editor.exec(insertText('// '))
    expect(editor.view?.dom.querySelector('.trevixal-code-output')).toBeNull()
    runner.destroy()
    editor.destroy()
  })

  it('offers to run only JavaScript and HTML', () => {
    const editor = mount([code('select 1', { language: 'sql' })])
    const runner = enableCodeRunner(editor)
    expect(runner.run([0])).toBe(false)
    editor.exec(insertRunnableCode('html'))
    expect(editor.state.doc.child(1).attrs.language).toBe('html')
    runner.destroy()
    editor.destroy()
  })
})
