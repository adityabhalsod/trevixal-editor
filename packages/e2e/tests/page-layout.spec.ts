import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Frame, type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '../../../examples/full-editor/dist')
const surface = '#editor .trevixal-content'

async function runMenuItem(page: Page, menu: string, item: string): Promise<void> {
  await page.click(`[data-trevixal-menu="${menu}"]`)
  await page.click(`[data-trevixal-menu="${menu}"] ~ * [data-trevixal-item="${item}"]`)
}

/** Twenty-four paragraphs, a heading every six: five or so A4 pages. */
const LONG = Array.from({ length: 24 }, (_, index) => {
  const heading = index % 6 === 0 ? `## Part ${index / 6 + 1}\n\n` : ''
  const words = `Paragraph ${index + 1} sets out the plan in plain words for the reader to follow. `
  return `${heading}${words.repeat(9).trim()}`
}).join('\n\n')

/** The full editor on a document opened from Markdown. */
async function openWith(page: Page, markdown: string): Promise<{ close: () => Promise<void> }> {
  const server = await serveDist(distDir)
  await page.goto(server.origin)
  await page.waitForSelector(surface)
  const chooser = page.waitForEvent('filechooser')
  await runMenuItem(page, 'file', 'openDocument')
  await (await chooser).setFiles({
    name: 'plan.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(markdown),
  })
  await expect(page.locator(`${surface} p`).first()).toContainText('Paragraph 1')
  return server
}

/** File ▸ Page setup, with these fields changed. */
async function setUpPage(page: Page, fields: Record<string, string>): Promise<void> {
  await runMenuItem(page, 'file', 'pageSetup')
  const dialog = page.getByRole('dialog', { name: 'Page setup' })
  for (const [name, value] of Object.entries(fields)) {
    const field = dialog.locator(`[name="${name}"]`)
    if ((await field.evaluate((element) => element.tagName)) === 'SELECT')
      await field.selectOption(value)
    else await field.fill(value)
  }
  await dialog.getByRole('button', { name: 'Save' }).click()
}

/** File ▸ Print preview, laid out: its frame once the pages are there. */
async function preview(page: Page): Promise<Frame> {
  await runMenuItem(page, 'file', 'printPreview')
  const handle = await page.locator('.trevixal-print-preview__frame').elementHandle()
  const frame = await handle?.contentFrame()
  if (!frame) throw new Error('no preview frame')
  await frame.waitForSelector('.trevixal-page')
  return frame
}

test('sets the page up, and the page view shows it with its header and footer', async ({
  page,
}) => {
  const server = await openWith(page, LONG)
  try {
    await setUpPage(page, {
      orientation: 'landscape',
      header: 'The plan',
      footer: 'Page {page} of {pages}',
    })
    await runMenuItem(page, 'view', 'pageMode')
    const shell = page.locator('.trevixal-paged')
    await expect(shell).toHaveCount(1)
    expect(
      await shell.evaluate((element) => element.style.getPropertyValue('--tvx-page-width')),
    ).toBe('297mm')
    const footers = page.locator('.trevixal-page-marks__footer')
    await expect(footers.first()).toHaveText(/^Page 1 of \d+$/)
    await expect(page.locator('.trevixal-page-marks__header').first()).toHaveText('The plan')
  } finally {
    await server.close()
  }
})

test('prints as pages, each numbered, none running over', async ({ page }) => {
  const server = await openWith(page, LONG)
  try {
    await setUpPage(page, { footer: 'Page {page} of {pages}' })
    const frame = await preview(page)
    const pages = await frame.$$eval('.trevixal-page', (boxes) =>
      boxes.map((box) => {
        const body = box.querySelector('.trevixal-page__body') as HTMLElement
        return {
          footer: box.querySelector('.trevixal-page__footer')?.textContent ?? '',
          overflows: [...body.children].some((child) => {
            const box = child.getBoundingClientRect()
            const limit = body.getBoundingClientRect()
            return box.bottom > limit.bottom + 1 || box.right > limit.right + 1
          }),
          text: body.textContent ?? '',
        }
      }),
    )
    expect(pages.length).toBeGreaterThan(2)
    expect(pages.map((each) => each.footer)).toEqual(
      pages.map((_, index) => `Page ${index + 1} of ${pages.length}`),
    )
    expect(pages.some((each) => each.overflows)).toBe(false)
    // Every paragraph is there, once, in order, split or whole.
    const text = pages.map((each) => each.text).join(' ')
    const order = Array.from({ length: 24 }, (_, index) =>
      text.indexOf(`Paragraph ${index + 1} sets`),
    )
    expect(
      order.every((at, index) => at >= 0 && (index === 0 || at > (order[index - 1] ?? 0))),
    ).toBe(true)
    // A heading never ends a page.
    const endsWithHeading = await frame.$$eval('.trevixal-page__body', (bodies) =>
      bodies.some((body) => /^H[1-6]$/.test(body.lastElementChild?.tagName ?? '')),
    )
    expect(endsWithHeading).toBe(false)
  } finally {
    await server.close()
  }
})

test('flows the text down each page’s columns in turn', async ({ page }) => {
  const server = await openWith(page, LONG)
  try {
    const frame = await preview(page)
    const single = await frame.$$eval('.trevixal-page', (boxes) => boxes.length)
    await page
      .getByRole('dialog', { name: 'Print preview' })
      .getByRole('button', { name: 'Close' })
      .click()
    await runMenuItem(page, 'format', 'textColumns-2')
    const columned = await preview(page)
    const bodies = await columned.$$eval('.trevixal-page__body', (all) =>
      all.map((body) => ({
        columns: getComputedStyle(body).columnCount,
        // Every block inside the page's text box, whichever column it ends in.
        overflows: [...body.children].some((child) => {
          const box = child.getBoundingClientRect()
          const limit = body.getBoundingClientRect()
          return box.bottom > limit.bottom + 1 || box.right > limit.right + 1
        }),
      })),
    )
    expect(bodies.every((body) => body.columns === '2')).toBe(true)
    expect(bodies.some((body) => body.overflows)).toBe(false)
    // Narrower columns set more lines, in the same pages or near enough.
    expect(bodies.length).toBeGreaterThanOrEqual(single)
    expect(bodies.length).toBeLessThanOrEqual(single + 2)
  } finally {
    await server.close()
  }
})

test('starts a section on pages of its own, turned, and Word gets it all', async ({ page }) => {
  const server = await openWith(page, LONG)
  try {
    await setUpPage(page, { header: 'The plan', footer: 'Page {page} of {pages}' })
    await page.locator(`${surface} p`, { hasText: 'Paragraph 3 sets' }).click()
    await runMenuItem(page, 'insert', 'insertSectionBreak')
    const dialog = page.getByRole('dialog', { name: 'Section break' })
    await dialog.locator('[name="orientation"]').selectOption('landscape')
    await dialog.getByRole('button', { name: 'Insert' }).click()
    await expect(page.locator(`${surface} [data-section-break]`)).toHaveAttribute(
      'data-label',
      'Section break: landscape',
    )
    const frame = await preview(page)
    const orientations = await frame.$$eval('.trevixal-page', (boxes) =>
      boxes.map((box) => (box as HTMLElement).dataset.orientation),
    )
    expect(orientations[0]).toBe('portrait')
    expect(orientations.at(-1)).toBe('landscape')
    await page
      .getByRole('dialog', { name: 'Print preview' })
      .getByRole('button', { name: 'Close' })
      .click()

    const pending = page.waitForEvent('download')
    await runMenuItem(page, 'file', 'downloadDocx')
    const word = (await readFile((await (await pending).path()) as string)).toString('latin1')
    expect(word).toContain('w:orient="landscape"')
    expect(word).toContain('<w:headerReference w:type="default"')
    expect(word).toContain('<w:fldSimple w:instr=" NUMPAGES ">')
  } finally {
    await server.close()
  }
})

test('prints one sheet of paper for each page it lays out, turned where it is', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Only Chromium can print a page to PDF under Playwright')
  const server = await openWith(page, LONG)
  try {
    await setUpPage(page, { footer: '{page}' })
    await page.locator(`${surface} p`, { hasText: 'Paragraph 20 sets' }).click()
    await runMenuItem(page, 'insert', 'insertSectionBreak')
    const dialog = page.getByRole('dialog', { name: 'Section break' })
    await dialog.locator('[name="orientation"]').selectOption('landscape')
    await dialog.getByRole('button', { name: 'Insert' }).click()
    const frame = await preview(page)
    const laidOut = await frame.$$eval('.trevixal-page', (boxes) => boxes.length)
    const html = await frame.evaluate(() => document.documentElement.outerHTML)
    const sheet = await page.context().newPage()
    await sheet.setContent(html)
    const pdf = (await sheet.pdf({ preferCSSPageSize: true, printBackground: true })).toString(
      'latin1',
    )
    expect(pdf.match(/\/Type\s*\/Page(?!s)/g)?.length).toBe(laidOut)
    // A4 upright is 595 by 842 points; the section's sheets are the other way up.
    const boxes = [...pdf.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map(
      ([, width, height]) => Number(width) > Number(height),
    )
    expect(boxes[0]).toBe(false)
    expect(boxes.at(-1)).toBe(true)
    await sheet.close()
  } finally {
    await server.close()
  }
})
