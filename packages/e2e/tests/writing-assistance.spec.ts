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

/** Open a file through File ▸ Open, as a reader would. */
async function openFile(page: Page, name: string, body: string, mimeType: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await runMenuItem(page, 'file', 'openDocument')
  await (await chooser).setFiles({ name, mimeType, buffer: Buffer.from(body) })
}

/** The middle of a word in the document, on screen. */
function wordCentre(page: Page, word: string): Promise<{ x: number; y: number }> {
  return page.locator(surface).evaluate((root, wanted) => {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(wanted) ?? -1
      if (at < 0) continue
      const range = root.ownerDocument.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + wanted.length)
      const box = range.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    throw new Error(`no “${wanted}” on the page`)
  }, word)
}

test('suggests inclusive wording, and flags tone and clichés once asked to', async ({ page }) => {
  const server = await openWith(page, ['The chairman will utilize a very long agenda.'])
  try {
    const inclusive = page.locator(`${surface} .trevixal-writing--inclusive`)
    await expect(inclusive).toHaveText('chairman')
    await expect(page.locator(`${surface} .trevixal-writing--tone`)).toHaveCount(0)
    await runMenuItem(page, 'tools', 'writingTone')
    await expect(page.locator(`${surface} .trevixal-writing--tone`)).toHaveText('very ')
    await runMenuItem(page, 'tools', 'writingCliches')
    await expect(page.locator(`${surface} .trevixal-writing--cliche`)).toHaveText('utilize')

    await inclusive.click()
    // Set in the chrome's face, not in the page's default serif.
    const face = (selector: string): Promise<string> =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => getComputedStyle(element).fontFamily)
    expect(await face('.trevixal-writing-menu')).toBe(await face('.trevixal-menubar'))
    await page.locator('.trevixal-writing-menu [data-trevixal-writing-action="apply"]').click()
    await expect(page.locator(`${surface} > p`)).toHaveText(
      'The chair will utilize a very long agenda.',
    )
  } finally {
    await server.close()
  }
})

test('tints each sentence by how hard it reads', async ({ page }) => {
  const server = await openWith(page, [
    'The cat sat. Institutional reconfiguration necessitates comprehensive deliberation.',
  ])
  try {
    await runMenuItem(page, 'tools', 'readingHeatmap')
    const heat = page.locator(`${surface} .trevixal-heat`)
    await expect(heat).toHaveCount(2)
    await expect(heat.first()).toHaveClass(/trevixal-heat--easy/)
    await expect(heat.last()).toHaveClass(/trevixal-heat--very-hard/)
    const tint = await heat.last().evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(tint).not.toBe('rgba(0, 0, 0, 0)')
    await runMenuItem(page, 'tools', 'readingHeatmap')
    await expect(heat).toHaveCount(0)
  } finally {
    await server.close()
  }
})

test('offers synonyms on right-click, and swaps the chosen one in', async ({ page }) => {
  const server = await openWith(page, ['A good plan for the week.'])
  try {
    const { x, y } = await wordCentre(page, 'good')
    await page.mouse.click(x, y, { button: 'right' })
    const menu = page.getByRole('menu', { name: 'Synonyms for good' })
    await expect(menu.getByRole('menuitem')).toHaveText([
      'fine',
      'excellent',
      'sound',
      'solid',
      'decent',
    ])
    await menu.getByRole('menuitem', { name: 'solid' }).click()
    await expect(page.locator(`${surface} > p`)).toHaveText('A solid plan for the week.')
    await expect(menu).toHaveCount(0)
  } finally {
    await server.close()
  }
})

test('checks the document for accessibility, and goes to what it finds', async ({ page }) => {
  const server = await openWith(page, ['Placeholder'])
  try {
    await openFile(
      page,
      'report.html',
      [
        '<h1>Annual report</h1>',
        '<h3>Details</h3>',
        '<p>Read <a href="https://example.com/report">click here</a> for more.</p>',
        '<p><span style="color: #cccccc">Faint words</span> are hard to read.</p>',
      ].join(''),
      'text/html',
    )
    await expect(page.locator(`${surface} h3`)).toHaveText('Details')
    await runMenuItem(page, 'tools', 'accessibilityCheck')
    const report = page.getByRole('dialog', { name: 'Accessibility check' })
    await expect(report.locator('.trevixal-findings__heading')).toHaveText([
      'Heading order',
      'Link text',
      'Colour contrast',
    ])
    // The buttons sit clear of the list above them.
    const gap = await report.evaluate((element) => {
      const items = element.querySelectorAll('.trevixal-findings__item')
      const last = (items[items.length - 1] as HTMLElement).getBoundingClientRect()
      const actions = (
        element.querySelector('.trevixal-dialog__actions') as HTMLElement
      ).getBoundingClientRect()
      return actions.top - last.bottom
    })
    expect(gap).toBeGreaterThanOrEqual(6)
    await report
      .locator('.trevixal-findings__item')
      .nth(1)
      .getByRole('button', { name: 'Go to' })
      .click()
    await expect(report).toHaveCount(0)
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('click here')
  } finally {
    await server.close()
  }
})

test('imports sources from BibTeX, cites one, and sets the list in APA', async ({ page }) => {
  const server = await openWith(page, ['Reading on paper is slower'])
  try {
    const chooser = page.waitForEvent('filechooser')
    await runMenuItem(page, 'insert', 'importSources')
    await (await chooser).setFiles({
      name: 'library.bib',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        [
          '@article{smith2020, author = {Smith, John and Doe, Jane}, title = {Reading on Screens},',
          '  journal = {Journal of Reading}, year = 2020, volume = {12}, number = {3}, pages = {45--67}}',
          '@book{adams1999, author = {Adams, Ada}, title = {A Short Book}, publisher = {Northwind Press}, year = 1999}',
        ].join('\n'),
      ),
    })
    const entries = page.locator(`${surface} .trevixal-references__item`)
    await expect(entries).toHaveCount(2)

    await page.locator(`${surface} > p`).first().click()
    await page.keyboard.press('End')
    await runMenuItem(page, 'insert', 'insertCitation')
    const dialog = page.getByRole('dialog', { name: 'Insert citation' })
    await dialog.locator('[name="cite"]').selectOption('smith2020')
    await dialog.getByRole('button', { name: 'Insert' }).click()
    const citation = page.locator(`${surface} .trevixal-citation`)
    await expect(citation).toHaveText('[1]')

    await runMenuItem(page, 'insert', 'citationStyle-apa')
    await expect(citation).toHaveText('(Smith & Doe, 2020)')
    await expect(entries.first()).toHaveText('Adams, A. (1999). A Short Book. Northwind Press.')
    await expect(entries.last()).toContainText('Smith, J., & Doe, J. (2020). Reading on Screens.')
    await page.click('[data-trevixal-menu="insert"]')
    await expect(
      page.locator('[data-trevixal-menu="insert"] ~ * [data-trevixal-item="citationStyle-apa"]'),
    ).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
  } finally {
    await server.close()
  }
})

test('finds the sentences another workspace document also has', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await page.waitForSelector(surface)
    await runMenuItem(page, 'view', 'workspacePanel')
    const tabs = page.locator('.trevixal-tabs-bar__item')
    await expect(tabs).toHaveCount(1)
    await page.locator('.trevixal-tabs-bar__new').click()
    await page.locator('[data-menu-item="template:blank"]').click()
    await expect(tabs).toHaveCount(2)
    await page.locator(surface).click()
    await page.keyboard.type('Board minutes')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Payment is due within thirty days of the invoice date.')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Something written only here, and nowhere else at all.')

    // Another document with one of the same sentences.
    await page.locator('.trevixal-tabs-bar__new').click()
    await page.locator('[data-menu-item="template:blank"]').click()
    await expect(tabs).toHaveCount(3)
    await page.locator(surface).click()
    await page.keyboard.type('Contract terms')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Payment is due within thirty days of the invoice date.')
    // Saved to the workspace before the comparison reads it.
    await tabs.nth(1).locator('.trevixal-tabs-bar__title').click()
    await expect(page.locator(surface)).toContainText('Board minutes')

    await runMenuItem(page, 'tools', 'findDuplicates')
    const report = page.getByRole('dialog', { name: 'Duplicate text' })
    await expect(report.locator('.trevixal-findings__item')).toHaveCount(1)
    // A workspace document is titled by its first words.
    await expect(report.locator('.trevixal-findings__heading')).toContainText(
      'Also in “Contract terms',
    )
    await expect(report.locator('.trevixal-findings__message')).toHaveText(
      'Payment is due within thirty days of the invoice date.',
    )
  } finally {
    await server.close()
  }
})

test('rewrites and summarises through the writing assistant, and shows only what it can do', async ({
  page,
}) => {
  const server = await openWith(page, [
    'We will utilize the very best tools. They are cheap.',
    'Second part of the plan. It follows the first.',
  ])
  try {
    await page.click('[data-trevixal-menu="tools"]')
    await expect(page.locator('[data-trevixal-item="assistRewrite"]')).toBeVisible()
    // The built-in rules cannot translate or continue, so those are not offered.
    await expect(page.locator('[data-trevixal-item="assistTranslate"]')).toHaveCount(0)
    await expect(page.locator('[data-trevixal-item="assistContinue"]')).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.locator(`${surface} > p`).first().click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await runMenuItem(page, 'tools', 'assistRewrite')
    const rewrite = page.getByRole('dialog', { name: 'Rewrite' })
    await expect(rewrite.locator('[name="text"]')).toHaveValue(
      'We will use the best tools. They are cheap.',
    )
    await rewrite.getByRole('button', { name: 'Replace' }).click()
    await expect(page.locator(`${surface} > p`).first()).toHaveText(
      'We will use the best tools. They are cheap.',
    )

    await page.locator(`${surface} > p`).first().click()
    await page.keyboard.press('Control+a')
    await runMenuItem(page, 'tools', 'assistSummarise')
    const summary = page.getByRole('dialog', { name: 'Summary' })
    await expect(summary.locator('[name="text"]')).toHaveValue(
      'We will use the best tools. Second part of the plan.',
    )
    await summary.getByRole('button', { name: 'Insert' }).click()
    await expect(page.locator(`${surface} > p`)).toHaveText([
      'We will use the best tools. They are cheap.',
      'Second part of the plan. It follows the first.',
      'We will use the best tools. Second part of the plan.',
    ])
  } finally {
    await server.close()
  }
})
