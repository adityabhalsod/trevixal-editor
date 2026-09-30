// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { embedProviderFor, parseEmbedURL, safeEmbedSrc } from '../src/url'

describe('embed providers beyond YouTube and Vimeo', () => {
  it.each([
    [
      'https://x.com/trevixal/status/1790000000000000000',
      'https://platform.twitter.com/embed/Tweet.html?id=1790000000000000000&dnt=true',
      'twitter',
    ],
    [
      'https://twitter.com/trevixal/status/12345',
      'https://platform.twitter.com/embed/Tweet.html?id=12345&dnt=true',
      'twitter',
    ],
    [
      'https://gist.github.com/octocat/6cad326836d38bd3a7ae',
      'https://gist.github.com/octocat/6cad326836d38bd3a7ae.pibb',
      'gist',
    ],
    [
      'https://codepen.io/team/pen/abcXYZ',
      'https://codepen.io/team/embed/abcXYZ?default-tab=result',
      'codepen',
    ],
    ['https://codesandbox.io/s/new-abc12', 'https://codesandbox.io/embed/new-abc12', 'codesandbox'],
    [
      'https://codesandbox.io/p/sandbox/react-xyz9',
      'https://codesandbox.io/embed/react-xyz9',
      'codesandbox',
    ],
    [
      'https://stackblitz.com/edit/vitejs-vite-abc',
      'https://stackblitz.com/edit/vitejs-vite-abc?embed=1',
      'stackblitz',
    ],
    [
      'https://www.figma.com/design/AbC123/Launch',
      `https://www.figma.com/embed?embed_host=trevixal&url=${encodeURIComponent('https://www.figma.com/design/AbC123/Launch')}`,
      'figma',
    ],
    [
      'https://www.google.com/maps/place/Riverside+Hall/@51.5,-0.12,15z',
      'https://maps.google.com/maps?q=Riverside%20Hall&output=embed',
      'maps',
    ],
    [
      'https://www.google.com/maps?q=Big+Ben',
      'https://maps.google.com/maps?q=Big%20Ben&output=embed',
      'maps',
    ],
    [
      'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
      'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC',
      'spotify',
    ],
    [
      'https://soundcloud.com/artist/a-track',
      `https://w.soundcloud.com/player/?url=${encodeURIComponent('https://soundcloud.com/artist/a-track')}`,
      'soundcloud',
    ],
    [
      'https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184',
      'https://www.loom.com/embed/0281766fa2d04bb788eaf19e65135184',
      'loom',
    ],
  ])('%s embeds as its player', (url, src, provider) => {
    expect(parseEmbedURL(url)).toEqual({ kind: 'iframe', src, provider })
    // The player is on the default allowlist, and names its provider.
    expect(safeEmbedSrc(src)).toBe(src)
    expect(embedProviderFor(src)).toBe(provider)
  })

  it.each([
    'https://x.com/trevixal',
    'https://gist.github.com/octocat',
    'https://codepen.io/team',
    'https://open.spotify.com/user/abc',
    'https://www.google.com/search?q=maps',
  ])('%s is not a page that embeds', (url) => {
    expect(parseEmbedURL(url)).toBeNull()
  })
})
