import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '../../../examples/full-editor/dist')
const surface = '#editor .trevixal-content'
const chrome = '#chrome .trevixal-ui'

async function runMenuItem(page: Page, menu: string, item: string): Promise<void> {
  await page.click(`[data-trevixal-menu="${menu}"]`)
  await page.click(`[data-trevixal-menu="${menu}"] ~ * [data-trevixal-item="${item}"]`)
}

/** The full editor on a new document of these paragraphs, typed. */
async function openWith(
  page: Page,
  lines: readonly string[],
): Promise<{ origin: string; close: () => Promise<void> }> {
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

/** A custom property as the editor's content resolves it. */
function token(page: Page, name: string): Promise<string> {
  return page
    .locator(surface)
    .evaluate(
      (element, property) => getComputedStyle(element).getPropertyValue(property).trim(),
      name,
    )
}

test('shows the chrome in another language, mirrored for Arabic, and remembers it', async ({
  page,
}) => {
  const server = await openWith(page, ['Some text to keep.'])
  try {
    const file = page.locator('[data-trevixal-menu="file"]')
    await runMenuItem(page, 'view', 'language-de')
    await expect(file).toHaveText('Datei')
    await expect(
      page.locator('#chrome .trevixal-toolbar [data-trevixal-item="bold"]'),
    ).toHaveAttribute('aria-label', 'Fett')
    // The toolbar's lists too, and what they show: the Format menu's words.
    const list = (name: string) =>
      page.locator(
        `#chrome .trevixal-toolbar [data-trevixal-item="${name}"] .trevixal-select__label`,
      )
    await expect(list('fontFamily')).toHaveText('Schrift')
    await expect(list('blockFormat')).toHaveText('Absatz')

    await runMenuItem(page, 'view', 'language-ar')
    await expect(file).toHaveText('ملف')
    await expect(page.locator(chrome)).toHaveAttribute('dir', 'rtl')
    await expect(page.locator(chrome)).toHaveAttribute('lang', 'ar')
    // The chrome runs right to left; the document keeps its own direction.
    await expect(page.locator(surface)).not.toHaveAttribute('dir', 'rtl')
    const menus = await page.locator('.trevixal-menubar').boundingBox()
    const first = await file.boundingBox()
    if (!menus || !first) throw new Error('no boxes')
    expect(first.x + first.width).toBeGreaterThan(menus.x + menus.width / 2)
    // The status line is still English, so it reads in English order: the
    // count comes before the word "words", not after it.
    const countFirst = await page.locator('.trevixal-statusbar__counts').evaluate((element) => {
      const text = element.firstChild as Text
      const leftOf = (index: number): number => {
        const range = document.createRange()
        range.setStart(text, index)
        range.setEnd(text, index + 1)
        return range.getBoundingClientRect().left
      }
      return leftOf(0) < leftOf(text.data.indexOf('words'))
    })
    expect(countFirst).toBe(true)
    // ...at the far end of the bar from the element path, as in English.
    const bar = await page.locator('.trevixal-statusbar').boundingBox()
    const counts = await page.locator('.trevixal-statusbar__counts').boundingBox()
    if (!bar || !counts) throw new Error('no status bar')
    expect(counts.x + counts.width).toBeLessThan(bar.x + bar.width / 2)

    await page.reload()
    await page.waitForSelector(surface)
    await expect(file).toHaveText('ملف')
    await runMenuItem(page, 'view', 'language-en')
    await expect(file).toHaveText('File')
    await expect(page.locator(chrome)).not.toHaveAttribute('dir', 'rtl')
  } finally {
    await server.close()
  }
})

test('exports the theme in force, and imports one from a file', async ({ page }) => {
  const server = await openWith(page, ['Colours'])
  try {
    await runMenuItem(page, 'view', 'themeNord')
    const pending = page.waitForEvent('download')
    await runMenuItem(page, 'view', 'exportTheme')
    const exported = JSON.parse(await readFile((await (await pending).path()) as string, 'utf8'))
    expect(exported).toMatchObject({ format: 'trevixal-theme', name: 'nord', base: 'dark' })
    expect(exported.tokens['color-bg']).toBe('#2e3440')

    const chooser = page.waitForEvent('filechooser')
    await runMenuItem(page, 'view', 'importTheme')
    await (await chooser).setFiles({
      name: 'meadow.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          format: 'trevixal-theme',
          label: 'Meadow',
          base: 'light',
          tokens: { 'color-bg': '#f1f8e9', 'color-text': '#1b3a1b' },
        }),
      ),
    })
    await expect.poll(() => token(page, '--tvx-color-bg')).toBe('#f1f8e9')
    // Kept for the next visit.
    await page.reload()
    await page.waitForSelector(surface)
    await expect.poll(() => token(page, '--tvx-color-bg')).toBe('#f1f8e9')
  } finally {
    await server.close()
  }
})

test('saves a theme and fonts with the document, and opens it in them', async ({ page }) => {
  const server = await openWith(page, ['A heading line', 'Body text of the document.'])
  try {
    await page.locator(`${surface} > p`).first().click()
    await runMenuItem(page, 'format', 'styleHeading1')
    await runMenuItem(page, 'format', 'documentFonts')
    const dialog = page.getByRole('dialog', { name: 'Document fonts' })
    await dialog.locator('[name="body"]').selectOption({ label: 'Georgia' })
    await dialog.locator('[name="headings"]').selectOption({ label: 'Verdana' })
    await dialog.getByRole('button', { name: 'Apply' }).click()
    const family = (selector: string) =>
      page.locator(selector).evaluate((element) => getComputedStyle(element).fontFamily)
    await expect.poll(() => family(`${surface} > p`)).toContain('Georgia')
    await expect.poll(() => family(`${surface} > h1`)).toContain('Verdana')

    await runMenuItem(page, 'view', 'themeSepia')
    await runMenuItem(page, 'view', 'documentTheme')
    await page.click('[data-trevixal-menu="view"]')
    await expect(
      page.locator('[data-trevixal-menu="view"] ~ * [data-trevixal-item="documentTheme"]'),
    ).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')

    const pending = page.waitForEvent('download')
    await runMenuItem(page, 'file', 'downloadJson')
    const saved = JSON.parse(await readFile((await (await pending).path()) as string, 'utf8'))
    expect(JSON.parse(saved.attrs.theme)).toMatchObject({ base: 'light' })
    expect(saved.attrs.styles).toContain('Georgia')

    // The reader moves on to another theme, and a new document; opening the
    // saved one brings its own theme back.
    await runMenuItem(page, 'view', 'themeDark')
    await runMenuItem(page, 'file', 'newDocument')
    await page
      .getByRole('alertdialog', { name: 'New document' })
      .getByRole('button', { name: 'New document' })
      .click()
    await expect(page.locator('html')).toHaveAttribute('data-trevixal-theme', 'dark')
    const chooser = page.waitForEvent('filechooser')
    await runMenuItem(page, 'file', 'openDocument')
    await (await chooser).setFiles({
      name: 'styled.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(saved)),
    })
    await expect(page.locator('html')).toHaveAttribute('data-trevixal-preset', 'document')
    await expect.poll(() => token(page, '--tvx-color-bg')).toBe('#fbf3e4')
    await expect.poll(() => family(`${surface} > p`)).toContain('Georgia')
  } finally {
    await server.close()
  }
})

test('switches the toolbar between presets', async ({ page }) => {
  const server = await openWith(page, ['Toolbar'])
  try {
    const groups = page.locator('#chrome .trevixal-toolbar [data-trevixal-group]')
    const all = await groups.count()
    await runMenuItem(page, 'view', 'toolbarMinimal')
    await expect(groups).toHaveCount(3)
    await expect(
      page.locator('#chrome .trevixal-toolbar [data-trevixal-group="code"]'),
    ).toHaveCount(0)
    await runMenuItem(page, 'view', 'toolbarDeveloper')
    await expect(
      page.locator('#chrome .trevixal-toolbar [data-trevixal-group="code"]'),
    ).toHaveCount(1)
    await page.click('[data-trevixal-menu="view"]')
    await expect(
      page.locator('[data-trevixal-menu="view"] ~ * [data-trevixal-item="toolbarDeveloper"]'),
    ).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
    await runMenuItem(page, 'view', 'toolbarFull')
    await expect(groups).toHaveCount(all)
  } finally {
    await server.close()
  }
})

test('turns motion off, and reads in a dyslexia-friendly face', async ({ page }) => {
  const server = await openWith(page, ['Reading comfortably.'])
  try {
    // The longest transition anything in the editor has, in seconds.
    const longestTransition = () =>
      page.locator('#app').evaluate((root) =>
        Math.max(
          ...[...root.querySelectorAll('*')].map((element) =>
            Math.max(
              ...getComputedStyle(element)
                .transitionDuration.split(',')
                .map((each) => Number.parseFloat(each) || 0),
            ),
          ),
        ),
      )
    expect(await longestTransition()).toBeGreaterThan(0.05)
    await runMenuItem(page, 'view', 'reducedMotion')
    await expect(page.locator('#app')).toHaveAttribute('data-trevixal-motion', 'reduced')
    expect(await longestTransition()).toBeLessThan(0.001)

    await runMenuItem(page, 'view', 'dyslexiaFont')
    const paragraph = page.locator(`${surface} > p`)
    await expect
      .poll(() => paragraph.evaluate((element) => getComputedStyle(element).fontFamily))
      .toMatch(/^"?OpenDyslexic/)
    // Wider word spacing, and taller lines.
    const spacing = await paragraph.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        words: Number.parseFloat(style.wordSpacing),
        lines: Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize),
      }
    })
    expect(spacing.words).toBeGreaterThan(0)
    expect(spacing.lines).toBeGreaterThan(1.7)
    await runMenuItem(page, 'view', 'dyslexiaFont')
    await expect(page.locator('#app')).not.toHaveAttribute('data-trevixal-reading', 'dyslexia')
  } finally {
    await server.close()
  }
})
