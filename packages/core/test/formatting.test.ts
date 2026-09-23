import { describe, expect, it } from 'vitest'
import {
  clearFormatting,
  indentBlocks,
  setMark,
  setTextAlign,
  unsetMark,
} from '../src/commands/commands'
import { createEditor } from '../src/editor/editor'
import {
  safeCSSValue,
  safeColor,
  safeFontFamily,
  safeImageSrc,
  safeLength,
} from '../src/schema/basic'
import { doc, p, range, stateWith, testSchema } from './helpers'

function editorWith(text: string) {
  const editor = createEditor({ schema: testSchema })
  if (text) {
    editor.commands.insertText(text)
    editor.commands.selectAll()
  }
  return editor
}

describe('CSS sanitizers', () => {
  it('rejects values that could break out of the declaration', () => {
    expect(safeCSSValue('red')).toBe('red')
    expect(safeCSSValue('red; background: url(evil)')).toBeNull()
    expect(safeCSSValue('expression(alert(1))')).toBeNull()
    expect(safeCSSValue('url(javascript:alert(1))')).toBeNull()
    expect(safeCSSValue('a'.repeat(200))).toBeNull()
    expect(safeCSSValue(42)).toBeNull()
  })

  it('accepts only real colors', () => {
    expect(safeColor('#ff0000')).toBe('#ff0000')
    expect(safeColor('rgb(255, 0, 0)')).toBe('rgb(255, 0, 0)')
    expect(safeColor('rebeccapurple')).toBe('rebeccapurple')
    expect(safeColor('red; x: y')).toBeNull()
    expect(safeColor('</style><script>')).toBeNull()
  })

  it('normalizes lengths and requires a known unit', () => {
    expect(safeLength('12pt')).toBe('12pt')
    expect(safeLength('16')).toBe('16px')
    expect(safeLength('12kg')).toBeNull()
  })

  it('allows quoted font stacks but nothing exotic', () => {
    expect(safeFontFamily("'Open Sans', system-ui, sans-serif")).toBe(
      "'Open Sans', system-ui, sans-serif",
    )
    expect(safeFontFamily('Arial')).toBe('Arial')
    expect(safeFontFamily('Arial; background: red')).toBeNull()
    expect(safeFontFamily('url(x)')).toBeNull()
  })
})

describe('attributed marks', () => {
  it('applies font size, family and colors as sanitized styles', () => {
    const editor = editorWith('styled')
    editor.commands.setFontSize('18pt')
    editor.commands.setTextColor('#dc2626')
    const html = editor.getHTML()
    expect(html).toContain('font-size: 18pt')
    expect(html).toContain('color: #dc2626')
    editor.destroy()
  })

  it('replaces rather than toggles when the same mark type is reapplied', () => {
    const editor = editorWith('resize me')
    editor.commands.setFontSize('12pt')
    editor.commands.setFontSize('24pt')
    const html = editor.getHTML()
    expect(html).toContain('font-size: 24pt')
    expect(html).not.toContain('12pt')
    editor.destroy()
  })

  it('drops unsafe attribute values at serialization time', () => {
    const editor = editorWith('sneaky')
    editor.exec(setMark('textColor', { color: 'red; background: url(evil.png)' }))
    expect(editor.getHTML()).not.toContain('evil')
    expect(editor.getHTML()).not.toContain('url(')
    editor.destroy()
  })

  it('unsets a mark type across the selection', () => {
    const editor = editorWith('colored')
    editor.commands.setTextColor('#000000')
    expect(editor.getHTML()).toContain('color: #000000')
    editor.exec(unsetMark('textColor'))
    expect(editor.getHTML()).toBe('<p>colored</p>')
    editor.destroy()
  })

  it('clears every mark at once', () => {
    const editor = editorWith('very formatted')
    editor.commands.toggleMark('bold')
    editor.commands.toggleMark('italic')
    editor.commands.setFontSize('14pt')
    editor.exec(clearFormatting)
    expect(editor.getHTML()).toBe('<p>very formatted</p>')
    editor.destroy()
  })

  it('reports mark attributes in the snapshot', () => {
    const editor = editorWith('inspect me')
    editor.commands.setFontSize('36pt')
    expect(editor.getSnapshot().markAttrs.fontSize).toEqual({ size: '36pt' })
    editor.destroy()
  })
})

describe('block layout', () => {
  it('aligns blocks and reports it in the snapshot', () => {
    const editor = editorWith('align me')
    editor.exec(setTextAlign('center'))
    expect(editor.getHTML()).toContain('text-align: center')
    expect(editor.getSnapshot().align).toBe('center')
    editor.exec(setTextAlign(null))
    expect(editor.getHTML()).toBe('<p>align me</p>')
    editor.destroy()
  })

  it('keeps the block type when aligning a heading', () => {
    const editor = createEditor({ schema: testSchema })
    editor.commands.insertText('Title')
    editor.commands.setHeading(2)
    editor.exec(setTextAlign('right'))
    expect(editor.getHTML()).toBe('<h2 style="text-align: right">Title</h2>')
    editor.destroy()
  })

  it('steps indent up and down, clamped at both ends', () => {
    const editor = editorWith('indent me')
    editor.exec(indentBlocks(1))
    expect(editor.getHTML()).toContain('margin-inline-start: 2.5rem')
    editor.exec(indentBlocks(1))
    expect(editor.getHTML()).toContain('margin-inline-start: 5rem')
    expect(editor.getSnapshot().indent).toBe(2)

    // Outdent past zero is a no-op rather than a negative margin.
    editor.exec(indentBlocks(-5))
    expect(editor.getHTML()).toBe('<p>indent me</p>')
    expect(editor.exec(indentBlocks(-1))).toBe(false)
    editor.destroy()
  })

  it('applies alignment across a multi-block selection', () => {
    const state = stateWith(doc(p('one'), p('two')), range([0], 0, [1], 3))
    const tr = setTextAlign('right')(state)
    expect(tr).not.toBeNull()
    const next = tr ? state.apply(tr) : state
    expect(next.doc.child(0).attrs.align).toBe('right')
    expect(next.doc.child(1).attrs.align).toBe('right')
  })

  it('omits default attributes from serialized JSON', () => {
    const editor = editorWith('plain')
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain' }] }],
    })
    editor.exec(setTextAlign('center'))
    expect(editor.getJSON().content?.[0]?.attrs).toEqual({ align: 'center' })
    editor.destroy()
  })
})

describe('safeImageSrc', () => {
  it('keeps the ordinary sources', () => {
    expect(safeImageSrc('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
    expect(safeImageSrc('/uploads/a.png')).toBe('/uploads/a.png')
    expect(safeImageSrc('a.png')).toBe('a.png')
  })

  it('allows the inert schemes the storage adapters produce', () => {
    // createDataURLStorage and createObjectURLStorage emit exactly these.
    expect(safeImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    )
    expect(safeImageSrc('data:image/svg+xml,%3Csvg%3E')).toBe('data:image/svg+xml,%3Csvg%3E')
    expect(safeImageSrc('blob:https://example.com/9d1f')).toBe('blob:https://example.com/9d1f')
  })

  it('refuses data URLs that are not images', () => {
    // Widening `data:` for images must not widen it for markup or script.
    expect(safeImageSrc('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeImageSrc('data:application/javascript,alert(1)')).toBeNull()
    expect(safeImageSrc('data:,plain')).toBeNull()
    // The media type must terminate before the payload begins.
    expect(safeImageSrc('data:image/png')).toBeNull()
  })

  it('still refuses script-bearing and malformed sources', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBeNull()
    expect(safeImageSrc('java\tscript:alert(1)')).toBeNull()
    expect(safeImageSrc('vbscript:msgbox')).toBeNull()
    expect(safeImageSrc('')).toBeNull()
    expect(safeImageSrc(null)).toBeNull()
    expect(safeImageSrc(42)).toBeNull()
  })
})
