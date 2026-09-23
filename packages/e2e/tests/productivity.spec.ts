import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

/**
 * The keyboard and productivity features of the built demo, each driven
 * through the chrome a user has: the palette, the slash menu, quick insert and
 * the tools tray, the shortcut manager, Customize toolbar and fullscreen.
 */
const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/full-editor/dist')

async function runMenuItem(page: Page, menu: string, item: string): Promise<void> {
  await page.click(`[data-trevixal-menu="${menu}"]`)
  await page.click(`[data-trevixal-menu="${menu}"] ~ * [data-trevixal-item="${item}"]`)
}

/** Put the caret at the end of the document's first paragraph. */
async function caretInFirstParagraph(page: Page): Promise<void> {
  await page.locator('#editor .trevixal-content p').first().click()
  await page.keyboard.press('End')
}

test.describe('keyboard and productivity', () => {
  test('the palette prints the keys that really fire, and opens on what ran last', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await caretInFirstParagraph(page)
      await page.keyboard.press('Control+k')
      await page.keyboard.type('link')
      // Ctrl+K opens the palette here, so Link is on Ctrl+Shift+K, and says so.
      const link = page.locator('.trevixal-palette__item', { hasText: 'Link…' }).first()
      await expect(link.locator('.trevixal-palette__shortcut')).toHaveText('Ctrl+Shift+K')

      await page.fill('.trevixal-palette__input', 'word count')
      await page.keyboard.press('Enter')
      await page.keyboard.press('Escape')
      await page.keyboard.press('Control+k')
      await expect(page.locator('.trevixal-palette__group').first()).toHaveText('Recently used')
      await expect(page.locator('.trevixal-palette__label').first()).toHaveText('Word count')
    } finally {
      await server.close()
    }
  })

  test('the slash menu keeps its highlight in view, and says what each block is', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await caretInFirstParagraph(page)
      await page.keyboard.press('Enter')
      await page.keyboard.type('/')
      const popup = page.locator('.trevixal-popup:not([hidden])')
      await expect(popup).toBeVisible()
      await expect(popup.locator('.trevixal-popup__item').first().locator('svg')).toHaveCount(1)
      await expect(popup.locator('.trevixal-popup__detail').first()).toHaveText('Plain text')

      for (let step = 0; step < 12; step++) await page.keyboard.press('ArrowDown')
      const inView = await popup.evaluate((element) => {
        const selected = element.querySelector('.trevixal-popup__item--selected')
        if (!selected) return false
        const box = element.getBoundingClientRect()
        const row = selected.getBoundingClientRect()
        return row.top >= box.top && row.bottom <= box.bottom
      })
      expect(inView).toBe(true)

      const tasks = page.locator('#editor .trevixal-content li[data-type="taskItem"]')
      const before = await tasks.count()
      await page.keyboard.type('todo')
      await page.keyboard.press('Enter')
      await expect(tasks).toHaveCount(before + 1)
    } finally {
      await server.close()
    }
  })

  test('quick insert finds anything insertable, and the tray offers back what was used', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await caretInFirstParagraph(page)
      const rules = await page.locator('#editor .trevixal-content hr').count()
      const quick = page.locator('#chrome .trevixal-quickinsert')
      await quick.locator('.trevixal-dropdown__trigger').click()
      const search = quick.locator('.trevixal-quickinsert__search')
      await expect(search).toBeFocused()
      await search.fill('rule')
      await search.press('Enter')
      await expect(page.locator('#editor .trevixal-content hr')).toHaveCount(rules + 1)

      await page.locator('#chrome .trevixal-toolbar [data-trevixal-item="italic"]').click()
      const tray = page.locator('#chrome [data-trevixal-recent="italic"]')
      await expect(tray).toBeVisible()
      await tray.click({ button: 'right' })
      await expect(tray).toHaveAttribute('data-trevixal-favorite', 'true')
      // Pinned is remembered.
      await page.reload()
      await expect(page.locator('#chrome [data-trevixal-recent="italic"]')).toHaveAttribute(
        'data-trevixal-favorite',
        'true',
      )
    } finally {
      await server.close()
    }
  })

  test('paragraph keys work on any keyboard, and a key assigned in the dialog fires', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await caretInFirstParagraph(page)
      // The block the caret is in, whatever it is turned into.
      const block = page.locator('#editor .trevixal-content > *', { hasText: 'The full editor:' })
      // Ctrl+Shift first, which AltGr cannot take; Google Docs' Ctrl+Alt second.
      await page.keyboard.press('Control+Shift+2')
      await expect(block).toHaveJSProperty('tagName', 'H2')
      await page.keyboard.press('Control+Alt+0')
      await expect(block).toHaveJSProperty('tagName', 'P')

      await runMenuItem(page, 'help', 'keyboardShortcuts')
      const dialog = page.locator('.trevixal-shortcuts')
      await page.keyboard.type('strike')
      await expect(dialog.locator('.trevixal-shortcuts__row')).toHaveCount(1)
      await dialog.locator('.trevixal-shortcuts__change').click()
      await page.keyboard.press('q')
      await expect(dialog.locator('.trevixal-shortcuts__status')).toContainText('Ctrl, Alt or ⌘')
      await expect(dialog.locator('.trevixal-shortcuts__keys')).toHaveText('Press keys…')
      // Focus stayed on the row, so the keyboard can carry on from there.
      await expect(dialog.locator('.trevixal-shortcuts__change')).toBeFocused()
      await page.keyboard.press('Control+Shift+Q')
      // Keys do nothing behind the dialog, and it says so.
      await expect(dialog.locator('.trevixal-shortcuts__status')).toContainText(
        'Close this dialog to use it',
      )
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await page.locator('#editor .trevixal-content p').first().dblclick()
      await page.keyboard.press('Control+Shift+Q')
      await expect(page.locator('#editor .trevixal-content s').first()).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('Ctrl+F and the emoji key work on a fresh page, and tooltips name the real keys', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      await caretInFirstParagraph(page)
      // Before any menu has built the find bar.
      await page.keyboard.press('Control+f')
      await expect(page.locator('.trevixal-findbar')).toBeVisible()
      await page.keyboard.press('Escape')
      await caretInFirstParagraph(page)
      await page.keyboard.press('Control+Shift+Space')
      await expect(page.locator('.trevixal-charpicker--emoji')).toBeVisible()
      await page.keyboard.press('Escape')
      // Ctrl+K opens the palette here; the link button says what opens Link.
      await expect(
        page.locator('#chrome .trevixal-toolbar [data-trevixal-item="link"]'),
      ).toHaveAttribute('title', 'Insert link (Ctrl+Shift+K)')
    } finally {
      await server.close()
    }
  })

  test('Customize toolbar applies in place, and fullscreen shows the page alone', async ({
    page,
  }) => {
    const server = await serveDist(distDir)
    try {
      await page.goto(server.origin)
      let navigated = false
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigated = true
      })
      await runMenuItem(page, 'help', 'customizeToolbar')
      await page
        .locator('.trevixal-customize__item[data-trevixal-group="lists"] input')
        .setChecked(false)
      await page.click('.trevixal-dialog--customize .trevixal-dialog__button--primary')
      await expect(
        page.locator('#chrome .trevixal-toolbar [data-trevixal-item="bulletList"]'),
      ).toHaveCount(0)
      expect(navigated).toBe(false)

      await caretInFirstParagraph(page)
      await runMenuItem(page, 'view', 'fullscreen')
      const shell = page.locator('.editor-shell')
      await expect(shell).toHaveClass(/trevixal-fullscreen/)
      await expect(page.locator('#sidebar')).toBeHidden()
      // What opens on <body>, the slash menu here, still shows over it.
      await caretInFirstParagraph(page)
      await page.keyboard.press('Enter')
      await page.keyboard.type('/')
      const popup = page.locator('.trevixal-popup:not([hidden])')
      await expect(popup).toBeVisible()
      const onTop = await popup.evaluate((element) => {
        const box = element.getBoundingClientRect()
        const hit = document.elementFromPoint(box.left + 10, box.top + 10)
        return Boolean(hit?.closest('.trevixal-popup'))
      })
      expect(onTop).toBe(true)
      // One Escape closes the menu, the next leaves fullscreen.
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await expect(shell).not.toHaveClass(/trevixal-fullscreen/)
    } finally {
      await server.close()
    }
  })
})
