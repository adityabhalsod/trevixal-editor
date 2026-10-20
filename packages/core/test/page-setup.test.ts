// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Fragment } from '../src/model/fragment'
import {
  DEFAULT_PAGE_SETUP,
  fillPageTemplate,
  pageDimensions,
  pageSectionOf,
  pageSetupAttr,
  pageSetupOf,
  pageTemplateParts,
  storedPageSetup,
} from '../src/schema/page-setup'
import { serializeToHTML } from '../src/serialize/html'
import { parseHTML } from '../src/serialize/parse-html'
import { p, testSchema } from './helpers'

describe('page setup', () => {
  it('reads a stored setup over the defaults, dropping what is not one', () => {
    expect(pageSetupOf(null)).toEqual(DEFAULT_PAGE_SETUP)
    expect(pageSetupOf('not json')).toEqual(DEFAULT_PAGE_SETUP)
    const setup = pageSetupOf(
      JSON.stringify({
        size: 'letter',
        orientation: 'landscape',
        margins: { top: 25, right: -4, bottom: 500, left: 'x' },
        header: 'Report',
        footer: 'Page {page} of {pages}',
        watermark: 'Draft',
      }),
    )
    expect(setup).toEqual({
      size: 'letter',
      orientation: 'landscape',
      margins: { top: 25, right: 0, bottom: 100, left: 20 },
      header: 'Report',
      footer: 'Page {page} of {pages}',
      watermark: 'Draft',
    })
    expect(pageSetupOf(JSON.stringify({ size: 'b0', orientation: 'sideways' }))).toEqual(
      DEFAULT_PAGE_SETUP,
    )
  })

  it('stores a setup once chosen, the default too, and keeps none until then', () => {
    expect(pageSetupOf(storedPageSetup(DEFAULT_PAGE_SETUP))).toEqual(DEFAULT_PAGE_SETUP)
    const stored = storedPageSetup({ ...DEFAULT_PAGE_SETUP, footer: '{page}' })
    expect(pageSetupOf(stored)).toEqual({ ...DEFAULT_PAGE_SETUP, footer: '{page}' })
    expect(pageSetupAttr(null)).toBeNull()
    expect(pageSetupAttr('[1, 2]')).toBeNull()
    expect(pageSetupAttr(stored)).toBe(stored)
  })

  it('turns a page for landscape', () => {
    expect(pageDimensions('a4', 'portrait')).toEqual({ width: 210, height: 297 })
    expect(pageDimensions('a4', 'landscape')).toEqual({ width: 297, height: 210 })
  })

  it('fills in the page number and count, and names them for fields', () => {
    expect(fillPageTemplate('Page {page} of {pages}', 2, 7)).toBe('Page 2 of 7')
    expect(pageTemplateParts('{page}/{pages} {other}')).toEqual([
      { field: 'page' },
      { text: '/' },
      { field: 'pages' },
      { text: ' {other}' },
    ])
  })

  it('reads a section’s own settings, null where it takes the document’s', () => {
    expect(pageSectionOf({})).toEqual({ orientation: null, columns: null, margin: null })
    expect(pageSectionOf({ orientation: 'landscape', columns: 7, margin: 12.5 })).toEqual({
      orientation: 'landscape',
      columns: 3,
      margin: 12.5,
    })
    expect(pageSectionOf({ orientation: 'up', columns: 'two', margin: -3 })).toEqual({
      orientation: null,
      columns: null,
      margin: 0,
    })
  })

  it('travels with the document through HTML', () => {
    const footer = storedPageSetup({
      ...DEFAULT_PAGE_SETUP,
      orientation: 'landscape',
      footer: '{page}',
    })
    const document = testSchema.node('doc', { pageSetup: footer }, Fragment.from([p('Text')]))
    const html = serializeToHTML(document)
    expect(html).toContain('data-page-setup=')
    expect(parseHTML(testSchema, html, window.document).attrs.pageSetup).toBe(footer)
  })
})
