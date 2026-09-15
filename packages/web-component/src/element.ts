import {
  type DocJSON,
  type Editor,
  type EditorNode,
  type NodeViewFactory,
  ReplaceNodesStep,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  nodeFromJSON,
  parseHTML,
} from '@trevixal/core'

/** Detail payload of the `trevixal-change` CustomEvent. */
export interface TrevixalChangeDetail {
  readonly json: DocJSON
  readonly html: string
}

/**
 * `HTMLElement` does not exist while server-rendering, and a class body is
 * evaluated at import time. Extending a stand-in keeps the module importable
 * in Node; the element is only ever registered where the real DOM exists.
 */
const ElementBase: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement

/**
 * `<trevixal-editor>`: the editor as a custom element.
 *
 * Attributes: `placeholder`, `readonly`, `autofocus`. Initial content comes
 * from the element's HTML children (sanitized on parse). Emits a bubbling
 * `trevixal-change` CustomEvent with `{ json, html }` on every document
 * change. The full API is reachable via the `editor` property.
 */
export class TrevixalEditorElement extends ElementBase {
  static get observedAttributes(): string[] {
    return ['readonly']
  }

  editor: Editor | null = null
  private schemaValue: Schema | null = null
  /**
   * Document held while no editor exists: content assigned before the element
   * was connected, and the document rescued when it is disconnected (moving an
   * element in the DOM disconnects and reconnects it).
   */
  private pendingDoc: EditorNode | null = null

  /**
   * Custom renderers per node type, for rendering your own elements inside
   * the document. A property rather than an attribute, because a factory is
   * not a string; set it before the element is connected, or reconnect it.
   *
   * ```js
   * editor.nodeViews = {
   *   counter: (node) => {
   *     const dom = document.createElement('my-counter')
   *     dom.count = node.attrs.count
   *     return { dom, update: (next) => ((dom.count = next.attrs.count), true) }
   *   },
   * }
   * ```
   */
  nodeViews: Readonly<Record<string, NodeViewFactory>> | undefined

  /**
   * The document schema. Defaults to the basic node and mark set; assign one
   * to add types, tables, images, a block of your own.
   *
   * ```js
   * editor.schema = new Schema({
   *   nodes: { ...defaultNodes(), ...tableNodes() },
   *   marks: defaultMarks(),
   * })
   * ```
   *
   * Set it before the element is connected where you can. Assigning to a
   * live editor rebuilds it, carrying the document across as HTML. Anything
   * the new schema cannot parse is dropped, which is the honest outcome when
   * the rules a document was written under have changed.
   */
  get schema(): Schema {
    return this.ensureSchema()
  }

  set schema(value: Schema) {
    if (this.schemaValue === value) return
    const html = this.editor?.getHTML() ?? null
    this.schemaValue = value
    if (!this.editor) return
    this.editor.destroy()
    this.editor = null
    this.pendingDoc = html ? parseHTML(value, html, this.ownerDocument) : null
    this.connectedCallback()
  }

  connectedCallback(): void {
    if (this.editor) return
    const schema = this.ensureSchema()
    const pending = this.pendingDoc
    this.pendingDoc = null
    const initial = this.innerHTML.trim()
    this.replaceChildren()
    this.editor = createEditor({
      schema,
      doc: pending ?? (initial ? parseHTML(schema, initial, this.ownerDocument) : undefined),
      element: this,
      placeholder: this.getAttribute('placeholder') ?? undefined,
      editable: !this.hasAttribute('readonly'),
      autofocus: this.hasAttribute('autofocus'),
      ...(this.nodeViews ? { nodeViews: this.nodeViews } : {}),
      onChange: ({ json, html }) => {
        this.dispatchEvent(
          new CustomEvent<TrevixalChangeDetail>('trevixal-change', {
            detail: { json, html },
            bubbles: true,
          }),
        )
      },
    })

    // An element whose definition is already loaded upgrades the instant its
    // opening tag is seen, before the parser has reached the markup between
    // the tags. Server-rendered content would simply be lost, which is the
    // one case where losing it matters most. So when we start empty while the
    // document is still being parsed, take whatever lands inside afterwards.
    if (!pending && !initial && this.ownerDocument.readyState === 'loading') {
      this.adoptParsedChildren()
    }
  }

  /**
   * Adopt markup the parser put inside this element after the editor was
   * created. The view's own DOM and the live region are ours; anything else
   * arrived from the page and is the document it wanted.
   */
  private adoptParsedChildren(): void {
    this.ownerDocument.addEventListener(
      'DOMContentLoaded',
      () => {
        const editor = this.editor
        const surface = editor?.view?.dom
        if (!editor) return
        const strays = [...this.children].filter(
          (child) => child !== surface && !child.classList.contains('trevixal-announcer'),
        )
        if (strays.length === 0) return
        const html = strays.map((child) => child.outerHTML).join('')
        for (const stray of strays) stray.remove()
        // `setContent` clears history: this is the document's starting point,
        // not an edit somebody should be able to undo their way behind.
        editor.setContent(parseHTML(this.ensureSchema(), html, this.ownerDocument))
      },
      { once: true },
    )
  }

  disconnectedCallback(): void {
    // Keep the document so a re-insertion (a DOM move, a framework re-parent)
    // restores it instead of starting from an empty doc.
    if (this.editor) this.pendingDoc = this.editor.state.doc
    this.editor?.destroy()
    this.editor = null
  }

  attributeChangedCallback(name: string): void {
    if (name === 'readonly') this.editor?.setEditable(!this.hasAttribute('readonly'))
  }

  /** Document as sanitized HTML. Setting replaces the whole document. */
  get value(): string {
    return this.editor?.getHTML() ?? ''
  }

  set value(html: string) {
    this.applyDoc(parseHTML(this.ensureSchema(), html, this.ownerDocument))
  }

  getJSON(): DocJSON | null {
    return this.editor?.getJSON() ?? null
  }

  setJSON(json: DocJSON): void {
    this.applyDoc(nodeFromJSON(this.ensureSchema(), json))
  }

  private ensureSchema(): Schema {
    if (!this.schemaValue) {
      this.schemaValue = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
    }
    return this.schemaValue
  }

  private applyDoc(doc: EditorNode): void {
    const editor = this.editor
    if (!editor) {
      this.pendingDoc = doc
      return
    }
    // A framework binding re-assigns `value` on every render; replacing the
    // document with an identical one would reset the caret each time.
    if (JSON.stringify(doc.toJSON()) === JSON.stringify(editor.getJSON())) return
    this.replaceDocument(doc)
  }

  private replaceDocument(doc: EditorNode): void {
    const editor = this.editor
    if (!editor) return
    const tr = editor.state.tr
    tr.step(new ReplaceNodesStep([], 0, editor.state.doc.childCount, doc.content))
    tr.setSelection(TextSelection.atStart(tr.doc))
    editor.dispatch(tr)
  }
}

/** Register the element (idempotent). */
export function defineTrevixalEditor(tag = 'trevixal-editor'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) {
    customElements.define(tag, TrevixalEditorElement)
  }
}
