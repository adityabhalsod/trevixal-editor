# Images

`@trevixal/extension-image`: drag-and-drop, paste and file-picker uploads to
whatever storage you use, with progress, cancellation, alignment, resizing,
cropping and compression.

```sh
npm install @trevixal/extension-image
```

## Setting up

```ts
import { Schema, createEditor, defaultNodes, defaultMarks } from '@trevixal/core'
import { image, imageNodes, createFetchStorage } from '@trevixal/extension-image'

const schema = new Schema({ nodes: { ...defaultNodes(), ...imageNodes() }, marks: defaultMarks() })
const editor = createEditor({ schema, element })

const images = image(editor, {
  storage: createFetchStorage({ endpoint: '/api/uploads' }),
  maxBytes: 5 * 1024 * 1024,
  accept: ['image/png', 'image/jpeg', 'image/webp'],
  compress: { maxDimension: 2048, quality: 0.85 }, // client-side, before upload; or false
  deleteOnRemove: true,
  onUpload: (status) => showProgress(status),      // uploading, then done or error
  onError: (message) => toast(message),
})

images.pickFiles() // open the OS file dialog
```

Dropping a file on the editor or pasting a screenshot runs the same pipeline
automatically: validate, insert a placeholder, upload, swap in the URL.

## Storage backends

The editor never talks to a storage provider directly. It holds an
`ImageStorage` and calls `upload`; the bundled adapters are ordinary
implementations of that interface.

| Adapter | Use it when |
| --- | --- |
| `createFetchStorage({ endpoint })` | You have your own upload API (multipart POST). Credentials stay on the server |
| `createS3PresignedStorage({ sign })` | Your server signs, the browser PUTs straight to S3, R2, GCS or Azure |
| `createDataURLStorage()` | Self-contained documents with no server at all |
| `createObjectURLStorage()` | Demos and drafts; nothing survives a reload |
| `createFallbackStorage([a, b])` | Try the CDN, fall back when it is unreachable |

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

## How uploads stay correct

An upload inserts a placeholder node carrying an `uploadId`, and the
controller finds it again **by that id, never by position**, so it survives
edits made while the bytes are in flight. A failed or cancelled upload removes
its placeholder, leaving the document exactly as it was.

## Commands and controls

`insertImage`, `updateImage`, `setImageAlign`, `resizeImage`,
`setImageWidth`, `setImageAlt`, `toggleImageCaption`, `setImageCaption`,
`removeImage`, plus `validateFile` to check a file before handing it over.
`transformImage` crops and rotates. `createImageResizeHandles` and
`createImageToolbar` add the on-canvas controls; the toolbar sizes its alt
field to the text it holds so a file name reads in full.

For the chrome, pass `images: { pickFiles, insertImage }` to `createEditorUI`
and the image button and dialog come alive.
