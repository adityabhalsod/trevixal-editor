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

/** Open a file through File ▸ Open, as a reader would. */
async function openFile(page: Page, name: string, body: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await runMenuItem(page, 'file', 'openDocument')
  await (await chooser).setFiles({ name, mimeType: 'text/html', buffer: Buffer.from(body) })
}

/** A manuscript of this many paragraphs, a picture near the end. */
function manuscript(paragraphs: number): string {
  const body = Array.from(
    { length: paragraphs },
    (_, n) => `<p>Paragraph ${n + 1} of the long draft.</p>`,
  )
  body.push(
    '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="A dot">',
  )
  body.push('<pre><code class="language-javascript">const answer = 42</code></pre>')
  return body.join('')
}

test('lays out only what is on screen in a long document, and loads pictures as they near it', async ({
  page,
}) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await page.waitForSelector(surface)
    await openFile(page, 'draft.html', manuscript(260))
    await expect(page.locator(`${surface} > p`)).toHaveCount(260)
    await expect(page.locator(surface)).toHaveAttribute('data-trevixal-long', '')
    const far = page.locator(`${surface} > p`).nth(200)
    expect(await far.evaluate((element) => getComputedStyle(element).contentVisibility)).toBe(
      'auto',
    )
    await expect(page.locator(`${surface} img`)).toHaveAttribute('loading', 'lazy')
    // Typing at the top stays a typed keystroke, whatever the length below.
    await page.locator(`${surface} > p`).first().click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Edited.')
    await expect(page.locator(`${surface} > p`).first()).toHaveText(
      'Paragraph 1 of the long draft. Edited.',
    )
  } finally {
    await server.close()
  }
})

test('writes a Word download in a worker, off the main thread', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await page.waitForSelector(surface)
    await openFile(page, 'draft.html', manuscript(30))
    await expect(page.locator(`${surface} > p`)).toHaveCount(30)
    const workers: string[] = []
    page.on('worker', (worker) => workers.push(worker.url()))
    const pending = page.waitForEvent('download')
    await runMenuItem(page, 'file', 'downloadDocx')
    const docx = await readFile((await (await pending).path()) as string)
    expect(workers.some((url) => url.includes('export-worker'))).toBe(true)
    expect(docx.includes('Paragraph 30 of the long draft.')).toBe(true)
    // The code block's colours came from the editor, block by block, through the worker.
    expect(docx.includes('const')).toBe(true)
    expect(/<w:color w:val="[0-9A-F]{6}"\/>/.test(docx.toString('latin1'))).toBe(true)
  } finally {
    await server.close()
  }
})
