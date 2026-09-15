import { describe, expect, it } from 'vitest'
import { serializeToHTMLDocument } from '../src/serialize/html-document'
import { bold, doc, h, p, text } from './helpers'

const sample = () => doc(h(1, 'Title'), p(text('plain '), bold('bold')))

describe('serializeToHTMLDocument', () => {
  it('wraps the content in a complete page', () => {
    const html = serializeToHTMLDocument(sample())
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html.trimEnd().endsWith('</html>')).toBe(true)
  })

  it('reproduces the class structure the stylesheet targets', () => {
    // Without these wrappers the linked stylesheet matches nothing and the
    // exported page renders unstyled. The whole point of this function.
    const html = serializeToHTMLDocument(sample())
    expect(html).toContain('class="trevixal"')
    expect(html).toContain('class="trevixal-content"')
  })

  it('links stylesheets and scripts', () => {
    const html = serializeToHTMLDocument(sample(), {
      styleSheets: ['/styles.css'],
      scripts: ['/main.js'],
    })
    expect(html).toContain('<link rel="stylesheet" href="/styles.css">')
    expect(html).toContain('<script src="/main.js"></script>')
  })

  it('resolves relative URLs against the base', () => {
    const html = serializeToHTMLDocument(sample(), {
      baseURL: 'http://localhost:5173',
      styleSheets: ['/styles.css', 'assets/extra.css'],
      scripts: ['/main.js'],
    })
    expect(html).toContain('href="http://localhost:5173/styles.css"')
    expect(html).toContain('href="http://localhost:5173/assets/extra.css"')
    expect(html).toContain('src="http://localhost:5173/main.js"')
    // And a <base>, so relative links inside the content resolve too.
    expect(html).toContain('<base href="http://localhost:5173/">')
  })

  it('leaves an absolute URL alone', () => {
    const html = serializeToHTMLDocument(sample(), {
      baseURL: 'http://localhost:5173',
      styleSheets: ['https://cdn.example.com/a.css', '//cdn.example.com/b.css'],
    })
    expect(html).toContain('href="https://cdn.example.com/a.css"')
    expect(html).toContain('href="//cdn.example.com/b.css"')
    expect(html).not.toContain('localhost:5173/https')
  })

  it('tolerates a trailing slash on the base', () => {
    const html = serializeToHTMLDocument(sample(), {
      baseURL: 'http://localhost:5173/',
      styleSheets: ['/styles.css'],
    })
    expect(html).toContain('href="http://localhost:5173/styles.css"')
    expect(html).not.toContain('5173//styles.css')
  })

  it('drops a URL that is not a document reference', () => {
    // These land in a src/href the receiving page will fetch and run.
    const html = serializeToHTMLDocument(sample(), {
      scripts: ['javascript:alert(1)', 'data:text/javascript,alert(1)'],
      styleSheets: ['javascript:alert(2)'],
    })
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('data:text/javascript')
  })

  it('embeds inline CSS and JS', () => {
    const html = serializeToHTMLDocument(sample(), {
      inlineCSS: 'body { margin: 0 }',
      inlineJS: 'console.log(1)',
    })
    expect(html).toContain('body { margin: 0 }')
    expect(html).toContain('console.log(1)')
  })

  it('neutralizes a closing tag hidden in inline content', () => {
    // `</style>` inside the CSS would end the block early and let the rest be
    // parsed as markup.
    const html = serializeToHTMLDocument(sample(), {
      inlineCSS: 'a{}</style><img src=x onerror=alert(1)>',
      inlineJS: 'x()</script><img src=x onerror=alert(2)>',
    })
    expect(html).not.toContain('</style><img')
    expect(html).not.toContain('</script><img')
  })

  it('escapes the title', () => {
    const html = serializeToHTMLDocument(sample(), { title: 'A & B <script>' })
    expect(html).toContain('<title>A &amp; B &lt;script&gt;</title>')
  })

  it('escapes a quote in a URL rather than breaking out of the attribute', () => {
    const html = serializeToHTMLDocument(sample(), {
      styleSheets: ['/a".css'],
    })
    expect(html).toContain('&quot;')
    expect(html).not.toContain('href="/a".css"')
  })

  it('sets the language', () => {
    expect(serializeToHTMLDocument(sample(), { lang: 'fr' })).toContain('<html lang="fr">')
    expect(serializeToHTMLDocument(sample())).toContain('<html lang="en">')
  })

  describe('renderNode', () => {
    it('replaces a node with markup the caller supplies', () => {
      // How highlighted code and a rendered diagram get out: both are drawn
      // by the editor and neither is in the model, so nothing the schema
      // knows could emit them.
      const html = serializeToHTMLDocument(sample(), {
        renderNode: (node) => (node.type.name === 'heading' ? '<h1><em>drawn</em></h1>' : null),
      })
      expect(html).toContain('<h1><em>drawn</em></h1>')
      expect(html).not.toContain('<h1>Title</h1>')
      // Everything it declined stays exactly as it was.
      expect(html).toContain('<strong>bold</strong>')
    })

    it('takes an empty string as a node rendering nothing', () => {
      const html = serializeToHTMLDocument(sample(), {
        renderNode: (node) => (node.type.name === 'heading' ? '' : null),
      })
      expect(html).not.toContain('Title')
      expect(html).toContain('<strong>bold</strong>')
    })
  })

  describe('the theme', () => {
    const nord = {
      scheme: 'dark',
      preset: 'nord',
      tokens: { 'color-bg': '#2e3440', 'color-text': '#eceff4' },
    } as const

    it('writes the palette out as resolved values', () => {
      // Not as the preset attribute alone: that only styles anything if the
      // rules reading it were collected too, and it still has to outrank the
      // plain light palette in whatever order they land.
      const html = serializeToHTMLDocument(sample(), { theme: nord })
      expect(html).toContain('--tvx-color-bg: #2e3440;')
      expect(html).toContain('--tvx-color-text: #eceff4;')
      expect(html).toContain(':root, .trevixal {')
    })

    it('gives the page a scrollbar in its own palette', () => {
      const html = serializeToHTMLDocument(sample(), { theme: nord })
      // A standalone document paints its own bar, and left alone that bar is
      // the browser's default furniture: a heavy pale stripe down the edge of
      // a dark export, and down the side-by-side preview frame.
      expect(html).toContain('scrollbar-color: var(--tvx-color-border, #d9d9e3) transparent;')
      expect(html).toContain('scrollbar-width: thin;')
      expect(html).toContain('::-webkit-scrollbar-thumb {')
      // Not `display: none` for the stepper arrows: that string is the
      // sentinel the injection tests below watch for.
      expect(html).toContain('::-webkit-scrollbar-button { width: 0; height: 0; }')
      // `color-scheme` is what the browser reads for everything it draws
      // itself, the bar included.
      expect(html).toContain(':root { color-scheme: dark; }')
    })

    it('marks the page with the theme it came from', () => {
      const html = serializeToHTMLDocument(sample(), { theme: nord })
      expect(html).toContain(
        '<html lang="en" data-trevixal-theme="dark" data-trevixal-preset="nord">',
      )
      expect(html).toContain(
        '<div class="trevixal" data-trevixal-theme="dark" data-trevixal-preset="nord">',
      )
    })

    it('paints the page around the document too', () => {
      // `.trevixal` is a div; a dark palette inside a white gutter reads as a
      // broken export rather than a dark theme.
      const html = serializeToHTMLDocument(sample(), { theme: nord })
      expect(html).toContain('html, body { margin: 0; background: var(--tvx-color-bg')
      expect(html).toContain('color-scheme: dark;')
    })

    it('asks the printer for the backgrounds it would otherwise drop', () => {
      // "Export as PDF" is a print, and a browser prints no background unless
      // the page asks, which turns a dark theme into pale text on white.
      const html = serializeToHTMLDocument(sample(), { theme: nord })
      expect(html).toContain('@media print')
      expect(html).toContain('print-color-adjust: exact')
    })

    it('emits the theme after the collected CSS, so it wins on source order', () => {
      const html = serializeToHTMLDocument(sample(), {
        inlineCSS: '.trevixal { --tvx-color-bg: #ffffff; }',
        theme: nord,
      })
      expect(html.indexOf('--tvx-color-bg: #2e3440')).toBeGreaterThan(
        html.indexOf('--tvx-color-bg: #ffffff'),
      )
    })

    it('leaves the page alone when no theme is given', () => {
      const html = serializeToHTMLDocument(sample())
      expect(html).toContain('<div class="trevixal">')
      expect(html).not.toContain('data-trevixal-theme')
      expect(html).not.toContain('print-color-adjust')
    })

    it('drops a token that could close the declaration block', () => {
      // A custom theme is authored by a user, so its values reach CSS as
      // untrusted text.
      const html = serializeToHTMLDocument(sample(), {
        theme: {
          tokens: {
            'color-bg': '#fff} body { display: none } .x {',
            'color/../text': '#000',
            'color-text': '#123456',
          },
        },
      })
      expect(html).not.toContain('display: none')
      expect(html).not.toContain('color/../text')
      expect(html).toContain('--tvx-color-text: #123456;')
    })

    it('drops a scheme that is not one of the two words', () => {
      // The type says 'light' | 'dark', but a host reading a saved theme back
      // hands over whatever was stored, and it lands in a declaration.
      const html = serializeToHTMLDocument(sample(), {
        theme: { scheme: 'dark; } body { display: none } :root {' as 'dark' },
      })
      expect(html).not.toContain('display: none')
      expect(html).not.toContain('color-scheme')
      expect(html).not.toContain('data-trevixal-theme')
    })

    it('drops a preset name that could break out of the attribute', () => {
      const html = serializeToHTMLDocument(sample(), {
        theme: { preset: 'x"><script>alert(1)</script>' },
      })
      expect(html).not.toContain('data-trevixal-preset')
      expect(html).not.toContain('<script>alert(1)')
    })
  })
})
