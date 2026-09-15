import type { Editor } from '@trevixal/core'
import {
  DocumentExpiredError,
  type DocumentRestrictions,
  WrongPasswordError,
  applyRestrictions,
  decryptDocument,
  describeExpiry,
  encryptDocument,
  isEncryptedEnvelope,
  restrictionsAllow,
  serializeEnvelope,
} from '@trevixal/extension-security'
import {
  collectDocumentCSS,
  documentTitle,
  downloadFile,
  openInfoDialog,
  openPrintPreview,
  printDocument,
  suggestFileName,
} from '@trevixal/ui'
import { type Protection, askPassword, askProtection, askRestrictions } from './features'
import type { Saving } from './features'
import type { FullEditorLayout } from './layout'

/** What protecting, unlocking and printing a document needs from the mount. */
export interface DocumentSecurityContext {
  readonly editor: Editor
  readonly layout: FullEditorLayout
  readonly saving: Saving
}

/** Everything the menus drive from File ▸ Protect, Restrict and Print. */
export interface DocumentSecurity {
  describeProtection(): string
  protectDocument(): Promise<void>
  downloadEncrypted(): Promise<void>
  openEncrypted(file: File): Promise<boolean>
  editRestrictions(): Promise<void>
  print(preview: boolean): void
  /** Say something in the status line's security slot. */
  report(message: string): void
  /** Whether the current restrictions permit an action such as `download`. */
  allows(action: keyof DocumentRestrictions): boolean
  /** Drop the restriction listeners; called from the mount's own teardown. */
  release(): void
}

/**
 * Password protection, restrictions, expiry and printing, together.
 *
 * One unit because they share one piece of state, the password the document
 * is currently under, and because printing has to ask the restrictions
 * whether it is allowed before it opens a window. Nothing here is persisted:
 * a reload starts unprotected.
 */
export function createDocumentSecurity(context: DocumentSecurityContext): DocumentSecurity {
  const { editor, layout, saving } = context
  /** Nothing here is persisted: a reload starts unprotected, as a demo should. */
  let protection: Protection = { password: null, expiresAt: null }
  let restrictions: DocumentRestrictions = {}
  let releaseRestrictions: (() => void) | null = null

  /** One line in the status bar for anything the security layer needs to say. */
  function reportSecurity(message: string): void {
    const host = layout.security
    host.textContent = message
    host.hidden = message.length === 0
  }

  /** The standing description: whether the document is protected, and until when. */
  function describeProtection(): string {
    if (!protection.password) return ''
    return protection.expiresAt === null
      ? 'Password-protected'
      : `Password-protected: expires ${describeExpiry(protection.expiresAt)}`
  }

  /**
   * Set, change or lift the password. Setting one re-writes the draft and every
   * rolling backup through the encrypted store before this returns, so nothing
   * the user has already typed is left readable; the flush then catches an edit
   * still sitting in the debounce window. The editor takes focus back because
   * the dialog took it, and typing into nothing after protecting a document
   * reads as the feature having broken the page.
   */
  async function protectDocument(): Promise<void> {
    const next = await askProtection(protection)
    if (!next) return
    protection = next
    await saving.protect(next.password)
    await saving.autosave.flush()
    editor.view?.focus()
    reportSecurity(next.password ? describeProtection() : 'Password protection removed')
  }

  /** Write the document as a `.tvx` envelope, asking for a password if there is none yet. */
  async function downloadEncrypted(): Promise<void> {
    if (!protection.password) {
      await protectDocument()
      if (!protection.password) return
    }
    const title = documentTitle(editor.state.doc)
    const envelope = await encryptDocument(editor.getJSON(), protection.password, {
      expiresAt: protection.expiresAt,
      title,
    })
    downloadFile(document, {
      name: suggestFileName(title, 'tvx'),
      mime: 'application/json',
      data: serializeEnvelope(envelope),
    })
    reportSecurity(describeProtection())
  }

  /**
   * Recognise an encrypted file and open it. Returns true once the file was an
   * envelope, opened or refused, so the caller stops looking for an importer.
   */
  async function openEncrypted(file: File): Promise<boolean> {
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      return false // not JSON at all, so certainly not an envelope
    }
    if (!isEncryptedEnvelope(parsed)) return false
    const password = await askPassword(parsed.title ?? file.name)
    if (password === null) return true
    try {
      const opened = await decryptDocument(parsed, password)
      editor.setContent(opened.payload as Parameters<typeof editor.setContent>[0])
      protection = { password, expiresAt: opened.expiresAt }
      await saving.protect(password)
      reportSecurity(describeProtection())
    } catch (error) {
      await openInfoDialog({
        document,
        title: error instanceof DocumentExpiredError ? 'Document expired' : 'Cannot open',
        body:
          error instanceof WrongPasswordError
            ? 'Wrong password, or the file was altered after it was encrypted. AES-GCM cannot tell those apart, so neither will this.'
            : error instanceof DocumentExpiredError
              ? `The password was right, but this document stopped opening on ${new Date(error.expiresAt).toLocaleString()}.`
              : `“${file.name}” could not be decrypted.`,
      })
    }
    return true
  }

  /** Pick which actions the document refuses, and start enforcing them. */
  async function editRestrictions(): Promise<void> {
    const chosen = await askRestrictions(restrictions as Readonly<Record<string, boolean>>)
    if (!chosen) return
    restrictions = chosen as DocumentRestrictions
    releaseRestrictions?.()
    releaseRestrictions = applyRestrictions(editor, restrictions, {
      onBlocked: (action) => reportSecurity(`${action} is blocked for this document`),
    })
    const blocked = Object.entries(chosen)
      .filter(([, on]) => on)
      .map(([name]) => name)
    reportSecurity(
      blocked.length > 0
        ? `Blocked: ${blocked.join(', ')}`
        : `Nothing is restricted${describeProtection() ? `, ${describeProtection()}` : ''}`,
    )
  }

  /** Print, unless the restrictions say otherwise. */
  function print(preview: boolean): void {
    if (!restrictionsAllow(restrictions, 'print')) {
      reportSecurity('Printing is blocked for this document')
      return
    }
    if (preview) void openPrintPreview(editor, document, { styles: collectDocumentCSS })
    else printDocument(editor, document, { styles: collectDocumentCSS })
  }

  return {
    describeProtection,
    protectDocument,
    downloadEncrypted,
    openEncrypted,
    editRestrictions,
    print,
    report: reportSecurity,
    // `restrictions` stays in here: a caller that could read it could also
    // reassign it, and then the listeners and the answer would disagree.
    allows: (action) => restrictionsAllow(restrictions, action),
    release: () => releaseRestrictions?.(),
  }
}
