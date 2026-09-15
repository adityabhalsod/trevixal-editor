import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const pageUrl = `file://${join(dirname(fileURLToPath(import.meta.url)), '../page/ui.html')}`
const surface = '#editor .trevixal-content'

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl)
})

test('the menubar and toolbar render the full control set', async ({ page }) => {
  // Six, not eight: this page supplies no viewActions, so the View and Help
  // menus are pruned rather than rendered with every entry greyed out.
  await expect(page.locator('.trevixal-menubar__trigger')).toHaveCount(6)
  const groups = page.locator('.trevixal-toolbar__group')
  expect(await groups.count()).toBeGreaterThanOrEqual(8)
  // The three selects, two color pickers and the table grid.
  await expect(page.locator('[data-trevixal-item="blockFormat"]')).toBeVisible()
  await expect(page.locator('[data-trevixal-item="fontFamily"]')).toBeVisible()
  await expect(page.locator('[data-trevixal-item="fontSize"]')).toBeVisible()
  await expect(page.locator('[data-trevixal-item="textColor"]')).toBeVisible()
  await expect(page.locator('[data-trevixal-item="table"]')).toBeVisible()
  await expect(page.locator('.trevixal-statusbar')).toBeVisible()
})

test('a menu opens, runs a command, and closes', async ({ page }) => {
  await page.locator(surface).click()
  await page.keyboard.type('menu driven')
  await page.keyboard.press('Control+a')

  await page.click('[data-trevixal-menu="format"]')
  const panel = page.locator('[data-trevixal-menu="format"] ~ .trevixal-dropdown__panel')
  await expect(panel).toBeVisible()
  await panel.locator('[data-trevixal-item="bold"]').click()

  await expect(page.locator(`${surface} strong`)).toHaveText('menu driven')
  await expect(panel).toBeHidden()
})

test('the block format select changes the block and reflects it', async ({ page }) => {
  await page.locator(surface).click()
  await page.keyboard.type('A title')

  const select = page.locator('[data-trevixal-item="blockFormat"]')
  await select.locator('.trevixal-dropdown__trigger').click()
  await select.locator('[data-value="heading:2"]').click()

  await expect(page.locator(`${surface} h2`)).toHaveText('A title')
  await expect(select.locator('.trevixal-select__label')).toHaveText('Heading 2')
})

test('font size and text color apply to the selection', async ({ page }) => {
  await page.locator(surface).click()
  await page.keyboard.type('styled text')
  await page.keyboard.press('Control+a')

  const size = page.locator('[data-trevixal-item="fontSize"]')
  await size.locator('.trevixal-dropdown__trigger').click()
  await size.locator('[data-value="24pt"]').click()
  await expect(page.locator(`${surface} span[style*="font-size: 24pt"]`)).toHaveCount(1)

  const color = page.locator('[data-trevixal-item="textColor"]')
  await color.locator('.trevixal-dropdown__trigger').click()
  await color.locator('[data-color="#2563eb"]').click()
  await expect(page.locator(`${surface} span[style*="#2563eb"]`)).toHaveCount(1)
})

test('alignment and indent apply to the current block', async ({ page }) => {
  await page.locator(surface).click()
  await page.keyboard.type('centre me')
  await page.click('.trevixal-toolbar [data-trevixal-item="align-center"]')
  await expect(page.locator(`${surface} p[style*="text-align: center"]`)).toHaveCount(1)

  await page.click('.trevixal-toolbar [data-trevixal-item="indent"]')
  await expect(page.locator(`${surface} p[style*="margin-left"]`)).toHaveCount(1)
  await page.click('.trevixal-toolbar [data-trevixal-item="outdent"]')
  await expect(page.locator(`${surface} p[style*="margin-left"]`)).toHaveCount(0)
})

test('the table grid inserts a table of the hovered size', async ({ page }) => {
  await page.locator(surface).click()
  await page.keyboard.type('before table')

  const grid = page.locator('[data-trevixal-item="table"]')
  await grid.locator('.trevixal-dropdown__trigger').click()
  await grid.locator('[data-row="3"][data-col="4"]').hover()
  await expect(grid.locator('.trevixal-tablegrid__readout')).toHaveText('3 × 4')
  await grid.locator('[data-row="3"][data-col="4"]').click()

  await expect(page.locator(`${surface} table`)).toHaveCount(1)
  await expect(page.locator(`${surface} table tr`)).toHaveCount(3)
  await expect(page.locator(`${surface} table tr`).first().locator('td, th')).toHaveCount(4)
})

test('the link dialog applies a link to the selection', async ({ page }) => {
  await page.locator(surface).click()
  await page.keyboard.type('link me')
  await page.keyboard.press('Control+a')
  await page.click('.trevixal-toolbar [data-trevixal-item="link"]')

  const dialog = page.locator('.trevixal-dialog')
  await expect(dialog).toBeVisible()
  await dialog.locator('input[name="href"]').fill('https://example.com')
  await dialog.locator('button[type="submit"]').click()

  await expect(dialog).toBeHidden()
  await expect(page.locator(`${surface} a[href="https://example.com"]`)).toHaveText('link me')
})

test('the special character picker inserts a glyph', async ({ page }) => {
  await page.locator(surface).click()
  await page.keyboard.type('copyright ')
  await page.click('[data-trevixal-menu="insert"]')
  await page.click('[data-trevixal-item="insertSpecialChar"]')
  await page.locator('.trevixal-charpicker__item').first().click()
  await expect(page.locator(`${surface} p`)).toHaveText('copyright ©')
})

test('images upload and land in the document with progress reported', async ({ page }) => {
  await page.locator(surface).click()
  await page.keyboard.type('with an image')

  await page.evaluate(async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })
    await window.uiPage.upload([file])
  })

  await expect(page.locator(`${surface} img`)).toHaveCount(1)
  await expect(page.locator(`${surface} img`)).toHaveAttribute(
    'src',
    'https://cdn.example/photo.png',
  )
  await expect(page.locator('#upload-status')).toHaveText('done:photo.png')
})

test('the status bar tracks counts and the element path', async ({ page }) => {
  await page.locator(surface).click()
  await page.keyboard.type('four little words here')
  await expect(page.locator('.trevixal-statusbar__counts')).toContainText('4 words')
  await page.keyboard.press('Control+a')
  await page.click('.trevixal-toolbar [data-trevixal-item="bold"]')
  await expect(page.locator('.trevixal-statusbar__path')).toContainText('bold')
})

test('clear formatting strips every mark', async ({ page }) => {
  await page.locator(surface).click()
  await page.keyboard.type('messy text')
  await page.keyboard.press('Control+a')
  await page.click('.trevixal-toolbar [data-trevixal-item="bold"]')
  await page.click('.trevixal-toolbar [data-trevixal-item="italic"]')
  await expect(page.locator(`${surface} strong`)).toHaveCount(1)

  await page.click('.trevixal-toolbar [data-trevixal-item="clearFormatting"]')
  await expect(page.locator(`${surface} strong`)).toHaveCount(0)
  await expect(page.locator(`${surface} em`)).toHaveCount(0)
  await expect(page.locator(`${surface} p`)).toHaveText('messy text')
})
