import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '../../../examples/full-editor/dist')
const surface = '#editor .trevixal-content'
const REDACTED = '█████'
const PASSWORD = 'correct horse battery'

async function runMenuItem(page: Page, menu: string, item: string): Promise<void> {
  await page.click(`[data-trevixal-menu="${menu}"]`)
  await page.click(`[data-trevixal-menu="${menu}"] ~ * [data-trevixal-item="${item}"]`)
}

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

async function protectWithPassword(page: Page): Promise<void> {
  await runMenuItem(page, 'file', 'protectDocument')
  const dialog = page.locator('.trevixal-dialog')
  await dialog.locator('[name="password"]').fill(PASSWORD)
  await dialog.locator('[name="confirm"]').fill(PASSWORD)
  await dialog.locator('.trevixal-dialog__button--primary').click()
  await expect(page.locator('#security')).toContainText('Password-protected')
}

/** The body text of the print preview, closed again once read. */
async function printPreviewText(page: Page): Promise<string> {
  await runMenuItem(page, 'file', 'printPreview')
  const preview = page.getByRole('dialog', { name: 'Print preview' })
  const body = page.frameLocator('.trevixal-print-preview__frame').locator('body')
  await expect(body).not.toBeEmpty()
  const text = await body.innerText()
  await preview.getByRole('button', { name: 'Close' }).click()
  return text
}

test('blacks out words, and copies, prints and downloads only a stand-in for them', async ({
  page,
}) => {
  const server = await openWith(page, ['Pay Sam Jones the bonus now.'])
  try {
    await page.keyboard.press('Home')
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
    for (let i = 0; i < 9; i++) await page.keyboard.press('Shift+ArrowRight')
    await runMenuItem(page, 'tools', 'redactSelection')
    const bar = page.locator(`${surface} .trevixal-redacted`)
    await expect(bar).toHaveText('Sam Jones')
    // The words are there for the author, but not to be read off the screen.
    expect(await bar.evaluate((element) => getComputedStyle(element).color)).toBe(
      'rgba(0, 0, 0, 0)',
    )

    // What reaches the clipboard is read in a listener that runs after the
    // editor's own, as a paste would find it.
    await page.evaluate(() => {
      window.addEventListener('copy', (event) => {
        document.body.dataset.copied = event.clipboardData?.getData('text/plain') ?? ''
      })
    })
    await page.locator(`${surface} > p`).click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await page.keyboard.press('Control+c')
    await expect(page.locator('body')).toHaveAttribute(
      'data-copied',
      `Pay ${REDACTED} the bonus now.`,
    )

    const pending = page.waitForEvent('download')
    await runMenuItem(page, 'file', 'downloadMarkdown')
    const markdown = await readFile((await (await pending).path()) as string, 'utf8')
    expect(markdown).toContain(`Pay ${REDACTED} the bonus now.`)
    expect(markdown).not.toContain('Sam Jones')

    const printed = await printPreviewText(page)
    expect(printed).toContain(REDACTED)
    expect(printed).not.toContain('Sam Jones')
  } finally {
    await server.close()
  }
})

test('keeps a locked section as it is until it is unlocked, the rest still editable', async ({
  page,
}) => {
  const server = await openWith(page, ['Intro line.', 'Terms of the deal.', 'Outro line.'])
  try {
    await page.locator(`${surface} > p`).nth(1).click()
    await runMenuItem(page, 'tools', 'lockSection')
    const section = page.locator(`${surface} section.trevixal-locked-section`)
    await expect(section).toHaveText('Terms of the deal.')
    await expect(section).toHaveAttribute('contenteditable', 'false')

    // Deleting everything would take the section with it, so nothing goes.
    await page.locator(`${surface} > p`).first().click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await expect(page.locator(surface)).toContainText('Intro line.')
    await expect(section).toHaveText('Terms of the deal.')
    await expect(page.locator('#security')).toContainText('That section is locked')

    await page.locator(`${surface} > p`).last().click()
    await page.keyboard.press('End')
    await page.keyboard.type(' The end.')
    await expect(page.locator(`${surface} > p`).last()).toHaveText('Outro line. The end.')

    await runMenuItem(page, 'tools', 'lockedSections')
    const dialog = page.getByRole('dialog', { name: 'Locked sections' })
    await expect(dialog.locator('[name="section"]')).toContainText('Terms of the deal.')
    await dialog.getByRole('button', { name: 'Unlock' }).click()
    await expect(section).toHaveCount(0)
    await page.locator(`${surface} > p`).nth(1).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Agreed.')
    await expect(page.locator(`${surface} > p`).nth(1)).toHaveText('Terms of the deal. Agreed.')
  } finally {
    await server.close()
  }
})

test('prints a protected document under a watermark, and locks it when asked or left idle', async ({
  page,
}) => {
  await page.clock.install()
  const server = await openWith(page, ['Board minutes for the quarter.'])
  try {
    await protectWithPassword(page)
    const printed = await printPreviewText(page)
    expect(printed).toContain('Protected · printed')

    const lockScreen = page.getByRole('dialog', { name: 'Document locked' })
    await runMenuItem(page, 'file', 'lockNow')
    await expect(lockScreen).toBeVisible()
    await expect(page.locator(surface)).toBeHidden()
    await lockScreen.locator('[name="password"]').fill('wrong')
    await lockScreen.getByRole('button', { name: 'Unlock' }).click()
    await expect(lockScreen.getByRole('alert')).toHaveText('That is not the password.')
    await lockScreen.locator('[name="password"]').fill(PASSWORD)
    await lockScreen.getByRole('button', { name: 'Unlock' }).click()
    await expect(lockScreen).toHaveCount(0)
    await expect(page.locator(surface)).toBeVisible()

    // Ten minutes with nothing typed, clicked or scrolled.
    await page.clock.fastForward('10:30')
    await expect(lockScreen).toBeVisible()
    await lockScreen.locator('[name="password"]').fill(PASSWORD)
    await lockScreen.getByRole('button', { name: 'Unlock' }).click()
    await expect(page.locator(surface)).toBeVisible()
  } finally {
    await server.close()
  }
})
