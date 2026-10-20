// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { parseHTML } from '../src/serialize/parse-html'
import {
  cleanPastedHTML,
  detectPasteSource,
  looksLikeMarkdown,
} from '../src/serialize/paste-source'
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

  it('keeps the words Google made bold with a style, bold', () => {
    const doc = parseHTML(testSchema, cleaned, document)
    const world = doc.child(0).content.child(1)
    expect(world.textContent).toBe('world')
    expect(world.marks.map((mark) => mark.type.name)).toContain('bold')
  })

  it('reads italic, underline, struck and raised text from styles too', () => {
    const doc = parseHTML(
      testSchema,
      '<p><span style="font-style:italic">a</span><span style="text-decoration:underline line-through">b</span><span style="vertical-align:super">c</span><b style="font-weight:normal">d</b></p>',
      document,
    )
    const names = doc.child(0).content.children.map((run) =>
      run.marks
        .map((mark) => mark.type.name)
        .sort()
        .join('+'),
    )
    expect(names).toEqual(['italic', 'strikethrough+underline', 'superscript', ''])
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
    // The list paragraph's hanging indent went with its `<p>`: it is a list now.
    expect(cleaned).toContain('<ul><li>')
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
  it('leaves markup without a layout of its own as it was', () => {
    expect(cleanPastedHTML(PLAIN)).toBe(PLAIN)
  })

  it("drops a page's layout from its blocks and keeps their alignment and type", () => {
    // What Chrome copies from Wikipedia: the page's margins, spacing, white
    // ground and heading rule inline on every block.
    const html =
      '<h2 style="margin: 1em 0px 0.25em; padding: 0px; border-bottom: 1px solid rgb(162, 169, 177); line-height: 1.375;">History</h2>' +
      '<p style="margin: 0.5em 0px 1em; background-color: rgb(255, 255, 255); text-align: center; line-height: 22px;">The <b>city</b></p>'
    expect(cleanPastedHTML(html)).toBe(
      '<h2>History</h2><p style="text-align: center">The <b>city</b></p>',
    )
  })

  it('keeps spacing chosen on purpose: a line and a half or more', () => {
    expect(cleanPastedHTML('<p style="line-height: 2">x</p>')).toBe(
      '<p style="line-height: 2">x</p>',
    )
    expect(cleanPastedHTML('<p style="line-height: 150%">x</p>')).toBe(
      '<p style="line-height: 150%">x</p>',
    )
    expect(cleanPastedHTML('<p style="line-height: 100%">x</p>')).toBe('<p>x</p>')
  })

  it("reads a Notion to-do's box as the checkbox a task list takes", () => {
    const html =
      '<ul class="to-do-list"><li><div class="checkbox checkbox-on"></div> Book room</li><li><div class="checkbox checkbox-off"></div> Send invites</li></ul>'
    const doc = parseHTML(testSchema, cleanPastedHTML(html), document)
    const list = doc.child(0)
    expect(list.type.name).toBe('taskList')
    expect(list.content.children.map((item) => item.attrs.checked)).toEqual([true, false])
  })

  it('keeps a class and a style the author wrote on purpose', () => {
    const html = '<p class="lead intro" style="color:red">hi</p>'
    expect(cleanPastedHTML(html, 'word')).toBe(html)
  })

  it('removes an attribute that held nothing but Word noise', () => {
    expect(cleanPastedHTML('<p class="MsoNormal" style="mso-x:1">hi</p>', 'word')).toBe('<p>hi</p>')
  })
})

describe('cleanPastedHTML, Google Docs headings and gaps', () => {
  const HEADING = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><h1 dir="ltr" style="line-height:1.38;margin-top:20pt;margin-bottom:6pt;"><span style="font-size:20pt;font-family:Arial,sans-serif;color:#000000;font-weight:400;">Plan</span></h1><ul><li aria-level="1"><p dir="ltr" role="presentation"><span>Item</span></p></li></ul><br /><p dir="ltr"><span style="color:#ff0000;font-size:14pt;">Red</span></p></b>`
  const cleaned = cleanPastedHTML(HEADING)

  it("drops a heading's default size, grey and spacing, which are Google's", () => {
    expect(cleaned).toContain('<h1><span>Plan</span></h1>')
  })

  it('drops the blank line Google leaves between two blocks', () => {
    expect(cleaned).not.toMatch(/<\/ul>\s*<br/)
  })

  it('keeps the type a writer chose in a paragraph', () => {
    expect(cleaned).toContain('color:#ff0000; font-size:14pt')
  })
})

describe('cleanPastedHTML, a font name in quotes', () => {
  it("keeps Word's quoted font, which a double-quoted attribute cannot hold bare", () => {
    const html = `<p class=MsoNormal><span style='font-size:14.0pt;font-family:"Georgia",serif'>Hi</span></p>`
    const doc = parseHTML(testSchema, cleanPastedHTML(html, 'word'), document)
    const marks = doc.child(0).child(0).marks
    expect(marks.map((mark) => mark.type.name).sort()).toEqual(['fontFamily', 'fontSize'])
    expect(marks.find((mark) => mark.type.name === 'fontFamily')?.attrs.family).toContain('Georgia')
  })
})

describe('cleanPastedHTML, spreadsheets', () => {
  it("writes Excel's class rules onto its cells, a bold header bold in the paste", () => {
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><style><!--.xl65 {font-weight:700;} .xl66 {mso-number-format:"0\\.00";}--></style></head><body><table><tr><td class=xl65>Item</td><td class=xl66 align=right>1.50</td></tr></table></body></html>`
    const cleaned = cleanPastedHTML(html)
    expect(cleaned).toContain('<span style="font-weight:700">Item</span>')
    expect(cleaned).not.toMatch(/mso-number-format/)
  })

  it("drops a Google Sheets table's own layout and keeps a cell's bold", () => {
    const html = `<google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}--></style><table style="table-layout:fixed;font-size:10pt;width:0px;border-collapse:collapse;border:none" data-sheets-root="1"><tbody><tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;font-weight:bold;">Name</td><td style="vertical-align:bottom;text-align:right;">42</td></tr></tbody></table>`
    expect(detectPasteSource(html)).toBe('google-sheets')
    const cleaned = cleanPastedHTML(html)
    expect(cleaned).not.toMatch(/width:0px|height:21px|vertical-align:bottom|table-layout/)
    expect(cleaned).toContain('<span style="font-weight:bold">Name</span>')
    expect(cleaned).toContain('text-align:right')
  })
})

describe('looksLikeMarkdown', () => {
  it("takes a chat app's copied answer as Markdown", () => {
    expect(looksLikeMarkdown('# Notes\n\nSome **bold** text.\n\n- one\n- two')).toBe(true)
    expect(looksLikeMarkdown('Run this:\n```js\nconst x = 1\n```')).toBe(true)
    expect(looksLikeMarkdown('1. First\n2. Second')).toBe(true)
  })

  it('leaves prose, and any single line, as text', () => {
    expect(looksLikeMarkdown('Dear Sam,\nThanks for the notes.\nBest, Lee')).toBe(false)
    expect(looksLikeMarkdown('**not** a document')).toBe(false)
    expect(looksLikeMarkdown('- one line')).toBe(false)
  })
})

describe('pictures inside paragraphs', () => {
  it('keeps a picture a page puts in a paragraph, when pictures are blocks', async () => {
    const { Schema, defaultMarks, defaultNodes } = await import('../src/index')
    const schema = new Schema({
      nodes: {
        ...defaultNodes(),
        image: {
          group: 'block',
          atom: true,
          attrs: { src: { default: '' }, alt: { default: '' } },
          parseHTML: [
            {
              tag: 'img',
              getAttrs: (element) => ({
                src: element.getAttribute('src') ?? '',
                alt: element.getAttribute('alt') ?? '',
              }),
            },
          ],
        },
      },
      marks: defaultMarks(),
    })
    const doc = parseHTML(
      schema,
      '<p>Look: <img src="https://x.test/a.png" alt="A"> there</p>',
      document,
    )
    expect(doc.content.children.map((block) => [block.type.name, block.textContent])).toEqual([
      ['paragraph', 'Look: '],
      ['image', ''],
      ['paragraph', ' there'],
    ])
  })
})
