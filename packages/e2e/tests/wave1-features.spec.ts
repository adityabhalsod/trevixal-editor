import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/full-editor/dist')

test.describe('wave 1 features', () => {
  test('renders every advanced block from the seeded document', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-content')

      // One assertion per feature: a missing node type fails schema
      // construction silently at seed time, leaving the block absent rather
      // than erroring.
      await expect(page.locator('.trevixal-callout')).toHaveCount(5)
      await expect(page.locator("[data-type='taskItem']")).toHaveCount(3)
      await expect(page.locator("[data-checked='true']")).toHaveCount(2)
      await expect(page.locator('.trevixal-columns__column')).toHaveCount(3)
      await expect(page.locator('.trevixal-card')).toHaveCount(1)
      await expect(page.locator('.trevixal-badge')).toHaveCount(1)
      await expect(page.locator('.trevixal-button')).toHaveCount(1)
      await expect(page.locator('.trevixal-footnote-ref')).toHaveCount(1)
      await expect(page.locator('.trevixal-page-break')).toHaveCount(1)
      // One toggle block, plus the two sections of the accordion.
      await expect(page.locator('.trevixal-content .trevixal-toggle')).toHaveCount(1)
      await expect(page.locator('.trevixal-content details')).toHaveCount(3)
    } finally {
      await server.close()
    }
  })

  test('opens every menu and offers actionable entries', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-menubar__trigger')

      const labels = await page.locator('.trevixal-menubar__trigger').allTextContents()
      expect(labels.length).toBeGreaterThanOrEqual(8)

      for (const label of labels) {
        // Reload between menus: a menubar switches on hover, so clicking the
        // next trigger while one is open can close it instead.
        await page.goto(server.origin)
        await page.waitForSelector('.trevixal-menubar__trigger')
        await page.locator('.trevixal-menubar__trigger', { hasText: label.trim() }).first().click()

        const panel = page.locator('[role="menu"]:not([hidden])').first()
        await expect(panel).toBeVisible()
        // Every menu must offer something usable. Individual items may be
        // greyed out by `isEnabled`, Undo with no history, "Restart
        // numbering" outside a list, which is correct; a menu where
        // *nothing* is live means the wiring never reached it.
        await expect(panel.locator('button:not([disabled])')).not.toHaveCount(0)
      }
    } finally {
      await server.close()
    }
  })

  test('enables the context-gated entries once their context exists', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-content')

      // Case conversion needs a selection; with a collapsed caret it is
      // rightly greyed out, so select before asserting it is live.
      await page.locator('.trevixal-content p').first().click()
      await page.keyboard.press('Home')
      await page.keyboard.press('Shift+End')

      await page.locator('.trevixal-menubar__trigger', { hasText: 'Edit' }).first().click()
      const panel = page.locator('[role="menu"]:not([hidden])').first()
      await expect(panel).toBeVisible()
      await expect(panel.getByText('UPPERCASE', { exact: true })).toBeEnabled()
      await expect(panel.getByText('Title Case', { exact: true })).toBeEnabled()
    } finally {
      await server.close()
    }
  })

  test('groups the toolbar by category', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('#chrome .trevixal-toolbar')
      // The chrome's bar. The bubble over a selection is the same component,
      // so an unscoped count picks up its single group as well.
      const groups = page.locator('#chrome .trevixal-toolbar__group')
      await expect(groups).toHaveCount(12)
    } finally {
      await server.close()
    }
  })

  test('checks off a task by clicking its checkbox', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector("[data-type='taskItem']")

      const third = page.locator("[data-type='taskItem']").nth(2)
      await expect(third).toHaveAttribute('data-checked', 'false')
      // The checkbox is a CSS marker, so the click lands in the item's left
      // gutter rather than on an input element.
      await third.click({ position: { x: 6, y: 10 } })
      await expect(third).toHaveAttribute('data-checked', 'true')
    } finally {
      await server.close()
    }
  })

  test('shows the table of contents and outline panels', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-content')
      // Both mount open, and the TOC picks up the seeded headings.
      await expect(page.locator('#toc')).toBeVisible()
      await expect(page.locator('#outline')).toBeVisible()
      await expect(page.locator('#toc a, #toc button, #toc li')).not.toHaveCount(0)
    } finally {
      await server.close()
    }
  })
})
