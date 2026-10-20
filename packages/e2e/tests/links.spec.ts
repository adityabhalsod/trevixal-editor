import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '../../../examples/full-editor/dist')
const uiPage = `file://${join(here, '../page/ui.html')}`
const surface = '#editor .trevixal-content'

async function runMenuItem(page: Page, menu: string, item: string): Promise<void> {
  await page.click(`[data-trevixal-menu="${menu}"]`)
  await page.click(`[data-trevixal-menu="${menu}"] ~ * [data-trevixal-item="${item}"]`)
}

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })
/** A question the page asks before going on. */
const alert = (page: Page, name: string) => page.getByRole('alertdialog', { name })

/** Open the full editor on a new document of these paragraphs, typed. */
async function openWith(
  page: Page,
  lines: readonly string[],
): Promise<{ close: () => Promise<void> }> {
  const server = await serveDist(distDir)
  await page.goto(server.origin)
  await page.waitForSelector(surface)
  await runMenuItem(page, 'file', 'newDocument')
  await alert(page, 'New document').getByRole('button', { name: 'New document' }).click()
  await expect(page.locator(`${surface} > *`)).toHaveCount(1)
  await page.locator(`${surface} > p`).click()
  for (const [index, line] of lines.entries()) {
    if (index > 0) await page.keyboard.press('Enter')
    await page.keyboard.type(line)
  }
  await expect(page.locator(`${surface} > p`)).toHaveCount(lines.length)
  return server
}

/** Select a word, as a drag across it does. */
async function selectWord(page: Page, word: string): Promise<void> {
  await page
    .locator(surface)
    .getByText(word, { exact: false })
    .first()
    .evaluate((element, target) => {
      const node = [...element.childNodes].find(
        (child) => child.nodeType === Node.TEXT_NODE && child.textContent?.includes(target),
      )
      if (!node) throw new Error(`no text node with ${target}`)
      const start = node.textContent?.indexOf(target) ?? 0
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, start + target.length)
      const selection = document.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }, word)
  await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe(word)
}

/** Link the selected words to `href` through Insert ▸ Link…. */
async function linkSelection(page: Page, href: string): Promise<void> {
  await runMenuItem(page, 'insert', 'insertLink')
  const box = dialog(page, 'Insert link')
  await box.locator('[name="href"]').fill(href)
  await box.getByRole('button', { name: 'Apply' }).click()
  await expect(box).toHaveCount(0)
}

test('links words to any block, giving the block an id from its words', async ({ page }) => {
  const server = await openWith(page, ['Read the plan below.', 'Next steps for launch'])
  try {
    await selectWord(page, 'plan')
    await runMenuItem(page, 'insert', 'insertLink')
    const box = dialog(page, 'Insert link')
    await box.locator('[name="kind"]').selectOption('block')
    await box.locator('[name="block"]').selectOption({ label: 'Paragraph: Next steps for launch' })
    await box.getByRole('button', { name: 'Apply' }).click()

    const link = page.locator(`${surface} a[href="#next-steps-for-launch"]`)
    await expect(link).toHaveText('plan')
    await expect(page.locator(`${surface} p#next-steps-for-launch`)).toHaveText(
      'Next steps for launch',
    )
  } finally {
    await server.close()
  }
})

test('Check links lists a link that goes nowhere, and Go to selects it', async ({ page }) => {
  // The outside link is asked about with one HEAD request; answer it here,
  // so the check needs no network.
  const asked: string[] = []
  await page.route(
    (url) => url.hostname === 'example.com',
    async (route) => {
      asked.push(`${route.request().method()} ${route.request().url()}`)
      await route.fulfill({ status: 200, body: '' })
    },
  )
  const server = await openWith(page, ['Go to nowhere now.', 'Visit the site today.'])
  try {
    await selectWord(page, 'nowhere')
    await linkSelection(page, '#nowhere')
    await selectWord(page, 'site')
    await linkSelection(page, 'https://example.com/')

    await runMenuItem(page, 'tools', 'checkLinks')
    const report = dialog(page, 'Check links')
    await expect(report.getByRole('status')).toHaveText('2 links checked, 1 broken.')
    const items = report.locator('.trevixal-link-report__list > li')
    await expect(items).toHaveCount(1)
    await expect(items.first()).toContainText('“nowhere” → #nowhere')
    await expect(items.first()).toContainText('nothing in the document is called “nowhere”')
    expect(asked).toEqual(['HEAD https://example.com/'])

    await items.first().getByRole('button', { name: 'Go to' }).click()
    await expect(report).toHaveCount(0)
    await expect
      .poll(() => page.evaluate(() => document.getSelection()?.toString()))
      .toBe('nowhere')
  } finally {
    await server.close()
  }
})

test('warns before downloading a link that goes nowhere', async ({ page }) => {
  const server = await openWith(page, ['Go to nowhere now.'])
  try {
    await selectWord(page, 'nowhere')
    await linkSelection(page, '#nowhere')

    await runMenuItem(page, 'file', 'downloadHtml')
    const warning = alert(page, 'Links that go nowhere')
    await expect(warning).toContainText('One link points at nothing in this document')
    await warning.getByRole('button', { name: 'Review links' }).click()
    const report = dialog(page, 'Check links')
    await expect(report.locator('.trevixal-link-report__list > li')).toHaveCount(1)
    await report.getByRole('button', { name: 'Done' }).click()

    await runMenuItem(page, 'file', 'downloadHtml')
    const download = page.waitForEvent('download')
    await alert(page, 'Links that go nowhere')
      .getByRole('button', { name: 'Export anyway' })
      .click()
    expect((await download).suggestedFilename()).toMatch(/\.html$/)
  } finally {
    await server.close()
  }
})

test('links one document to another with [[, and lists what links back', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await runMenuItem(page, 'view', 'workspacePanel')
    const tabs = page.locator('.trevixal-tabs-bar__item')
    await expect(tabs).toHaveCount(1)
    // Named after the tour's heading, which it follows.
    await expect(tabs.first()).toContainText('Trevixal')

    // A second document, from the Blank template.
    await page.locator('.trevixal-tabs-bar__new').click()
    await page.locator('[data-menu-item="template:blank"]').click()
    await expect(tabs).toHaveCount(2)
    await page.locator(surface).click()
    await page.keyboard.type('Launch notes')
    await page.keyboard.press('Enter')
    await page.keyboard.type('See [[Trev')

    const popup = page.locator('.trevixal-popup:not([hidden])')
    await expect(popup.getByRole('option')).toHaveText(['Trevixal'])
    await page.keyboard.press('Enter')
    const link = page.locator(`${surface} .trevixal-wikilink`)
    await expect(link).toHaveText('Trevixal')
    await expect(popup).toHaveCount(0)
    const backlinks = page.locator('.trevixal-backlinks')
    await expect(backlinks.locator('.trevixal-backlinks__empty')).toBeVisible()

    // A click on the link opens the document it names; that document lists
    // this one as linking to it.
    await link.click()
    await expect(page.locator(`${surface} h1`).first()).toHaveText('Trevixal')
    const item = backlinks.getByRole('button', { name: 'Launch notes' })
    await expect(item).toBeVisible()
    await item.click()
    await expect(page.locator(`${surface} .trevixal-wikilink`)).toHaveText('Trevixal')
  } finally {
    await server.close()
  }
})

test('a pasted address takes its page’s title and keeps pointing there', async ({
  page,
  browserName,
}) => {
  // Firefox drops `clipboardData` from a constructed ClipboardEvent.
  test.skip(browserName === 'firefox', 'Firefox ignores constructed clipboardData')
  await page.goto(uiPage)
  await page.locator(surface).click()
  await page.keyboard.type('See ')
  await page.evaluate(() => {
    const data = new DataTransfer()
    data.setData('text/plain', 'https://example.com/docs')
    const target = document.querySelector('#editor .trevixal-content') as HTMLElement
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    )
  })
  const link = page.locator(`${surface} a[href="https://example.com/docs"]`)
  await expect(link).toHaveText('Page at example.com')
})
