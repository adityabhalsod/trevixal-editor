import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/full-editor/dist')

interface Geometry {
  readonly table: number
  readonly tableRight: number
  readonly columns: readonly number[]
  readonly rows: readonly number[]
  readonly tableStyle: string | null
  readonly cellStyle: string | null
  /** The editor's content box: the widest a table may be. */
  readonly available: number
  readonly contentRight: number
}

/** Rendered sizes of the seeded table, and the box it has to stay inside. */
async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const table = document.querySelector('.trevixal-content table') as HTMLTableElement
    const first = table.rows[0] as HTMLTableRowElement
    const content = document.querySelector('.trevixal-content') as HTMLElement
    const style = getComputedStyle(content)
    const box = content.getBoundingClientRect()
    const padding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
    const contentRight =
      box.right - Number.parseFloat(style.paddingRight) - Number.parseFloat(style.borderRightWidth)
    return {
      table: table.getBoundingClientRect().width,
      tableRight: table.getBoundingClientRect().right,
      columns: [...first.cells].map((cell) => cell.getBoundingClientRect().width),
      rows: [...table.rows].map((row) => row.getBoundingClientRect().height),
      tableStyle: table.getAttribute('style'),
      cellStyle: first.cells[0]?.getAttribute('style') ?? null,
      available: content.clientWidth - padding,
      contentRight,
    }
  })
}

/** Rendering rounds, and the committed widths are whole pixels. */
function near(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1.5)
}

/** The one thing no drag may do: put the table past the editor's edge. */
function inside(after: Geometry): void {
  expect(after.tableRight).toBeLessThanOrEqual(after.contentRight + 0.5)
}

async function cellBox(page: Page, index: number) {
  const cell = page.locator('.trevixal-content table tr').first().locator('td, th').nth(index)
  const box = await cell.boundingBox()
  if (!box) throw new Error('no cell')
  return box
}

const centre = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
})

/**
 * Move the pointer, never past the edge of the window.
 *
 * Chromium keeps delivering pointer moves for coordinates outside the
 * viewport; Firefox stops at the edge, so a drag aimed at 1655px in a 1400px
 * window ended early and the clamping under test was never reached. The
 * editor's column is far narrower than the window, so a drag to the last
 * pixel still asks for more width than fits, which is what these tests are
 * about.
 */
async function moveOnScreen(page: Page, x: number, y: number): Promise<void> {
  const viewport = page.viewportSize()
  const limit = (value: number, max: number | undefined) =>
    max === undefined ? value : Math.min(Math.max(value, 2), max - 2)
  await page.mouse.move(limit(x, viewport?.width), limit(y, viewport?.height), { steps: 8 })
}

/**
 * Drag from (x, y) by (dx, dy). The pointer approaches from inside the cell
 * first: the handler arms on hover, so a press with no preceding move is a
 * click on the edge rather than a resize.
 */
async function drag(
  page: Page,
  from: { x: number; y: number },
  x: number,
  y: number,
  dx: number,
  dy: number,
  modifier?: 'Shift',
) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.move(x, y)
  await page.waitForTimeout(80)
  if (modifier) await page.keyboard.down(modifier)
  await page.mouse.down()
  await moveOnScreen(page, x + dx, y + dy)
  await page.mouse.up()
  if (modifier) await page.keyboard.up(modifier)
  await settled(page)
}

/**
 * Wait until the table has stopped moving.
 *
 * A fixed pause here is a flake waiting for a loaded machine: the commit runs
 * on a frame, and under enough parallel workers one frame takes longer than
 * any timeout worth writing. This watches the width instead, and returns as
 * soon as two consecutive frames agree.
 */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const table = document.querySelector('.trevixal-content table')
      if (!table) return true
      const now = Math.round(table.getBoundingClientRect().width)
      const scope = window as unknown as { __tableWidth?: number }
      const previous = scope.__tableWidth
      scope.__tableWidth = now
      return previous === now
    },
    undefined,
    { polling: 'raf', timeout: 5000 },
  )
  await page.evaluate(() => {
    ;(window as unknown as { __tableWidth?: number }).__tableWidth = undefined
  })
}

/** Drag the right edge of the first row's `index`-th cell. */
async function dragEdge(page: Page, index: number, dx: number, modifier?: 'Shift') {
  const box = await cellBox(page, index)
  await drag(page, centre(box), box.x + box.width - 2, centre(box).y, dx, 0, modifier)
}

async function open(page: Page) {
  const server = await serveDist(distDir)
  await page.goto(server.origin)
  await page.waitForSelector('.trevixal-content table')
  // Every drag here is done in viewport coordinates, so the table has to be
  // on screen: the demo's document is long enough that it starts below the
  // fold, and a pointer aimed past the viewport hits nothing at all. The
  // first table is the one these tests size, as `querySelector` finds it;
  // the tour has more further down.
  await page.locator('.trevixal-content table').first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(120)
  return server
}

test.describe('table resizing', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 })
  })

  test('moves a border between two columns and keeps the table its width', async ({ page }) => {
    const server = await open(page)
    try {
      const before = await geometry(page)
      // The seeded table fills the editor: there is no room to grow into.
      near(before.table, before.available)
      await dragEdge(page, 0, 60)

      const after = await geometry(page)
      // Exactly the drag: no jump from padding being counted twice, and the
      // neighbour gives up the same amount, so nothing else moves.
      near(after.columns[0] ?? 0, (before.columns[0] ?? 0) + 60)
      near(after.columns[1] ?? 0, (before.columns[1] ?? 0) - 60)
      near(after.columns[2] ?? 0, before.columns[2] ?? 0)
      near(after.table, before.table)
      inside(after)
      // And it reached the document, not just the DOM.
      expect(after.cellStyle).toContain('width:')
      expect(after.tableStyle).toContain('table-layout: fixed')
    } finally {
      await server.close()
    }
  })

  test('a left edge moves the same border', async ({ page }) => {
    const server = await open(page)
    try {
      const before = await geometry(page)
      const box = await cellBox(page, 1)

      // Approach from inside the cell, then onto its left edge, which is the
      // border with the *previous* column.
      await page.mouse.move(centre(box).x, centre(box).y)
      await page.mouse.move(box.x + 2, centre(box).y)
      await page.waitForTimeout(100)
      const cursor = await page.evaluate(
        () => (document.querySelector('.trevixal-content') as HTMLElement).style.cursor,
      )
      expect(cursor).toBe('col-resize')
      // The edge is highlighted before the drag, so the grab zone can be found.
      await expect(page.locator('.trevixal-resize-guide')).toBeVisible()

      await page.mouse.down()
      await page.mouse.move(box.x + 2 - 40, centre(box).y, { steps: 8 })
      await page.mouse.up()
      await settled(page)

      const after = await geometry(page)
      near(after.columns[0] ?? 0, (before.columns[0] ?? 0) - 40)
      near(after.columns[1] ?? 0, (before.columns[1] ?? 0) + 40)
      near(after.table, before.table)
    } finally {
      await server.close()
    }
  })

  test('a border stops where its neighbour reaches the minimum width', async ({ page }) => {
    const server = await open(page)
    try {
      const before = await geometry(page)
      await dragEdge(page, 0, 2000)

      const after = await geometry(page)
      const neighbour = after.columns[1] ?? 0
      // Squeezed to the floor, not to nothing, and the table has not moved.
      expect(neighbour).toBeGreaterThanOrEqual(40)
      expect(neighbour).toBeLessThanOrEqual(60)
      near(after.columns[0] ?? 0, (before.columns[0] ?? 0) + ((before.columns[1] ?? 0) - neighbour))
      near(after.columns[2] ?? 0, before.columns[2] ?? 0)
      near(after.table, before.table)
      inside(after)
    } finally {
      await server.close()
    }
  })

  test("the outer edge changes the table's width, never past the editor", async ({ page }) => {
    const server = await open(page)
    try {
      const before = await geometry(page)
      const last = before.columns.length - 1
      await dragEdge(page, last, -80)

      const narrower = await geometry(page)
      near(narrower.columns[last] ?? 0, (before.columns[last] ?? 0) - 80)
      near(narrower.columns[0] ?? 0, before.columns[0] ?? 0)
      near(narrower.columns[1] ?? 0, before.columns[1] ?? 0)
      near(narrower.table, before.table - 80)

      // Asking for far more than fits stops exactly at the editor's edge.
      await dragEdge(page, last, 300)
      const clamped = await geometry(page)
      near(clamped.table, clamped.available)
      inside(clamped)
    } finally {
      await server.close()
    }
  })

  test("Shift-drag moves one border alone, growing the table until the editor's edge", async ({
    page,
  }) => {
    const server = await open(page)
    try {
      const last = (await geometry(page)).columns.length - 1
      // Make room first.
      await dragEdge(page, last, -100)
      const before = await geometry(page)

      await dragEdge(page, 0, 60, 'Shift')
      const after = await geometry(page)
      // Only this border moved: the neighbour kept its width and the table grew.
      near(after.columns[0] ?? 0, (before.columns[0] ?? 0) + 60)
      near(after.columns[1] ?? 0, before.columns[1] ?? 0)
      near(after.columns[2] ?? 0, before.columns[2] ?? 0)
      near(after.table, before.table + 60)

      await dragEdge(page, 0, 500, 'Shift')
      const clamped = await geometry(page)
      near(clamped.table, clamped.available)
      inside(clamped)
    } finally {
      await server.close()
    }
  })

  test('a row edge changes only that row', async ({ page }) => {
    const server = await open(page)
    try {
      const before = await geometry(page)
      const box = await cellBox(page, 0)
      await drag(page, centre(box), centre(box).x, box.y + box.height - 2, 0, 30)

      const after = await geometry(page)
      near(after.rows[0] ?? 0, (before.rows[0] ?? 0) + 30)
      near(after.rows[1] ?? 0, before.rows[1] ?? 0)
      // Columns were not part of it, so the table keeps its fluid width.
      expect(after.columns).toEqual(before.columns)
      expect(after.tableStyle).toBeNull()
    } finally {
      await server.close()
    }
  })

  test('the corner handle scales the whole table, within the editor', async ({ page }) => {
    const server = await open(page)
    try {
      const handle = page.locator('.trevixal-table-resize-handle')
      // Only while the caret is inside the table.
      await expect(handle).toBeHidden()
      await page.locator('.trevixal-content table td').first().click()
      await expect(handle).toBeVisible()

      const before = await geometry(page)
      const grip = await handle.boundingBox()
      if (!grip) throw new Error('no handle')
      await page.mouse.move(centre(grip).x, centre(grip).y)
      await page.mouse.down()
      await page.mouse.move(centre(grip).x - 120, centre(grip).y, { steps: 8 })
      await page.mouse.up()
      await settled(page)

      const smaller = await geometry(page)
      near(smaller.table, before.table - 120)
      // Every column shrank by the same factor.
      const factor = smaller.table / before.table
      for (const [index, width] of before.columns.entries()) {
        near(smaller.columns[index] ?? 0, width * factor)
      }
      // And the handle followed the corner it belongs to.
      const moved = await handle.boundingBox()
      const table = await page.locator('.trevixal-content table').first().boundingBox()
      if (!moved || !table) throw new Error('lost the handle')
      near(centre(moved).x, table.x + table.width)
      near(centre(moved).y, table.y + table.height)

      // Dragged far past the editor, it stops at the editor's edge.
      await page.mouse.move(centre(moved).x, centre(moved).y)
      await page.mouse.down()
      await moveOnScreen(page, centre(moved).x + 400, centre(moved).y)
      await page.mouse.up()
      await settled(page)
      const clamped = await geometry(page)
      near(clamped.table, clamped.available)
      inside(clamped)
    } finally {
      await server.close()
    }
  })

  test('Escape abandons a resize, and a click on an edge changes nothing', async ({ page }) => {
    const server = await open(page)
    try {
      const before = await geometry(page)
      const box = await cellBox(page, 0)

      await page.mouse.move(centre(box).x, centre(box).y)
      await page.mouse.move(box.x + box.width - 2, centre(box).y)
      await page.waitForTimeout(80)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width - 2 + 60, centre(box).y, { steps: 8 })
      // The drag previews live…
      near((await geometry(page)).columns[0] ?? 0, (before.columns[0] ?? 0) + 60)
      // …and Escape puts every size back before anything is committed.
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await settled(page)
      expect(await geometry(page)).toEqual(before)

      await page.mouse.move(centre(box).x, centre(box).y)
      await page.mouse.move(box.x + box.width - 2, centre(box).y)
      await page.mouse.down()
      await page.mouse.up()
      await page.waitForTimeout(150)
      expect(await geometry(page)).toEqual(before)
    } finally {
      await server.close()
    }
  })

  test('a resize is one undo step and leaves the caret alone', async ({ page }) => {
    const server = await open(page)
    try {
      // The caret starts in the heading, well away from the table.
      await page.locator('.trevixal-content h1').click()
      const before = await geometry(page)
      await dragEdge(page, 0, 60)
      near((await geometry(page)).columns[0] ?? 0, (before.columns[0] ?? 0) + 60)

      const caretIn = await page.evaluate(() => {
        const anchor = document.getSelection()?.anchorNode
        const element = anchor?.nodeType === 1 ? (anchor as Element) : anchor?.parentElement
        return element?.closest('h1, table')?.tagName ?? null
      })
      expect(caretIn).toBe('H1')

      await page.keyboard.press('Control+z')
      await page.waitForTimeout(150)
      expect((await geometry(page)).columns).toEqual(before.columns)
    } finally {
      await server.close()
    }
  })

  /**
   * Pixels are a measurement of the window the drag happened in. Stored as
   * pixels, a table sized on a wide screen, in fullscreen, most obviously,
   * keeps that width when the space around it shrinks and hangs off the edge
   * of the editor, because `table-layout: fixed` widens a table to fit its
   * columns whatever `max-width` says.
   */
  test('a table sized in a wide window still fits a narrow one', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    const server = await open(page)
    try {
      await dragEdge(page, 0, 200)

      const fits = async (): Promise<{ over: number; ratio: number }> =>
        page.evaluate(() => {
          const table = document.querySelector('.trevixal-content table')
          const surface = document.querySelector('.trevixal-content')
          if (!table || !surface) throw new Error('no table')
          const t = table.getBoundingClientRect()
          const first = table.querySelector('td, th')
          return {
            over: Math.round(t.right - surface.getBoundingClientRect().right),
            // The first column's share of the table, which the narrowing must
            // preserve, fitting by collapsing the drag would be no fix.
            ratio: Math.round(((first?.getBoundingClientRect().width ?? 0) / t.width) * 100),
          }
        })

      const wide = await fits()
      expect(wide.over).toBeLessThanOrEqual(1)

      await page.setViewportSize({ width: 900, height: 900 })
      await page.waitForTimeout(300)
      const narrow = await fits()
      expect(narrow.over, 'table hanging past the editor').toBeLessThanOrEqual(1)
      expect(narrow.ratio).toBeGreaterThanOrEqual(wide.ratio - 2)
      expect(narrow.ratio).toBeLessThanOrEqual(wide.ratio + 2)
    } finally {
      await server.close()
    }
  })
})
