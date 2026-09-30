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

/** What the page last copied, kept by a stand-in clipboard. */
async function recordClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = { text: '' }
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          store.text = text
        },
        readText: async () => store.text,
      },
    })
    ;(window as unknown as { copied: () => string }).copied = () => store.text
  })
}

/** The full editor on a new, empty document. */
async function openBlank(page: Page): Promise<{ close: () => Promise<void> }> {
  const server = await serveDist(distDir)
  await page.goto(server.origin)
  await page.waitForSelector(surface)
  await runMenuItem(page, 'file', 'newDocument')
  await page
    .getByRole('alertdialog', { name: 'New document' })
    .getByRole('button', { name: 'New document' })
    .click()
  await expect(page.locator(`${surface} > *`)).toHaveCount(1)
  await page.locator(`${surface} > p`).click()
  return server
}

/** Choose an entry from the code bar's options menu. */
async function codeOption(page: Page, option: string): Promise<void> {
  await page.locator('.trevixal-codelang__options-trigger').click()
  await page.locator(`[data-trevixal-code-option="${option}"]`).click()
}

test('numbers a code block’s lines, picks some out, wraps them and titles the block', async ({
  page,
}) => {
  const server = await openBlank(page)
  try {
    await runMenuItem(page, 'insert', 'insertRunnableJs')
    const pre = page.locator(`${surface} pre`)
    await expect(pre).toHaveAttribute('data-language', 'javascript')
    await expect(page.locator('.trevixal-codelang')).toBeVisible()

    await codeOption(page, 'lineNumbers')
    await expect(pre).toHaveAttribute('data-line-numbers', 'true')
    const markers = pre.locator('.trevixal-code-line')
    await expect(markers).toHaveCount(2)
    await expect(markers.nth(1)).toHaveAttribute('data-line', '2')
    // Each number sits level with its line: the second marker's middle is
    // the second line's middle.
    const [markerMiddle, lineMiddle] = await pre.evaluate((element) => {
      const marker = element.querySelectorAll('.trevixal-code-line')[1] as HTMLElement
      const code = element.querySelector('code') as HTMLElement
      const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node && !(node.textContent ?? '').startsWith('console')) node = walker.nextNode()
      const range = document.createRange()
      range.setStart(node as Node, 0)
      range.setEnd(node as Node, 1)
      const box = marker.getBoundingClientRect()
      const text = range.getBoundingClientRect()
      return [box.top + box.height / 2, text.top + text.height / 2]
    })
    expect(Math.abs(markerMiddle - lineMiddle)).toBeLessThan(3)

    await codeOption(page, 'highlightLines')
    const lines = dialog(page, 'Highlight lines')
    await lines.locator('[name="value"]').fill('2')
    await lines.getByRole('button', { name: 'Apply' }).click()
    await expect(pre).toHaveAttribute('data-highlight-lines', '2')
    await expect(pre.locator('.trevixal-code-line--highlight')).toHaveCount(1)

    // Near the start of the code, clear of the bar over its top right.
    await page.locator(`${surface} pre code`).click({ position: { x: 4, y: 4 } })
    await codeOption(page, 'title')
    const title = dialog(page, 'Code block title')
    await title.locator('[name="value"]').fill('total.js')
    await title.getByRole('button', { name: 'Apply' }).click()
    await expect(pre).toHaveAttribute('data-title', 'total.js')

    // Near the start of the code, clear of the bar over its top right.
    await page.locator(`${surface} pre code`).click({ position: { x: 4, y: 4 } })
    await codeOption(page, 'wrap')
    await expect(pre).toHaveAttribute('data-wrap', 'true')
    expect(await pre.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('pre-wrap')
    // The options are the block's, so the code itself is untouched.
    await expect(pre.locator('code')).toContainText('console.log')
  } finally {
    await server.close()
  }
})

test('folds a long block under a bar that unfolds it', async ({ page }) => {
  const server = await openBlank(page)
  try {
    await runMenuItem(page, 'insert', 'insertRunnableJs')
    for (let line = 0; line < 10; line++) {
      await page.keyboard.press('Enter')
      await page.keyboard.type(`// line ${line}`)
    }
    await codeOption(page, 'collapsed')
    const pre = page.locator(`${surface} pre`)
    await expect(pre).toHaveAttribute('data-collapsed', 'true')
    const bar = pre.getByRole('button', { name: 'Show all 12 lines' })
    await expect(bar).toBeVisible()
    const folded = (await pre.boundingBox())?.height ?? 0
    await bar.click()
    await expect(pre).not.toHaveAttribute('data-collapsed', 'true')
    expect((await pre.boundingBox())?.height ?? 0).toBeGreaterThan(folded)
  } finally {
    await server.close()
  }
})

test('runs JavaScript and shows what it printed, and draws HTML', async ({ page }) => {
  const server = await openBlank(page)
  try {
    await runMenuItem(page, 'insert', 'insertRunnableJs')
    await page.locator('.trevixal-codelang__run').click()
    const output = page.locator(`${surface} pre .trevixal-code-output`)
    await expect(output.locator('.trevixal-code-output__line')).toHaveText(['Total: 6'])
    // The frame runs scripts and nothing else: no same-origin, no network.
    await expect(output.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts')

    // Near the start of the code, clear of the bar over its top right.
    await page.locator(`${surface} pre code`).click({ position: { x: 4, y: 4 } })
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.press('ControlOrMeta+Enter')
    await runMenuItem(page, 'insert', 'insertRunnableHtml')
    await page.locator('.trevixal-codelang__run').click()
    const drawn = page.frameLocator(`${surface} pre[data-language="html"] iframe`)
    await expect(drawn.locator('h1')).toHaveText('Hello')
  } finally {
    await server.close()
  }
})

test('copies a terminal session’s commands without their prompts', async ({ page }) => {
  await recordClipboard(page)
  const server = await openBlank(page)
  try {
    await runMenuItem(page, 'insert', 'insertTerminal')
    await page.keyboard.type('npm install')
    await page.keyboard.press('Enter')
    await page.keyboard.type('added 12 packages')
    await page.keyboard.press('Enter')
    await page.keyboard.type('$ npm test')
    const pre = page.locator(`${surface} pre`)
    await expect(pre).toHaveAttribute('data-language', 'console')
    await page.locator('.trevixal-codelang__copy').click()
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { copied: () => string }).copied()))
      .toBe('npm install\nnpm test')
    // A terminal is dark whatever the theme.
    expect(await pre.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      'rgb(15, 23, 42)',
    )
  } finally {
    await server.close()
  }
})

test('shows two versions of code as a coloured diff', async ({ page }) => {
  const server = await openBlank(page)
  try {
    await runMenuItem(page, 'insert', 'insertCodeDiff')
    const box = dialog(page, 'Diff of two versions')
    await box.locator('[name="before"]').fill('const a = 1\nconst b = 2')
    await box.locator('[name="after"]').fill('const a = 1\nconst b = 3')
    await box.locator('[name="title"]').fill('values.js')
    await box.getByRole('button', { name: 'Insert' }).click()
    const pre = page.locator(`${surface} pre`)
    await expect(pre).toHaveAttribute('data-language', 'diff')
    await expect(pre).toHaveAttribute('data-title', 'values.js')
    await expect(pre.locator('code')).toHaveText(' const a = 1\n-const b = 2\n+const b = 3')
    await expect(pre.locator('.trevixal-code-line--removed')).toHaveCount(1)
    await expect(pre.locator('.trevixal-code-line--added')).toHaveCount(1)
    await expect(pre.locator('.tvx-tok-inserted')).toHaveText('+const b = 3')
  } finally {
    await server.close()
  }
})

test('draws Graphviz and PlantUML diagrams beside Mermaid', async ({ page }) => {
  // The PlantUML server answers here, so the test needs no network for it.
  const asked: string[] = []
  await page.route(
    (url) => url.hostname === 'www.plantuml.com',
    async (route) => {
      asked.push(route.request().url())
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><text x="4" y="20">Alice</text></svg>',
      })
    },
  )
  const server = await openBlank(page)
  try {
    await runMenuItem(page, 'insert', 'insertGraphviz')
    const dot = page.locator(`${surface} pre[data-language="dot"] .trevixal-diagram`)
    await expect(dot.locator('svg')).toBeVisible({ timeout: 20_000 })
    await expect(dot).toContainText('Start')

    await page.keyboard.press('ControlOrMeta+Enter')
    await runMenuItem(page, 'insert', 'insertPlantUML')
    const picture = page.locator(
      `${surface} pre[data-language="plantuml"] img.trevixal-diagram__picture`,
    )
    await expect(picture).toHaveAttribute('src', /^https:\/\/www\.plantuml\.com\/plantuml\/svg\//)
    await expect
      .poll(() => picture.evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)
    expect(asked.length).toBeGreaterThan(0)
  } finally {
    await server.close()
  }
})

test('keeps front matter, and writes and reads MDX', async ({ page }) => {
  const server = await openBlank(page)
  try {
    await page.keyboard.type('Hello')
    await runMenuItem(page, 'file', 'frontMatter')
    const front = dialog(page, 'Front matter')
    await front.locator('[name="yaml"]').fill('title: Notes\ntags: [a, b]')
    await front.getByRole('button', { name: 'Save' }).click()

    const download = page.waitForEvent('download')
    await runMenuItem(page, 'file', 'downloadMdx')
    const file = await download
    expect(file.suggestedFilename()).toMatch(/\.mdx$/)
    const text = await readFile((await file.path()) as string, 'utf8')
    expect(text).toBe('---\ntitle: Notes\ntags: [a, b]\n---\n\nHello\n')

    // An MDX file's imports and components come in as MDX blocks.
    const chooser = page.waitForEvent('filechooser')
    await runMenuItem(page, 'file', 'importDocument')
    await (await chooser).setFiles({
      name: 'post.mdx',
      mimeType: 'text/mdx',
      buffer: Buffer.from(
        "import { Chart } from './chart'\n\n# Results\n\n<Chart data={[1, 2]} />\n",
      ),
    })
    const blocks = page.locator(`${surface} pre[data-language="mdx"]`)
    await expect(blocks).toHaveCount(2)
    await expect(blocks.nth(1)).toHaveText('<Chart data={[1, 2]} />')
    await expect(page.locator(`${surface} h1`)).toHaveText('Results')
  } finally {
    await server.close()
  }
})

test('moves and edits with Vim’s keys, and with Emacs’s', async ({ page }) => {
  const server = await openBlank(page)
  try {
    await page.keyboard.type('hello world')
    await runMenuItem(page, 'tools', 'keysVim')
    const mode = page.locator('#key-mode')
    await expect(mode).toHaveText('-- NORMAL --')
    await page.locator(`${surface} > p`).click()
    // 0 to the start of the line, x deletes, w moves a word, i types.
    await page.keyboard.press('0')
    await page.keyboard.press('x')
    await expect(page.locator(`${surface} > p`)).toHaveText('ello world')
    await page.keyboard.press('w')
    await page.keyboard.press('i')
    await expect(mode).toHaveText('-- INSERT --')
    await page.keyboard.type('big ')
    await expect(page.locator(`${surface} > p`)).toHaveText('ello big world')
    await page.keyboard.press('Escape')
    await expect(mode).toHaveText('-- NORMAL --')
    await page.keyboard.press('u')
    await expect(page.locator(`${surface} > p`)).not.toHaveText('ello big world')

    await runMenuItem(page, 'tools', 'keysEmacs')
    await expect(mode).toBeHidden()
    await page.locator(`${surface} > p`).click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('>')
    await page.keyboard.press('Control+e')
    await page.keyboard.type('<')
    const text = (await page.locator(`${surface} > p`).textContent()) ?? ''
    expect(text.startsWith('>')).toBe(true)
    expect(text.endsWith('<')).toBe(true)

    await runMenuItem(page, 'tools', 'keysStandard')
    await page.locator(`${surface} > p`).click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('plain')
    await expect(page.locator(`${surface} > p`)).toHaveText('plain')
  } finally {
    await server.close()
  }
})

test('numbers display equations, writes them from a palette, and draws chemistry', async ({
  page,
}) => {
  const server = await openBlank(page)
  try {
    await page.keyboard.type('See ')
    await runMenuItem(page, 'insert', 'insertMathBlock')
    const box = dialog(page, 'Insert display equation')
    await box.getByRole('button', { name: 'Fraction' }).click()
    await page.keyboard.type('a')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.type('b')
    await expect(box.locator('textarea')).toHaveValue('\\frac{a}{b}')
    await expect(box.locator('.trevixal-equation__preview mfrac')).toHaveCount(1)
    await box.locator('[name="numbered"]').check()
    await box.getByRole('button', { name: 'Insert' }).click()
    const equations = page.locator(`${surface} .trevixal-math--block`)
    await expect(equations.first().locator('.trevixal-math__number')).toHaveText('(1)')

    await runMenuItem(page, 'insert', 'insertMathBlock')
    const second = dialog(page, 'Insert display equation')
    await second.locator('textarea').fill('\\ce{2H2 + O2 -> 2H2O}')
    await expect(second.locator('.trevixal-equation__preview msub')).not.toHaveCount(0)
    await second.locator('[name="numbered"]').check()
    await second.getByRole('button', { name: 'Insert' }).click()
    await expect(equations).toHaveCount(2)
    await expect(equations.nth(1).locator('.trevixal-math__number')).toHaveText('(2)')
    await expect(equations.nth(1).locator('merror')).toHaveCount(0)

    // A cross-reference to the second reads its number.
    await page.locator(`${surface} > p`).first().click()
    await page.keyboard.press('End')
    await runMenuItem(page, 'insert', 'insertCrossReference')
    const reference = dialog(page, 'Insert cross-reference')
    await reference.locator('[name="target"]').selectOption({ label: 'Equation (2)' })
    await reference.getByRole('button', { name: 'Insert' }).click()
    const xref = page.locator(`${surface} .trevixal-xref`)
    await expect(xref).toHaveText('Equation (2)')

    // A double-click edits one; numbered no longer, the next takes its
    // number, and the reference follows.
    await equations.first().dblclick()
    const edit = dialog(page, 'Edit equation')
    await expect(edit.locator('textarea')).toHaveValue('\\frac{a}{b}')
    await edit.locator('[name="numbered"]').uncheck()
    await edit.getByRole('button', { name: 'Apply' }).click()
    await expect(equations.first().locator('.trevixal-math__number')).toHaveCount(0)
    await expect(equations.nth(1).locator('.trevixal-math__number')).toHaveText('(1)')
    await expect(xref).toHaveText('Equation (1)')
  } finally {
    await server.close()
  }
})
