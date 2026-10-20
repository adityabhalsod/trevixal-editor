import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '../../../examples/full-editor/dist')
const surface = '#editor .trevixal-content'

// This spec is the one place the example's service worker may run.
test.use({ serviceWorkers: 'allow' })

test('installs, and opens and works again with no network at all', async ({
  page,
  context,
  browserName,
}) => {
  // Playwright's WebKit reports an internal error reloading a page its
  // service worker serves offline; Safari itself serves it.
  test.skip(browserName === 'webkit', 'WebKit under Playwright cannot reload offline')
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await page.waitForSelector(surface)
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      './manifest.webmanifest',
    )
    // The worker has cached the app shell once it controls the page.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
        )
      }
    })
    const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json())
    expect(manifest).toMatchObject({ display: 'standalone', start_url: './' })

    await context.setOffline(true)
    await page.reload()
    await page.waitForSelector(surface)
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    // A file the page loads only when asked for comes from the cache too.
    await page.click('[data-trevixal-menu="view"]')
    await page.click('[data-trevixal-menu="view"] ~ * [data-trevixal-item="language-de"]')
    await expect(page.locator('[data-trevixal-menu="file"]')).toHaveText('Datei')
    await page.locator(`${surface} p`).first().click()
    await page.keyboard.type('Written offline. ')
    await expect(page.locator(surface)).toContainText('Written offline.')
  } finally {
    await context.setOffline(false)
    await server.close()
  }
})
