import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '../../../examples/full-editor/dist')
const surface = '#editor .trevixal-content'
const PASSWORD = 'correct horse battery'

async function runMenuItem(page: Page, menu: string, item: string): Promise<void> {
  await page.click(`[data-trevixal-menu="${menu}"]`)
  await page.click(`[data-trevixal-menu="${menu}"] ~ * [data-trevixal-item="${item}"]`)
}

async function openWith(
  page: Page,
  lines: readonly string[],
  host = '127.0.0.1',
): Promise<{ close: () => Promise<void> }> {
  const server = await serveDist(distDir)
  await page.goto(server.origin.replace('127.0.0.1', host))
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

test('signs the document, and says so when it changes after', async ({ page }) => {
  const server = await openWith(page, ['The terms as agreed.'])
  try {
    await runMenuItem(page, 'file', 'signDocument')
    const dialog = page.getByRole('dialog', { name: 'Sign document' })
    await dialog.locator('[name="signer"]').fill('Ada')
    await dialog.getByRole('button', { name: 'Sign' }).click()
    const status = page.locator('#security')
    await expect(status).toContainText('Signed by Ada on')
    await expect(status).toContainText(/key [0-9A-F]{4} [0-9A-F]{4}/)

    const pending = page.waitForEvent('download')
    await runMenuItem(page, 'file', 'downloadJson')
    const saved = JSON.parse(await readFile((await (await pending).path()) as string, 'utf8'))
    expect(JSON.parse(saved.attrs.signature)).toMatchObject({ signer: 'Ada' })

    await page.locator(`${surface} > p`).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Mostly.')
    await expect(status).toContainText('Changed since Ada signed it')
  } finally {
    await server.close()
  }
})

test('keeps an audit log of who changed what, and downloads it', async ({ page }) => {
  const server = await openWith(page, ['First draft of the plan.'])
  try {
    await runMenuItem(page, 'tools', 'auditLog')
    const log = page.getByRole('dialog', { name: 'Audit log' })
    await expect(log.locator('.trevixal-findings__heading').first()).toContainText('You ·')
    await expect(log.locator('.trevixal-findings__message').first()).toContainText(
      'First draft of the plan.',
    )
    const pending = page.waitForEvent('download')
    await log.getByRole('button', { name: 'Download CSV' }).click()
    const csv = await readFile((await (await pending).path()) as string, 'utf8')
    expect(csv.split('\r\n')[0]).toBe('Started,Ended,Author,Inserted,Deleted,Formatting,Where')
    expect(csv).toContain(',You,')
  } finally {
    await server.close()
  }
})

test('unlocks a locked document with a passkey, beside its password', async ({
  page,
  browserName,
}) => {
  // A virtual authenticator comes from Chromium's DevTools protocol only.
  test.skip(browserName !== 'chromium', 'Needs a virtual authenticator')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  // A passkey belongs to a domain, and an IP address is not one.
  const server = await openWith(page, ['Board minutes.'], 'localhost')
  try {
    await runMenuItem(page, 'file', 'protectDocument')
    const protect = page.locator('.trevixal-dialog')
    await protect.locator('[name="password"]').fill(PASSWORD)
    await protect.locator('[name="confirm"]').fill(PASSWORD)
    await protect.locator('.trevixal-dialog__button--primary').click()
    await expect(page.locator('#security')).toContainText('Password-protected')

    await runMenuItem(page, 'file', 'addPasskey')
    await expect(page.locator('#security')).toContainText('A passkey can now unlock this document')

    await runMenuItem(page, 'file', 'lockNow')
    const lockScreen = page.getByRole('dialog', { name: 'Document locked' })
    await expect(lockScreen).toBeVisible()
    await lockScreen.getByRole('button', { name: 'Use a passkey' }).click()
    await expect(lockScreen).toHaveCount(0)
    await expect(page.locator(surface)).toBeVisible()
  } finally {
    await server.close()
  }
})
