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

test('comments on a selection, replies, resolves, and keeps the thread in the file', async ({
  page,
}) => {
  const server = await openWith(page, ['The budget is final.'])
  try {
    await page.keyboard.press('Home')
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight')
    await runMenuItem(page, 'insert', 'insertComment')
    const dialog = page.getByRole('dialog', { name: 'Comment' })
    await dialog.locator('[name="text"]').fill('Is this approved?')
    await dialog.getByRole('button', { name: 'Comment' }).click()

    await expect(page.locator(`${surface} .trevixal-comment`)).toHaveText('budget')
    const panel = page.locator('#comments')
    await expect(panel).toBeVisible()
    const thread = panel.locator('.trevixal-comments__thread')
    await expect(thread.locator('.trevixal-comments__quote')).toHaveText('“budget”')
    await expect(thread.locator('.trevixal-comments__text')).toHaveText(['Is this approved?'])

    await thread.getByRole('textbox', { name: 'Reply' }).fill('Yes, on Monday.')
    await thread.getByRole('button', { name: 'Reply' }).click()
    await expect(thread.locator('.trevixal-comments__text')).toHaveText([
      'Is this approved?',
      'Yes, on Monday.',
    ])
    await expect(thread.getByRole('textbox', { name: 'Reply' })).toHaveValue('')

    // The quote takes the reader to the text it is about.
    await page.locator(`${surface} > p`).click()
    await thread.locator('.trevixal-comments__quote').click()
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('budget')

    // A Word download carries the thread as a Word comment.
    const pending = page.waitForEvent('download')
    await runMenuItem(page, 'file', 'downloadDocx')
    const docx = await readFile((await (await pending).path()) as string)
    expect(docx.includes('word/comments.xml')).toBe(true)
    expect(docx.includes('Is this approved?')).toBe(true)
    expect(docx.includes('Yes, on Monday.')).toBe(true)

    await thread.getByRole('button', { name: 'Resolve' }).click()
    await expect(thread).toHaveClass(/trevixal-comments__thread--resolved/)
    const highlight = await page
      .locator(`${surface} .trevixal-comment`)
      .evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(highlight).toBe('rgba(0, 0, 0, 0)')

    // Saved with the document: the draft holds the thread beside the text.
    await expect(page.locator('.trevixal-autosave')).toHaveAttribute('data-status', 'saved', {
      timeout: 15000,
    })
    const draft = JSON.parse(
      (await page.evaluate(() =>
        window.localStorage.getItem('trevixal:autosave:document:draft'),
      )) ?? '{}',
    )
    const threads = JSON.parse(draft.doc?.attrs?.comments ?? draft.attrs?.comments ?? '[]')
    expect(threads).toMatchObject([
      { resolved: true, comments: [{ text: 'Is this approved?' }, { text: 'Yes, on Monday.' }] },
    ])
  } finally {
    await server.close()
  }
})

test('asks for a selection before commenting, by menu or by Ctrl+Alt+M', async ({ page }) => {
  const server = await openWith(page, ['Nothing is selected here.'])
  try {
    await page.keyboard.press('Control+Alt+m')
    const notice = page.getByRole('dialog', { name: 'Nothing selected' })
    await expect(notice).toBeVisible()
  } finally {
    await server.close()
  }
})
