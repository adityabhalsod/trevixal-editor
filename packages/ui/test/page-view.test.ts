// @vitest-environment happy-dom
import {
  DEFAULT_PAGE_SETUP,
  Schema,
  createEditor,
  defaultMarks,
  defaultNodes,
  setDocumentAttrs,
  storedPageSetup,
} from '@trevixal/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createPageView, followPageSetup } from '../src/theming'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the page view', () => {
  it('sets the sheet as the document’s page setup says, and follows it', () => {
    const shell = document.createElement('div')
    document.body.appendChild(shell)
    const editor = createEditor({ schema, element: shell })
    const view = createPageView({ target: shell, mode: 'paged' })
    const stop = followPageSetup(editor, view)
    expect(shell.style.getPropertyValue('--tvx-page-width')).toBe('210mm')

    editor.exec(
      setDocumentAttrs({
        pageSetup: storedPageSetup({
          ...DEFAULT_PAGE_SETUP,
          orientation: 'landscape',
          margins: { top: 10, right: 15, bottom: 20, left: 25 },
          header: 'Report',
          footer: 'Page {page} of {pages}',
          watermark: 'Draft',
        }),
      }),
    )
    expect(shell.style.getPropertyValue('--tvx-page-width')).toBe('297mm')
    expect(shell.style.getPropertyValue('--tvx-page-height')).toBe('210mm')
    expect(shell.style.getPropertyValue('--tvx-page-margin')).toBe('10mm 15mm 20mm 25mm')
    const marks = shell.querySelector('.trevixal-page-marks')
    expect(marks?.getAttribute('aria-hidden')).toBe('true')
    expect(marks?.querySelector('.trevixal-page-marks__header')?.textContent).toBe('Report')
    expect(marks?.querySelector('.trevixal-page-marks__footer')?.textContent).toBe('Page 1 of 1')
    expect(marks?.querySelector('.trevixal-page-marks__watermark')?.textContent).toBe('Draft')

    // Continuous, the sheet and its marks go.
    view.setMode('continuous')
    expect(shell.querySelector('.trevixal-page-marks')).toBeNull()
    stop()
    view.destroy()
    editor.destroy()
  })
})
