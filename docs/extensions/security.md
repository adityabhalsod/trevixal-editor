# Encryption, expiry and restrictions

`@trevixal/extension-security`: password-encrypted documents, expiry, an
encrypted storage wrapper, and copy and print restrictions.

```sh
npm install @trevixal/extension-security
```

## Encrypting a document

```ts
import { encryptDocument, decryptDocument, WrongPasswordError, DocumentExpiredError } from '@trevixal/extension-security'

const envelope = await encryptDocument(editor.getJSON(), password, {
  expiresAt: Date.now() + 7 * 864e5,
})

try {
  const { payload } = await decryptDocument(envelope, password)
  editor.setContent(payload)
} catch (error) {
  if (error instanceof WrongPasswordError) askAgain()
  if (error instanceof DocumentExpiredError) explain()
}
```

The envelope is plain JSON (`{ format: 'trevixal-encrypted', version, kdf,
iterations, salt, iv, cipher, data, expiresAt }`), so it stores and travels
like any other document. The key is stretched with PBKDF2-SHA256 (310,000
rounds by default) and the content sealed with AES-GCM, both through the
browser's own WebCrypto. There is no cipher code here to audit or keep
current, which is the point.

The iteration count travels *in* the envelope, so a ceiling of ten million is
enforced on what one may ask for: without it, a hostile file could ask for a
number that hangs the tab. On a page without WebCrypto (an insecure origin,
say) the calls raise `UnsupportedEnvironmentError` from `@trevixal/core`, so
a host can say "this browser cannot do that" rather than "that file is
broken".

## An encrypted key-value store

```ts
import { createEncryptedStorage, createWebStorage } from '@trevixal/extension-security'

const vault = createEncryptedStorage(createWebStorage(localStorage, 'app:'), password)
```

A drop-in `KeyValueStorage`, so autosave and the document workspace can write
through it unchanged and a draft on disk is unreadable without the password.
The password may be an async getter, for hosts that prompt lazily.

## Restrictions

```ts
import { applyRestrictions, restrictionsAllow } from '@trevixal/extension-security'

const release = applyRestrictions(
  editor,
  { copy: true, print: true },
  { onBlocked: (action) => say(`${action} is blocked`) },
)
```

`copy`, `cut`, `paste`, `print`, `download` and `contextMenu`. Print also
swallows the shortcut, reports `beforeprint` as blocked, and injects a
print-media rule that blanks the surface if the dialog is opened another way.

These keep an honest user honest. They are not a confidentiality control:
anything rendered in a browser can be read out of it, and they should not be
sold as one.

## Expiry

`isExpired(expiresAt)` and `describeExpiry(expiresAt)`. The description rounds
**down**: forty-five days reads as "in 1 month", never "in 2 months". This
string tells someone when a document stops opening, and the failure mode of
overstating it is losing access while believing there was time.
