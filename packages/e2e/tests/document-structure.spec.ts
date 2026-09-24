import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { HEADING_NUMBERING_SCHEMES, type ListNumberingScheme, levelMarker } from '@trevixal/core'
import { serveDist } from './serve-dist'

/**
 * The document-structure features, in a real browser: heading numbers drawn
 * by the stylesheet as the core computes them, captions and the references
 * that follow them, tables of figures, the index, endnotes, line numbers,
 * right-to-left documents and the block menu.
 */
const uiPage = `file://${join(dirname(fileURLToPath(import.meta.url)), '../page/ui.html')}`
const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/full-editor/dist')

async function runMenuItem(page: Page, menu: string, item: string): Promise<void> {
  await page.click(`[data-trevixal-menu="${menu}"]`)
  await page.click(`[data-trevixal-menu="${menu}"] ~ * [data-trevixal-item="${item}"]`)
}

/** Fill the open dialog and submit it. Selects are chosen, text is typed. */
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

/** Put the caret at the end of the `index`-th block of the demo's document. */
async function caretAtEnd(page: Page, index: number): Promise<void> {
  await page.locator('#editor .trevixal-content > *').nth(index).click()
  await page.keyboard.press('End')
}

/**
 * The lines of text in the drop-cap paragraph under `root`, and how many of
 * them have a line number level with them. Run in the page, where the numbers
 * are a layer beside the text, and in the print, where each hangs inside its
 * line. The letter is left out, since it spans lines, and so are the digits
 * of the print's own numbers.
 */
function dropCapLines(root: Element): { lines: number; numbered: number } {
  const document = root.ownerDocument
  const paragraph = root.querySelector('p[data-drop-cap]')
  if (!paragraph) return { lines: 0, numbered: 0 }
  const centres: number[] = []
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
  let letter = true
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('.trevixal-line-number')) continue
    const range = document.createRange()
    range.setStart(node, letter ? 1 : 0)
    range.setEnd(node, (node as Text).length)
    letter = false
    // Not a zero-width box: an empty range, past a letter the print has split
    // into a node of its own, still reports one, as tall as the letter.
    for (const rect of range.getClientRects()) {
      if (rect.height > 0 && rect.width > 0) centres.push(rect.top + rect.height / 2)
    }
  }
  const lines: number[] = []
  for (const centre of centres.sort((a, b) => a - b)) {
    if (lines.length === 0 || centre - (lines[lines.length - 1] ?? 0) > 4) lines.push(centre)
  }
  const numbers = [...document.querySelectorAll('.trevixal-line-number')].map((number) => {
    const box = number.getBoundingClientRect()
    return box.top + box.height / 2
  })
  const numbered = lines.filter((line) => numbers.some((number) => Math.abs(number - line) < 4))
  return { lines: lines.length, numbered: numbered.length }
}

test.describe('heading numbers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(uiPage)
  })

  /** The `::before` rule each top-level heading draws, and one in a quote. */
  async function drawnNumbers(page: Page): Promise<string[]> {
    return page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '.trevixal-content h1, .trevixal-content h2, .trevixal-content h3, .trevixal-content h4, .trevixal-content h5, .trevixal-content h6',
        ),
      ].map(
        // Engines differ in spacing, quoting and whether they spell out a
        // default `decimal`; strip it all to compare the rule itself.
        (heading) =>
          getComputedStyle(heading, '::before')
            .content.replace(/[\s"']/g, '')
            .replace(/counter\((tvx-h\d)\)/g, 'counter($1,decimal)'),
      ),
    )
  }

  /** What the stylesheet should draw at `level`, from the table `headingNumbers` reads. */
  function expected(scheme: ListNumberingScheme, level: number): string {
    if (scheme.outline) {
      const parts = Array.from(
        { length: level },
        (_, index) => `counter(tvx-h${index + 1},decimal)`,
      )
      return `${parts.join('.')}.`
    }
    return `counter(tvx-h${level},${levelMarker(scheme, level - 1)})${scheme.suffix}`
  }

  for (const scheme of HEADING_NUMBERING_SCHEMES) {
    test(`the stylesheet numbers every heading level as ${scheme.id} says`, async ({ page }) => {
      const headings = [1, 2, 3, 4, 5, 6].map((level) => ({
        type: 'heading',
        attrs: { level },
        content: [{ type: 'text', text: `Level ${level}` }],
      }))
      await page.evaluate((doc) => window.uiPage.editor.setContent(doc as never), {
        type: 'doc',
        attrs: { headingNumbering: scheme.id },
        content: [
          ...headings,
          // A heading inside another block is not numbered, as the core counts.
          {
            type: 'blockquote',
            content: [
              { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Quoted' }] },
            ],
          },
        ],
      })
      const drawn = await drawnNumbers(page)
      expect(drawn.slice(0, 6)).toEqual([1, 2, 3, 4, 5, 6].map((level) => expected(scheme, level)))
      expect(drawn[6]).toBe('none')
    })
  }
})

test.describe('the document-structure features of the built demo', () => {
  // The seeded demo embeds a YouTube video, which holds the load event on a
  // machine without a network; nothing here needs it.
  test.beforeEach(async ({ page }) => {
    await page.route(/youtube/, (route) => route.abort())
  })

  test('captions number themselves, and a cross-reference follows its figure', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const surface = page.locator('#editor .trevixal-content')
      await caretAtEnd(page, 2)
      await runMenuItem(page, 'insert', 'insertCaption')
      await submitDialog(page, { kind: 'figure', text: 'A cat' })
      // Figures only: the tour captions a table of its own further down.
      const figures = surface.locator('.trevixal-caption-number[data-caption="figure"]')
      await expect(figures).toHaveText(['1'])

      await caretAtEnd(page, 0)
      await runMenuItem(page, 'insert', 'insertCrossReference')
      const option = page.locator('.trevixal-dialog [name="target"] option', {
        hasText: 'Figure 1: A cat',
      })
      await submitDialog(page, {
        target: (await option.getAttribute('value')) ?? '',
        format: 'label',
      })
      // The one just made, at the end of the heading, before the tour's own.
      const reference = surface.locator('.trevixal-xref').first()
      await expect(reference).toHaveText('Figure 1')

      // A figure before it makes it Figure 2, and the reference follows.
      await caretAtEnd(page, 1)
      await runMenuItem(page, 'insert', 'insertCaption')
      await submitDialog(page, { kind: 'figure', text: 'Earlier' })
      await expect(reference).toHaveText('Figure 2')

      // Ctrl+click takes the caret to the caption it names.
      await reference.click({ modifiers: ['Control'] })
      const caretIn = await page.evaluate(
        () => window.getSelection()?.anchorNode?.parentElement?.closest('p')?.textContent,
      )
      expect(caretIn).toContain('A cat')
    } finally {
      await server.close()
    }
  })

  test('a table of figures, an index and endnotes build themselves from the text', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const surface = page.locator('#editor .trevixal-content')
      await caretAtEnd(page, 1)
      await runMenuItem(page, 'insert', 'captionList-figure')
      await expect(surface.locator('.trevixal-caption-list__empty')).toBeVisible()
      await caretAtEnd(page, 3)
      await runMenuItem(page, 'insert', 'insertCaption')
      await submitDialog(page, { kind: 'figure', text: 'The view' })
      // The table of figures, not the tour's own list of tables.
      await expect(
        surface.locator('.trevixal-caption-list[data-caption-list="figure"] .trevixal-ref-link'),
      ).toHaveText(['Figure 1: The view'])

      // Mark a word, and the index files it.
      await surface.locator('> p').first().dblclick()
      await runMenuItem(page, 'insert', 'markIndexEntry')
      await submitDialog(page, { sub: '' })
      // Collapse the selection, or the formatting bubble covers the text.
      await page.keyboard.press('ArrowRight')
      await caretAtEnd(page, 0)
      await runMenuItem(page, 'insert', 'insertDocumentIndex')
      // The new index, first in the document: the word just marked, and the
      // four the tour marks for its own index further down.
      await expect(surface.locator('.trevixal-index').first().locator('li')).toHaveCount(5)

      await caretAtEnd(page, 0)
      await runMenuItem(page, 'insert', 'insertEndnote')
      // A note takes the lowest number no other note has, as a footnote does,
      // so the new one, first in the document, is ii: the tour's own is i.
      await expect(surface.locator('.trevixal-endnote-ref')).toHaveText(['ii', 'i'])
      await expect(surface.locator('> .trevixal-endnotes')).toHaveCount(1)
    } finally {
      await server.close()
    }
  })

  test('numbers every line in the margin, on screen and in the print', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.addInitScript(() => {
        window.print = () => undefined
      })
      await page.goto(server.origin)
      await runMenuItem(page, 'format', 'lineNumbers')
      const numbers = page.locator('.trevixal-line-numbers .trevixal-line-number')
      await expect(numbers.first()).toHaveText('1')
      const count = await numbers.count()
      expect(count).toBeGreaterThan(5)

      // The first number sits on the first line of text, in the margin before
      // it. Read in one go: the layer redraws as fonts and sizes settle.
      const placement = await page.evaluate(() => {
        const number = document.querySelector('.trevixal-line-numbers .trevixal-line-number')
        const text = document.querySelector('#editor .trevixal-content > *')
        if (!number || !text) return null
        const drawn = number.getBoundingClientRect()
        const line = text.getBoundingClientRect()
        return {
          gap: Math.abs(drawn.top - line.top),
          height: drawn.height,
          right: drawn.right,
          left: line.left,
        }
      })
      expect(placement).not.toBeNull()
      expect(placement?.gap).toBeLessThan(placement?.height ?? 0)
      expect(placement?.right).toBeLessThanOrEqual(placement?.left ?? 0)

      // The print numbers its own lines, laid out at the printed width: each
      // number inside the printed area, in the gutter, level with its line.
      await runMenuItem(page, 'file', 'print')
      const frame = page.frameLocator('.trevixal-print-frame')
      await expect(frame.locator('.trevixal-line-number').first()).toHaveText('1')
      const printed = await frame.locator('body').evaluate(() => {
        const numbers = [...document.querySelectorAll('.trevixal-line-number')]
        const content = document.querySelector('.trevixal-content > [data-trevixal-document]')
        if (!content) return null
        const text = content.getBoundingClientRect()
        const padding = Number.parseFloat(getComputedStyle(content).paddingLeft)
        return numbers.map((number) => {
          const drawn = number.getBoundingClientRect()
          // The anchor the number hangs on is its line's first character.
          const line = number.parentElement?.getBoundingClientRect()
          return {
            inGutter: drawn.left >= text.left && drawn.right <= text.left + padding,
            level: line
              ? Math.abs(drawn.top + drawn.height / 2 - (line.top + line.height / 2))
              : 99,
          }
        })
      })
      expect(printed?.length).toBeGreaterThan(5)
      for (const number of printed ?? []) {
        expect(number.inGutter).toBe(true)
        expect(number.level).toBeLessThan(4)
      }
    } finally {
      await server.close()
    }
  })

  test('a drop cap’s lines take a number each, on screen and in the print', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.addInitScript(() => {
        window.print = () => undefined
      })
      await page.goto(server.origin)
      await runMenuItem(page, 'format', 'lineNumbers')
      await expect(
        page.locator('.trevixal-line-numbers .trevixal-line-number').first(),
      ).toBeVisible()

      // The letter is three lines tall, and each line beside it is a line.
      // Asked until it holds: the diagram further up draws late, from a CDN,
      // and the numbers follow the text down a frame after it moves.
      const surface = page.locator('#editor .trevixal-content')
      await expect(surface.locator('.trevixal-diagram svg')).toHaveCount(1)
      await expect
        .poll(async () => {
          const onScreen = await surface.evaluate(dropCapLines)
          return onScreen.lines - onScreen.numbered
        })
        .toBe(0)
      expect((await surface.evaluate(dropCapLines)).lines).toBeGreaterThanOrEqual(3)

      await runMenuItem(page, 'file', 'print')
      const frame = page.frameLocator('.trevixal-print-frame')
      await expect(frame.locator('.trevixal-line-number').first()).toHaveText('1')
      const printed = await frame.locator('.trevixal-content').evaluate(dropCapLines)
      expect(printed.lines).toBeGreaterThanOrEqual(3)
      expect(printed.numbered).toBe(printed.lines)
    } finally {
      await server.close()
    }
  })

  test('the numbers stand right-aligned in a gutter of their own, clear of the page edge and the block grip', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await runMenuItem(page, 'format', 'lineNumbers')
      await page.locator('#editor .trevixal-content > h1').hover()
      await expect(page.locator('.trevixal-blockgrip')).toBeVisible()
      const layout = await page.evaluate(() => {
        const surface = document.querySelector('#editor .trevixal-content') as HTMLElement
        const inside = surface.getBoundingClientRect().left + surface.clientLeft
        const grip = (
          document.querySelector('.trevixal-blockgrip') as HTMLElement
        ).getBoundingClientRect()
        const numbers = [
          ...document.querySelectorAll('.trevixal-line-numbers .trevixal-line-number'),
        ].map((number) => number.getBoundingClientRect())
        const rights = numbers.map((number) => number.right)
        return {
          count: numbers.length,
          fromEdge: Math.min(...numbers.map((number) => number.left)) - inside,
          spread: Math.max(...rights) - Math.min(...rights),
          beforeGrip: grip.left - Math.max(...rights),
        }
      })
      expect(layout.count).toBeGreaterThan(5)
      // Inside the page, where they used to sit on its border.
      expect(layout.fromEdge).toBeGreaterThanOrEqual(0)
      // Right-aligned, as a code editor's are, all ending at one edge...
      expect(layout.spread).toBeLessThan(1)
      // ...which the grip beside a block does not reach.
      expect(layout.beforeGrip).toBeGreaterThanOrEqual(0)
    } finally {
      await server.close()
    }
  })

  test('the number of the line holding the caret is lit, and follows it', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await runMenuItem(page, 'format', 'lineNumbers')
      const lit = page.locator('.trevixal-line-numbers .trevixal-line-number--active')

      // The start of the first paragraph: the document's second line, after the title.
      await page
        .locator('#editor .trevixal-content > p')
        .first()
        .click({ position: { x: 4, y: 6 } })
      await expect(lit).toHaveCount(1)
      await expect(lit).toHaveText('2')
      // Lit in a colour of its own, the rest all in a quieter one.
      const colours = await page.evaluate(
        () =>
          new Set(
            [...document.querySelectorAll('.trevixal-line-numbers .trevixal-line-number')].map(
              (number) => getComputedStyle(number).color,
            ),
          ).size,
      )
      expect(colours).toBe(2)

      // Down a line, once the surface has focus: a click resolves before a
      // loaded browser has handed it over, and the key would go to the page.
      await expect
        .poll(() =>
          page.evaluate(() => !!document.activeElement?.closest('#editor .trevixal-content')),
        )
        .toBe(true)
      await page.keyboard.press('ArrowDown')
      await expect(lit).toHaveText('3')
    } finally {
      await server.close()
    }
  })

  test('a right-to-left document turns the text and the chrome round', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const file = page.locator('[data-trevixal-menu="file"]')
      const help = page.locator('[data-trevixal-menu="help"]')
      const before = [(await file.boundingBox())?.x ?? 0, (await help.boundingBox())?.x ?? 0]
      expect(before[0]).toBeLessThan(before[1] as number)

      await runMenuItem(page, 'format', 'documentRightToLeft')
      await expect(page.locator('#editor .trevixal-content')).toHaveAttribute('dir', 'rtl')
      // The menus now run from the right: File comes after Help, reading left to right.
      await expect
        .poll(
          async () => ((await file.boundingBox())?.x ?? 0) > ((await help.boundingBox())?.x ?? 0),
        )
        .toBe(true)

      // The block grip moves to where the lines start: the right.
      const paragraph = page.locator('#editor .trevixal-content > p').first()
      await paragraph.hover()
      const grip = page.locator('.trevixal-blockgrip')
      await expect(grip).toBeVisible()
      const gripBox = await grip.boundingBox()
      const blockBox = await paragraph.boundingBox()
      expect(gripBox?.x ?? 0).toBeGreaterThanOrEqual(
        (blockBox?.x ?? 0) + (blockBox?.width ?? 0) - 1,
      )
    } finally {
      await server.close()
    }
  })

  test('the block menu duplicates a block and turns it into a heading', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const blocks = page.locator('#editor .trevixal-content > *')
      const count = await blocks.count()
      const paragraph = page.locator('#editor .trevixal-content > p').first()
      const words = (await paragraph.textContent()) ?? ''
      await paragraph.hover()
      const grip = page.locator('.trevixal-blockgrip')
      await expect(grip).toBeVisible()
      await grip.click()
      const menu = page.locator('.trevixal-blockmenu')
      await expect(menu).toBeVisible()
      await menu.getByRole('menuitem', { name: 'Duplicate' }).click()
      await expect(blocks).toHaveCount(count + 1)

      await paragraph.hover()
      await grip.click()
      await menu.getByRole('menuitem', { name: 'Heading 2' }).click()
      await expect(page.locator('#editor .trevixal-content > h2', { hasText: words })).toHaveCount(
        1,
      )
    } finally {
      await server.close()
    }
  })
})
