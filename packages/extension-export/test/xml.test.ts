import { describe, expect, it } from 'vitest'
import { type XmlElement, decodeEntities, escapeXML, isXmlElement, parseXML } from '../src/xml'

describe('parseXML structure', () => {
  it('parses nested elements and concatenates their text', () => {
    const root = parseXML('<a>one<b>two<c>three</c></b>four</a>')
    expect(root.name).toBe('a')
    expect(root.text()).toBe('onetwothreefour')
    expect(root.elements()).toHaveLength(1)
    expect((root.elements()[0] as XmlElement).name).toBe('b')
  })

  it('skips an XML declaration and returns the document element', () => {
    const root = parseXML('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document/>')
    expect(root.name).toBe('w:document')
  })

  it('keeps namespace prefixes verbatim on names and attributes', () => {
    const root = parseXML('<w:p w:rsidR="00A1"><w:r r:id="rId7"><w:t>hi</w:t></w:r></w:p>')
    expect(root.name).toBe('w:p')
    expect(root.attr('w:rsidR')).toBe('00A1')
    expect(root.find('w:r')?.attr('r:id')).toBe('rId7')
    expect(root.find('w:t')?.text()).toBe('hi')
  })

  it('treats a self-closing tag as an empty element', () => {
    const root = parseXML('<a><br/><b>x</b></a>')
    expect(root.elements()).toHaveLength(2)
    expect((root.elements()[0] as XmlElement).children).toHaveLength(0)
    expect(root.text()).toBe('x')
  })

  it('drops comments and processing instructions', () => {
    const root = parseXML('<a><!-- a comment --><?target data?><b>kept</b></a>')
    expect(root.elements()).toHaveLength(1)
    expect(root.text()).toBe('kept')
  })

  it('keeps CDATA content unescaped', () => {
    const root = parseXML('<a><![CDATA[<not> & an &amp; entity]]></a>')
    expect(root.text()).toBe('<not> & an &amp; entity')
  })

  it('skips a DOCTYPE, including an internal subset', () => {
    const root = parseXML('<!DOCTYPE a [ <!ENTITY x "y"> ]><a>body</a>')
    expect(root.name).toBe('a')
    expect(root.text()).toBe('body')
  })

  it('strips a leading byte-order mark', () => {
    const root = parseXML('﻿<a>x</a>')
    expect(root.name).toBe('a')
  })

  it('returns an empty #document root when there is no element', () => {
    const root = parseXML('')
    expect(root.name).toBe('#document')
    expect(root.elements()).toHaveLength(0)
    expect(root.text()).toBe('')
  })

  it('closes the nearest open element on a mismatched close tag', () => {
    const root = parseXML('<a><b>text</a>')
    expect(root.name).toBe('a')
    expect(root.find('b')?.text()).toBe('text')
  })

  it('ignores a stray close tag with no matching open element', () => {
    const root = parseXML('<a></c>text</a>')
    expect(root.text()).toBe('text')
  })

  it('preserves significant whitespace in text nodes', () => {
    expect(parseXML('<w:t xml:space="preserve">  two  spaces  </w:t>').text()).toBe(
      '  two  spaces  ',
    )
  })
})

describe('parseXML attributes', () => {
  it('decodes entities inside attribute values', () => {
    const root = parseXML('<a title="Tom &amp; Jerry &lt;1&gt; &quot;q&quot; &apos;s&apos;"/>')
    expect(root.attr('title')).toBe(`Tom & Jerry <1> "q" 's'`)
  })

  it('accepts a quoted value containing a bare angle bracket', () => {
    expect(parseXML('<a t="a > b"/>').attr('t')).toBe('a > b')
  })

  it('accepts single-quoted and unquoted values', () => {
    const root = parseXML("<a one='1' two=2 />")
    expect(root.attr('one')).toBe('1')
    expect(root.attr('two')).toBe('2')
  })

  it('gives a valueless attribute the empty string', () => {
    const root = parseXML('<a disabled b="1"/>')
    expect(root.attr('disabled')).toBe('')
    expect(root.attr('b')).toBe('1')
  })

  it('returns undefined for a missing attribute', () => {
    expect(parseXML('<a/>').attr('nope')).toBeUndefined()
  })

  it('handles multiple attributes across line breaks', () => {
    const root = parseXML('<w:pgMar\n  w:top="1440"\n  w:left="1440"/>')
    expect(root.attrs).toEqual({ 'w:top': '1440', 'w:left': '1440' })
  })
})

describe('XmlElement helpers', () => {
  const root = parseXML(
    '<w:body><w:p><w:r><w:t>a</w:t></w:r><w:r><w:t>b</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>c</w:t></w:r></w:p><w:sectPr/></w:body>',
  )

  it('childrenNamed returns only direct children', () => {
    expect(root.childrenNamed('w:p')).toHaveLength(2)
    expect(root.childrenNamed('w:r')).toHaveLength(0)
  })

  it('child returns the first direct child with the name', () => {
    expect(root.child('w:sectPr')?.name).toBe('w:sectPr')
    expect(root.child('w:t')).toBeUndefined()
  })

  it('find walks descendants depth-first', () => {
    expect(root.find('w:t')?.text()).toBe('a')
    expect(root.find('missing')).toBeUndefined()
  })

  it('findAll returns every descendant in document order', () => {
    expect(root.findAll('w:t').map((node) => node.text())).toEqual(['a', 'b', 'c'])
    expect(root.findAll('w:p')).toHaveLength(2)
  })

  it('findAll excludes the element itself', () => {
    expect(root.findAll('w:body')).toHaveLength(0)
  })

  it('elements filters out text children', () => {
    const mixed = parseXML('<a>text<b/>more<c/></a>')
    expect(mixed.children).toHaveLength(4)
    expect(mixed.elements().map((node) => node.name)).toEqual(['b', 'c'])
  })

  it('isXmlElement narrows a node union', () => {
    const mixed = parseXML('<a>text<b/></a>')
    expect(mixed.children.filter(isXmlElement)).toHaveLength(1)
    expect(isXmlElement({ text: 'x' })).toBe(false)
  })
})

describe('escapeXML and decodeEntities', () => {
  it('escapes all five XML entities', () => {
    expect(escapeXML(`<a href="x">& 'y'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp; &apos;y&apos;&lt;/a&gt;',
    )
  })

  it('escapes ampersands before the other replacements', () => {
    expect(escapeXML('&lt;')).toBe('&amp;lt;')
  })

  it('leaves ordinary text alone', () => {
    expect(escapeXML('plain — text 😀')).toBe('plain — text 😀')
  })

  it('round-trips through parseXML', () => {
    const raw = `5 < 6 && "quoted" 'apos' >`
    expect(parseXML(`<t>${escapeXML(raw)}</t>`).text()).toBe(raw)
  })

  it('decodes decimal and hexadecimal character references', () => {
    expect(decodeEntities('caf&#233; &#x1F600; &#X41;')).toBe('café 😀 A')
  })

  it('leaves an unknown entity untouched', () => {
    expect(decodeEntities('a &nope; b')).toBe('a &nope; b')
  })

  it('leaves an out-of-range character reference untouched', () => {
    expect(decodeEntities('&#x110001;')).toBe('&#x110001;')
  })

  it('returns the input unchanged when there is no ampersand', () => {
    expect(decodeEntities('nothing to do')).toBe('nothing to do')
  })
})
