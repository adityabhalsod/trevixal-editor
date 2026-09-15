import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { serveApp } from './serve-app'
import { serveDist } from './serve-dist'

const examples = join(dirname(fileURLToPath(import.meta.url)), '../../../examples')

/**
 * Every example app, actually run.
 *
 * A README that says an example works is a claim; this is the check. Each one
 * is served from its build output and driven the way a reader would drive it:
 * mount, type, see it in the document, because an example that looks right
 * and does nothing is worse than no example.
 */

/**
 * Each framework example now shows the same page twice over: the whole editor,
 * mounted from that framework's lifecycle, and underneath it the adapter on
 * its own. So every locator here says which of the two it means. An
 * unscoped `.trevixal-content` matches the assembled editor, the panel below
 * it, and both panes the assembled editor can open beside itself.
 */
const surface = '.panel .trevixal-content'

/**
 * The assembled editor's own surface.
 *
 * `#editor` is the kit's, wherever it was mounted, a framework's host
 * element, or a bare `<div id="app">` in the two pages that have no framework
 * at all, so this one selector finds it on every example.
 */
const fullSurface = '#editor .trevixal-content'

/**
 * Type at the start of the first paragraph of `within`.
 *
 * Clicking the surface itself lands the caret wherever the click fell, which
 * in a seeded document is rarely the block the test means.
 *
 * The focus check is not ceremony. A click resolves before the browser has
 * finished handing focus to the surface, and the keystrokes that follow then
 * go to the page instead, which reads, much later, as the editor having
 * ignored them. WebKit on a loaded machine loses that race often enough to
 * see.
 */
async function types(page: Page, text: string, within = surface): Promise<void> {
  // The top-left corner, not the middle. Playwright clicks an element's centre
  // by default, which lands somewhere inside the sentence, and a click on a
  // word the writing assistant has underlined opens that word's fix menu
  // instead of placing a caret, which is why the middle of a seeded paragraph
  // is never a safe place to click.
  await page
    .locator(`${within} p`)
    .first()
    .click({ position: { x: 4, y: 6 } })
  // Asked of `document.activeElement` rather than through `toBeFocused`.
  // That matcher resolves `:focus`, which WebKit matches only while the window
  // itself is active, and a parallel run leaves most of its windows inactive,
  // so the check failed on a surface that genuinely had the caret. Where the
  // caret actually is does not depend on which window the operating system
  // considers frontmost.
  await expect
    .poll(() => page.evaluate((sel) => !!document.activeElement?.closest(sel), within))
    .toBe(true)
  await page.keyboard.press('Home')
  await page.keyboard.type(text)
}

/**
 * The assembled editor came up, once, with its chrome, and takes typing.
 *
 * Run for every framework, because the interesting part is not that
 * `mountFullEditor` works, the full-editor suite covers that, but that each
 * framework's lifecycle hook calls it at a moment where it can. A hook that
 * fires too early leaves an empty box; a teardown that misses something
 * leaves two editors, which is what the count is for.
 */
async function mountsTheWholeEditor(page: Page): Promise<void> {
  await expect(page.locator(fullSurface)).toHaveCount(1)
  await expect(page.locator('.trevixal-menubar, [role="menubar"]').first()).toBeVisible()
  // The kit writes its own heading above the chrome. `.first()`, because the
  // seeded document has a heading of its own further down the page.
  await expect(page.getByRole('heading', { level: 1 }).first()).toContainText('Trevixal')
  await stylesArrived(page)
  await types(page, 'assembled: ', fullSurface)
  await expect(page.locator(`${fullSurface} p`).first()).toContainText('assembled: ')
}

/**
 * The kit's base tokens resolve on the mounted editor.
 *
 * Every spacing, radius and font value in `@trevixal/ui` is a custom property
 * defined by a single rule, so an example that mounts the editor without
 * getting that stylesheet renders the whole chrome with its gaps and its
 * corners at zero, a broken page that every assertion about elements being
 * present still passes. This is what notices.
 *
 * It does not stand in for `packages/ui/test/styles-dist.test.ts`: the way
 * that rule was actually lost, a byte-order mark glued to its selector by a
 * bundler, only reached the page through `next dev`, which no suite runs.
 * The artefact check is what catches that; this catches an example that never
 * loaded the stylesheet at all.
 */
async function stylesArrived(page: Page): Promise<void> {
  const token = await page.evaluate(() => {
    const root = document.querySelector('.trevixal-full-editor')
    return root ? getComputedStyle(root).getPropertyValue('--tvx-space-1').trim() : ''
  })
  expect(token, '--tvx-space-1 on the editor root').not.toBe('')
}

test.describe('example apps', () => {
  test('the Angular example mounts the whole editor after render', async ({ page }) => {
    const server = await serveDist(join(examples, 'angular/dist'))
    try {
      await page.goto(server.origin)
      await mountsTheWholeEditor(page)

      // The page is the editor and nothing else, no adapter panel under it,
      // so a second editing surface here would mean the mount ran twice.
      // `mountsTheWholeEditor` has already typed into the one that is there,
      // which is everything a host has to check: the rest of what this editor
      // does belongs to the kit's own suite, not to nine copies of it.
      await expect(page.locator('.trevixal-content')).toHaveCount(1)
    } finally {
      await server.close()
    }
  })

  test('the React example mounts, types, and does not re-render the tree', async ({ page }) => {
    const server = await serveDist(join(examples, 'react/dist'))
    try {
      await page.goto(server.origin)
      await mountsTheWholeEditor(page)
      await expect(page.locator(surface)).toHaveCount(1)
      await types(page, 'hello from react')
      await expect(page.locator(`${surface} p`).first()).toHaveText('hello from react')

      // The point of the example: typing is not a React render.
      const bystander = page.locator('.count', { hasText: 'bystander renders' })
      await expect(bystander).toHaveText(/bystander renders: 1$/)

      // Nor is it a toolbar render, once the snapshot has settled. The very
      // first keystroke flips `canUndo`, which the toolbar does draw; the
      // rest change nothing it shows. Measured at eleven renders for ten
      // characters before the snapshot was made stable by content.
      const toolbar = page.locator('.count', { hasText: 'toolbar renders' })
      const before = Number(/(\d+)$/.exec((await toolbar.textContent()) ?? '')?.[1] ?? '0')
      await page.keyboard.type('0123456789')
      const after = Number(/(\d+)$/.exec((await toolbar.textContent()) ?? '')?.[1] ?? '0')
      expect(after - before, 'toolbar renders for ten keystrokes').toBeLessThanOrEqual(2)

      // The toolbar is bound to the snapshot, so it reflects the document.
      await page.keyboard.press('Control+a')
      await page.locator('.panel button[aria-pressed]').first().click()
      await expect(page.locator('.panel button[aria-pressed="true"]').first()).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('the Vue example renders a Vue component inside the document', async ({ page }) => {
    const server = await serveDist(join(examples, 'vue/dist'))
    try {
      await page.goto(server.origin)
      await mountsTheWholeEditor(page)
      await types(page, 'hello from vue')
      await expect(page.locator(`${surface} p`).first()).toContainText('hello from vue')

      const counter = page.locator('.counter')
      await expect(counter).toHaveText(/counted 0 times/)
      await counter.click()
      await expect(counter).toHaveText(/counted 1 times/)

      // The component holds no state: undo rewinds the document, and the
      // component follows it.
      await page.locator('.panel button', { hasText: 'Undo' }).click()
      await expect(counter).toHaveText(/counted 0 times/)
    } finally {
      await server.close()
    }
  })

  test('the Svelte example renders a Svelte component inside the document', async ({ page }) => {
    const server = await serveDist(join(examples, 'svelte/dist'))
    try {
      await page.goto(server.origin)
      await mountsTheWholeEditor(page)
      await types(page, 'hello from svelte')
      await expect(page.locator(`${surface} p`).first()).toContainText('hello from svelte')

      const counter = page.locator('.counter')
      await expect(counter).toHaveText(/counted 0 times/)
      await counter.click()
      await expect(counter).toHaveText(/counted 1 times/)
      await page.locator('.panel button', { hasText: 'Undo' }).click()
      await expect(counter).toHaveText(/counted 0 times/)
    } finally {
      await server.close()
    }
  })

  test('the server-rendered example ships the words, then builds the editor over them', async ({
    page,
  }) => {
    const server = await serveDist(join(examples, 'ssr/dist'))
    try {
      // Fetched as text, before any script has run: this is what a crawler,
      // a reader and a browser with JavaScript off would all receive. The
      // words are in the markup and the chrome is not, which is the whole
      // shape of a page rendered by Node and mounted in the browser.
      const response = await page.request.get(server.origin)
      const source = await response.text()
      expect(source).toContain('<h1>Trevixal</h1>')
      expect(source).toContain('<strong>bold</strong>')
      expect(source).toContain('<ul>')
      // A table is not in `defaultNodes()`. Its presence in the server's HTML
      // is the check that Node rendered this with the kit's own schema, which
      // is the only schema that can read a document the kit produced.
      expect(source).toContain('<table>')
      expect(source).not.toContain('trevixal-menubar')

      // And then the editor is built over exactly those words, from the JSON
      // beside them, not by re-parsing the HTML.
      await page.goto(server.origin)
      await mountsTheWholeEditor(page)
      await expect(page.locator(`${fullSurface} h2`).first()).toHaveText('Tasks')
    } finally {
      await server.close()
    }
  })

  test('the Solid example mounts the whole editor with no adapter at all', async ({ page }) => {
    const server = await serveDist(join(examples, 'solid/dist'))
    try {
      await page.goto(server.origin)
      await mountsTheWholeEditor(page)
      // No `@trevixal/solid` exists, and none is needed: this page is the
      // claim that a ref and two lifecycle calls are the whole integration.
      await expect(page.getByRole('heading', { name: 'No adapter, no bindings' })).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('the Nuxt example prerenders the page and mounts the editor in the browser', async ({
    page,
  }) => {
    const server = await serveDist(join(examples, 'nuxt/.output/public'))
    try {
      // The generated HTML, before any script has run. The prose is in it and
      // the editor is not, which is the whole shape of a `<ClientOnly>` page.
      const source = await (await page.request.get(server.origin)).text()
      expect(source).toContain('Prerendered, client-mounted')
      expect(source).not.toContain('trevixal-menubar')

      await page.goto(server.origin)
      await mountsTheWholeEditor(page)
    } finally {
      await server.close()
    }
  })

  test('the SvelteKit example prerenders the page and mounts the editor in the browser', async ({
    page,
  }) => {
    const server = await serveDist(join(examples, 'sveltekit/build'))
    try {
      const source = await (await page.request.get(server.origin)).text()
      expect(source).toContain('Prerendered, client-mounted')
      expect(source).not.toContain('trevixal-menubar')

      await page.goto(server.origin)
      await mountsTheWholeEditor(page)
    } finally {
      await server.close()
    }
  })

  test('the Next.js example server-renders the page and mounts the editor in the browser', async ({
    page,
  }) => {
    // Run by its own server, not served as files: that runtime is what a
    // Vercel deployment runs, so a folder of assets would be testing
    // something the reader never gets. See `serve-app.ts`.
    const cwd = join(examples, 'next')
    const server = await serveApp({
      cwd,
      command: join(cwd, 'node_modules/.bin/next'),
      args: ['start'],
    })
    try {
      const source = await (await page.request.get(server.origin)).text()
      expect(source).toContain('Server-rendered, client-mounted')
      // The island is a `ssr: false` import, so its markup cannot be here.
      expect(source).not.toContain('trevixal-menubar')

      await page.goto(server.origin)
      await mountsTheWholeEditor(page)
    } finally {
      await server.close()
    }
  })

  test('the vanilla example runs the kit from a script tag, with no bundler', async ({ page }) => {
    const server = await serveDist(join(examples, 'vanilla-cdn'))
    try {
      await page.goto(server.origin)

      // The kit, from one <script> and a global, no import, no bundler.
      await mountsTheWholeEditor(page)

      // The page is the editor and nothing else, so a second surface here
      // would mean the global was mounted twice.
      await expect(page.locator('#editor .trevixal-content')).toHaveCount(1)
    } finally {
      await server.close()
    }
  })
})
