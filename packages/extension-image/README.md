# @trevixal/extension-image

<!-- generated: header -->

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/extension-image.svg)](https://www.npmjs.com/package/@trevixal/extension-image)
[![types](https://img.shields.io/npm/types/@trevixal/extension-image.svg)](https://www.npmjs.com/package/@trevixal/extension-image)
[![license](https://img.shields.io/npm/l/@trevixal/extension-image.svg)](https://github.com/adityabhalsod/trevixal-editor/blob/main/LICENSE)

[Documentation](https://trevixal-editor.vercel.app) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](https://github.com/adityabhalsod/trevixal-editor/blob/main/packages/extension-image/CHANGELOG.md) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

[![The Trevixal editor](https://trevixal-editor.vercel.app/media/editor.png)](https://trevixal-editor.vercel.app/full-editor)

## Features

- Pluggable storage: a fetch endpoint, a data URL, or your own backend
- Drag-and-drop and paste upload, with resize, alignment and captions
- **9.8 kB** minified and gzipped, with TypeScript types in the package

<!-- /generated: header -->

Images for the [Trevixal editor](https://github.com/adityabhalsod/trevixal-editor/blob/main/README.md): drag-and-drop, paste and
file-picker uploads to **whatever storage you use**, with progress,
cancellation, alignment and resizing.

```sh
npm install @trevixal/extension-image
```

## Usage

```ts
import { Schema, createEditor, defaultNodes, defaultMarks } from '@trevixal/core'
import { image, imageNodes, createFetchStorage } from '@trevixal/extension-image'

const schema = new Schema({
  nodes: { ...defaultNodes(), ...imageNodes() },
  marks: defaultMarks(),
})

const editor = createEditor({ schema, element })

const images = image(editor, {
  storage: createFetchStorage({ endpoint: '/api/uploads' }),
  maxBytes: 5 * 1024 * 1024,
  accept: ['image/png', 'image/jpeg', 'image/webp'],
  onUpload: (status) => showProgress(status),
  onError: (message) => toast(message),
})

images.pickFiles()   // open the OS file dialog
```

Dropping a file on the editor or pasting a screenshot runs the same pipeline
automatically.

## Storage backends

The editor holds an `ImageStorage` and calls `upload`; the bundled adapters
are ordinary implementations of that interface, not special cases.

| Adapter | Use it when |
| --- | --- |
| `createFetchStorage({ endpoint })` | You have your own upload API (multipart POST). Credentials stay on the server. |
| `createS3PresignedStorage({ sign })` | Your server signs, the browser PUTs straight to S3/R2/GCS/Azure. |
| `createDataURLStorage()` | Self-contained documents with no server at all. |
| `createObjectURLStorage()` | Demos and drafts; nothing survives a reload. |
| `createFallbackStorage([a, b])` | Try the CDN, fall back when it is unreachable. |

Anything else is a two-method object:

```ts
const myStorage: ImageStorage = {
  async upload(file, { onProgress, signal }) {
    const url = await myClient.put(file, { onProgress, signal })
    return { url, key: file.name }
  },
  async delete({ key }) {
    if (key) await myClient.remove(key)
  },
}
```

Set `deleteOnRemove: true` to call `delete` when an image leaves the document.

## How uploads stay correct

An upload inserts a placeholder node carrying an `uploadId`, and the
controller finds it again **by that id, never by position**, so it survives
edits made while the bytes are in flight. A failed or cancelled upload
removes its placeholder, leaving the document exactly as it was.

## Commands

`insertImage`, `updateImage`, `setImageAlign`, `resizeImage`, `deleteImage`,
plus `validateFile` if you want to check a file before handing it over.

## License

Apache-2.0
