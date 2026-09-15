/**
 * Storage backends for uploaded images.
 *
 * The editor never speaks to a specific provider: it holds an
 * {@link ImageStorage} and calls `upload`. Swap S3 for Cloudinary, a REST
 * endpoint, or an in-memory stub in tests without touching editor code
 * (dependency inversion, the editor owns the interface, adapters implement it).
 */
import { UploadError } from '@trevixal/core'

/** A file being uploaded, with progress and cancellation. */
export interface UploadContext {
  /** Report 0-1 completion so the placeholder can render a progress bar. */
  readonly onProgress?: (fraction: number) => void
  /** Aborts when the user cancels or the editor is destroyed. */
  readonly signal?: AbortSignal
}

/** What a backend returns once the bytes are durably stored. */
export interface UploadResult {
  /** Public URL the editor renders in `src`. */
  readonly url: string
  /** Backend-specific handle used to delete the object later. */
  readonly key?: string
  readonly width?: number
  readonly height?: number
}

/**
 * A storage backend. Implement this to target any provider; the bundled
 * adapters ({@link createObjectURLStorage}, {@link createFetchStorage},
 * {@link createS3PresignedStorage}, {@link createDataURLStorage}) are just
 * conforming implementations, not privileged ones.
 */
export interface ImageStorage {
  /** Persist the file and resolve with its public URL. */
  upload(file: File, context: UploadContext): Promise<UploadResult>
  /** Optional cleanup when an image is removed from the document. */
  delete?(result: UploadResult): Promise<void>
}

// One class, in core, so that `error instanceof UploadError` caught from an
// attachment upload also catches one raised by @trevixal/extension-embed.
export { UploadError } from '@trevixal/core'

/** Reject anything that is not a real image before a byte leaves the browser. */
export interface UploadConstraints {
  /** Bytes; defaults to 10 MB. */
  readonly maxBytes?: number
  /** Accepted MIME types; defaults to the common web image formats. */
  readonly accept?: readonly string[]
}

export const DEFAULT_ACCEPT: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
]

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024

/** Validate a file against the constraints; returns null when acceptable. */
export function validateFile(file: File, constraints: UploadConstraints = {}): string | null {
  const accept = constraints.accept ?? DEFAULT_ACCEPT
  if (!accepts(accept, file)) return `Unsupported file type: ${file.type || 'unknown'}`
  const maxBytes = constraints.maxBytes ?? DEFAULT_MAX_BYTES
  if (file.size > maxBytes) {
    return `File is too large (${formatBytes(file.size)}; limit ${formatBytes(maxBytes)})`
  }
  return null
}

/**
 * Whether a file is covered by an `accept` list.
 *
 * The list is the same one a host hands to `<input accept>`, `pickFiles`
 * passes it straight to the element, and that syntax is not a set of literal
 * MIME types. It also takes group wildcards (`image/*`), `*\/*`, and file
 * extensions (`.png`). Comparing entries literally means the picker offers
 * exactly the files this then refuses, so every form is matched.
 */
function accepts(accept: readonly string[], file: File): boolean {
  // A browser may hang parameters off the type (`image/png; charset=binary`).
  // The media type is what precedes the first `;`, which is how `extensionFor`
  // reads one too.
  const candidate = (file.type.split(';')[0] ?? '').trim().toLowerCase()
  const slash = candidate.indexOf('/')
  // No slash means no group, not "the type minus its last character".
  const group = slash > 0 ? candidate.slice(0, slash) : null
  const name = file.name.toLowerCase()
  return accept.some((entry) => {
    const pattern = entry.trim().toLowerCase()
    // `*` and `*\/*` mean "anything", which covers a file whose type the
    // browser could not work out at all.
    if (pattern === '*' || pattern === '*/*') return true
    // An extension entry says nothing about the type, so it still decides for
    // a file the browser typed as nothing.
    if (pattern.startsWith('.')) return pattern.length > 1 && name.endsWith(pattern)
    if (!candidate) return false
    if (pattern === candidate) return true
    const patternSlash = pattern.indexOf('/')
    return (
      group !== null &&
      patternSlash > 0 &&
      pattern.slice(patternSlash + 1) === '*' &&
      pattern.slice(0, patternSlash) === group
    )
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ---------------------------------------------------------------- backends

/**
 * Keeps bytes in the browser as `blob:` URLs. Nothing is persisted, good for
 * demos and drafts, useless after a reload.
 */
export function createObjectURLStorage(): ImageStorage {
  return {
    async upload(file) {
      return { url: URL.createObjectURL(file), key: file.name }
    },
    async delete(result) {
      if (result.url.startsWith('blob:')) URL.revokeObjectURL(result.url)
    },
  }
}

/** Inlines the image as a `data:` URL, self-contained documents, large JSON. */
export function createDataURLStorage(): ImageStorage {
  return {
    async upload(file, context) {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new UploadError('Could not read the file', reader.error))
        reader.onprogress = (event) => {
          if (event.lengthComputable) context.onProgress?.(event.loaded / event.total)
        }
        context.signal?.addEventListener('abort', () => reader.abort(), { once: true })
        reader.readAsDataURL(file)
      })
      return { url }
    },
  }
}

export interface FetchStorageOptions {
  /** Endpoint receiving the multipart POST. */
  readonly endpoint: string
  /** Form field name for the file; defaults to `"file"`. */
  readonly fieldName?: string
  readonly headers?: Readonly<Record<string, string>>
  /** Extra form fields (CSRF tokens, folder ids…). */
  readonly fields?: Readonly<Record<string, string>>
  /** Map your API's response body to an {@link UploadResult}. */
  readonly parseResponse?: (body: unknown) => UploadResult
  /** Endpoint for deletes; receives `{ key }` as JSON. */
  readonly deleteEndpoint?: string
}

/**
 * Posts a `multipart/form-data` upload to your own backend, the most common
 * setup, and the one that keeps credentials on the server.
 */
export function createFetchStorage(options: FetchStorageOptions): ImageStorage {
  const parse = options.parseResponse ?? defaultParseResponse
  return {
    async upload(file, context) {
      const form = new FormData()
      form.append(options.fieldName ?? 'file', file, file.name)
      for (const [name, value] of Object.entries(options.fields ?? {})) form.append(name, value)
      const response = await fetch(options.endpoint, {
        method: 'POST',
        body: form,
        headers: options.headers,
        signal: context.signal,
      })
      if (!response.ok) {
        throw new UploadError(`Upload failed with status ${response.status}`)
      }
      return parse(await response.json())
    },
    async delete(result) {
      if (!options.deleteEndpoint || !result.key) return
      await fetch(options.deleteEndpoint, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', ...options.headers },
        body: JSON.stringify({ key: result.key }),
      })
    },
  }
}

function defaultParseResponse(body: unknown): UploadResult {
  const record = body as Record<string, unknown> | null
  const url = record?.url ?? record?.src ?? record?.location
  if (typeof url !== 'string') {
    throw new UploadError('Upload response did not contain a URL')
  }
  const result: { url: string; key?: string; width?: number; height?: number } = { url }
  if (typeof record?.key === 'string') result.key = record.key
  if (typeof record?.width === 'number') result.width = record.width
  if (typeof record?.height === 'number') result.height = record.height
  return result
}

export interface PresignedUpload {
  /** URL to PUT the bytes to. */
  readonly uploadUrl: string
  /** Public URL the object will be served from. */
  readonly publicUrl: string
  readonly key?: string
  /** Extra headers the signature covers (e.g. `x-amz-acl`). */
  readonly headers?: Readonly<Record<string, string>>
}

export interface S3PresignedStorageOptions {
  /** Ask your backend to sign an upload. Credentials never reach the browser. */
  readonly sign: (file: File) => Promise<PresignedUpload>
  /** Optional delete hook, given the key returned by `sign`. */
  readonly remove?: (key: string) => Promise<void>
}

/**
 * Two-step presigned upload: your server signs, the browser PUTs directly to
 * S3/R2/GCS/Azure. Works with any provider that supports presigned URLs.
 * The signing shape is all this adapter needs to know.
 */
export function createS3PresignedStorage(options: S3PresignedStorageOptions): ImageStorage {
  return {
    async upload(file, context) {
      const presigned = await options.sign(file)
      const response = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type, ...presigned.headers },
        signal: context.signal,
      })
      if (!response.ok) {
        throw new UploadError(`Storage rejected the upload (status ${response.status})`)
      }
      const result: { url: string; key?: string } = { url: presigned.publicUrl }
      if (presigned.key) result.key = presigned.key
      return result
    },
    async delete(result) {
      if (options.remove && result.key) await options.remove(result.key)
    },
  }
}

/**
 * Try each backend in turn, falling back when one fails. Useful for
 * "upload to the CDN, but keep working offline as a data URL".
 */
export function createFallbackStorage(backends: readonly ImageStorage[]): ImageStorage {
  if (backends.length === 0) throw new RangeError('createFallbackStorage needs a backend')
  // Which backend actually took each upload. Without it a delete has no idea
  // who is holding the bytes, a chain that falls back is exactly the case
  // where "the first backend" is the wrong answer, and `deleteOnRemove`
  // would silently clean nothing up.
  const owners = new Map<string, ImageStorage>()
  return {
    async upload(file, context) {
      let lastError: unknown
      for (const backend of backends) {
        try {
          const result = await backend.upload(file, context)
          if (backend.delete) owners.set(result.url, backend)
          return result
        } catch (error) {
          if (context.signal?.aborted) throw error
          lastError = error
        }
      }
      throw new UploadError('Every storage backend failed', lastError)
    },
    async delete(result) {
      const owner = owners.get(result.url)
      // Only the backend that stored this URL is asked: handing a key to a
      // backend that never issued it deletes someone else's object at worst
      // and fails at best.
      if (!owner) return
      owners.delete(result.url)
      await owner.delete?.(result)
    },
  }
}
