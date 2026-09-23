import type { Fragment } from '../model/fragment'
import { inlineSize } from '../model/inline'
import type { EditorNode, TextNode } from '../model/node'
import type { HTMLSpec } from '../model/schema'
import { documentSettingsAttrs } from '../schema/document-settings'

/** An inline range in a textblock rendered with an extra class (search match, …). */
export interface InlineDecoration {
  readonly from: number
  readonly to: number
  readonly className: string
  /** Extra inline CSS on the decorated span (a per-range highlight colour, …). */
  readonly style?: string
  /**
   * Extra attributes on the decorated span, `data-` keys for a feature to
   * recognise its own spans by, `title`, `role`.
   *
   * A decoration that can only set a class name can be seen but not
   * identified: the painted span carries nothing linking it back to whatever
   * produced it, so a hover card or a click menu has no way to know which of
   * a block's decorations the pointer is over.
   */
  readonly attrs?: Readonly<Record<string, string>>
  /**
   * Zero-width widget rendered at `from` (requires `from === to`), e.g. a
   * marker pinned to one position. The element is wrapped in a non-editable
   * span the position mapper skips.
   */
  readonly widget?: () => HTMLElement
}

function decorationsEq(
  a: readonly InlineDecoration[] | null,
  b: readonly InlineDecoration[] | null,
): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((decoration, i) => {
    const other = b[i] as InlineDecoration
    return (
      decoration.from === other.from &&
      decoration.to === other.to &&
      decoration.className === other.className &&
      decoration.style === other.style &&
      sameAttrs(decoration.attrs, other.attrs) &&
      decoration.widget === other.widget
    )
  })
}

/** Whether two decorations' attribute maps would render the same span. */
function sameAttrs(
  a: Readonly<Record<string, string>> | undefined,
  b: Readonly<Record<string, string>> | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

/** Supplies decorations for a block node; null/empty means none. */
export type DecorationSource = (node: EditorNode) => readonly InlineDecoration[] | null

/**
 * A custom renderer for one node type. `dom` is the node's element; children
 * render into `contentDOM` when given, otherwise the node is an opaque widget
 * the editor never edits inside. `update` patches in place for a changed node
 * of the same type, return false to force a rebuild.
 */
export interface NodeViewInstance {
  readonly dom: HTMLElement
  readonly contentDOM?: HTMLElement
  update?(node: EditorNode): boolean
  destroy?(): void
}

/** Creates the view instance for a node (adapters close over their editor). */
export type NodeViewConstructor = (node: EditorNode) => NodeViewInstance

/**
 * Model → DOM renderer. Structural sharing in the immutable document makes
 * diffing cheap: a child that is reference-equal to what an element already
 * shows is skipped; a same-type block is patched in place; anything else is
 * rebuilt. The mapping from DOM elements back to model nodes lives in a
 * WeakMap consumed by position mapping and selection sync.
 */
export class DOMRenderer {
  /** DOM element/text → the model node it renders. */
  readonly modelOf = new WeakMap<globalThis.Node, EditorNode>()
  /** DOM element → the model node whose children it holds (differs for pre > code). */
  private readonly contentOf = new WeakMap<globalThis.Node, HTMLElement>()
  /** Bumps when decorations change, invalidating otherwise-unchanged blocks. */
  private epoch = 0
  private readonly renderedEpoch = new WeakMap<HTMLElement, number>()
  private decorations: DecorationSource | null = null
  /** Decorations each content element last rendered with, for cheap change checks. */
  private readonly renderedDecorations = new WeakMap<HTMLElement, readonly InlineDecoration[]>()
  private readonly instances = new WeakMap<HTMLElement, NodeViewInstance>()
  /** Attribute names the document's settings last put on the root. */
  private rootAttrs: readonly string[] = []

  constructor(
    private readonly document: Document,
    private readonly nodeViews: Readonly<Record<string, NodeViewConstructor>> = {},
  ) {}

  /** Install a decoration source and invalidate rendered blocks. */
  setDecorations(source: DecorationSource | null): void {
    this.decorations = source
    this.epoch++
  }

  /**
   * Sync the root element with the document node: its children, and the
   * attributes the document's settings are written as, which the stylesheet
   * reads off the editing surface just as it does off a saved page's wrapper.
   */
  renderDoc(doc: EditorNode, root: HTMLElement): void {
    this.modelOf.set(root, doc)
    this.contentOf.set(root, root)
    this.syncRootAttrs(doc, root)
    this.patchChildren(root, doc.content)
  }

  private syncRootAttrs(doc: EditorNode, root: HTMLElement): void {
    const next = documentSettingsAttrs(doc)
    for (const name of this.rootAttrs) {
      if (!(name in next)) root.removeAttribute(name)
    }
    for (const [name, value] of Object.entries(next)) {
      if (root.getAttribute(name) !== value) root.setAttribute(name, value)
    }
    this.rootAttrs = Object.keys(next)
  }

  /** The element that holds a rendered node's children. */
  contentElementOf(element: HTMLElement): HTMLElement {
    return this.contentOf.get(element) ?? element
  }

  private isCurrent(element: HTMLElement): boolean {
    return this.renderedEpoch.get(element) === this.epoch
  }

  /** Tear down node-view instances in a subtree about to leave the DOM. */
  destroyViews(element: HTMLElement): void {
    this.instances.get(element)?.destroy?.()
    for (const child of [...element.children]) this.destroyViews(child as HTMLElement)
  }

  private renderBlock(node: EditorNode): HTMLElement {
    const construct = this.nodeViews[node.type.name]
    if (construct) {
      const instance = construct(node)
      const element = instance.dom
      this.modelOf.set(element, node)
      this.contentOf.set(element, instance.contentDOM ?? element)
      this.renderedEpoch.set(element, this.epoch)
      this.instances.set(element, instance)
      if (instance.contentDOM) {
        if (node.isTextblock) this.renderInline(instance.contentDOM, node)
        else if (!node.isAtom) this.patchChildren(instance.contentDOM, node.content)
      } else {
        // Opaque widget: the editor never edits inside it.
        element.contentEditable = 'false'
      }
      return element
    }
    const spec = node.type.spec.toHTML?.(node)
    const element = this.document.createElement(spec?.tag ?? 'div')
    for (const [name, value] of Object.entries(spec?.attrs ?? {})) {
      element.setAttribute(name, value)
    }
    let content = element
    if (spec?.childTag) {
      content = this.document.createElement(spec.childTag)
      element.appendChild(content)
    }
    this.modelOf.set(element, node)
    this.contentOf.set(element, content)
    this.renderedEpoch.set(element, this.epoch)
    if (node.isAtom) {
      element.contentEditable = 'false'
      this.renderAtomBody(content, spec)
      return element
    }
    if (node.isTextblock) {
      this.renderInline(content, node)
    } else {
      this.patchChildren(content, node.content)
    }
    return element
  }

  /** Rebuild a textblock's inline DOM, splitting runs at decoration edges. */
  private renderInline(content: HTMLElement, block: EditorNode): void {
    while (content.firstChild) content.removeChild(content.firstChild)
    const frag = block.content
    const decorations = this.decorations?.(block) ?? []
    this.renderedDecorations.set(content, decorations)
    const ranges = decorations.filter((decoration) => decoration.to > decoration.from)
    const widgets = decorations
      .filter((decoration) => decoration.widget)
      .sort((a, b) => a.from - b.from)
    let widgetIndex = 0
    const flushWidgets = (upTo: number): void => {
      while (widgetIndex < widgets.length) {
        const decoration = widgets[widgetIndex] as InlineDecoration
        if (decoration.from > upTo) break
        widgetIndex++
        const wrapper = this.document.createElement('span')
        wrapper.className = decoration.className
        if (decoration.style) wrapper.setAttribute('style', decoration.style)
        for (const [name, value] of Object.entries(decoration.attrs ?? {})) {
          wrapper.setAttribute(name, value)
        }
        wrapper.contentEditable = 'false'
        wrapper.dataset.trevixalWidget = 'true'
        const inner = decoration.widget?.()
        if (inner) wrapper.appendChild(inner)
        content.appendChild(wrapper)
      }
    }
    let offset = 0
    for (const child of frag.children) {
      const size = inlineSize(child)
      if (!child.isText) {
        flushWidgets(offset)
        const spec = child.type.spec.toHTML?.(child)
        const atom = this.document.createElement(spec?.tag ?? 'span')
        for (const [name, value] of Object.entries(spec?.attrs ?? {})) {
          atom.setAttribute(name, value)
        }
        if (spec?.innerHTML !== undefined || spec?.text) {
          this.renderAtomBody(atom, spec)
          atom.contentEditable = 'false' // labelled chips are opaque to editing
        }
        this.modelOf.set(atom, child)
        content.appendChild(atom)
        offset += size
        continue
      }
      const text = child as TextNode
      for (const [from, to] of segmentRange(offset, offset + size, decorations)) {
        flushWidgets(from)
        const piece = text.cut(from - offset, to - offset)
        const rendered = this.renderTextRun(piece)
        const covering = ranges.filter(
          (decoration) => decoration.from <= from && decoration.to >= to,
        )
        if (covering.length > 0) {
          const span = this.document.createElement('span')
          span.className = covering.map((decoration) => decoration.className).join(' ')
          const style = covering
            .map((decoration) => decoration.style)
            .filter(Boolean)
            .join(';')
          if (style) span.setAttribute('style', style)
          for (const decoration of covering) {
            for (const [name, value] of Object.entries(decoration.attrs ?? {})) {
              span.setAttribute(name, value)
            }
          }
          span.appendChild(rendered)
          content.appendChild(span)
        } else {
          content.appendChild(rendered)
        }
      }
      offset += size
    }
    flushWidgets(offset)
    if (frag.childCount === 0) {
      // contenteditable needs something to park the caret in.
      const br = this.document.createElement('br')
      br.dataset.trevixalPlaceholder = 'true'
      content.appendChild(br)
    }
  }

  private renderTextRun(node: TextNode): globalThis.Node {
    let rendered: globalThis.Node = this.document.createTextNode(node.text)
    this.modelOf.set(rendered, node)
    for (let i = node.marks.length - 1; i >= 0; i--) {
      const mark = node.marks[i]
      const spec = mark.type.spec.toHTML?.(mark)
      if (!spec) continue
      const wrapper = this.document.createElement(spec.tag)
      for (const [name, value] of Object.entries(spec.attrs ?? {})) {
        wrapper.setAttribute(name, value)
      }
      wrapper.appendChild(rendered)
      rendered = wrapper
    }
    return rendered
  }

  /** Diff an element's children against a block-level fragment. */
  private patchChildren(parent: HTMLElement, frag: Fragment): void {
    const oldElements = [...parent.children] as HTMLElement[]
    const oldNodes = oldElements.map((element) => this.modelOf.get(element) ?? null)
    const next = frag.children

    const unchanged = (index: number, newIndex: number): boolean => {
      const element = oldElements[index]
      return element !== undefined && oldNodes[index] === next[newIndex] && this.isCurrent(element)
    }
    let start = 0
    while (start < oldNodes.length && start < next.length && unchanged(start, start)) start++
    let oldEnd = oldNodes.length
    let newEnd = next.length
    while (oldEnd > start && newEnd > start && unchanged(oldEnd - 1, newEnd - 1)) {
      oldEnd--
      newEnd--
    }

    // Middle segment: patch leading pairs in place (same type), then
    // insert or remove the length difference before the common suffix.
    const shared = Math.min(oldEnd - start, newEnd - start)
    for (let k = 0; k < shared; k++) {
      const element = oldElements[start + k]
      const oldNode = oldNodes[start + k]
      const node = next[start + k]
      if (!element || !node) continue
      // In-place patching also requires the rendered tag to be stable
      // (a table cell flips td ↔ th when its header attribute changes);
      // node views decide for themselves via their update() hook.
      const isView = this.instances.has(element)
      const tag = (node.type.spec.toHTML?.(node)?.tag ?? 'div').toUpperCase()
      if (oldNode && oldNode.type === node.type && (isView || element.tagName === tag)) {
        if (!this.patchElement(element, node)) {
          this.destroyViews(element)
          parent.replaceChild(this.renderBlock(node), element)
        }
      } else {
        this.destroyViews(element)
        parent.replaceChild(this.renderBlock(node), element)
      }
    }
    const suffixAnchor = oldElements[oldEnd] ?? null
    for (let i = start + shared; i < newEnd; i++) {
      const node = next[i]
      if (node) parent.insertBefore(this.renderBlock(node), suffixAnchor)
    }
    for (let i = start + shared; i < oldEnd; i++) {
      const element = oldElements[i]
      if (!element) continue
      this.destroyViews(element)
      element.remove()
    }
  }

  /** Update an element in place; false means the caller must rebuild it. */
  private patchElement(element: HTMLElement, node: EditorNode): boolean {
    const previous = this.modelOf.get(element)
    const wasCurrent = this.isCurrent(element)
    if (previous === node && wasCurrent) return true

    const instance = this.instances.get(element)
    if (instance) {
      if (!instance.update || !instance.update(node)) return false
      this.modelOf.set(element, node)
      this.renderedEpoch.set(element, this.epoch)
      if (instance.contentDOM && !node.isAtom) {
        if (node.isTextblock) {
          if (this.inlineNeedsRender(instance.contentDOM, previous, wasCurrent, node)) {
            this.renderInline(instance.contentDOM, node)
          }
        } else {
          this.patchChildren(instance.contentDOM, node.content)
        }
      }
      return true
    }

    const spec = node.type.spec.toHTML?.(node)
    const nextAttrs = spec?.attrs ?? {}
    if (previous) {
      // Drop attributes the previous render emitted that the new one doesn't.
      const oldAttrs = previous.type.spec.toHTML?.(previous)?.attrs ?? {}
      for (const name of Object.keys(oldAttrs)) {
        if (!(name in nextAttrs)) element.removeAttribute(name)
      }
    }
    for (const [name, value] of Object.entries(nextAttrs)) {
      // Only when it differs. Assigning an attribute the value it already has
      // is still a write: it invalidates style, it shows up as a mutation to
      // anything observing, and on an `<iframe>` assigning `src` reloads the
      // frame, so an embedded video restarted every time anything re-rendered
      // the document, which a decoration layer does on a timer. That is what a
      // reader sees as the page blinking.
      if (element.getAttribute(name) !== value) element.setAttribute(name, value)
    }
    this.modelOf.set(element, node)
    this.renderedEpoch.set(element, this.epoch)
    const content = this.contentElementOf(element)
    if (node.isAtom) {
      // An atom's body comes from its spec, so it changes only with its attrs.
      const previousSpec = previous ? previous.type.spec.toHTML?.(previous) : undefined
      if (spec?.innerHTML !== previousSpec?.innerHTML || spec?.text !== previousSpec?.text) {
        this.renderAtomBody(content, spec)
      }
    } else if (node.isTextblock) {
      if (this.inlineNeedsRender(content, previous, wasCurrent, node)) {
        this.renderInline(content, node)
      }
    } else {
      this.patchChildren(content, node.content)
    }
    return true
  }

  /** Fill an atom's element from its spec: trusted markup, or a text label. */
  private renderAtomBody(element: HTMLElement, spec: HTMLSpec | undefined): void {
    if (spec?.innerHTML !== undefined) element.innerHTML = spec.innerHTML
    else if (spec?.text !== undefined) element.textContent = spec.text
    // A spec that stopped offering a body means the atom no longer has one;
    // leaving the previous render in place would show a stale label.
    else element.textContent = ''
  }

  /**
   * A textblock's inline DOM must be rebuilt when its content changed, or
   * when the decorations it renders with changed, either from an epoch bump
   * or because this node itself is different. A decoration source may key off
   * a node's attributes (a code block's `language`, say), so identical
   * content is not on its own enough to reuse the rendered inline DOM.
   */
  private inlineNeedsRender(
    content: HTMLElement,
    previous: EditorNode | null | undefined,
    wasCurrent: boolean,
    node: EditorNode,
  ): boolean {
    if (!previous || !previous.content.eq(node.content)) return true
    // Same node object and a current epoch: nothing can have changed.
    if (wasCurrent && previous === node) return false
    const next = this.decorations?.(node) ?? []
    return !decorationsEq(this.renderedDecorations.get(content) ?? [], next)
  }
}

/** Cut [from, to) at every decoration boundary that falls inside it. */
function segmentRange(
  from: number,
  to: number,
  decorations: readonly InlineDecoration[],
): [number, number][] {
  const cuts = new Set<number>([from, to])
  for (const decoration of decorations) {
    if (decoration.from > from && decoration.from < to) cuts.add(decoration.from)
    if (decoration.to > from && decoration.to < to) cuts.add(decoration.to)
  }
  const sorted = [...cuts].sort((a, b) => a - b)
  const segments: [number, number][] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    segments.push([sorted[i] as number, sorted[i + 1] as number])
  }
  return segments
}
