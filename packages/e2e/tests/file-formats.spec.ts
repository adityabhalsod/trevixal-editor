import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Download, type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '../../../examples/full-editor/dist')
const surface = '#editor .trevixal-content'

async function runMenuItem(page: Page, menu: string, item: string): Promise<void> {
  await page.click(`[data-trevixal-menu="${menu}"]`)
  await page.click(`[data-trevixal-menu="${menu}"] ~ * [data-trevixal-item="${item}"]`)
}

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })

/** The full editor on a new document of these paragraphs, the first a level-one heading. */
async function openWith(
  page: Page,
  title: string,
  lines: readonly string[],
): Promise<{ close: () => Promise<void> }> {
  const server = await serveDist(distDir)
  await page.goto(server.origin)
  await page.waitForSelector(surface)
  await runMenuItem(page, 'file', 'newDocument')
  await page
    .getByRole('alertdialog', { name: 'New document' })
    .getByRole('button', { name: 'New document' })
    .click()
  await page.locator(`${surface} > p`).click()
  await page.keyboard.type(`# ${title}`)
  for (const line of lines) {
    await page.keyboard.press('Enter')
    await page.keyboard.type(line)
  }
  await expect(page.locator(`${surface} h1`)).toHaveText(title)
  return server
}

/** Download through File ▸ Download as, and the file's bytes. */
async function download(page: Page, item: string): Promise<{ file: Download; bytes: Buffer }> {
  const pending = page.waitForEvent('download')
  await runMenuItem(page, 'file', item)
  const file = await pending
  return { file, bytes: await readFile((await file.path()) as string) }
}

/** Open a file through File ▸ Open. */
async function openFile(page: Page, name: string, mimeType: string, buffer: Buffer): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await runMenuItem(page, 'file', 'openDocument')
  await (await chooser).setFiles({ name, mimeType, buffer })
}

// ------------------------------------------------ a stored ZIP, built here

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** A ZIP of stored entries, as a Notion export is to the reader. */
function storedZip(files: readonly { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const crc = crc32(file.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(file.data.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, file.data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(file.data.length, 20)
    central.writeUInt32LE(file.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += 30 + name.length + file.data.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

/** A one-page PDF drawing each line in Helvetica at its size and height. */
function minimalPDF(lines: readonly { text: string; size: number; y: number }[]): Buffer {
  const stream = lines
    .map((line) => `BT /F1 ${line.size} Tf 72 ${line.y} Td (${line.text}) Tj ET`)
    .join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

/** A one-pixel PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

test('downloads OpenDocument, and opens it back as it was', async ({ page }) => {
  const server = await openWith(page, 'Field notes', ['Owls hunt at night.'])
  try {
    const { file, bytes } = await download(page, 'downloadOdt')
    expect(file.suggestedFilename()).toMatch(/\.odt$/)
    // The mimetype comes first, stored, as OpenDocument asks.
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('PK\u0003\u0004')
    expect(bytes.includes(Buffer.from('mimetypeapplication/vnd.oasis.opendocument.text'))).toBe(
      true,
    )

    await runMenuItem(page, 'file', 'newDocument')
    await page
      .getByRole('alertdialog', { name: 'New document' })
      .getByRole('button', { name: 'New document' })
      .click()
    await openFile(page, 'notes.odt', 'application/vnd.oasis.opendocument.text', bytes)
    await expect(page.locator(`${surface} h1`)).toHaveText('Field notes')
    await expect(page.locator(`${surface} > p`)).toHaveText('Owls hunt at night.')
  } finally {
    await server.close()
  }
})

test('downloads an EPUB book and LaTeX source', async ({ page }) => {
  const server = await openWith(page, 'Field notes', ['Owls & bats: 100% nocturnal.'])
  try {
    const book = await download(page, 'downloadEpub')
    expect(book.file.suggestedFilename()).toMatch(/\.epub$/)
    expect(book.bytes.includes(Buffer.from('mimetypeapplication/epub+zip'))).toBe(true)
    expect(book.bytes.includes(Buffer.from('OEBPS/chapter-1.xhtml'))).toBe(true)

    const latex = await download(page, 'downloadLatex')
    expect(latex.file.suggestedFilename()).toMatch(/\.tex$/)
    const source = latex.bytes.toString('utf8')
    expect(source).toContain('\\title{Field notes}')
    expect(source).toContain('Owls \\& bats: 100\\% nocturnal.')
  } finally {
    await server.close()
  }
})

test('downloads a web page in one file, its pictures packed in', async ({ page }) => {
  await page.route('https://pics.test/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: PNG,
    }),
  )
  const server = await openWith(page, 'Pictures', ['placeholder'])
  try {
    await openFile(
      page,
      'pictures.html',
      'text/html',
      Buffer.from(
        '<h1>Pictures</h1><p>A dot:</p><p><img src="https://pics.test/dot.png" alt="A dot"></p>',
      ),
    )
    await expect(page.locator(`${surface} img`)).toHaveAttribute('src', 'https://pics.test/dot.png')
    const { file, bytes } = await download(page, 'downloadHtmlSingle')
    expect(file.suggestedFilename()).toMatch(/\.html$/)
    const html = bytes.toString('utf8')
    expect(html).toContain('src="data:image/png;base64,')
    expect(html).not.toContain('src="https://pics.test/dot.png"')
  } finally {
    await server.close()
  }
})

test('opens a PDF’s text, its larger line a heading', async ({ page }) => {
  const server = await openWith(page, 'Placeholder', [])
  try {
    const pdf = minimalPDF([
      { text: 'Owl report', size: 24, y: 720 },
      { text: 'Owls hunt at night.', size: 12, y: 690 },
      { text: 'They see well.', size: 12, y: 675 },
    ])
    await openFile(page, 'owls.pdf', 'application/pdf', pdf)
    await expect(page.locator(`${surface} h1`)).toHaveText('Owl report', { timeout: 30_000 })
    await expect(page.locator(`${surface} > p`)).toHaveText('Owls hunt at night. They see well.')
  } finally {
    await server.close()
  }
})

test('opens a Notion export, its pictures packed in', async ({ page }) => {
  const server = await openWith(page, 'Placeholder', [])
  try {
    const archive = storedZip([
      {
        name: 'Trip 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.md',
        data: Buffer.from(
          '# Trip\n\nPack light.\n\n![Map](Trip%201a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d/map.png)\n',
        ),
      },
      { name: 'Trip 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d/map.png', data: PNG },
    ])
    await openFile(page, 'Export.zip', 'application/zip', archive)
    await expect(page.locator(`${surface} h1`)).toHaveText('Trip')
    await expect(page.locator(`${surface} > p`).first()).toHaveText('Pack light.')
    await expect(page.locator(`${surface} img`)).toHaveAttribute('src', /^data:image\/png;base64,/)
  } finally {
    await server.close()
  }
})

test('downloads every document in the workspace at once', async ({ page }) => {
  const server = await serveDist(distDir)
  try {
    await page.goto(server.origin)
    await runMenuItem(page, 'view', 'workspacePanel')
    await expect(page.locator('.trevixal-tabs-bar__item')).toHaveCount(1)
    await runMenuItem(page, 'file', 'exportFolder')
    const box = dialog(page, 'Download a workspace folder')
    await box.locator('[name="format"]').selectOption('markdown')
    const pending = page.waitForEvent('download')
    await box.getByRole('button', { name: 'Download' }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe('workspace.zip')
    const bytes = await readFile((await file.path()) as string)
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('PK\u0003\u0004')
    expect(bytes.includes(Buffer.from('welcome.md'))).toBe(true)
    expect(bytes.includes(Buffer.from('# Trevixal'))).toBe(true)
  } finally {
    await server.close()
  }
})
