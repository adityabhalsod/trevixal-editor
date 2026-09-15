import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

// From the package root: vitest runs with its config's directory as the cwd,
// and `import.meta.url` is not a file URL under the browser-like environment
// the rest of this suite needs.
const stylesheet = resolve(process.cwd(), 'dist/styles.css')

/**
 * The published stylesheet, as a file.
 *
 * Like the documentation suite, this needs the artefact to exist and skips
 * rather than failing a clean checkout: `dist` is built by this package's own
 * `build`, which `turbo run test` does not run for it.
 */
describe('dist/styles.css', () => {
  test.skipIf(!existsSync(stylesheet))('starts with a selector, not a byte-order mark', () => {
    // Dart Sass writes a BOM when compressed output contains a non-ASCII
    // character, and `_features.scss` has two. A browser strips a BOM from a
    // stylesheet it fetched, so this looked harmless, but a bundler that
    // concatenates package CSS puts something in front of it, and the mark is
    // then glued to the first selector. That selector is `.trevixal`, the one
    // rule that defines every spacing, radius and font token, so the whole
    // editor renders with its gaps and corners at zero. `--no-charset` in the
    // build script is what keeps it out.
    const bytes = readFileSync(stylesheet)
    expect(bytes.subarray(0, 3)).not.toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(bytes.subarray(0, 9).toString('utf8')).toBe('.trevixal')
  })
})
