import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type CDPSession, type Page, expect, test } from '@playwright/test'

const pageUrl = `file://${join(dirname(fileURLToPath(import.meta.url)), '../page/index.html')}`

/**
 * Japanese input, driven through the browser's real composition machinery.
 *
 * IME is the one input path a unit test cannot honestly stand in for. Its
 * bugs come from the editor and the browser disagreeing about who owns the
 * DOM while a composition is open, and hand-fired events test the simulation
 * rather than the disagreement.
 *
 * `Input.imeSetComposition` is Chrome's own IME entry point, reached over the
 * DevTools protocol: the browser composes for real and emits the events a
 * Japanese keyboard would. Chromium-only, so the others skip rather than look
 * as though they covered this.
 */

/**
 * Type a reading into an open composition, one character at a time.
 *
 * Every call after the first carries a replacement range, which is what makes
 * the sequence *one* composition: without it Chrome ends the composition and
 * starts another, committing the reading so far into the document. A
 * sequence no keyboard produces, and the editor would rightly keep the text.
 *
 * The final pass replaces the reading with itself. Chrome's first
 * `imeSetComposition` against a fresh element leaves its text just outside
 * the composition, and only a replacement range draws it back in; without
 * this, committing leaves the first character stranded in the document.
 * Discovered by tracing the composition events, not guessed.
 */
async function compose(cdp: CDPSession, reading: string): Promise<void> {
  for (let index = 1; index <= reading.length; index++) {
    await cdp.send('Input.imeSetComposition', {
      text: reading.slice(0, index),
      selectionStart: index,
      selectionEnd: index,
      ...(index > 1 ? { replacementStart: 0, replacementEnd: index - 1 } : {}),
    })
  }
  await cdp.send('Input.imeSetComposition', {
    text: reading,
    selectionStart: reading.length,
    selectionEnd: reading.length,
    replacementStart: 0,
    replacementEnd: reading.length,
  })
}

/** Convert and commit, which is what Enter does at the end of a conversion. */
const commit = (cdp: CDPSession, text: string) => cdp.send('Input.insertText', { text })

const modelText = (page: Page) => page.evaluate(() => window.editor.getText())
const domText = (page: Page) => page.locator('.trevixal-content').innerText()

test.describe('Japanese IME composition', () => {
  test.beforeEach(async ({ page, browserName }) => {
    test.skip(
      browserName !== 'chromium',
      'Input.imeSetComposition is a Chrome DevTools Protocol command',
    )
    await page.goto(pageUrl)
    await page.locator('.trevixal-content').click()
  })

  test('lets the IME own the text until it is committed', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page)
    await compose(cdp, 'にほん')

    // The reading is in the DOM and deliberately not in the document. A
    // half-typed reading is not content, and re-rendering the DOM under an
    // open composition is exactly what breaks IME in editors that try to.
    expect(await domText(page)).toBe('にほん')
    expect(await modelText(page)).toBe('')

    await commit(cdp, '日本')
    expect(await domText(page)).toBe('日本')
    expect(await modelText(page)).toBe('日本')
    // None of the reading survived alongside the kanji.
    expect(await modelText(page)).not.toContain('にほん')
  })

  test('commits a single character as readily as a phrase', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page)
    await compose(cdp, 'あ')
    await commit(cdp, '亜')
    expect(await modelText(page)).toBe('亜')
  })

  test('composes into the middle of existing text', async ({ page }) => {
    await page.keyboard.type('AB')
    await page.keyboard.press('ArrowLeft')
    const cdp = await page.context().newCDPSession(page)
    await compose(cdp, 'あ')
    await commit(cdp, '亜')
    expect(await modelText(page)).toBe('A亜B')
  })

  test('an abandoned composition leaves the document as it was', async ({ page }) => {
    await page.keyboard.type('start')
    const cdp = await page.context().newCDPSession(page)
    await compose(cdp, 'かん')
    // Escape during conversion throws the reading away; committing nothing is
    // how Chrome expresses that.
    await commit(cdp, '')
    expect(await modelText(page)).toBe('start')
    expect(await domText(page)).toBe('start')
  })

  test('undo never leaves half a composed word behind', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page)
    await page.keyboard.type('x')
    await compose(cdp, 'にほん')
    await commit(cdp, '日本')
    expect(await modelText(page)).toBe('x日本')

    await page.keyboard.press('Control+z')
    const afterUndo = await modelText(page)
    // Whatever else undo does with a composed word, the reading must not come
    // back: it was never in the document to be restored.
    expect(afterUndo).not.toContain('にほん')
    expect(afterUndo.startsWith('x') || afterUndo === '').toBe(true)
  })

  test('a committed word reaches everything that reads the model', async ({ page }) => {
    // Counts, writing checks and autosave all read the document. A
    // composition that reconciles late would report stale numbers.
    const cdp = await page.context().newCDPSession(page)
    await compose(cdp, 'にほんご')
    await commit(cdp, '日本語')
    expect(await modelText(page)).toBe('日本語')
    expect(await page.evaluate(() => window.editor.getCharacterCount())).toBe(3)
  })
})
