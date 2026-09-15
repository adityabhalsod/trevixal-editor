import { Window } from 'happy-dom'
/**
 * Performance benchmarks for the editing engine.
 *
 * Run after a build: this reads `packages/core/dist`, not `src`:
 *
 *     pnpm build && pnpm bench
 *
 * Three numbers the brief asks for:
 *
 *   1. Keystroke to new state on a 10,000-node document, p95 under 5 ms.
 *   2. Serializing a ~1 MB document to HTML and to Markdown.
 *   3. Parsing that HTML back in.
 *
 * The keystroke budget is a gate: the script exits non-zero when p95 misses
 * it, so a regression is a failure rather than a number nobody reads. The
 * serialization figures are reported, not gated, they depend on the machine
 * far more than the keystroke path does.
 */
import {
  EditorState,
  Fragment,
  ReplaceInlineStep,
  Schema,
  TextSelection,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
  serializeToHTML,
  serializeToMarkdown,
} from '../packages/core/dist/index.js'

// `parseHTML` needs a Document. Node has none, so the benchmark supplies one
// rather than skipping the direction that turns a saved file back into a doc.
const parseDocument = new Window().document

const KEYSTROKE_P95_BUDGET_MS = 5
const BLOCKS = 10_000
const TARGET_BYTES = 1_000_000

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

/** A document of `count` paragraphs, each holding one sentence. */
function buildDoc(count, sentence = 'The quick brown fox jumps over the lazy dog.') {
  const children = []
  for (let i = 0; i < count; i++) {
    children.push(schema.node('paragraph', undefined, Fragment.of(schema.text(`${i} ${sentence}`))))
  }
  return schema.node('doc', undefined, Fragment.from(children))
}

/** Percentile of a sorted-in-place sample. */
function percentile(samples, fraction) {
  const sorted = [...samples].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))
  return sorted[index]
}

function summarize(samples) {
  const total = samples.reduce((sum, value) => sum + value, 0)
  return {
    runs: samples.length,
    mean: total / samples.length,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
    max: Math.max(...samples),
  }
}

function ms(value) {
  return `${value.toFixed(3)} ms`
}

function row(label, value) {
  console.log(`  ${label.padEnd(34)} ${value}`)
}

// ------------------------------------------------------- keystroke latency

/**
 * One keystroke: build the transaction the view would build for a typed
 * character, and apply it. That pair is the whole of "keystroke to state".
 * Everything after it is rendering, which is measured in the browser suite.
 */
function measureKeystrokes(doc, runs) {
  let state = EditorState.create({
    schema,
    doc,
    selection: new TextSelection(pos([Math.floor(BLOCKS / 2)], 1)),
  })
  const samples = []
  // Type into the middle of the document: the start would flatter the path
  // that walks to the edited block, and the end would flatter it differently.
  const path = [Math.floor(BLOCKS / 2)]
  let offset = 1
  for (let i = 0; i < runs; i++) {
    const started = performance.now()
    const tr = state.tr.step(
      new ReplaceInlineStep(path, offset, offset, Fragment.of(schema.text('x'))),
    )
    tr.setSelection(new TextSelection(pos(path, offset + 1)))
    state = state.apply(tr)
    samples.push(performance.now() - started)
    offset += 1
  }
  return summarize(samples)
}

// -------------------------------------------------------------- throughput

function measure(label, run, runs = 5) {
  const samples = []
  let last
  for (let i = 0; i < runs; i++) {
    const started = performance.now()
    last = run()
    samples.push(performance.now() - started)
  }
  return { label, stats: summarize(samples), result: last }
}

// -------------------------------------------------------------------- main

console.log('\nTrevixal benchmarks')
console.log(`  node ${process.version} · ${process.platform} ${process.arch}\n`)

console.log(`Keystroke to new state: ${BLOCKS.toLocaleString()} blocks`)
const doc = buildDoc(BLOCKS)
// Warm the JIT so the first sample is not the slowest by a factor of ten.
measureKeystrokes(doc, 200)
const keystroke = measureKeystrokes(doc, 2_000)
row('runs', String(keystroke.runs))
row('mean', ms(keystroke.mean))
row('p50', ms(keystroke.p50))
row('p95', ms(keystroke.p95))
row('p99', ms(keystroke.p99))
row('max', ms(keystroke.max))
row('budget (p95)', ms(KEYSTROKE_P95_BUDGET_MS))

// A document of roughly the target size, measured rather than guessed.
const sizingDoc = buildDoc(1_000)
let html = serializeToHTML(sizingDoc)
const blocksForTarget = Math.max(1, Math.round((TARGET_BYTES / html.length) * 1_000))
const bigDoc = buildDoc(blocksForTarget)
html = serializeToHTML(bigDoc)
const bytes = Buffer.byteLength(html, 'utf8')

console.log(
  `\nSerialization, ${blocksForTarget.toLocaleString()} blocks, ${(bytes / 1024 / 1024).toFixed(2)} MB of HTML`,
)
for (const { label, stats } of [
  measure('doc to HTML', () => serializeToHTML(bigDoc)),
  measure('doc to Markdown', () => serializeToMarkdown(bigDoc)),
  measure('HTML back to doc', () => parseHTML(schema, html, parseDocument)),
]) {
  row(label, `${ms(stats.p50)}  (p95 ${ms(stats.p95)})`)
}

const failed = keystroke.p95 > KEYSTROKE_P95_BUDGET_MS
console.log(
  failed
    ? `\nFAIL keystroke p95 ${ms(keystroke.p95)} is over the ${ms(KEYSTROKE_P95_BUDGET_MS)} budget\n`
    : `\nOK keystroke p95 ${ms(keystroke.p95)} is within the ${ms(KEYSTROKE_P95_BUDGET_MS)} budget\n`,
)
process.exit(failed ? 1 : 0)
