import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/full-editor/dist')

/**
 * Automated accessibility audits over the built demo.
 *
 * An audit is a floor, not a ceiling: axe finds the violations a machine can
 * see (contrast, names, roles, relationships) and says nothing about
 * whether the editor is usable with a screen reader, which the ARIA pattern
 * tests elsewhere in this suite cover by driving the keyboard.
 *
 * Scoped to the editor and its chrome. The page around them belongs to the
 * example, and failing this suite over the demo's own prose would teach
 * everyone to ignore it.
 */

const SCOPE = '#chrome, #editor'

/** WCAG 2.1 A and AA, which is the level the kit claims. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function audit(page: Page, include: string = SCOPE) {
  const results = await new AxeBuilder({ page })
    .include(include)
    // A cross-origin embed is somebody else's markup. YouTube's player has
    // violations of its own, and failing this suite over them would teach
    // everyone to ignore it.
    .exclude('iframe')
    // Every colour in the kit comes from a token a host may override, so the
    // contrast of *their* palette is theirs to check; the contrast of the
    // shipped palettes is covered by the theme tests, which measure the
    // rendered pixels rather than reading the CSS.
    .withTags(TAGS)
    .analyze()
  return results.violations
}

/**
 * Wait until the palette has finished moving.
 *
 * The theme attribute flips in one go; the pixels do not. Several surfaces
 * transition `background-color` over 0.12s while their `color` changes at
 * once, so for about a tenth of a second the page really does hold pale text
 * on a pale ground, measured on `.trevixal-toggle__summary` at
 * `rgb(236,236,244)` on `rgb(247,247,248)`. An audit that runs inside that
 * window reports a contrast violation for a state no reader ever sits in.
 * Auditing a theme means auditing where it lands.
 *
 * Transitions only, picked out by a property none of the other animation
 * kinds carry: a page is free to run an animation that never finishes, and
 * waiting on `every` animation would hang on it.
 */
async function paletteSettled(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) => !('transitionProperty' in animation) || animation.playState === 'finished',
      ),
  )
}

/** A readable failure: the rule, its impact, and what it landed on. */
const describe_ = (violations: Awaited<ReturnType<typeof audit>>) =>
  violations
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
    .join('\n')

test.describe('accessibility', () => {
  test('the editor and its chrome pass an axe audit on load', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.waitForSelector('#editor .trevixal-content')
      // The seeded document holds a diagram, which is drawn asynchronously.
      // Auditing before it lands measures the placeholder instead, and the
      // suite would pass or fail on how fast the machine is.
      await page.waitForSelector('.trevixal-diagram svg')
      const violations = await audit(page)
      expect(describe_(violations), 'axe violations').toBe('')
    } finally {
      await server.close()
    }
  })

  test('an open menu passes an axe audit', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      // A dropdown is where the ARIA gets interesting: roles, expanded state
      // and the relationship between a trigger and the panel it owns.
      await page.click('[data-trevixal-menu="format"]')
      await page.waitForSelector('.trevixal-dropdown--open .trevixal-dropdown__panel')
      const violations = await audit(page)
      expect(describe_(violations), 'axe violations').toBe('')
    } finally {
      await server.close()
    }
  })

  test('a dialog passes an axe audit', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.click('[data-trevixal-menu="insert"]')
      await page.click('.trevixal-menu__item[data-trevixal-item="insertLink"]')
      await page.waitForSelector('.trevixal-dialog')
      const violations = await audit(page, '.trevixal-dialog')
      expect(describe_(violations), 'axe violations').toBe('')
    } finally {
      await server.close()
    }
  })

  test('the dark theme passes an axe audit, contrast included', async ({ page }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await page.click('[data-trevixal-menu="view"]')
      await page.click('.trevixal-menu__item[data-trevixal-item="themeDark"]')
      await page.waitForFunction(() => document.documentElement.dataset.trevixalTheme === 'dark')
      await paletteSettled(page)
      const violations = await audit(page)
      expect(describe_(violations), 'axe violations').toBe('')
    } finally {
      await server.close()
    }
  })
})
