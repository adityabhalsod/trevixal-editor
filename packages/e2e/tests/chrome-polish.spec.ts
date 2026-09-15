import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/full-editor/dist')

/** Parse `rgb(r, g, b)` into its channels, for a light-vs-dark comparison. */
function channels(colour: string): readonly number[] {
  return (colour.match(/\d+/g) ?? []).slice(0, 3).map(Number)
}

test.describe('chrome polish', () => {
  test('switches the whole page between light and dark', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-content')

      const read = () =>
        page.evaluate(() => ({
          body: getComputedStyle(document.body).backgroundColor,
          content: getComputedStyle(document.querySelector('.trevixal-content') as HTMLElement)
            .backgroundColor,
        }))

      const pick = async (label: string) => {
        await page.locator('.trevixal-menubar__trigger', { hasText: 'View' }).first().click()
        await page.getByText(label, { exact: true }).click()
        await page.waitForTimeout(120)
      }

      // The theme entries live in a View ▸ Theme group now.
      await pick('Dark')
      const dark = await read()
      // Dark has to actually be dark: the earlier bug set the attribute where
      // no selector could see it, so the page stayed white while "working".
      expect(channels(dark.body)[0]).toBeLessThan(80)
      expect(channels(dark.content)[0]).toBeLessThan(80)

      await pick('Light')
      const light = await read()
      expect(channels(light.content)[0]).toBeGreaterThan(200)
    } finally {
      await server.close()
    }
  })

  test('gives the task checkbox room beside its text', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector("[data-type='taskItem']")

      const gap = await page.evaluate(() => {
        const item = document.querySelector("[data-type='taskItem']") as HTMLElement
        const box = getComputedStyle(item, '::before')
        return Number.parseFloat(getComputedStyle(item).paddingLeft) - Number.parseFloat(box.width)
      })
      // It was 2.4px, which read as the tick touching the text.
      expect(gap).toBeGreaterThan(6)
    } finally {
      await server.close()
    }
  })

  test('rotates the toggle chevron as it opens and closes', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-toggle__summary')

      const chevron = () =>
        page.evaluate(
          () =>
            getComputedStyle(
              document.querySelector('.trevixal-toggle__summary') as HTMLElement,
              '::before',
            ).transform,
        )

      const open = await chevron()
      await page.locator('.trevixal-toggle__summary').first().click()
      // Polled rather than waited out. The chevron turns through a CSS
      // transition, and a fixed 250 ms was a guess a loaded machine loses.
      // This was the test WebKit dropped most often on a busy run. The bug it
      // guards against is a rule that compiled to a selector never matching,
      // so both states render the same transform; that never resolves, and a
      // poll which runs out of time still catches it.
      await expect.poll(chevron).not.toBe(open)
    } finally {
      await server.close()
    }
  })

  test('shows help in a themed dialog rather than a native alert', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      // A native alert would block here and time the test out, which is the
      // failure mode this test exists to catch.
      let alerted = false
      page.on('dialog', (dialog) => {
        alerted = true
        void dialog.dismiss()
      })

      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-menubar__trigger')
      await page.locator('.trevixal-menubar__trigger', { hasText: 'Help' }).first().click()
      await page.getByText('Keyboard shortcuts…', { exact: true }).click()

      // Help ▸ Keyboard shortcuts now opens the shortcut manager, which lists
      // every binding and lets the user change it.
      const dialog = page.locator('.trevixal-shortcuts')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('.trevixal-shortcuts__row')).not.toHaveCount(0)
      expect(alerted).toBe(false)

      // Escape closes it, like the form dialog.
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
    } finally {
      await server.close()
    }
  })

  test('keeps the sidebar scrollbar slim and out of the way', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('#sidebar')

      const style = await page.evaluate(() => {
        const el = document.querySelector('#sidebar') as HTMLElement
        const computed = getComputedStyle(el)
        // Force it to overflow, so the panel really is a scrolling one.
        el.style.maxHeight = '80px'
        const scrolls = el.scrollHeight > 80
        el.style.maxHeight = ''
        return {
          width: computed.scrollbarWidth,
          gutter: computed.scrollbarGutter,
          colour: computed.scrollbarColor,
          scrolls,
        }
      })

      expect(style.scrolls).toBe(true)
      // Layout width is not measurable here, headless Chromium uses overlay
      // scrollbars that occupy 0px, so the declarations are what to assert.
      // `auto` is the heavy default this fix replaced.
      expect(style.width).not.toBe('auto')
      // No reserved gutter by design: this panel is permanently on screen, so
      // a reserved strip would be visible for its whole life. The bar overlays
      // instead, and stays transparent until the panel is hovered.
      expect(style.colour).toContain('rgba(0, 0, 0, 0)')
    } finally {
      await server.close()
    }
  })

  test('gives the dropdown label room for its descenders', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-select__label')

      const box = await page.evaluate(() => {
        const label = document.querySelector('.trevixal-select__label') as HTMLElement
        const style = getComputedStyle(label)
        return {
          lineHeight: Number.parseFloat(style.lineHeight),
          fontSize: Number.parseFloat(style.fontSize),
        }
      })

      // `line-height: 1` made the line box exactly the em size, and the
      // label's `overflow: hidden` then cropped the tail of a g.
      expect(box.lineHeight).toBeGreaterThan(box.fontSize)
    } finally {
      await server.close()
    }
  })

  test('keeps the sidebar sticky rather than a cropped box', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('#sidebar')
      const position = await page.evaluate(
        () => getComputedStyle(document.querySelector('#sidebar') as HTMLElement).position,
      )
      // Sticky travels with the page and only scrolls itself once it exceeds
      // the viewport, so in the common case there is no inner bar at all.
      expect(position).toBe('sticky')
    } finally {
      await server.close()
    }
  })

  test('draws the numeral in its icons as a numeral', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-toolbar')

      const measured = await page.evaluate(() => {
        const NS = 'http://www.w3.org/2000/svg'
        const SAMPLES = 200
        /** How far above the glyph's floor still counts as standing on it. */
        const FLOOR = 0.35

        const surface = document.createElementNS(NS, 'svg') as SVGSVGElement
        surface.setAttribute('viewBox', '0 0 24 24')
        document.body.appendChild(surface)

        const read = (item: string) => {
          const source = document.querySelector(
            `[data-trevixal-item="${item}"] svg path`,
          ) as SVGPathElement
          // Each icon is one `d`; the numeral is its last subpath, and every
          // one of them starts with an absolute M, so it stands on its own.
          const glyph = document.createElementNS(NS, 'path') as SVGPathElement
          glyph.setAttribute('d', (source.getAttribute('d') ?? '').split(/(?=[Mm])/).pop() ?? '')
          // Measured in a surface of this test's own rather than in the
          // toolbar's: the same item also sits in a menu, which is closed, and
          // geometry inside a `display: none` subtree is either zero or an
          // error depending on the engine.
          surface.appendChild(glyph)
          const box = glyph.getBBox()

          // Walk the outline and note how much of the glyph's width is spent
          // along its floor. A 2 closes with a bar there and covers nearly all
          // of it; the arc-and-tail these used to draw reaches the floor at a
          // point, which is why it read as a question mark.
          const total = glyph.getTotalLength()
          let left = Number.POSITIVE_INFINITY
          let right = Number.NEGATIVE_INFINITY
          for (let step = 0; step <= SAMPLES; step++) {
            const point = glyph.getPointAtLength((total * step) / SAMPLES)
            if (point.y > box.y + box.height - FLOOR) {
              left = Math.min(left, point.x)
              right = Math.max(right, point.x)
            }
          }
          glyph.remove()
          return { width: box.width, height: box.height, footing: (right - left) / box.width }
        }

        const measurements = {
          superscript: read('superscript'),
          subscript: read('subscript'),
          orderedList: read('orderedList'),
        }
        surface.remove()
        return measurements
      })

      for (const [name, glyph] of Object.entries(measured)) {
        // Of a 24-unit box, drawn at 18px. Below roughly this the numeral
        // stops being a numeral and becomes three grey pixels, which is what
        // `orderedList` did while it tried to fit 1, 2 and 3 into one column.
        expect(glyph.width, `${name}: numeral width`).toBeGreaterThan(3.4)
        expect(glyph.height, `${name}: numeral height`).toBeGreaterThan(4.4)
        // Measured at 0.99 and 1.0 for these three, and at 0.50 for the
        // question mark that stood in for the 2.
        expect(glyph.footing, `${name}: numeral standing on its foot`).toBeGreaterThan(0.8)
      }
    } finally {
      await server.close()
    }
  })

  test('keeps the panes in place when the draft banner appears', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      // Make a draft newer than the seeded document, which is what the banner
      // offers to restore on the next load.
      await page
        .locator('#editor .trevixal-content p')
        .first()
        .click({ position: { x: 4, y: 6 } })
      await page.keyboard.type('drafted ')
      await expect(page.locator('.trevixal-autosave')).toHaveAttribute('data-status', 'saved', {
        timeout: 8000,
      })
      await page.reload()
      await expect(page.locator('.trevixal-banner--draft')).toBeVisible({ timeout: 8000 })

      // The banner is prepended into the shell, and the shell is a flex row,
      // so a banner without a basis of its own takes a column beside the panes
      // and shoves the sidebar and the editor across the page.
      const boxes = await page.evaluate(() => {
        const rect = (selector: string) =>
          (document.querySelector(selector) as HTMLElement).getBoundingClientRect()
        const shell = rect('.editor-shell')
        const banner = rect('.trevixal-banner--draft')
        const sidebar = rect('#sidebar')
        return {
          bannerSpansTheRow: Math.abs(banner.width - shell.width) < 1,
          sidebarKeptItsEdge: Math.abs(sidebar.left - shell.left) < 1,
          sidebarIsBelow: sidebar.top >= banner.bottom,
        }
      })
      expect(boxes).toEqual({
        bannerSpansTheRow: true,
        sidebarKeptItsEdge: true,
        sidebarIsBelow: true,
      })
    } finally {
      await server.close()
    }
  })

  test('highlights a code block that names no language', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-content pre')

      const tokens = await page.evaluate(() => {
        const blocks = [...document.querySelectorAll('.trevixal-content pre')]
        // The seeded unlabelled block is the Python one.
        const target = blocks.find((block) => block.textContent?.includes('def summarize'))
        return target?.querySelectorAll('[class*="tvx-tok"]').length ?? 0
      })
      expect(tokens).toBeGreaterThan(0)
    } finally {
      await server.close()
    }
  })

  test('gives the toggle header room around its title', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-toggle__summary')

      const header = await page.evaluate(() => {
        const summary = document.querySelector('.trevixal-toggle__summary') as HTMLElement
        const style = getComputedStyle(summary)
        return {
          height: summary.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(style.lineHeight),
          fontSize: Number.parseFloat(style.fontSize),
        }
      })
      expect(header.lineHeight).toBeGreaterThan(header.fontSize)
      // Padding plus a full line box: a cramped header was the complaint.
      expect(header.height).toBeGreaterThan(34)
    } finally {
      await server.close()
    }
  })

  test('offers move, swap and resize from the table toolbar', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-content table')

      await page.locator('.trevixal-content table td').first().click()
      await expect(page.locator('.trevixal-tabletoolbar')).toBeVisible()
      await page.locator('.trevixal-tabletoolbar button').first().click()

      const items = page.locator('.trevixal-tabletoolbar .trevixal-menu__item')
      const labels = (await items.allTextContents()).map((text) => text.trim())
      for (const expected of [
        'Move row up',
        'Move column left',
        'Swap cell right',
        'Distribute columns evenly',
        'Reset sizes',
      ]) {
        expect(labels).toContain(expected)
      }
    } finally {
      await server.close()
    }
  })

  test('moves a table row from the toolbar', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-content table')

      const firstBodyCell = () =>
        page.evaluate(
          () =>
            document.querySelector('.trevixal-content table tr:nth-child(2) td')?.textContent ?? '',
        )
      const before = await firstBodyCell()

      await page.locator('.trevixal-content table tr:nth-child(2) td').first().click()
      await page.locator('.trevixal-tabletoolbar button').first().click()
      await page.getByText('Move row down', { exact: true }).click()

      // The row that was second is now third, so the second row holds
      // something else.
      expect(await firstBodyCell()).not.toBe(before)
    } finally {
      await server.close()
    }
  })
})
