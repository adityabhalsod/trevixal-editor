import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'

const pageUrl = `file://${join(dirname(fileURLToPath(import.meta.url)), '../page/ui.html')}`

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl)
  // Three by three, lettered.
  await page.evaluate(() => {
    const cell = (text: string) => ({
      type: 'tableCell',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })
    const row = (...texts: string[]) => ({ type: 'tableRow', content: texts.map(cell) })
    window.uiPage.editor.setContent({
      type: 'doc',
      content: [
        { type: 'table', content: [row('a', 'b', 'c'), row('d', 'e', 'f'), row('g', 'h', 'i')] },
      ],
    } as never)
  })
})

/** The rendered table as rows of `text:colspan:rowspan`. */
function grid(page: Page): Promise<string[][]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.trevixal-content tr')].map((tr) =>
      [...tr.querySelectorAll<HTMLTableCellElement>('td, th')].map(
        (cell) => `${cell.textContent}:${cell.colSpan}:${cell.rowSpan}`,
      ),
    ),
  )
}

function cellNamed(page: Page, text: string) {
  return page.locator('.trevixal-content td, .trevixal-content th').getByText(text, { exact: true })
}

async function centreOf(page: Page, text: string): Promise<{ x: number; y: number }> {
  const box = await cellNamed(page, text).boundingBox()
  if (!box) throw new Error(`no cell reading "${text}"`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Double click one cell and drag to another: the cell selection gesture. */
async function selectCells(page: Page, from: string, to: string): Promise<void> {
  const start = await centreOf(page, from)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.up()
  await page.mouse.down({ clickCount: 2 })
  const end = await centreOf(page, to)
  await page.mouse.move(end.x, end.y, { steps: 8 })
  await page.mouse.up()
}

async function tableMenu(page: Page, entry: string): Promise<void> {
  await page.getByRole('menuitem', { name: 'Table', exact: true }).click()
  await page.getByRole('menuitem', { name: entry }).click()
}

test('merges cells down a column into one spanning the rows', async ({ page }) => {
  await selectCells(page, 'a', 'd')
  await tableMenu(page, 'Merge cells')
  expect(await grid(page)).toEqual([
    ['ad:1:2', 'b:1:1', 'c:1:1'],
    ['e:1:1', 'f:1:1'],
    ['g:1:1', 'h:1:1', 'i:1:1'],
  ])
  // The merged cell stands in the first column of both rows.
  const tops = await page.evaluate(() => {
    const [first, second] = [...document.querySelectorAll('.trevixal-content tr')]
    const merged = first?.querySelector('td') as HTMLElement
    const e = second?.querySelector('td') as HTMLElement
    return {
      mergedRight: merged.getBoundingClientRect().right,
      eLeft: e.getBoundingClientRect().left,
    }
  })
  expect(Math.abs(tops.mergedRight - tops.eLeft)).toBeLessThan(3)
})

test('merges a rectangle across rows and columns', async ({ page }) => {
  await selectCells(page, 'a', 'e')
  await tableMenu(page, 'Merge cells')
  expect(await grid(page)).toEqual([['abde:2:2', 'c:1:1'], ['f:1:1'], ['g:1:1', 'h:1:1', 'i:1:1']])
})

test('splits a cell into rows from the Split cells dialog', async ({ page }) => {
  await cellNamed(page, 'b').click()
  await tableMenu(page, 'Split cells…')
  await page.getByLabel('Number of columns').fill('1')
  await page.getByLabel('Number of rows').fill('2')
  await page.getByRole('button', { name: 'Split', exact: true }).click()
  expect(await grid(page)).toEqual([
    ['a:1:2', 'b:1:1', 'c:1:2'],
    [':1:1'],
    ['d:1:1', 'e:1:1', 'f:1:1'],
    ['g:1:1', 'h:1:1', 'i:1:1'],
  ])
  // The caret is in the first part, so typing goes there.
  await page.keyboard.type('!')
  expect((await grid(page))[0]?.[1]).toBe('!b:1:1')
})

test('a row inserted inside a merged cell grows it, and deleting the row shrinks it again', async ({
  page,
}) => {
  await selectCells(page, 'a', 'd')
  await tableMenu(page, 'Merge cells')
  await cellNamed(page, 'b').click()
  await tableMenu(page, 'Row below')
  expect((await grid(page))[0]?.[0]).toBe('ad:1:3')
  await cellNamed(page, 'e').click()
  await tableMenu(page, 'Delete row')
  expect((await grid(page))[0]?.[0]).toBe('ad:1:2')
})

test('marks where each cell stands, so first-column styling finds the right cells', async ({
  page,
}) => {
  await selectCells(page, 'a', 'd')
  await tableMenu(page, 'Merge cells')
  const marks = await page.evaluate(() =>
    [...document.querySelectorAll('.trevixal-content tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((cell) => cell.getAttribute('data-grid-column')),
    ),
  )
  expect(marks).toEqual([
    ['0', '1', '2'],
    ['1', '2'],
    ['0', '1', '2'],
  ])
})
