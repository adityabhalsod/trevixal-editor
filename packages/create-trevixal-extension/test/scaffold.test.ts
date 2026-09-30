import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import manifest from '../package.json' with { type: 'json' }
import { extensionFiles } from '../src/templates'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
const tsc = require.resolve('typescript/bin/tsc')
const roots: string[] = []

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

describe('a scaffolded extension', () => {
  it('passes its own tests and typechecks, against the Trevixal of this repository', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trevixal-scaffold-'))
    roots.push(root)
    // Its dependencies are this package's: the workspace's core and ui.
    await symlink(join(here, '..', 'node_modules'), join(root, 'node_modules'), 'dir')
    const directory = join(root, 'trevixal-extension-sticky-note')
    for (const [path, text] of extensionFiles('trevixal-extension-sticky-note', manifest.version)) {
      await mkdir(dirname(join(directory, path)), { recursive: true })
      await writeFile(join(directory, path), text)
    }
    const tests = spawnSync(process.execPath, [vitest, 'run'], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    })
    expect(tests.status, `${tests.stdout}\n${tests.stderr}`).toBe(0)
    expect(tests.stdout).toMatch(/Tests\s+4 passed/)
    const types = spawnSync(process.execPath, [tsc, '--noEmit', '-p', directory], {
      encoding: 'utf8',
    })
    expect(types.status, types.stdout).toBe(0)
  }, 120_000)
})
