# @trevixal/extension-image

Images for the [Trevixal editor](../../README.md): drag-and-drop, paste and
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
