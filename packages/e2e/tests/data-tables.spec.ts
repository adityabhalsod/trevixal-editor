import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const here = dirname(fileURLToPath(import.meta.url))
const pageUrl = `file://${join(here, '../page/ui.html')}`
const distDir = join(here, '../../../examples/full-editor/dist')

/** Table, then each entry named: a submenu's trigger, or the entry itself, a tickable one included. */
async function tableMenu(page: Page, ...path: string[]): Promise<void> {
  await page.getByRole('menuitem', { name: 'Table', exact: true }).click()
  for (const entry of path) {
    await page
      .getByRole('menuitem', { name: entry, exact: true })
      .or(page.getByRole('menuitemcheckbox', { name: entry, exact: true }))
      .click()
  }
}

const field = (page: Page, name: string) => page.locator(`.trevixal-dialog [name="${name}"]`)

function cellNamed(page: Page, text: string) {
  return page.locator('.trevixal-content td, .trevixal-content th').getByText(text, { exact: true })
}

/** The rendered table's visible cells as rows of text. */
function visibleGrid(page: Page): Promise<string[][]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLTableRowElement>('.trevixal-content table tr')]
      .filter((tr) => getComputedStyle(tr).display !== 'none')
      .map((tr) =>
        [...tr.querySelectorAll<HTMLElement>('td, th')]
          .filter((cell) => getComputedStyle(cell).display !== 'none')
          .map((cell) => cell.textContent ?? ''),
      ),
  )
}

test.describe('a table as data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(pageUrl)
    await page.evaluate(() => {
      const text = (value: string) => (value ? [{ type: 'text', text: value }] : [])
      const cell = (value: string, header = false) => ({
        type: 'tableCell',
        attrs: { header },
        content: [{ type: 'paragraph', content: text(value) }],
      })
      const row = (...cells: unknown[]) => ({ type: 'tableRow', content: cells })
      window.uiPage.editor.setContent({
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              row(cell('Item', true), cell('Cost', true), cell('Paid', true)),
              row(cell('Hall'), cell('1200'), cell('yes')),
              row(cell('Catering'), cell('2640'), cell('no')),
              row(cell('Lights'), cell('780'), cell('yes')),
              row(cell('Total'), cell(''), cell('')),
            ],
          },
          { type: 'paragraph', content: text('after') },
        ],
      } as never)
    })
  })

  test('works out a formula from the dialog, and again when a value changes', async ({ page }) => {
    const total = page.locator('.trevixal-content tr').nth(4).locator('td').nth(1)
    await total.click()
    await tableMenu(page, 'Formula…')
    await expect(field(page, 'expression')).toHaveValue('=SUM(ABOVE)')
    await field(page, 'format').selectOption('#,##0.00')
    await page.getByRole('button', { name: 'Insert', exact: true }).click()
    await expect(total).toHaveText('4,620.00')

    await cellNamed(page, '780').click()
    await page.keyboard.press('End')
    await page.keyboard.type('0')
    await expect(total).toHaveText('11,640.00')
  })

  test('types a column: currency lines up on the right, as money', async ({ page }) => {
    await cellNamed(page, '1200').click()
    await tableMenu(page, 'Currency')
    await expect(cellNamed(page, '$1,200.00')).toBeVisible()
    const align = await cellNamed(page, '$1,200.00').evaluate(
      (element) => getComputedStyle(element.closest('td') as HTMLElement).textAlign,
    )
    expect(['right', 'end']).toContain(align)
  })

  test('turns a column into checkboxes a click ticks', async ({ page }) => {
    await cellNamed(page, 'yes').first().click()
    await tableMenu(page, 'Checkbox')
    const paid = page.locator('.trevixal-content tr').nth(2).locator('td').nth(2)
    await expect(paid).not.toHaveAttribute('data-checked')
    const box = await paid.boundingBox()
    if (!box) throw new Error('no cell')
    await page.mouse.click(box.x + 14, box.y + box.height / 2)
    await expect(paid).toHaveAttribute('data-checked', '')
  })

  test('filters rows without deleting them, and shows them all again', async ({ page }) => {
    await cellNamed(page, 'Hall').click()
    await tableMenu(page, 'Filter rows…')
    await field(page, 'column').selectOption({ label: 'B: Cost' })
    await field(page, 'condition').selectOption('greater')
    await field(page, 'value').fill('1000')
    await page.getByRole('button', { name: 'Filter', exact: true }).click()
    expect((await visibleGrid(page)).map((line) => line[0])).toEqual(['Item', 'Hall', 'Catering'])
    await tableMenu(page, 'Show all rows')
    expect(await visibleGrid(page)).toHaveLength(5)
  })

  test('hides a column and brings it back', async ({ page }) => {
    await cellNamed(page, '1200').click()
    await tableMenu(page, 'Hide column')
    expect((await visibleGrid(page))[0]).toEqual(['Item', 'Paid'])
    await tableMenu(page, 'Show hidden columns')
    expect((await visibleGrid(page))[0]).toEqual(['Item', 'Cost', 'Paid'])
  })

  test('draws the table as a chart after it', async ({ page }) => {
    await cellNamed(page, 'Hall').click()
    await tableMenu(page, 'Bar chart')
    const code = page.locator('.trevixal-content > pre')
    await expect(code).toContainText('xychart-beta')
    await expect(code).toContainText('bar [1200, 2640, 780]')
  })
})

test('the tour’s budget adds itself up', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    const total = page.locator('#editor .trevixal-formula').first()
    await expect(total).toHaveText('5,843.00')
    const insurance = page.locator('#editor td').getByText('140.00', { exact: true })
    await insurance.click()
    await page.keyboard.press('End')
    for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace')
    await page.keyboard.type('240')
    await expect(total).toHaveText('5,943.00')
  } finally {
    await server.close()
  }
})
