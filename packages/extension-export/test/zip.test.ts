import { describe, expect, it } from 'vitest'
import { type ZipEntry, crc32, createZip, readZip } from '../src/zip'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytes(value: string): Uint8Array {
  return encoder.encode(value)
}

/** Deflate with the platform compressor, mirroring the reader's inflater. */
async function deflateRaw(input: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  const pending = writer.write(new Uint8Array(input)).then(() => writer.close())
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  await pending
  const out = new Uint8Array(total)
  let position = 0
  for (const chunk of chunks) {
    out.set(chunk, position)
    position += chunk.length
  }
  return out
}

interface RawEntry {
  readonly name: string
  readonly method: number
  readonly data: Uint8Array
  readonly stored: Uint8Array
}

/** A ZIP built field by field, so the reader can be pointed at bytes `createZip` never emits. */
function buildArchive(entries: readonly RawEntry[]): Uint8Array {
  const out: number[] = []
  const u16 = (value: number): void => {
    out.push(value & 0xff, (value >>> 8) & 0xff)
  }
  const u32 = (value: number): void => {
    out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff)
  }
  const push = (data: Uint8Array): void => {
    for (const byte of data) out.push(byte)
  }

  const offsets: number[] = []
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    offsets.push(out.length)
    u32(0x04034b50)
    u16(20)
    u16(0x0800)
    u16(entry.method)
    u16(0)
    u16(0x2821)
    u32(crc32(entry.data))
    u32(entry.stored.length)
    u32(entry.data.length)
    u16(name.length)
    u16(0)
    push(name)
    push(entry.stored)
  }

  const directoryOffset = out.length
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] as RawEntry
    const name = encoder.encode(entry.name)
    u32(0x02014b50)
    u16(20)
    u16(20)
    u16(0x0800)
    u16(entry.method)
    u16(0)
    u16(0x2821)
    u32(crc32(entry.data))
    u32(entry.stored.length)
    u32(entry.data.length)
    u16(name.length)
    u16(0)
    u16(0)
    u16(0)
    u16(0)
    u32(0)
    u32(offsets[index] as number)
    push(name)
  }
  const directorySize = out.length - directoryOffset

  u32(0x06054b50)
  u16(0)
  u16(0)
  u16(entries.length)
  u16(entries.length)
  u32(directorySize)
  u32(directoryOffset)
  u16(0)
  return new Uint8Array(out)
}

describe('crc32', () => {
  it('matches the standard check vector', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926)
  })

  it('is zero for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it('matches other published vectors', () => {
    expect(crc32(bytes('a'))).toBe(0xe8b7be43)
    expect(crc32(bytes('abc'))).toBe(0x352441c2)
    expect(crc32(bytes('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
  })

  it('returns an unsigned 32-bit integer for high-bit checksums', () => {
    const value = crc32(new Uint8Array([0x00]))
    expect(value).toBe(0xd202ef8d)
    expect(value).toBeGreaterThan(0)
  })

  it('depends on byte order', () => {
    expect(crc32(bytes('ab'))).not.toBe(crc32(bytes('ba')))
  })
})

describe('createZip and readZip', () => {
  const entries: readonly ZipEntry[] = [
    { name: '[Content_Types].xml', data: '<Types/>' },
    { name: 'word/document.xml', data: '<w:document/>' },
    { name: 'word/média-☃.txt', data: 'naïve ☃ payload' },
    { name: 'empty.bin', data: new Uint8Array(0) },
    { name: 'word/media/image1.png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]) },
  ]

  it('round-trips every entry byte for byte', async () => {
    const parts = await readZip(createZip(entries))
    expect(parts.size).toBe(entries.length)
    for (const entry of entries) {
      const actual = parts.get(entry.name)
      expect(actual).toBeDefined()
      const expected = typeof entry.data === 'string' ? bytes(entry.data) : entry.data
      expect([...(actual as Uint8Array)]).toEqual([...expected])
    }
  })

  it('preserves entry order', async () => {
    const parts = await readZip(createZip(entries))
    expect([...parts.keys()]).toEqual(entries.map((entry) => entry.name))
  })

  it('keeps a UTF-8 name intact', async () => {
    const parts = await readZip(createZip(entries))
    expect(parts.has('word/média-☃.txt')).toBe(true)
    expect(decoder.decode(parts.get('word/média-☃.txt') as Uint8Array)).toBe('naïve ☃ payload')
  })

  it('round-trips an empty entry as zero bytes', async () => {
    const parts = await readZip(createZip(entries))
    expect((parts.get('empty.bin') as Uint8Array).length).toBe(0)
  })

  it('encodes string entries as UTF-8', async () => {
    const parts = await readZip(createZip([{ name: 'a.txt', data: 'é' }]))
    expect([...(parts.get('a.txt') as Uint8Array)]).toEqual([0xc3, 0xa9])
  })

  it('handles an archive with no entries', async () => {
    const parts = await readZip(createZip([]))
    expect(parts.size).toBe(0)
  })

  it('stores entries uncompressed, with the local signature first', () => {
    const archive = createZip([{ name: 'a.txt', data: 'hello' }])
    expect([...archive.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(decoder.decode(archive)).toContain('hello')
  })

  it('is deterministic: identical input yields identical bytes', () => {
    expect([...createZip(entries)]).toEqual([...createZip(entries)])
  })
})

describe('readZip of foreign archives', () => {
  it('inflates a deflated (method 8) entry', async () => {
    const payload = bytes('deflate me '.repeat(40))
    const stored = await deflateRaw(payload)
    expect(stored.length).toBeLessThan(payload.length)
    const archive = buildArchive([
      { name: 'plain.txt', method: 0, data: bytes('stored'), stored: bytes('stored') },
      { name: 'squished.txt', method: 8, data: payload, stored },
    ])
    const parts = await readZip(archive)
    expect(decoder.decode(parts.get('squished.txt') as Uint8Array)).toBe(decoder.decode(payload))
    expect(decoder.decode(parts.get('plain.txt') as Uint8Array)).toBe('stored')
  })

  it('inflates a deflated empty entry', async () => {
    const stored = await deflateRaw(new Uint8Array(0))
    const archive = buildArchive([
      { name: 'nothing.txt', method: 8, data: new Uint8Array(0), stored },
    ])
    const parts = await readZip(archive)
    expect((parts.get('nothing.txt') as Uint8Array).length).toBe(0)
  })

  it('finds the directory past a trailing archive comment', async () => {
    const archive = buildArchive([
      { name: 'a.txt', method: 0, data: bytes('one'), stored: bytes('one') },
    ])
    const withComment = new Uint8Array(archive.length + 5)
    withComment.set(archive, 0)
    withComment.set(bytes('hello'), archive.length)
    // Declare the comment length in the record that is now no longer last.
    withComment[archive.length - 2] = 5
    const parts = await readZip(withComment)
    expect(decoder.decode(parts.get('a.txt') as Uint8Array)).toBe('one')
  })
})

describe('readZip error handling', () => {
  it('rejects a buffer with no end-of-central-directory record', async () => {
    await expect(readZip(bytes('not a zip at all'))).rejects.toThrow(
      /end of central directory not found/,
    )
  })

  it('rejects an empty buffer', async () => {
    await expect(readZip(new Uint8Array(0))).rejects.toThrow(/Not a ZIP archive/)
  })

  it('rejects an archive truncated before its directory', async () => {
    const archive = createZip([{ name: 'a.txt', data: 'hello' }])
    await expect(readZip(archive.subarray(0, archive.length - 30))).rejects.toThrow(
      /end of central directory not found/,
    )
  })

  it('rejects an unsupported compression method', async () => {
    const archive = buildArchive([
      { name: 'lzma.bin', method: 14, data: bytes('x'), stored: bytes('x') },
    ])
    await expect(readZip(archive)).rejects.toThrow(/unsupported compression method 14/)
  })

  it('rejects an encrypted entry', async () => {
    const archive = buildArchive([
      { name: 'secret.txt', method: 0, data: bytes('x'), stored: bytes('x') },
    ])
    // Set general-purpose flag bit 0 in both the local and central records.
    archive[6] |= 1
    const eocd = archive.length - 22
    const dirOffset =
      archive[eocd + 16] |
      (archive[eocd + 17] << 8) |
      (archive[eocd + 18] << 16) |
      (archive[eocd + 19] << 24)
    archive[dirOffset + 8] |= 1
    await expect(readZip(archive)).rejects.toThrow(/is encrypted/)
  })

  it('rejects a ZIP64 directory', async () => {
    const archive = createZip([{ name: 'a.txt', data: 'hello' }])
    const eocd = archive.length - 22
    archive[eocd + 10] = 0xff
    archive[eocd + 11] = 0xff
    await expect(readZip(archive)).rejects.toThrow(/ZIP64 archives are not supported/)
  })

  it('rejects a corrupt central directory entry', async () => {
    const archive = createZip([{ name: 'a.txt', data: 'hello' }])
    const eocd = archive.length - 22
    const dirOffset =
      archive[eocd + 16] |
      (archive[eocd + 17] << 8) |
      (archive[eocd + 18] << 16) |
      (archive[eocd + 19] << 24)
    archive[dirOffset + 1] = 0x00
    await expect(readZip(archive)).rejects.toThrow(/bad central directory entry/)
  })

  it('rejects a local header that does not match the directory', async () => {
    const archive = createZip([{ name: 'a.txt', data: 'hello' }])
    archive[1] = 0x00
    await expect(readZip(archive)).rejects.toThrow(/bad local header for "a.txt"/)
  })
})
