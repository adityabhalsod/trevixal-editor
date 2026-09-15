import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const pageUrl = `file://${join(dirname(fileURLToPath(import.meta.url)), '../page/track-changes.html')}`

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl)
})

const surface = '#editor .trevixal-content'

test('typing in suggestion mode renders attributed insertions', async ({ page }) => {
  await page.locator(surface).click()
  await page.keyboard.type('base ')
  await page.click('#tc-enable')
  await page.locator(surface).click()
  await page.keyboard.press('End')
  await page.keyboard.type('suggested')
  const ins = page.locator(`${surface} ins.trevixal-insertion`)
  await expect(ins).toHaveText('suggested')
  await expect(ins).toHaveAttribute('data-trevixal-author', 'me')
})

test('backspace strikes through instead of deleting', async ({ page }) => {
  await page.locator(surface).click()
  await page.keyboard.type('hello')
  await page.click('#tc-enable')
  await page.locator(surface).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await expect(page.locator(`${surface} del.trevixal-deletion`)).toHaveText('lo')
  await expect(page.locator(`${surface} p`)).toHaveText('hello')
})

test('accept all keeps insertions and drops struck text', async ({ page }) => {
  await page.locator(surface).click()
  await page.keyboard.type('keep gone')
  await page.click('#tc-enable')
  await page.locator(surface).click() // return focus to the editor
  await page.evaluate(() => window.trackChangesPage.selectRange([0], 4, [0], 9))
  await page.keyboard.press('Backspace')
  await page.keyboard.press('End')
  await page.keyboard.type(' new')
  await page.click('#tc-accept')
  await expect(page.locator(`${surface} p`)).toHaveText('keep new')
  await expect(page.locator(`${surface} ins, ${surface} del`)).toHaveCount(0)
})

test('reject all restores the original text', async ({ page }) => {
  await page.locator(surface).click()
  await page.keyboard.type('keep gone')
  await page.click('#tc-enable')
  await page.locator(surface).click() // return focus to the editor
  await page.evaluate(() => window.trackChangesPage.selectRange([0], 4, [0], 9))
  await page.keyboard.press('Backspace')
  await page.keyboard.press('End')
  await page.keyboard.type(' new')
  await page.click('#tc-reject')
  await expect(page.locator(`${surface} p`)).toHaveText('keep gone')
  await expect(page.locator(`${surface} ins, ${surface} del`)).toHaveCount(0)
})
