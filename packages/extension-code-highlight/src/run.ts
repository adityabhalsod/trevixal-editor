import { type Command, type Editor, type EditorNode, nodeAtPath } from '@trevixal/core'
import { insertCodeBlock } from './insert'
import { findLanguage } from './languages'

/** The languages a block runs in: JavaScript prints into its output, HTML draws there. */
export type RunnableLanguage = 'javascript' | 'html'

/** The class of the output a run puts under its block. */
export const CODE_OUTPUT_CLASS = 'trevixal-code-output'

/** The runnable language a block is written in, or null when it cannot run. */
export function runnableLanguage(language: unknown): RunnableLanguage | null {
  const name = typeof language === 'string' ? findLanguage(language)?.name : undefined
  return name === 'javascript' || name === 'html' ? name : null
}

/** What a new block to run starts with: enough to press Run and see it work. */
const STARTERS: Readonly<Record<RunnableLanguage, string>> = {
  javascript:
    "const total = [1, 2, 3].reduce((sum, n) => sum + n, 0)\nconsole.log('Total:', total)",
  html: '<h1>Hello</h1>\n<p>Edit this, then press Run.</p>',
}

/** Put in a block of JavaScript or HTML to run, with a little to start from. */
export function insertRunnableCode(language: RunnableLanguage): Command {
  return insertCodeBlock({ language }, STARTERS[language])
}

/**
 * Nothing can be fetched from a run: its own scripts and styles run, and
 * pictures written into it as data show, but no request leaves the frame.
 */
const RUN_POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:"

/** A script's text, safe inside a `<script>` element: it cannot close it early. */
function scriptText(code: string): string {
  return code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--')
}

/**
 * What the frame's console says goes to the page as messages carrying
 * `token`, so the page can tell a run's messages from anything else's.
 */
function consoleBridge(token: string): string {
  return `(() => {
  const token = ${JSON.stringify(token)}
  const show = (value) => {
    if (typeof value === 'string') return value
    try { return JSON.stringify(value) ?? String(value) } catch { return String(value) }
  }
  const send = (kind, values) =>
    parent.postMessage({ trevixalRun: token, kind, text: [...values].map(show).join(' ') }, '*')
  for (const kind of ['log', 'info', 'warn', 'error']) {
    const original = console[kind]
    console[kind] = (...values) => {
      send(kind, values)
      original.apply(console, values)
    }
  }
  addEventListener('error', (event) => send('error', [event.message]))
  addEventListener('unhandledrejection', (event) => send('error', ['Unhandled rejection: ' + show(event.reason)]))
  addEventListener('load', () => send('done', []))
})()`
}

/**
 * The page a block runs in, for a frame's `srcdoc`. JavaScript runs after
 * the console bridge, so what it logs is shown; HTML is the page itself.
 */
export function runnerDocument(code: string, language: RunnableLanguage, token: string): string {
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${RUN_POLICY}"><script>${consoleBridge(token)}</script>`
  if (language === 'html')
    return `<!doctype html><html><head>${head}</head><body>${code}</body></html>`
  return `<!doctype html><html><head>${head}</head><body><script>${scriptText(code)}</script></body></html>`
}

/** One line a run printed. */
interface Printed {
  readonly kind: string
  readonly text: string
}

/** What one run of one block has produced so far. */
interface Run {
  readonly language: RunnableLanguage
  readonly token: string
  readonly code: string
  readonly printed: Printed[]
  done: boolean
  frame: HTMLIFrameElement | null
  /** Whether the frame has been put on the page once: a frame put back runs again. */
  shown: boolean
}

export interface CodeRunner {
  /** Run the code block at `path`, or the one holding the caret; false when there is none to run. */
  run(path?: readonly number[]): boolean
  destroy(): void
}

let runs = 0

/**
 * Run JavaScript and HTML code blocks in a sandboxed frame. The frame may
 * run scripts but has no origin of its own, so it cannot reach the page, its
 * storage or its cookies; and it may fetch nothing. JavaScript's console
 * output is listed under the block; HTML is drawn there.
 *
 * The output is chrome, not content, as a diagram's preview is: it sits in
 * the block's `<pre>` after the code, and the document never holds it. It
 * belongs to the code that ran, so changing the code clears it. Returns the
 * runner, whose `run` a Run button calls.
 */
export function enableCodeRunner(editor: Editor): CodeRunner {
  const view = editor.view
  if (!view) return { run: () => false, destroy: () => {} }
  const surface = view.dom
  const document = surface.ownerDocument
  const window = document.defaultView
  const results = new WeakMap<EditorNode, Run>()

  const outputIn = (pre: HTMLElement): HTMLElement | null => {
    for (const child of pre.children) {
      if (child.classList.contains(CODE_OUTPUT_CLASS)) return child as HTMLElement
    }
    return null
  }

  const clear = (pre: HTMLElement): void => {
    const node = view.renderer.modelOf.get(pre)
    if (node) results.delete(node)
    outputIn(pre)?.remove()
  }

  const frameFor = (run: Run): HTMLIFrameElement => {
    if (run.frame) return run.frame
    const frame = document.createElement('iframe')
    frame.className = `${CODE_OUTPUT_CLASS}__frame`
    // Scripts, and nothing else: no same-origin, so the frame's origin is
    // opaque; no forms, popups or navigation of the page.
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.setAttribute('title', run.language === 'html' ? 'HTML output' : 'JavaScript run')
    frame.srcdoc = runnerDocument(run.code, run.language, run.token)
    if (run.language === 'javascript') frame.hidden = true
    run.frame = frame
    return frame
  }

  const draw = (pre: HTMLElement, run: Run): void => {
    let output = outputIn(pre)
    if (!output) {
      output = document.createElement('div')
      output.className = CODE_OUTPUT_CLASS
      output.contentEditable = 'false'
      output.dataset.trevixalWidget = 'true'
      output.setAttribute('role', 'region')
      output.setAttribute('aria-label', 'Output')
      const bar = document.createElement('div')
      bar.className = `${CODE_OUTPUT_CLASS}__bar`
      const label = document.createElement('span')
      label.textContent = 'Output'
      const close = document.createElement('button')
      close.type = 'button'
      close.className = `${CODE_OUTPUT_CLASS}__clear`
      close.textContent = 'Clear'
      close.addEventListener('mousedown', (event) => event.preventDefault())
      close.addEventListener('click', () => clear(pre))
      bar.append(label, close)
      const log = document.createElement('ol')
      log.className = `${CODE_OUTPUT_CLASS}__log`
      log.setAttribute('aria-live', 'polite')
      output.append(bar, log)
      pre.appendChild(output)
    }
    const frame = frameFor(run)
    // A redrawn block loses its frame, and a frame put back loads again. A
    // script that has finished keeps what it printed instead of running
    // twice; anything else runs again, from a clean slate.
    if (!frame.isConnected && !(run.language === 'javascript' && run.done)) {
      if (run.shown) {
        run.printed.length = 0
        run.done = false
      }
      output.appendChild(frame)
      run.shown = true
    }
    const log = output.querySelector(`.${CODE_OUTPUT_CLASS}__log`) as HTMLElement
    const lines = run.printed.map((line) => {
      const item = document.createElement('li')
      item.className = `${CODE_OUTPUT_CLASS}__line ${CODE_OUTPUT_CLASS}__line--${line.kind}`
      item.textContent = line.text
      return item
    })
    if (run.language === 'javascript' && run.done && lines.length === 0) {
      const item = document.createElement('li')
      item.className = `${CODE_OUTPUT_CLASS}__line ${CODE_OUTPUT_CLASS}__line--quiet`
      item.textContent = 'Nothing was printed.'
      lines.push(item)
    }
    log.replaceChildren(...lines)
    log.hidden = lines.length === 0
  }

  /** Put every block's output back where a redraw took it, and drop stale ones. */
  const sync = (): void => {
    for (const pre of surface.querySelectorAll<HTMLElement>('pre')) {
      const node = view.renderer.modelOf.get(pre)
      const run = node ? results.get(node) : undefined
      if (run) draw(pre, run)
      else outputIn(pre)?.remove()
    }
  }

  const onMessage = (event: MessageEvent): void => {
    const data = event.data as { trevixalRun?: unknown; kind?: unknown; text?: unknown } | null
    if (!data || typeof data.trevixalRun !== 'string') return
    for (const pre of surface.querySelectorAll<HTMLElement>('pre')) {
      const node = view.renderer.modelOf.get(pre)
      const run = node ? results.get(node) : undefined
      if (!run || run.token !== data.trevixalRun || event.source !== run.frame?.contentWindow) {
        continue
      }
      if (data.kind === 'done') run.done = true
      else run.printed.push({ kind: String(data.kind), text: String(data.text ?? '') })
      draw(pre, run)
      return
    }
  }

  const run = (path?: readonly number[]): boolean => {
    const at = path ?? editor.state.selection.from.path
    const node = nodeAtPath(editor.state.doc, at)
    const language = node?.type.name === 'codeBlock' ? runnableLanguage(node.attrs.language) : null
    if (!node || !language) return false
    runs += 1
    results.set(node, {
      language,
      token: `run-${runs}-${Math.random().toString(36).slice(2)}`,
      code: node.textContent,
      printed: [],
      done: false,
      frame: null,
      shown: false,
    })
    sync()
    return true
  }

  window?.addEventListener('message', onMessage)
  const offTransaction = editor.on('transaction', sync)
  return {
    run,
    destroy() {
      offTransaction()
      window?.removeEventListener('message', onMessage)
      for (const pre of surface.querySelectorAll<HTMLElement>('pre')) outputIn(pre)?.remove()
    },
  }
}
