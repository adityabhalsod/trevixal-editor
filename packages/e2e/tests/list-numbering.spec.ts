import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { LIST_NUMBERING_SCHEMES, type ListNumberingScheme, levelMarker } from '@trevixal/core'

const pageUrl = `file://${join(dirname(fileURLToPath(import.meta.url)), '../page/ui.html')}`

/** Levels checked per scheme: past every cycle's first repeat. */
const DEPTH = 6

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl)
})

/** A document of one list nested `DEPTH` deep, the scheme stored on the outermost. */
function nestedList(scheme: ListNumberingScheme): unknown {
  const type = scheme.listType
  let list: Record<string, unknown> | null = null
  for (let level = DEPTH - 1; level >= 0; level--) {
    const paragraph = { type: 'paragraph', content: [{ type: 'text', text: `level ${level + 1}` }] }
    list = {
      type,
      ...(level === 0 && scheme.id !== 'default' ? { attrs: { numbering: scheme.id } } : {}),
      content: [{ type: 'listItem', content: list ? [paragraph, list] : [paragraph] }],
    }
  }
  return { type: 'doc', content: [list] }
}

/** How each level of the surface's list draws its marker, outermost first. */
async function drawnMarkers(page: Page): Promise<{ type: string; before: string }[]> {
  return page.evaluate(() => {
    const surface = document.querySelector('.trevixal-content')
    const lists = [...(surface?.querySelectorAll<HTMLElement>('ol, ul') ?? [])]
    return lists.map((list) => {
      const item = list.querySelector(':scope > li')
      return {
        type: getComputedStyle(list).listStyleType,
        // Engines differ in spacing and quoting here, and in whether they
        // spell out a default `decimal`; strip it all to compare the rule.
        before: (item ? getComputedStyle(item, '::before').content : '')
          .replace(/[\s"']/g, '')
          .replace('counter(list-item)', 'counter(list-item,decimal)'),
      }
    })
  })
}

/** What the stylesheet should draw at `level`, from the same table the exports read. */
function expected(scheme: ListNumberingScheme, level: number): { type: string; before: string } {
  const marker = levelMarker(scheme, level)
  if (scheme.outline) return { type: 'none', before: 'counters(list-item,.).' }
  if (scheme.suffix === ')') return { type: 'none', before: `counter(list-item,${marker}))` }
  // A glyph is a string marker, which computes as the quoted glyph and its gap.
  const type = scheme.listType === 'bulletList' ? `"${marker} "` : marker
  return { type, before: 'none' }
}

for (const scheme of LIST_NUMBERING_SCHEMES) {
  test(`the stylesheet numbers every level as ${scheme.id} says`, async ({ page }) => {
    await page.evaluate((doc) => window.uiPage.editor.setContent(doc as never), nestedList(scheme))
    const drawn = await drawnMarkers(page)
    expect(drawn).toHaveLength(DEPTH)
    expect(drawn).toEqual(Array.from({ length: DEPTH }, (_, level) => expected(scheme, level)))
  })
}

test('the gallery numbers the list at the caret, and marks it as current', async ({ page }) => {
  const surface = page.locator('.trevixal-content')
  await surface.click()
  await page.keyboard.type('- first')
  const gallery = page.getByRole('button', { name: 'Multilevel list' })
  await gallery.click()
  await page.getByRole('button', { name: 'Outline numbers: 1. 1.1. 1.1.1.' }).click()

  // A bullet list became a numbered one, the scheme stored on it.
  await expect(surface.locator('ol[data-numbering="outline"]')).toHaveCount(1)
  await expect(surface.locator('ul')).toHaveCount(0)

  await gallery.click()
  await expect(
    page.getByRole('button', { name: 'Outline numbers: 1. 1.1. 1.1.1.' }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('an item indented later takes the scheme’s next level', async ({ page }) => {
  const surface = page.locator('.trevixal-content')
  await surface.click()
  await page.keyboard.type('- first')
  await page.getByRole('button', { name: 'Multilevel list' }).click()
  await page.getByRole('button', { name: 'Numbers with parentheses: 1) a) i)' }).click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('second')
  await page.keyboard.press('Tab')

  // The new list carries nothing of its own; the scheme above it numbers it.
  const inner = surface.locator('ol[data-numbering="parenthesis"] ol')
  await expect(inner).toHaveCount(1)
  expect(await inner.getAttribute('data-numbering')).toBeNull()
  expect((await drawnMarkers(page))[1]?.before).toBe('counter(list-item,lower-alpha))')
})

test('a list’s own marker style still wins inside a scheme', async ({ page }) => {
  await page.evaluate(
    (doc) => window.uiPage.editor.setContent(doc as never),
    nestedList(
      LIST_NUMBERING_SCHEMES.find((scheme) => scheme.id === 'parenthesis') as ListNumberingScheme,
    ),
  )
  // Put the caret in level 2, then give that one list roman numerals.
  await page.locator('.trevixal-content ol ol > li > p').first().click()
  await page.evaluate(() => window.uiPage.editor.commands.setListStyle('lower-roman'))

  const drawn = await drawnMarkers(page)
  // Its native marker, and no drawn one on top of it.
  expect(drawn[1]).toEqual({ type: 'lower-roman', before: 'none' })
  // The levels either side keep the scheme's.
  expect(drawn[0]?.before).toBe('counter(list-item,decimal))')
  expect(drawn[2]?.before).toBe('counter(list-item,lower-roman))')
})
