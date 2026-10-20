/**
 * Whether a document can be trusted: its digital signature and whether the
 * text still is what was signed, the audit log of who changed it, and a
 * passkey that unlocks it beside its password.
 */
import type { Editor } from '@trevixal/core'
import {
  type AuditEntry,
  PasskeyError,
  type PasskeyRecord,
  type SignatureStatus,
  createAuditLog,
  createSigningKeys,
  passkeysAvailable,
  registerPasskey,
  setDocumentSignature,
  signDocument,
  verifyDocument,
  verifyPasskey,
} from '@trevixal/extension-security'
import { openFindingsReport } from '@trevixal/extension-writing'
import { downloadFile, openDialog } from '@trevixal/ui'
import { loadSigningKeys, saveSigningKeys } from './key-store'
import type { FullEditorLayout } from './layout'

/** How long after an edit the signature is checked again. */
const VERIFY_DELAY_MS = 400

export interface DocumentTrustContext {
  readonly editor: Editor
  readonly layout: FullEditorLayout
  /** The prefix everything it keeps in storage goes under. */
  readonly namespace: string
  /** Whose name goes on a signature and on each audit entry. */
  readonly author: string
  /** Whether the document has a password a passkey can stand beside. */
  readonly isProtected: () => boolean
}

export interface DocumentTrust {
  signDocument(): Promise<void>
  showAuditLog(): Promise<void>
  addPasskey(): Promise<void>
  /** The check a lock screen offers beside the password, when a passkey is registered. */
  passkey(): (() => Promise<boolean>) | undefined
  destroy(): void
}

/** The signature, in words, for the status line. */
export function describeSignature(status: SignatureStatus): string {
  if (status.state === 'unsigned') return ''
  if (status.state === 'invalid') return 'The signature on this document does not check out'
  const when = new Date(status.signedAt).toLocaleDateString()
  return status.state === 'valid'
    ? `Signed by ${status.signer} on ${when} · key ${status.key}`
    : `Changed since ${status.signer} signed it on ${when}`
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the log and the passkey last as long as the page.
  }
}

export function createDocumentTrust(context: DocumentTrustContext): DocumentTrust {
  const { editor, layout, namespace, author } = context
  const auditKey = `${namespace}:audit`
  const passkeyKey = `${namespace}:passkey`
  const report = (message: string): void => {
    layout.security.textContent = message
    layout.security.hidden = message === ''
  }

  const audit = createAuditLog(editor, {
    author: () => author,
    entries: readJSON<AuditEntry[]>(auditKey) ?? [],
    onChange: (entries) => writeJSON(auditKey, entries),
  })

  // The signature is checked as the document opens, and again after each edit.
  let timer: ReturnType<typeof setTimeout> | undefined
  let shown = ''
  const check = async (): Promise<void> => {
    const message = describeSignature(await verifyDocument(editor.state.doc))
    if (message !== shown) {
      shown = message
      if (message) report(message)
    }
  }
  const stopChecking = editor.on('update', () => {
    clearTimeout(timer)
    timer = setTimeout(() => void check(), VERIFY_DELAY_MS)
  })
  void check()

  const when = (time: number): string =>
    new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

  return {
    async signDocument() {
      const values = await openDialog({
        document,
        title: 'Sign document',
        submitLabel: 'Sign',
        body: 'The signature covers the document as it is now; any later change shows. It is made with a key kept in this browser.',
        fields: [
          { name: 'signer', label: 'Signed by', type: 'text', value: author, required: true },
        ],
      })
      editor.view?.focus()
      if (!values?.signer) return
      let keys = await loadSigningKeys(namespace)
      if (!keys) {
        keys = await createSigningKeys()
        await saveSigningKeys(namespace, keys)
      }
      editor.exec(setDocumentSignature(await signDocument(editor.state.doc, keys, values.signer)))
      await check()
    },
    async showAuditLog() {
      const entries = [...audit.entries()].reverse()
      await openFindingsReport(document, {
        title: 'Audit log',
        empty: 'No edits recorded yet.',
        findings: entries.map((entry) => ({
          heading: `${entry.author} · ${when(entry.start)}${entry.end > entry.start ? ` – ${when(entry.end)}` : ''}`,
          message: [
            entry.inserted > 0 ? `${entry.inserted} characters in` : '',
            entry.deleted > 0 ? `${entry.deleted} out` : '',
            entry.formatted ? 'formatting' : '',
          ]
            .filter(Boolean)
            .join(', ')
            .concat(entry.where ? `, in “${entry.where}”` : ''),
        })),
        actions: [
          {
            label: 'Download CSV',
            run: () =>
              downloadFile(document, {
                name: 'audit-log.csv',
                mime: 'text/csv',
                data: audit.toCSV(),
              }),
          },
        ],
      })
      editor.view?.focus()
    },
    async addPasskey() {
      if (!context.isProtected()) {
        report(
          'Protect the document with a password first: a passkey unlocks it beside the password',
        )
        return
      }
      if (!passkeysAvailable(window)) {
        report('This browser cannot use passkeys')
        return
      }
      try {
        writeJSON(passkeyKey, await registerPasskey(window, author))
        report('A passkey can now unlock this document, beside its password')
      } catch (error) {
        report(
          error instanceof PasskeyError
            ? error.message
            : 'No passkey was made: it was cancelled or refused',
        )
      }
    },
    passkey() {
      const record = readJSON<PasskeyRecord>(passkeyKey)
      return record ? () => verifyPasskey(window, record) : undefined
    },
    destroy() {
      clearTimeout(timer)
      stopChecking()
      audit.destroy()
    },
  }
}
