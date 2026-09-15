/**
 * Publish every publishable package whose version is not yet on the registry.
 *
 * Two tools, because neither can do the whole job. `workspace:^` is a pnpm
 * protocol that npm cannot resolve, and only `pnpm pack` rewrites it to a real
 * range in the tarball. Trusted publishing is an npm feature: pnpm has no OIDC
 * exchange for the `npm:registry.npmjs.org` audience, so `pnpm publish` can
 * only authenticate with a token. So pnpm packs, npm publishes the tarball, and
 * npm mints its own credential from the workflow's OIDC identity.
 *
 * This replaces `changeset publish`, which shells out to `pnpm publish` and so
 * cannot publish without a token. Versioning and the changelog stay with
 * `changeset version`; only the upload moves.
 *
 * Taking over the publish means taking over what `changeset publish` did
 * besides uploading: it tags each released version, and reports those tags to
 * `changesets/action` so the action can push them and open a GitHub release.
 * That report is a file of NDJSON events at $CHANGESETS_OUTPUT. Skip it and
 * the action logs a warning and creates neither, which is easy to miss.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REGISTRY = 'https://registry.npmjs.org'
const CHANGESETS_OUTPUT = process.env.CHANGESETS_OUTPUT

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  })
}

function publishablePackages(root) {
  const list = run('pnpm', ['list', '--recursive', '--depth', '-1', '--json'], { cwd: root })
  if (list.status !== 0) throw new Error(`pnpm list failed:\n${list.stderr}`)
  return JSON.parse(list.stdout)
    .filter((entry) => entry.path !== root)
    .map((entry) => ({
      dir: entry.path,
      manifest: JSON.parse(readFileSync(join(entry.path, 'package.json'), 'utf8')),
    }))
    .filter(({ manifest }) => !manifest.private)
}

/**
 * A version already on the registry is not an error: `changeset version` bumps
 * only what changed, so most runs republish nothing for most packages.
 */
function isAlreadyPublished(name, version) {
  const view = run('npm', ['view', `${name}@${version}`, 'version', '--registry', REGISTRY])
  if (view.status === 0) return view.stdout.trim() === version
  if (/E404|not found/i.test(view.stderr)) return false
  throw new Error(`npm view ${name}@${version} failed:\n${view.stderr}`)
}

/**
 * The tag `changeset publish` would have created, in the shape the action's
 * `packageName` lookup expects. Annotated, because the action's comment says
 * it pushes annotated tags.
 */
function tagRelease(name, version, root) {
  const tag = `${name}@${version}`
  const existing = run('git', ['tag', '--list', tag], { cwd: root })
  if (existing.stdout.trim() !== tag) {
    const created = run('git', ['tag', '-a', tag, '-m', tag], { cwd: root })
    if (created.status !== 0) throw new Error(`git tag ${tag} failed:\n${created.stderr}`)
  }
  if (CHANGESETS_OUTPUT) {
    const event = { type: 'git-tag', tag, packageName: name }
    appendFileSync(CHANGESETS_OUTPUT, `${JSON.stringify(event)}\n`)
  }
  return tag
}

const root = process.cwd()
const staging = mkdtempSync(join(tmpdir(), 'trevixal-publish-'))
const published = []
const skipped = []

try {
  for (const { dir, manifest } of publishablePackages(root)) {
    const { name, version } = manifest
    if (isAlreadyPublished(name, version)) {
      skipped.push(`${name}@${version}`)
      continue
    }

    // pnpm pack, not npm pack: this is the step that turns `workspace:^` into
    // a range the rest of the world can resolve.
    const pack = run('pnpm', ['pack', '--pack-destination', staging], { cwd: dir })
    if (pack.status !== 0) throw new Error(`pnpm pack failed for ${name}:\n${pack.stderr}`)
    const tarball = pack.stdout.trim().split('\n').pop().trim()

    // No token anywhere: npm exchanges the workflow's OIDC identity for a
    // short-lived credential, and mints provenance from the same identity.
    const publish = run('npm', ['publish', tarball, '--access', 'public', '--registry', REGISTRY], {
      cwd: root,
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    if (publish.status !== 0) throw new Error(`npm publish failed for ${name}@${version}`)
    published.push(tagRelease(name, version, root))
  }
} finally {
  rmSync(staging, { recursive: true, force: true })
}

for (const id of published) console.log(`published ${id}`)
if (published.length > 0 && !CHANGESETS_OUTPUT) {
  console.log('CHANGESETS_OUTPUT was not set: tags are local, push them yourself')
}
if (skipped.length > 0) console.log(`${skipped.length} already on the registry, skipped`)
if (published.length === 0) console.log('nothing to publish')
