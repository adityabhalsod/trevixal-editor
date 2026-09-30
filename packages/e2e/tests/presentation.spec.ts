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

/** A short talk: two headings, a paragraph under each, a note on the first. */
async function openTalk(page: Page): Promise<{ close: () => Promise<void> }> {
  const server = await serveDist(distDir)
  await page.goto(server.origin)
  await page.waitForSelector(surface)
  await runMenuItem(page, 'file', 'newDocument')
  await page
    .getByRole('alertdialog', { name: 'New document' })
    .getByRole('button', { name: 'New document' })
    .click()
  await page.locator(`${surface} > p`).click()
  await page.keyboard.type('## Why it matters')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Because the numbers say so.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('## How we get there')
  await page.keyboard.press('Enter')
  await page.keyboard.type('One step at a time.')
  await expect(page.locator(`${surface} > h2`)).toHaveCount(2)
  // The speaker's note, under the first heading.
  await page.locator(`${surface} > p`).first().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await runMenuItem(page, 'insert', 'calloutNote')
  await page.keyboard.type('Pause here for questions.')
  await expect(page.locator(`${surface} > h2`).nth(1)).toHaveText('How we get there')
  return server
}

test('presents the document as slides, with notes, from the keyboard', async ({ page }) => {
  const server = await openTalk(page)
  try {
    await runMenuItem(page, 'view', 'present')
    const show = page.getByRole('dialog', { name: 'Presentation' })
    await expect(show).toBeVisible()
    await expect(show.locator('.trevixal-presentation__title')).toHaveText('Why it matters')
    await expect(show.locator('.trevixal-presentation__counter')).toHaveText('1 / 2')
    // The note callout is the speaker's, not the room's.
    await expect(show.locator('.trevixal-presentation__slide')).not.toContainText('Pause here')
    await page.keyboard.press('n')
    await expect(show.getByRole('complementary', { name: 'Speaker notes' })).toHaveText(
      'Pause here for questions.',
    )
    // Set in the chrome's face, not in the page's default serif.
    const face = (selector: string): Promise<string> =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => getComputedStyle(element).fontFamily)
    expect(await face('.trevixal-presentation__notes')).toBe(await face('.trevixal-menubar'))
    await page.keyboard.press('ArrowRight')
    await expect(show.locator('.trevixal-presentation__title')).toHaveText('How we get there')
    await expect(show.locator('.trevixal-presentation__counter')).toHaveText('2 / 2')
    await page.keyboard.press('ArrowRight')
    await expect(show.locator('.trevixal-presentation__counter')).toHaveText('2 / 2')
    await page.keyboard.press('Home')
    await expect(show.locator('.trevixal-presentation__counter')).toHaveText('1 / 2')
    await page.keyboard.press('Escape')
    await expect(show).toHaveCount(0)
  } finally {
    await server.close()
  }
})

test('downloads the slides as a PowerPoint deck', async ({ page }) => {
  const server = await openTalk(page)
  try {
    const pending = page.waitForEvent('download')
    await runMenuItem(page, 'file', 'downloadPptx')
    const download = await pending
    expect(download.suggestedFilename()).toMatch(/\.pptx$/)
    const deck = await readFile((await download.path()) as string)
    expect(deck.includes('ppt/slides/slide2.xml')).toBe(true)
    expect(deck.includes('How we get there')).toBe(true)
    expect(deck.includes('Pause here for questions.')).toBe(true)
  } finally {
    await server.close()
  }
})
