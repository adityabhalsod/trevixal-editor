import { openModal } from './modal'

export interface CaptureOptions {
  /** Where the picture comes from; the camera, or the screen the browser offers, by default. */
  readonly getStream?: () => Promise<MediaStream>
}

/** A still of a playing video, as a PNG file. */
async function frameOf(video: HTMLVideoElement, name: string): Promise<File> {
  const document = video.ownerDocument
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth || 640
  canvas.height = video.videoHeight || 480
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The picture could not be taken')
  return new File([blob], name, { type: 'image/png' })
}

/** Resolve once a video has a frame to show. */
function firstFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= 2) resolve()
    else video.addEventListener('loadeddata', () => resolve(), { once: true })
  })
}

function stopAll(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop()
}

/** A capture file's name: what it is and when it was taken. */
function captureName(kind: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
  return `${kind}-${stamp}.png`
}

/**
 * Take a photo with the camera: a dialog shows the live picture, Take photo
 * freezes it, and Insert hands it back (Retake goes live again). Resolves
 * with the photo as a PNG file, or null when cancelled or when there is no
 * camera. The camera is released as soon as the photo is taken.
 */
export function capturePhoto(
  document: Document,
  options: CaptureOptions = {},
): Promise<File | null> {
  const navigator = document.defaultView?.navigator
  return runCapture(document, 'Camera photo', 'Take photo', 'photo', () =>
    options.getStream
      ? options.getStream()
      : (navigator?.mediaDevices?.getUserMedia({ video: true }) ??
        Promise.reject(new Error('no camera'))),
  )
}

/**
 * Take a screenshot: the browser asks which screen, window or tab to share,
 * and its first frame is shown to insert or not. Resolves with a PNG file,
 * or null when cancelled.
 */
export function captureScreen(
  document: Document,
  options: CaptureOptions = {},
): Promise<File | null> {
  const navigator = document.defaultView?.navigator
  return runCapture(document, 'Screenshot', null, 'screenshot', () =>
    options.getStream
      ? options.getStream()
      : (navigator?.mediaDevices?.getDisplayMedia({ video: true }) ??
        Promise.reject(new Error('screen capture is not available'))),
  )
}

/**
 * The dialog both captures share. With a `take` label the picture stays live
 * until it is pressed, as a camera's does; without one the first frame is the
 * picture, as a screenshot is.
 */
function runCapture(
  document: Document,
  title: string,
  take: string | null,
  kind: string,
  getStream: () => Promise<MediaStream>,
): Promise<File | null> {
  return new Promise((resolve) => {
    let stream: MediaStream | null = null
    let taken: File | null = null
    let settled = false
    const finish = (file: File | null): void => {
      if (settled) return
      settled = true
      stopAll(stream)
      modal.close()
      resolve(file)
    }
    const modal = openModal(document, title, () => finish(null))
    modal.dialog.classList.add('trevixal-capture')
    const video = document.createElement('video')
    video.className = 'trevixal-capture__live'
    video.muted = true
    video.playsInline = true
    const still = document.createElement('img')
    still.className = 'trevixal-capture__still'
    still.alt = ''
    still.hidden = true
    const note = document.createElement('p')
    note.className = 'trevixal-dialog__hint'
    note.setAttribute('role', 'status')
    note.textContent = 'Waiting for the picture…'
    modal.body.append(video, still, note)
    const cancel = modal.button('Cancel')
    const shoot = take ? modal.button(take, true) : null
    const retake = take ? modal.button('Retake') : null
    const insert = modal.button('Insert', true)
    insert.hidden = true
    if (retake) retake.hidden = true
    if (shoot) shoot.disabled = true
    cancel.addEventListener('click', () => finish(null))
    insert.addEventListener('click', () => finish(taken))

    const freeze = async (): Promise<void> => {
      taken = await frameOf(video, captureName(kind))
      still.src = URL.createObjectURL(taken)
      still.hidden = false
      video.hidden = true
      insert.hidden = false
      if (shoot) shoot.hidden = true
      if (retake) retake.hidden = false
      note.textContent = 'Insert this picture, or cancel.'
      if (!take) stopAll(stream)
      insert.focus()
    }
    shoot?.addEventListener('click', () => void freeze())
    retake?.addEventListener('click', () => {
      taken = null
      still.hidden = true
      video.hidden = false
      insert.hidden = true
      if (shoot) shoot.hidden = false
      if (retake) retake.hidden = true
      shoot?.focus()
    })

    getStream()
      .then(async (media) => {
        if (settled) {
          stopAll(media)
          return
        }
        stream = media
        video.srcObject = media
        await video.play().catch(() => undefined)
        await firstFrame(video)
        note.textContent = take ? '' : 'The first frame of what you shared:'
        if (shoot) {
          shoot.disabled = false
          shoot.focus()
        } else {
          await freeze()
        }
      })
      .catch((error: unknown) => {
        note.textContent = `${title} is not available: ${
          error instanceof Error ? error.message : String(error)
        }`
      })
  })
}
