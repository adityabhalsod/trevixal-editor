/**
 * Bundle size budgets.
 *
 * Run after a build: this measures `dist`, not `src`:
 *
 *     pnpm build && pnpm size
 *
 * Each entry is bundled and minified the way a consuming app's bundler would,
 * then gzipped, because that is the number that reaches a browser. A package
 * over its budget exits non-zero, so growth is a failure rather than a
 * surprise six months later.
 *
 * Budgets are deliberately close to the current figures: a ceiling with
 * plenty of slack is a ceiling nobody notices breaking through.
 */
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

/** @type {{ name: string, entry: string, budgetKb: number, note?: string }[]} */
const TARGETS = [
  {
    name: '@trevixal/core',
    entry: 'packages/core/dist/index.js',
    // Raised from the brief's 45 kB with the list tools' schema: a task's due
    // date and assignee, folded items, and multilevel schemes of the writer's
    // own with the stylesheet that draws them. The measured 45.8 kB plus about 10%.
    budgetKb: 50,
  },
  // Raised from 80 kB with the formatting features (named styles and the
  // Styles pane, borders and shading, drop caps, tab stops, text columns):
  // the measured 84.9 kB plus about 10%.
  { name: '@trevixal/ui', entry: 'packages/ui/dist/index.js', budgetKb: 94 },
  // Raised from 14 kB with heading numbering, captions, the index, line
  // numbers and the block menu: the measured 14.3 kB plus about 10%. Then
  // from 16 kB with the list and table tools (task chips and counts, folds,
  // frozen header rows, the scheme dialog): the measured 16.2 kB plus about 10%.
  { name: '@trevixal/ui styles.css', entry: 'packages/ui/dist/styles.css', budgetKb: 18 },
  {
    // The assembled editor pulls every extension in with it, so this is not a
    // package's own size but the whole thing as a consuming app receives it.
    // The number to quote when someone asks what `mountFullEditor` costs.
    name: '@trevixal/editor-kit',
    entry: 'packages/editor-kit/dist/index.js',
    // Raised from 230 kB with the list and table tools: the measured 232.9 kB
    // plus about 10%.
    budgetKb: 256,
    note: 'every extension included',
  },
  {
    name: '@trevixal/editor-kit styles.css',
    entry: 'packages/editor-kit/dist/styles.css',
    budgetKb: 2,
  },
  {
    // The one-script-tag build of the kit: everything inlined, because a page
    // with no bundler cannot fetch the pieces separately. It is the largest
    // thing here by design. See `packages/editor-kit/src/cdn.ts`.
    name: '@trevixal/editor-kit (CDN)',
    entry: 'packages/editor-kit/dist/trevixal-editor-kit.iife.js',
    // Raised from 200 kB with the document-structure features (heading
    // numbering, captions, cross-references, the index, line numbers, RTL):
    // the measured 210.8 kB plus about 10%. Then from 232 kB with the list
    // and table tools: the measured 233.1 kB plus about 10%.
    budgetKb: 256,
    note: 'already minified',
  },
  {
    name: '<trevixal-editor> (CDN)',
    entry: 'packages/web-component/dist/trevixal-editor.iife.js',
    // Raised from 32 kB: it inlines the core, which the formatting features
    // (named styles, paragraph formatting, AutoFormat) grew. The measured
    // 33.7 kB plus about 10%.
    budgetKb: 37,
    note: 'already minified',
  },
]

/** Bundled, minified and gzipped, in bytes. */
async function measure(entry) {
  if (entry.endsWith('.css')) {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      write: false,
      logLevel: 'silent',
    })
    return gzipSync(result.outputFiles[0].contents, { level: 9 }).length
  }
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
  })
  return gzipSync(result.outputFiles[0].contents, { level: 9 }).length
}

const kb = (bytes) => bytes / 1024

console.log('\nBundle size budgets, minified, gzipped\n')
console.log(`  ${'target'.padEnd(33)} ${'size'.padStart(9)} ${'budget'.padStart(8)}  status`)

let failed = false
for (const target of TARGETS) {
  let size
  try {
    size = await measure(target.entry)
  } catch (error) {
    console.log(`  ${target.name.padEnd(33)} ${'—'.padStart(9)} ${'—'.padStart(8)}  not built`)
    console.log(`      ${String(error?.message ?? error).split('\n')[0]}`)
    failed = true
    continue
  }
  const over = kb(size) > target.budgetKb
  if (over) failed = true
  const status = over ? 'OVER BUDGET' : 'ok'
  const note = target.note ? ` (${target.note})` : ''
  console.log(
    `  ${target.name.padEnd(33)} ${`${kb(size).toFixed(1)} kB`.padStart(9)} ` +
      `${`${target.budgetKb} kB`.padStart(8)}  ${status}${note}`,
  )
}

console.log(
  failed
    ? '\nFAIL at least one bundle is over budget, or was not built. Run `pnpm build` first.\n'
    : '\nOK every bundle is within budget.\n',
)
process.exit(failed ? 1 : 0)
