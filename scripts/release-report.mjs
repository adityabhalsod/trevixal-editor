/**
 * The table that goes on the release page.
 *
 * Reads what `pack-packages.mjs` measured, and the per-package outcome files
 * each publish job leaves behind, so the table says what actually reached the
 * registry rather than what was meant to.
 *
 *     node scripts/release-report.mjs dist-release/packages.json outcomes/
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const [, , manifestPath, outcomesDir] = process.argv
if (!manifestPath) {
  console.error('usage: node scripts/release-report.mjs <packages.json> [outcomes-dir]')
  process.exit(1)
}

const { version, packages } = JSON.parse(readFileSync(manifestPath, 'utf8'))

/**
 * Each publish job writes `<package>.txt` holding `published`, `skipped` or
 * `failed`. A job that never ran leaves nothing, which is itself a result.
 */
const outcomes = new Map()
if (outcomesDir && existsSync(outcomesDir)) {
  for (const file of readdirSync(outcomesDir)) {
    if (!file.endsWith('.txt')) continue
    outcomes.set(file.slice(0, -4), readFileSync(join(outcomesDir, file), 'utf8').trim())
  }
}

const SYMBOLS = {
  published: 'published',
  skipped: 'already on npm',
  failed: '**failed**',
}

const kb = (bytes) =>
  bytes === null || bytes === undefined ? '—' : `${(bytes / 1024).toFixed(1)} kB`

const rows = packages.map((entry) => {
  // The job name replaces the scope slash, which is not a legal filename.
  const key = entry.name.replace('/', '__')
  const outcome = outcomes.get(key) ?? 'no result'
  return `| [\`${entry.name}\`](https://www.npmjs.com/package/${entry.name}/v/${entry.version}) | ${kb(entry.bundleBytes)} | ${kb(entry.tarballBytes)} | ${SYMBOLS[outcome] ?? outcome} |`
})

const failed = [...outcomes.values()].filter((value) => value === 'failed').length
const total = packages.reduce((sum, entry) => sum + (entry.bundleBytes ?? 0), 0)

console.log(`## Packages

All ${packages.length} packages are released together at \`${version}\`.

\`\`\`sh
npm install @trevixal/editor-kit@${version}
\`\`\`

| Package | Bundle (min + gzip) | Tarball | Status |
| --- | --- | --- | --- |
${rows.join('\n')}

**Bundle** is what a browser pays for that package alone: bundled, minified and
gzipped with its peers external. **Tarball** is the download from npm.
${failed > 0 ? `\n> ${failed} package(s) failed to publish. Re-running the release workflow retries only those: a version already on the registry is skipped.\n` : ''}`)
