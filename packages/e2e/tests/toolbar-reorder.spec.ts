import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/full-editor/dist')

// Scoped to the chrome. The page carries more than one toolbar, the bubble
// over a selection is built from the same component, and "the toolbar order"
// means the bar at the top, not whichever one the document happens to hold.
const order = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#chrome .trevixal-toolbar > .trevixal-toolbar__group')].map(
      (group) => (group as HTMLElement).dataset.trevixalGroup,
    ),
  )

const centre = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
})

test.describe('rearranging toolbar groups', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 })
  })

  test('drags a group to a new place by its grip, and remembers it', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('#chrome .trevixal-toolbar')
      const before = await order(page)
      // Quick access leads the bar, the way Word's leads its ribbon.
      expect(before[0]).toBe('quick')

      const grip = await page.locator('#chrome [data-trevixal-grip="history"]').boundingBox()
      const first = await page.locator('#chrome [data-trevixal-group="quick"]').boundingBox()
      if (!grip || !first) throw new Error('missing grip or group')

      await page.mouse.move(centre(grip).x, centre(grip).y)
      await page.mouse.down()
      // Onto the left half of the first group: that is "before it".
      await page.mouse.move(first.x + 8, centre(first).y, { steps: 12 })
      // The insertion bar shows where the group will land.
      await expect(page.locator('.trevixal-toolbar__drop')).toBeVisible()
      await page.mouse.up()

      const after = await order(page)
      expect(after[0]).toBe('history')
      expect(after.slice(1)).toEqual(before.filter((name) => name !== 'history'))

      // Remembered, so it comes back the same after a reload. The demo keeps
      // every remembered choice in one preferences object.
      const stored = await page.evaluate(() => localStorage.getItem('trevixal:preferences'))
      expect(JSON.parse(stored ?? '{}').toolbarOrder).toEqual(after)
      await page.reload()
      await page.waitForSelector('#chrome .trevixal-toolbar')
      expect(await order(page)).toEqual(after)
    } finally {
      await server.close()
    }
  })

  test('a click on a grip moves nothing', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('#chrome .trevixal-toolbar')
      const before = await order(page)
      await page.locator('[data-trevixal-grip="lists"]').click()
      expect(await order(page)).toEqual(before)
      expect(await page.evaluate(() => localStorage.getItem('trevixal:toolbar-order'))).toBeNull()
    } finally {
      await server.close()
    }
  })

  test('Space picks a group up and the arrow keys move it', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('#chrome .trevixal-toolbar')
      const before = await order(page)
      const grip = page.locator('[data-trevixal-grip="align"]')
      await grip.focus()
      await page.keyboard.press('Space')
      await expect(grip).toHaveAttribute('aria-pressed', 'true')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowLeft')
      // Focus travels with the group through both moves.
      await expect(grip).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(grip).toHaveAttribute('aria-pressed', 'false')

      const after = await order(page)
      expect(after.indexOf('align')).toBe(before.indexOf('align') - 2)
    } finally {
      await server.close()
    }
  })
})
