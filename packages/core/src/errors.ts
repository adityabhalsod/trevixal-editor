/**
 * Errors shared across the workspace.
 *
 * `UploadError` lives here rather than in the extension that raises it because
 * two of them do, `@trevixal/extension-image` and `@trevixal/extension-embed`,
 * and each used to declare its own. Two classes of the same name are two
 * different classes at runtime: `catch (error) { error instanceof UploadError }`
 * written against one of them silently skips the other's. Core is the only
 * package both already depend on, so it is where the one definition can sit.
 */

/** A storage backend refused or failed an upload. */
export class UploadError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'UploadError'
  }
}

/**
 * A capability this code needs is missing from the runtime it is in.
 *
 * Not a bug and not bad input: WebCrypto is absent on an insecure origin,
 * `DecompressionStream` on an older browser, a canvas on a server. A host that
 * catches this can say "this browser cannot do that" and disable the button,
 * which is a different answer from "that file is broken", so it is a
 * different class.
 */
export class UnsupportedEnvironmentError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'UnsupportedEnvironmentError'
  }
}
