// @vitest-environment happy-dom
import { Schema, defaultMarks, defaultNodes, parseHTML, serializeToHTML } from '@trevixal/core'
import { describe, expect, it } from 'vitest'
import { embedNodes } from '../src'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...embedNodes({ allowIframeHosts: ['example.com'] }) },
  marks: defaultMarks(),
})

function imported(html: string): string {
  return serializeToHTML(parseHTML(schema, html, document))
}

describe('autoplaying media keeps its controls', () => {
  it('gives a pasted autoplay video controls', () => {
    // The schema has no autoplay/loop/muted attributes, so an imported
    // `<video autoplay muted loop>` without controls would render as a dead
    // frame the reader can neither start nor scrub.
    const html = imported('<video src="https://cdn.test/a.mp4" autoplay muted loop></video>')
    expect(html).toContain('controls=""')
  })

  it('gives a pasted autoplay audio controls', () => {
    const html = imported('<audio src="https://cdn.test/a.mp3" autoplay loop></audio>')
    expect(html).toContain('controls=""')
  })

  it('still honours an explicit controls attribute', () => {
    expect(imported('<video src="https://cdn.test/a.mp4" controls></video>')).toContain(
      'controls=""',
    )
  })
})

describe('link card interpolation', () => {
  it('escapes every field it echoes into the card body', () => {
    const doc = schema.node('doc', undefined, [
      schema.node('linkCard', {
        href: 'https://example.com/a',
        title: '"><img src=x onerror=alert(1)>',
        description: '</span><script>alert(2)</script>',
        siteName: '<b>site</b>',
        image: 'https://example.com/i.png"><script>alert(3)</script>',
      }),
    ])
    // Re-parse the markup: every field must come back as text, so nothing
    // the metadata carried became an element of its own.
    const host = document.createElement('div')
    host.innerHTML = serializeToHTML(doc)
    expect(host.querySelectorAll('script')).toHaveLength(0)
    expect(host.querySelectorAll('img')).toHaveLength(1)
    expect(host.querySelector('.trevixal-linkcard__title')?.textContent).toBe(
      '"><img src=x onerror=alert(1)>',
    )
    expect(host.querySelector('.trevixal-linkcard__description')?.textContent).toBe(
      '</span><script>alert(2)</script>',
    )
    expect(host.querySelector('.trevixal-linkcard__site')?.textContent).toBe('<b>site</b>')
  })
})

describe('attachment chip', () => {
  it('escapes the file name it echoes', () => {
    const doc = schema.node('doc', undefined, [
      schema.node('paragraph', undefined, [
        schema.node('attachment', {
          href: 'https://cdn.test/f.zip',
          name: '<img src=x onerror=alert(1)>.zip',
          size: 2048,
        }),
      ]),
    ])
    const host = document.createElement('div')
    host.innerHTML = serializeToHTML(doc)
    expect(host.querySelectorAll('img')).toHaveLength(0)
    expect(host.querySelector('.trevixal-attachment__name')?.textContent).toBe(
      '<img src=x onerror=alert(1)>.zip',
    )
    expect(host.querySelector('.trevixal-attachment__size')?.textContent).toBe('2 KB')
  })
})
