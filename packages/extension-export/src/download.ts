/**
 * Browser file helpers: hand a generated document to the user as a download,
 * and read a chosen file back. Nothing here touches the editor; the
 * `document` is passed in so an embedding app can point at an iframe's.
 */

export interface DownloadOptions {
  /** File name including extension (`report.docx`). */
  readonly name: string
  /** MIME type for the blob. */
  readonly mime: string
  readonly data: string | Uint8Array | Blob
}

function toBlob(data: string | Uint8Array | Blob, mime: string): Blob {
  if (data instanceof Blob) return data
  // A fresh copy guarantees a plain ArrayBuffer-backed view, which is what
  // the Blob constructor's typing requires.
  const part = typeof data === 'string' ? data : new Uint8Array(data)
  return new Blob([part], { type: mime })
}

/**
 * Trigger a download by clicking a temporary anchor. The object URL is
 * revoked on the next tick, after the browser has begun the download.
 */
export function downloadFile(document: Document, options: DownloadOptions): void {
  const blob = toBlob(options.data, options.mime)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = options.name
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const MAX_SLUG = 60

/**
 * A safe file name from a document title: lowercase ASCII words joined by
 * hyphens, at most 60 characters, falling back to `document`. The
 * extension is appended without a leading dot of its own.
 */
export function suggestFileName(title: string | null | undefined, extension: string): string {
  const slug = (title ?? '')
    .normalize('NFKD')
    // The combining marks NFKD just split off, matched by Unicode property
    // with the `u` flag rather than as a U+0300-U+036F class: a range of
    // combining code points can silently pair with the character before it.
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, '')
  const ext = extension.replace(/^\.+/, '')
  return `${slug.length > 0 ? slug : 'document'}${ext ? `.${ext}` : ''}`
}

/** The text of a picked file, decoded as UTF-8. */
export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsText(file)
  })
}

/** The raw bytes of a picked file. */
export async function readFileBytes(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer())
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.readAsArrayBuffer(file)
  })
}
