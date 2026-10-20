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

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })

/** A one-pixel PNG, for the map tiles. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

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

test('puts a sticky note in the margin beside the text', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const server = await openWith(page, ['The plan for the week, with a note beside it.'])
  try {
    await runMenuItem(page, 'insert', 'insertMarginNote')
    await page.keyboard.type('Check the dates.')
    const note = page.locator(`${surface} aside.trevixal-margin-note`)
    await expect(note).toHaveText('Check the dates.')
    expect(await note.evaluate((element) => getComputedStyle(element).float)).toMatch(
      /right|inline-end/,
    )
    const paragraph = await page.locator(`${surface} > p`).first().boundingBox()
    const box = await note.boundingBox()
    // Beside the text, at its right, rather than on a line of its own.
    expect((box?.x ?? 0) > (paragraph?.x ?? 0) + (paragraph?.width ?? 0) / 2).toBe(true)
  } finally {
    await server.close()
  }
})

test('runs a poll: a vote counts, and a second choice moves it', async ({ page }) => {
  const server = await openWith(page, ['Meeting'])
  try {
    await runMenuItem(page, 'insert', 'insertPoll')
    const box = dialog(page, 'Insert poll')
    await box.locator('[name="question"]').fill('Which day?')
    await box.locator('[name="options"]').fill('Tuesday\nThursday')
    await box.getByRole('button', { name: 'Insert' }).click()
    const poll = page.locator(`${surface} .trevixal-poll`)
    await expect(poll.locator('.trevixal-poll__question')).toHaveText('Which day?')
    await poll.getByRole('button', { name: 'Vote for Tuesday' }).click()
    await expect(poll.locator('.trevixal-poll__count')).toHaveText(['1 · 100%', '0 · 0%'])
    await poll.getByRole('button', { name: 'Vote for Thursday' }).click()
    await expect(poll.locator('.trevixal-poll__count')).toHaveText(['0 · 0%', '1 · 100%'])
    await expect(poll.locator('.trevixal-poll__total')).toHaveText('1 vote')
  } finally {
    await server.close()
  }
})

test('draws a map from any tile provider, and zooms it', async ({ page }) => {
  const tiles: string[] = []
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    tiles.push(new URL(route.request().url()).pathname)
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
  })
  const server = await openWith(page, ['Where we meet'])
  try {
    await runMenuItem(page, 'insert', 'insertMap')
    const box = dialog(page, 'Insert map')
    await box.locator('[name="place"]').fill('51.5074, -0.1278')
    await box.locator('[name="label"]').fill('London')
    await box.getByRole('button', { name: 'Insert' }).click()
    const map = page.locator(`${surface} .trevixal-map`)
    await expect(map.locator('.trevixal-map__place')).toHaveText('London')
    await expect(map.locator('.trevixal-map__tile')).toHaveCount(18)
    await expect(map.locator('.trevixal-map__tile').first()).toHaveAttribute(
      'src',
      /\/13\/\d+\/\d+\.png$/,
    )
    await expect.poll(() => tiles.length).toBeGreaterThan(0)
    // The pin is in the middle of the view.
    const view = await map.locator('.trevixal-map__view').boundingBox()
    const pin = await map.locator('.trevixal-map__pin').boundingBox()
    if (!view || !pin) throw new Error('no boxes')
    expect(Math.abs(pin.x + pin.width / 2 - (view.x + view.width / 2))).toBeLessThan(20)
    await map.getByRole('button', { name: 'Zoom in' }).click()
    await expect(map.locator('.trevixal-map__tile').first()).toHaveAttribute(
      'src',
      /\/14\/\d+\/\d+\.png$/,
    )
  } finally {
    await server.close()
  }
})

test('shows content only while its template variable says so, in the editor and a download', async ({
  page,
}) => {
  const server = await openWith(page, ['For everyone.', 'For pro customers only.'])
  try {
    await page.locator(`${surface} > p`).nth(1).click()
    await runMenuItem(page, 'insert', 'insertConditional')
    const box = dialog(page, 'Show only when')
    await box.locator('[name="variable"]').fill('plan')
    await box.locator('[name="equals"]').fill('pro')
    await box.getByRole('button', { name: 'Apply' }).click()
    const conditional = page.locator(`${surface} .trevixal-conditional`)
    await expect(conditional).toHaveAttribute('data-condition-met', 'false')

    const markdown = async (): Promise<string> => {
      const pending = page.waitForEvent('download')
      await runMenuItem(page, 'file', 'downloadMarkdown')
      return readFile((await (await pending).path()) as string, 'utf8')
    }
    expect(await markdown()).not.toContain('For pro customers only.')

    await runMenuItem(page, 'tools', 'templateVariables')
    const variables = dialog(page, 'Template variables')
    await variables.locator('[name="variables"]').fill('plan = pro')
    await variables.getByRole('button', { name: 'Save' }).click()
    await expect(conditional).toHaveAttribute('data-condition-met', 'true')
    expect(await markdown()).toContain('For pro customers only.')
  } finally {
    await server.close()
  }
})
