import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Locator, type Page, expect, test } from '@playwright/test'
import { isFullBrowserBuild } from './engine'
import { serveDist } from './serve-dist'

/**
 * The demo, built and served exactly as it ships, exercised through the
 * features added in the second wave: file actions, media, equations,
 * diagrams, containers, review surfaces and the presentation controls.
 *
 * Every assertion goes through the real chrome, a menu is opened and an
 * entry clicked, so a feature that is implemented but unreachable fails
 * here, which is the failure mode this suite exists to catch.
 */
const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/full-editor/dist')

/** Open a menubar menu and return the labels it offers. */
async function openMenu(page: Page, name: string): Promise<readonly string[]> {
  // Menus toggle, and hovering one while another is open switches to it, so
  // every open starts from a closed bar.
  await closeMenu(page)
  await page.click(`[data-trevixal-menu="${name}"]`)
  const panel = page.locator(`[data-trevixal-menu="${name}"] ~ .trevixal-dropdown__panel`)
  await expect(panel).toBeVisible()
  return panel.locator('.trevixal-menu__label').allTextContents()
}

async function closeMenu(page: Page): Promise<void> {
  const open = page.locator('.trevixal-menubar .trevixal-dropdown--open')
  if ((await open.count()) === 0) return
  await page.keyboard.press('Escape')
  await expect(open).toHaveCount(0)
}

/**
 * Roughly how much red the editing surface is painting. Spell-check marks are
 * the only red drawn over this document's prose, so the count jumps when the
 * browser has marked misspellings and drops back when it has not. Nothing in
 * the DOM reports whether checking actually happened, so this is the only way
 * to tell the two apart.
 */
async function redPixels(page: Page, surface: Locator): Promise<number> {
  const shot = await surface.screenshot()
  return page.evaluate(
    async (source) => {
      const image = new Image()
      image.src = source
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no 2d canvas context')
      context.drawImage(image, 0, 0)
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
      let red = 0
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0
        const g = data[i + 1] ?? 0
        const b = data[i + 2] ?? 0
        if (r > 110 && r - g > 45 && r - b > 45) red += 1
      }
      return red
    },
    `data:image/png;base64,${shot.toString('base64')}`,
  )
}

/** Click a menu entry by its stable item name. */
async function runMenuItem(page: Page, menu: string, item: string): Promise<void> {
  await page.click(`[data-trevixal-menu="${menu}"]`)
  await page.click(`[data-trevixal-menu="${menu}"] ~ * [data-trevixal-item="${item}"]`)
}

test.describe('the assembled feature set', () => {
  test('renders every new node kind from the seeded document', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const surface = page.locator('#editor .trevixal-content')
      // Equations render as MathML, not as the LaTeX that produced them.
      await expect(surface.locator('.trevixal-math math').first()).toBeVisible()
      await expect(surface.locator('.trevixal-math--block')).toHaveCount(1)
      // Media, containers and citations.
      await expect(surface.locator('iframe.trevixal-embed')).toHaveCount(1)
      await expect(surface.locator('.trevixal-linkcard')).toHaveCount(1)
      await expect(surface.locator('.trevixal-tabs__panel')).toHaveCount(2)
      await expect(surface.locator('.trevixal-accordion__item')).toHaveCount(2)
      await expect(surface.locator('.trevixal-citation')).toHaveCount(1)
      await expect(surface.locator('.trevixal-references__item')).toHaveCount(1)
    } finally {
      await server.close()
    }
  })

  test('offers every feature from the menus', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)

      const file = await openMenu(page, 'file')
      expect(file).toContain('Open…')
      expect(file).toContain('Markdown (.md)')
      expect(file).toContain('Local backups…')
      expect(file).toContain('Print preview…')
      await closeMenu(page)

      const insert = await openMenu(page, 'insert')
      for (const label of ['Video…', 'Embed a link…', 'Equation…', 'Diagram', 'Citation…']) {
        expect(insert).toContain(label)
      }
      await closeMenu(page)

      const table = await openMenu(page, 'table')
      for (const label of [
        'Cell background…',
        'Ascending',
        'Import CSV…',
        'Convert text to table',
      ]) {
        expect(table).toContain(label)
      }
      await closeMenu(page)

      const view = await openMenu(page, 'view')
      for (const label of ['Sepia', 'Custom CSS…', 'Page view', 'History', 'Read-only mode']) {
        expect(view).toContain(label)
      }
      await closeMenu(page)

      const tools = await openMenu(page, 'tools')
      for (const label of ['Document statistics…', 'Edit as Markdown']) {
        expect(tools).toContain(label)
      }
      await closeMenu(page)
    } finally {
      await server.close()
    }
  })

  test('switches a tab and writes the choice into the document', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const panels = page.locator('#editor .trevixal-tabs__panel')
      await expect(panels.nth(0)).toHaveAttribute('data-active', 'true')
      await page.locator('#editor .trevixal-tabs__title').nth(1).click()
      await expect(panels.nth(1)).toHaveAttribute('data-active', 'true')
      await expect(panels.nth(0)).toHaveAttribute('data-active', 'false')
      // The serialized output is the proof it is in the document, not the DOM.
      await expect(page.locator('#output')).toContainText('data-active="true"')
    } finally {
      await server.close()
    }
  })

  test('applies a theme preset and the page view', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await runMenuItem(page, 'view', 'themeSepia')
      await expect(page.locator('html')).toHaveAttribute('data-trevixal-preset', 'sepia')
      // A preset built on the light palette also pins the theme to light.
      await expect(page.locator('html')).toHaveAttribute('data-trevixal-theme', 'light')

      await runMenuItem(page, 'view', 'pageMode')
      await expect(page.locator('.editor-shell')).toHaveClass(/trevixal-paged/)
      const width = await page
        .locator('#editor .trevixal-content')
        .evaluate((element) => getComputedStyle(element).width)
      // A4 at 96dpi is 794px; the sheet must be near that, not the full column.
      expect(Number.parseFloat(width)).toBeGreaterThan(700)
      expect(Number.parseFloat(width)).toBeLessThan(820)
    } finally {
      await server.close()
    }
  })

  test('opens the shortcut manager and rebinds a key', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await runMenuItem(page, 'help', 'keyboardShortcuts')
      const dialog = page.locator('.trevixal-shortcuts')
      await expect(dialog).toBeVisible()
      const bold = dialog.locator('[data-trevixal-shortcut="bold"]')
      await expect(bold.locator('.trevixal-shortcuts__keys')).toHaveText('Ctrl+B')
      await bold.locator('.trevixal-shortcuts__change').click()
      await expect(bold.locator('.trevixal-shortcuts__keys')).toHaveText('Press keys…')
      await page.keyboard.press('Control+Shift+B')
      await expect(bold.locator('.trevixal-shortcuts__keys')).toHaveText('Ctrl+Shift+B')
      await expect(dialog.locator('.trevixal-shortcuts__status')).toContainText('assigned')
      // Reset, so the reload in the next test starts from the defaults.
      await dialog.getByText('Reset all').click()
      await expect(bold.locator('.trevixal-shortcuts__keys')).toHaveText('Ctrl+B')
      await page.keyboard.press('Escape')
    } finally {
      await server.close()
    }
  })

  test('reports document statistics', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await runMenuItem(page, 'tools', 'writingStats')
      const dialog = page.locator('.trevixal-dialog--info')
      await expect(dialog).toBeVisible()
      const terms = await dialog.locator('.trevixal-dialog__term').allTextContents()
      expect(terms).toContain('Sentences')
      expect(terms).toContain('Reading time')
      expect(terms).toContain('Readability')
      // Every count is filled in from the seeded document, not left blank.
      const values = await dialog.locator('.trevixal-dialog__description').allTextContents()
      expect(values.every((value) => value.trim().length > 0)).toBe(true)
      await page.keyboard.press('Escape')
    } finally {
      await server.close()
    }
  })

  test('marks passive voice while leaving the text alone', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const flagged = page.locator('#editor .trevixal-writing--passive')
      await expect(flagged.first()).toBeVisible()
      // Decorations never enter the document, so the serialized output has none.
      // The serialized document carries no decoration classes. (The inlined
      // stylesheet names them, so this looks for the attribute, not the word.)
      await expect(page.locator('#output')).not.toContainText('class="trevixal-writing')
    } finally {
      await server.close()
    }
  })

  test('shows the review bar', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const bar = page.locator('.trevixal-trackchanges')
      await expect(bar).toBeVisible()
      await expect(bar).toContainText('No suggestions')
    } finally {
      await server.close()
    }
  })

  test('autosaves the document and says so', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.locator('#editor .trevixal-content p').first().click()
      await page.keyboard.type('Autosaved. ')
      await expect(page.locator('.trevixal-autosave')).toHaveAttribute('data-status', 'saved', {
        timeout: 5000,
      })
      const stored = await page.evaluate(() =>
        window.localStorage.getItem('trevixal:autosave:document:draft'),
      )
      expect(stored).toContain('Autosaved.')
    } finally {
      await server.close()
    }
  })

  test('the spell check entry toggles the surface and reports its own state', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const surface = page.locator('#editor .trevixal-content')
      const entry = page.locator('[data-trevixal-item="spellcheck"]')
      // Put the caret in the document and let the browser finish checking it.
      await surface.locator('p').first().click()
      await page.waitForTimeout(2500)

      // The attribute is absent until it is set; absent means the browser's
      // default, which is on.
      await expect(surface).not.toHaveAttribute('spellcheck', 'false')
      await page.click('[data-trevixal-menu="tools"]')
      await expect(entry).toHaveAttribute('aria-checked', 'true')
      const marked = await redPixels(page, surface)

      // Off: the surface stops being spell checked and the entry says so.
      await entry.click()
      await expect(surface).toHaveAttribute('spellcheck', 'false')
      await page.waitForTimeout(1500)
      const unmarked = await redPixels(page, surface)
      await page.click('[data-trevixal-menu="tools"]')
      await expect(entry).toHaveAttribute('aria-checked', 'false')

      // A machine with no dictionary installed paints no marks at all, and
      // there is then nothing to measure, only hold the browser to restoring
      // them if it drew them in the first place. Chrome's headless shell is a
      // second case: it marks what it finds as the document loads and never
      // re-checks afterwards, whatever happens to the text. See
      // `isFullBrowserBuild`.
      const rechecks = marked > unmarked * 1.2 && (await isFullBrowserBuild(page))

      // Back on. Flipping the attribute is not enough on its own: the browser
      // does not re-check text already on screen, so the surface has to hand it
      // fresh text nodes. Node views must survive that. An embed that is
      // replaced reloads, restarting a playing video on a display-only toggle.
      const serializedBefore = await page.locator('#output').textContent()
      await page.evaluate(() => {
        const dom = document.querySelector('#editor .trevixal-content')
        if (!dom) throw new Error('no editing surface')
        for (const frame of dom.querySelectorAll('iframe.trevixal-embed')) {
          ;(frame as HTMLIFrameElement & { kept?: boolean }).kept = true
        }
      })

      await entry.click()
      await expect(surface).toHaveAttribute('spellcheck', 'true')

      if (rechecks) {
        // Polled rather than slept on. Re-checking is the browser's own work,
        // done when it gets to it, and how long it takes depends on how much
        // text there is and what else the machine is doing. A fixed wait is
        // either too short under load or wasted the rest of the time.
        await expect
          .poll(() => redPixels(page, surface), { intervals: [500], timeout: 20_000 })
          .toBeGreaterThan(unmarked * 1.2)
      }
      const frames = await page.evaluate(() => {
        const found = [
          ...document.querySelectorAll('#editor .trevixal-content iframe.trevixal-embed'),
        ]
        return {
          total: found.length,
          kept: found.filter((frame) => (frame as HTMLIFrameElement & { kept?: boolean }).kept)
            .length,
        }
      })
      expect(frames.total).toBeGreaterThan(0)
      expect(frames.kept).toBe(frames.total)
      // Refreshing what is on screen must not touch the document itself.
      expect(await page.locator('#output').textContent()).toBe(serializedBefore)

      await page.click('[data-trevixal-menu="tools"]')
      await expect(entry).toHaveAttribute('aria-checked', 'true')
    } finally {
      await server.close()
    }
  })

  /**
   * A preset writes its palette from a stylesheet built at runtime, onto the
   * element the kit's own stylesheet already writes tokens to. It only lands
   * if it outweighs that, and the page must not restate the same colours in
   * hex on top. Get either wrong and every preset silently collapses into
   * plain light or plain dark, which is what the attribute alone cannot
   * tell you, so this reads the pixels.
   */
  test('each theme preset actually repaints the editor', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      const surface = page.locator('#editor .trevixal-content')
      const paint = async (item: string): Promise<string> => {
        await page.goto(server.origin)
        await runMenuItem(page, 'view', item)
        await expect(surface).toBeVisible()
        return page.evaluate(() => {
          const target = document.querySelector('#editor .trevixal-content')
          if (!target) throw new Error('no surface')
          const style = getComputedStyle(target)
          return `${style.backgroundColor}|${style.color}`
        })
      }

      const light = await paint('themeLight')
      const dark = await paint('themeDark')
      expect(light).not.toBe(dark)

      const presets: Record<string, string> = {}
      for (const name of [
        'themeSepia',
        'themeNord',
        'themeSolarized',
        'themeContrast',
        'themeMidnight',
      ]) {
        presets[name] = await paint(name)
      }

      // None of them may be a repaint of the base palette it is built on.
      expect(presets.themeSepia, 'Sepia is just Light').not.toBe(light)
      expect(presets.themeSolarized, 'Solarized is just Light').not.toBe(light)
      expect(presets.themeContrast, 'High contrast is just Light').not.toBe(light)
      expect(presets.themeNord, 'Nord is just Dark').not.toBe(dark)
      expect(presets.themeMidnight, 'Midnight is just Dark').not.toBe(dark)
      // …nor of each other.
      const looks = [light, dark, ...Object.values(presets)]
      expect(new Set(looks).size, 'themes sharing a palette').toBe(looks.length)
    } finally {
      await server.close()
    }
  })

  /**
   * The chrome used a border colour to fill a control while it was open or
   * hovered. That reads fine while borders are pale, but a palette is free to
   * make them the same ink as the text, the high-contrast one makes both pure
   * black, and the control then swallowed its own label at a contrast of
   * 1:1. Nothing about the markup changes when that happens, so this measures
   * the pixels.
   */
  test('an open menu keeps its label readable in every theme', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      for (const theme of [
        'themeLight',
        'themeDark',
        'themeSepia',
        'themeNord',
        'themeSolarized',
        'themeContrast',
        'themeMidnight',
      ]) {
        await page.goto(server.origin)
        await runMenuItem(page, 'view', theme)
        await page.click('[data-trevixal-menu="view"]')
        await expect(page.locator('[role="menu"]:not([hidden])').first()).toBeVisible()

        const contrast = await page.evaluate(() => {
          const trigger = document.querySelector<HTMLElement>('[data-trevixal-menu="view"]')
          if (!trigger) throw new Error('no trigger')
          const channels = (value: string): number[] => (value.match(/[\d.]+/g) ?? []).map(Number)
          const blend = (top: number[], under: number[]): number[] => {
            const alpha = top[3] ?? 1
            return [0, 1, 2].map((i) => (top[i] ?? 0) * alpha + (under[i] ?? 0) * (1 - alpha))
          }
          // The fill can be translucent, so flatten it against the first
          // opaque thing behind it before comparing.
          let behind = [255, 255, 255]
          const layers: number[][] = []
          for (let node: HTMLElement | null = trigger; node; node = node.parentElement) {
            const colour = channels(getComputedStyle(node).backgroundColor)
            if ((colour[3] ?? 1) > 0) layers.push(colour)
            if ((colour[3] ?? 1) === 1) break
          }
          for (let i = layers.length - 1; i >= 0; i--) {
            behind = blend(layers[i] ?? [], behind)
          }
          const relative = (colour: number[]): number => {
            const channel = (value: number): number => {
              const part = value / 255
              return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
            }
            return (
              0.2126 * channel(colour[0] ?? 0) +
              0.7152 * channel(colour[1] ?? 0) +
              0.0722 * channel(colour[2] ?? 0)
            )
          }
          const ink = blend(channels(getComputedStyle(trigger).color), behind)
          const [lighter, darker] = [relative(ink), relative(behind)].sort((a, b) => b - a)
          return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
        })
        // 4.5:1 is the AA floor for body-sized text; the bug measured 1:1.
        expect(contrast, `open menu label in ${theme}`).toBeGreaterThanOrEqual(4.5)
      }
    } finally {
      await server.close()
    }
  })

  test('every menu entry carries an icon, and a list of choices does not repeat one', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-menubar__trigger')
      const labels = await page.locator('.trevixal-menubar__trigger').allTextContents()

      const missing: string[] = []
      for (const label of labels) {
        await page.goto(server.origin)
        await page.waitForSelector('.trevixal-menubar__trigger')
        await page.locator('.trevixal-menubar__trigger', { hasText: label.trim() }).first().click()
        await expect(page.locator('[role="menu"]:not([hidden])').first()).toBeVisible()
        const blank = await page.evaluate(() => {
          const panel = [...document.querySelectorAll('.trevixal-dropdown__panel')].find(
            (node) => !(node as HTMLElement).hidden && node.getBoundingClientRect().width > 0,
          )
          if (!panel) return []
          return [...panel.querySelectorAll('.trevixal-menu__item')]
            .filter((row) => !row.querySelector('.trevixal-menu__icon svg path'))
            .map((row) => row.querySelector('.trevixal-menu__label')?.textContent ?? '?')
        })
        missing.push(...blank.map((entry) => `${label.trim()} ▸ ${entry}`))
      }
      expect(missing, 'entries with no icon').toEqual([])

      // A set of alternatives has to be told apart at a glance. The theme
      // presets all drew the same three lines, which made the list useless.
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-menubar__trigger')
      await page.locator('.trevixal-menubar__trigger', { hasText: 'View' }).first().click()
      const themes = await page.evaluate(() => {
        const wanted = [
          'Light',
          'Dark',
          'Match the system',
          'Sepia',
          'Nord',
          'Solarized',
          'High contrast',
          'Midnight',
        ]
        const panel = [...document.querySelectorAll('.trevixal-dropdown__panel')].find(
          (node) => !(node as HTMLElement).hidden && node.getBoundingClientRect().width > 0,
        )
        if (!panel) return { found: 0, distinct: 0 }
        const shapes = [...panel.querySelectorAll('.trevixal-menu__item')]
          .filter((row) =>
            wanted.includes(row.querySelector('.trevixal-menu__label')?.textContent ?? ''),
          )
          .map((row) => row.querySelector('svg path')?.getAttribute('d') ?? '')
        return { found: shapes.length, distinct: new Set(shapes).size }
      })
      expect(themes.found).toBe(8)
      expect(themes.distinct, 'theme presets sharing a glyph').toBe(themes.found)
    } finally {
      await server.close()
    }
  })

  test('the command palette offers what the menus offer, icons and all', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.locator('#editor .trevixal-content p').first().click()
      await page.keyboard.press('Control+k')
      const rows = page.locator('.trevixal-palette__item')
      await expect(rows.first()).toBeVisible()

      // Hand-listing the palette left it offering a couple of dozen commands
      // while the menus offered two hundred.
      const count = await rows.count()
      expect(count).toBeGreaterThan(100)
      expect(await page.locator('.trevixal-palette__item svg').count()).toBe(count)

      // The list scrolls, and it has to scroll the way the rest of the kit
      // does: the platform's own bar is heavier than the panel and brings
      // stepper arrows with it. A bar that takes no layout space is the proof
      // the kit's own styling is in force. The default takes about 15px.
      const bar = await page.evaluate(() => {
        const list = document.querySelector<HTMLElement>('.trevixal-palette__list')
        if (!list) throw new Error('no palette list')
        return {
          overflows: list.scrollHeight > list.clientHeight,
          takes: list.offsetWidth - list.clientWidth,
          styled: getComputedStyle(list).scrollbarWidth,
        }
      })
      expect(bar.overflows).toBe(true)
      // Engines report slimness differently: Chromium says `thin`, Firefox
      // computes `none` once the thumb is transparent. Either is the kit's
      // styling rather than the platform default, which is `auto`.
      expect(['thin', 'none']).toContain(bar.styled)
      expect(bar.takes, 'scrollbar eating layout width').toBeLessThanOrEqual(2)

      // Entries buried in submenus are reachable, which is the point.
      for (const [query, expected] of [
        ['docx', 'Word document (.docx)'],
        ['midnight', 'Midnight'],
        ['distribute col', 'Distribute columns evenly'],
      ] as const) {
        await page.fill('.trevixal-palette__input', query)
        await expect(rows.first().locator('.trevixal-palette__label')).toHaveText(expected)
      }
    } finally {
      await server.close()
    }
  })

  test('menu entries stay on one line, and the panel stays on screen', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      // Phone width on purpose: it is the size at which a panel wide enough to
      // hold `Paste without formatting` on one line has to open inward to stay
      // on screen, so both halves of the behaviour are under test at once.
      await page.setViewportSize({ width: 400, height: 900 })
      await page.goto(server.origin)
      await page.waitForSelector('.trevixal-menubar__trigger')

      const labels = await page.locator('.trevixal-menubar__trigger').allTextContents()
      expect(labels.length).toBeGreaterThanOrEqual(8)

      for (const label of labels) {
        // Reload between menus: a menubar switches on hover, so clicking the
        // next trigger while one is open can close it instead.
        await page.goto(server.origin)
        await page.waitForSelector('.trevixal-menubar__trigger')
        await page.locator('.trevixal-menubar__trigger', { hasText: label.trim() }).first().click()
        await expect(page.locator('[role="menu"]:not([hidden])').first()).toBeVisible()

        const report = await page.evaluate(() => {
          const panel = [...document.querySelectorAll('.trevixal-dropdown__panel')].find(
            (node) => !(node as HTMLElement).hidden && node.getBoundingClientRect().width > 0,
          )
          if (!panel) return null
          // A label is a flex item, so it is a block box and reports a single
          // client rect however many lines it holds. A Range over its text
          // returns one rect per line box, which is what reveals a wrap.
          const lines = (node: Element): number => {
            const range = document.createRange()
            range.selectNodeContents(node)
            return range.getClientRects().length
          }
          const rows = [...panel.querySelectorAll('.trevixal-menu__label, .trevixal-menu__heading')]
          const box = panel.getBoundingClientRect()
          return {
            wrapped: rows.filter((row) => lines(row) > 1).map((row) => row.textContent ?? ''),
            left: Math.round(box.left),
            right: Math.round(box.right),
            viewport: document.documentElement.clientWidth,
          }
        })

        expect(report, `no panel opened for ${label}`).not.toBeNull()
        if (!report) continue
        expect(report.wrapped, `entries wrapped in ${label}`).toEqual([])
        expect(report.left, `${label} opened past the left edge`).toBeGreaterThanOrEqual(0)
        expect(report.right, `${label} opened past the right edge`).toBeLessThanOrEqual(
          report.viewport,
        )
      }
    } finally {
      await server.close()
    }
  })
})

test.describe('downloading a document', () => {
  test('writes a real .docx the export package can read back', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const download = page.waitForEvent('download')
      await page.click('[data-trevixal-menu="file"]')
      await page.click('[data-trevixal-item="downloadDocx"]')
      const file = await download
      expect(file.suggestedFilename()).toMatch(/\.docx$/)
      const path = await file.path()
      expect(path).toBeTruthy()
      // A DOCX is a ZIP: the first two bytes are the local file header.
      const { readFile } = await import('node:fs/promises')
      const bytes = await readFile(path as string)
      expect(bytes[0]).toBe(0x50)
      expect(bytes[1]).toBe(0x4b)
      expect(bytes.length).toBeGreaterThan(2000)
    } finally {
      await server.close()
    }
  })

  test('carries the theme of the editor into the page it writes', async ({ page, browser }) => {
    const server = await serveDist(distDir)
    try {
      for (const [item, preset] of [
        ['themeNord', 'nord'],
        ['themeSepia', 'sepia'],
        ['themeMidnight', 'midnight'],
      ] as const) {
        await page.goto(server.origin)
        await page.click('[data-trevixal-menu="view"]')
        await page.click(`[data-trevixal-item="${item}"]`)
        await page.keyboard.press('Escape')
        const editor = await page.evaluate(() => ({
          ground: getComputedStyle(document.body).backgroundColor,
          ink: getComputedStyle(
            document.querySelector('#editor .trevixal-content p') as HTMLElement,
          ).color,
        }))

        const download = page.waitForEvent('download')
        await page.click('[data-trevixal-menu="file"]')
        await page.click('[data-trevixal-item="downloadHtml"]')
        const { readFile } = await import('node:fs/promises')
        const html = await readFile((await (await download).path()) as string, 'utf8')

        // Render the file on its own, the way opening it from disk would:
        // the editor's stylesheets are not there to fall back on, and no
        // preset rule is going to match a page that never said which preset
        // it came from.
        const viewer = await browser.newPage()
        await viewer.setContent(html)
        const exported = await viewer.evaluate(() => ({
          ground: getComputedStyle(document.body).backgroundColor,
          ink: getComputedStyle(document.querySelector('.trevixal-content p') as HTMLElement).color,
          preset: document.documentElement.dataset.trevixalPreset,
        }))
        await viewer.close()

        expect(exported.ground, `${preset} page`).toBe(editor.ground)
        expect(exported.ink, `${preset} text`).toBe(editor.ink)
        expect(exported.preset, `${preset} attribute`).toBe(preset)
      }
    } finally {
      await server.close()
    }
  })

  test('writes a page that still works when it is opened from disk', async ({ page, browser }) => {
    const server = await serveDist(distDir)
    const { mkdtemp, readFile, writeFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    try {
      await page.goto(server.origin)
      // What the editor itself draws, to hold the export against.
      const editorChevron = await page.evaluate(() => {
        const summary = document.querySelector('#editor .trevixal-toggle__summary')
        const before = summary && getComputedStyle(summary, '::before')
        return before ? `${before.borderWidth} / ${before.borderColor}` : ''
      })
      expect(editorChevron).not.toBe('')

      const download = page.waitForEvent('download')
      await page.click('[data-trevixal-menu="file"]')
      await page.click('[data-trevixal-item="downloadHtml"]')
      const html = await readFile((await (await download).path()) as string, 'utf8')

      // A real file with a real name: the extension is what makes a browser
      // parse it as a page rather than show it as text.
      const folder = await mkdtemp(join(tmpdir(), 'trevixal-export-'))
      const file = join(folder, 'export.html')
      await writeFile(file, html, 'utf8')

      const saved = await browser.newPage()
      await saved.goto(`file://${file}`)

      // The collected stylesheet has to be CSS a parser accepts. A shorthand
      // holding a `var()` that a longhand then overrides serializes as
      // `border-top-color: ;` and takes the whole declaration down with it,
      // which is how the toggle chevron came to be missing from every export.
      const empty = await saved.evaluate(() =>
        [...document.querySelectorAll('style')]
          .flatMap((tag) => (tag.textContent ?? '').split('\n'))
          .filter((line) => line.includes(': ;'))
          .map((line) => line.split('{')[0]?.trim() ?? ''),
      )
      expect(empty).toEqual([])

      const exportedChevron = await saved.evaluate(() => {
        const summary = document.querySelector('.trevixal-toggle__summary')
        const before = summary && getComputedStyle(summary, '::before')
        return before ? `${before.borderWidth} / ${before.borderColor}` : ''
      })
      expect(exportedChevron).toBe(editorChevron)

      // A tab strip is positioned from `data-active`, which only the editor
      // ever moved; in a saved file the titles were inert.
      const titles = saved.locator('.trevixal-tabs__title')
      expect(await titles.count()).toBeGreaterThan(1)
      const state = () =>
        saved.evaluate(() =>
          [...document.querySelectorAll('.trevixal-tabs__panel')].map((panel) =>
            panel.getAttribute('data-active'),
          ),
        )
      expect(await state()).toEqual(['true', 'false'])
      await titles.nth(1).click()
      expect(await state()).toEqual(['false', 'true'])
      // The titles claim `role="tab"`, so the arrows have to move between them.
      await saved.keyboard.press('ArrowLeft')
      expect(await state()).toEqual(['true', 'false'])

      // YouTube will not start a player for a page it cannot place, and a
      // page opened from disk has no origin to give it.
      await expect(saved.locator('.trevixal-embed--offsite')).toHaveCount(1)
      await expect(saved.locator('iframe.trevixal-embed--youtube')).toHaveCount(0)
      await saved.close()

      // Served from a real origin the player works, so it must be left alone.
      const host = await serveDist(folder)
      try {
        const online = await browser.newPage()
        await online.goto(`${host.origin}/export.html`)
        await expect(online.locator('iframe.trevixal-embed--youtube')).toHaveCount(1)
        await expect(online.locator('.trevixal-embed--offsite')).toHaveCount(0)
        await online.close()
      } finally {
        await host.close()
      }
    } finally {
      await server.close()
    }
  })

  test('carries the highlighting and the diagram the editor drew', async ({ page, browser }) => {
    const server = await serveDist(distDir)
    const { readFile } = await import('node:fs/promises')
    try {
      await page.goto(server.origin)
      // The diagram renderer is asynchronous; nothing can be captured from a
      // preview that has not been drawn yet.
      await page.waitForSelector('#editor .trevixal-diagram svg')
      const editorInk = await page.evaluate(() => {
        const span = document.querySelector('#editor .trevixal-content pre .tvx-tok-keyword')
        return span ? getComputedStyle(span).color : ''
      })
      expect(editorInk).not.toBe('')

      const download = page.waitForEvent('download')
      await page.click('[data-trevixal-menu="file"]')
      await page.click('[data-trevixal-item="downloadHtml"]')
      const html = await readFile((await (await download).path()) as string, 'utf8')

      const saved = await browser.newPage()
      await saved.setContent(html)
      const exported = await saved.evaluate(() => {
        const code = document.querySelector('pre[data-language="typescript"] code')
        const coloured = [...(code?.querySelectorAll('span') ?? [])]
        return {
          spans: coloured.length,
          firstKeyword: coloured
            .map((span) => getComputedStyle(span).color)
            .find((colour) => colour !== 'rgb(0, 0, 0)'),
          // Syntax highlighting is a decoration layer and a diagram preview is
          // an element the renderer appends: neither is in the document, so
          // neither survives being serialized from it alone.
          diagrams: document.querySelectorAll('.trevixal-diagram svg').length,
          // The drawing stands in for the source it was drawn from rather
          // than printing beside it.
          mermaidSource: document.querySelectorAll('pre[data-language="mermaid"]').length,
        }
      })
      await saved.close()
      expect(exported.spans).toBeGreaterThan(4)
      expect(exported.diagrams).toBe(1)
      expect(exported.mermaidSource).toBe(0)

      // The colours have to be the ones the editor resolved, not a second
      // guess at them: the palette belongs to the host, and it changes with
      // the theme.
      const keywordInk = await page.evaluate(() => {
        const span = document.querySelector('#editor .trevixal-content pre .tvx-tok-keyword')
        return span ? getComputedStyle(span).color : ''
      })
      const [r, g, b] = keywordInk.match(/\d+/g)?.map(Number) ?? []
      const hex = `#${[r, g, b].map((part) => (part ?? 0).toString(16).padStart(2, '0')).join('')}`
      expect(html).toContain(`color:${hex}`)
    } finally {
      await server.close()
    }
  })

  test('puts the diagram and the highlighting into a Word file too', async ({ page }) => {
    const server = await serveDist(distDir)
    const { readFile } = await import('node:fs/promises')
    try {
      await page.goto(server.origin)
      await page.waitForSelector('#editor .trevixal-diagram svg')
      const download = page.waitForEvent('download')
      await page.click('[data-trevixal-menu="file"]')
      await page.click('[data-trevixal-item="downloadDocx"]')
      const bytes = await readFile((await (await download).path()) as string)

      // The package is a ZIP; its parts are named in the central directory,
      // which is enough to see that a picture was embedded without unpacking.
      const listing = bytes.toString('latin1')
      expect(listing).toContain('word/media/')
      // A diagram has no bitmap of its own. This one was drawn from the SVG
      // the editor rendered, which is the whole point of the capture.
      expect(listing).toMatch(/word\/media\/image\d+\.png/)
    } finally {
      await server.close()
    }
  })

  test('shows the print preview in the theme it will print in', async ({ page, browser }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.click('[data-trevixal-menu="view"]')
      await page.click('[data-trevixal-item="themeMidnight"]')
      await page.keyboard.press('Escape')
      const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)

      await page.click('[data-trevixal-menu="file"]')
      await page.click('[data-trevixal-item="printPreview"]')
      const frame = page.locator('.trevixal-print-preview__frame')
      await expect(frame).toBeVisible()
      // "Export as PDF" renders this same page, so a preview that matches the
      // editor is the PDF matching it too.
      await expect(page.frameLocator('.trevixal-print-preview__frame').locator('body')).toHaveCSS(
        'background-color',
        ground,
      )
      const srcdoc = (await frame.getAttribute('srcdoc')) ?? ''
      // A browser prints no background unless the page asks for one, and the
      // "Background graphics" box is off by default.
      expect(srcdoc).toContain('print-color-adjust: exact')
      await page.keyboard.press('Escape')

      // Paper has no tabs to click, so printing the active panel alone would
      // quietly drop the rest of what the document says.
      const paper = await browser.newPage()
      await paper.setContent(srcdoc)
      await paper.emulateMedia({ media: 'print' })
      const printed = await paper.evaluate(() =>
        [...document.querySelectorAll('.trevixal-tabs__content')].map(
          (panel) => getComputedStyle(panel).display,
        ),
      )
      expect(printed.length).toBeGreaterThan(1)
      expect(printed.every((display) => display !== 'none')).toBe(true)
      await paper.close()
    } finally {
      await server.close()
    }
  })

  test('writes Markdown that carries the document', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const download = page.waitForEvent('download')
      await page.click('[data-trevixal-menu="file"]')
      await page.click('[data-trevixal-item="downloadMarkdown"]')
      const file = await download
      expect(file.suggestedFilename()).toBe('Trevixal.md')
      const { readFile } = await import('node:fs/promises')
      const text = await readFile((await file.path()) as string, 'utf8')
      expect(text).toContain('# Trevixal')
      expect(text).toContain('**bold**')
    } finally {
      await server.close()
    }
  })
})

/**
 * Put the caret in a fresh, empty paragraph. The `/` menu only opens at the
 * start of a block, and a trigger character has to open the block or follow
 * whitespace, so every suggestion test needs somewhere clean to type.
 */
async function emptyBlock(page: Page): Promise<void> {
  await page.locator('#editor .trevixal-content > p').first().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
}

/** Fill the open form dialog by field name and submit it. */
async function submitDialog(
  page: Page,
  values: Readonly<Record<string, string | boolean>>,
): Promise<void> {
  const dialog = page.locator('.trevixal-dialog')
  await expect(dialog).toBeVisible()
  for (const [name, value] of Object.entries(values)) {
    const field = dialog.locator(`[name="${name}"]`)
    if (typeof value === 'boolean') await field.setChecked(value)
    else await field.fill(value)
  }
  await dialog.locator('.trevixal-dialog__button--primary').click()
  await expect(dialog).toHaveCount(0)
}

/** The autosaved draft exactly as it sits in this browser's storage. */
function readDraft(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('trevixal:autosave:document:draft'))
}

/**
 * The suggestion popup that is currently open. The demo builds one per trigger
 * (slash and emoji) and hides the one that is not in use, so a bare
 * `.trevixal-popup` matches both elements.
 */
function openPopup(page: Page): Locator {
  return page.locator('.trevixal-popup:not([hidden])')
}

test.describe('the suggestion triggers', () => {
  test('inserts a table from the slash menu', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const surface = page.locator('#editor .trevixal-content')
      // One seeded table; the menu has to add the second.
      await expect(surface.locator('table')).toHaveCount(1)

      await emptyBlock(page)
      await page.keyboard.type('/tab')

      const popup = openPopup(page)
      await expect(popup).toBeVisible()
      await expect(popup.locator('.trevixal-popup__item').first()).toHaveText('Table')
      await page.keyboard.press('Enter')

      await expect(surface.locator('table')).toHaveCount(2)
      await expect(popup).toHaveCount(0)
      // The trigger text is consumed, not left behind as a literal "/tab".
      await expect(surface).not.toContainText('/tab')
    } finally {
      await server.close()
    }
  })

  test('inserts an emoji character from the : menu', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const surface = page.locator('#editor .trevixal-content')

      await emptyBlock(page)
      await page.keyboard.type(':smi')

      const popup = openPopup(page)
      await expect(popup).toBeVisible()
      await expect(popup.locator('.trevixal-popup__item').first()).toContainText(':smile:')
      await page.keyboard.press('Enter')

      // The character itself lands in the text; the shortcode does not.
      await expect(surface).toContainText('\u{1F604}')
      await expect(surface).not.toContainText(':smi')
      await expect(page.locator('#output')).toContainText('\u{1F604}')
    } finally {
      await server.close()
    }
  })
})

test.describe('links, security and the second surface', () => {
  test('writes a new-tab link with rel="noopener noreferrer"', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const surface = page.locator('#editor .trevixal-content')

      // Select a word to link.
      await surface.locator('> p').first().click()
      await page.keyboard.press('Home')
      for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowRight')

      await runMenuItem(page, 'insert', 'insertLink')
      await submitDialog(page, { href: 'https://example.com', newTab: true })

      // Scoped to the paragraph that was linked: the seeded link card further
      // down the document is also a new-tab anchor.
      const link = surface.locator('> p').first().locator('a[target="_blank"]')
      await expect(link).toHaveCount(1)
      // The rel is not optional: without it the opened page can retarget this
      // one through `window.opener`.
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      await expect(page.locator('#output')).toContainText(
        '<a href="https://example.com" target="_blank" rel="noopener noreferrer">',
      )
    } finally {
      await server.close()
    }
  })

  test('encrypts the autosaved draft once the document is protected', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const status = page.locator('.trevixal-autosave')

      await page.locator('#editor .trevixal-content p').first().click()
      await page.keyboard.type('Salary review notes. ')
      await expect(status).toHaveAttribute('data-status', 'saved', { timeout: 5000 })
      // Unprotected, the draft is plain JSON anybody can read out of storage.
      expect(await readDraft(page)).toContain('Salary review notes.')

      await runMenuItem(page, 'file', 'protectDocument')
      await submitDialog(page, {
        password: 'correct horse battery',
        confirm: 'correct horse battery',
      })
      await expect(page.locator('#security')).toContainText('Password-protected')

      // Protecting has to reach what is *already* saved, not only the next
      // write: a password that leaves the previous draft readable in storage
      // has not protected anything.
      const envelope = JSON.parse((await readDraft(page)) as string) as Record<string, unknown>
      expect(envelope.format).toBe('trevixal-encrypted')
      expect(envelope.cipher).toBe('AES-GCM')
      expect(envelope.kdf).toBe('PBKDF2-SHA256')
      expect(typeof envelope.data).toBe('string')
      expect(await readDraft(page)).not.toContain('Salary review notes.')

      // And the editor keeps saving through the encrypted store afterwards.
      await page.keyboard.type('Board only. ')
      await expect(status).toHaveAttribute('data-status', 'saved', { timeout: 15000 })
      const after = await readDraft(page)
      expect(after).not.toContain('Board only.')
      expect(JSON.parse(after as string).format).toBe('trevixal-encrypted')
    } finally {
      await server.close()
    }
  })

  test('blocks a copy and says so in the status line', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const security = page.locator('#security')

      await runMenuItem(page, 'file', 'documentRestrictions')
      await submitDialog(page, { copy: true })
      await expect(security).toContainText('Blocked: copy')

      // A real copy attempt, from a real selection.
      await page.locator('#editor .trevixal-content p').first().click()
      await page.keyboard.press('Home')
      for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight')
      await page.keyboard.press('Control+c')

      await expect(security).toContainText('copy is blocked for this document')
    } finally {
      await server.close()
    }
  })

  test('the sidebar disappears with the last panel and returns with the next', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const sidebar = page.locator('#sidebar')
      // The demo opens with contents and outline showing.
      await expect(sidebar).toBeVisible()

      await runMenuItem(page, 'view', 'tableOfContents')
      await expect(sidebar).toBeVisible()
      await runMenuItem(page, 'view', 'documentOutline')
      await expect(sidebar).toBeHidden()

      await runMenuItem(page, 'view', 'workspacePanel')
      await expect(sidebar).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('read-only mode locks the surface, and unlocks it again', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const surface = page.locator('#editor .trevixal-content')
      // A paragraph with no link in it: while the surface is read-only a click
      // on an anchor navigates away instead of placing a caret.
      const target = surface.locator('> p:not(:has(a))').first()
      const before = (await target.textContent()) ?? ''

      await runMenuItem(page, 'view', 'readOnly')
      await expect(surface).toHaveAttribute('contenteditable', 'false')

      // Locked means locked: typing has to leave the paragraph untouched.
      await target.click()
      await page.keyboard.press('Home')
      await page.keyboard.type('nope')
      await expect(target).toHaveText(before)

      await runMenuItem(page, 'view', 'readOnly')
      await expect(surface).toHaveAttribute('contenteditable', 'true')
      await target.click()
      await page.keyboard.press('Home')
      await page.keyboard.type('Yes. ')
      await expect(target).toHaveText(`Yes. ${before}`)
    } finally {
      await server.close()
    }
  })

  test('opens a second editing surface with the split editor', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const surfaces = page.locator('.trevixal-content')
      await expect(surfaces).toHaveCount(1)

      await runMenuItem(page, 'view', 'splitEditor')
      await expect(surfaces).toHaveCount(2)
      const mirror = page.locator('#mirror .trevixal-split__mirror .trevixal-content')
      await expect(mirror).toHaveCount(1)

      // Two live surfaces on one document, not a rendered copy.
      await page.locator('#editor .trevixal-content p').first().click()
      await page.keyboard.press('Home')
      await page.keyboard.type('Mirrored. ')
      await expect(mirror).toContainText('Mirrored.')
    } finally {
      await server.close()
    }
  })

  test('cleans up a paste out of Word instead of importing its wreckage', async ({
    page,
    browserName,
  }) => {
    // A synthesised paste is the only way to hand the editor a specific
    // payload, and Firefox drops `clipboardData` from a constructed
    // `ClipboardEvent`: the listener sees an event carrying no types at all.
    // The cleaning itself is covered by the fixture corpus in core's tests.
    test.skip(browserName === 'firefox', 'Firefox ignores constructed clipboardData')
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.locator('#editor .trevixal-content p').first().click()
      await page.keyboard.press('Control+a')

      // A real Word payload, abridged: namespaced tags, a conditional comment,
      // its own stylesheet, unquoted Mso class names, and a bullet glyph Word
      // had already drawn inside a span it marks as "ignore".
      await page.evaluate(() => {
        const html = [
          '<html xmlns:o="urn:schemas-microsoft-com:office:office"',
          ' xmlns:w="urn:schemas-microsoft-com:office:word">',
          '<head><meta name=Generator content="Microsoft Word 15">',
          '<!--[if gte mso 9]><xml><o:OfficeDocumentSettings/></xml><![endif]-->',
          '<style><!-- p.MsoNormal {mso-style-parent:""; font-size:11.0pt;} --></style>',
          '</head><body>',
          "<p class=MsoNormal><span style='mso-fareast-font-family:Times;color:#1F497D'>",
          'Pasted from Word<o:p></o:p></span></p>',
          "<p class=MsoListParagraphCxSpFirst style='mso-list:l0 level1 lfo1'>",
          "<span style='mso-list:Ignore'>&middot;<span style='font:7.0pt Times'>&nbsp; </span></span>",
          'A bulleted line<o:p></o:p></p>',
          '</body></html>',
        ].join('')
        const data = new DataTransfer()
        data.setData('text/html', html)
        data.setData('text/plain', 'Pasted from Word\nA bulleted line')
        const surface = document.querySelector('#editor .trevixal-content') as HTMLElement
        surface.focus()
        surface.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
        )
      })

      const surface = page.locator('#editor .trevixal-content')
      await expect(surface).toContainText('Pasted from Word')
      await expect(surface).toContainText('A bulleted line')

      // The words arrived; none of Word's scaffolding did.
      const output = page.locator('#output')
      await expect(output).not.toContainText('mso-')
      await expect(output).not.toContainText('MsoNormal')
      await expect(output).not.toContainText('OfficeDocumentSettings')
      // The bullet Word drew for itself must not become a character in the text.
      await expect(surface).not.toContainText('\u00b7')
    } finally {
      await server.close()
    }
  })

  test('a paste out of Google Docs does not come in bold', async ({ page, browserName }) => {
    // A synthesised paste is the only way to hand the editor a specific
    // payload, and Firefox drops `clipboardData` from a constructed
    // `ClipboardEvent`: the listener sees an event carrying no types at all.
    // The cleaning itself is covered by the fixture corpus in core's tests.
    test.skip(browserName === 'firefox', 'Firefox ignores constructed clipboardData')
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.locator('#editor .trevixal-content p').first().click()
      await page.keyboard.press('Control+a')

      await page.evaluate(() => {
        // Google wraps the selection in a <b> that declares itself not bold.
        const html =
          '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b">' +
          '<p dir="ltr"><span style="font-family:Arial;font-weight:400;">Plain from Docs</span>' +
          '</p></b>'
        const data = new DataTransfer()
        data.setData('text/html', html)
        data.setData('text/plain', 'Plain from Docs')
        const surface = document.querySelector('#editor .trevixal-content') as HTMLElement
        surface.focus()
        surface.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
        )
      })

      await expect(page.locator('#editor .trevixal-content')).toContainText('Plain from Docs')
      // Believing the tag is what turns every Google Docs paste bold.
      await expect(page.locator('#editor .trevixal-content strong')).toHaveCount(0)
      await expect(page.locator('#editor .trevixal-content b')).toHaveCount(0)
    } finally {
      await server.close()
    }
  })

  test('a bubble appears over selected text and formats it', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const bubble = page.locator('.trevixal-bubble')
      await expect(bubble).toBeHidden()

      // Select a whole paragraph the way a reader would, by dragging across it.
      const paragraph = page.locator('#editor .trevixal-content > p').first()
      await paragraph.click()
      await page.keyboard.press('Home')
      await page.keyboard.down('Shift')
      await page.keyboard.press('End')
      await page.keyboard.up('Shift')

      await expect(bubble).toBeVisible()
      await bubble.locator('[data-trevixal-item="bold"]').click()
      await expect(page.locator('#output')).toContainText('<strong>')

      // And gets out of the way once there is nothing selected.
      await page.keyboard.press('ArrowRight')
      await expect(bubble).toBeHidden()
    } finally {
      await server.close()
    }
  })

  test('a link is edited where it sits, not in a dialog over it', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const popover = page.locator('.trevixal-linkpopover')
      await expect(popover).toBeHidden()

      // The seeded document also carries a link card and citations, each of
      // which renders an anchor of its own, so this names the one it means.
      const href = 'https://example.com'
      const link = page.locator(`#editor .trevixal-content a[href="${href}"]`)
      await expect(link).toHaveCount(1)
      const anchorsBefore = await page.locator('#editor .trevixal-content a').count()

      // Read-only would follow the link instead of placing a caret; the demo
      // is editable, so a click lands the caret inside the mark.
      await link.click()
      await expect(popover).toBeVisible()
      await expect(popover.locator('.trevixal-linkpopover__href')).toHaveAttribute('href', href)

      await popover.locator('[data-trevixal-item="unlink"]').click()
      await expect(popover).toBeHidden()
      // That link is gone; the ones it was not pointing at are untouched.
      await expect(link).toHaveCount(0)
      await expect(page.locator('#editor .trevixal-content a')).toHaveCount(anchorsBefore - 1)
    } finally {
      await server.close()
    }
  })

  test('a block is moved from the keyboard, through its grip', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      const grip = page.locator('.trevixal-blockgrip')
      const blocks = page.locator('#editor .trevixal-content > *')

      const first = await blocks.nth(0).textContent()
      const second = await blocks.nth(1).textContent()

      // Hovering a block is what puts the grip beside it.
      await blocks.nth(0).hover()
      await expect(grip).toBeVisible()

      await grip.focus()
      await page.keyboard.press(' ')
      await expect(grip).toHaveAttribute('aria-pressed', 'true')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')

      // The two blocks have swapped, and the grip is no longer carrying one.
      await expect(blocks.nth(0)).toHaveText(second ?? '')
      await expect(blocks.nth(1)).toHaveText(first ?? '')
      await expect(grip).not.toHaveAttribute('aria-pressed', 'true')
    } finally {
      await server.close()
    }
  })
})
