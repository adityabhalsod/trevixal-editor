import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const pageUrl = `file://${join(dirname(fileURLToPath(import.meta.url)), '../page/index.html')}`

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl)
  await page.locator('.trevixal-content').click()
})

test('markdown heading shortcut', async ({ page }) => {
  await page.keyboard.type('## Title')
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<h2>Title</h2>')
})

test('bullet list typing flow with Enter and exit', async ({ page }) => {
  await page.keyboard.type('- first')
  await page.keyboard.press('Enter')
  await page.keyboard.type('second')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter') // empty item exits the list
  await page.keyboard.type('after')
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(
    '<ul><li><p>first</p></li><li><p>second</p></li></ul><p>after</p>',
  )
})

test('Tab nests and Shift-Tab lifts a list item', async ({ page }) => {
  await page.keyboard.type('- a')
  await page.keyboard.press('Enter')
  await page.keyboard.type('b')
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(
    '<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>',
  )
  await page.keyboard.press('Shift+Tab')
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(
    '<ul><li><p>a</p></li><li><p>b</p></li></ul>',
  )
})

test('blockquote and em dash input rules', async ({ page }) => {
  await page.keyboard.type('> quoted--text')
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(
    '<blockquote><p>quoted—text</p></blockquote>',
  )
})

test('undo unwinds an input-rule transform as its own step', async ({ page }) => {
  await page.keyboard.type('## ')
  expect(await page.evaluate(() => window.editor.getSnapshot().blockType)).toBe('heading')
  await page.keyboard.press('ControlOrMeta+z')
  expect(await page.evaluate(() => window.editor.getSnapshot().blockType)).toBe('paragraph')
})
