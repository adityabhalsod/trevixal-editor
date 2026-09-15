import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const pageUrl = `file://${join(dirname(fileURLToPath(import.meta.url)), '../page/index.html')}`

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl)
  await page.locator('.trevixal-content').click()
})

test('insert a table and type across cells with Tab', async ({ page }) => {
  await page.evaluate(() => window.trevixal.insertTable(2, 2))
  await page.keyboard.type('one')
  await page.keyboard.press('Tab')
  await page.keyboard.type('two')
  await page.keyboard.press('Tab')
  await page.keyboard.type('three')
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(
    '<table><tr><th><p>one</p></th><th><p>two</p></th></tr>' +
      '<tr><td><p>three</p></td><td><p></p></td></tr></table>',
  )
})

test('Shift-Tab walks backwards', async ({ page }) => {
  await page.evaluate(() => window.trevixal.insertTable(1, 2))
  await page.keyboard.press('Tab')
  await page.keyboard.type('b')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.type('a')
  expect(await page.evaluate(() => window.editor.getText())).toBe('a\nb')
})

test('Tab on the last cell grows the table', async ({ page }) => {
  await page.evaluate(() => window.trevixal.insertTable(1, 1))
  await page.keyboard.press('Tab')
  await page.keyboard.type('new row')
  const html = await page.evaluate(() => window.editor.getHTML())
  expect(html).toContain('<tr><td><p>new row</p></td></tr>')
})

test('merge and split cells', async ({ page }) => {
  await page.evaluate(() => window.trevixal.insertTable(1, 3))
  await page.keyboard.type('a')
  await page.evaluate(() => {
    window.trevixal.selectRange([0, 0, 0, 0], 0, [0, 0, 1, 0], 0)
    window.trevixal.exec('mergeCells')
  })
  let html = await page.evaluate(() => window.editor.getHTML())
  expect(html).toContain('<th colspan="2"><p>a</p>')
  await page.evaluate(() => window.trevixal.exec('splitCell'))
  html = await page.evaluate(() => window.editor.getHTML())
  expect(html).not.toContain('colspan')
  expect(html).toContain('<th><p>a</p></th><th><p></p></th><th><p></p></th>')
})

test('header row toggles and typing still works', async ({ page }) => {
  await page.evaluate(() => window.trevixal.insertTable(2, 2))
  expect(await page.evaluate(() => window.editor.getHTML())).toContain('<th>')
  await page.evaluate(() => window.trevixal.exec('toggleHeaderRow'))
  expect(await page.evaluate(() => window.editor.getHTML())).not.toContain('<th>')
  await page.keyboard.type('x')
  expect(await page.evaluate(() => window.editor.getText())).toContain('x')
})

test('undo reverts table structure changes', async ({ page }) => {
  await page.evaluate(() => window.trevixal.insertTable(1, 2))
  await page.keyboard.type('cell')
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press('ControlOrMeta+z')
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p></p>')
})
