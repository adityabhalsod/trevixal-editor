// @vitest-environment happy-dom
import {
  AllSelection,
  type Command,
  type EditorNode,
  EditorState,
  Fragment,
  NodeSelection,
  type Path,
  Schema,
  TextSelection,
  applyInputRules,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
  serializeToHTML,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { deleteMath, findMathAt, insertMath, insertMathBlock, setMathLatex } from '../src/commands'
import { mathInputRules } from '../src/input-rules'
import { MATH_BLOCK_NODE, MATH_NODE, mathNodes } from '../src/schema'
import { mathUICommands } from '../src/ui'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...mathNodes() },
  marks: defaultMarks(),
})

function p(...content: (string | EditorNode)[]): EditorNode {
  return schema.node(
    'paragraph',
    undefined,
    content
      .filter((item) => item !== '')
      .map((item) => (typeof item === 'string' ? schema.text(item) : item)),
  )
}

function math(latex: string): EditorNode {
  return schema.node(MATH_NODE, { latex })
}

function mathBlock(latex: string): EditorNode {
  return schema.node(MATH_BLOCK_NODE, { latex })
}

function docOf(...blocks: EditorNode[]): EditorNode {
  return schema.node('doc', undefined, Fragment.from(blocks))
}

function stateAt(doc: EditorNode, path: Path, offset = 0, head?: [Path, number]): EditorState {
  return EditorState.create({
    schema,
    doc,
    selection: new TextSelection(pos(path, offset), head ? pos(head[0], head[1]) : undefined),
  })
}

function run(state: EditorState, command: Command): EditorState {
  const tr = command(state)
  expect(tr).not.toBeNull()
  return state.apply(tr as NonNullable<typeof tr>)
}

function declines(state: EditorState, command: Command): void {
  expect(command(state)).toBeNull()
}

// ---- schema ----------------------------------------------------------------

describe('mathNodes schema shape', () => {
  it('registers an inline atom and a block atom', () => {
    expect(schema.nodes[MATH_NODE]?.isInline).toBe(true)
    expect(schema.nodes[MATH_NODE]?.isAtom).toBe(true)
    expect(schema.nodes[MATH_BLOCK_NODE]?.isInline).toBe(false)
    expect(schema.nodes[MATH_BLOCK_NODE]?.isAtom).toBe(true)
  })

  it('defaults the source to the empty string', () => {
    expect(schema.node(MATH_NODE).attrs.latex).toBe('')
    expect(schema.node(MATH_BLOCK_NODE).attrs.latex).toBe('')
  })
})

describe('mathNodes serialization', () => {
  it('renders the inline atom with its source and an accessible label', () => {
    const html = serializeToHTML(docOf(p(math('x^2'))))
    expect(html).toContain('<span class="trevixal-math" data-latex="x^2" role="math"')
    expect(html).toContain('aria-label="x^2"')
    expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline">')
    expect(html).toContain('<msup><mi>x</mi><mn>2</mn></msup>')
  })

  it('renders the block atom in display mode', () => {
    const html = serializeToHTML(docOf(mathBlock('\\sum_{i=1}^{n} i')))
    expect(html).toContain('class="trevixal-math trevixal-math--block"')
    expect(html).toContain('display="block"')
    expect(html).toContain('<munderover>')
  })

  it('shows a placeholder instead of an empty formula', () => {
    const html = serializeToHTML(docOf(p(math(''))))
    expect(html).toContain('<span class="trevixal-math__empty">∅</span>')
    expect(html).not.toContain('<math')
  })

  it('escapes a hostile source in both the attribute and the rendered markup', () => {
    const hostile = '\\text{</span><img src=x onerror="alert(1)">}'
    const html = serializeToHTML(docOf(p(math(hostile))))
    expect(html).not.toContain('<img')
    expect(html).not.toContain('</span><img')
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
    // The attribute copy is escaped too, so the tag cannot be broken out of.
    expect(html).toContain('data-latex="\\text{&lt;/span&gt;&lt;img')
  })

  it('renders a custom renderer instead of the built-in converter', () => {
    const custom = new Schema({
      nodes: {
        ...defaultNodes(),
        ...mathNodes({ render: (latex, display) => `<i>${display ? 'D' : 'I'}:${latex}</i>` }),
      },
      marks: defaultMarks(),
    })
    const doc = custom.node('doc', undefined, [
      custom.node('paragraph', undefined, [custom.node(MATH_NODE, { latex: 'q' })]),
      custom.node(MATH_BLOCK_NODE, { latex: 'q' }),
    ])
    const html = serializeToHTML(doc)
    expect(html).toContain('<i>I:q</i>')
    expect(html).toContain('<i>D:q</i>')
  })
})

describe('mathNodes parsing', () => {
  it('round trips an inline formula', () => {
    const doc = docOf(p('a', math('x^2'), 'b'))
    const back = parseHTML(schema, serializeToHTML(doc))
    const block = back.child(0)
    expect(block.type.name).toBe('paragraph')
    expect(block.child(1).type.name).toBe(MATH_NODE)
    expect(block.child(1).attrs.latex).toBe('x^2')
    expect(block.textContent).toBe('ab')
  })

  it('round trips a display formula', () => {
    const doc = docOf(mathBlock('\\frac{1}{2}'))
    const back = parseHTML(schema, serializeToHTML(doc))
    expect(back.child(0).type.name).toBe(MATH_BLOCK_NODE)
    expect(back.child(0).attrs.latex).toBe('\\frac{1}{2}')
  })

  it('round trips a source containing quotes and angle brackets', () => {
    const latex = 'a < b \\text{"x"}'
    const back = parseHTML(schema, serializeToHTML(docOf(p(math(latex)))))
    expect(back.child(0).child(0).attrs.latex).toBe(latex)
  })

  it('round trips an empty formula', () => {
    const back = parseHTML(schema, serializeToHTML(docOf(p(math('')))))
    expect(back.child(0).child(0).type.name).toBe(MATH_NODE)
    expect(back.child(0).child(0).attrs.latex).toBe('')
  })

  it('imports a <math> element through its LaTeX annotation', () => {
    const html =
      '<p><math><semantics><mrow><mi>x</mi></mrow>' +
      '<annotation encoding="application/x-tex">x^2</annotation></semantics></math></p>'
    const doc = parseHTML(schema, html)
    expect(doc.child(0).child(0).type.name).toBe(MATH_NODE)
    expect(doc.child(0).child(0).attrs.latex).toBe('x^2')
  })

  it('imports a display <math> element as a block formula', () => {
    const html =
      '<math display="block"><semantics><mrow><mi>x</mi></mrow>' +
      '<annotation encoding="application/x-tex">\\frac{a}{b}</annotation></semantics></math>'
    const doc = parseHTML(schema, html)
    expect(doc.child(0).type.name).toBe(MATH_BLOCK_NODE)
    expect(doc.child(0).attrs.latex).toBe('\\frac{a}{b}')
  })

  it('drops a <math> element with no LaTeX annotation rather than reading its markup', () => {
    const html = '<p><math><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow></math></p>'
    const doc = parseHTML(schema, html)
    const names = doc.child(0).content.children.map((child) => child.type.name)
    expect(names).not.toContain(MATH_NODE)
    expect(names).not.toContain(MATH_BLOCK_NODE)
  })

  it('rejects an annotation in an encoding other than TeX', () => {
    const html =
      '<p><math><semantics><mrow><mi>x</mi></mrow>' +
      '<annotation encoding="text/plain">x^2</annotation></semantics></math></p>'
    const doc = parseHTML(schema, html)
    expect(doc.child(0).content.children.map((child) => child.type.name)).not.toContain(MATH_NODE)
  })

  it('never lets a script inside a pasted <math> reach the document', () => {
    const html =
      '<p><math><semantics><annotation encoding="application/x-tex">x</annotation>' +
      '</semantics><script>alert(1)</script></math></p>'
    const doc = parseHTML(schema, html)
    expect(serializeToHTML(doc)).not.toContain('<script>')
    expect(doc.child(0).child(0).attrs.latex).toBe('x')
  })
})

// ---- commands --------------------------------------------------------------

describe('insertMath', () => {
  it('inserts an inline atom at the caret', () => {
    const state = run(stateAt(docOf(p('ab')), [0], 1), insertMath('x^2'))
    const block = state.doc.child(0)
    expect(block.content.children.map((child) => child.type.name)).toEqual([
      'text',
      MATH_NODE,
      'text',
    ])
    expect(block.child(1).attrs.latex).toBe('x^2')
  })

  it('puts the caret after the new atom', () => {
    const state = run(stateAt(docOf(p('ab')), [0], 1), insertMath('x'))
    expect(state.selection.from.offset).toBe(2)
  })

  it('turns a selected run of text into the formula', () => {
    const state = run(stateAt(docOf(p('E=mc^2 rest')), [0], 0, [[0], 6]), insertMath('fallback'))
    const block = state.doc.child(0)
    expect(block.child(0).attrs.latex).toBe('E=mc^2')
    expect(block.textContent).toBe(' rest')
  })

  it('prefers the selected text over the argument, whitespace trimmed', () => {
    const state = run(stateAt(docOf(p('  a+b  ')), [0], 0, [[0], 7]), insertMath('ignored'))
    expect(state.doc.child(0).child(0).attrs.latex).toBe('a+b')
  })

  it('falls back to the argument when the selection is only whitespace', () => {
    const state = run(stateAt(docOf(p('   ')), [0], 0, [[0], 3]), insertMath('z'))
    expect(state.doc.child(0).child(0).attrs.latex).toBe('z')
  })

  it('defaults to an empty formula', () => {
    const state = run(stateAt(docOf(p('')), [0], 0), insertMath())
    expect(state.doc.child(0).child(0).attrs.latex).toBe('')
  })

  it('declines when the schema has no math node', () => {
    const plain = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
    const doc = plain.node('doc', undefined, [plain.node('paragraph')])
    const state = EditorState.create({
      schema: plain,
      doc,
      selection: new TextSelection(pos([0], 0)),
    })
    declines(state, insertMath('x'))
  })

  it('declines on a node selection, which is not a text insertion point', () => {
    const doc = docOf(p('a'), mathBlock('x'))
    const state = EditorState.create({ schema, doc, selection: new NodeSelection([1]) })
    declines(state, insertMath('y'))
  })
})

describe('insertMathBlock', () => {
  it('replaces an empty paragraph at the caret', () => {
    const state = run(stateAt(docOf(p('a'), p(), p('b')), [1], 0), insertMathBlock('x^2'))
    expect(state.doc.content.children.map((child) => child.type.name)).toEqual([
      'paragraph',
      MATH_BLOCK_NODE,
      'paragraph',
    ])
    expect(state.doc.child(1).attrs.latex).toBe('x^2')
  })

  it('inserts after a paragraph that has content', () => {
    const state = run(stateAt(docOf(p('a')), [0], 1), insertMathBlock('x'))
    expect(state.doc.content.children.map((child) => child.type.name)).toEqual([
      'paragraph',
      MATH_BLOCK_NODE,
    ])
    expect(state.doc.child(0).textContent).toBe('a')
  })

  it('selects the block it created so an editor can open on it', () => {
    const state = run(stateAt(docOf(p('a')), [0], 1), insertMathBlock('x'))
    expect(state.selection).toBeInstanceOf(NodeSelection)
    expect((state.selection as NodeSelection).path).toEqual([1])
  })

  it('inserts after the selected node when a node is selected', () => {
    const doc = docOf(p('a'), mathBlock('x'), p('b'))
    const state = EditorState.create({ schema, doc, selection: new NodeSelection([1]) })
    const next = run(state, insertMathBlock('y'))
    expect(next.doc.child(2).type.name).toBe(MATH_BLOCK_NODE)
    expect(next.doc.child(2).attrs.latex).toBe('y')
  })

  it('does not replace an empty code block, whose language may still be pending', () => {
    const doc = docOf(schema.node('codeBlock', { language: null }))
    const state = stateAt(doc, [0], 0)
    const next = run(state, insertMathBlock('x'))
    expect(next.doc.content.children.map((child) => child.type.name)).toEqual([
      'codeBlock',
      MATH_BLOCK_NODE,
    ])
  })

  it('declines when the schema has no mathBlock node', () => {
    const plain = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
    const doc = plain.node('doc', undefined, [plain.node('paragraph')])
    const state = EditorState.create({
      schema: plain,
      doc,
      selection: new TextSelection(pos([0], 0)),
    })
    declines(state, insertMathBlock('x'))
  })
})

describe('findMathAt', () => {
  it('finds the inline atom before the caret', () => {
    const state = stateAt(docOf(p('a', math('x'), 'b')), [0], 2)
    const hit = findMathAt(state)
    expect(hit?.node.attrs.latex).toBe('x')
    expect(hit?.block).toBe(false)
    expect(hit?.path).toEqual([0, 1])
    expect(hit?.range).toEqual({ from: 1, to: 2 })
  })

  it('finds the inline atom after the caret', () => {
    const state = stateAt(docOf(p('a', math('x'), 'b')), [0], 1)
    expect(findMathAt(state)?.path).toEqual([0, 1])
  })

  it('finds the atom under a node selection', () => {
    const doc = docOf(p('a', math('x')))
    const state = EditorState.create({ schema, doc, selection: new NodeSelection([0, 1]) })
    const hit = findMathAt(state)
    expect(hit?.block).toBe(false)
    expect(hit?.range).toEqual({ from: 1, to: 2 })
  })

  it('finds a mathBlock under a node selection', () => {
    const doc = docOf(p('a'), mathBlock('y'))
    const state = EditorState.create({ schema, doc, selection: new NodeSelection([1]) })
    const hit = findMathAt(state)
    expect(hit?.block).toBe(true)
    expect(hit?.range).toBeNull()
    expect(hit?.path).toEqual([1])
  })

  it('finds a mathBlock under a whole-document selection', () => {
    const doc = docOf(mathBlock('y'))
    const state = EditorState.create({ schema, doc, selection: new AllSelection(doc) })
    const hit = findMathAt(state)
    expect(hit?.path).toEqual([0])
    expect(hit?.block).toBe(true)
  })

  it('returns null when the caret is nowhere near a formula', () => {
    expect(findMathAt(stateAt(docOf(p('abc')), [0], 1))).toBeNull()
  })

  it('returns null for a node selection on some other node', () => {
    const doc = docOf(p('a'), schema.node('horizontalRule'))
    const state = EditorState.create({ schema, doc, selection: new NodeSelection([1]) })
    expect(findMathAt(state)).toBeNull()
  })
})

describe('setMathLatex', () => {
  it('rewrites the atom before the caret', () => {
    const state = run(stateAt(docOf(p('a', math('x'), 'b')), [0], 2), setMathLatex('y^2'))
    expect(state.doc.child(0).child(1).attrs.latex).toBe('y^2')
  })

  it('rewrites the atom after the caret', () => {
    const state = run(stateAt(docOf(p('a', math('x'))), [0], 1), setMathLatex('z'))
    expect(state.doc.child(0).child(1).attrs.latex).toBe('z')
  })

  it('rewrites the node under a node selection', () => {
    const doc = docOf(p('a', math('x')))
    const state = EditorState.create({ schema, doc, selection: new NodeSelection([0, 1]) })
    expect(run(state, setMathLatex('q')).doc.child(0).child(1).attrs.latex).toBe('q')
  })

  it('rewrites a selected mathBlock and keeps the selection on it', () => {
    const doc = docOf(mathBlock('x'))
    const state = EditorState.create({ schema, doc, selection: new NodeSelection([0]) })
    const next = run(state, setMathLatex('\\frac{1}{2}'))
    expect(next.doc.child(0).attrs.latex).toBe('\\frac{1}{2}')
    expect(next.selection).toBeInstanceOf(NodeSelection)
  })

  it('re-renders the markup from the new source', () => {
    const state = run(stateAt(docOf(p(math('x'))), [0], 1), setMathLatex('\\alpha'))
    expect(serializeToHTML(state.doc)).toContain('<mi>α</mi>')
  })

  it('declines when there is no formula at the selection', () => {
    declines(stateAt(docOf(p('abc')), [0], 1), setMathLatex('x'))
  })
})

describe('deleteMath', () => {
  it('removes the inline atom and leaves the caret in its place', () => {
    const state = run(stateAt(docOf(p('a', math('x'), 'b')), [0], 2), deleteMath)
    expect(state.doc.child(0).textContent).toBe('ab')
    expect(state.doc.child(0).content.children.map((child) => child.type.name)).toEqual(['text'])
    expect(state.selection.from.offset).toBe(1)
  })

  it('removes a selected mathBlock', () => {
    const doc = docOf(p('a'), mathBlock('x'), p('b'))
    const state = EditorState.create({ schema, doc, selection: new NodeSelection([1]) })
    const next = run(state, deleteMath)
    expect(next.doc.content.children.map((child) => child.type.name)).toEqual([
      'paragraph',
      'paragraph',
    ])
  })

  it('declines when there is no formula at the selection', () => {
    declines(stateAt(docOf(p('abc')), [0], 1), deleteMath)
  })
})

describe('mathUICommands', () => {
  it('exposes the three commands the UI needs', () => {
    const commands = mathUICommands()
    expect(Object.keys(commands).sort()).toEqual(['insertMath', 'insertMathBlock', 'setMathLatex'])
  })

  it('drives the same behaviour as the bare commands', () => {
    const commands = mathUICommands()
    const inserted = run(stateAt(docOf(p('')), [0], 0), commands.insertMath('x^2'))
    expect(inserted.doc.child(0).child(0).attrs.latex).toBe('x^2')

    const updated = run(inserted, commands.setMathLatex('y'))
    expect(updated.doc.child(0).child(0).attrs.latex).toBe('y')

    const block = run(updated, commands.insertMathBlock('z'))
    expect(block.doc.child(1).type.name).toBe(MATH_BLOCK_NODE)
  })
})

// ---- input rule ------------------------------------------------------------

const rules = mathInputRules()

/** Simulate typing `char` at the caret; returns the resulting doc, or null. */
function type(state: EditorState, char: string): EditorNode | null {
  const tr = applyInputRules(state, char, rules)
  return tr ? state.apply(tr).doc : null
}

describe('mathInputRules', () => {
  it('turns $x^2$ into an inline atom on the closing dollar', () => {
    const doc = type(stateAt(docOf(p('$x^2')), [0], 4), '$')
    expect(doc).not.toBeNull()
    const block = (doc as EditorNode).child(0)
    expect(block.childCount).toBe(1)
    expect(block.child(0).type.name).toBe(MATH_NODE)
    expect(block.child(0).attrs.latex).toBe('x^2')
  })

  it('keeps the text before the formula', () => {
    const doc = type(stateAt(docOf(p('see $a+b')), [0], 8), '$')
    const block = (doc as EditorNode).child(0)
    expect(block.child(0).textContent).toBe('see ')
    expect(block.child(1).attrs.latex).toBe('a+b')
  })

  it('leaves the caret after the new atom', () => {
    const state = stateAt(docOf(p('$x')), [0], 2)
    const tr = applyInputRules(state, '$', rules)
    expect(tr).not.toBeNull()
    expect(state.apply(tr as NonNullable<typeof tr>).selection.from.offset).toBe(1)
  })

  it('trims whitespace around the source', () => {
    const doc = type(stateAt(docOf(p('$ a + b ')), [0], 8), '$')
    expect((doc as EditorNode).child(0).child(0).attrs.latex).toBe('a + b')
  })

  it('does not fire on an empty $$', () => {
    expect(type(stateAt(docOf(p('$')), [0], 1), '$')).toBeNull()
  })

  it('does not fire on the first closing dollar of display math', () => {
    expect(type(stateAt(docOf(p('$$x^2')), [0], 5), '$')).toBeNull()
  })

  it('does not fire on the second closing dollar of display math', () => {
    expect(type(stateAt(docOf(p('$$x^2$')), [0], 6), '$')).toBeNull()
  })

  it('does not fire on a source that is only whitespace', () => {
    expect(type(stateAt(docOf(p('$  ')), [0], 3), '$')).toBeNull()
  })

  it('does not treat an escaped \\$ as a closing delimiter', () => {
    expect(type(stateAt(docOf(p('$a\\')), [0], 3), '$')).toBeNull()
  })

  it('does not fire when there is no opening dollar', () => {
    expect(type(stateAt(docOf(p('x^2')), [0], 3), '$')).toBeNull()
  })

  it('declines inside a code block, where $x$ is source text', () => {
    const doc = docOf(schema.node('codeBlock', { language: null }, [schema.text('$x^2')]))
    expect(type(stateAt(doc, [0], 4), '$')).toBeNull()
  })

  it('declines when the schema has no math node', () => {
    const plain = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
    const doc = plain.node('doc', undefined, [
      plain.node('paragraph', undefined, [plain.text('$x')]),
    ])
    const state = EditorState.create({
      schema: plain,
      doc,
      selection: new TextSelection(pos([0], 2)),
    })
    expect(applyInputRules(state, '$', rules)).toBeNull()
  })
})

// ---- DOM -------------------------------------------------------------------

describe('math in a mounted editor', () => {
  it('renders MathML inside the inline atom', () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const editor = createEditor({
      schema,
      element,
      doc: docOf(p('a', math('x^2'))),
    })
    const rendered = element.querySelector('span.trevixal-math')
    expect(rendered).not.toBeNull()
    expect(rendered?.getAttribute('data-latex')).toBe('x^2')
    expect(rendered?.innerHTML).toContain('<math')
    expect(rendered?.querySelector('msup')).not.toBeNull()
    editor.destroy()
    element.remove()
  })

  it('renders a display formula as a block', () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const editor = createEditor({ schema, element, doc: docOf(mathBlock('\\frac{1}{2}')) })
    const rendered = element.querySelector('div.trevixal-math--block')
    expect(rendered).not.toBeNull()
    expect(rendered?.innerHTML).toContain('display="block"')
    expect(rendered?.querySelector('mfrac')).not.toBeNull()
    editor.destroy()
    element.remove()
  })

  it('re-renders when the source changes', () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const editor = createEditor({ schema, element, doc: docOf(p(math('x'))) })
    const state = EditorState.create({
      schema,
      doc: editor.state.doc,
      selection: new TextSelection(pos([0], 1)),
    })
    const tr = setMathLatex('\\alpha')(state)
    expect(tr).not.toBeNull()
    editor.dispatch(tr as NonNullable<typeof tr>)
    expect(element.querySelector('span.trevixal-math')?.innerHTML).toContain('α')
    editor.destroy()
    element.remove()
  })
})
