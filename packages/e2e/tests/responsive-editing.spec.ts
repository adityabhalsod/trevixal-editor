import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { scrollbarWidthIsReadable } from './engine'
import { serveDist } from './serve-dist'

const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/full-editor/dist')

test.describe('responsive chrome and code editing', () => {
  test('wraps the toolbar and menubar on a narrow viewport instead of scrolling them', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.setViewportSize({ width: 1400, height: 900 })
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-toolbar')

      const measure = async (width: number) => {
        await page.setViewportSize({ width, height: 900 })
        await page.waitForTimeout(150)
        return page.evaluate(() => {
          const bars = ['.trevixal-menubar', '.trevixal-toolbar'].map(
            (selector) => document.querySelector(selector) as HTMLElement,
          )
          const controls = document.querySelectorAll<HTMLElement>(
            '.trevixal-menubar button, .trevixal-toolbar button',
          )
          return {
            scrollsSideways: bars.some((bar) => bar.scrollWidth > bar.clientWidth + 1),
            // Hidden panels report an empty box at the origin, which passes.
            offscreen: [...controls].filter((control) => {
              const box = control.getBoundingClientRect()
              return box.left < 0 || box.right > window.innerWidth
            }).length,
            pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth,
            toolbarHeight: bars[1].getBoundingClientRect().height,
          }
        })
      }

      const wide = await measure(1400)
      // 320 is the narrowest phone still common, and the menubar's eight
      // triggers do not fit it on one row.
      for (const width of [380, 320]) {
        const narrow = await measure(width)
        // One scrolling row used to replace wrapping here. A sideways scroller
        // shows no scrollbar on a touch screen, so the bar looked cut off after
        // the first few controls: every control has to stay on screen.
        expect(narrow.scrollsSideways).toBe(false)
        expect(narrow.offscreen).toBe(0)
        expect(narrow.pageScrollsSideways).toBe(false)
        expect(narrow.toolbarHeight).toBeGreaterThan(wide.toolbarHeight)
      }
    } finally {
      await server.close()
    }
  })

  test('slims the scrollbar on every dropdown panel', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.locator('.trevixal-menubar__trigger', { hasText: 'Format' }).first().click()

      const measure = () =>
        page.evaluate(() => {
          const panel = [...document.querySelectorAll('.trevixal-dropdown__panel')].find(
            (element) => !(element as HTMLElement).hidden,
          ) as HTMLElement | undefined
          if (!panel) return 'no panel'
          const computed = getComputedStyle(panel)
          const scrolls = panel.scrollHeight > panel.clientHeight
          return `${scrolls ? 'scrolls' : 'fits'}/${computed.scrollbarWidth}`
        })

      // Polled rather than sampled: opening a panel positions and measures it,
      // and the height it settles at is what decides whether it scrolls at
      // all. Read in the same tick as the click, the answer is whatever the
      // panel happened to be mid-open.
      //
      // The Format menu is long enough to scroll, which is what made the
      // default bar visible in the first place; `thin` is the slim one.
      //
      // Not every engine reports a width that came from the stylesheet. See
      // `scrollbarWidthIsReadable`, which measures an element carrying none of
      // our CSS to find out. Where it cannot be read, the half of this that
      // still means something is that the panel scrolls at all, which is the
      // condition that put a scrollbar there in the first place.
      const slim = (await scrollbarWidthIsReadable(page)) ? 'thin' : 'none'
      await expect.poll(measure).toBe(`scrolls/${slim}`)
    } finally {
      await server.close()
    }
  })

  test('indents inside a code block with Tab, without leaving it', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-content pre')

      const block = page.locator('.trevixal-content pre').filter({ hasText: 'def summarize' })
      await block.click()
      // Wait for the focus the click is still handing over. A Tab that arrives
      // before the surface has it does what Tab does to an unfocused page, it
      // moves focus on, so the indent never happens and the block is returned
      // unchanged. Measured at two failures in ten on WebKit, on one worker,
      // with nothing else running: not contention, just a click that had not
      // landed yet.
      await expect(page.locator('.trevixal-content').first()).toBeFocused()
      // Home, not End: Tab inserts at the caret the way any code editor does,
      // while Shift-Tab always outdents from the line's start. They only
      // invert each other from the start of a line.
      await page.keyboard.press('Home')

      const before = (await block.textContent()) ?? ''
      await page.keyboard.press('Tab')

      // Two spaces in, and the caret is still inside the block: Tab used to
      // do nothing here and, without a handler, would move focus away.
      //
      // Polled rather than slept on. A keystroke goes through the input
      // pipeline, the block is re-rendered and its colours are re-run, and how
      // long all that takes is a property of the machine rather than of the
      // editor: 150ms was enough on an idle one and not under a full parallel
      // WebKit run, where this lost about one run in three.
      await expect
        .poll(async () => ((await block.textContent()) ?? '').length)
        .toBe(before.length + 2)

      const stillInside = await page.evaluate(
        () => !!document.activeElement?.closest('.trevixal-content'),
      )
      expect(stillInside).toBe(true)

      await page.keyboard.press('Shift+Tab')
      await expect.poll(async () => (await block.textContent()) ?? '').toBe(before)
    } finally {
      await server.close()
    }
  })

  test('exports a standalone page that carries its own styles', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('#output')

      const html = (await page.locator('#output').textContent()) ?? ''
      expect(html.startsWith('<!doctype html>')).toBe(true)
      // A stylesheet and a base, so the copy renders styled wherever it lands.
      expect(html).toContain('<link rel="stylesheet"')
      expect(html).toContain('<base href=')
      // And the wrappers the stylesheet actually targets.
      expect(html).toContain('class="trevixal-content"')
    } finally {
      await server.close()
    }
  })

  test('spaces the toggle chevron away from its title', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-toggle__summary')

      const gap = await page.evaluate(() =>
        Number.parseFloat(
          getComputedStyle(document.querySelector('.trevixal-toggle__summary') as HTMLElement).gap,
        ),
      )
      // 8px against an 8px chevron read as cramped.
      expect(gap).toBeGreaterThan(8)
    } finally {
      await server.close()
    }
  })

  test('carries its own CSS in the exported page', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('#output')

      const html = (await page.locator('#output').textContent()) ?? ''
      // A link back to the dev server only renders while that server is up.
      // The rules themselves have to travel with the file.
      expect(html).toContain('<style>')
      expect(html).toContain('--tvx-')
      expect(html).toContain('.tvx-tok-keyword')
      // And the URL is well formed, not origin + "./path".
      expect(html).not.toContain('/./assets/')
    } finally {
      await server.close()
    }
  })

  test('names the detected language in the picker', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-content pre')

      await page.locator('.trevixal-content pre').filter({ hasText: 'def summarize' }).click()
      const picker = page.locator('.trevixal-codelang')
      await expect(picker).toBeVisible()

      // Saying "Plain text" over syntax-coloured code contradicts the screen.
      await expect(picker.locator('button').first()).toContainText('Python')
      await expect(picker).toHaveAttribute('data-trevixal-detected', 'true')
    } finally {
      await server.close()
    }
  })

  test('adds a line on Enter inside a code block, and leaves only on the second', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-content pre')

      const blocks = () => page.locator('.trevixal-content pre')
      const block = blocks().filter({ hasText: 'def summarize' })
      await block.click()
      await page.keyboard.press('End')

      const countBefore = await blocks().count()
      const linesBefore = ((await block.textContent()) ?? '').split('\n').length

      await page.keyboard.press('Enter')
      await page.waitForTimeout(150)
      // A newline, not an exit: the seeded block ends in one, and the old
      // check saw that and escaped on the very first press. Lines rather
      // than characters, because the new line keeps its indentation.
      expect(((await block.textContent()) ?? '').split('\n').length).toBe(linesBefore + 1)
      expect(await blocks().count()).toBe(countBefore)
    } finally {
      await server.close()
    }
  })
})
