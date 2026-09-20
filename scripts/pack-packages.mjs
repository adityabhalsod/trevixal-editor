/**
 * Pack every publishable package into one directory, and measure it.
 *
 * Packing happens once, here, rather than in each publishing job: `pnpm pack`
 * is the step that rewrites `workspace:^` into a range the rest of the world
 * can resolve, and it needs the whole workspace to do it. A tarball needs
 * nothing, so the jobs that upload them can run anywhere, in parallel.
 *
 * Writes `<outdir>/packages.json`: the matrix the publish jobs fan out over,
 * and the numbers the release notes table is built from.
 *
 *     node scripts/pack-packages.mjs dist-release
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

const [, , out = 'dist-release'] = process.argv
const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')
const staging = resolve(root, out)
mkdirSync(staging, { recursive: true })

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  })
}

/**
 * What a browser pays for this package: bundled, minified, gzipped, with the
 * peers external, because an app installs those once rather than per package.
 * Null when there is nothing to measure rather than a guess.
 */
async function bundleBytes(dir) {
  try {
    const result = await build({
      entryPoints: [join(dir, 'dist/index.js')],
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      logLevel: 'silent',
      external: ['@trevixal/*', 'react', 'react-dom', 'vue', 'svelte', '@angular/*', 'rxjs'],
    })
    return gzipSync(result.outputFiles[0].contents, { level: 9 }).length
  } catch {
    return null
  }
}

const packages = []
for (const entry of readdirSync(packagesDir, { withFileTypes: true }).sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  if (!entry.isDirectory()) continue
  const dir = join(packagesDir, entry.name)
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {
    continue
  }
  if (manifest.private) continue

  const pack = run('pnpm', ['pack', '--pack-destination', staging], { cwd: dir })
  if (pack.status !== 0) throw new Error(`pnpm pack failed for ${manifest.name}:\n${pack.stderr}`)
  // pnpm prints progress before the path; the tarball is the last line.
  const tarball = pack.stdout.trim().split('\n').pop().trim().split(/[\\/]/).pop()

  packages.push({
    name: manifest.name,
    directory: entry.name,
    version: manifest.version,
    tarball,
    tarballBytes: statSync(join(staging, tarball)).size,
    bundleBytes: await bundleBytes(dir),
  })
}

if (packages.length === 0) throw new Error('no publishable packages found')

const versions = [...new Set(packages.map((entry) => entry.version))]
if (versions.length > 1) {
  throw new Error(`packages disagree about the version: ${versions.join(', ')}`)
}

writeFileSync(
  join(staging, 'packages.json'),
  `${JSON.stringify({ version: versions[0], packages }, null, 2)}\n`,
)
console.log(`${packages.length} packages packed at ${versions[0]} into ${out}/`)
