import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const pageUrl = `file://${join(dirname(fileURLToPath(import.meta.url)), '../page/index.html')}`

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl)
  await page.locator('.trevixal-content').click()
})

test('typing updates the model and the DOM', async ({ page }) => {
  await page.keyboard.type('hello world')
  await expect(page.locator('.trevixal-content p')).toHaveText('hello world')
  expect(await page.evaluate(() => window.editor.getText())).toBe('hello world')
})

test('Enter splits, Backspace joins', async ({ page }) => {
  await page.keyboard.type('ab')
  await page.keyboard.press('Enter')
  await page.keyboard.type('cd')
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>ab</p><p>cd</p>')
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>abcd</p>')
})

test('Mod-b bolds the selection', async ({ page }) => {
  await page.keyboard.type('bold me')
  await page.keyboard.press('Shift+Home')
  await page.keyboard.press('ControlOrMeta+b')
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p><strong>bold me</strong></p>')
  expect(await page.evaluate(() => window.editor.isActive('bold'))).toBe(true)
})

test('undo and redo round-trip typing', async ({ page }) => {
  await page.keyboard.type('first')
  await page.keyboard.press('ControlOrMeta+z')
  expect(await page.evaluate(() => window.editor.getText())).toBe('')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  expect(await page.evaluate(() => window.editor.getText())).toBe('first')
})

test('caret and selection stay in sync with the model', async ({ page }) => {
  await page.keyboard.type('abc')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.type('X')
  expect(await page.evaluate(() => window.editor.getText())).toBe('abXc')
})
