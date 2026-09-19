# @trevixal/extension-embed

<!-- generated: header -->

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/extension-embed.svg)](https://www.npmjs.com/package/@trevixal/extension-embed)
[![types](https://img.shields.io/npm/types/@trevixal/extension-embed.svg)](https://www.npmjs.com/package/@trevixal/extension-embed)
[![license](https://img.shields.io/npm/l/@trevixal/extension-embed.svg)](https://github.com/adityabhalsod/trevixal-editor/blob/main/LICENSE)

[Documentation](https://trevixal-editor.vercel.app) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](https://github.com/adityabhalsod/trevixal-editor/blob/main/packages/extension-embed/CHANGELOG.md) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

[![The Trevixal editor](https://trevixal-editor.vercel.app/media/editor.png)](https://trevixal-editor.vercel.app/full-editor)

## Features

- Video, audio, YouTube, Vimeo and iframe embeds
- File attachments and link preview cards
- **5.8 kB** minified and gzipped, with TypeScript types in the package

<!-- /generated: header -->

Media and links: video, audio, YouTube and Vimeo, allowlisted iframes, file
attachments and link preview cards.

```sh
npm install @trevixal/extension-embed
```

## Usage

Merge the nodes into your schema:

```ts
new Schema({ nodes: { ...defaultNodes(), ...embedNodes() }, marks: defaultMarks() })
```

```ts
import { insertEmbed, attachments, DEFAULT_IFRAME_HOSTS } from '@trevixal/extension-embed'

// One command for a pasted URL: it works out what the URL is.
editor.exec(insertEmbed('https://www.youtube.com/watch?v=…'))

const files = attachments(editor, {
  storage: myFileStorage,
  onUpload: (status) => showProgress(status),
})
```

`embedNodes({ allowIframeHosts: [...DEFAULT_IFRAME_HOSTS, 'player.example.com'] })`
widens the iframe allowlist.

## One allowlist, checked before the node exists

Every URL (pasted, typed, or handed to a command) goes through
`safeEmbedSrc`, `safeMediaSrc` or `safeWebURL` before a node is created, so
the same rules vet pasted HTML and programmatic inserts alike. Credentials in
a URL are refused outright, and `https://youtube.com@evil.example/` is seen
for what it is: its hostname is `evil.example`.

## Exports and origins

A YouTube player will not start in a page opened from disk. A `file://` page
has no origin to send, and YouTube answers with its own error screen inside
the frame. `@trevixal/ui` replaces a YouTube frame with a link when the page
was not served over http(s). Vimeo and ordinary iframes were measured loading
from a local file perfectly well, so they are left alone.

## Commands

`insertVideo`, `insertAudio`, `insertIframe`, `insertLinkCard`,
`insertLinkCardFor`, `insertAttachment`, `insertEmbed`, `updateEmbedAttrs`,
`deleteEmbed`, `embedAtSelection`, plus `parseEmbedURL` and `embedProviderFor`
if you want to decide for yourself.

## License

Apache-2.0
