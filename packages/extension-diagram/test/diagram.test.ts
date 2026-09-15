// @vitest-environment happy-dom
import {
  type Editor,
  Fragment,
  ReplaceInlineStep,
  Schema,
  SetNodeAttrsStep,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  inlineLength,
  pos,
} from '@trevixal/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DIAGRAM_TEMPLATE,
  DIAGRAM_PREVIEW_CLASS,
  type DiagramController,
  type DiagramOptions,
  type DiagramRenderer,
  createMermaidRenderer,
  diagram,
  diagramUICommands,
  insertDiagram,
  isDiagramBlock,
  loadMermaid,
} from '../src'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

const PENDING_CLASS = `${DIAGRAM_PREVIEW_CLASS}--pending`
const ERROR_CLASS = `${DIAGRAM_PREVIEW_CLASS}--error`

type Block = readonly [type: 'codeBlock' | 'paragraph', language: string | null, text: string]

const code = (language: string | null, text: string): Block => ['codeBlock', language, text]
const para = (text: string): Block => ['paragraph', null, text]

function doc(...blocks: Block[]) {
  return {
    type: 'doc',
    content: blocks.map(([type, language, text]) => ({
      type,
      ...(type === 'codeBlock' ? { attrs: { language } } : {}),
      content: text.length > 0 ? [{ type: 'text', text }] : [],
    })),
  }
}

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

function mount(...blocks: Block[]) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ schema, element: host, content: doc(...blocks) as never })
  cleanups.push(() => {
    editor.destroy()
    host.remove()
  })
  return { editor, host }
}

function headless(...blocks: Block[]): Editor {
  const editor = createEditor({ schema, content: doc(...blocks) as never })
  cleanups.push(() => editor.destroy())
  return editor
}

/** Attach the controller and make sure it is torn down with the test. */
function attach(editor: Editor, options: DiagramOptions): DiagramController {
  const controller = diagram(editor, options)
  cleanups.push(() => controller.destroy())
  return controller
}

/** A renderer whose output names the code it drew, so tests can tell results apart. */
const svgFor: DiagramRenderer = (source) => `<svg><text>${source}</text></svg>`

function previews(host: HTMLElement): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>(`.${DIAGRAM_PREVIEW_CLASS}`)]
}

/** Set one block's language directly, without moving the selection. */
function setLanguage(editor: Editor, index: number, language: string | null): void {
  const node = editor.state.doc.child(index)
  editor.dispatch(editor.state.tr.step(new SetNodeAttrsStep([index], { ...node.attrs, language })))
}

/** Replace the whole text of one block. */
function setCode(editor: Editor, index: number, text: string): void {
  const node = editor.state.doc.child(index)
  const insert = text.length > 0 ? Fragment.of(schema.text(text)) : Fragment.empty
  editor.dispatch(
    editor.state.tr.step(new ReplaceInlineStep([index], 0, inlineLength(node.content), insert)),
  )
}

describe('diagram', () => {
  it('previews a mermaid block inside its <pre>, after the <code>, and leaves other code alone', () => {
    const { editor, host } = mount(code('mermaid', 'graph TD'), code('typescript', 'const x = 1'))
    const render = vi.fn(svgFor)
    attach(editor, { render, debounceMs: 0 })

    const shown = previews(host)
    expect(shown).toHaveLength(1)
    const [preview] = shown
    const pre = preview.parentElement as HTMLElement
    expect(pre.tagName).toBe('PRE')
    expect(pre.firstElementChild?.tagName).toBe('CODE')
    expect(pre.lastElementChild).toBe(preview)
    expect(preview.getAttribute('contenteditable')).toBe('false')
    expect(preview.getAttribute('data-trevixal-widget')).toBe('true')
    expect(preview.getAttribute('data-trevixal-diagram')).toBe('mermaid')
    expect(preview.innerHTML).toBe('<svg><text>graph TD</text></svg>')
    expect(preview.classList.contains(PENDING_CLASS)).toBe(false)

    expect(render).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenCalledWith('graph TD', { language: 'mermaid', id: expect.any(String) })
    // The TypeScript block's <pre> holds only its <code>.
    expect(host.querySelectorAll('pre')[1]?.children).toHaveLength(1)
  })

  it('is chrome, not content: the document model and its HTML never see the preview', () => {
    const { editor, host } = mount(code('mermaid', 'graph TD'))
    attach(editor, { render: svgFor, debounceMs: 0 })
    expect(previews(host)).toHaveLength(1)
    expect(editor.getHTML()).not.toContain(DIAGRAM_PREVIEW_CLASS)
    expect(editor.getHTML()).not.toContain('<svg')
    expect(editor.getText()).toBe('graph TD')
  })

  it('shows a placeholder while an asynchronous render is pending and the result once refresh() settles', async () => {
    const { editor, host } = mount(code('mermaid', 'graph TD'))
    const render = vi.fn(async (source: string) => svgFor(source, { language: '', id: '' }))
    const controller = attach(editor, { render, debounceMs: 0 })

    const [preview] = previews(host)
    expect(preview.classList.contains(PENDING_CLASS)).toBe(true)
    expect(preview.textContent).toBe('Rendering diagram…')

    await controller.refresh()
    expect(preview.classList.contains(PENDING_CLASS)).toBe(false)
    expect(preview.innerHTML).toBe('<svg><text>graph TD</text></svg>')
    // Still the same element: refreshing repaints, it does not rebuild.
    expect(previews(host)[0]).toBe(preview)
  })

  it('honours a custom placeholder', () => {
    const { editor, host } = mount(code('mermaid', 'graph TD'))
    attach(editor, { render: () => new Promise(() => {}), placeholder: 'Drawing…' })
    expect(previews(host)[0].textContent).toBe('Drawing…')
  })

  it('never lets a stale asynchronous result overwrite a newer one', async () => {
    const resolvers = new Map<string, (svg: string) => void>()
    const render: DiagramRenderer = (source) =>
      new Promise((resolve) => {
        resolvers.set(source, resolve)
      })
    const { editor, host } = mount(code('mermaid', 'A'))
    attach(editor, { render, debounceMs: 0 })
    setCode(editor, 0, 'B')
    expect([...resolvers.keys()]).toEqual(['A', 'B'])

    resolvers.get('B')?.('<svg><text>B</text></svg>')
    const [preview] = previews(host)
    await vi.waitFor(() => expect(preview.innerHTML).toBe('<svg><text>B</text></svg>'))
    expect(preview.classList.contains(PENDING_CLASS)).toBe(false)

    // The older render lands late: the block no longer says A, so it is ignored.
    resolvers.get('A')?.('<svg><text>A</text></svg>')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(preview.innerHTML).toBe('<svg><text>B</text></svg>')
  })

  it('marks a failed render with the error class and message', () => {
    const { editor, host } = mount(code('mermaid', 'graph TD'))
    attach(editor, {
      render: () => {
        throw new Error('Parse error on line 1')
      },
      debounceMs: 0,
    })
    const [preview] = previews(host)
    expect(preview.classList.contains(ERROR_CLASS)).toBe(true)
    expect(preview.classList.contains(PENDING_CLASS)).toBe(false)
    expect(preview.textContent).toBe('Diagram could not be rendered: Parse error on line 1')
  })

  it('uses the custom error label and recovers once the code renders again', async () => {
    const { editor, host } = mount(code('mermaid', 'bad'))
    const render: DiagramRenderer = async (source) => {
      if (source === 'bad') throw new Error('nope')
      return svgFor(source, { language: '', id: '' })
    }
    const controller = attach(editor, { render, debounceMs: 0, errorLabel: 'Mermaid failed' })
    await controller.refresh()
    const [preview] = previews(host)
    expect(preview.classList.contains(ERROR_CLASS)).toBe(true)
    expect(preview.textContent).toBe('Mermaid failed: nope')

    setCode(editor, 0, 'good')
    await controller.refresh()
    expect(preview.classList.contains(ERROR_CLASS)).toBe(false)
    expect(preview.innerHTML).toBe('<svg><text>good</text></svg>')
  })

  it('renders identical code once, and again only when the code changes', () => {
    const render = vi.fn(svgFor)
    const { editor, host } = mount(code('mermaid', 'graph TD'), code('mermaid', 'graph TD'))
    attach(editor, { render, debounceMs: 0 })
    expect(previews(host)).toHaveLength(2)
    expect(render).toHaveBeenCalledTimes(1)

    // A caret move is a transaction too; it must not cost a render.
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([1], 3))))
    expect(render).toHaveBeenCalledTimes(1)

    setCode(editor, 0, 'graph LR')
    expect(render).toHaveBeenCalledTimes(2)
    expect(render).toHaveBeenLastCalledWith(
      'graph LR',
      expect.objectContaining({ language: 'mermaid' }),
    )
    const [first, second] = previews(host)
    expect(first.innerHTML).toBe('<svg><text>graph LR</text></svg>')
    expect(second.innerHTML).toBe('<svg><text>graph TD</text></svg>')
  })

  it('gives every render call a distinct id', () => {
    const render = vi.fn(svgFor)
    const { editor } = mount(code('mermaid', 'A'), code('mermaid', 'B'))
    attach(editor, { render, debounceMs: 0 })
    const ids = render.mock.calls.map(([, context]) => context.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z][\w-]*$/)
  })

  it('keeps the preview attached while the user types in the block', () => {
    const render = vi.fn(svgFor)
    const { editor, host } = mount(code('mermaid', 'graph TD'))
    attach(editor, { render, debounceMs: 0 })
    const [preview] = previews(host)

    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 8))))
    editor.commands.insertText(';')
    expect(editor.getText()).toBe('graph TD;')
    expect(previews(host)).toHaveLength(1)
    const pre = previews(host)[0].parentElement as HTMLElement
    expect(pre.firstElementChild?.tagName).toBe('CODE')
    expect(pre.lastElementChild?.classList.contains(DIAGRAM_PREVIEW_CLASS)).toBe(true)
    expect(render).toHaveBeenLastCalledWith('graph TD;', expect.anything())
    // Typing edits the <code>; the same preview element stays and is repainted.
    expect(previews(host)[0]).toBe(preview)
    expect(preview.innerHTML).toBe('<svg><text>graph TD;</text></svg>')
  })

  it('debounces re-renders after an edit and keeps the old diagram in place meanwhile', async () => {
    const render = vi.fn(svgFor)
    const { editor, host } = mount(code('mermaid', 'graph TD'))
    const controller = attach(editor, { render, debounceMs: 60_000 })
    // The first paint is immediate: nothing was typed yet.
    expect(render).toHaveBeenCalledTimes(1)

    setCode(editor, 0, 'graph LR')
    expect(render).toHaveBeenCalledTimes(1)
    const [preview] = previews(host)
    expect(preview.classList.contains(PENDING_CLASS)).toBe(true)
    expect(preview.innerHTML).toBe('<svg><text>graph TD</text></svg>')

    // refresh() does not wait for the timer.
    await controller.refresh()
    expect(render).toHaveBeenLastCalledWith('graph LR', expect.anything())
    expect(preview.classList.contains(PENDING_CLASS)).toBe(false)
    expect(preview.innerHTML).toBe('<svg><text>graph LR</text></svg>')
  })

  it('removes the preview when the block stops being a diagram language and restores it from cache', () => {
    const render = vi.fn(svgFor)
    const { editor, host } = mount(code('mermaid', 'graph TD'))
    attach(editor, { render, debounceMs: 0 })
    expect(previews(host)).toHaveLength(1)

    setLanguage(editor, 0, 'typescript')
    expect(previews(host)).toHaveLength(0)
    expect(host.querySelector('pre')?.children).toHaveLength(1)

    setLanguage(editor, 0, 'mermaid')
    expect(previews(host)).toHaveLength(1)
    expect(previews(host)[0].innerHTML).toBe('<svg><text>graph TD</text></svg>')
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('previews a block whose language becomes a diagram language', () => {
    const { editor, host } = mount(code(null, 'graph TD'))
    attach(editor, { render: svgFor, debounceMs: 0 })
    expect(previews(host)).toHaveLength(0)
    setLanguage(editor, 0, 'mermaid')
    expect(previews(host)).toHaveLength(1)
  })

  it('matches languages case-insensitively and lets the host choose them', () => {
    const { editor, host } = mount(
      code('Mermaid', 'a'),
      code('plantuml', 'b'),
      code('PlantUML ', 'c'),
    )
    attach(editor, { render: svgFor, languages: ['plantuml'], debounceMs: 0 })
    const shown = previews(host)
    expect(shown).toHaveLength(2)
    expect(shown.map((preview) => preview.getAttribute('data-trevixal-diagram'))).toEqual([
      'plantuml',
      'plantuml',
    ])
    expect(shown.map((preview) => preview.innerHTML)).toEqual([
      '<svg><text>b</text></svg>',
      '<svg><text>c</text></svg>',
    ])
  })

  it('destroy() removes every preview and stops listening', () => {
    const render = vi.fn(svgFor)
    const { editor, host } = mount(code('mermaid', 'A'), code('mermaid', 'B'))
    const controller = diagram(editor, { render, debounceMs: 0 })
    expect(previews(host)).toHaveLength(2)

    controller.destroy()
    expect(previews(host)).toHaveLength(0)
    setCode(editor, 0, 'C')
    expect(previews(host)).toHaveLength(0)
    expect(render).toHaveBeenCalledTimes(2)
    controller.destroy() // idempotent
  })

  it('setEnabled(false) hides previews; setEnabled(true) brings them back from cache', () => {
    const render = vi.fn(svgFor)
    const { editor, host } = mount(code('mermaid', 'graph TD'))
    const controller = attach(editor, { render, debounceMs: 0 })

    controller.setEnabled(false)
    expect(previews(host)).toHaveLength(0)
    setCode(editor, 0, 'graph LR')
    expect(previews(host)).toHaveLength(0)
    expect(render).toHaveBeenCalledTimes(1)

    controller.setEnabled(true)
    expect(previews(host)).toHaveLength(1)
    expect(previews(host)[0].innerHTML).toBe('<svg><text>graph LR</text></svg>')
    expect(render).toHaveBeenCalledTimes(2)
  })

  it('refresh() re-renders from scratch, ignoring the cache', async () => {
    const render = vi.fn(svgFor)
    const { editor } = mount(code('mermaid', 'graph TD'))
    const controller = attach(editor, { render, debounceMs: 0 })
    expect(render).toHaveBeenCalledTimes(1)
    await controller.refresh()
    expect(render).toHaveBeenCalledTimes(2)
  })

  it('is a no-op on a headless editor', async () => {
    const editor = headless(code('mermaid', 'graph TD'))
    expect(editor.view).toBeNull()
    const render = vi.fn(svgFor)
    const controller = diagram(editor, { render })
    await expect(controller.refresh()).resolves.toBeUndefined()
    controller.setEnabled(false)
    controller.setEnabled(true)
    controller.destroy()
    expect(render).not.toHaveBeenCalled()
  })

  it('draws through createMermaidRenderer end to end', async () => {
    const mermaid = {
      initialize: vi.fn(),
      render: vi.fn(async (id: string, source: string) => ({
        svg: `<svg id="${id}"><text>${source}</text></svg>`,
      })),
    }
    const { editor, host } = mount(code('mermaid', 'graph TD'))
    const controller = attach(editor, { render: createMermaidRenderer(mermaid), debounceMs: 0 })
    await controller.refresh()
    const svg = previews(host)[0].querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.textContent).toBe('graph TD')
    expect(mermaid.initialize).toHaveBeenCalledTimes(1)
  })
})

describe('isDiagramBlock', () => {
  const codeBlock = (language: string | null) =>
    schema.nodes.codeBlock.create({ language }, Fragment.of(schema.text('x')))

  it('recognises code blocks in a diagram language, normalising case and whitespace', () => {
    expect(isDiagramBlock(codeBlock('mermaid'))).toBe(true)
    expect(isDiagramBlock(codeBlock(' Mermaid '))).toBe(true)
    expect(isDiagramBlock(codeBlock('typescript'))).toBe(false)
    expect(isDiagramBlock(codeBlock(null))).toBe(false)
    expect(isDiagramBlock(codeBlock(''))).toBe(false)
  })

  it('never matches non-code blocks and follows the given language list', () => {
    expect(isDiagramBlock(schema.nodes.paragraph.create())).toBe(false)
    expect(isDiagramBlock(codeBlock('plantuml'))).toBe(false)
    expect(isDiagramBlock(codeBlock('plantuml'), ['plantuml'])).toBe(true)
    expect(isDiagramBlock(codeBlock('mermaid'), ['plantuml'])).toBe(false)
  })
})

describe('insertDiagram', () => {
  it('replaces an empty paragraph with the template and puts the caret at the end of the code', () => {
    const editor = headless(para(''))
    expect(editor.exec(insertDiagram())).toBe(true)

    const { doc: next, selection } = editor.state
    expect(next.childCount).toBe(1)
    expect(next.child(0).type.name).toBe('codeBlock')
    expect(next.child(0).attrs.language).toBe('mermaid')
    expect(next.child(0).textContent).toBe(DEFAULT_DIAGRAM_TEMPLATE)
    expect(DEFAULT_DIAGRAM_TEMPLATE).toBe('graph TD\n  A[Start] --> B[Finish]')
    expect(selection.from).toEqual({ path: [0], offset: DEFAULT_DIAGRAM_TEMPLATE.length })
    expect(selection.to).toEqual(selection.from)
  })

  it('inserts after a paragraph with content, honouring code and language', () => {
    const editor = headless(para('Intro'), para('Outro'))
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0], 2))))
    expect(editor.exec(insertDiagram('@startuml\n@enduml', 'plantuml'))).toBe(true)

    const { doc: next, selection } = editor.state
    expect(next.childCount).toBe(3)
    expect(next.child(0).textContent).toBe('Intro')
    expect(next.child(1).type.name).toBe('codeBlock')
    expect(next.child(1).attrs.language).toBe('plantuml')
    expect(next.child(1).textContent).toBe('@startuml\n@enduml')
    expect(next.child(2).textContent).toBe('Outro')
    expect(selection.from).toEqual({ path: [1], offset: '@startuml\n@enduml'.length })
  })

  it('treats an empty code block as content and inserts after it', () => {
    const editor = headless(code('typescript', ''))
    expect(editor.exec(insertDiagram())).toBe(true)
    const { doc: next } = editor.state
    expect(next.childCount).toBe(2)
    expect(next.child(0).attrs.language).toBe('typescript')
    expect(next.child(1).attrs.language).toBe('mermaid')
    expect(editor.state.selection.from.path).toEqual([1])
  })

  it('fails when the schema has no code block', () => {
    const nodes = defaultNodes()
    const { codeBlock: _omitted, ...rest } = nodes
    const bare = new Schema({ nodes: rest, marks: defaultMarks() })
    const editor = createEditor({ schema: bare })
    cleanups.push(() => editor.destroy())
    expect(editor.exec(insertDiagram())).toBe(false)
  })
})

describe('diagramUICommands', () => {
  it('bundles insertDiagram for the UI, defaulting to the template and mermaid', () => {
    const commands = diagramUICommands()
    expect(Object.keys(commands)).toEqual(['insertDiagram'])

    const editor = headless(para(''))
    expect(editor.exec(commands.insertDiagram())).toBe(true)
    expect(editor.state.doc.child(0).attrs.language).toBe('mermaid')
    expect(editor.state.doc.child(0).textContent).toBe(DEFAULT_DIAGRAM_TEMPLATE)
  })

  it('passes the given code and its configured language through', () => {
    const editor = headless(para(''))
    expect(editor.exec(diagramUICommands('plantuml').insertDiagram('@startuml'))).toBe(true)
    expect(editor.state.doc.child(0).attrs.language).toBe('plantuml')
    expect(editor.state.doc.child(0).textContent).toBe('@startuml')
  })
})

describe('createMermaidRenderer', () => {
  function fakeMermaid() {
    return {
      initialize: vi.fn(),
      render: vi.fn(async (id: string, source: string) => ({
        svg: `<svg id="${id}">${source}</svg>`,
      })),
    }
  }

  it('initializes once with safe defaults and passes a distinct id to every render', async () => {
    const mermaid = fakeMermaid()
    const render = createMermaidRenderer(mermaid, { theme: 'dark' })

    const first = await render('graph TD', { language: 'mermaid', id: 'trevixal-diagram-1' })
    const second = await render('graph LR', { language: 'mermaid', id: 'trevixal-diagram-2' })

    expect(mermaid.initialize).toHaveBeenCalledTimes(1)
    expect(mermaid.initialize).toHaveBeenCalledWith({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'dark',
    })
    expect(mermaid.render).toHaveBeenCalledTimes(2)
    const [[firstId, firstCode], [secondId, secondCode]] = mermaid.render.mock.calls
    expect(firstCode).toBe('graph TD')
    expect(secondCode).toBe('graph LR')
    expect(firstId).toMatch(/^trevixal-diagram-1/)
    expect(secondId).toMatch(/^trevixal-diagram-2/)
    expect(firstId).not.toBe(secondId)
    expect(first).toBe(`<svg id="${firstId}">graph TD</svg>`)
    expect(second).toBe(`<svg id="${secondId}">graph LR</svg>`)
  })

  it('lets config override the defaults and copes with a Mermaid that has no initialize', async () => {
    const strict = fakeMermaid()
    createMermaidRenderer(strict, { securityLevel: 'loose' })
    await createMermaidRenderer(strict, { securityLevel: 'loose' })('a', {
      language: 'mermaid',
      id: 'x',
    })
    expect(strict.initialize).toHaveBeenLastCalledWith({
      startOnLoad: false,
      securityLevel: 'loose',
    })

    const minimal = { render: vi.fn(async () => ({ svg: '<svg/>' })) }
    await expect(
      createMermaidRenderer(minimal)('a', { language: 'mermaid', id: 'x' }),
    ).resolves.toBe('<svg/>')
  })

  it('does not repeat a render with the same id even when the caller reuses one', async () => {
    const mermaid = fakeMermaid()
    const render = createMermaidRenderer(mermaid)
    await render('a', { language: 'mermaid', id: 'same' })
    await render('b', { language: 'mermaid', id: 'same' })
    const ids = mermaid.render.mock.calls.map(([id]) => id)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('loadMermaid', () => {
  const moduleUrl = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`

  it('returns the module default export when there is one', async () => {
    const mermaid = await loadMermaid(
      moduleUrl('export default { render: async (id, code) => ({ svg: `<svg>${code}</svg>` }) }'),
    )
    await expect(mermaid.render('id', 'graph TD')).resolves.toEqual({ svg: '<svg>graph TD</svg>' })
  })

  it('falls back to the module namespace and rejects modules without a Mermaid API', async () => {
    const namespace = await loadMermaid(
      moduleUrl('export const render = async () => ({ svg: "" })'),
    )
    expect(typeof namespace.render).toBe('function')
    await expect(loadMermaid(moduleUrl('export default 42'))).rejects.toThrow(
      /does not export a Mermaid API/,
    )
  })
})
