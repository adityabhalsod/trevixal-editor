import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'

const pageUrl = `file://${join(dirname(fileURLToPath(import.meta.url)), '../page/ui.html')}`

type Cell = string | { text: string; attrs: Record<string, unknown> }

/** A paragraph, a table of the rows given, and two empty paragraphs to draw a box over. */
async function load(page: Page, rows: Cell[][], tableAttrs: Record<string, unknown> = {}) {
  await page.evaluate(
    ({ rows, tableAttrs }) => {
      const paragraph = (text: string) => ({
        type: 'paragraph',
        content: text ? [{ type: 'text', text }] : [],
      })
      const cell = (spec: Cell) => {
        const { text, attrs } = typeof spec === 'string' ? { text: spec, attrs: {} } : spec
        const blocks = text.split('\n').map(paragraph)
        return { type: 'tableCell', attrs, content: blocks }
      }
      window.uiPage.editor.setContent({
        type: 'doc',
        content: [
          paragraph('Intro'),
          {
            type: 'table',
            attrs: tableAttrs,
            content: rows.map((row) => ({ type: 'tableRow', content: row.map(cell) })),
          },
          paragraph(''),
          paragraph(''),
        ],
      } as never)
    },
    { rows, tableAttrs },
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl)
  await load(page, [
    ['alpha', 'beta', 'gamma'],
    ['delta', 'epsilon', 'zeta'],
  ])
})

/** The first table as rows of `text:colspan`. */
function grid(page: Page): Promise<string[][]> {
  return page.evaluate(() =>
    [...(document.querySelector('.trevixal-content table') as HTMLTableElement).rows].map((tr) =>
      [...tr.cells].map((cell) => `${cell.textContent}:${cell.colSpan}`),
    ),
  )
}

/** The cell holding exactly this text. */
function cell(page: Page, text: string) {
  return page.locator('.trevixal-content td').filter({ has: page.getByText(text, { exact: true }) })
}

async function boxOf(page: Page, text: string) {
  const box = await cell(page, text).boundingBox()
  if (!box) throw new Error(`no cell ${text}`)
  return box
}

/** Choose an entry from the Table menu; the tools are the entries that can be ticked. */
async function tableMenu(page: Page, name: string): Promise<void> {
  await page.getByRole('menuitem', { name: 'Table', exact: true }).click()
  const tool = name === 'Draw table' || name === 'Eraser'
  await page.getByRole(tool ? 'menuitemcheckbox' : 'menuitem', { name, exact: true }).click()
}

/** Press, travel in steps, and let go, as a hand would draw. */
async function stroke(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await page.mouse.move(...from)
  await page.mouse.down()
  await page.mouse.move(...to, { steps: 8 })
  await page.mouse.up()
}

const tableWidth = (page: Page) =>
  page.evaluate(
    () =>
      (document.querySelector('.trevixal-content table') as HTMLElement).getBoundingClientRect()
        .width,
  )

const columnWidths = (page: Page) =>
  page.evaluate(() =>
    [...(document.querySelector('.trevixal-content table') as HTMLTableElement).rows[0].cells].map(
      (td) => td.getBoundingClientRect().width,
    ),
  )

test('AutoFit contents fits the table to its text, and AutoFit window stretches it back', async ({
  page,
}) => {
  const full = await tableWidth(page)
  await cell(page, 'alpha').click()
  await tableMenu(page, 'AutoFit contents')
  expect(await tableWidth(page)).toBeLessThan(full / 2)
  await tableMenu(page, 'AutoFit window')
  expect(Math.abs((await tableWidth(page)) - full)).toBeLessThanOrEqual(2)
})

test('Fixed column width holds the columns where they are as the text grows', async ({ page }) => {
  await cell(page, 'alpha').click()
  await tableMenu(page, 'Fixed column width')
  const before = await columnWidths(page)
  await cell(page, 'alpha').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' and a good deal more text than the column had')
  const after = await columnWidths(page)
  after.forEach((width, index) =>
    expect(Math.abs(width - (before[index] ?? 0))).toBeLessThanOrEqual(1),
  )
})

test('Distribute rows makes every row as tall as the tallest', async ({ page }) => {
  await load(page, [
    ['alpha', 'beta'],
    ['one\ntwo\nthree', 'epsilon'],
    ['eta', 'theta'],
  ])
  const heights = () =>
    page.evaluate(() =>
      [...(document.querySelector('.trevixal-content table') as HTMLTableElement).rows].map(
        (tr) => tr.getBoundingClientRect().height,
      ),
    )
  const tallest = Math.max(...(await heights()))
  await cell(page, 'alpha').click()
  await tableMenu(page, 'Distribute rows evenly')
  for (const height of await heights()) expect(Math.abs(height - tallest)).toBeLessThanOrEqual(1)
})

test('Distribute columns shares out only the columns selected', async ({ page }) => {
  await load(
    page,
    [
      [
        { text: 'alpha', attrs: { width: '20%' } },
        { text: 'beta', attrs: { width: '50%' } },
        { text: 'gamma', attrs: { width: '30%' } },
      ],
      ['delta', 'epsilon', 'zeta'],
    ],
    { layout: 'fixed' },
  )
  const [first] = await columnWidths(page)
  // Double click a cell and drag to another: the cell selection. The second
  // press is the one held down for the drag.
  const beta = await boxOf(page, 'beta')
  const zeta = await boxOf(page, 'zeta')
  await page.mouse.move(beta.x + beta.width / 2, beta.y + beta.height / 2)
  await page.mouse.down()
  await page.mouse.up()
  await page.mouse.down({ clickCount: 2 })
  await page.mouse.move(zeta.x + zeta.width / 2, zeta.y + zeta.height / 2, { steps: 8 })
  await page.mouse.up({ clickCount: 2 })
  await tableMenu(page, 'Distribute columns evenly')
  const [left, middle, right] = await columnWidths(page)
  expect(Math.abs((left ?? 0) - (first ?? 0))).toBeLessThanOrEqual(1)
  expect(Math.abs((middle ?? 0) - (right ?? 0))).toBeLessThanOrEqual(1)
})

test('Draw table: a line down splits the cells it crosses, where it was drawn', async ({
  page,
}) => {
  await tableMenu(page, 'Draw table')
  const alpha = await boxOf(page, 'alpha')
  const delta = await boxOf(page, 'delta')
  const x = alpha.x + alpha.width / 3
  await stroke(page, [x, alpha.y + 6], [x + 2, delta.y + delta.height - 6])
  expect(await grid(page)).toEqual([
    ['alpha:1', ':1', 'beta:1', 'gamma:1'],
    ['delta:1', ':1', 'epsilon:1', 'zeta:1'],
  ])
  const after = await boxOf(page, 'alpha')
  expect(Math.abs(after.x + after.width - x)).toBeLessThanOrEqual(2)
})

test('Draw table: a line across splits the row in two', async ({ page }) => {
  await tableMenu(page, 'Draw table')
  const beta = await boxOf(page, 'beta')
  const y = beta.y + beta.height / 2
  await stroke(page, [beta.x + 6, y], [beta.x + beta.width - 6, y + 2])
  expect(await grid(page)).toEqual([
    ['alpha:1', 'beta:1', 'gamma:1'],
    [':1', ':1', ':1'],
    ['delta:1', 'epsilon:1', 'zeta:1'],
  ])
})

test('Draw table: a box where there is no table draws a table that size', async ({ page }) => {
  await tableMenu(page, 'Draw table')
  const blank = await page.locator('.trevixal-content > p').nth(1).boundingBox()
  if (!blank) throw new Error('no blank paragraph')
  const from: [number, number] = [blank.x + 20, blank.y + 4]
  await stroke(page, from, [from[0] + 240, from[1] + 70])
  const drawn = await page.evaluate(() => {
    const tables = document.querySelectorAll('.trevixal-content > table')
    const table = tables[tables.length - 1] as HTMLTableElement
    const box = table.getBoundingClientRect()
    return { count: tables.length, cells: table.querySelectorAll('td').length, ...box.toJSON() }
  })
  expect(drawn).toMatchObject({ count: 2, cells: 1 })
  expect(Math.abs(drawn.width - 240)).toBeLessThanOrEqual(3)
  expect(Math.abs(drawn.height - 70)).toBeLessThanOrEqual(3)
})

test('Eraser takes out the line under the pointer, and Draw table puts it back', async ({
  page,
}) => {
  const gammaBefore = await boxOf(page, 'gamma')
  await tableMenu(page, 'Eraser')
  const beta = await boxOf(page, 'beta')
  await page.mouse.move(beta.x + beta.width - 2, beta.y + beta.height / 2)
  await expect(page.locator('.trevixal-draw-guide[data-shape="erase"]')).toBeVisible()
  await page.mouse.down()
  await page.mouse.up()

  const betaCell = cell(page, 'beta')
  await expect(betaCell).toHaveAttribute('data-hidden-borders', 'right')
  expect(await betaCell.evaluate((td) => getComputedStyle(td).borderRightStyle)).toBe('hidden')
  // Only the line goes. A table the browser lays out shares the pixel the
  // line took out among its columns again, so they may shift by about that.
  const gammaAfter = await boxOf(page, 'gamma')
  expect(Math.abs(gammaAfter.x - gammaBefore.x)).toBeLessThanOrEqual(3)

  await tableMenu(page, 'Draw table')
  const edge = beta.x + beta.width
  await stroke(page, [edge, beta.y + 6], [edge, beta.y + beta.height - 6])
  await expect(betaCell).not.toHaveAttribute('data-hidden-borders')
  expect(await grid(page)).toEqual([
    ['alpha:1', 'beta:1', 'gamma:1'],
    ['delta:1', 'epsilon:1', 'zeta:1'],
  ])
})

test('erasing moves nothing in a table whose columns are set', async ({ page }) => {
  await cell(page, 'alpha').click()
  await tableMenu(page, 'Fixed column width')
  const before = await columnWidths(page)
  await tableMenu(page, 'Eraser')
  const beta = await boxOf(page, 'beta')
  await page.mouse.click(beta.x + 2, beta.y + beta.height / 2)
  await expect(cell(page, 'beta')).toHaveAttribute('data-hidden-borders', 'left')
  const after = await columnWidths(page)
  after.forEach((width, index) =>
    expect(Math.abs(width - (before[index] ?? 0))).toBeLessThanOrEqual(0.5),
  )
})

test('the Table menu ticks the tool held, and Escape puts it down', async ({ page }) => {
  await tableMenu(page, 'Draw table')
  // The pointer is the pencil while it is held.
  expect(
    await cell(page, 'alpha').evaluate((element) => getComputedStyle(element).cursor),
  ).toContain('url(')
  await page.getByRole('menuitem', { name: 'Table', exact: true }).click()
  const draw = page.getByRole('menuitemcheckbox', { name: 'Draw table', exact: true })
  await expect(draw).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('menuitemcheckbox', { name: 'Eraser' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await page.keyboard.press('Escape')
  await page.locator('.trevixal-content').focus()
  await page.keyboard.press('Escape')
  await page.getByRole('menuitem', { name: 'Table', exact: true }).click()
  await expect(draw).toHaveAttribute('aria-checked', 'false')
})

test('one undo takes back a drawn line', async ({ page }) => {
  await tableMenu(page, 'Draw table')
  const alpha = await boxOf(page, 'alpha')
  const x = alpha.x + alpha.width / 2
  await stroke(page, [x, alpha.y + 6], [x, alpha.y + alpha.height - 6])
  expect((await grid(page))[0]).toHaveLength(4)
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+z')
  expect(await grid(page)).toEqual([
    ['alpha:1', 'beta:1', 'gamma:1'],
    ['delta:1', 'epsilon:1', 'zeta:1'],
  ])
})
