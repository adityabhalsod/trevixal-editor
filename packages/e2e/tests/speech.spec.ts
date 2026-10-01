import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '../../../examples/full-editor/dist')
const surface = '#editor .trevixal-content'

async function runMenuItem(page: Page, menu: string, item: string): Promise<void> {
  await page.click(`[data-trevixal-menu="${menu}"]`)
  await page.click(`[data-trevixal-menu="${menu}"] ~ * [data-trevixal-item="${item}"]`)
}

/**
 * A voice and a microphone of the test's own: a headless browser has no
 * speech engine to hear or speak with, and the test needs to know what was
 * said. The voice says each word in turn, then finishes; the microphone
 * hears whatever `window.__hear` is given.
 */
async function stubSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const spoken: string[] = []
    Object.assign(window, { __spoken: spoken })
    class Utterance {
      lang = ''
      onboundary: ((event: { name: string; charIndex: number }) => void) | null = null
      onend: (() => void) | null = null
      constructor(readonly text: string) {}
    }
    const voice = {
      speak(utterance: Utterance) {
        spoken.push(utterance.text)
        let delay = 0
        for (const word of utterance.text.matchAll(/\S+/g)) {
          delay += 20
          setTimeout(
            () => utterance.onboundary?.({ name: 'word', charIndex: word.index ?? 0 }),
            delay,
          )
        }
        setTimeout(() => utterance.onend?.(), delay + 20)
      },
      cancel() {},
    }
    class Microphone {
      lang = ''
      continuous = false
      interimResults = false
      onresult: ((event: unknown) => void) | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      start() {
        Object.assign(window, {
          __hear: (transcript: string) =>
            this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript } }] }),
        })
      }
      stop() {}
    }
    Object.defineProperty(window, 'speechSynthesis', { value: voice, configurable: true })
    Object.assign(window, { SpeechSynthesisUtterance: Utterance, SpeechRecognition: Microphone })
  })
}

async function openWith(
  page: Page,
  lines: readonly string[],
): Promise<{ close: () => Promise<void> }> {
  await stubSpeech(page)
  const server = await serveDist(distDir)
  await page.goto(server.origin)
  await page.waitForSelector(surface)
  await runMenuItem(page, 'file', 'newDocument')
  await page
    .getByRole('alertdialog', { name: 'New document' })
    .getByRole('button', { name: 'New document' })
    .click()
  await page.locator(`${surface} > p`).click()
  for (const [index, line] of lines.entries()) {
    if (index > 0) await page.keyboard.press('Enter')
    await page.keyboard.type(line)
  }
  return server
}

test('reads the document aloud from the caret, the caret following the voice', async ({ page }) => {
  const server = await openWith(page, ['One two three.', 'Four five six.'])
  try {
    await page.locator(`${surface} > p`).first().click()
    await page.keyboard.press('Home')
    await runMenuItem(page, 'tools', 'readAloud')
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken))
      .toEqual(['One two three.', 'Four five six.'])
    // The caret ends on the last word said.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const selection = window.getSelection()
          return `${selection?.anchorNode?.textContent}@${selection?.anchorOffset}`
        }),
      )
      .toBe('Four five six.@10')
  } finally {
    await server.close()
  }
})

test('types what it hears at the caret while dictation is on', async ({ page }) => {
  const server = await openWith(page, ['Dear Sam'])
  try {
    await runMenuItem(page, 'tools', 'dictation')
    await page.click('[data-trevixal-menu="tools"]')
    await expect(
      page.locator('[data-trevixal-menu="tools"] ~ * [data-trevixal-item="dictation"]'),
    ).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
    await page.evaluate(() =>
      (window as unknown as { __hear: (words: string) => void }).__hear('thank you for the notes'),
    )
    await expect(page.locator(`${surface} > p`)).toHaveText('Dear Sam thank you for the notes')
    await runMenuItem(page, 'tools', 'dictation')
  } finally {
    await server.close()
  }
})
