import { describe, expect, it } from 'vitest'
import { embedProviderFor, hostnameOf, parseEmbedURL, safeEmbedSrc, safeMediaSrc } from '../src'

const YT = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'

describe('parseEmbedURL', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', YT],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL123', YT],
    ['https://youtu.be/dQw4w9WgXcQ', YT],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', YT],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', YT],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', YT],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', YT],
    ['youtube.com/watch?v=dQw4w9WgXcQ', YT],
  ])('recognises the YouTube URL %s', (url, src) => {
    expect(parseEmbedURL(url)).toEqual({ kind: 'youtube', src, id: 'dQw4w9WgXcQ' })
  })

  it('carries a start time through as ?start=seconds', () => {
    expect(parseEmbedURL('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90')?.src).toBe(
      `${YT}?start=90`,
    )
    expect(parseEmbedURL('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s')?.src).toBe(
      `${YT}?start=90`,
    )
    expect(parseEmbedURL('https://youtu.be/dQw4w9WgXcQ?t=1h2m3s')?.src).toBe(`${YT}?start=3723`)
  })

  it('rejects a YouTube URL whose id is malformed', () => {
    expect(parseEmbedURL('https://www.youtube.com/watch?v=<script>')).toBeNull()
    expect(parseEmbedURL('https://www.youtube.com/watch')).toBeNull()
  })

  it.each([
    ['https://vimeo.com/123456', 'https://player.vimeo.com/video/123456'],
    ['https://vimeo.com/channels/staffpicks/123456', 'https://player.vimeo.com/video/123456'],
    ['https://player.vimeo.com/video/123456', 'https://player.vimeo.com/video/123456'],
  ])('recognises the Vimeo URL %s', (url, src) => {
    expect(parseEmbedURL(url)).toEqual({ kind: 'vimeo', src, id: '123456' })
  })

  it.each([
    ['https://cdn.test/clip.mp4', 'video'],
    ['https://cdn.test/clip.WEBM?token=abc', 'video'],
    ['https://cdn.test/path/clip.mov', 'video'],
    ['https://cdn.test/song.mp3', 'audio'],
    ['https://cdn.test/song.flac#t=10', 'audio'],
    ['http://cdn.test/voice.m4a', 'audio'],
  ])('detects direct media at %s as %s', (url, kind) => {
    expect(parseEmbedURL(url)?.kind).toBe(kind)
  })

  it('treats an unknown https host as an iframe only when allowlisted', () => {
    expect(parseEmbedURL('https://maps.example.com/embed?q=x')).toBeNull()
    expect(
      parseEmbedURL('https://maps.example.com/embed?q=x', { allowIframeHosts: ['example.com'] }),
    ).toEqual({ kind: 'iframe', src: 'https://maps.example.com/embed?q=x' })
    expect(parseEmbedURL('https://anything.test/', { allowAnyIframe: true })?.kind).toBe('iframe')
  })

  it.each([
    '',
    '   ',
    'not a url',
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'ftp://files.test/a.mp4',
    'http://maps.example.com/embed',
    'https://',
  ])('returns null for %j without throwing', (url) => {
    expect(parseEmbedURL(url)).toBeNull()
  })

  it('returns null for non-string input', () => {
    expect(parseEmbedURL(undefined as unknown as string)).toBeNull()
    expect(parseEmbedURL(42 as unknown as string)).toBeNull()
  })
})

describe('safeEmbedSrc', () => {
  it('accepts the bundled players and nothing else by default', () => {
    expect(safeEmbedSrc('https://www.youtube.com/embed/x')).toBe('https://www.youtube.com/embed/x')
    expect(safeEmbedSrc('https://player.vimeo.com/video/1')).toBe(
      'https://player.vimeo.com/video/1',
    )
    expect(safeEmbedSrc('https://evil.test/')).toBeNull()
    expect(safeEmbedSrc('http://www.youtube.com/embed/x')).toBeNull()
  })

  it('matches allowlisted hosts exactly or as subdomains', () => {
    const options = { allowIframeHosts: ['example.com'] }
    expect(safeEmbedSrc('https://example.com/e', options)).toBe('https://example.com/e')
    expect(safeEmbedSrc('https://player.example.com/e', options)).toBe(
      'https://player.example.com/e',
    )
    expect(safeEmbedSrc('https://notexample.com/e', options)).toBeNull()
    expect(safeEmbedSrc('https://example.com.evil.test/e', options)).toBeNull()
  })

  it('refuses credentials and look-alike hosts', () => {
    expect(safeEmbedSrc('https://www.youtube.com@evil.test/embed/x')).toBeNull()
    expect(safeEmbedSrc('https://user:pw@www.youtube.com/embed/x')).toBeNull()
  })
})

describe('safeMediaSrc', () => {
  it('admits http(s), blob: and relative paths', () => {
    expect(safeMediaSrc('https://cdn.test/a.mp4')).toBe('https://cdn.test/a.mp4')
    expect(safeMediaSrc('blob:https://app.test/uuid')).toBe('blob:https://app.test/uuid')
    expect(safeMediaSrc('/media/a.mp4')).toBe('/media/a.mp4')
  })

  it('rejects javascript:, data: and other schemes', () => {
    expect(safeMediaSrc('javascript:alert(1)')).toBeNull()
    expect(safeMediaSrc('data:video/mp4;base64,AAAA')).toBeNull()
    expect(safeMediaSrc('ftp://files.test/a.mp4')).toBeNull()
    expect(safeMediaSrc(null)).toBeNull()
  })
})

describe('helpers', () => {
  it('names the provider of a source', () => {
    expect(embedProviderFor('https://www.youtube-nocookie.com/embed/x')).toBe('youtube')
    expect(embedProviderFor('https://player.vimeo.com/video/1')).toBe('vimeo')
    expect(embedProviderFor('https://maps.example.com/')).toBe('generic')
  })

  it('reads a hostname without www', () => {
    expect(hostnameOf('https://www.example.com/path')).toBe('example.com')
    expect(hostnameOf('garbage')).toBeNull()
  })
})
