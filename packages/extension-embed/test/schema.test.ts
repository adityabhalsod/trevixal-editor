import {
  type EditorNode,
  Schema,
  defaultMarks,
  defaultNodes,
  parseHTML,
  serializeToHTML,
} from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { IFRAME_ATTRIBUTES, embedNodes } from '../src'

const options = { allowIframeHosts: ['example.com'] }

const schema = new Schema({
  nodes: { ...defaultNodes(), ...embedNodes(options) },
  marks: defaultMarks(),
})

/**
 * Core's `link` mark claims every `<a href>` on import, and marks are
 * matched before nodes, so the `<a>`-based nodes can only be re-imported by
 * a schema without that mark. See the `embedNodes` doc comment.
 */
const { link: _link, ...marksWithoutLink } = defaultMarks()
const linkless = new Schema({
  nodes: { ...defaultNodes(), ...embedNodes(options) },
  marks: marksWithoutLink,
})

function docWith(name: string, attrs: Record<string, unknown>, inline = false): EditorNode {
  const node = schema.node(name, attrs)
  return schema.node(
    'doc',
    undefined,
    inline ? [schema.node('paragraph', undefined, [node])] : [node],
  )
}

function roundTrip(target: Schema, html: string): { doc: EditorNode; html: string } {
  const doc = parseHTML(target, html, document)
  return { doc, html: serializeToHTML(doc) }
}

describe('video', () => {
  it('serializes with controls, poster, dimensions and title', () => {
    const html = serializeToHTML(
      docWith('video', {
        src: 'https://cdn.test/a.mp4',
        poster: 'https://cdn.test/a.jpg',
        width: '640',
        height: '360px',
        title: 'A "clip"',
      }),
    )
    expect(html).toBe(
      '<video class="trevixal-video" controls="" src="https://cdn.test/a.mp4" ' +
        'poster="https://cdn.test/a.jpg" width="640" height="360" title="A &quot;clip&quot;"></video>',
    )
  })

  it('omits controls when disabled and drops unsafe sources', () => {
    expect(
      serializeToHTML(docWith('video', { src: 'https://cdn.test/a.mp4', controls: false })),
    ).toBe('<video class="trevixal-video" src="https://cdn.test/a.mp4"></video>')
    expect(serializeToHTML(docWith('video', { src: 'javascript:alert(1)' }))).toBe(
      '<video class="trevixal-video" controls=""></video>',
    )
  })

  it('round-trips through HTML, reading src from a <source> child too', () => {
    const source =
      '<video class="trevixal-video" controls="" src="https://cdn.test/a.mp4" width="640"></video>'
    const { doc, html } = roundTrip(schema, source)
    expect(doc.child(0).type.name).toBe('video')
    expect(doc.child(0).attrs.width).toBe('640px')
    expect(html).toBe(source)

    const nested = roundTrip(schema, '<video controls><source src="/media/b.webm"></video>').doc
    expect(nested.child(0).attrs.src).toBe('/media/b.webm')
  })

  it('drops a video whose only source is unsafe', () => {
    const { doc } = roundTrip(schema, '<p>a</p><video src="javascript:alert(1)"></video>')
    expect(doc.content.children.map((node) => node.type.name)).toEqual(['paragraph'])
  })
})

describe('audio', () => {
  it('serializes and round-trips', () => {
    const source =
      '<audio class="trevixal-audio" controls="" src="https://cdn.test/a.mp3" title="Song"></audio>'
    expect(
      serializeToHTML(docWith('audio', { src: 'https://cdn.test/a.mp3', title: 'Song' })),
    ).toBe(source)
    const { doc, html } = roundTrip(schema, source)
    expect(doc.child(0).type.name).toBe('audio')
    expect(doc.child(0).attrs.title).toBe('Song')
    expect(html).toBe(source)
  })
})

describe('iframeEmbed', () => {
  const src = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'

  it('serializes with the provider class and the hardening attributes', () => {
    const html = serializeToHTML(
      docWith('iframeEmbed', {
        src,
        title: 'Video',
        provider: 'youtube',
        width: '560',
        height: '315',
      }),
    )
    expect(
      html.startsWith(`<iframe class="trevixal-embed trevixal-embed--youtube" src="${src}"`),
    ).toBe(true)
    for (const [name, value] of Object.entries(IFRAME_ATTRIBUTES)) {
      expect(html).toContain(`${name}="${value}"`)
    }
    expect(html).toContain('width="560" height="315"')
    expect(html).toContain('title="Video"')
  })

  it('derives the provider from the host when the attribute is missing', () => {
    const html = serializeToHTML(
      docWith('iframeEmbed', { src: 'https://player.vimeo.com/video/1' }),
    )
    expect(html).toContain('trevixal-embed--vimeo')
  })

  it('renders no src for a host outside the allowlist, even from JSON', () => {
    const html = serializeToHTML(docWith('iframeEmbed', { src: 'https://evil.test/frame' }))
    expect(html).not.toContain('evil.test')
    expect(html).toContain('class="trevixal-embed trevixal-embed--generic"')
  })

  it('round-trips a YouTube frame', () => {
    const source = serializeToHTML(
      docWith('iframeEmbed', { src, title: 'Video', provider: 'youtube' }),
    )
    const { doc, html } = roundTrip(schema, source)
    expect(doc.child(0).type.name).toBe('iframeEmbed')
    expect(doc.child(0).attrs).toMatchObject({ src, title: 'Video', provider: 'youtube' })
    expect(html).toBe(source)
  })

  it('keeps an allowlisted host and rejects everything else on import', () => {
    const allowed = roundTrip(schema, '<iframe src="https://maps.example.com/e"></iframe>').doc
    expect(allowed.child(0).type.name).toBe('iframeEmbed')
    expect(allowed.child(0).attrs.provider).toBe('generic')

    const rejected = roundTrip(
      schema,
      '<p>before</p><iframe src="https://evil.test/x"><p>inside</p></iframe><p>after</p>',
    ).doc
    expect(rejected.content.children.map((node) => node.type.name)).toEqual([
      'paragraph',
      'paragraph',
    ])
    expect(rejected.textContent).toBe('beforeafter')

    const http = roundTrip(schema, '<iframe src="http://www.youtube.com/embed/x"></iframe>').doc
    expect(http.content.children.map((node) => node.type.name)).toEqual(['paragraph'])
  })

  it('accepts any https host only when the schema opted in', () => {
    const permissive = new Schema({
      nodes: { ...defaultNodes(), ...embedNodes({ allowAnyIframe: true }) },
      marks: defaultMarks(),
    })
    const { doc } = roundTrip(permissive, '<iframe src="https://anything.test/"></iframe>')
    expect(doc.child(0).type.name).toBe('iframeEmbed')
    expect(
      roundTrip(permissive, '<iframe src="http://anything.test/"></iframe>').doc.child(0).type.name,
    ).toBe('paragraph')
  })
})

describe('attachment', () => {
  it('serializes a download chip with every value escaped', () => {
    const html = serializeToHTML(
      docWith(
        'attachment',
        {
          href: 'https://files.test/report.pdf',
          name: 'Q3 <report> "final".pdf',
          size: 1258291,
          type: 'application/pdf',
        },
        true,
      ),
    )
    expect(html).toBe(
      '<p><a class="trevixal-attachment" data-trevixal-attachment="true" ' +
        'href="https://files.test/report.pdf" download="Q3 &lt;report&gt; &quot;final&quot;.pdf" ' +
        'data-size="1258291" data-type="application/pdf">' +
        '<span class="trevixal-attachment__icon" aria-hidden="true">📎</span>' +
        '<span class="trevixal-attachment__name">Q3 &lt;report&gt; &quot;final&quot;.pdf</span>' +
        '<span class="trevixal-attachment__size">1.2 MB</span></a></p>',
    )
    expect(html).not.toContain('<report>')
  })

  it('marks a pending upload and shows a progress label instead of a size', () => {
    const html = serializeToHTML(
      docWith('attachment', { href: '', name: 'a.zip', size: 10, uploadId: 'attachment-1' }, true),
    )
    expect(html).toContain('data-trevixal-uploading="attachment-1"')
    expect(html).toContain('<span class="trevixal-attachment__size">Uploading…</span>')
    expect(html).not.toContain('href=')
  })

  it('drops an unsafe href and a malformed mime type', () => {
    const html = serializeToHTML(
      docWith('attachment', { href: 'javascript:alert(1)', name: 'x', type: '"><b>' }, true),
    )
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('data-type')
  })

  it('round-trips through a schema without the link mark', () => {
    const source = serializeToHTML(
      docWith(
        'attachment',
        { href: 'https://files.test/a.pdf', name: 'a.pdf', size: 2048, type: 'application/pdf' },
        true,
      ),
    )
    const { doc, html } = roundTrip(linkless, source)
    const chip = doc.child(0).child(0)
    expect(chip.type.name).toBe('attachment')
    expect(chip.attrs).toEqual({
      href: 'https://files.test/a.pdf',
      name: 'a.pdf',
      size: 2048,
      type: 'application/pdf',
      storageKey: null,
      uploadId: null,
    })
    expect(html).toBe(source)
  })

  it('degrades to a plain link when the schema has the link mark', () => {
    const source = serializeToHTML(
      docWith('attachment', { href: 'https://files.test/a.pdf', name: 'a.pdf' }, true),
    )
    const { doc } = roundTrip(schema, source)
    const text = doc.child(0).child(0)
    expect(text.isText).toBe(true)
    expect(text.marks[0]?.type.name).toBe('link')
    expect(text.marks[0]?.attrs.href).toBe('https://files.test/a.pdf')
  })

  it('rejects a chip without a usable href on import', () => {
    const { doc } = roundTrip(
      linkless,
      '<p><a data-trevixal-attachment="true" href="javascript:x">bad</a></p>',
    )
    expect(doc.child(0).child(0).isText).toBe(true)
    expect(doc.child(0).textContent).toBe('bad')
  })
})

describe('linkCard', () => {
  const attrs = {
    href: 'https://www.example.com/article',
    title: 'An <article>',
    description: 'It says "hello" & more',
    image: 'https://www.example.com/og.png',
    siteName: 'Example',
  }

  it('serializes an escaped preview card', () => {
    const html = serializeToHTML(docWith('linkCard', attrs))
    expect(html).toBe(
      '<a class="trevixal-linkcard" target="_blank" rel="noopener noreferrer" ' +
        'data-trevixal-linkcard="true" href="https://www.example.com/article" ' +
        'data-title="An &lt;article&gt;" data-description="It says &quot;hello&quot; &amp; more" ' +
        'data-image="https://www.example.com/og.png" data-site="Example">' +
        '<img class="trevixal-linkcard__image" src="https://www.example.com/og.png" alt="">' +
        '<span class="trevixal-linkcard__body">' +
        '<span class="trevixal-linkcard__title">An &lt;article&gt;</span>' +
        '<span class="trevixal-linkcard__description">It says &quot;hello&quot; &amp; more</span>' +
        '<span class="trevixal-linkcard__site">Example</span></span></a>',
    )
  })

  it('falls back to the hostname for the title and site', () => {
    const html = serializeToHTML(docWith('linkCard', { href: 'https://www.example.com/x' }))
    expect(html).not.toContain('<img')
    expect(html).toContain('<span class="trevixal-linkcard__title">example.com</span>')
    expect(html).toContain('<span class="trevixal-linkcard__site">example.com</span>')
  })

  it('drops an unsafe image rather than rendering it', () => {
    const html = serializeToHTML(
      docWith('linkCard', { href: 'https://example.com/', image: 'javascript:alert(1)' }),
    )
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<img')
  })

  it('round-trips through a schema without the link mark', () => {
    const source = serializeToHTML(docWith('linkCard', attrs))
    const { doc, html } = roundTrip(linkless, source)
    expect(doc.child(0).type.name).toBe('linkCard')
    expect(doc.child(0).attrs).toEqual(attrs)
    expect(html).toBe(source)
  })

  it('ignores a card whose href is not an absolute http(s) URL', () => {
    const { doc } = roundTrip(linkless, '<a data-trevixal-linkcard="true" href="/relative">x</a>')
    expect(doc.child(0).type.name).toBe('paragraph')
  })
})
