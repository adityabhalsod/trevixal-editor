import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Locator, type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

/**
 * The advanced formatting tools, in a real browser: borders and shading, drop
 * caps, hyphenation and widow control, text columns, tab stops and their
 * leaders, AutoFormat and AutoCorrect as you type, and named styles with the
 * Styles pane. Layout is the point of most of them, and only a browser lays
 * text out.
 */
const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/full-editor/dist')

/** CSS pixels in a centimetre. */
const PX_PER_CM = 96 / 2.54

async function runMenuItem(page: Page, menu: string, item: string): Promise<void> {
  await page.click(`[data-trevixal-menu="${menu}"]`)
  await page.click(`[data-trevixal-menu="${menu}"] ~ * [data-trevixal-item="${item}"]`)
}

/** Fill the open dialog and submit it. Selects are chosen, the rest typed. */
async function submitDialog(page: Page, values: Readonly<Record<string, string>>): Promise<void> {
  const dialog = page.locator('.trevixal-dialog')
  await expect(dialog).toBeVisible()
  for (const [name, value] of Object.entries(values)) {
    const field = dialog.locator(`[name="${name}"]`)
    if ((await field.evaluate((element) => element.tagName)) === 'SELECT') {
      await field.selectOption(value)
    } else {
      await field.fill(value)
    }
  }
  await dialog.locator('.trevixal-dialog__button--primary').click()
  await expect(dialog).toHaveCount(0)
}

/**
 * A paragraph of its own under the demo's title, holding `text`, with the
 * caret at its end. Found by where it is, since AutoFormat may change the text.
 */
async function freshParagraph(page: Page, text: string): Promise<Locator> {
  await page.locator('#editor .trevixal-content > h1').first().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type(text)
  return page.locator('#editor .trevixal-content > h1 + p').first()
}

/** Double-click `word` in `block`, the way a writer selects a word. */
async function doubleClickWord(block: Locator, word: string): Promise<void> {
  const centre = await block.evaluate((element, target) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(target) ?? -1
      if (at < 0) continue
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + target.length)
      const rect = range.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }
    return null
  }, word)
  if (!centre) throw new Error(`no “${word}” in the block`)
  await block.page().mouse.dblclick(centre.x, centre.y)
}

test.describe('the formatting tools of the built demo', () => {
  // The seeded demo embeds a YouTube video, which holds the load event on a
  // machine without a network; nothing here needs it.
  test.beforeEach(async ({ page }) => {
    await page.route(/youtube/, (route) => route.abort())
  })

  test('borders, shading and a drop cap go on the paragraph and show on it', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const paragraph = await freshParagraph(page, 'Once upon a time there was a boxed paragraph')
      await runMenuItem(page, 'format', 'bordersAndShading')
      // A field for one choice only shows once that choice is made.
      await expect(page.locator('.trevixal-dialog [name="shading"]')).toBeHidden()
      await submitDialog(page, {
        sides: 'box',
        style: 'dashed',
        width: '2',
        fill: 'custom',
        shading: '#fff3c4',
      })
      const drawn = await paragraph.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          top: style.borderTopStyle,
          left: style.borderLeftWidth,
          fill: style.backgroundColor,
        }
      })
      expect(drawn).toEqual({ top: 'dashed', left: '2px', fill: 'rgb(255, 243, 196)' })

      await runMenuItem(page, 'format', 'dropCap-drop')
      await expect(paragraph).toHaveAttribute('data-drop-cap', 'drop')
      const letter = await paragraph.evaluate((element) => {
        const first = getComputedStyle(element, '::first-letter')
        return {
          float: first.float,
          ratio:
            Number.parseFloat(first.fontSize) /
            Number.parseFloat(getComputedStyle(element).fontSize),
        }
      })
      expect(['left', 'inline-start']).toContain(letter.float)
      // Three lines of body text tall.
      expect(letter.ratio).toBeGreaterThan(3.5)
    } finally {
      await server.close()
    }
  })

  test('hyphenation, widow control and text columns are the whole document’s', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const surface = page.locator('#editor .trevixal-content')
      await runMenuItem(page, 'format', 'hyphenation')
      await runMenuItem(page, 'format', 'widowControl')
      await runMenuItem(page, 'format', 'textColumns-2')
      await runMenuItem(page, 'format', 'textColumnsRule')
      await expect(surface).toHaveAttribute('data-widow-control', 'off')
      const settings = await surface.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          hyphens: style.hyphens || style.getPropertyValue('-webkit-hyphens'),
          // Firefox has no widows or orphans to set, and breaks pages without them.
          widows: CSS.supports('widows', '1') ? style.widows : '1',
          columns: style.columnCount,
          rule: style.columnRuleStyle,
        }
      })
      expect(settings).toEqual({ hyphens: 'auto', widows: '1', columns: '2', rule: 'solid' })
      // The text runs down one column and on into the next.
      const lefts = await surface.evaluate((element) =>
        [...element.querySelectorAll(':scope > p')].map((block) =>
          Math.round(block.getBoundingClientRect().left),
        ),
      )
      expect(new Set(lefts).size).toBeGreaterThan(1)
    } finally {
      await server.close()
    }
  })

  test('a tab takes the text after it to its stop, with the stop’s leader, on screen and in print', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.addInitScript(() => {
        window.print = () => undefined
      })
      await page.goto(server.origin)
      const paragraph = await freshParagraph(page, 'Results')
      await runMenuItem(page, 'format', 'tabStops')
      await submitDialog(page, { stops: '12 cm right dot' })
      await expect(paragraph).toHaveAttribute('data-tab-stops', /right dot/)
      await paragraph.click()
      await page.keyboard.press('End')
      // Tab types a tab in a paragraph with tab stops of its own.
      await page.keyboard.press('Tab')
      await page.keyboard.type('12')
      const tab = paragraph.locator('.trevixal-tab')
      await expect(tab).toHaveAttribute('data-leader', 'dot')

      /** How far the right-aligned text after the tab is from the stop, which is 12 cm from the margin. */
      const offStop = (block: Locator) =>
        block.evaluate((element, stop) => {
          const style = getComputedStyle(element)
          const margin =
            element.getBoundingClientRect().left - (Number.parseFloat(style.marginInlineStart) || 0)
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
          let last: Node | null = null
          for (let node = walker.nextNode(); node; node = walker.nextNode()) last = node
          if (!last) return Number.POSITIVE_INFINITY
          const range = document.createRange()
          range.selectNodeContents(last)
          return Math.abs(range.getBoundingClientRect().right - margin - stop)
        }, 12 * PX_PER_CM)
      await expect.poll(() => offStop(paragraph)).toBeLessThan(2)

      // The print lays its own tabs out, at the printed width.
      await runMenuItem(page, 'file', 'print')
      const frame = page.frameLocator('.trevixal-print-frame')
      const printed = frame.locator('p', { hasText: /^Results\s*12$/ })
      await expect(printed.locator('.trevixal-tab')).toHaveAttribute('data-leader', 'dot')
      await expect.poll(() => offStop(printed)).toBeLessThan(2)
    } finally {
      await server.close()
    }
  })

  test('a stop past the end of a narrow column is taken as that end, keeping the line whole', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await runMenuItem(page, 'format', 'textColumns-3')
      const paragraph = await freshParagraph(page, 'Total')
      await runMenuItem(page, 'format', 'tabStops')
      await submitDialog(page, { stops: '12 cm decimal dot' })
      await paragraph.click()
      await page.keyboard.press('End')
      await page.keyboard.press('Tab')
      await page.keyboard.type('£95.00')
      await expect(paragraph.locator('.trevixal-tab')).toHaveAttribute('data-leader', 'dot')
      // The figure, decimals and all, ends flush with the column, on the line it started on.
      const fit = () =>
        paragraph.evaluate((element) => {
          const style = getComputedStyle(element)
          const end =
            element.getBoundingClientRect().right -
            (Number.parseFloat(style.paddingRight) || 0) -
            (Number.parseFloat(style.borderRightWidth) || 0)
          const texts: Node[] = []
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
          for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node)
          const rectOf = (node: Node | undefined) => {
            const range = document.createRange()
            if (node) range.selectNodeContents(node)
            return range.getBoundingClientRect()
          }
          const first = rectOf(texts[0])
          const last = rectOf(texts[texts.length - 1])
          return { oneLine: Math.abs(first.top - last.top) < 2, offEnd: Math.abs(last.right - end) }
        })
      await expect.poll(async () => (await fit()).oneLine).toBe(true)
      expect((await fit()).offEnd).toBeLessThan(2)
    } finally {
      await server.close()
    }
  })

  test('quotes curl and words correct as they are typed, and one undo takes a change back', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const paragraph = await freshParagraph(page, '"teh" ')
      await expect(paragraph).toHaveText('“the”')
      // Straight after a correction, undo gives back what was typed.
      await page.keyboard.press('ControlOrMeta+z')
      await expect(paragraph).toHaveText('“teh”')

      // Switched off in Tools, a quote stays as typed.
      await runMenuItem(page, 'tools', 'smartTypography')
      await paragraph.click()
      await page.keyboard.press('End')
      await page.keyboard.type('"x"')
      await expect(paragraph).toHaveText('“teh” "x"')
    } finally {
      await server.close()
    }
  })

  test('the Styles pane restyles every body paragraph at once, and applies styles', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const paragraph = await freshParagraph(page, 'A body paragraph in the Normal style')
      await runMenuItem(page, 'format', 'stylesPane')
      const pane = page.locator('.trevixal-styles')
      await expect(pane).toBeVisible()
      await expect(
        pane.locator('[data-style-id="normal"] .trevixal-styles__apply'),
      ).toHaveAttribute('aria-pressed', 'true')

      await pane.locator('[aria-label="Modify Normal…"]').click()
      await submitDialog(page, { fontSize: '20' })
      // Every body paragraph follows: 20 pt is 26.67 px.
      const sizes = await page.evaluate(() =>
        [
          ...document.querySelectorAll('#editor .trevixal-content > p:not([data-paragraph-style])'),
        ].map(
          (element) => Math.round(Number.parseFloat(getComputedStyle(element).fontSize) * 10) / 10,
        ),
      )
      expect(sizes.length).toBeGreaterThan(3)
      expect(new Set(sizes)).toEqual(new Set([26.7]))

      // Title, from the pane, on the paragraph at the caret.
      await paragraph.click()
      await pane.locator('[data-style-id="title"] .trevixal-styles__apply').click()
      await expect(paragraph).toHaveAttribute('data-paragraph-style', 'title')
      await expect(pane.locator('[data-style-id="title"] .trevixal-styles__apply')).toHaveAttribute(
        'aria-pressed',
        'true',
      )

      // A character style on a selected word.
      await doubleClickWord(paragraph, 'body')
      await pane.locator('[data-style-id="strong"] .trevixal-styles__apply').click()
      const strong = paragraph.locator('[data-char-style="strong"]')
      await expect(strong).toHaveText('body')
      expect(await strong.evaluate((element) => getComputedStyle(element).fontWeight)).toBe('700')
    } finally {
      await server.close()
    }
  })
})
