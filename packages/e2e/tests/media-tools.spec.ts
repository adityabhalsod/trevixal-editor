import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { serveDist } from './serve-dist'

const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/full-editor/dist')

/**
 * A camera, a screen and a microphone that need no hardware and no
 * permission prompt: a canvas that paints frames, and a tone.
 */
async function fakeDevices(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const canvasStream = (): MediaStream => {
      const canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = 240
      const context = canvas.getContext('2d') as CanvasRenderingContext2D
      let frame = 0
      const paint = (): void => {
        context.fillStyle = frame++ % 2 ? '#3b82f6' : '#1d4ed8'
        context.fillRect(0, 0, 320, 240)
        context.fillStyle = '#fff'
        context.fillRect(40, 40, 120, 80)
      }
      paint()
      setInterval(paint, 100)
      return canvas.captureStream(10)
    }
    const tone = (): MediaStream => {
      const context = new AudioContext()
      const oscillator = context.createOscillator()
      const destination = context.createMediaStreamDestination()
      oscillator.connect(destination)
      oscillator.start()
      return destination.stream
    }
    const devices = {
      getUserMedia: async (constraints: MediaStreamConstraints) =>
        constraints.video ? canvasStream() : tone(),
      getDisplayMedia: async () => canvasStream(),
    }
    Object.defineProperty(navigator, 'mediaDevices', { value: devices, configurable: true })
  })
}

async function open(page: Page): Promise<{ close: () => Promise<void> }> {
  await fakeDevices(page)
  const server = await serveDist(distDir)
  await page.goto(server.origin)
  await page.waitForSelector('#editor .trevixal-content')
  // Start at the end of the first paragraph, where an inserted block goes after it.
  await page
    .locator('#editor .trevixal-content > p')
    .first()
    .click({ position: { x: 4, y: 6 } })
  return server
}

async function insertMenu(page: Page, entry: string): Promise<void> {
  await page.getByRole('menuitem', { name: 'Insert', exact: true }).click()
  await page.getByRole('menuitem', { name: entry, exact: true }).click()
}

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })

test('embeds a CodePen pen from its page URL', async ({ page }) => {
  const server = await open(page)
  try {
    await insertMenu(page, 'Embed a link…')
    await page.locator('.trevixal-dialog [name="url"]').fill('https://codepen.io/team/pen/abcXYZ')
    await page.getByRole('button', { name: 'Insert', exact: true }).click()
    const frame = page.locator('#editor iframe.trevixal-embed--codepen')
    await expect(frame).toHaveAttribute(
      'src',
      'https://codepen.io/team/embed/abcXYZ?default-tab=result',
    )
  } finally {
    await server.close()
  }
})

test('takes a camera photo, asks what it shows, and opens it full size', async ({ page }) => {
  const server = await open(page)
  try {
    const before = await page.locator('#editor img.trevixal-image').count()
    await insertMenu(page, 'Camera photo…')
    const camera = dialog(page, 'Camera photo')
    await camera.getByRole('button', { name: 'Take photo' }).click()
    await camera.getByRole('button', { name: 'Insert', exact: true }).click()
    await expect(page.locator('#editor img.trevixal-image')).toHaveCount(before + 1)

    // The new image asks for its alt text.
    const prompt = dialog(page, 'Describe this image')
    await expect(prompt).toBeVisible()
    await prompt.locator('[name="alt"]').fill('A blue square with a white box')
    await prompt.getByRole('button', { name: 'Save' }).click()
    const photo = page.locator('#editor img.trevixal-image').last()
    await expect(photo).toHaveAttribute('alt', 'A blue square with a white box')

    await photo.dblclick()
    const lightbox = page.locator('.trevixal-lightbox')
    await expect(lightbox).toBeVisible()
    await expect(lightbox.locator('img')).toHaveAttribute('alt', 'A blue square with a white box')
    await page.keyboard.press('Escape')
    await expect(lightbox).toHaveCount(0)
  } finally {
    await server.close()
  }
})

test('takes a screenshot of what is shared', async ({ page }) => {
  const server = await open(page)
  try {
    const before = await page.locator('#editor img.trevixal-image').count()
    await insertMenu(page, 'Screenshot…')
    await dialog(page, 'Screenshot').getByRole('button', { name: 'Insert', exact: true }).click()
    await expect(page.locator('#editor img.trevixal-image')).toHaveCount(before + 1)
    await dialog(page, 'Describe this image').getByRole('button', { name: 'Skip' }).click()
  } finally {
    await server.close()
  }
})

test('marks an image up: a box drawn over it goes into its pixels', async ({ page }) => {
  const server = await open(page)
  try {
    await insertMenu(page, 'Camera photo…')
    await dialog(page, 'Camera photo').getByRole('button', { name: 'Take photo' }).click()
    await dialog(page, 'Camera photo').getByRole('button', { name: 'Insert', exact: true }).click()
    await dialog(page, 'Describe this image').getByRole('button', { name: 'Skip' }).click()
    const photo = page.locator('#editor img.trevixal-image').last()
    await expect(photo).toHaveAttribute('src', /^data:image\//)
    const before = await photo.getAttribute('src')
    await photo.click()
    await page.locator('[data-trevixal-item="markup"]').click()
    const markup = dialog(page, 'Mark up image')
    await markup.getByRole('button', { name: 'Box' }).click()
    const stage = markup.locator('.trevixal-markup__stage')
    const box = await stage.boundingBox()
    if (!box) throw new Error('no stage')
    await page.mouse.move(box.x + 20, box.y + 20)
    await page.mouse.down()
    await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 })
    await page.mouse.up()
    await markup.getByRole('button', { name: 'Apply' }).click()
    await expect(photo).not.toHaveAttribute('src', before ?? '')
  } finally {
    await server.close()
  }
})

test('draws on the board and puts the drawing in', async ({ page }) => {
  const server = await open(page)
  try {
    await insertMenu(page, 'Drawing…')
    const board = dialog(page, 'Drawing').locator('.trevixal-drawing-editor__board')
    const box = await board.boundingBox()
    if (!box) throw new Error('no board')
    await page.mouse.move(box.x + 30, box.y + 30)
    await page.mouse.down()
    await page.mouse.move(box.x + 200, box.y + 120, { steps: 8 })
    await page.mouse.up()
    await dialog(page, 'Drawing').getByRole('button', { name: 'Arrow' }).click()
    await page.mouse.move(box.x + 250, box.y + 40)
    await page.mouse.down()
    await page.mouse.move(box.x + 400, box.y + 150, { steps: 5 })
    await page.mouse.up()
    await dialog(page, 'Drawing').getByRole('button', { name: 'Save' }).click()
    // The new one, after the first paragraph: the tour has a drawing of its own further on.
    await expect(page.locator('#editor .trevixal-drawing')).toHaveCount(2)
    const drawing = page.locator('#editor .trevixal-drawing').first()
    await expect(drawing.locator('svg path')).toHaveCount(1)
    await expect(drawing.locator('svg polygon')).toHaveCount(1)
  } finally {
    await server.close()
  }
})

test('records from the microphone, the recording with its waveform', async ({ page }) => {
  const server = await open(page)
  try {
    test.skip(
      !(await page.evaluate(() => typeof MediaRecorder !== 'undefined')),
      'this engine cannot record',
    )
    await insertMenu(page, 'Record audio…')
    const recorder = dialog(page, 'Record audio')
    await recorder.getByRole('button', { name: 'Record' }).click()
    await expect(recorder.getByRole('button', { name: 'Stop' })).toBeVisible()
    await page.waitForTimeout(700)
    await recorder.getByRole('button', { name: 'Stop' }).click()
    await recorder.getByRole('button', { name: 'Insert', exact: true }).click()
    const block = page.locator('#editor .trevixal-audio-block')
    await expect(block).toHaveCount(1)
    await expect(block.locator('svg.trevixal-waveform rect').first()).toBeAttached()
    await expect(block.locator('audio')).toHaveAttribute('title', /^Recording, 0:0/)
  } finally {
    await server.close()
  }
})

test('gives a video chapters that link to where each starts', async ({ page }) => {
  const server = await open(page)
  try {
    await insertMenu(page, 'Video…')
    await page.locator('.trevixal-dialog [name="url"]').fill('https://example.com/talk.mp4')
    await page.getByRole('button', { name: 'Insert', exact: true }).click()
    const video = page.locator('#editor video.trevixal-video')
    await expect(video).toHaveCount(1)
    await video.click()
    await insertMenu(page, 'Video chapters…')
    await page.locator('.trevixal-dialog [name="chapters"]').fill('0:00 Welcome\n2:15 The demo')
    await page.getByRole('button', { name: 'Save' }).click()
    const links = page.locator('#editor .trevixal-chapters a')
    await expect(links).toHaveCount(2)
    await expect(links.nth(1)).toHaveAttribute('href', 'https://example.com/talk.mp4#t=135')
  } finally {
    await server.close()
  }
})

test('puts picked images in as one gallery', async ({ page }) => {
  const server = await open(page)
  try {
    const chooser = page.waitForEvent('filechooser')
    await insertMenu(page, 'Image gallery…')
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    await (await chooser).setFiles([
      { name: 'one.png', mimeType: 'image/png', buffer: png },
      { name: 'two.png', mimeType: 'image/png', buffer: png },
    ])
    const gallery = page.locator('#editor .trevixal-gallery')
    await expect(gallery.locator('img.trevixal-image[src^="data:image/png"]')).toHaveCount(2)
    await dialog(page, 'Describe this image').getByRole('button', { name: 'Skip' }).click()
  } finally {
    await server.close()
  }
})

test('takes the script out of an uploaded SVG', async ({ page }) => {
  const server = await open(page)
  try {
    const chooser = page.waitForEvent('filechooser')
    await insertMenu(page, 'Image…')
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" onload="alert(1)">' +
      '<script>alert(2)</script><rect width="20" height="20" fill="teal"/></svg>'
    await (await chooser).setFiles({
      name: 'mark.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(svg),
    })
    const image = page.locator('#editor img.trevixal-image[src^="data:image/svg+xml"]')
    await expect(image).toHaveCount(1)
    const markup = await image.evaluate(async (element) => {
      const response = await fetch((element as HTMLImageElement).src)
      return response.text()
    })
    expect(markup).toContain('fill="teal"')
    expect(markup).not.toContain('script')
    expect(markup).not.toContain('onload')
  } finally {
    await server.close()
  }
})
