# Encryption, expiry and restrictions

`@trevixal/extension-security`: password-encrypted documents, expiry, an
encrypted storage wrapper, copy and print restrictions, redaction, locked
sections and an inactivity timer.

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

## Redaction

```ts
import {
  protectRedactionsOnCopy,
  redactDocument,
  redactionMarks,
  toggleRedaction,
} from '@trevixal/extension-security'

const schema = new Schema({ nodes, marks: { ...defaultMarks(), ...redactionMarks() } })
editor.exec(toggleRedaction)
const release = protectRedactionsOnCopy(editor)
const readerCopy = redactDocument(editor.state.doc)
```

`redactionMarks()` adds the `redaction` mark, a `span.trevixal-redacted`.
`redactDocument(doc)` replaces each run of redacted text with the fixed
stand-in `REDACTED` (`█████`). The mark stays on it, so the bar still shows.
Pass it as the `transform` of `exportDocument` or `printDocument` from
`@trevixal/ui`, and a file or a page carries nothing of the words.

`protectRedactionsOnCopy` makes copy, cut and drag write the stand-in to
every clipboard type, Trevixal's own JSON included. It reads the selection
before the editor's handler runs, since a cut deletes it. It then writes after
that handler, over what it put there. A restriction that blocks copying stops
the event before either, so nothing lands.

## Locked sections

```ts
import {
  enableSectionLocks,
  lockSection,
  lockedSectionNodes,
  lockedSections,
  unlockSection,
} from '@trevixal/extension-security'

const release = enableSectionLocks(editor, { onBlocked: () => say('That section is locked') })
editor.exec(lockSection)
editor.exec(unlockSection(lockedSections(editor.state.doc)[0].path))
```

`lockedSectionNodes()` adds `lockedSection`, a `section` that is
`contenteditable="false"` on the page. `enableSectionLocks` is a dispatch
transform that cancels any transaction changing a locked section. A section
may move, but it must come out of each edit exactly as it went in.

Two kinds of transaction pass: `unlockSection`, which carries
`SECTION_LOCK_META`, and one kept out of the history, such as loading another
document. Register it before transforms that keep derived content current,
such as fields and formulas. It then judges the edit alone, and their updates
inside a section still land.

## Locking after inactivity

```ts
import { watchInactivity } from '@trevixal/extension-security'

const stop = watchInactivity(document, 10 * 60_000, () => showLockScreen())
```

It calls back once there has been no key, pointer, wheel or touch event for
the given time. Each event starts the wait again. The assembled editor uses it
to lock a password-protected document behind its password.

## Digital signatures

```ts
import {
  createSigningKeys,
  setDocumentSignature,
  signDocument,
  verifyDocument,
} from '@trevixal/extension-security'

const keys = await createSigningKeys()                     // ECDSA P-256, private half not extractable
editor.exec(setDocumentSignature(await signDocument(editor.state.doc, keys, 'Ada')))
const status = await verifyDocument(editor.state.doc)
// { state: 'valid' | 'changed', signer, signedAt, key } | { state: 'unsigned' } | { state: 'invalid' }
```

`documentDigest(doc)` is the SHA-256 the signature covers: the document with
its settings as they differ from the defaults, and without the signature. The
signature itself is a document setting, `signature`, written as
`data-signature`. `keyFingerprint(publicKey)` gives the short form a person
can compare.

## Audit log

```ts
import { createAuditLog } from '@trevixal/extension-security'

const log = createAuditLog(editor, {
  author: () => currentUser,
  entries: stored,                      // carried over from before
  onChange: (entries) => save(entries),
})
log.toCSV()
```

Each entry has `author`, `start`, `end`, `inserted`, `deleted`, `formatted`
and `where`. Edits by one person within a minute of each other are one entry,
and a transaction kept out of the history, such as loading a document, is
not logged.

## Passkeys

```ts
import { passkeysAvailable, registerPasskey, verifyPasskey } from '@trevixal/extension-security'

const record = await registerPasskey(window, 'Ada') // { credentialId, publicKey }: nothing secret
const ok = await verifyPasskey(window, record)
```

`verifyPasskey` asks the authenticator to sign a fresh challenge. It then
checks, in the page, that the client data names this origin and that
challenge, that the user was verified, and that the ES256 signature checks
out against the registered key. `derToRaw` turns the DER signature into the
raw form WebCrypto verifies.

## Expiry

`isExpired(expiresAt)` and `describeExpiry(expiresAt)`. The description rounds
**down**: forty-five days reads as "in 1 month", never "in 2 months". This
string tells someone when a document stops opening, and the failure mode of
overstating it is losing access while believing there was time.
