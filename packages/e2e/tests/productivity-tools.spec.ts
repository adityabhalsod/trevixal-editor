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
const blocks = (page: Page) => page.locator(`${surface} > p`)

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

test('keeps a snippet, and its abbreviation expands as it is typed', async ({ page }) => {
  const server = await openWith(page, ['Thanks'])
  try {
    await runMenuItem(page, 'tools', 'manageSnippets')
    const snippets = dialog(page, 'Snippets')
    await snippets.locator('[name="abbreviation"]').fill(';sig')
    await snippets.locator('[name="name"]').fill('Signature')
    await snippets.locator('[name="text"]').fill('Best regards,\nAda')
    await snippets.getByRole('button', { name: 'Add snippet' }).click()
    await expect(snippets.locator('.trevixal-snippets__item')).toContainText(';sig Signature')
    await snippets.getByRole('button', { name: 'Done' }).click()

    await blocks(page).first().click()
    await page.keyboard.press('End')
    await page.keyboard.type(' ;sig')
    await page.keyboard.press('Tab')
    await expect(blocks(page)).toHaveText(['Thanks Best regards,', 'Ada'])

    // From the menu too.
    await page.keyboard.press('Enter')
    await runMenuItem(page, 'insert', 'insertSnippet')
    const pick = dialog(page, 'Insert snippet')
    await pick.getByRole('button', { name: 'Insert' }).click()
    await expect(blocks(page)).toHaveText(['Thanks Best regards,', 'Ada', 'Best regards,', 'Ada'])
  } finally {
    await server.close()
  }
})

test('records a macro and plays it back with one key', async ({ page }) => {
  // Capitalised, so no writing check marks a word and puts its menu in the way.
  const server = await openWith(page, ['First line', 'Second line'])
  try {
    await blocks(page).first().click()
    await runMenuItem(page, 'tools', 'macroRecord')
    await page.keyboard.press('End')
    await page.keyboard.type('!')
    await runMenuItem(page, 'tools', 'macroRecord')
    await expect(blocks(page).first()).toHaveText('First line!')

    await blocks(page)
      .nth(1)
      .click({ position: { x: 4, y: 4 } })
    await page.keyboard.press('F8')
    await expect(blocks(page).nth(1)).toHaveText('Second line!')
  } finally {
    await server.close()
  }
})

test('types at more than one caret, and replaces every match at once', async ({ page }) => {
  // Capitalised, so no writing check marks a word and puts its menu in the way.
  const server = await openWith(page, ['The cat and the cat', 'A cat', 'Alpha'])
  try {
    // Alt+click puts a second caret at the end of the last line.
    await blocks(page).nth(1).click()
    await page.keyboard.press('End')
    const last = blocks(page).nth(2)
    const box = await last.boundingBox()
    if (!box) throw new Error('no box')
    await page.keyboard.down('Alt')
    await page.mouse.click(box.x + box.width - 1, box.y + box.height / 2)
    await page.keyboard.up('Alt')
    await expect(page.locator(`${surface} .trevixal-extra-caret`)).toHaveCount(1)
    await page.keyboard.type('!')
    await expect(blocks(page)).toHaveText(['The cat and the cat', 'A cat!', 'Alpha!'])
    await page.keyboard.press('Escape')
    await expect(page.locator(`${surface} .trevixal-extra-caret`)).toHaveCount(0)

    // The word at the caret, then each next place it occurs.
    await blocks(page).first().click()
    await page.keyboard.press('Home')
    for (let n = 0; n < 5; n++) await page.keyboard.press('ArrowRight')
    for (let n = 0; n < 3; n++) await page.keyboard.press('ControlOrMeta+d')
    await expect(page.locator(`${surface} .trevixal-extra-selection`)).toHaveCount(2)
    await page.keyboard.type('dog')
    await expect(blocks(page)).toHaveText(['The dog and the dog', 'A dog!', 'Alpha!'])
  } finally {
    await server.close()
  }
})

test('goes to a heading, a bookmark or a line', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await page.locator(`${surface} > p`).first().click()
    await page.keyboard.press('ControlOrMeta+g')
    const box = dialog(page, 'Go to')
    await box.locator('[name="kind"]').selectOption('heading')
    await box.locator('[name="heading"]').selectOption({ label: 'Tasks' })
    await box.getByRole('button', { name: 'Go to' }).click()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const node = document.getSelection()?.anchorNode
          const element = node instanceof Element ? node : node?.parentElement
          return element?.closest('h2')?.textContent ?? null
        }),
      )
      .toBe('Tasks')

    await page.keyboard.press('ControlOrMeta+g')
    await dialog(page, 'Go to').locator('[name="line"]').fill('3')
    await dialog(page, 'Go to').getByRole('button', { name: 'Go to' }).click()
    // The third line on screen is the first of the second paragraph.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const selection = document.getSelection()
          const node = selection?.anchorNode
          const element = node instanceof Element ? node : node?.parentElement
          const paragraph = element?.closest('.trevixal-content > *')
          return paragraph ? [...paragraph.parentElement!.children].indexOf(paragraph) : -1
        }),
      )
      .toBeGreaterThan(0)
  } finally {
    await server.close()
  }
})

test('lists the documents opened lately at the top of the command palette', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await runMenuItem(page, 'view', 'workspacePanel')
    const tabs = page.locator('.trevixal-tabs-bar__item')
    await page.locator('.trevixal-tabs-bar__new').click()
    await page.locator('[data-menu-item="template:blank"]').click()
    await expect(tabs).toHaveCount(2)
    await page.locator(surface).click()
    await page.keyboard.type('Second document')
    // The palette offers the tour, the one not on screen, first.
    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.locator('.trevixal-palette')
    await expect(palette).toBeVisible()
    const recent = palette.getByRole('option', { name: /^Open Trevixal/ })
    await expect(recent).toBeVisible()
    await recent.click()
    await expect(page.locator(`${surface} h1`).first()).toHaveText('Trevixal')
  } finally {
    await server.close()
  }
})

test('pastes as text, as Markdown or as code', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: async () => '**Bold** and `code`', writeText: async () => {} },
    })
  })
  const server = await openWith(page, [''])
  try {
    const paste = async (as: string): Promise<void> => {
      await runMenuItem(page, 'edit', 'pasteSpecial')
      const box = dialog(page, 'Paste special')
      await box.locator('[name="as"]').selectOption(as)
      await box.getByRole('button', { name: 'Paste' }).click()
    }
    await paste('markdown')
    await expect(page.locator(`${surface} strong`)).toHaveText('Bold')
    await expect(page.locator(`${surface} p code`)).toHaveText('code')
    await page.keyboard.press('Enter')
    await paste('text')
    await expect(page.locator(surface)).toContainText('**Bold** and `code`')
    await paste('code')
    await expect(page.locator(`${surface} pre`)).toHaveText('**Bold** and `code`')
  } finally {
    await server.close()
  }
})
