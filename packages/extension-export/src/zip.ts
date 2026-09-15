/**
 * A minimal ZIP container, enough for the OOXML packages a DOCX is made of.
 * Writing always stores entries uncompressed (method 0): the parts are small
 * XML files and a dependency-free writer has no deflater to call. Reading
 * accepts stored and deflated entries, inflating the latter through the
 * platform's `DecompressionStream`.
 */
import { UnsupportedEnvironmentError } from '@trevixal/core'

/**
 * An archive cannot be read: it is not one, it is damaged, or it uses a
 * feature this reader does not implement.
 *
 * Separate from {@link UnsupportedEnvironmentError} because the answer a host
 * gives differs. This one means "that file will not open" and the user can try
 * another; the other means "this browser cannot open it" and trying another
 * file will not help.
 */
export class ArchiveError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ArchiveError'
  }
}

export interface ZipEntry {
  /** Path inside the archive, `/`-separated (`word/document.xml`). */
  readonly name: string
  /** Strings are encoded as UTF-8. */
  readonly data: Uint8Array | string
}

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_OF_CENTRAL_DIRECTORY = 0x06054b50

/** General-purpose flag bit 11: names and comments are UTF-8. */
const UTF8_NAMES = 0x0800

let crcTable: Uint32Array | null = null

function table(): Uint32Array {
  if (crcTable) return crcTable
  const built = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    built[n] = c >>> 0
  }
  crcTable = built
  return built
}

/** The CRC-32 (IEEE 802.3) checksum ZIP entries carry, as an unsigned integer. */
export function crc32(bytes: Uint8Array): number {
  const lookup = table()
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index++) {
    crc = (lookup[(crc ^ (bytes[index] as number)) & 0xff] as number) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === 'string' ? encoder.encode(data) : data
}

/**
 * A fixed timestamp (2000-01-01 00:00) in MS-DOS format, so the same document
 * always yields byte-identical archives, useful for caching and tests, and
 * Word never displays entry times anyway.
 */
const DOS_TIME = 0
const DOS_DATE = ((2000 - 1980) << 9) | (1 << 5) | 1

class ByteWriter {
  private chunks: Uint8Array[] = []
  private length = 0

  get offset(): number {
    return this.length
  }

  u16(value: number): void {
    this.bytes(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]))
  }

  u32(value: number): void {
    this.bytes(
      new Uint8Array([
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
      ]),
    )
  }

  bytes(data: Uint8Array): void {
    this.chunks.push(data)
    this.length += data.length
  }

  finish(): Uint8Array {
    const out = new Uint8Array(this.length)
    let position = 0
    for (const chunk of this.chunks) {
      out.set(chunk, position)
      position += chunk.length
    }
    return out
  }
}

/** Build a stored (uncompressed) ZIP archive from the given entries. */
export function createZip(entries: readonly ZipEntry[]): Uint8Array {
  const writer = new ByteWriter()
  const records: { name: Uint8Array; crc: number; size: number; offset: number }[] = []

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const data = toBytes(entry.data)
    const crc = crc32(data)
    const offset = writer.offset
    writer.u32(LOCAL_HEADER)
    writer.u16(20) // version needed to extract: 2.0
    writer.u16(UTF8_NAMES)
    writer.u16(0) // method: stored
    writer.u16(DOS_TIME)
    writer.u16(DOS_DATE)
    writer.u32(crc)
    writer.u32(data.length)
    writer.u32(data.length)
    writer.u16(name.length)
    writer.u16(0) // extra field length
    writer.bytes(name)
    writer.bytes(data)
    records.push({ name, crc, size: data.length, offset })
  }

  const directoryOffset = writer.offset
  for (const record of records) {
    writer.u32(CENTRAL_HEADER)
    writer.u16(20) // version made by
    writer.u16(20) // version needed
    writer.u16(UTF8_NAMES)
    writer.u16(0)
    writer.u16(DOS_TIME)
    writer.u16(DOS_DATE)
    writer.u32(record.crc)
    writer.u32(record.size)
    writer.u32(record.size)
    writer.u16(record.name.length)
    writer.u16(0) // extra
    writer.u16(0) // comment
    writer.u16(0) // disk number start
    writer.u16(0) // internal attributes
    writer.u32(0) // external attributes
    writer.u32(record.offset)
    writer.bytes(record.name)
  }
  const directorySize = writer.offset - directoryOffset

  writer.u32(END_OF_CENTRAL_DIRECTORY)
  writer.u16(0) // this disk
  writer.u16(0) // directory disk
  writer.u16(records.length)
  writer.u16(records.length)
  writer.u32(directorySize)
  writer.u32(directoryOffset)
  writer.u16(0) // comment length
  return writer.finish()
}

function u16At(data: Uint8Array, offset: number): number {
  return (data[offset] as number) | ((data[offset + 1] as number) << 8)
}

function u32At(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] as number) |
      ((data[offset + 1] as number) << 8) |
      ((data[offset + 2] as number) << 16) |
      ((data[offset + 3] as number) << 24)) >>>
    0
  )
}

/** Locate the end-of-central-directory record, which may be followed by a comment. */
function findEndRecord(data: Uint8Array): number {
  const minimum = Math.max(0, data.length - 22 - 0xffff)
  for (let offset = data.length - 22; offset >= minimum; offset--) {
    if (u32At(data, offset) === END_OF_CENTRAL_DIRECTORY) return offset
  }
  throw new ArchiveError('Not a ZIP archive: end of central directory not found')
}

async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new UnsupportedEnvironmentError(
      'Cannot read deflated ZIP entries: DecompressionStream is unavailable',
    )
  }
  const stream = new DecompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  // Copy into a fresh buffer so a view into the archive is never handed to the
  // stream, which may detach or retain what it is given. When the data is not
  // valid deflate the readable side rejects first; the write's own rejection
  // is then the same error and must not surface as an unhandled rejection.
  const write = writer
    .write(new Uint8Array(compressed))
    .then(() => writer.close())
    .catch(() => undefined)
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.length
    }
  } catch (error) {
    await write
    throw new ArchiveError(
      `Corrupt ZIP archive: deflated entry could not be inflated (${
        error instanceof Error ? error.message : String(error)
      })`,
    )
  }
  await write
  const out = new Uint8Array(total)
  let position = 0
  for (const chunk of chunks) {
    out.set(chunk, position)
    position += chunk.length
  }
  return out
}

/**
 * Read every entry of a ZIP archive into a map keyed by entry name. Stored
 * and deflated entries are supported; any other method, encryption or a
 * ZIP64 archive raises a descriptive error rather than yielding garbage.
 */
export async function readZip(data: Uint8Array): Promise<ReadonlyMap<string, Uint8Array>> {
  const end = findEndRecord(data)
  const count = u16At(data, end + 10)
  const directoryOffset = u32At(data, end + 16)
  if (count === 0xffff || directoryOffset === 0xffffffff) {
    throw new ArchiveError('ZIP64 archives are not supported')
  }

  const entries = new Map<string, Uint8Array>()
  let cursor = directoryOffset
  for (let index = 0; index < count; index++) {
    if (u32At(data, cursor) !== CENTRAL_HEADER) {
      throw new ArchiveError('Corrupt ZIP archive: bad central directory entry')
    }
    const flags = u16At(data, cursor + 8)
    const method = u16At(data, cursor + 10)
    const compressedSize = u32At(data, cursor + 20)
    const nameLength = u16At(data, cursor + 28)
    const extraLength = u16At(data, cursor + 30)
    const commentLength = u16At(data, cursor + 32)
    const localOffset = u32At(data, cursor + 42)
    const name = decoder.decode(data.subarray(cursor + 46, cursor + 46 + nameLength))
    cursor += 46 + nameLength + extraLength + commentLength

    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new ArchiveError(`ZIP64 archives are not supported (entry "${name}")`)
    }
    if (flags & 0x1) throw new ArchiveError(`ZIP entry "${name}" is encrypted`)
    if (u32At(data, localOffset) !== LOCAL_HEADER) {
      throw new ArchiveError(`Corrupt ZIP archive: bad local header for "${name}"`)
    }
    const localNameLength = u16At(data, localOffset + 26)
    const localExtraLength = u16At(data, localOffset + 28)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const compressed = data.subarray(start, start + compressedSize)

    if (method === 0) {
      entries.set(name, compressed)
    } else if (method === 8) {
      entries.set(name, await inflateRaw(compressed))
    } else {
      throw new ArchiveError(`ZIP entry "${name}" uses unsupported compression method ${method}`)
    }
  }
  return entries
}
