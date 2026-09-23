import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'

const pageUrl = `file://${join(dirname(fileURLToPath(import.meta.url)), '../page/ui.html')}`

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl)
  // A header row, three rows of figures and a total, as a styled table has them.
  await page.evaluate(() => {
    const cell = (text: string, header = false) => ({
      type: 'tableCell',
      attrs: { header },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })
    const row = (...cells: ReturnType<typeof cell>[]) => ({ type: 'tableRow', content: cells })
    window.uiPage.editor.setContent({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Figures' }] },
        {
          type: 'table',
          content: [
            row(cell('Region', true), cell('Q1', true), cell('Q2', true)),
            row(cell('North'), cell('120'), cell('135')),
            row(cell('South'), cell('98'), cell('110')),
            row(cell('Total'), cell('218'), cell('245')),
          ],
        },
      ],
    } as never)
  })
})

const design = (page: Page) => page.locator('.trevixal-tabledesign > .trevixal-dropdown__trigger')

function cell(page: Page, text: string) {
  return page.locator('.trevixal-content td, .trevixal-content th').filter({
    has: page.getByText(text, { exact: true }),
  })
}

async function openDesign(page: Page): Promise<void> {
  await cell(page, 'North').click()
  await design(page).click()
}

const style = (page: Page, text: string, property: string) =>
  cell(page, text).evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  )

test('the Table design dropdown waits for a table', async ({ page }) => {
  await page.getByText('Figures', { exact: true }).click()
  await expect(design(page)).toBeDisabled()
  await cell(page, 'North').click()
  await expect(design(page)).toBeEnabled()
})

test('a style from the gallery fills the header row, as Word does', async ({ page }) => {
  await openDesign(page)
  await page.getByRole('button', { name: 'Blue header', exact: true }).click()
  expect(await style(page, 'Region', 'background-color')).toBe('rgb(21, 96, 130)')
  expect(await style(page, 'Region', 'color')).toBe('rgb(255, 255, 255)')
  await design(page).click()
  await expect(page.getByRole('button', { name: 'Blue header', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('the style options band the body, embolden a column and set a total row apart', async ({
  page,
}) => {
  await openDesign(page)
  for (const option of ['Banded rows', 'First column', 'Total row']) {
    await page.getByRole('checkbox', { name: option }).click()
    await expect(page.getByRole('checkbox', { name: option })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  }
  // Under a header row the first row of the body is banded, the next is not.
  expect(await style(page, '120', 'background-color')).not.toBe('rgba(0, 0, 0, 0)')
  expect(await style(page, '98', 'background-color')).toBe('rgba(0, 0, 0, 0)')
  expect(Number(await style(page, 'North', 'font-weight'))).toBeGreaterThanOrEqual(600)
  expect(Number(await style(page, '120', 'font-weight'))).toBeLessThan(600)
  expect(Number(await style(page, '218', 'font-weight'))).toBeGreaterThanOrEqual(600)
  expect(await style(page, '218', 'border-top-style')).toBe('double')
})

test('the pen draws every line in its style and weight', async ({ page }) => {
  await openDesign(page)
  await page.getByRole('button', { name: 'Dashed', exact: true }).click()
  await page.getByRole('button', { name: '2¼ pt', exact: true }).click()
  await page.getByRole('button', { name: 'Pen colour #7f7f7f', exact: true }).click()
  expect(await style(page, '120', 'border-left-style')).toBe('dashed')
  expect(await style(page, '120', 'border-left-width')).toBe('3px')
  expect(await style(page, '120', 'border-left-color')).toBe('rgb(127, 127, 127)')
})

test('the Border Painter draws back a line the Eraser took out', async ({ page }) => {
  await page.getByRole('menuitem', { name: 'Table', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Eraser', exact: true }).click()
  const box = await cell(page, '120').boundingBox()
  if (!box) throw new Error('no cell')
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2)
  await expect(cell(page, '120')).toHaveAttribute('data-hidden-borders', 'right')
  await page.keyboard.press('Escape')

  await openDesign(page)
  await page.getByRole('button', { name: 'Border painter' }).click()
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2)
  await expect(page.locator('.trevixal-draw-guide[data-shape="paint"]')).toBeVisible()
  await page.mouse.down()
  await page.mouse.up()
  await expect(cell(page, '120')).not.toHaveAttribute('data-hidden-borders')
})

test('every choice is under the Table menu too, ticked while the table has it', async ({
  page,
}) => {
  await cell(page, 'North').click()
  await page.getByRole('menuitem', { name: 'Table', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Orange grid', exact: true }).click()
  expect(await style(page, 'Region', 'border-bottom-color')).toBe('rgb(184, 84, 24)')
  await page.getByRole('menuitem', { name: 'Table', exact: true }).click()
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Orange grid', exact: true }),
  ).toHaveAttribute('aria-checked', 'true')
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Header row', exact: true }),
  ).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('menuitemcheckbox', { name: 'Banded columns', exact: true }).click()
  expect(await style(page, 'North', 'background-color')).not.toBe('rgba(0, 0, 0, 0)')
})

test('one undo takes a style back', async ({ page }) => {
  await openDesign(page)
  await page.getByRole('button', { name: 'Blue header', exact: true }).click()
  await cell(page, 'North').click()
  await page.keyboard.press('ControlOrMeta+z')
  expect(await style(page, 'Region', 'color')).not.toBe('rgb(255, 255, 255)')
})
