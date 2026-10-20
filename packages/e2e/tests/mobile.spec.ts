import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '../../../examples/full-editor/dist')
const surface = '#editor .trevixal-content'

// A phone: narrow, and a touch screen.
test.use({ viewport: { width: 390, height: 780 }, hasTouch: true })

test('puts the toolbar along the bottom on a phone, where a thumb reaches it', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await page.waitForSelector(surface)
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
    test.skip(!coarse, 'This engine does not report a touch screen as a coarse pointer')
    const bar = page.locator('#chrome .trevixal-ui > .trevixal-toolbar')
    expect(await bar.evaluate((element) => getComputedStyle(element).position)).toBe('fixed')
    const box = await bar.boundingBox()
    if (!box) throw new Error('no toolbar box')
    expect(Math.round(box.y + box.height)).toBe(780)
    // One row that scrolls sideways, each button big enough for a finger.
    expect(await bar.evaluate((element) => getComputedStyle(element).flexWrap)).toBe('nowrap')
    const button = await bar.locator('.trevixal-toolbar__button').first().boundingBox()
    expect(button?.height ?? 0).toBeGreaterThanOrEqual(44)

    // It still formats: tap into the text, select, tap Bold.
    await page.locator(`${surface} p`).first().tap()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await bar.locator('[data-trevixal-item="bold"]').tap()
    await expect(page.locator(`${surface} p`).first().locator('strong').first()).toBeVisible()
  } finally {
    await server.close()
  }
})
