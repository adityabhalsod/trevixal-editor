import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { scrollbarWidthIsReadable } from './engine'
import { serveDist } from './serve-dist'

/**
 * The chrome around the editor: whether it lays itself out at every width,
 * and whether it tells the truth about its own state.
 *
 * Every case here is a defect that shipped. None of them could be caught
 * without a real browser: they are layout arithmetic, scroll anchoring and
 * focus behaviour.
 */
const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/full-editor/dist')

/** Pick an entry from one of the menubar's menus. */
async function menu(page: Page, name: string, item: string): Promise<void> {
  await page.click(`[data-trevixal-menu="${name}"]`)
  await page.click(`[data-trevixal-item="${item}"]`)
}

const width = (page: Page, selector: string): Promise<number> =>
  page.evaluate(
    (target) =>
      Math.round((document.querySelector(target) as HTMLElement).getBoundingClientRect().width),
    selector,
  )

test('the preview fills the pane it is given, at every width', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await menu(page, 'view', 'splitPreview')
    await expect(page.locator('.trevixal-split__preview')).toBeVisible()

    // The split container used to declare two equal columns while holding a
    // single child, so the preview rendered into half the width it had been
    // given and the document wrapped a letter per line.
    expect(await width(page, '.trevixal-split__preview')).toBe(
      await width(page, '.trevixal-split__pane'),
    )

    await menu(page, 'view', 'splitEditor')
    await expect(page.locator('#mirror .trevixal-content')).toBeVisible()

    for (const viewport of [1500, 1024, 480]) {
      await page.setViewportSize({ width: viewport, height: 900 })
      const geometry = await page.evaluate(() => {
        const box = (selector: string) =>
          (document.querySelector(selector) as HTMLElement).getBoundingClientRect()
        return {
          overflow: document.body.scrollWidth - document.documentElement.clientWidth,
          editor: Math.round(box('#editor').width),
          split: Math.round(box('#split').width),
          frame: Math.round(box('.trevixal-split__preview').width),
        }
      })
      // A shell whose columns are written out in advance cannot survive its
      // children coming and going: the panes overflowed the page sideways
      // rather than wrapping under it.
      expect(geometry.overflow, `horizontal overflow at ${viewport}px`).toBeLessThanOrEqual(0)
      expect(geometry.frame, `preview fills its pane at ${viewport}px`).toBe(geometry.split)
      expect(geometry.editor, `editor is usable at ${viewport}px`).toBeGreaterThan(300)
    }

    // Side by side has to mean side by side: a pane that scrolls away by the
    // second paragraph is not beside anything.
    await page.setViewportSize({ width: 1500, height: 900 })
    await page.evaluate(() => window.scrollTo(0, 1400))
    // Polled: a sticky box is repositioned at the next layout, so a rect read
    // in the same tick as the scroll can still be the one from before it.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const onScreen = (selector: string) => {
            const box = (document.querySelector(selector) as HTMLElement).getBoundingClientRect()
            return box.top < window.innerHeight && box.bottom > 0
          }
          return onScreen('#split') && onScreen('#mirror')
        }),
      )
      .toBe(true)

    // Narrow enough and every pane takes a line of its own.
    await page.setViewportSize({ width: 480, height: 900 })
    await page.evaluate(() => window.scrollTo(0, 0))
    const rows = await page.evaluate(() => {
      const top = (selector: string) =>
        Math.round((document.querySelector(selector) as HTMLElement).getBoundingClientRect().top)
      return new Set([top('#editor'), top('#split'), top('#mirror')]).size
    })
    expect(rows).toBe(3)
  } finally {
    await server.close()
  }
})

test('View entries show whether what they switch is on', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    const state = (item: string) =>
      page.getAttribute(`[data-trevixal-item="${item}"]`, 'aria-checked')

    await page.click('[data-trevixal-menu="view"]')
    // A tick is drawn, not only announced.
    await expect(page.locator('[data-trevixal-item="readOnly"] .trevixal-menu__check')).toHaveCount(
      1,
    )
    expect(await state('readOnly')).toBe('false')
    expect(await state('splitPreview')).toBe('false')
    // Widths are a radio group; exactly one of the four is ticked.
    expect(await state('widthNormal')).toBe('true')
    expect(await state('widthWide')).toBe('false')
    await page.keyboard.press('Escape')

    await menu(page, 'view', 'readOnly')
    await page.click('[data-trevixal-menu="view"]')
    expect(await state('readOnly')).toBe('true')
    await expect(page.locator('#editor .trevixal-content')).toHaveAttribute(
      'contenteditable',
      'false',
    )
    await page.keyboard.press('Escape')

    // Opening a split view raises no transaction, so a menu that refreshed
    // only on edits reported the state the editor was in at the last
    // keystroke, which for chrome is most of the time.
    await menu(page, 'view', 'splitPreview')
    await page.click('[data-trevixal-menu="view"]')
    expect(await state('splitPreview')).toBe('true')
  } finally {
    await server.close()
  }
})

test('the command palette leaves the page where it found it', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await page.locator('#editor .trevixal-content').click()
    const scrollTo = async (y: number) => {
      await page.evaluate((target) => window.scrollTo(0, target), y)
      // Rounded, because a scroll position is not an integer. Firefox lands on
      // 899.7166748046875 when asked for 900, it keeps the position in device
      // pixels and converts back, and the point of this helper is to get the
      // page to a known place, not to police the browser's arithmetic.
      await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(y)
    }

    // Dismissing hands focus back to the surface, and a plain `focus()`
    // scrolls that surface's caret into view. A caret that can be a whole
    // document away from what the reader was looking at.
    await scrollTo(900)
    await page.keyboard.press('Control+k')
    await expect(page.locator('.trevixal-palette__input')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(900)

    await page.keyboard.press('Control+k')
    await page.keyboard.type('Focus mode')
    await expect(page.locator('.trevixal-palette__item--selected')).toHaveText(/Focus mode/)
    await page.keyboard.press('Enter')
    await expect(page.locator('.trevixal-palette-overlay')).toBeHidden()
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(900)
  } finally {
    await server.close()
  }
})

test('a flagged word explains itself and offers its fix', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    const flagged = page.locator('#editor [data-trevixal-issue]').first()
    await expect(flagged).toBeVisible()

    // Hover: a small card naming the check that fired and what it found.
    await flagged.hover()
    const card = page.locator('.trevixal-writing-card')
    await expect(card).toBeVisible()
    await expect(card.locator('.trevixal-writing-card__kind')).not.toBeEmpty()
    await expect(card.locator('.trevixal-writing-card__message')).not.toBeEmpty()
    // A label on a word, not a panel.
    expect((await card.boundingBox())?.height ?? 999).toBeLessThan(80)

    // Click: the fix, as a menu over the word.
    await flagged.click()
    const fixes = page.locator('.trevixal-writing-menu')
    await expect(fixes).toBeVisible()
    await expect(card).toBeHidden()
    await expect(fixes.locator('[role="menuitem"]')).not.toHaveCount(0)

    const apply = fixes.locator('[data-trevixal-writing-action="apply"]')
    if ((await apply.count()) > 0) {
      const before = await page.locator('#editor .trevixal-content').innerText()
      await apply.click()
      await expect(fixes).toBeHidden()
      expect(await page.locator('#editor .trevixal-content').innerText()).not.toBe(before)
    } else {
      // Passive voice and long sentences have no one replacement; saying so
      // beats an empty menu that reads as broken.
      await expect(fixes.locator('.trevixal-writing-menu__note')).toBeVisible()
    }
  } finally {
    await server.close()
  }
})

test('the review bar follows suggestion mode wherever it is switched', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    const toggle = page.locator('.trevixal-trackchanges__toggle')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    // Switching modes changes no document, so it raises no transaction: a bar
    // listening only to the editor kept reading "off" while every keystroke
    // was being recorded as a suggestion.
    await menu(page, 'view', 'trackChanges')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await page.locator('#editor .trevixal-content p').first().click()
    await page.keyboard.type('typed')
    await expect(page.locator('#editor .trevixal-content ins')).toHaveCount(1)
    await expect(page.locator('.trevixal-trackchanges__count')).toHaveText('1 suggestion')

    await menu(page, 'view', 'trackChanges')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  } finally {
    await server.close()
  }
})

test('a document tab reads as one object, and shows which is open', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await menu(page, 'view', 'workspacePanel')
    const tab = page.locator('.trevixal-tabs-bar__item').first()
    await expect(tab).toBeVisible()

    // The wrapper is what the stylesheet keys on, and what carries the title,
    // the menu and the close button as one tab.
    await expect(tab).toHaveAttribute('data-active', 'true')
    expect(await tab.evaluate((element) => getComputedStyle(element as HTMLElement).display)).toBe(
      'flex',
    )
    // The `…` and `×` were unstyled, and arrived as default browser buttons.
    const more = tab.locator('.trevixal-tabs-bar__more')
    expect(
      await more.evaluate((element) => getComputedStyle(element as HTMLElement).borderTopWidth),
    ).toBe('0px')
    expect((await more.boundingBox())?.width ?? 0).toBeLessThan(28)
  } finally {
    await server.close()
  }
})

test('every scrollbar follows the theme, inside the editor and out', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.setViewportSize({ width: 1500, height: 900 })
    await page.goto(server.origin)
    await menu(page, 'view', 'splitPreview')
    await menu(page, 'view', 'splitEditor')
    await expect(page.locator('#mirror .trevixal-content')).toBeVisible()

    /** Every scrolling surface on the page, as the browser resolved it. */
    const surfaces = () =>
      page.evaluate(() =>
        ['html', 'body', '.trevixal-split__mirror', '#editor pre', '.trevixal-content'].map(
          (selector) => {
            const element = document.querySelector(selector) as HTMLElement
            const style = getComputedStyle(element)
            return {
              selector,
              scheme: style.colorScheme,
              width: style.scrollbarWidth,
              thumb: style.scrollbarColor.split(' rgba')[0] ?? '',
            }
          },
        ),
      )

    // Not every engine reports a width that came from the stylesheet; see
    // `scrollbarWidthIsReadable`. The colour and the scheme are read correctly
    // everywhere, so the theme is still checked in full on all three.
    const widthIsReadable = await scrollbarWidthIsReadable(page)

    for (const [entry, scheme] of [
      ['themeDark', 'dark'],
      ['themeLight', 'light'],
    ] as const) {
      await menu(page, 'view', entry)
      for (const surface of await surfaces()) {
        const where = `${surface.selector} in ${entry}`
        // `color-scheme` is what the browser paints its own furniture from.
        // Without it a dark editor sat beside a bright white scrollbar, since
        // nothing had told the browser which way the page went.
        expect(surface.scheme, `scheme of ${where}`).toBe(scheme)
        if (widthIsReadable) expect(surface.width, `width of ${where}`).toBe('thin')
        // `auto` means the default bar: heavier than the chrome around it.
        expect(surface.thumb, `thumb of ${where}`).not.toBe('auto')
      }
    }

    // A preset carries its own palette, and the bars go with it, including
    // the page's, which is painted from <html>, above the editor root.
    await menu(page, 'view', 'themeNord')
    const nord = await surfaces()
    const thumbs = new Set(nord.map((surface) => surface.thumb))
    expect(thumbs.size, `one colour across ${JSON.stringify(nord)}`).toBe(1)
    expect([...thumbs][0]).not.toBe('auto')

    // The preview is its own document: it paints its own bar, and left alone
    // that is the browser's default furniture on an otherwise themed page.
    //
    // Settled first: switching theme re-renders the pane, and a render landing
    // mid-`evaluate` destroys the execution context the evaluate is running
    // in. The frame's whole document is replaced, not patched.
    await previewSettled(page)
    await expect
      .poll(() =>
        page
          .frameLocator('.trevixal-split__preview')
          .locator('body')
          .evaluate(() => {
            const style = getComputedStyle(document.documentElement)
            return `${style.colorScheme}/${style.scrollbarWidth}`
          }),
      )
      .toBe(`dark/${widthIsReadable ? 'thin' : 'none'}`)
  } finally {
    await server.close()
  }
})

/**
 * Wait until the side-by-side preview has stopped re-rendering.
 *
 * Every render replaces the whole document inside the frame, so a click that
 * lands between two of them is discarded along with the document it landed
 * on, and reads as the click having done nothing. Two consecutive looks
 * finding the same document means no render happened in between.
 *
 * The gap between those looks has to be longer than the pane's own debounce,
 * or "unchanged" only means the next render has not fired *yet*. The pane
 * waits 150ms after an edit; 400 is comfortably past that and still an order
 * of magnitude under the timeout.
 *
 * Watched as the `srcdoc` the pane writes rather than as the document the
 * frame holds: the preview is sandboxed onto an opaque origin, so from in here
 * `contentDocument` is null no matter how finished it is. The attribute is the
 * better signal anyway. It is the exact thing a render changes.
 */
async function previewSettled(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as unknown as { previewHTML?: string | null }).previewHTML = undefined
  })
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const frame = document.querySelector(
            '.trevixal-split__preview',
          ) as HTMLIFrameElement | null
          const rendered = frame?.getAttribute('srcdoc') ?? null
          const store = window as unknown as { previewHTML?: string | null }
          const unchanged = rendered !== null && store.previewHTML === rendered
          store.previewHTML = rendered
          return unchanged
        }),
      { intervals: [400], timeout: 15_000 },
    )
    .toBe(true)
}

/**
 * What is at the top of a pane: which top-level block, and its first words.
 *
 * The index alone would be a weaker check than it looks. Both panes start at
 * block 0, so a link that did nothing at all would agree with one that worked
 * until something moved. The text is what makes the agreement mean something:
 * the two panes are separate documents, and matching text at a matching index
 * is the two of them genuinely showing the same paragraph.
 */
const TOP_BLOCK = `(() => {
  const blocks = [...document.querySelectorAll('SURFACE > *')]
  const at = blocks.findIndex((block) => block.getBoundingClientRect().bottom > 2)
  return at + '|' + (blocks[at]?.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 24)
})()`

// Twice: as the demo opens, and with its headings numbered too. Either way
// the preview's blocks are inside the one element carrying the document's
// settings, since the demo's own paragraph style and list scheme are settings.
for (const numbered of [false, true]) {
  const title = `the preview follows the editor down the page, and the editor follows it back${numbered ? ', with numbered headings' : ''}`
  test(title, async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.setViewportSize({ width: 1600, height: 950 })
      await page.goto(server.origin)
      if (numbered) await menu(page, 'format', 'headingNumbering-outline')
      await menu(page, 'view', 'splitPreview')
      // Before the panes can be lined up, the document has to stop changing
      // height. The seeded document draws a diagram asynchronously, Mermaid is
      // fetched from a CDN the first time one renders, and a block that grows
      // after the two panes have been measured moves everything below it in one
      // of them before the other, which reads exactly like a broken link. It
      // only ever showed up under a full parallel run, where the fetch is slow
      // enough to land after the first scroll.
      await expect(page.locator('#editor .trevixal-diagram svg')).toHaveCount(1)
      await previewSettled(page)

      const frame = page.frameLocator('.trevixal-split__preview')
      const editorTop = () =>
        page.evaluate(TOP_BLOCK.replace('SURFACE', '#editor .trevixal-content')) as Promise<string>
      const previewTop = () =>
        frame
          .locator('body')
          .evaluate(
            TOP_BLOCK.replace('SURFACE', '.trevixal-content > [data-trevixal-document]'),
          ) as Promise<string>
      const blockOf = (top: string): number => Number.parseInt(top.split('|')[0] ?? '-1', 10)

      /**
       * The block both panes are showing, or NaN while they disagree.
       *
       * Both read together, and the answer is a single number, because a wheel
       * scroll is still moving when it resolves: reading one pane for the
       * expectation and polling the other for the value compares a pane against
       * where the other one *used to be*, which is a race that fails at exactly
       * the moments the link is working hardest. NaN is what makes this safe to
       * poll. Every comparison against it is false, so a disagreement can never
       * satisfy `toBeGreaterThan` or `toBeLessThan` by accident.
       */
      const sharedBlock = async (): Promise<number> => {
        const [inEditor, inPreview] = await Promise.all([editorTop(), previewTop()])
        return inEditor === inPreview ? blockOf(inEditor) : Number.NaN
      }

      /**
       * Wait until the panes agree *and* have stopped moving, and say where they
       * settled.
       *
       * Agreement on its own is not enough, because a wheel scroll is animated:
       * the two panes agree on block 21 on the way past it to 28, and recording
       * that as where the reader ended up makes the next assertion compare
       * against a place the page has already left. Two consecutive readings
       * agreeing with each other is what "stopped" means here.
       *
       * The timeout is long for the same reason the interval is: agreement costs
       * a frame in one pane, a message across a frame boundary and a scroll in
       * the other, and under a full parallel run each of those is slower than
       * all three are together on an idle machine.
       */
      const settled = async (): Promise<number> => {
        let previous = Number.NaN
        let block = Number.NaN
        await expect
          .poll(
            async () => {
              const now = await sharedBlock()
              const quiet = !Number.isNaN(now) && now === previous
              previous = now
              block = now
              return quiet ? now : -1
            },
            { intervals: [250], timeout: 20_000 },
          )
          .toBeGreaterThanOrEqual(0)
        return block
      }

      // Put the editor's own first block against the top of the viewport before
      // measuring anything. The demo page carries a header above the editor, and
      // wheeling through that scrolls the page without moving the editor's first
      // block off the top, so a check waiting for the block to change would be
      // waiting for something that was not going to happen yet.
      await page.evaluate(() => {
        const content = document.querySelector('#editor .trevixal-content') as HTMLElement
        window.scrollTo(0, Math.round(content.getBoundingClientRect().top + window.scrollY))
      })
      expect(await settled()).toBe(0)

      // Scrolled with the wheel rather than by setting `scrollY`: a programmatic
      // scroll inside a sandboxed frame raises no scroll event for that page's
      // own script to see, so the reverse direction written that way would be
      // testing something no reader ever does.
      const surface = await page.locator('#editor .trevixal-content').boundingBox()
      await page.mouse.move((surface?.x ?? 100) + 50, (surface?.y ?? 100) + 100)

      // Several notches rather than one jump, and stopping well short of the
      // end. Neither pane can put its last block at the top, there is nothing
      // underneath it to scroll, so down there the two saturate at different
      // blocks for reasons that have nothing to do with the link.
      let reached = 0
      for (let notch = 0; notch < 4; notch++) {
        await page.mouse.wheel(0, 500)
        const next = await settled()
        expect(next, `both panes moved down together on notch ${notch}`).toBeGreaterThan(reached)
        reached = next
      }
      expect(reached).toBeGreaterThan(5)

      // And back, driven from the other side this time: the preview reports
      // where the reader put it and the editor goes there.
      const pane = await page.locator('.trevixal-split__preview').boundingBox()
      await page.mouse.move((pane?.x ?? 900) + 100, (pane?.y ?? 100) + 200)
      await page.mouse.wheel(0, -900)
      expect(await settled(), 'the editor followed the preview back up').toBeLessThan(reached)
    } finally {
      await server.close()
    }
  })
}

test('both panes show what the editor shows', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.setViewportSize({ width: 1600, height: 950 })
    await page.goto(server.origin)
    await menu(page, 'view', 'splitPreview')
    await menu(page, 'view', 'splitEditor')
    await expect(page.locator('#mirror .trevixal-content')).toBeVisible()

    // None of the three is in the document. Highlighting is a decoration, a
    // diagram is an element the view appends beside its code block, and a tab
    // strip is a click handler. All installed per editor, none of it carried
    // by the content. A pane given only the document showed grey code, no
    // diagrams, and tab titles that did nothing.
    const frame = page.frameLocator('.trevixal-split__preview')
    const previewPanels = () =>
      frame
        .locator('body')
        .evaluate(() =>
          [...document.querySelectorAll('.trevixal-tabs__panel')].map(
            (panel) => (panel as HTMLElement).dataset.active,
          ),
        )

    // The editor's own diagram first. The preview does not draw one, it is
    // handed the markup the editor already drew, so asking the preview for a
    // diagram before the editor has one is asking it to have copied something
    // that does not exist yet. Mermaid is fetched from a CDN the first time a
    // diagram renders, which makes that the ordinary case on a cold run rather
    // than a rare one, and it is why this failed about one WebKit run in three
    // while passing every time in isolation.
    await expect(page.locator('#editor .trevixal-diagram svg')).toHaveCount(1)

    // Then the preview, while the document is still untouched: an edit sets a
    // re-render going, and a render landing after a click on the frame
    // replaces the document that click just changed.
    await previewSettled(page)
    await expect(frame.locator('.trevixal-diagram svg')).toHaveCount(1)
    await expect(frame.locator('pre code span[style*="color"]').first()).toBeVisible()

    // Its tab strip is wired by the page itself, from the same script the
    // downloaded file carries. The frame is sandboxed to `allow-scripts` and
    // deliberately not `allow-same-origin`, so it runs that script on an
    // opaque origin and can reach nothing out here.
    //
    // It used to be wired from the embedder instead, which worked in two
    // engines out of three: WebKit invokes no listener at all on a document
    // whose scripting the sandbox has disabled, however that listener got
    // there, so the titles were drawn and clicking them did nothing.
    expect(await previewPanels()).toEqual(['true', 'false'])
    await frame.locator('.trevixal-tabs__title').nth(1).click()
    await expect.poll(previewPanels).toEqual(['false', 'true'])

    // The mirror is a second editor, so its tab click is a real edit and goes
    // into the document, which is why this comes after the preview's.
    const mirror = page.locator('#mirror')
    await expect(mirror.locator('[class*="tvx-tok-"]').first()).toBeVisible()
    await expect(mirror.locator('.trevixal-diagram svg')).toHaveCount(1)

    const panels = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('#mirror .trevixal-tabs__panel')].map(
          (panel) => (panel as HTMLElement).dataset.active,
        ),
      )
    expect(await panels()).toEqual(['true', 'false'])
    await mirror.locator('.trevixal-tabs__title').nth(1).click()
    await expect.poll(panels).toEqual(['false', 'true'])

    // A re-render replaces the document inside the frame, so the wiring has to
    // go back on every time rather than once when the pane opened. Waiting for
    // the edit to appear in the preview is what says the render has landed and
    // the next click will not be overwritten by it.
    await page.locator('#editor .trevixal-content p').first().click()
    await page.keyboard.type('Marker!')
    await previewSettled(page)
    await expect.poll(() => frame.locator('body').innerText()).toContain('Marker!')
    await frame.locator('.trevixal-tabs__title').nth(0).click()
    await expect.poll(previewPanels).toEqual(['true', 'false'])
  } finally {
    await server.close()
  }
})

test('a space typed at the end of a line shows up straight away', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await page.locator('#editor .trevixal-content p').first().click()
    await page.keyboard.press('End')

    /** Where the caret is, in page coordinates. */
    const caret = () =>
      page.evaluate(() => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return -1
        return Math.round(selection.getRangeAt(0).cloneRange().getBoundingClientRect().left)
      })

    const start = await caret()
    await page.keyboard.press('Space')
    // Under the default `white-space: normal` a space at the end of a line is
    // dropped when it is drawn, so the caret sat still and the space only
    // appeared once the next character gave it something to sit against. It
    // was in the document the whole time; the rendering was hiding it.
    await expect.poll(caret).toBeGreaterThan(start)

    const afterOne = await caret()
    await page.keyboard.press('Space')
    // And a second one is its own space, not collapsed into the first.
    await expect.poll(caret).toBeGreaterThan(afterOne)

    // A code block keeps its own `pre`, which applies to that element directly
    // and so outranks the inherited value.
    expect(
      await page.evaluate(() => ({
        surface: getComputedStyle(
          document.querySelector('#editor .trevixal-content') as HTMLElement,
        ).whiteSpace,
        code: getComputedStyle(
          document.querySelector('#editor .trevixal-content pre') as HTMLElement,
        ).whiteSpace,
      })),
    ).toEqual({ surface: 'pre-wrap', code: 'pre' })
  } finally {
    await server.close()
  }
})

test('typing does not rewrite the attributes of blocks it did not touch', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await expect(page.locator('#editor iframe').first()).toBeVisible()
    await page.locator('#editor .trevixal-content p').first().click()
    await page.keyboard.press('End')

    // Watched as attribute writes rather than as embed reloads: the reload is
    // the symptom a reader sees, but it arrives over the network and cannot be
    // timed reliably, while the write that causes it is exact.
    await page.evaluate(() => {
      const seen = window as unknown as { attrWrites: string[] }
      seen.attrWrites = []
      const surface = document.querySelector('#editor .trevixal-content') as HTMLElement
      new MutationObserver((records) => {
        for (const record of records) {
          const element = record.target as HTMLElement
          seen.attrWrites.push(`${element.nodeName}.${record.attributeName}`)
        }
      }).observe(surface, { attributes: true, subtree: true })
    })

    await page.keyboard.type('Typing')
    // Long enough for the writing checks to re-run, which is what puts the
    // whole document through the renderer again, on a timer, after every edit.
    await page.waitForTimeout(1500)

    const writes = await page.evaluate(
      () => (window as unknown as { attrWrites: string[] }).attrWrites,
    )
    // Assigning an attribute the value it already has is still a write: it
    // invalidates style, and on an `<iframe>` assigning `src` reloads the
    // frame, so every edit restarted every embed in the document, which is
    // what a reader sees as a blink. Nothing here was edited but one
    // paragraph, so nothing else should have been written to.
    expect(writes.filter((write) => write.startsWith('IFRAME'))).toEqual([])
    expect(writes.filter((write) => write.startsWith('PRE'))).toEqual([])
    expect(writes.filter((write) => write.startsWith('A.'))).toEqual([])
  } finally {
    await server.close()
  }
})
