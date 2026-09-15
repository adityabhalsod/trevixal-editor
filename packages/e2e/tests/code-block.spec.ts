import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/full-editor/dist')

/** Empty the seeded document and turn the one remaining block into a code block. */
async function freshCodeBlock(page: Page): Promise<void> {
  await page.locator('#editor .trevixal-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.click('[data-trevixal-item="blockFormat"] .trevixal-dropdown__trigger')
  await page.click('.trevixal-select__option:text-is("Paragraph")')
  await page.click('[data-trevixal-item="codeBlock"]')
  await expect(page.locator('#editor .trevixal-content pre')).toHaveCount(1)
}

const codeText = (page: Page) =>
  page
    .locator('#editor .trevixal-content pre')
    .first()
    .evaluate((pre) => pre.textContent ?? '')

test.describe('code blocks', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 })
  })

  test('shows what Enter and Ctrl+Enter do while the caret is in a block', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const bar = page.locator('.trevixal-codelang')
      await expect(bar).toBeHidden()

      await page.locator('#editor pre').first().click()
      await expect(bar).toBeVisible()
      const hint = bar.locator('.trevixal-codelang__hint')
      await expect(hint).toBeVisible()
      // Both keys named, as key caps; the modifier is Ctrl on this platform.
      await expect(hint.locator('kbd')).toHaveText(['Enter', 'Ctrl', 'Enter'])
      await expect(hint).toContainText('new line')
      await expect(hint).toContainText('leave block')
      // And the language picker is still there beside it.
      await expect(bar.locator('.trevixal-codelang__label')).toHaveText('TypeScript')

      await page.locator('#editor .trevixal-content > p').first().click()
      await expect(bar).toBeHidden()
    } finally {
      await server.close()
    }
  })

  test('Ctrl+Enter leaves the block from the middle of it', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const block = page.locator('#editor pre').first()
      const before = await block.textContent()
      // Somewhere inside the first line, nowhere near the end.
      await block.locator('text=Twelve').click()
      await page.keyboard.press('Control+Enter')
      await page.keyboard.type('after the code')

      // A new paragraph right after the block holds the typing; the code is
      // exactly as it was.
      const next = block.locator('xpath=following-sibling::*[1]')
      await expect(next).toHaveText('after the code')
      expect(await next.evaluate((el) => el.tagName)).toBe('P')
      expect(await block.textContent()).toBe(before)
    } finally {
      await server.close()
    }
  })

  test('Enter keeps the indentation of the line it leaves', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      // The Python block: its second line is indented four spaces. The caret
      // goes to the end of that line by DOM range. A click lands on whichever
      // highlighted token is under the pointer, which is not a line.
      const block = page.locator('#editor pre').filter({ hasText: 'def summarize' })
      await block.click()
      await block.evaluate((pre) => {
        const target = (pre.textContent ?? '').indexOf(
          '\n',
          (pre.textContent ?? '').indexOf('\n') + 1,
        )
        const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT)
        let passed = 0
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const length = node.textContent?.length ?? 0
          if (passed + length >= target) {
            const range = document.createRange()
            range.setStart(node, target - passed)
            range.collapse(true)
            const selection = window.getSelection()
            selection?.removeAllRanges()
            selection?.addRange(range)
            return
          }
          passed += length
        }
        throw new Error('second line not found')
      })
      await page.keyboard.press('Enter')
      await page.keyboard.type('pass')

      const lines = ((await block.textContent()) ?? '').split('\n')
      expect(lines[1]).toBe('    total = sum(row.value for row in rows)')
      expect(lines[2]).toBe('    pass')
    } finally {
      await server.close()
    }
  })

  test('brackets and quotes close themselves, and Enter between them opens a block', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await freshCodeBlock(page)

      await page.keyboard.type('f(')
      expect(await codeText(page)).toBe('f()')
      // Typing the closer steps over the one already there.
      await page.keyboard.type(')')
      expect(await codeText(page)).toBe('f()')
      await page.keyboard.type(' {')
      expect(await codeText(page)).toBe('f() {}')
      await page.keyboard.press('Enter')
      await page.keyboard.type('return "x"')
      expect(await codeText(page)).toBe('f() {\n  return "x"\n}')

      // Backspace inside an empty pair removes both halves.
      await page.keyboard.type('[')
      expect(await codeText(page)).toBe('f() {\n  return "x"[]\n}')
      await page.keyboard.press('Backspace')
      expect(await codeText(page)).toBe('f() {\n  return "x"\n}')
    } finally {
      await server.close()
    }
  })

  test('a quote after a word is left alone', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await freshCodeBlock(page)
      await page.keyboard.type("don't")
      expect(await codeText(page)).toBe("don't")
    } finally {
      await server.close()
    }
  })

  test('code blocks are not spell-checked', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('#editor pre')
      const blocks = page.locator('#editor pre')
      expect(await blocks.count()).toBeGreaterThan(0)
      for (const block of await blocks.all()) {
        await expect(block).toHaveAttribute('spellcheck', 'false')
      }
    } finally {
      await server.close()
    }
  })

  test.describe('copying', () => {
    // Reading the clipboard back needs a permission only Chromium implements
    // in Playwright; the copy path itself is covered by unit tests elsewhere.
    test.skip(({ browserName }) => browserName !== 'chromium', 'clipboard-read is Chromium-only')
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

    test('the copy button puts the block on the clipboard', async ({ page }) => {
      const server = await serveDist(distDir)
      try {
        await page.goto(server.origin)
        const block = page.locator('#editor pre').first()
        await block.click()
        const copy = page.locator('.trevixal-codelang__copy')
        await expect(copy).toBeVisible()
        await copy.click()
        await expect(copy).toHaveAttribute('data-state', 'copied')
        await expect(copy).toContainText('Copied')

        const clipboard = await page.evaluate(() => navigator.clipboard.readText())
        expect(clipboard).toBe(await block.textContent())
        // Copying is chrome, not editing: the caret stays in the block.
        await expect(page.locator('.trevixal-codelang')).toBeVisible()
      } finally {
        await server.close()
      }
    })
  })
})
