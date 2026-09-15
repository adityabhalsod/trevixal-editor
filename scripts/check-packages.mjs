/**
 * Publish-readiness gate over every publishable package: publint, arethetypeswrong,
 * and an inspection of what `npm pack` would upload. A release cannot ship a
 * manifest that points at files the build did not produce, types that resolve
 * differently under CJS and ESM, anything under `src/`, or a source map that
 * embeds the source it maps.
 *
 * Run after `pnpm build`; the checks read `dist/`, and a missing one is
 * reported as such rather than as a lint failure.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')

const publishable = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(packagesDir, entry.name))
  .filter((dir) => existsSync(join(dir, 'package.json')))
  .map((dir) => ({ dir, manifest: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) }))
  .filter(({ manifest }) => manifest.private !== true)

function run(bin, args, cwd) {
  // pnpm's shims are .cmd files on Windows, which need a shell to launch.
  const result = spawnSync('pnpm', ['exec', bin, ...args], {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}`.trim() }
}

/**
 * The subpaths a consumer imports as modules: every export written as a
 * conditions object, which is where this workspace declares its types. A bare
 * string export is an asset served by path (a stylesheet, an SCSS partial, the
 * IIFE for a script tag) and has no types to check.
 */
function moduleEntrypoints(manifest) {
  return Object.entries(manifest.exports ?? { '.': {} })
    .filter(([, target]) => typeof target === 'object')
    .map(([subpath]) => subpath)
}

/**
 * What the tarball would contain, from npm's own dry run, and the source maps
 * in it that still carry `sourcesContent`. `files: ["dist"]` keeps `src/` out,
 * but esbuild embeds every source file in its maps unless told not to, and an
 * allowlist cannot see inside a file.
 */
function tarballProblems(dir) {
  const pack = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: dir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (pack.status !== 0) return [`npm pack --dry-run failed:\n${pack.stderr}`]
  // npm <= 11 prints an array of package objects; npm 12 prints an object keyed
  // by package name. Both carry the same entries, so take the values either way.
  const report = JSON.parse(pack.stdout)
  const [packed] = Array.isArray(report) ? report : Object.values(report)
  if (!packed?.files) return ['npm pack --dry-run reported no file list']
  const paths = packed.files.map((file) => file.path)
  const problems = paths
    .filter((path) => path.startsWith('src/'))
    .map((path) => `${path} is source, not build output`)
  // Maps are built for local debugging and stay out of the tarball. They point
  // at `../src/*.ts`, which is deliberately not published, so a shipped map
  // resolves to nothing: dead weight a consumer downloads and cannot use.
  for (const path of paths.filter((path) => path.endsWith('.map'))) {
    problems.push(`${path} is a source map; maps are not published`)
  }
  return problems
}

const failures = []
for (const { dir, manifest } of publishable) {
  if (!existsSync(join(dir, 'dist'))) {
    failures.push({
      name: manifest.name,
      tool: 'build',
      output: 'dist/ is missing; run `pnpm build` first',
    })
    continue
  }
  const publint = run('publint', ['--strict', dir], root)
  const attw = run('attw', ['--pack', dir, '--entrypoints', ...moduleEntrypoints(manifest)], root)
  const tarball = tarballProblems(dir)
  const status = publint.ok && attw.ok && tarball.length === 0 ? 'ok' : 'FAIL'
  console.log(`${status.padEnd(5)} ${manifest.name}`)
  if (!publint.ok) failures.push({ name: manifest.name, tool: 'publint', output: publint.output })
  if (!attw.ok)
    failures.push({ name: manifest.name, tool: 'arethetypeswrong', output: attw.output })
  if (tarball.length > 0)
    failures.push({ name: manifest.name, tool: 'tarball', output: tarball.join('\n') })
}

console.log(`\n${publishable.length} publishable packages checked, ${failures.length} problem(s)`)
for (const failure of failures) {
  console.log(`\n--- ${failure.name} (${failure.tool}) ---\n${failure.output}`)
}
process.exit(failures.length === 0 ? 0 : 1)
