import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'

const pageUrl = `file://${join(dirname(fileURLToPath(import.meta.url)), '../page/ui.html')}`

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl)
  // Three by three, lettered, which is where the Word screenshot starts.
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

/** The rendered table as rows of `text:colspan`. */
function grid(page: Page): Promise<string[][]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.trevixal-content tr')].map((tr) =>
      [...tr.querySelectorAll<HTMLTableCellElement>('td, th')].map(
        (cell) => `${cell.textContent}:${cell.colSpan}`,
      ),
    ),
  )
}

/** Put the caret in a cell and choose Table ▸ Split cells…. */
async function openSplit(page: Page, text: string): Promise<void> {
  await page
    .locator('.trevixal-content td, .trevixal-content th')
    .getByText(text, { exact: true })
    .click()
  await page.getByRole('menuitem', { name: 'Table', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Split cells…' }).click()
}

const columns = (page: Page) => page.getByLabel('Number of columns')

test('splits a cell into columns, and the cells below it span them, as in Word', async ({
  page,
}) => {
  await openSplit(page, 'a')
  await expect(columns(page)).toHaveValue('2')
  await page.getByRole('button', { name: 'Split', exact: true }).click()

  expect(await grid(page)).toEqual([
    ['a:1', ':1', 'b:1', 'c:1'],
    ['d:2', 'e:1', 'f:1'],
    ['g:2', 'h:1', 'i:1'],
  ])
  // The caret lands at the start of the first new cell, where merging and
  // un-merging leave it too, so typing goes there.
  await page.keyboard.type('!')
  expect((await grid(page))[0]?.[0]).toBe('!a:1')
})

test('keeps the table looking as it did, the new cells sharing the old one’s width', async ({
  page,
}) => {
  const widths = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.trevixal-content tr')].map((tr) =>
        [...tr.querySelectorAll('td, th')].map((cell) => cell.getBoundingClientRect().width),
      ),
    )
  const before = await widths()
  await openSplit(page, 'a')
  await page.getByRole('button', { name: 'Split', exact: true }).click()
  const after = await widths()

  const near = (a: number | undefined, b: number | undefined) =>
    Math.abs((a ?? 0) - (b ?? -99)) <= 2
  // The two new cells cover what the one did, each half of it.
  expect(near((after[0]?.[0] ?? 0) + (after[0]?.[1] ?? 0), before[0]?.[0])).toBe(true)
  expect(near(after[0]?.[0], after[0]?.[1])).toBe(true)
  // Every other column is as wide as it was, and so are the cells below.
  expect(near(after[0]?.[2], before[0]?.[1])).toBe(true)
  expect(near(after[0]?.[3], before[0]?.[2])).toBe(true)
  expect(near(after[1]?.[0], before[1]?.[0])).toBe(true)
})

test('holds the count to what it can make before splitting anything', async ({ page }) => {
  await openSplit(page, 'e')
  await columns(page).fill('1')
  await page.getByRole('button', { name: 'Split', exact: true }).click()
  // The browser refused the submit: the dialog is still up, the table as it was.
  await expect(page.getByRole('dialog', { name: 'Split cells' })).toBeVisible()
  expect((await grid(page))[1]).toEqual(['d:1', 'e:1', 'f:1'])

  await columns(page).fill('3')
  await page.getByRole('button', { name: 'Split', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Split cells' })).toHaveCount(0)
  expect(await grid(page)).toEqual([
    ['a:1', 'b:3', 'c:1'],
    ['d:1', 'e:1', ':1', ':1', 'f:1'],
    ['g:1', 'h:3', 'i:1'],
  ])
})

test('undoes in one step', async ({ page }) => {
  await openSplit(page, 'a')
  await page.getByRole('button', { name: 'Split', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+z')
  expect(await grid(page)).toEqual([
    ['a:1', 'b:1', 'c:1'],
    ['d:1', 'e:1', 'f:1'],
    ['g:1', 'h:1', 'i:1'],
  ])
})
