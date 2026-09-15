import { beforeEach, describe, expect, test } from 'vitest'
import { DEFAULT_INTRO, createLayout } from '../src/layout'

/** Every id the stylesheet and the browser suite reach for by name. */
const IDS = [
  'tabs',
  'chrome',
  'review',
  'sidebar',
  'toc',
  'outline',
  'history',
  'workspace',
  'editor',
  'split',
  'mirror',
  'save-status',
  'goal',
  'security',
  'offline',
  'upload-status',
  'output',
] as const

let host: HTMLElement

beforeEach(() => {
  document.body.replaceChildren()
  host = document.createElement('div')
  document.body.append(host)
})

describe('createLayout', () => {
  test('builds every element the editor attaches to', () => {
    createLayout(host)
    for (const id of IDS) expect(host.querySelector(`#${id}`), id).not.toBeNull()
    expect(host.querySelector('.editor-shell')).not.toBeNull()
    expect(host.querySelector('.statusline')).not.toBeNull()
  })

  test('starts with the sidebar, its panels and both extra panes hidden', () => {
    const layout = createLayout(host)
    for (const panel of layout.panels) expect(panel.hidden).toBe(true)
    expect(layout.sidebar.hidden).toBe(true)
    expect(layout.split.hidden).toBe(true)
    expect(layout.mirror.hidden).toBe(true)
    // These two carry the first thing the reader sees, so they are not.
    expect(layout.editor.hidden).toBe(false)
    expect(layout.chrome.hidden).toBe(false)
  })

  test('marks the host so both the tokens and the shell rules find it', () => {
    createLayout(host)
    expect(host.classList.contains('trevixal')).toBe(true)
    expect(host.classList.contains('trevixal-full-editor')).toBe(true)
  })

  test('writes the default copy, and takes the caller word for word', () => {
    const first = createLayout(host)
    expect(first.root.querySelector('h1')?.textContent).toBe(DEFAULT_INTRO.heading)
    expect(first.root.querySelectorAll('p:not(#upload-status)')).toHaveLength(
      DEFAULT_INTRO.paragraphs.length,
    )

    first.destroy()
    const second = createLayout(host, { heading: 'Notes', paragraphs: ['One <code>line</code>.'] })
    expect(second.root.querySelector('h1')?.textContent).toBe('Notes')
    const [only] = second.root.querySelectorAll('p:not(#upload-status)')
    // Markup, not text: the copy is the caller's and may carry `<code>`.
    expect(only?.querySelector('code')?.textContent).toBe('line')
  })

  test('leaves out the heading, and the readout, when asked to', () => {
    const layout = createLayout(host, {
      heading: null,
      paragraphs: [],
      showSerializedHTML: false,
    })
    expect(host.querySelector('h1')).toBeNull()
    expect(host.querySelector('#output')).toBeNull()
    expect(layout.output).toBeNull()
  })

  test('empties the host first, so a remount does not stack two layouts', () => {
    const squatter = document.createElement('span')
    squatter.id = 'was-here'
    host.append(squatter)
    createLayout(host)
    expect(host.querySelector('#was-here')).toBeNull()
    createLayout(host)
    expect(host.querySelectorAll('#editor')).toHaveLength(1)
  })

  test('destroy puts the host back the way it was found', () => {
    host.className = 'app-shell'
    const layout = createLayout(host)
    layout.destroy()
    expect(host.childNodes).toHaveLength(0)
    expect(host.className).toBe('app-shell')
  })
})
