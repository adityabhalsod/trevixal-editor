// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  convertCase,
  setLetterSpacing,
  setLineHeight,
  setParagraphSpacing,
  toggleSmallCaps,
} from '../src/commands/commands'
import { createEditor } from '../src/editor/editor'
import { safeLineHeight } from '../src/schema/basic'
import { serializeToHTML } from '../src/serialize/html'
import { parseHTML } from '../src/serialize/parse-html'
import { bold, cursor, doc, h, p, range, stateWith, testSchema, text } from './helpers'

function editorWith(content: string) {
  const editor = createEditor({ schema: testSchema })
  editor.commands.insertText(content)
  editor.commands.selectAll()
  return editor
}

describe('small caps', () => {
  it('wraps the selection in a small-caps span', () => {
    const editor = editorWith('quiet please')
    expect(editor.exec(toggleSmallCaps)).toBe(true)
    expect(editor.getHTML()).toContain('font-variant-caps: small-caps')
    editor.destroy()
  })

  it('toggles back off, leaving the text bare', () => {
    const editor = editorWith('quiet please')
    editor.exec(toggleSmallCaps)
    editor.commands.selectAll()
    editor.exec(toggleSmallCaps)
    expect(editor.getHTML()).toBe('<p>quiet please</p>')
    editor.destroy()
  })

  it('round-trips through HTML', () => {
    const parsed = parseHTML(
      testSchema,
      '<p><span style="font-variant-caps: small-caps">shout</span></p>',
    )
    expect(parsed.child(0).child(0).marks[0]?.type.name).toBe('smallCaps')
    expect(serializeToHTML(parsed)).toContain('font-variant-caps: small-caps')
  })

  it('ignores a span whose font-variant is not small-caps', () => {
    const parsed = parseHTML(testSchema, '<p><span style="font-variant-caps: normal">x</span></p>')
    expect(parsed.child(0).child(0).marks).toEqual([])
  })
})

describe('letter spacing', () => {
  it('serializes a sanitized length', () => {
    const editor = editorWith('w i d e')
    expect(editor.exec(setLetterSpacing('2px'))).toBe(true)
    expect(editor.getHTML()).toContain('letter-spacing: 2px')
    editor.destroy()
  })

  it('replaces rather than stacks when reapplied', () => {
    const editor = editorWith('w i d e')
    editor.exec(setLetterSpacing('1px'))
    editor.commands.selectAll()
    editor.exec(setLetterSpacing('4px'))
    const html = editor.getHTML()
    expect(html).toContain('letter-spacing: 4px')
    expect(html).not.toContain('1px')
    editor.destroy()
  })

  it('removes the mark when cleared with null', () => {
    const editor = editorWith('w i d e')
    editor.exec(setLetterSpacing('3px'))
    editor.commands.selectAll()
    expect(editor.exec(setLetterSpacing(null))).toBe(true)
    expect(editor.getHTML()).toBe('<p>w i d e</p>')
    editor.destroy()
  })

  it('round-trips through HTML', () => {
    const parsed = parseHTML(testSchema, '<p><span style="letter-spacing: 0.5em">a</span></p>')
    const mark = parsed.child(0).child(0).marks[0]
    expect(mark?.type.name).toBe('letterSpacing')
    expect(mark?.attrs.spacing).toBe('0.5em')
  })

  it('drops an unsafe spacing value at serialization time', () => {
    const editor = editorWith('sneaky')
    editor.exec(setLetterSpacing('2px; background: url(evil.png)'))
    const html = editor.getHTML()
    expect(html).not.toContain('evil')
    expect(html).not.toContain('letter-spacing')
    editor.destroy()
  })

  it('rejects a span whose letter-spacing has no usable unit', () => {
    const parsed = parseHTML(testSchema, '<p><span style="letter-spacing: 3kg">a</span></p>')
    expect(parsed.child(0).child(0).marks).toEqual([])
  })
})

describe('line height', () => {
  it('accepts a bare multiplier without turning it into pixels', () => {
    expect(safeLineHeight(1.5)).toBe('1.5')
    expect(safeLineHeight('2')).toBe('2')
    expect(safeLineHeight('1.5em')).toBe('1.5em')
    expect(safeLineHeight('120%')).toBe('120%')
  })

  it('rejects unsafe and out-of-range values', () => {
    expect(safeLineHeight('1.5; background: url(evil.png)')).toBeNull()
    expect(safeLineHeight('999')).toBeNull()
    expect(safeLineHeight('3kg')).toBeNull()
    expect(safeLineHeight(null)).toBeNull()
  })

  it('emits line-height on the selected block', () => {
    const editor = editorWith('breathe')
    expect(editor.exec(setLineHeight(1.5))).toBe(true)
    expect(editor.getHTML()).toBe('<p style="line-height: 1.5">breathe</p>')
    editor.destroy()
  })

  it('clears back to the default when set to null', () => {
    const editor = editorWith('breathe')
    editor.exec(setLineHeight(2))
    editor.commands.selectAll()
    expect(editor.exec(setLineHeight(null))).toBe(true)
    expect(editor.getHTML()).toBe('<p>breathe</p>')
    editor.destroy()
  })

  it('round-trips a multiplier through HTML', () => {
    const parsed = parseHTML(testSchema, '<p style="line-height: 1.5">x</p>')
    expect(parsed.child(0).attrs.lineHeight).toBe('1.5')
    expect(serializeToHTML(parsed)).toContain('line-height: 1.5')
  })

  it('drops an unsafe line-height on import', () => {
    const parsed = parseHTML(testSchema, '<p style="line-height: 400">x</p>')
    expect(parsed.child(0).attrs.lineHeight).toBeNull()
  })

  it('applies to a heading without changing its type', () => {
    const state = stateWith(doc(h(2, 'Title')), cursor([0], 2))
    const tr = setLineHeight(1.25)(state)
    expect(tr).not.toBeNull()
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.child(0).type.name).toBe('heading')
    expect(next.doc.child(0).attrs.lineHeight).toBe('1.25')
  })
})

describe('paragraph spacing', () => {
  it('emits margin-top and margin-bottom', () => {
    const editor = editorWith('spaced')
    expect(editor.exec(setParagraphSpacing({ before: '12px', after: '18px' }))).toBe(true)
    const html = editor.getHTML()
    expect(html).toContain('margin-top: 12px')
    expect(html).toContain('margin-bottom: 18px')
    editor.destroy()
  })

  it('leaves the untouched side alone', () => {
    const editor = editorWith('spaced')
    editor.exec(setParagraphSpacing({ before: '10px', after: '10px' }))
    editor.commands.selectAll()
    editor.exec(setParagraphSpacing({ after: null }))
    const html = editor.getHTML()
    expect(html).toContain('margin-top: 10px')
    expect(html).not.toContain('margin-bottom')
    editor.destroy()
  })

  it('declines when given no keys at all', () => {
    const state = stateWith(doc(p('x')), cursor([0], 0))
    expect(setParagraphSpacing({})(state)).toBeNull()
  })

  it('round-trips through HTML', () => {
    const parsed = parseHTML(testSchema, '<p style="margin-top: 8px; margin-bottom: 16px">x</p>')
    expect(parsed.child(0).attrs.spaceBefore).toBe('8px')
    expect(parsed.child(0).attrs.spaceAfter).toBe('16px')
    expect(serializeToHTML(parsed)).toContain('margin-top: 8px')
  })

  it('drops unsafe spacing on import', () => {
    const parsed = parseHTML(testSchema, '<p style="margin-top: 5kg">x</p>')
    expect(parsed.child(0).attrs.spaceBefore).toBeNull()
  })

  it('coexists with align and indent on one block', () => {
    // The pre-existing layout attrs must keep working alongside the new ones.
    const state = stateWith(doc(p('x')), cursor([0], 0))
    const tr = setParagraphSpacing({ before: '4px' })(state)
    const spaced = state.apply(tr as NonNullable<typeof tr>)
    const html = serializeToHTML(
      doc(
        testSchema.node(
          'paragraph',
          { ...spaced.doc.child(0).attrs, align: 'center', indent: 1 },
          spaced.doc.child(0).content,
        ),
      ),
    )
    expect(html).toContain('text-align: center')
    expect(html).toContain('margin-inline-start: 2.5rem')
    expect(html).toContain('margin-top: 4px')
  })
})

describe('convertCase', () => {
  it('upper-cases the selected text', () => {
    const state = stateWith(doc(p('hello world')), range([0], 0, [0], 11))
    const tr = convertCase('upper')(state)
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.eq(doc(p('HELLO WORLD')))).toBe(true)
  })

  it('lower-cases the selected text', () => {
    const state = stateWith(doc(p('HELLO World')), range([0], 0, [0], 11))
    const tr = convertCase('lower')(state)
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.eq(doc(p('hello world')))).toBe(true)
  })

  it('title-cases each word and lowercases the rest', () => {
    const state = stateWith(doc(p('hELLO brave nEW world')), range([0], 0, [0], 21))
    const tr = convertCase('title')(state)
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.eq(doc(p('Hello Brave New World')))).toBe(true)
  })

  it('converts only the selected part of a block', () => {
    const state = stateWith(doc(p('keep this loud')), range([0], 10, [0], 14))
    const tr = convertCase('upper')(state)
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.eq(doc(p('keep this LOUD')))).toBe(true)
  })

  it('converts across two blocks', () => {
    const state = stateWith(doc(p('first line'), h(2, 'second line')), range([0], 0, [1], 11))
    const tr = convertCase('upper')(state)
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.eq(doc(p('FIRST LINE'), h(2, 'SECOND LINE')))).toBe(true)
  })

  it('keeps the marks on each text node it rewrites', () => {
    const state = stateWith(doc(p(text('plain '), bold('bold'))), range([0], 0, [0], 10))
    const tr = convertCase('upper')(state)
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.eq(doc(p(text('PLAIN '), bold('BOLD'))))).toBe(true)
  })

  it('does not restart a title-cased word at a mark boundary', () => {
    // "wor" + bold "ld" is one word; only its very first letter capitalizes.
    const state = stateWith(doc(p(text('wor'), bold('ld'))), range([0], 0, [0], 5))
    const tr = convertCase('title')(state)
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.eq(doc(p(text('Wor'), bold('ld'))))).toBe(true)
  })

  it('restarts title case at the start of each block', () => {
    const state = stateWith(doc(p('one two'), p('three four')), range([0], 0, [1], 10))
    const tr = convertCase('title')(state)
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.doc.eq(doc(p('One Two'), p('Three Four')))).toBe(true)
  })

  it('leaves the selection covering the same text', () => {
    const state = stateWith(doc(p('hello world')), range([0], 0, [0], 11))
    const tr = convertCase('upper')(state)
    const next = state.apply(tr as NonNullable<typeof tr>)
    expect(next.selection.from).toEqual({ path: [0], offset: 0 })
    expect(next.selection.to).toEqual({ path: [0], offset: 11 })
  })

  it('declines on an empty selection', () => {
    const state = stateWith(doc(p('hello')), cursor([0], 2))
    expect(convertCase('upper')(state)).toBeNull()
    expect(convertCase('title')(state)).toBeNull()
  })

  it('declines when the text is already in the requested case', () => {
    const state = stateWith(doc(p('LOUD')), range([0], 0, [0], 4))
    expect(convertCase('upper')(state)).toBeNull()
  })

  it('is reachable from the bound editor commands', () => {
    const editor = editorWith('make me loud')
    expect(editor.commands.convertCase('upper')).toBe(true)
    expect(editor.getHTML()).toBe('<p>MAKE ME LOUD</p>')
    editor.destroy()
  })
})
