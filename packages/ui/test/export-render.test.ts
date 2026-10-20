// @vitest-environment happy-dom
import {
  type Editor,
  type EditorNode,
  Schema,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
} from '@trevixal/core'
import { afterEach, describe, expect, it } from 'vitest'
import { captureRenderedBlocks, renderedNodeHTML } from '../src/export-render'

const DRAWING =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100"/></svg>'

/** A drawing, as the blocks extension makes one: an atom whose own markup is a lone SVG. */
const schema = new Schema({
  nodes: {
    ...defaultNodes(),
    drawing: { group: 'block', atom: true, toHTML: () => ({ tag: 'div', innerHTML: DRAWING }) },
  },
  marks: defaultMarks(),
})

/** The look the editor's stylesheet gives a quote, a finished task and code, in small. */
const STYLES = `
  blockquote { background-color: rgba(0, 0, 255, 0.1); border-left: 4px solid rgb(51, 102, 204); color: rgb(107, 107, 128); }
  li[data-checked="true"] > p { text-decoration-line: line-through; color: rgb(119, 119, 119); }
  pre { background-color: rgb(245, 245, 245); }
  .trevixal-code-line--highlight { background-color: rgba(255, 200, 0, 0.25); }
`

const editors: Editor[] = []

function mount(html: string): Editor {
  const style = document.createElement('style')
  style.textContent = STYLES
  document.head.appendChild(style)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host, doc: parseHTML(schema, html, document) })
  editors.push(editor)
  return editor
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

/** The first node of a type, depth first. */
function find(editor: Editor, name: string): EditorNode {
  let found: EditorNode | null = null
  const visit = (node: EditorNode): void => {
    if (found) return
    if (node.type.name === name) found = node
    else node.content.children.forEach(visit)
  }
  visit(editor.state.doc)
  if (!found) throw new Error(`no ${name}`)
  return found
}

describe('what the editor draws, captured for export', () => {
  it('reads a block’s ground and lines, and how its text is set, off the stylesheet', () => {
    const editor = mount(
      '<blockquote><p>Quote</p></blockquote><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Done</p></li></ul>',
    )
    const captured = captureRenderedBlocks(editor, { looks: true })
    expect(captured.get(find(editor, 'blockquote'))).toEqual({
      look: { color: '#6b6b80' },
      // The tint as it shows over the white page: a format without transparency needs that.
      box: { fill: '#e6e6ff', border: { color: '#3366cc', width: 4, sides: ['left'] } },
    })
    const done = find(editor, 'taskItem').child(0)
    expect(captured.get(done)?.look).toEqual({ color: '#777777', strike: true })
  })

  it('leaves out a fill only the editor shows, a selected block’s', () => {
    const editor = mount('<blockquote><p>Quote</p></blockquote>')
    editor.view?.dom.querySelector('blockquote')?.setAttribute('data-trevixal-selected', '')
    const box = captureRenderedBlocks(editor, { looks: true }).get(find(editor, 'blockquote'))?.box
    expect(box?.fill).toBeUndefined()
    expect(box?.border?.sides).toEqual(['left'])
  })

  it('reads the lines a code block marks, each band laid on the block’s ground', () => {
    const editor = mount('<pre><code>a\nb</code></pre>')
    const marker = document.createElement('span')
    marker.className = 'trevixal-code-line trevixal-code-line--highlight'
    marker.dataset.line = '2'
    editor.view?.dom.querySelector('pre')?.appendChild(marker)
    const code = find(editor, 'codeBlock')
    expect(captureRenderedBlocks(editor).get(code)?.lines).toEqual([
      { line: 2, className: 'trevixal-code-line trevixal-code-line--highlight', band: '#f8eab8' },
    ])
  })

  it('puts the line markers back in the code a page is written with', () => {
    const editor = mount('<pre><code>a\nb</code></pre>')
    const code = find(editor, 'codeBlock')
    const html = renderedNodeHTML(
      new Map([[code, { lines: [{ line: 2, className: 'trevixal-code-line--highlight' }] }]]),
    )(code)
    expect(html).toBe(
      '<pre><code>a\n<span class="trevixal-code-line--highlight" data-line="2" aria-hidden="true"></span>b</code></pre>',
    )
  })

  it('takes a drawing as a picture, as tall as its own proportions make it', () => {
    const editor = mount('<p>Before</p>')
    editor.setContent({ type: 'doc', content: [{ type: 'drawing' }] } as never)
    const image = captureRenderedBlocks(editor, { looks: true }).get(find(editor, 'drawing'))?.image
    expect(image?.markup).toBe(DRAWING)
    // Nothing is laid out here, so it takes the page's width, and half that high.
    expect(image).toMatchObject({ width: 640, height: 320, alt: 'Drawing' })
  })

  it('reads only code without looks asked for', () => {
    const editor = mount('<blockquote><p>Quote</p></blockquote>')
    expect(captureRenderedBlocks(editor).size).toBe(0)
  })
})
