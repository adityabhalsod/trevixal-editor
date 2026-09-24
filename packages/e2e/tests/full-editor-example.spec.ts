import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

/** The vanilla example, built and served exactly as it ships. */
const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/full-editor/dist')

/**
 * The example seeds a document so the page shows something on load; tests
 * asserting on counts need a known-empty surface to start from.
 */
async function clearDocument(page: Page): Promise<void> {
  const surface = page.locator('#editor .trevixal-content')
  // Three waits, and every one of them earned its place by failing without it.
  //
  // The seeded document first: the surface exists as soon as the editor
  // mounts, but the demo's content arrives after it, so a Ctrl+A landing in
  // that gap selects an empty document.
  //
  // Then focus: a click is not finished giving the surface focus when it
  // resolves, and a Ctrl+A that arrives first goes nowhere. Nothing is
  // selected, the Backspace that follows removes a single character, and the
  // seeded document survives intact.
  //
  // Then the result. Both of the above end the same way: the test types into
  // the document it believed it had emptied, and fails much later on something
  // unrelated. The format-painter test failed this way. It bolded the word
  // "Wave" out of the seeded tabs block and then found two bold runs where it
  // expected one, the other being the `bold` the seed's own first paragraph
  // has always carried. Checking here turns that into a failure that says what
  // went wrong. It only ever showed up under WebKit, which boots slowly enough
  // to widen the gap.
  //
  // The click goes to the start of the first paragraph, not the middle of the
  // surface. The middle of a document this long is wherever its layout puts
  // it, on Firefox a gap beside a link card, and the keys that followed raced
  // the caret that click was still placing.
  await expect(surface.locator('h1')).toHaveText('Trevixal')
  await surface
    .locator('> p')
    .first()
    .click({ position: { x: 4, y: 6 } })
  await expect(surface).toBeFocused()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await expect(surface).toHaveText('')
  // Backspace collapses the AllSelection to one block, but its type is
  // whatever was selected, reset it via the toolbar's block-format select
  // so typing behaves predictably. (The menubar has no Paragraph entry.)
  await page.click('[data-trevixal-item="blockFormat"] .trevixal-dropdown__trigger')
  await page.click('.trevixal-select__option:text-is("Paragraph")')
}

test('the full-editor example opens on a seeded document', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    const surface = page.locator('#editor .trevixal-content')

    // A showcase has to demonstrate something before the visitor types.
    await expect(surface.locator('h1')).toHaveText('Trevixal')
    await expect(surface.locator('strong').first()).toBeVisible()
    await expect(surface.locator('ul li')).not.toHaveCount(0)
    await expect(surface.locator('ol li')).not.toHaveCount(0)
    await expect(surface.locator('blockquote')).toBeVisible()
    await expect(surface.locator('table').first()).toBeVisible()
    // TypeScript, SQL, one unlabelled block for auto-detection, and the
    // Mermaid source the diagram extension previews.
    await expect(surface.locator('pre')).toHaveCount(4)
    // Code arrives highlighted, in two different languages.
    await expect(surface.locator('pre .tvx-tok-keyword').first()).toBeVisible()

    // The serialized pane reflects it rather than reading "Start typing…".
    await expect(page.locator('#output')).toContainText('<h1>Trevixal</h1>')
  } finally {
    await server.close()
  }
})

test('the seeded table renders as a usable grid', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    // The first of the tour's tables, the one with nothing special about it.
    const table = page.locator('#editor .trevixal-content table').first()

    // Regression: no CSS shipped for document tables, so this rendered ~14px
    // wide with 2px cells, correct markup, unusable UI.
    const geometry = await table.evaluate((element) => {
      const cell = element.querySelector('td, th')
      const rect = cell ? cell.getBoundingClientRect() : null
      const style = cell ? getComputedStyle(cell) : null
      return {
        tableWidth: element.getBoundingClientRect().width,
        cellWidth: rect ? rect.width : 0,
        cellHeight: rect ? rect.height : 0,
        borderCollapse: getComputedStyle(element).borderCollapse,
        borderWidth: style ? Number.parseFloat(style.borderTopWidth) : 0,
      }
    })

    expect(geometry.borderCollapse).toBe('collapse')
    expect(geometry.borderWidth).toBeGreaterThan(0)
    expect(geometry.cellWidth).toBeGreaterThan(40)
    expect(geometry.cellHeight).toBeGreaterThan(20)
    expect(geometry.tableWidth).toBeGreaterThan(300)

    // Clicking a cell marks it, so the caret's column is visible.
    await table.locator('td').first().click()
    await expect(table.locator('.trevixal-cell--selected')).toHaveCount(1)
  } finally {
    await server.close()
  }
})

test('the cell toolbar appears only while the caret is in a cell', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    const toolbar = page.locator('.trevixal-tabletoolbar')

    // Hidden until the caret is inside a table.
    await expect(toolbar).toBeHidden()

    await page.locator('#editor table td').first().click()
    await expect(toolbar).toBeVisible()

    // Anchored to the active cell, not parked at the page origin.
    const cellBox = await page.locator('#editor table td').first().boundingBox()
    const barBox = await toolbar.boundingBox()
    expect(cellBox).not.toBeNull()
    expect(barBox).not.toBeNull()
    if (cellBox && barBox) {
      expect(barBox.y).toBeGreaterThanOrEqual(cellBox.y - 4)
      expect(barBox.y).toBeLessThan(cellBox.y + cellBox.height)
      // Right-aligned within the cell.
      expect(barBox.x + barBox.width).toBeLessThanOrEqual(cellBox.x + cellBox.width + 4)
    }

    // Leaving the table hides it again.
    await page.locator('#editor .trevixal-content > p').first().click()
    await expect(toolbar).toBeHidden()
  } finally {
    await server.close()
  }
})

test('the cell toolbar opens every table operation, each with an icon', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await page.locator('#editor table td').first().click()
    await page.click('.trevixal-tabletoolbar .trevixal-dropdown__trigger')

    const items = page.locator('.trevixal-tabletoolbar .trevixal-menu__item')
    // Ten structural operations plus the move, swap and resize entries. A
    // floor, so adding an operation is not itself a failure.
    const count = await items.count()
    expect(count).toBeGreaterThanOrEqual(10)
    // Every item carries a rendered glyph. A blank slot is the bug here.
    await expect(items.locator('.trevixal-menu__icon svg')).toHaveCount(count)

    // And an operation actually runs.
    const rows = page.locator('#editor table tr')
    const before = await rows.count()
    await page.click('.trevixal-tabletoolbar [data-trevixal-item="addRowAfter"]')
    await expect(rows).toHaveCount(before + 1)
  } finally {
    await server.close()
  }
})

test('the language select floats over the code block holding the caret', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    const select = page.locator('.trevixal-codelang')

    await expect(select).toBeHidden()

    const block = page.locator('#editor pre').first()
    await block.click()
    await expect(select).toBeVisible()
    // The trigger names the block's own language.
    await expect(select.locator('.trevixal-codelang__label')).toHaveText('TypeScript')

    // Positioned inside that block, not in a bar above the document.
    const blockBox = await block.boundingBox()
    const selectBox = await select.boundingBox()
    if (blockBox && selectBox) {
      expect(selectBox.y).toBeGreaterThanOrEqual(blockBox.y - 2)
      expect(selectBox.y).toBeLessThan(blockBox.y + blockBox.height)
    }

    // Changing it re-highlights without altering the code.
    const text = await block.textContent()
    await select.locator('.trevixal-codelang__trigger').click()
    await page.click('[data-trevixal-language="python"]')
    await expect(block.locator('.tvx-tok-keyword', { hasText: 'interface' })).toHaveCount(0)
    expect(await block.textContent()).toBe(text)
    await expect(select.locator('.trevixal-codelang__label')).toHaveText('Python')

    // Leaving the block hides it.
    await page.locator('#editor .trevixal-content > p').first().click()
    await expect(select).toBeHidden()
  } finally {
    await server.close()
  }
})

test('the language picker lists every language with an icon and a tick', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await page.locator('#editor pre').first().click()
    // The select installs itself over the block the caret landed in, a tick
    // after the click. Clicking its trigger before it is there is the ordinary
    // "acted on the editor before it was ready" race, and on a loaded machine
    // WebKit loses it often enough to see.
    await expect(page.locator('.trevixal-codelang')).toBeVisible()
    await page.click('.trevixal-codelang__trigger')

    // Twelve bundled languages plus "Plain text".
    const items = page.locator('.trevixal-codelang [data-trevixal-language]')
    await expect(items).toHaveCount(13)
    // Every row carries a language glyph. A blank slot is the bug here.
    await expect(items.locator('.trevixal-menu__icon svg')).toHaveCount(13)

    // Exactly one is marked, and it is the block's language.
    const checked = page.locator('.trevixal-codelang [aria-checked="true"]')
    await expect(checked).toHaveCount(1)
    await expect(checked).toHaveAttribute('data-trevixal-language', 'typescript')

    // Plain text is a real choice: picking it clears the highlighting.
    await page.click('[data-trevixal-language=""]')
    await expect(page.locator('#editor pre').first().locator('[class^="tvx-tok-"]')).toHaveCount(0)
    await expect(page.locator('.trevixal-codelang__label')).toHaveText('Plain text')
  } finally {
    await server.close()
  }
})

test('language glyphs carry their own colour', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await page.locator('#editor pre').first().click()
    // The select installs itself over the block the caret landed in, a tick
    // after the click. Clicking its trigger before it is there is the ordinary
    // "acted on the editor before it was ready" race, and on a loaded machine
    // WebKit loses it often enough to see.
    await expect(page.locator('.trevixal-codelang')).toBeVisible()
    await page.click('.trevixal-codelang__trigger')

    const glyphs = page.locator('.trevixal-codelang [data-trevixal-language-icon]')
    const colors = await glyphs.evaluateAll((elements) =>
      elements.map((element) => ({
        language: element.getAttribute('data-trevixal-language-icon'),
        color: getComputedStyle(element).color,
      })),
    )

    // Colour is what makes a 13-item list scannable, so the glyphs must not
    // collapse back to one inherited colour.
    const distinct = new Set(colors.map((entry) => entry.color))
    expect(distinct.size).toBeGreaterThan(8)

    // Each named language resolves to something, and two unrelated ones differ.
    const byLanguage = new Map(colors.map((entry) => [entry.language, entry.color]))
    expect(byLanguage.get('typescript')).toBeTruthy()
    expect(byLanguage.get('html')).toBeTruthy()
    expect(byLanguage.get('typescript')).not.toBe(byLanguage.get('html'))

    // The panel scrolls without the heavy native scrollbar.
    const gutter = await page
      .locator('.trevixal-codelang .trevixal-dropdown__panel')
      .evaluate((element: HTMLElement) => element.offsetWidth - element.clientWidth)
    expect(gutter).toBeLessThan(8)
  } finally {
    await server.close()
  }
})

test('every menubar item renders an icon', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)

    // Regression: 20 of 31 menu items declared no icon, so their glyph slot
    // rendered empty. The Table and Tools menus were almost entirely blank.
    for (const menu of ['File', 'Edit', 'Insert', 'Format', 'Table', 'Tools']) {
      await page.click(`.trevixal-menubar__trigger:text-is("${menu}")`)
      // Only the open menu's items are visible. Wait for the panel before
      // counting. Count() does not auto-wait the way an assertion does.
      const items = page.locator('.trevixal-menu__item:visible')
      await expect(items.first()).toBeVisible()

      const count = await items.count()
      expect(count).toBeGreaterThan(0)
      await expect(items.locator('.trevixal-menu__icon svg')).toHaveCount(count)

      // Toggle the menu shut via its own trigger, so the next iteration starts
      // from a closed menubar. (Escape does not close it.)
      await page.click(`.trevixal-menubar__trigger:text-is("${menu}")`)
      await expect(items).toHaveCount(0)
    }
  } finally {
    await server.close()
  }
})

test('the full-editor example runs with its complete chrome', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)

    // Menubar, toolbar groups and status bar all mounted.
    await expect(page.locator('.trevixal-menubar__trigger')).toHaveCount(8)
    // The example wires the block and code-format commands, so it renders
    // categories the bare UI page correctly leaves out.
    const groups = page.locator('.trevixal-toolbar__group')
    expect(await groups.count()).toBeGreaterThanOrEqual(10)
    await expect(page.locator('.trevixal-statusbar')).toBeVisible()

    // Typing flows through to the serialized output.
    const surface = page.locator('#editor .trevixal-content')
    await clearDocument(page)
    await page.keyboard.type('Example text')
    await expect(page.locator('#output')).toContainText('Example text')

    // A toolbar command applies to the selection.
    await page.keyboard.press('Control+a')
    await page.click('.trevixal-toolbar [data-trevixal-item="bold"]')
    await expect(surface.locator('strong')).toHaveText('Example text')
    await expect(page.locator('#output')).toContainText('<strong>')

    // The table grid inserts a table.
    const grid = page.locator('[data-trevixal-item="table"]')
    await grid.locator('.trevixal-dropdown__trigger').click()
    await grid.locator('[data-row="2"][data-col="3"]').click()
    await expect(surface.locator('table tr')).toHaveCount(2)
  } finally {
    await server.close()
  }
})

test('the full-editor example highlights code and paints formatting', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    const surface = page.locator('#editor .trevixal-content')
    await clearDocument(page)

    // A paragraph first, so there is somewhere to move the caret back to.
    await page.keyboard.type('intro')
    await page.keyboard.press('Enter')

    // Then a code block, written the way a user would.
    await page.keyboard.type('```')
    await page.keyboard.type('SELECT name FROM users')
    await expect(surface.locator('pre')).toHaveCount(1)

    // The floating select appears over the block and drives highlighting.
    const bar = page.locator('.trevixal-codelang')
    await expect(bar).toBeVisible()
    const pick = async (language: string): Promise<void> => {
      await bar.locator('.trevixal-codelang__trigger').click()
      await page.click(`[data-trevixal-language="${language}"]`)
    }
    await pick('sql')
    await expect(surface.locator('pre .tvx-tok-keyword').first()).toBeVisible()

    // Switching language re-highlights without altering the code.
    await pick('python')
    await expect(surface.locator('pre')).toHaveText('SELECT name FROM users')

    // It hides again once the caret leaves the code block.
    await surface.locator('p').first().click()
    await expect(bar).toBeHidden()
  } finally {
    await server.close()
  }
})

test('the format painter copies formatting in the full-editor example', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    const surface = page.locator('#editor .trevixal-content')
    await clearDocument(page)
    await page.keyboard.type('bold plain')

    // Bold the first word.
    await page.keyboard.press('Home')
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight')
    await page.click('.trevixal-toolbar [data-trevixal-item="bold"]')
    await expect(surface.locator('strong')).toHaveText('bold')

    // Copy it, then paint it onto the second word.
    const painter = page.locator('.trevixal-toolbar [data-trevixal-item="formatPainter"]')
    await painter.click()
    await expect(painter).toHaveAttribute('data-painter', 'armed')

    await page.keyboard.press('End')
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft')
    await painter.click()
    await expect(surface.locator('strong')).toHaveCount(2)
  } finally {
    await server.close()
  }
})
