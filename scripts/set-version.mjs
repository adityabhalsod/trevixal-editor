/**
 * Set every publishable package to one version.
 *
 * The release is the single source of truth: you name a version on the
 * GitHub release, and all 23 packages take it. They are versioned together
 * and always have been, so there is nothing per-package to decide.
 *
 * Nothing here rewrites the `workspace:` ranges between them. `pnpm pack`
 * resolves those at pack time against the versions on disk, so setting every
 * package first is what makes `workspace:^` become `^<this release>`.
 *
 *     node scripts/set-version.mjs 1.0.4
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Semver, no range operators: this is a concrete version being stamped in. */
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

const [, , raw] = process.argv
if (!raw) {
  console.error('usage: node scripts/set-version.mjs <version>')
  process.exit(1)
}

// A release tagged `v1.0.4` names the same version as one tagged `1.0.4`.
const version = raw.startsWith('v') ? raw.slice(1) : raw
if (!VERSION.test(version)) {
  console.error(`"${raw}" is not a version. Expected something like 1.0.4 or v1.0.4.`)
  process.exit(1)
}

const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')

let changed = 0
for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const path = join(packagesDir, entry.name, 'package.json')
  let source
  try {
    source = readFileSync(path, 'utf8')
  } catch {
    continue // No manifest: not a package.
  }
  const manifest = JSON.parse(source)
  if (manifest.private) continue
  if (manifest.version === version) continue

  manifest.version = version
  // The worktree is CRLF under autocrlf; a file written LF is a whole-file diff.
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`.replaceAll('\n', newline))
  changed += 1
}

console.log(`${version}: ${changed} package(s) set`)
