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

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })

/** The full editor on a new document of these paragraphs, typed. */
async function openWith(
  page: Page,
  lines: readonly string[],
): Promise<{ close: () => Promise<void> }> {
  const server = await serveDist(distDir)
  await page.goto(server.origin)
  await page.waitForSelector(surface)
  await runMenuItem(page, 'file', 'newDocument')
  await page
    .getByRole('alertdialog', { name: 'New document' })
    .getByRole('button', { name: 'New document' })
    .click()
  await page.locator(`${surface} > p`).click()
  for (const [index, line] of lines.entries()) {
    if (index > 0) await page.keyboard.press('Enter')
    await page.keyboard.type(line)
  }
  return server
}

/** Open a file through File ▸ Open…. */
async function openFile(
  page: Page,
  name: string,
  body: string,
  mimeType = 'text/html',
): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await runMenuItem(page, 'file', 'openDocument')
  await (await chooser).setFiles({ name, mimeType, buffer: Buffer.from(body) })
}

test('accepts every suggestion by one reviewer, and leaves the others', async ({ page }) => {
  const server = await openWith(page, ['placeholder'])
  try {
    await openFile(
      page,
      'reviewed.html',
      '<p>Plan <ins data-trevixal-author="Priya" data-trevixal-timestamp="1">now</ins> and <ins data-trevixal-author="Sam" data-trevixal-timestamp="2">later</ins><del data-trevixal-author="Priya" data-trevixal-timestamp="3"> soon</del>.</p>',
    )
    await expect(page.locator(`${surface} ins`)).toHaveCount(2)
    const authors = page.locator('.trevixal-trackchanges__authors')
    await expect(authors).toBeVisible()
    await authors.selectOption({ label: 'By Priya' })
    const accept = page.locator('.trevixal-trackchanges__accept-all')
    await expect(accept).toHaveText('Accept Priya’s')
    await accept.click()
    await expect(page.locator(`${surface} > p`)).toHaveText('Plan now and later.')
    // Sam's is still a suggestion, and the only one.
    await expect(page.locator(`${surface} ins`)).toHaveText('later')
    await expect(page.locator(`${surface} del`)).toHaveCount(0)
    await expect(authors).toBeHidden()
  } finally {
    await server.close()
  }
})

test('saves a named version and compares it with the document now, and two versions', async ({
  page,
}) => {
  const server = await openWith(page, ['The first draft of the plan.'])
  try {
    await runMenuItem(page, 'file', 'saveVersion')
    const naming = dialog(page, 'Save version')
    await naming.locator('[name="name"]').fill('Draft 1')
    await naming.getByRole('button', { name: 'Save' }).click()

    await page.locator(`${surface} > p`).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Now with dates.')
    await runMenuItem(page, 'file', 'documentBackups')
    const versions = dialog(page, 'Backups')
    const version = versions.locator('.trevixal-backups__item--version')
    await expect(version).toContainText('Draft 1:')
    await version.getByRole('button', { name: 'Compare with now' }).click()
    const comparison = dialog(page, 'Compare versions')
    await expect(comparison.getByRole('status')).toHaveText('1 changed, 0 added, 0 removed.')
    await expect(comparison.locator('.trevixal-compare__cell--after ins')).toContainText(
      'Now with dates.',
    )
    await comparison.getByRole('button', { name: 'Close' }).click()

    // A second version from the dialog itself, and the two compared.
    await versions.locator('[name="versionName"]').fill('Draft 2')
    await versions.getByRole('button', { name: 'Save version' }).click()
    await expect(versions.locator('.trevixal-backups__item--version')).toHaveCount(2)
    for (const item of await versions.locator('.trevixal-backups__item--version').all()) {
      await item.locator('input[type="checkbox"]').check()
    }
    await versions.getByRole('button', { name: 'Compare the two' }).click()
    const both = dialog(page, 'Compare versions')
    await expect(both.locator('.trevixal-compare__head').first()).toContainText('Draft 1')
    await expect(both.locator('.trevixal-compare__head').nth(1)).toContainText('Draft 2')
    await expect(both.getByRole('status')).toHaveText('1 changed, 0 added, 0 removed.')
  } finally {
    await server.close()
  }
})

test('compares the document with a file, side by side', async ({ page }) => {
  const server = await openWith(page, ['Same line.', 'Old words here.'])
  try {
    const chooser = page.waitForEvent('filechooser')
    await runMenuItem(page, 'tools', 'compareDocuments')
    await (await chooser).setFiles({
      name: 'other.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('Same line.\n\nNew words here.\n\nAn extra line.\n'),
    })
    const comparison = dialog(page, 'Compare with a file')
    await expect(comparison.getByRole('status')).toHaveText('1 changed, 1 added, 0 removed.')
    await expect(comparison.locator('.trevixal-compare__head').nth(1)).toHaveText('other.md')
    await expect(comparison.locator('del')).toHaveText('Old')
    await expect(comparison.locator('.trevixal-compare__cell--after ins')).toHaveText('New')
    // The unchanged line is there when asked for.
    const same = comparison.locator('.trevixal-compare__row--same')
    await expect(same).toBeHidden()
    await comparison.getByLabel('Show the blocks that did not change').check()
    await expect(same.locator('.trevixal-compare__cell--before')).toHaveText('Same line.')
    // The tick box, the table and the button stand apart, not touching.
    const gaps = await comparison.evaluate((element) => {
      const box = (selector: string): DOMRect =>
        (element.querySelector(selector) as HTMLElement).getBoundingClientRect()
      const grid = box('.trevixal-compare__grid')
      return [
        grid.top - box('.trevixal-dialog__field--inline').bottom,
        box('.trevixal-dialog__actions').top - grid.bottom,
      ]
    })
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(6)
  } finally {
    await server.close()
  }
})

test('clips a web page’s article in from its address', async ({ page }) => {
  await page.route('https://news.test/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: { 'access-control-allow-origin': '*' },
      body: '<html><head><title>Big news</title></head><body><nav>Menu</nav><article><h1>Owls return</h1><p>They came <a href="/owls">back</a>.</p></article><footer>Footer</footer></body></html>',
    }),
  )
  const server = await openWith(page, ['Clippings:'])
  try {
    await runMenuItem(page, 'file', 'importFromUrl')
    const box = dialog(page, 'Import from a web address')
    await box.locator('[name="url"]').fill('https://news.test/2026/owls')
    await box.getByRole('button', { name: 'Import' }).click()
    await expect(page.locator(`${surface} h1`)).toHaveText('Owls return')
    await expect(page.locator(`${surface} a[href="https://news.test/owls"]`)).toHaveText('back')
    await expect(page.locator(surface)).toContainText('Clipped from news.test')
    await expect(page.locator(surface)).not.toContainText('Menu')
    await expect(page.locator(surface)).not.toContainText('Footer')
  } finally {
    await server.close()
  }
})

test('includes another document, kept in step as it changes', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await runMenuItem(page, 'view', 'workspacePanel')
    const tabs = page.locator('.trevixal-tabs-bar__item')
    await expect(tabs).toHaveCount(1)
    // A second document to include: its first line is its title.
    await page.locator('.trevixal-tabs-bar__new').click()
    await page.locator('[data-menu-item="template:blank"]').click()
    await expect(tabs).toHaveCount(2)
    await page.locator(surface).click()
    await page.keyboard.type('Shared terms')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Payment is due in 30 days.')

    // Back in the first, include the second at the end.
    await tabs.first().locator('.trevixal-tabs-bar__title').click()
    await expect(page.locator(`${surface} h1`).first()).toHaveText('Trevixal')
    await page.locator(`${surface} > p`).first().click()
    await runMenuItem(page, 'insert', 'insertTransclusion')
    const box = dialog(page, 'Include from workspace')
    // The whole of the document whose title starts with its first words.
    const choice = box.locator('[name="source"] option', { hasText: 'Shared terms' }).first()
    await box.locator('[name="source"]').selectOption((await choice.getAttribute('value')) ?? '')
    await box.getByRole('button', { name: 'Include' }).click()
    const inclusion = page.locator(`${surface} .trevixal-transclusion`)
    await expect(inclusion).toContainText('Included from Shared terms')
    await expect(inclusion.locator('.trevixal-transclusion__body')).toContainText(
      'Payment is due in 30 days.',
    )

    // Change the source: the inclusion follows once it is saved.
    await inclusion.getByRole('button', { name: 'Open' }).click()
    const terms = page.locator(surface).getByText('Payment is due in 30 days.')
    await expect(terms).toBeVisible()
    await terms.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Backspace')
    await page.keyboard.type(', or 60 on request.')
    await tabs.first().locator('.trevixal-tabs-bar__title').click()
    await expect(page.locator(`${surface} .trevixal-transclusion__body`)).toContainText(
      'Payment is due in 30 days, or 60 on request.',
    )
  } finally {
    await server.close()
  }
})
