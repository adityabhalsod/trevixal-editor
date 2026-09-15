# Media, attachments and link cards

`@trevixal/extension-embed`: video, audio, YouTube and Vimeo, allowlisted
iframes, file attachments and link preview cards.

```sh
npm install @trevixal/extension-embed
```

## Setting up

```ts
import { embedNodes, insertEmbed, attachments, DEFAULT_IFRAME_HOSTS } from '@trevixal/extension-embed'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...embedNodes({ allowIframeHosts: [...DEFAULT_IFRAME_HOSTS, 'player.example.com'] }) },
  marks: defaultMarks(),
})

// One command for a pasted URL: it works out what the URL is.
editor.exec(insertEmbed('https://www.youtube.com/watch?v=...'))

const files = attachments(editor, {
  storage: myFileStorage, // the same two-method shape as image storage
  onUpload: (status) => showProgress(status),
})
```

`embedUICommands()` gives `createEditorUI` the *Insert* entries for video,
audio, embeds, link cards and attachments.

## One allowlist, checked before the node exists

Every URL, whether pasted, typed or handed to a command, goes through
`safeEmbedSrc`, `safeMediaSrc` or `safeWebURL` before a node is created, so
the same rules vet pasted HTML and programmatic inserts alike. Credentials in
a URL are refused outright, and `https://youtube.com@evil.example/` is seen
for what it is: its hostname is `evil.example`.

## Exports and origins

A YouTube player will not start in a page opened from disk: a `file://` page
has no origin to send, and YouTube answers with its own error screen inside
the frame. `@trevixal/ui` replaces a YouTube frame with a link when the page
was not served over http(s). Vimeo and ordinary iframes were measured loading
from a local file perfectly well, so they are left alone.

## Commands

`insertVideo`, `insertAudio`, `insertIframe`, `insertLinkCard`,
`insertLinkCardFor`, `insertAttachment`, `insertEmbed`, `updateEmbedAttrs`,
`deleteEmbed`, `embedAtSelection`, plus `parseEmbedURL` and
`embedProviderFor` if you want to decide for yourself.
