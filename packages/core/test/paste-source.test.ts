// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { parseHTML } from '../src/serialize/parse-html'
import { cleanPastedHTML, detectPasteSource } from '../src/serialize/paste-source'
import { testSchema } from './helpers'

/**
 * Clipboard payloads as the applications really write them, attribute
 * quoting, namespaces and all. Abridged in length, not in shape: the parts
 * that survive here are the parts that cause trouble.
 */

const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta name=Generator content="Microsoft Word 15 (filtered medium)">
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/></o:OfficeDocumentSettings></xml><![endif]-->
<style><!-- p.MsoNormal {mso-style-parent:""; margin:0cm; font-size:11.0pt;} --></style>
</head>
<body lang=EN-GB style='word-wrap:break-word'>
<p class=MsoNormal><span style='mso-fareast-font-family:"Times New Roman";color:#1F497D'>Hello <b>world</b><o:p></o:p></span></p>
<p class=MsoListParagraphCxSpFirst style='margin-left:36.0pt;text-indent:-18.0pt;mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>&middot;<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span>First item<o:p></o:p></p>
</body></html>`

const GOOGLE_DOCS = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-8f1c-3a2b-0001"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial;color:#000000;font-weight:400;">Hello </span><span style="font-size:11pt;font-family:Arial;font-weight:700;">world</span></p></b>`

const EXCEL = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta name=Generator content="Microsoft Excel 15"></head><body><table><tr><td style='mso-number-format:General;text-align:right'>42</td></tr></table></body></html>`

const PLAIN = '<p>Hello <strong>world</strong></p><ul><li>an item</li></ul>'

describe('detectPasteSource', () => {
  it('names the application that wrote the payload', () => {
    expect(detectPasteSource(WORD)).toBe('word')
    expect(detectPasteSource(GOOGLE_DOCS)).toBe('google-docs')
    expect(detectPasteSource(EXCEL)).toBe('excel')
    expect(detectPasteSource(PLAIN)).toBe('html')
  })

  it('recognises a Word fragment that lost its namespace on the way', () => {
    expect(detectPasteSource('<p class=MsoNormal>hi</p>')).toBe('word')
    expect(detectPasteSource("<p style='mso-list:l0'>hi</p>")).toBe('word')
  })

  it('does not mistake a document that merely talks about Word', () => {
    expect(detectPasteSource('<p>We opened it in Microsoft Word yesterday.</p>')).toBe('html')
  })
})

describe('cleanPastedHTML, Google Docs', () => {
  const cleaned = cleanPastedHTML(GOOGLE_DOCS)

  it('unwraps the bold that is not bold', () => {
    // Google wraps the whole selection in `<b style="font-weight:normal">`.
    // An editor that believes the tag makes every paste bold. The single
    // most reported bug in this whole area.
    expect(cleaned).not.toMatch(/<b\b/)
    expect(cleaned).toContain('Hello ')
    expect(cleaned).toContain('world')
  })

  it('drops a weight that means "not bold" and keeps one that means bold', () => {
    expect(cleaned).not.toMatch(/font-weight\s*:\s*400/)
    expect(cleaned).toMatch(/font-weight\s*:\s*700/)
  })

  it('parses to text that is not bold from end to end', () => {
    const doc = parseHTML(testSchema, cleaned, document)
    expect(doc.textContent).toBe('Hello world')
    const first = doc.child(0)
    const run = first.content.child(0)
    expect(run.marks.some((mark) => mark.type.name === 'bold')).toBe(false)
  })
})

describe('cleanPastedHTML, Word', () => {
  const cleaned = cleanPastedHTML(WORD)

  it('removes the conditional comment and the XML island whole', () => {
    expect(cleaned).not.toContain('[if gte mso 9]')
    expect(cleaned).not.toContain('OfficeDocumentSettings')
    expect(cleaned).not.toMatch(/<xml\b/i)
  })

  it('removes the namespaced Office tags', () => {
    expect(cleaned).not.toMatch(/<o:p>/i)
  })

  it('removes the bullet Word had already drawn for itself', () => {
    // The glyph lives in a span marked `mso-list:Ignore` precisely because it
    // is not content. Kept, it becomes a stray character in the document.
    expect(cleaned).not.toContain('mso-list:Ignore')
    expect(cleaned).not.toContain('&middot;')
    expect(cleaned).toContain('First item')
  })

  it('drops mso declarations while keeping the styling a browser understands', () => {
    expect(cleaned).not.toMatch(/mso-[a-z-]+\s*:/i)
    expect(cleaned).toContain('color:#1F497D')
    expect(cleaned).toContain('text-indent:-18.0pt')
  })

  it('drops Word class names, however they were quoted', () => {
    // `class=MsoNormal`, unquoted, is what Word actually writes.
    expect(cleaned).not.toMatch(/Mso[A-Z]/)
    expect(cleaned).not.toMatch(/\sclass\s*=\s*["']?\s*["']/)
  })

  it('parses to the words, without the wreckage', () => {
    const doc = parseHTML(testSchema, cleaned, document)
    expect(doc.textContent).toContain('Hello world')
    expect(doc.textContent).toContain('First item')
    expect(doc.textContent).not.toContain('·')
  })
})

describe('cleanPastedHTML, Excel', () => {
  it('keeps the table and its alignment, and drops the number format', () => {
    const cleaned = cleanPastedHTML(EXCEL)
    expect(cleaned).toContain('<table>')
    expect(cleaned).toContain('text-align:right')
    expect(cleaned).not.toMatch(/mso-number-format/i)
  })
})

describe('cleanPastedHTML, ordinary web HTML', () => {
  it('is left exactly as it was', () => {
    // Every pass here costs time on a paste that was never broken, so plain
    // HTML must take the early exit rather than the scenic route.
    expect(cleanPastedHTML(PLAIN)).toBe(PLAIN)
  })

  it('keeps a class and a style the author wrote on purpose', () => {
    const html = '<p class="lead intro" style="color:red">hi</p>'
    expect(cleanPastedHTML(html, 'word')).toBe(html)
  })

  it('removes an attribute that held nothing but Word noise', () => {
    expect(cleanPastedHTML('<p class="MsoNormal" style="mso-x:1">hi</p>', 'word')).toBe('<p>hi</p>')
  })
})
