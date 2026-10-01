import { safeHref, safeImageSrc } from '@trevixal/core'

/**
 * Options shared by the schema, the URL detector and the commands: which
 * third-party hosts an `<iframe>` may point at. They are captured once, when
 * the nodes are created, so the same allowlist vets pasted HTML, `insertEmbed`
 * and the rendered `src` alike. There is no path into the document that skips
 * the check.
 */
export interface EmbedNodesOptions {
  /**
   * Extra https hosts allowed as iframe sources, matched exactly or as any
   * subdomain (`example.com` also admits `player.example.com`).
   */
  readonly allowIframeHosts?: readonly string[]
  /**
   * Accept every https iframe source. Only for environments where authors are
   * trusted: an arbitrary frame can phish, fingerprint or autoplay audio.
   */
  readonly allowAnyIframe?: boolean
}

/** What a pasted URL turns into. */
export type EmbedKind = 'youtube' | 'vimeo' | 'video' | 'audio' | 'iframe'

export interface EmbedTarget {
  readonly kind: EmbedKind
  /** The URL to render: already normalised (YouTube → privacy-enhanced embed). */
  readonly src: string
  /** Provider video id, when the URL carried one. */
  readonly id?: string
  /** Whose player an `iframe` target is, for its `--provider` class. */
  readonly provider?: EmbedProvider
}

/** The class modifier an iframe embed renders with. */
export type EmbedProvider =
  | 'youtube'
  | 'vimeo'
  | 'twitter'
  | 'gist'
  | 'codepen'
  | 'codesandbox'
  | 'stackblitz'
  | 'figma'
  | 'maps'
  | 'spotify'
  | 'soundcloud'
  | 'loom'
  | 'generic'

/**
 * Hosts an iframe may always point at: the players the URL detector emits.
 * Each is the provider's own embed page, the one its Share ▸ Embed button
 * hands out, so nothing is fetched to find it.
 */
export const DEFAULT_IFRAME_HOSTS: readonly string[] = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'platform.twitter.com',
  'gist.github.com',
  'codepen.io',
  'codesandbox.io',
  'stackblitz.com',
  'www.figma.com',
  'maps.google.com',
  'open.spotify.com',
  'w.soundcloud.com',
  'www.loom.com',
]

/** A provider's player, found from a page URL of the provider's own. */
interface ProviderRule {
  readonly provider: Exclude<EmbedProvider, 'youtube' | 'vimeo' | 'generic'>
  readonly hosts: readonly string[]
  /** The embed page for `url`, or null when it is not one of the provider's pages that embeds. */
  readonly embed: (url: URL, segments: readonly string[]) => string | null
}

const SLUG = /^[\w-]+$/

/**
 * The providers beyond YouTube and Vimeo, as oEmbed describes them, each
 * resolved from its URL alone: the embed page every one of them publishes
 * sits at a fixed address from the page's own.
 */
const PROVIDER_RULES: readonly ProviderRule[] = [
  {
    // x.com/user/status/123, twitter.com/user/status/123.
    provider: 'twitter',
    hosts: ['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com', 'mobile.twitter.com'],
    embed: (_url, segments) => {
      const id = segments[1] === 'status' ? segments[2] : null
      return id && /^\d+$/.test(id)
        ? `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true`
        : null
    },
  },
  {
    provider: 'gist',
    hosts: ['gist.github.com'],
    embed: (_url, segments) => {
      const [user, id] = segments
      return user && id && SLUG.test(user) && /^[\da-f]+$/i.test(id)
        ? `https://gist.github.com/${user}/${id}.pibb`
        : null
    },
  },
  {
    provider: 'codepen',
    hosts: ['codepen.io'],
    embed: (_url, segments) => {
      const [user, kind, id] = segments
      return user && id && SLUG.test(user) && SLUG.test(id) && (kind === 'pen' || kind === 'embed')
        ? `https://codepen.io/${user}/embed/${id}?default-tab=result`
        : null
    },
  },
  {
    provider: 'codesandbox',
    hosts: ['codesandbox.io'],
    embed: (_url, segments) => {
      const id =
        segments[0] === 's' || segments[0] === 'embed'
          ? segments[1]
          : segments[0] === 'p' && segments[1] === 'sandbox'
            ? segments[2]
            : null
      return id && SLUG.test(id) ? `https://codesandbox.io/embed/${id}` : null
    },
  },
  {
    provider: 'stackblitz',
    hosts: ['stackblitz.com'],
    embed: (_url, segments) => {
      const id = segments[0] === 'edit' ? segments[1] : null
      return id && SLUG.test(id) ? `https://stackblitz.com/edit/${id}?embed=1` : null
    },
  },
  {
    provider: 'figma',
    hosts: ['www.figma.com', 'figma.com'],
    embed: (url, segments) =>
      ['file', 'design', 'proto', 'board'].includes(segments[0] ?? '') && segments[1]
        ? `https://www.figma.com/embed?embed_host=trevixal&url=${encodeURIComponent(url.href)}`
        : null,
  },
  {
    // google.com/maps/place/Name/@lat,lng, google.com/maps?q=…, maps.google.com/?q=….
    provider: 'maps',
    hosts: ['www.google.com', 'google.com', 'maps.google.com'],
    embed: (url, segments) => {
      if (url.hostname !== 'maps.google.com' && segments[0] !== 'maps') return null
      const place = segments[1] === 'place' ? segments[2] : null
      const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url.pathname)
      const query =
        url.searchParams.get('q') ??
        (place ? decodeURIComponent(place).replace(/\+/g, ' ') : null) ??
        (at ? `${at[1]},${at[2]}` : null)
      return query
        ? `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`
        : null
    },
  },
  {
    provider: 'spotify',
    hosts: ['open.spotify.com'],
    embed: (_url, segments) => {
      const [kind, id] = segments[0] === 'embed' ? segments.slice(1) : segments
      const kinds = ['track', 'album', 'playlist', 'episode', 'show', 'artist']
      return kind && id && kinds.includes(kind) && /^[A-Za-z0-9]+$/.test(id)
        ? `https://open.spotify.com/embed/${kind}/${id}`
        : null
    },
  },
  {
    provider: 'soundcloud',
    hosts: ['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'],
    embed: (_url, segments) =>
      segments.length >= 2 && segments.every((segment) => SLUG.test(segment))
        ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(
            `https://soundcloud.com/${segments.join('/')}`,
          )}`
        : null,
  },
  {
    provider: 'loom',
    hosts: ['www.loom.com', 'loom.com'],
    embed: (_url, segments) => {
      const id = segments[0] === 'share' || segments[0] === 'embed' ? segments[1] : null
      return id && /^[\da-f]+$/i.test(id) ? `https://www.loom.com/embed/${id}` : null
    },
  },
]

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
])
const YOUTUBE_SHORT_HOST = 'youtu.be'
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'])
/** YouTube ids are exactly eleven URL-safe base64 characters. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const VIMEO_ID = /^\d+$/
/** Path segments that are followed by the video id. */
const YOUTUBE_ID_PATHS = new Set(['shorts', 'embed', 'live', 'v'])

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogv', 'mov', 'm4v'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac'])

/**
 * A `<video>`/`<audio>` source: http(s), `blob:` (what the upload adapters
 * hand back) or a relative path. `data:` is refused even though it cannot
 * execute, a document should not carry megabytes of inlined media, bar a
 * base64 `data:audio/` recording; so is every other scheme, `javascript:`
 * first among them.
 */
export function safeMediaSrc(src: unknown): string | null {
  if (typeof src !== 'string') return null
  const trimmed = src.trim()
  // The one inlined media: a recording made with no server to keep it, a
  // voice memo's worth of audio rather than a film.
  if (/^data:audio\/[\w.+-]+(?:;[\w=-]+)*;base64,[A-Za-z0-9+/=]*$/i.test(trimmed)) return trimmed
  // safeImageSrc is the one core sanitizer that admits blob: (and rejects
  // control characters); it is only consulted for that scheme.
  if (/^blob:/i.test(trimmed)) return safeImageSrc(trimmed)
  const href = safeHref(trimmed)
  if (!href) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^https?:/i.test(href)) return null
  return href
}

/**
 * An `<iframe>` source the document may carry: https only, on a known player
 * host or one the integrator allowlisted. Returns the normalised URL or null.
 * This is the single gate for frames. The HTML parser lets `<iframe>`
 * through only because the schema declares a rule for it, and that rule
 * defers to this function.
 */
export function safeEmbedSrc(src: unknown, options: EmbedNodesOptions = {}): string | null {
  if (typeof src !== 'string') return null
  const url = parseURL(src.trim())
  if (!url || url.protocol !== 'https:') return null
  // `https://youtube.com@evil.example/` has hostname evil.example, so the
  // allowlist already sees through it; credentials are refused anyway since
  // no embed provider needs them.
  if (url.username || url.password) return null
  const host = url.hostname.toLowerCase()
  if (options.allowAnyIframe) return url.href
  if (DEFAULT_IFRAME_HOSTS.includes(host)) return url.href
  for (const allowed of options.allowIframeHosts ?? []) {
    if (hostMatches(host, allowed)) return url.href
  }
  return null
}

/** An absolute http(s) URL, normalised, for link cards, which show a hostname. */
export function safeWebURL(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const url = parseURL(value.trim())
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null
  return safeHref(url.href)
}

/** The hostname of an absolute URL, without a leading `www.`; null otherwise. */
export function hostnameOf(url: string): string | null {
  const parsed = parseURL(url)
  if (!parsed || !parsed.hostname) return null
  return parsed.hostname.replace(/^www\./, '')
}

/** Which player an iframe source belongs to, for the `--provider` class. */
export function embedProviderFor(src: string): EmbedProvider {
  const url = parseURL(src)
  const host = url?.hostname.toLowerCase() ?? ''
  if (YOUTUBE_HOSTS.has(host) || host === YOUTUBE_SHORT_HOST) return 'youtube'
  if (VIMEO_HOSTS.has(host)) return 'vimeo'
  const embedHosts: Readonly<Record<string, EmbedProvider>> = {
    'platform.twitter.com': 'twitter',
    'gist.github.com': 'gist',
    'codepen.io': 'codepen',
    'codesandbox.io': 'codesandbox',
    'stackblitz.com': 'stackblitz',
    'www.figma.com': 'figma',
    'maps.google.com': 'maps',
    'open.spotify.com': 'spotify',
    'w.soundcloud.com': 'soundcloud',
    'www.loom.com': 'loom',
  }
  return embedHosts[host] ?? 'generic'
}

/** The provider player a page URL embeds as, when a provider rule knows the page. */
function providerTarget(url: URL, host: string): EmbedTarget | null {
  const segments = url.pathname.split('/').filter(Boolean)
  for (const rule of PROVIDER_RULES) {
    if (!rule.hosts.includes(host)) continue
    const src = rule.embed(url, segments)
    if (src) return { kind: 'iframe', src, provider: rule.provider }
  }
  return null
}

/**
 * Recognise what a URL points at so one "paste a link" action can produce the
 * right node: a YouTube or Vimeo player, a direct video/audio file, or: when
 * the host is allowlisted, a generic iframe. Anything else, including garbage
 * and `javascript:` URLs, yields null rather than throwing.
 */
export function parseEmbedURL(url: string, options: EmbedNodesOptions = {}): EmbedTarget | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  // "youtube.com/watch?v=…" without a scheme is what people type by hand.
  const parsed =
    parseURL(trimmed) ?? (looksLikeBareHost(trimmed) ? parseURL(`https://${trimmed}`) : null)
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) return null
  const host = parsed.hostname.toLowerCase()
  const target =
    youtubeTarget(parsed, host) ??
    vimeoTarget(parsed, host) ??
    providerTarget(parsed, host) ??
    mediaTarget(parsed)
  if (target) return target
  // A player host that produced no target means the URL looked like one of
  // its videos and was not. A malformed id, or a page that is not a video.
  // Framing it anyway would embed a YouTube search results page, so it is
  // rejected rather than falling through to the generic iframe path.
  if (YOUTUBE_HOSTS.has(host) || host === YOUTUBE_SHORT_HOST || VIMEO_HOSTS.has(host)) return null
  // The same for the other providers: a profile or a search is not a player.
  if (PROVIDER_RULES.some((rule) => rule.hosts.includes(host))) return null
  const iframe = safeEmbedSrc(parsed.href, options)
  return iframe ? { kind: 'iframe', src: iframe } : null
}

function youtubeTarget(url: URL, host: string): EmbedTarget | null {
  const segments = url.pathname.split('/').filter(Boolean)
  let id: string | null = null
  if (host === YOUTUBE_SHORT_HOST) {
    id = segments[0] ?? null
  } else if (YOUTUBE_HOSTS.has(host)) {
    const first = segments[0] ?? ''
    if (first === 'watch') id = url.searchParams.get('v')
    else if (YOUTUBE_ID_PATHS.has(first)) id = segments[1] ?? null
  } else {
    return null
  }
  if (!id || !YOUTUBE_ID.test(id)) return null
  const start = parseStart(
    url.searchParams.get('t') ?? url.searchParams.get('start') ?? hashParam(url.hash, 't'),
  )
  const query = start ? `?start=${start}` : ''
  // The nocookie host serves the same player without setting tracking
  // cookies until the visitor presses play.
  return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}${query}`, id }
}

function vimeoTarget(url: URL, host: string): EmbedTarget | null {
  if (!VIMEO_HOSTS.has(host)) return null
  const segments = url.pathname.split('/').filter(Boolean)
  // vimeo.com/123, vimeo.com/channels/x/123, player.vimeo.com/video/123.
  // The id is the last all-digit segment wherever the page nests it.
  let index = -1
  for (let i = segments.length - 1; i >= 0; i--) {
    if (VIMEO_ID.test(segments[i] as string)) {
      index = i
      break
    }
  }
  if (index < 0) return null
  const id = segments[index] as string
  // Unlisted videos carry a hash, either as a trailing segment or `?h=`.
  const unlisted = segments[index + 1] ?? url.searchParams.get('h')
  const query = unlisted && /^[a-z0-9]+$/i.test(unlisted) ? `?h=${unlisted}` : ''
  return { kind: 'vimeo', src: `https://player.vimeo.com/video/${id}${query}`, id }
}

function mediaTarget(url: URL): EmbedTarget | null {
  const extension = /\.([a-z0-9]+)$/i.exec(url.pathname)?.[1]?.toLowerCase()
  if (!extension) return null
  const src = safeMediaSrc(url.href)
  if (!src) return null
  if (VIDEO_EXTENSIONS.has(extension)) return { kind: 'video', src }
  if (AUDIO_EXTENSIONS.has(extension)) return { kind: 'audio', src }
  return null
}

/** `90`, `90s`, `1m30s`, `1h2m3s` → seconds; null when absent or zero. */
function parseStart(value: string | null): number | null {
  if (!value) return null
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value.trim())
  if (!match || match[0] === '') return null
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
  return seconds > 0 ? seconds : null
}

function hashParam(hash: string, name: string): string | null {
  const match = new RegExp(`(?:^#|[&?])${name}=([^&]+)`).exec(hash)
  return match?.[1] ?? null
}

function hostMatches(host: string, allowed: string): boolean {
  const pattern = allowed.trim().toLowerCase().replace(/^\*\./, '')
  if (!pattern) return false
  return host === pattern || host.endsWith(`.${pattern}`)
}

function looksLikeBareHost(value: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(?::\d+)?(?:[/?#]|$)/i.test(value)
}

function parseURL(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}
