import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const site = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/.vitepress/dist')

/**
 * The documentation site, actually served.
 *
 * The playground claims to run the real editor from the real CDN bundle; this
 * is the check. A docs page that describes a working editor while shipping a
 * broken one is worse than no page.
 *
 * The site is not part of `pnpm build`, it has its own command, because it
 * also runs typedoc over every package, so these skip when it has not been
 * built rather than failing on a clean checkout.
 */
test.describe('documentation site', () => {
  test.skip(!existsSync(site), 'run `pnpm docs:build` first')

  test('the playground runs the real editor', async ({ page }) => {
    const server = await serveDist(site)
    try {
      await page.goto(`${server.origin}/playground.html`)

      // Loaded from `public/trevixal`, the same bundle a script tag would get.
      const editor = page.locator('trevixal-editor')
      await expect(editor).toHaveCount(1)
      await expect(editor.locator('.trevixal-content h2')).toHaveText('Hello')
      await expect(editor.locator('.trevixal-content em')).toHaveText('and sanitized')

      await page.locator('.trevixal-content p').first().click()
      await page.keyboard.press('Home')
      await page.keyboard.type('typed ')
      await expect(page.locator('.trevixal-content p').first()).toContainText('typed ')

      // And the document panel follows, which is the thing the page is about.
      await expect(page.locator('.playground__json pre')).toContainText('typed ')
    } finally {
      await server.close()
    }
  })

  test('the full-editor page mounts the assembled kit', async ({ page }) => {
    const server = await serveDist(site)
    try {
      await page.goto(`${server.origin}/full-editor.html`)

      // Loaded from `public/trevixal`, the kit's own one-file build.
      const editor = page.locator('.trevixal-full-editor')
      await expect(editor).toHaveCount(1)
      await expect(editor.locator('.trevixal-menubar')).toBeVisible()

      // The start of the paragraph, not its centre: a word the writing
      // assistant has underlined opens a fix menu instead of placing a caret.
      const paragraph = editor.locator('.trevixal-content p').first()
      await paragraph.click({ position: { x: 4, y: 6 } })
      await page.keyboard.press('Home')
      await page.keyboard.type('typed ')
      await expect(paragraph).toContainText('typed ')

      // The site's markdown styles must not reach the document: VitePress
      // lays tables out as blocks, which takes column resizing with it.
      await expect(editor.locator('.trevixal-content table').first()).toHaveCSS('display', 'table')

      // The site's theme switch and the editor's theme are one setting.
      // The desktop one; the collapsed mobile menu carries a second copy.
      await page.locator('.VPNavBarAppearance .VPSwitchAppearance').click()
      await expect(page.locator('html')).toHaveClass(/dark/)
      await expect(page.locator('html')).toHaveAttribute('data-trevixal-theme', 'dark')

      // And the other way round, from the editor's own View menu.
      await page.locator('.trevixal-menubar__trigger[data-trevixal-menu="view"]').click()
      await page.locator('[data-trevixal-item="themeLight"]').click()
      await expect(page.locator('html')).not.toHaveClass(/dark/)
      await expect(page.locator('html')).toHaveAttribute('data-trevixal-theme', 'light')

      // Ctrl+K belongs to the editor's command palette on this page, not to the
      // site's search, and the palette is styled: it mounts on <body>, where
      // the kit's tokens only reach if the page puts them there.
      await paragraph.click({ position: { x: 4, y: 6 } })
      await page.keyboard.press('Control+k')
      const palette = page.locator('.trevixal-palette')
      await expect(palette).toBeVisible()
      await expect(page.locator('.VPLocalSearchBox')).toHaveCount(0)
      await expect(palette).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await page.keyboard.press('Escape')
      await expect(palette).toBeHidden()

      // A dark preset darkens the site too, and keeps its palette: the sync
      // must not answer it by choosing plain Dark, which would drop it.
      await page.locator('.trevixal-menubar__trigger[data-trevixal-menu="view"]').click()
      await page.locator('[data-trevixal-item="themeNord"]').click()
      await expect(page.locator('html')).toHaveClass(/dark/)
      await expect(page.locator('html')).toHaveAttribute('data-trevixal-preset', 'nord')
    } finally {
      await server.close()
    }
  })

  test('every guide and concept page renders', async ({ page }) => {
    const server = await serveDist(site)
    try {
      const pages = [
        ['/', 'A rich-text editor engine'],
        ['/guide/getting-started.html', 'Getting started'],
        ['/guide/full-editor.html', 'The whole editor'],
        ['/full-editor.html', 'The full editor, live'],
        ['/guide/react.html', 'React'],
        ['/guide/vue.html', 'Vue'],
        ['/guide/svelte.html', 'Svelte'],
        ['/guide/angular.html', 'Angular'],
        ['/guide/vanilla.html', 'No build step'],
        ['/guide/ssr.html', 'Server rendering'],
        ['/concepts/state.html', 'State and the document'],
        ['/concepts/schema.html', 'Schema'],
        ['/concepts/transactions.html', 'Transactions and steps'],
        ['/concepts/decorations.html', 'Decorations'],
        ['/concepts/extension-points.html', 'Extension points'],
        ['/extending/callout.html', 'Write a callout extension'],
        ['/adr/index.html', 'Architecture decision records'],
      ]
      for (const [path, heading] of pages) {
        const response = await page.goto(`${server.origin}${path}`)
        expect(response?.status(), path).toBe(200)
        await expect(page.locator('h1').first(), path).toContainText(heading)
      }
    } finally {
      await server.close()
    }
  })

  test('the API reference is generated and reachable', async ({ page }) => {
    const server = await serveDist(site)
    try {
      const response = await page.goto(`${server.origin}/api/index.html`)
      expect(response?.status()).toBe(200)
      // Generated by typedoc from every published package's own source.
      await expect(page.locator('body')).toContainText('@trevixal/core')
      await expect(page.locator('body')).toContainText('@trevixal/angular')
    } finally {
      await server.close()
    }
  })
})
