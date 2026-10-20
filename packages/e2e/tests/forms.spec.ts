import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '../../../examples/full-editor/dist')
const surface = '#editor .trevixal-content'

async function runMenuItem(page: Page, menu: string, item: string): Promise<void> {
  await page.click(`[data-trevixal-menu="${menu}"]`)
  await page.click(`[data-trevixal-menu="${menu}"] ~ * [data-trevixal-item="${item}"]`)
}

/** A letter with a text box for the client and a tick box. */
async function openLetter(page: Page): Promise<{ close: () => Promise<void> }> {
  const server = await serveDist(distDir)
  await page.goto(server.origin)
  await page.waitForSelector(surface)
  await runMenuItem(page, 'file', 'newDocument')
  await page
    .getByRole('alertdialog', { name: 'New document' })
    .getByRole('button', { name: 'New document' })
    .click()
  await page.locator(`${surface} > p`).click()
  await page.keyboard.type('Dear ')
  await runMenuItem(page, 'insert', 'formText')
  const text = page.getByRole('dialog', { name: 'Text box' })
  await text.locator('[name="name"]').fill('client')
  await text.locator('[name="label"]').fill('Client name')
  await text.getByRole('button', { name: 'Insert' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Agreed ')
  await runMenuItem(page, 'insert', 'formCheckbox')
  const tick = page.getByRole('dialog', { name: 'Tick box' })
  await tick.locator('[name="name"]').fill('agree')
  await tick.getByRole('button', { name: 'Insert' }).click()
  await expect(page.locator(`${surface} [data-form-field]`)).toHaveCount(2)
  // End and Enter after a field that ends the line break the line there.
  await expect(page.locator(`${surface} > p`)).toHaveText(['Dear Client name', 'Agreed ☐'])
  return server
}

test('fills in fields in the text, and writes them as a fillable PDF', async ({ page }) => {
  const server = await openLetter(page)
  try {
    const client = page.locator(`${surface} [data-name="client"]`)
    await expect(client).toHaveText('Client name')
    await client.click()
    const fill = page.getByRole('dialog', { name: 'Client name' })
    await fill.locator('[name="value"]').fill('Ada Lovelace')
    await fill.getByRole('button', { name: 'Fill in' }).click()
    await expect(client).toHaveText('Ada Lovelace')
    const agree = page.locator(`${surface} [data-name="agree"]`)
    await agree.click()
    await expect(agree).toHaveAttribute('aria-checked', 'true')
    // From the keyboard: select the field, and Space clears it again.
    const agreed = page.locator(`${surface} > p`, { hasText: 'Agreed' })
    await agreed.click({ position: { x: 4, y: 4 } })
    await page.keyboard.press('End')
    await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('Space')
    await expect(agree).toHaveAttribute('aria-checked', 'false')
    await expect(agreed).toHaveText('Agreed ☐')
    await page.keyboard.press('Space')
    await expect(agree).toHaveAttribute('aria-checked', 'true')

    const pending = page.waitForEvent('download')
    await runMenuItem(page, 'file', 'downloadPdfForm')
    const download = await pending
    expect(download.suggestedFilename()).toMatch(/\.pdf$/)
    const pdf = (await readFile((await download.path()) as string)).toString('latin1')
    expect(pdf.startsWith('%PDF-1.7')).toBe(true)
    expect(pdf).toContain('/AcroForm')
    expect(pdf).toContain('/T (client)')
    expect(pdf).toContain('/V (Ada Lovelace)')
    expect(pdf).toContain('/FT /Btn /V /Yes')
  } finally {
    await server.close()
  }
})

test('types after a field that ends the line, not where the caret was before', async ({ page }) => {
  const server = await openLetter(page)
  try {
    // End puts Chromium's and Firefox's caret inside the field when it ends the line.
    const agreed = page.locator(`${surface} > p`, { hasText: 'Agreed' })
    await agreed.click({ position: { x: 4, y: 4 } })
    await page.keyboard.press('End')
    await page.keyboard.type(' today')
    await expect(agreed).toHaveText('Agreed ☐ today')
  } finally {
    await server.close()
  }
})

test('says why a field name is not one, rather than inserting nothing', async ({ page }) => {
  const server = await openLetter(page)
  try {
    await runMenuItem(page, 'insert', 'formText')
    const text = page.getByRole('dialog', { name: 'Text box' })
    await text.locator('[name="name"]').fill('client name')
    await text.getByRole('button', { name: 'Insert' }).click()
    await expect(page.getByRole('dialog', { name: 'Not a field name' })).toContainText(
      'client name',
    )
    await expect(page.locator(`${surface} [data-form-field]`)).toHaveCount(2)
  } finally {
    await server.close()
  }
})

test('merges a CSV into a letter a row, downloaded together', async ({ page }) => {
  const server = await openLetter(page)
  try {
    const chooser = page.waitForEvent('filechooser')
    await runMenuItem(page, 'tools', 'mailMerge')
    await (await chooser).setFiles({
      name: 'clients.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('client,agree\nAda Lovelace,true\n"Sam, Jr.",false\n'),
    })
    const dialog = page.getByRole('dialog', { name: 'Mail merge' })
    await expect(dialog).toContainText('2 rows')
    await dialog.locator('[name="format"]').selectOption('markdown')
    const pending = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Merge' }).click()
    const download = await pending
    expect(download.suggestedFilename()).toBe('mail-merge.zip')
    const zip = (await readFile((await download.path()) as string)).toString('utf8')
    expect(zip).toContain('ada-lovelace.md')
    expect(zip).toContain('sam-jr.md')
    expect(zip).toContain('Dear Ada Lovelace')
    expect(zip).toContain('Dear Sam, Jr.')
    expect(zip).toContain('Agreed ☒')
    expect(zip).toContain('Agreed ☐')
  } finally {
    await server.close()
  }
})
