// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { bindDocumentBehaviour, documentBehaviourScript } from '../src/export-script'

/** A two-tab strip as the document serializer writes one. */
const TABS = `
<div class="trevixal-tabs">
  <div class="trevixal-tabs__panel" data-active="true">
    <button class="trevixal-tabs__title" aria-expanded="true">Install</button>
    <div class="trevixal-tabs__content">install me</div>
  </div>
  <div class="trevixal-tabs__panel" data-active="false">
    <button class="trevixal-tabs__title" aria-expanded="false">Use</button>
    <div class="trevixal-tabs__content">use me</div>
  </div>
</div>`

const actives = (): (string | null)[] =>
  [...document.querySelectorAll('.trevixal-tabs__panel')].map((panel) =>
    panel.getAttribute('data-active'),
  )

const title = (index: number): HTMLElement =>
  [...document.querySelectorAll<HTMLElement>('.trevixal-tabs__title')][index] as HTMLElement

beforeEach(() => {
  document.body.innerHTML = TABS
})

describe('bindDocumentBehaviour', () => {
  it('switches the strip when a title is clicked', () => {
    bindDocumentBehaviour(document)
    expect(actives()).toEqual(['true', 'false'])

    title(1).dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(actives()).toEqual(['false', 'true'])
    expect(title(1).getAttribute('aria-expanded')).toBe('true')
    // Only the open tab takes Tab focus; the arrows move within the strip.
    expect(title(0).tabIndex).toBe(-1)
    expect(title(1).tabIndex).toBe(0)
  })

  it('answers Enter and the arrow keys, because the titles are buttons', () => {
    bindDocumentBehaviour(document)

    title(1).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(actives()).toEqual(['false', 'true'])

    title(1).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(actives()).toEqual(['true', 'false'])

    // Wraps, as a strip does.
    title(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(actives()).toEqual(['false', 'true'])
  })

  it('leaves a nested strip to itself', () => {
    document.body.innerHTML = `
      <div class="trevixal-tabs" id="outer">
        <div class="trevixal-tabs__panel" data-active="true">
          <button class="trevixal-tabs__title">Outer one</button>
          <div class="trevixal-tabs">
            <div class="trevixal-tabs__panel" data-active="true">
              <button class="trevixal-tabs__title" id="inner-a">Inner one</button>
            </div>
            <div class="trevixal-tabs__panel" data-active="false">
              <button class="trevixal-tabs__title" id="inner-b">Inner two</button>
            </div>
          </div>
        </div>
        <div class="trevixal-tabs__panel" data-active="false">
          <button class="trevixal-tabs__title">Outer two</button>
        </div>
      </div>`
    bindDocumentBehaviour(document)

    const outer = () =>
      [...document.querySelectorAll('#outer > .trevixal-tabs__panel')].map((panel) =>
        panel.getAttribute('data-active'),
      )
    const inner = () =>
      ['#inner-a', '#inner-b'].map((id) =>
        document.querySelector(id)?.closest('.trevixal-tabs__panel')?.getAttribute('data-active'),
      )

    document
      .querySelector<HTMLElement>('#inner-b')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    // The inner click must not close the outer panel it is sitting in.
    expect(outer()).toEqual(['true', 'false'])
    expect(inner()).toEqual(['false', 'true'])

    // And the reverse: switching the outer strip must leave the inner one
    // alone. A strip that collected every panel beneath it rather than its own
    // children would mark all four inactive on the way past.
    document
      .querySelector<HTMLElement>(
        '#outer > .trevixal-tabs__panel:nth-child(2) > .trevixal-tabs__title',
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(outer()).toEqual(['false', 'true'])
    expect(inner()).toEqual(['false', 'true'])
  })
})

describe('documentBehaviourScript', () => {
  it('is valid standalone source that does the same thing', () => {
    const source = documentBehaviourScript()
    // A saved file loads no modules and no bundler, so whatever this returns
    // has to stand on its own.
    expect(() => new Function(source)).not.toThrow()

    // Run it the way a saved page does: as top-level source, reaching the
    // document through the global.
    new Function(source)()
    title(1).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(actives()).toEqual(['false', 'true'])
  })

  it('is serialized from the one implementation, not written out beside it', () => {
    const source = documentBehaviourScript()
    // If these ever diverge, a tab strip behaves one way in the preview and
    // another in the saved file. The worst way for this to be wrong.
    for (const marker of [
      'trevixal-tabs__panel',
      'trevixal-tabs__title',
      'aria-expanded',
      'ArrowRight',
      'trevixal-embed--youtube',
    ]) {
      expect(source).toContain(marker)
    }
    expect(source.endsWith('(document)')).toBe(true)
  })
})
