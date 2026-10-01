import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Locator, type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

/**
 * The list and table tools, in a real browser: a task's due date and
 * assignee and a list's done count, folding an item's subtree, sorting a
 * list, a multilevel scheme of the writer's own, and a table's frozen header
 * row and first column, cell padding and vertical alignment, a table nested
 * in a cell, and the header row a print repeats on every page. All of them
 * are drawn by the stylesheet or laid out by the browser, which only a
 * browser can show.
 */
const uiPage = `file://${join(dirname(fileURLToPath(import.meta.url)), '../page/ui.html')}`
const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/full-editor/dist')

const text = (value: string) => ({ type: 'text', text: value })
const p = (value: string) => ({ type: 'paragraph', content: value ? [text(value)] : [] })
const li = (value: string, ...rest: unknown[]) => ({
  type: 'listItem',
  content: [p(value), ...rest],
})
const task = (value: string, attrs: Record<string, unknown> = {}) => ({
  type: 'taskItem',
  attrs: { checked: false, ...attrs },
  content: [p(value)],
})
const cell = (value: string, header = false) => ({
  type: 'tableCell',
  attrs: { header },
  content: [p(value)],
})
const row = (values: readonly string[], header = false) => ({
  type: 'tableRow',
  content: values.map((value) => cell(value, header)),
})

async function load(page: Page, ...content: unknown[]): Promise<void> {
  await page.evaluate((doc) => window.uiPage.editor.setContent(doc as never), {
    type: 'doc',
    content,
  })
}

async function runMenuItem(page: Page, menu: string, item: string): Promise<void> {
  await page.click(`[data-trevixal-menu="${menu}"]`)
  await page.click(`[data-trevixal-menu="${menu}"] ~ * [data-trevixal-item="${item}"]`)
}

/** A pseudo-element's `content`, with the spacing and quoting engines differ on taken out. */
async function pseudo(target: Locator, which: '::before' | '::after'): Promise<string> {
  const content = await target.evaluate(
    (element, name) => getComputedStyle(element, name).content,
    which,
  )
  return content.replace(/[\s"']/g, '').replace(/,decimal\)/g, ')')
}

const surface = (page: Page): Locator => page.locator('#editor .trevixal-content')

test.describe('lists and tasks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(uiPage)
  })

  test('a task takes a due date and an assignee, drawn as a chip; past its date it says so', async ({
    page,
  }) => {
    await load(page, {
      type: 'taskList',
      content: [task('Draft the announcement'), task('Book the venue'), task('Send it')],
    })
    const first = surface(page).locator('li[data-type="taskItem"]').first()
    await first.locator('p').click()
    await runMenuItem(page, 'format', 'taskDetails')
    const dialog = page.locator('.trevixal-dialog')
    await dialog.locator('[name="assignee"]').fill('Priya')
    await dialog.locator('[name="due"]').fill('2020-01-31')
    await dialog.locator('.trevixal-dialog__button--primary').click()
    await expect(dialog).toHaveCount(0)

    await expect(first).toHaveAttribute('data-assignee', 'Priya')
    await expect(first).toHaveAttribute('data-due', '2020-01-31')
    expect(await pseudo(first.locator('p'), '::after')).toBe('@Priya·2020-01-31')
    // Long past and not done: the editor marks it, and the chip turns.
    await expect(first).toHaveAttribute('data-overdue', '')
    const overdue = await first
      .locator('p')
      .evaluate((element) => getComputedStyle(element, '::after').color)
    // Done, it is no longer overdue.
    await page.evaluate(() => window.uiPage.editor.commands.toggleTaskChecked())
    await expect(first).not.toHaveAttribute('data-overdue', '')
    const done = await first
      .locator('p')
      .evaluate((element) => getComputedStyle(element, '::after').color)
    expect(done).not.toBe(overdue)
    // A task with neither draws no chip.
    expect(
      await pseudo(surface(page).locator('li[data-type="taskItem"] > p').nth(1), '::after'),
    ).toBe('none')
  })

  test('a task list of two or more counts what is done under it', async ({ page }) => {
    await load(
      page,
      {
        type: 'taskList',
        content: [task('One', { checked: true }), task('Two'), task('Three')],
      },
      { type: 'taskList', content: [task('Alone')] },
    )
    const lists = surface(page).locator('ul[data-type="taskList"]')
    expect(await pseudo(lists.first(), '::after')).toBe(
      'counter(tvx-tasks-done)ofcounter(tvx-tasks)done',
    )
    await expect
      .poll(() => lists.first().evaluate((element) => getComputedStyle(element, '::after').display))
      .toBe('block')
    expect(await pseudo(lists.nth(1), '::after')).toBe('none')
  })

  test('an item folds shut from its chevron, and opens for a caret sent inside it', async ({
    page,
  }) => {
    await load(page, {
      type: 'bulletList',
      content: [
        li('Venue', { type: 'bulletList', content: [li('Hall'), li('Garden')] }),
        li('Audio'),
      ],
    })
    const venue = surface(page).locator(':scope > ul > li').first()
    const line = venue.locator(':scope > p')
    // The chevron shows while the pointer is over the item's own text.
    await line.hover()
    await expect.poll(() => pseudo(line, '::before')).toBe('')
    // Where the stylesheet put it: its box, off to the left of the text.
    const chevron = await line.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const before = getComputedStyle(element, '::before')
      const left = box.left + Number.parseFloat(before.left)
      const top = box.top + Number.parseFloat(before.top)
      return {
        x: left + Number.parseFloat(before.borderLeftWidth) / 2,
        y: top + Number.parseFloat(before.borderTopWidth),
      }
    })
    expect(chevron.x).toBeLessThan((await line.boundingBox())?.x ?? 0)
    await page.mouse.click(chevron.x, chevron.y)
    await expect(venue).toHaveAttribute('data-folded', '')
    await expect(venue.locator('ul')).toBeHidden()
    // Only the chevron folded it: the caret never moved into the item.
    expect(
      await page.evaluate(() => window.uiPage.editor.state.doc.child(0).child(0).attrs.folded),
    ).toBe(true)

    // A caret sent into what the fold hides opens it.
    await page.evaluate(() => {
      const { editor } = window.uiPage
      const selection = editor.state.selection.constructor as unknown as new (
        position: unknown,
      ) => unknown
      const hall = { path: [0, 0, 1, 0, 0], offset: 1 }
      editor.dispatch(editor.state.tr.setSelection(new selection(hall) as never))
    })
    await expect(venue).not.toHaveAttribute('data-folded', '')
    await expect(venue.locator('ul')).toBeVisible()

    // And Format ▸ Lists folds the item at the caret.
    await line.click()
    await runMenuItem(page, 'format', 'toggleListFold')
    await expect(venue).toHaveAttribute('data-folded', '')
  })

  test('a list sorts A to Z and Z to A, numbers in order and case aside', async ({ page }) => {
    await load(page, {
      type: 'orderedList',
      content: [li('Zeta'), li('alpha'), li('Beta 10'), li('Beta 2')],
    })
    const items = surface(page).locator('ol > li')
    await items.first().locator('p').click()
    await runMenuItem(page, 'format', 'sortListAscending')
    await expect(items).toHaveText(['alpha', 'Beta 2', 'Beta 10', 'Zeta'])
    await runMenuItem(page, 'format', 'sortListDescending')
    await expect(items).toHaveText(['Zeta', 'Beta 10', 'Beta 2', 'alpha'])
  })

  test('a multilevel list of the writer’s own numbers the list, and joins the gallery', async ({
    page,
  }) => {
    await load(page, {
      type: 'orderedList',
      content: [li('Plan', { type: 'orderedList', content: [li('Scope')] }), li('Build')],
    })
    await surface(page).locator('ol > li p').first().click()
    await runMenuItem(page, 'format', 'defineListNumbering')
    const dialog = page.locator('.trevixal-listscheme')
    await expect(dialog.locator('tbody tr')).toHaveCount(9)
    await dialog.locator('[aria-label="Level 1 marker"]').fill('Step %1:')
    await dialog.locator('[aria-label="Level 1 starts at"]').fill('3')
    await dialog.locator('[aria-label="Level 2 number style"]').selectOption('lower-alpha')
    await dialog.locator('[aria-label="Level 2 marker"]').fill('%1.%2)')
    await dialog.locator('input[type="text"]').first().fill('Steps')
    await expect(dialog.locator('.trevixal-listscheme__marker').first()).toHaveText('Step 3:')
    await dialog.locator('.trevixal-dialog__button--primary').click()
    await expect(dialog).toHaveCount(0)

    const outer = surface(page).locator(':scope > ol')
    await expect(outer).toHaveAttribute('data-numbering', 'custom-1')
    expect(await pseudo(outer.locator(':scope > li').first(), '::before')).toBe(
      'Stepcounter(tvx-list-1):',
    )
    expect(await pseudo(outer.locator('ol > li').first(), '::before')).toBe(
      'counter(tvx-list-1).counter(tvx-list-2,lower-alpha))',
    )
    // The marker sits in the gutter, ending where the text starts.
    const gap = await outer
      .locator(':scope > li')
      .first()
      .evaluate((item) => {
        const before = getComputedStyle(item, '::before')
        return {
          position: before.position,
          list: getComputedStyle(item.parentElement as Element).paddingInlineStart,
        }
      })
    expect(gap.position).toBe('absolute')

    // The scheme saves with the document, and the gallery offers it next time.
    const html = await page.evaluate(() => window.uiPage.editor.getHTML())
    expect(html).toContain('data-list-schemes=')
    await page.click('.trevixal-listgallery .trevixal-dropdown__trigger')
    const tile = page.locator('.trevixal-listgallery__grid--defined .trevixal-listgallery__tile')
    await expect(tile).toHaveAttribute('aria-label', 'Steps: Step 3: 3.a) i.')
    await expect(tile).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('tables', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(uiPage)
  })

  const longTable = () => ({
    type: 'table',
    content: [
      row(['Item', 'Owner', 'Cost'], true),
      ...Array.from({ length: 40 }, (_, index) => row([`Row ${index + 1}`, 'Sam', String(index)])),
    ],
  })

  test('the header row stays at the top of the window while a long table scrolls by', async ({
    page,
  }) => {
    await load(page, p('Before'), longTable(), p('After'))
    await surface(page).getByRole('cell', { name: 'Row 3', exact: true }).click()
    await runMenuItem(page, 'table', 'freezeHeaderRow')
    const table = surface(page).locator('table')
    await expect(table).toHaveAttribute('data-freeze-header', '')
    const header = table.locator('th').first()
    const scrollIntoTable = () =>
      page.evaluate(() => {
        const box = document.querySelector('#editor table')?.getBoundingClientRect()
        window.scrollTo(0, window.scrollY + (box?.top ?? 0) + 600)
      })
    await scrollIntoTable()
    await expect.poll(async () => Math.round((await header.boundingBox())?.y ?? -1)).toBe(0)
    expect((await table.boundingBox())?.y ?? 0).toBeLessThan(-300)
    // Off again, it scrolls away with the rest. (The menu brings the caret back into view.)
    await runMenuItem(page, 'table', 'freezeHeaderRow')
    await scrollIntoTable()
    await expect.poll(async () => (await header.boundingBox())?.y ?? 0).toBeLessThan(-100)
  })

  test('the first column freezes, and cells take padding and a vertical alignment', async ({
    page,
  }) => {
    // A notes cell of three paragraphs, so the row is taller than its first cell's text.
    const notes = {
      type: 'tableCell',
      attrs: { header: false },
      content: [p('One'), p('Two'), p('Three')],
    }
    await load(page, {
      type: 'table',
      content: [
        row(['Region', 'Notes'], true),
        { type: 'tableRow', content: [cell('North'), notes] },
      ],
    })
    const north = surface(page).getByRole('cell', { name: 'North', exact: true })
    await north.click()
    await runMenuItem(page, 'table', 'freezeFirstColumn')
    await expect(north).toHaveCSS('position', 'sticky')
    await expect(surface(page).locator('th').first()).toHaveCSS('position', 'sticky')

    await runMenuItem(page, 'table', 'cellPaddingWide')
    await expect(north).toHaveCSS('padding-top', '16px')
    await runMenuItem(page, 'table', 'cellPaddingNone')
    await expect(north).toHaveCSS('padding-left', '0px')
    await runMenuItem(page, 'table', 'cellPaddingNormal')
    await expect(north).not.toHaveCSS('padding-left', '0px')

    await north.click()
    await runMenuItem(page, 'table', 'cellAlignBottom')
    await expect(north).toHaveCSS('vertical-align', 'bottom')
    await runMenuItem(page, 'table', 'cellAlignMiddle')
    await expect(north).toHaveCSS('vertical-align', 'middle')
    const [cellBox, textBox] = await north.evaluate((element) => [
      element.getBoundingClientRect().toJSON(),
      element.querySelector('p')?.getBoundingClientRect().toJSON(),
    ])
    // Middle: as much room above the text as below it.
    const above = textBox.top - cellBox.top
    const below = cellBox.bottom - textBox.bottom
    expect(Math.abs(above - below)).toBeLessThan(3)
    expect(above).toBeGreaterThan(12)
  })

  test('a table goes inside a cell, and keeps its own lines when the outer one has none', async ({
    page,
  }) => {
    await load(page, { type: 'table', content: [row(['A', 'B'], true), row(['C', 'D'])] })
    await surface(page).getByRole('cell', { name: 'D', exact: true }).click()
    await runMenuItem(page, 'table', 'bordersNone')
    await runMenuItem(page, 'table', 'insertTable')
    const inner = surface(page).locator('table table')
    await expect(inner).toHaveCount(1)
    await page.keyboard.type('x')
    await page.keyboard.press('Tab')
    await page.keyboard.type('y')
    await expect(inner.locator('th, td').nth(0)).toHaveText('x')
    await expect(inner.locator('th, td').nth(1)).toHaveText('y')
    const colours = await page.evaluate(() => {
      const outer = document.querySelector(
        '#editor table > tr > td, #editor table > tbody > tr > td',
      )
      const nested = document.querySelector('#editor table table td')
      return [outer, nested].map((element) =>
        element ? getComputedStyle(element).borderTopColor : 'missing',
      )
    })
    expect(colours[0]).toBe('rgba(0, 0, 0, 0)')
    expect(colours[1]).not.toBe('rgba(0, 0, 0, 0)')
  })
})

test.describe('the built demo', () => {
  // The seeded demo embeds a YouTube video, which holds the load event on a
  // machine without a network; nothing here needs it.
  test.beforeEach(async ({ page }) => {
    await page.route(/youtube/, (route) => route.abort())
  })

  test('Table ▸ Insert caption… captions the table, and a print repeats its header row', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const content = page.locator('#editor .trevixal-content')
      await content.locator('> h1').first().click()
      await page.keyboard.press('End')
      await page.keyboard.press('Enter')
      await runMenuItem(page, 'table', 'insertTable')
      const table = content.locator('> table').first()
      await expect(table).toBeVisible()
      await runMenuItem(page, 'table', 'tableCaption')
      const dialog = page.locator('.trevixal-dialog')
      await expect(dialog.locator('[name="kind"]')).toHaveValue('table')
      await dialog.locator('.trevixal-dialog__button--primary').click()
      await expect(dialog).toHaveCount(0)
      // Word's default: a table is captioned above it.
      const caption = await table.evaluate((element) => element.previousElementSibling?.textContent)
      expect(caption).toMatch(/^Table \d+/)

      await runMenuItem(page, 'file', 'printPreview')
      const frame = page.frameLocator('.trevixal-print-preview__frame')
      await expect(
        frame.locator('table').first().locator('> thead > tr > th').first(),
      ).toBeAttached()
      await expect(frame.locator('table').first().locator('> tbody > tr > th')).toHaveCount(0)
    } finally {
      await server.close()
    }
  })
})
