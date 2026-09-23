import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'

const pageUrl = `file://${join(dirname(fileURLToPath(import.meta.url)), '../page/index.html')}`

const RANGE = '.trevixal-cell--range'
const ACTIVE = '.trevixal-cell--selected'

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl)
  await page.locator('.trevixal-content').click()
})

/** Fill a table's cells left to right, so each one can be told apart. */
async function tableOf(page: Page, rows: number, columns: number): Promise<void> {
  await page.evaluate(
    ([r, c]) => window.trevixal.insertTable(r as number, c as number),
    [rows, columns],
  )
  for (let index = 0; index < rows * columns; index++) {
    if (index > 0) await page.keyboard.press('Tab')
    await page.keyboard.type(String.fromCharCode(97 + index))
  }
}

async function centreOf(page: Page, text: string): Promise<{ x: number; y: number }> {
  const box = await page
    .locator(`th:has-text("${text}"), td:has-text("${text}")`)
    .first()
    .boundingBox()
  if (!box) throw new Error(`no cell reading "${text}"`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** The real gesture: a click, then a second press that drags before it lifts. */
async function dragFromDoubleClick(page: Page, from: string, to?: string): Promise<void> {
  const start = await centreOf(page, from)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.up()
  await page.mouse.down({ clickCount: 2 })
  if (to) {
    const end = await centreOf(page, to)
    await page.mouse.move(end.x, end.y, { steps: 8 })
  }
  await page.mouse.up()
}

test('a single click still puts a text cursor in the cell', async ({ page }) => {
  await tableOf(page, 1, 2)
  const a = await centreOf(page, 'a')
  await page.mouse.click(a.x, a.y)

  // One cell ringed as the caret's, and nothing selected as a range.
  await expect(page.locator(ACTIVE)).toHaveCount(1)
  await expect(page.locator(RANGE)).toHaveCount(0)
  expect(await page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(true)
})

test('a double click selects the whole cell', async ({ page }) => {
  await tableOf(page, 1, 2)
  await dragFromDoubleClick(page, 'a')

  // The cell's text, not the word the pointer happened to land on.
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('a')
})

test('dragging from a double click selects across cells', async ({ page }) => {
  await tableOf(page, 1, 3)
  await dragFromDoubleClick(page, 'a', 'b')

  await expect(page.locator(RANGE)).toHaveCount(2)
  await expect(page.locator(RANGE).first()).toHaveText('a')
  await expect(page.locator(RANGE).last()).toHaveText('b')
})

test('a drag across rows covers the rectangle between the corners', async ({ page }) => {
  await tableOf(page, 2, 2)
  await dragFromDoubleClick(page, 'a', 'd')

  await expect(page.locator(RANGE)).toHaveCount(4)
})

test('the dragged selection is what merge acts on', async ({ page }) => {
  await tableOf(page, 1, 3)
  await dragFromDoubleClick(page, 'a', 'b')

  // The selection has to survive the round trip through the DOM: `exec` reads
  // the live selection back before running the command.
  expect(await page.evaluate(() => window.trevixal.exec('mergeCells'))).toBe(true)
  expect(await page.evaluate(() => window.editor.getHTML())).toContain(
    '<th colspan="2"><p>a</p><p>b</p></th>',
  )
})

test('double clicking a merged cell is enough to split it', async ({ page }) => {
  await tableOf(page, 1, 3)
  await dragFromDoubleClick(page, 'a', 'b')
  await page.evaluate(() => window.trevixal.exec('mergeCells'))

  await dragFromDoubleClick(page, 'a')
  expect(await page.evaluate(() => window.trevixal.exec('splitCell'))).toBe(true)
  expect(await page.evaluate(() => window.editor.getHTML())).not.toContain('colspan')
})

test('clicking outside the table drops the selection', async ({ page }) => {
  await tableOf(page, 1, 2)
  // A table is the whole document until something follows it, and the point of
  // this test is a click that lands outside one.
  await page.keyboard.press('ControlOrMeta+Enter')
  await page.keyboard.type('after')

  await dragFromDoubleClick(page, 'a', 'b')
  await expect(page.locator(RANGE)).toHaveCount(2)

  await page.locator('.trevixal-content > p', { hasText: 'after' }).click()
  await expect(page.locator(RANGE)).toHaveCount(0)
  await expect(page.locator(ACTIVE)).toHaveCount(0)
})

test('typing over several selected cells empties them, keeping the table', async ({ page }) => {
  await tableOf(page, 1, 3)
  await dragFromDoubleClick(page, 'a', 'b')
  await page.keyboard.type('Z')

  // A selection that spans cells is easy to make now, so the replace it drives
  // has to stay inside the row: three cells in, three cells out.
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(
    '<table><tr><th><p>Z</p></th><th><p></p></th><th><p>c</p></th></tr></table>',
  )
})

test('typing replaces a selected cell rather than merging into it', async ({ page }) => {
  await tableOf(page, 1, 2)
  await dragFromDoubleClick(page, 'a')
  await page.keyboard.type('z')

  // The double click selected the cell, so typing overwrites what was there.
  expect(await page.evaluate(() => window.editor.getHTML())).toContain('<th><p>z</p></th>')
})
