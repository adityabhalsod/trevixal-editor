/**
 * Give every publishable package the header npm renders and the facts a
 * reader wants before installing: badges, a screenshot, what it does, how
 * big it is, and that the types are in the box.
 *
 * npm renders the README from the tarball, alone, with no repository around
 * it. So a relative link is a 404 there, and a relative image never loads.
 * Both are rewritten to absolute URLs pointing at the tag being published.
 *
 * The prose below the header is written by hand, per package, and is never
 * touched: this script owns the region between the two markers and nothing
 * else. Re-running it rewrites that region in place rather than appending a
 * second copy.
 *
 * Sizes are measured, not guessed: `dist/index.js` bundled, minified and
 * gzipped with the peers external, which is what a consuming app pays. Run
 * `pnpm build` first or the measurement is skipped and the note left out.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

const REPOSITORY = 'adityabhalsod/trevixal-editor'
const SITE = 'https://trevixal-editor.vercel.app'
const BRANCH = 'main'

/** The region this script owns. Everything between them is regenerated. */
const BEGIN = '<!-- generated: header -->'
const END = '<!-- /generated: header -->'

/** What each package is for, in the words a search would use. */
const FEATURES = {
  core: [
    'Immutable document model: schema-validated JSON you can store, diff and transform',
    'Invertible transactions, so undo is step inversion rather than a second history',
    'Runs headless in Node with no DOM, for migrations, tests and server rendering',
    'Imported HTML parsed inside an inert template through an allowlist',
  ],
  ui: [
    'Menubar, toolbar, status bar, dialogs and sidebar panels',
    'An SCSS design system with light, dark and preset themes',
    'Accessible by construction: roving tabindex, ARIA state, focus return',
    'Entirely optional; the engine ships no UI',
  ],
  'editor-kit': [
    'One call mounts the finished editor: `mountFullEditor({ element })`',
    'Every extension wired to every other: tables, images, math, diagrams, track changes',
    'Autosave, themes, a document workspace and a command palette included',
    'A CDN build that runs from one `<script>` tag with no bundler',
  ],
  react: [
    '`useEditor`, `EditorContent` and a reference-stable snapshot hook',
    'Typing does not re-render your tree: the editor DOM lives outside reconciliation',
    'React components inside the document through portal-based node views',
  ],
  vue: [
    '`useEditor` composable and an `EditorContent` component',
    'Shallow-ref snapshots, so a keystroke re-renders only what changed',
    'Vue components inside the document as node views',
  ],
  svelte: [
    'A `use:trevixalEditor` action, idiomatic rather than a wrapper component',
    'Snapshots follow the store contract, so `$snapshot` just works',
  ],
  angular: [
    'A signal-backed snapshot and a view lifecycle tied to the component',
    'No Angular compiler required: it is a plain library, not a schematic',
  ],
  'web-component': [
    '`<trevixal-editor>`, a custom element with no framework at all',
    'A CDN build: one stylesheet, one script, no build step',
    'Server-rendered children survive upgrade, so SSR content is not lost',
  ],
  'extension-table': [
    'Insert, merge, split, sort; row and column editing',
    'Column resize, header rows, alignment and borders',
    'Keyboard navigation and CSV import/export',
  ],
  'extension-image': [
    'Pluggable storage: a fetch endpoint, a data URL, or your own backend',
    'Drag-and-drop and paste upload, with resize, alignment and captions',
  ],
  'extension-export': [
    'DOCX and RTF writers, and a dependency-free DOCX reader',
    'Exports carry the theme, code colours and diagrams the editor showed',
    'File download helpers that work in the browser and in Node',
  ],
  'extension-math': [
    'Inline and display LaTeX, rendered to MathML',
    'An input rule and a pluggable renderer',
  ],
  'extension-diagram': [
    'Mermaid and other text-to-diagram code blocks',
    'Rendered to a live preview through a pluggable renderer',
  ],
  'extension-blocks': [
    'Callouts, toggles, columns, cards and timelines',
    'Page breaks, badges, buttons, footnotes and anchors',
  ],
  'extension-embed': [
    'Video, audio, YouTube, Vimeo and iframe embeds',
    'File attachments and link preview cards',
  ],
  'extension-emoji': ['A `:shortcode` trigger with built-in search'],
  'extension-security': [
    'Password-encrypted documents with expiry',
    'Encrypted storage and copy restrictions',
  ],
  'extension-track-changes': [
    'Attributed insertion and deletion marks',
    'Accept and reject, one change or all of them',
  ],
  'extension-workspace': [
    'A document store with folders, templates, recents and favourites',
    'A tab strip, a split view and a live preview',
  ],
  'extension-writing': [
    'Readability, passive voice, repeated words and grammar hints',
    'Keyword density, as decorations and as a report',
  ],
  'extension-code-highlight': ['Syntax highlighting behind an injectable `Highlighter` interface'],
  'extension-format-code': [
    'JSON and XML pretty-printing and minification',
    'An in-place code-block reformat command',
  ],
  'extension-slash-command': ['A `/` menu with fuzzy filtering', 'Keyboard-first execution'],
}

const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')

/** Bundled, minified, gzipped, peers external: what a consuming app pays. */
async function measureKb(dir) {
  const entry = join(dir, 'dist/index.js')
  if (!existsSync(entry)) return null
  try {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      logLevel: 'silent',
      external: ['@trevixal/*', 'react', 'react-dom', 'vue', 'svelte', '@angular/*', 'rxjs'],
    })
    return gzipSync(result.outputFiles[0].contents, { level: 9 }).length / 1024
  } catch {
    return null
  }
}

function header(name, directory, features, sizeKb) {
  const badge = (label, url) => `[![${label}](${url})`
  const lines = [
    BEGIN,
    '',
    // Shields reads the workflow and the registry directly, so these stay
    // true without anything here being regenerated on release.
    `[![CI](https://github.com/${REPOSITORY}/actions/workflows/ci.yml/badge.svg?branch=${BRANCH})](https://github.com/${REPOSITORY}/actions/workflows/ci.yml)`,
    `[![npm](https://img.shields.io/npm/v/${name}.svg)](https://www.npmjs.com/package/${name})`,
    `[![types](https://img.shields.io/npm/types/${name}.svg)](https://www.npmjs.com/package/${name})`,
    `[![license](https://img.shields.io/npm/l/${name}.svg)](https://github.com/${REPOSITORY}/blob/${BRANCH}/LICENSE)`,
    '',
    `[Documentation](${SITE}) · [Live editor](${SITE}/full-editor) · [Changelog](https://github.com/${REPOSITORY}/blob/${BRANCH}/packages/${directory}/CHANGELOG.md) · [Issues](https://github.com/${REPOSITORY}/issues)`,
    '',
    `[![The Trevixal editor](${SITE}/media/editor.png)](${SITE}/full-editor)`,
    '',
    '## Features',
    '',
    ...features.map((feature) => `- ${feature}`),
    sizeKb === null
      ? null
      : `- **${sizeKb.toFixed(1)} kB** minified and gzipped, with TypeScript types in the package`,
    '',
    END,
  ]
  return lines.filter((line) => line !== null).join('\n')
}

/**
 * npm serves the README with no repository around it, so `../../README.md`
 * is a 404 there. Point those at the tag on GitHub instead.
 */
function absolutise(markdown, directory) {
  const base = `https://github.com/${REPOSITORY}/blob/${BRANCH}`
  return markdown.replace(/\]\((\.\.[^)]*)\)/g, (whole, relative) => {
    const segments = `packages/${directory}/${relative}`.split('/')
    const resolved = []
    for (const segment of segments) {
      if (segment === '..') resolved.pop()
      else if (segment !== '.') resolved.push(segment)
    }
    return `](${base}/${resolved.join('/')})`
  })
}

let written = 0
const skipped = []

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const dir = join(packagesDir, entry.name)
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) continue
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.private) continue

  const features = FEATURES[entry.name]
  if (!features) {
    skipped.push(entry.name)
    continue
  }

  const readmePath = join(dir, 'README.md')
  const raw = readFileSync(readmePath, 'utf8')
  const newline = raw.includes('\r\n') ? '\r\n' : '\n'
  let body = raw.replaceAll('\r\n', '\n')

  // Drop a previous run's block before inserting the current one.
  const begun = body.indexOf(BEGIN)
  if (begun !== -1) {
    const ended = body.indexOf(END, begun)
    if (ended === -1) throw new Error(`${entry.name}: ${BEGIN} with no ${END}`)
    body = body.slice(0, begun) + body.slice(ended + END.length)
    body = body.replace(/\n{3,}/g, '\n\n')
  }

  body = absolutise(body, entry.name)

  // Under the title, above the hand-written prose: a reader meets the badges
  // and the picture before the paragraph.
  const lines = body.split('\n')
  const titleAt = lines.findIndex((line) => line.startsWith('# '))
  if (titleAt === -1) throw new Error(`${entry.name}: README has no title`)

  const block = header(manifest.name, entry.name, features, await measureKb(dir))
  lines.splice(titleAt + 1, 0, '', block)

  const next = `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`
  writeFileSync(readmePath, next.replaceAll('\n', newline))
  written += 1
}

if (skipped.length > 0) {
  console.error(`No features listed for: ${skipped.join(', ')}. Add them to FEATURES.`)
  process.exit(1)
}
console.log(`${written} READMEs updated`)
