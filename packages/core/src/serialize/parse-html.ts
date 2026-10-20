import { Fragment } from '../model/fragment'
import { mergeInline } from '../model/inline'
import type { Mark } from '../model/mark'
import type { EditorNode } from '../model/node'
import { normalizeDoc } from '../model/normalize'
import type { MarkType, NodeType, ParseRule, Schema } from '../model/schema'
import { documentSettingsElement, parseDocumentSettings } from '../schema/document-settings'

/**
 * Sanitizing HTML import. Security model: sanitize-by-construction. The
 * parser only ever *builds model nodes* from an allowlist of parse rules, so
 * scripts, event handlers, unknown embeds and styles can never reach the
 * document. Dangerous subtrees are dropped wholesale; unknown elements keep
 * their content but lose their formatting. No `innerHTML` is ever written.
 */

/** Elements whose entire subtree is discarded. */
const DANGEROUS_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'object',
  'embed',
  'applet',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'svg',
  'math',
  'template',
  'title',
  'head',
  'noscript',
])

/**
 * The elements HTML lays out as blocks. One the schema has no rule for (a
 * `div`, a `section`) still ends the line before it and starts one after:
 * its text is a paragraph of its own, not run into its neighbours'.
 */
const BLOCK_LEVEL_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'center',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'ul',
])

/**
 * The marks an element's own `style` says its text has, as Google Docs and
 * many web pages write them: `font-weight: 700` rather than `<b>`. Each is
 * a mark only a schema that has it gets; `font-weight: normal` takes a bold
 * the element was given by its tag away again.
 */
const STYLE_MARKS: readonly {
  readonly mark: string
  readonly property: RegExp
  readonly on: RegExp
  readonly off?: RegExp
}[] = [
  {
    mark: 'bold',
    property: /font-weight\s*:\s*([^;]+)/i,
    on: /^(bold|bolder|[6-9]00)$/i,
    off: /^(normal|lighter|[1-4]00)$/i,
  },
  {
    mark: 'italic',
    property: /font-style\s*:\s*([^;]+)/i,
    on: /^(italic|oblique)/i,
    off: /^normal$/i,
  },
  { mark: 'underline', property: /text-decoration(?:-line)?\s*:\s*([^;]+)/i, on: /underline/i },
  {
    mark: 'strikethrough',
    property: /text-decoration(?:-line)?\s*:\s*([^;]+)/i,
    on: /line-through/i,
  },
  { mark: 'superscript', property: /vertical-align\s*:\s*([^;]+)/i, on: /^super/i },
  { mark: 'subscript', property: /vertical-align\s*:\s*([^;]+)/i, on: /^sub/i },
]

interface RuleMatch<T> {
  readonly owner: T
  readonly rule: ParseRule
}

class RuleSet<T> {
  private byTag = new Map<string, RuleMatch<T>[]>()

  add(owner: T, rule: ParseRule): void {
    const list = this.byTag.get(rule.tag) ?? []
    // Attribute-constrained rules are more specific: try them first.
    if (rule.attribute) list.unshift({ owner, rule })
    else list.push({ owner, rule })
    this.byTag.set(rule.tag, list)
  }

  /** Whether any rule claims this (lowercase) tag name. */
  hasTag(tag: string): boolean {
    return this.byTag.has(tag)
  }

  /** First matching rule for an element, with resolved attributes. */
  match(element: HTMLElement): { owner: T; attrs: Record<string, unknown> | null } | null {
    return this.matchAll(element, true)[0] ?? null
  }

  /**
   * Every owner a rule matches the element for, each once, in rule order:
   * a span styled `font-size: 14pt; font-family: Georgia` is both a size and
   * a font, as Word writes one, and the first match alone lost the second.
   */
  matchAll(
    element: HTMLElement,
    first = false,
  ): { owner: T; attrs: Record<string, unknown> | null }[] {
    const list = this.byTag.get(element.tagName.toLowerCase())
    const found: { owner: T; attrs: Record<string, unknown> | null }[] = []
    for (const { owner, rule } of list ?? []) {
      if (found.some((match) => match.owner === owner)) continue
      if (rule.attribute && !element.hasAttribute(rule.attribute)) continue
      const attrs = rule.getAttrs ? rule.getAttrs(element) : null
      if (attrs === false) continue
      found.push({ owner, attrs: (attrs as Record<string, unknown> | null | undefined) ?? null })
      if (first) break
    }
    return found
  }
}

class HTMLParser {
  private readonly nodeRules = new RuleSet<NodeType>()
  private readonly markRules = new RuleSet<MarkType>()

  constructor(private readonly schema: Schema) {
    for (const type of Object.values(schema.nodes)) {
      for (const rule of type.spec.parseHTML ?? []) this.nodeRules.add(type, rule)
    }
    for (const type of Object.values(schema.marks)) {
      for (const rule of type.spec.parseHTML ?? []) this.markRules.add(type, rule)
    }
  }

  /** The marks in effect inside an element, once its own `style` is taken into account. */
  private styled(element: HTMLElement, marks: readonly Mark[]): readonly Mark[] {
    const style = element.getAttribute('style')
    if (!style) return marks
    let result = marks
    for (const entry of STYLE_MARKS) {
      const type = this.schema.marks[entry.mark]
      const value = entry.property.exec(style)?.[1]?.trim()
      if (!type || !value) continue
      if (entry.on.test(value)) result = type.create().addToSet(result)
      else if (entry.off?.test(value)) result = result.filter((mark) => mark.type !== type)
    }
    return result
  }

  parse(root: globalThis.Node): EditorNode {
    const children = this.parseBlockContainer(root, [])
    // The wrapper carrying the document's settings is an unknown element to
    // the rules above, so its blocks were kept; its attributes are the doc's.
    const carrier = 'querySelector' in root ? documentSettingsElement(root as ParentNode) : null
    const attrs = carrier ? parseDocumentSettings(carrier) : undefined
    const doc = this.schema.topType.create(attrs, Fragment.from(children))
    return normalizeDoc(doc)
  }

  /**
   * Children laid out as blocks, as a page's body or a `div` lays them out:
   * each block-level child a block, and each run of text and inline elements
   * between them a paragraph. The text keeps its spaces, which in a block
   * context would be dropped as layout noise: `<b>A</b> <i>B</i>` read `AB`.
   */
  private parseBlockContainer(parent: globalThis.Node, marks: readonly Mark[]): EditorNode[] {
    const children = [...parent.childNodes].flatMap((child) => {
      const block =
        child.nodeType === 1 && BLOCK_LEVEL_TAGS.has((child as Element).tagName.toLowerCase())
      return this.parseNode(child, marks, !block)
    })
    return liftedBlocks(this.schema.firstTextblockType(), undefined, children)
  }

  /** Parse element children into a mixed node list; normalization sorts strays. */
  private parseChildren(
    parent: globalThis.Node,
    marks: readonly Mark[],
    inlineContext: boolean,
  ): EditorNode[] {
    const out: EditorNode[] = []
    for (const child of [...parent.childNodes]) {
      out.push(...this.parseNode(child, marks, inlineContext))
    }
    return out
  }

  private parseNode(
    node: globalThis.Node,
    marks: readonly Mark[],
    inlineContext: boolean,
  ): EditorNode[] {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      const collapsed = (node.textContent ?? '').replace(/\s+/g, ' ')
      if (collapsed === '') return []
      if (collapsed === ' ') {
        // Whitespace between blocks is layout noise; between inline it counts.
        return inlineContext ? [this.schema.text(' ', marks)] : []
      }
      return [this.schema.text(collapsed, marks)]
    }
    if (node.nodeType !== 1 /* ELEMENT_NODE */) return []
    const element = node as HTMLElement
    const tag = element.tagName.toLowerCase()
    // A schema that declares a parse rule for one of these (an embed
    // extension's iframe or video) has opted in; its `getAttrs` is then
    // responsible for vetting the source. Everything else is dropped whole.
    const dangerous = DANGEROUS_TAGS.has(tag)
    if (dangerous && !this.nodeRules.hasTag(tag)) return []

    // A span is every mark its style names (Word's size and font on one);
    // any other tag is the one mark its first rule makes of it, as a `<del>`
    // is a suggested deletion or a strikethrough, never both.
    const markMatches = this.markRules.matchAll(element, tag !== 'span' && tag !== 'font')
    if (markMatches.length > 0) {
      const set = markMatches.reduce(
        (each, match) => match.owner.create(match.attrs ?? undefined).addToSet(each),
        marks,
      )
      return this.parseChildren(element, this.styled(element, set), inlineContext)
    }
    const inherited = this.styled(element, marks)

    const nodeMatch = this.nodeRules.match(element)
    if (nodeMatch) {
      const type = nodeMatch.owner
      const attrs = nodeMatch.attrs ?? undefined
      if (type.spec.preserveWhitespace) {
        // Code blocks: take the raw text, verbatim.
        const text = element.textContent ?? ''
        const content = text ? Fragment.of(this.schema.text(text)) : Fragment.empty
        return [type.create(attrs, content)]
      }
      if (!type.spec.content) {
        return [type.create(attrs)] // leaf (hr, br)
      }
      const inline = type.inlineContent
      const children = this.parseChildren(element, inline ? inherited : [], inline)
      if (inline) {
        const inlineChildren = children.filter((child) => child.isInline)
        const blocks = children.filter((child) => !child.isInline)
        if (blocks.length === 0 || inlineContext) {
          return [type.create(attrs, mergeInline(Fragment.from(inlineChildren)))]
        }
        return liftedBlocks(type, attrs, children)
      }
      return [type.create(attrs, Fragment.from(children))]
    }

    // A dangerous tag whose claiming rule refused it (an iframe pointing
    // somewhere the schema does not allow) is dropped along with its subtree,
    // exactly as an unclaimed one is. Keeping the children would let markup
    // nested inside a rejected frame slip into the document.
    if (dangerous) return []

    // Unknown element (div, span, font, o:p, …): keep content, drop formatting
    // but what its style says of its text. A block-level one still lays its
    // content out as blocks.
    if (!inlineContext && BLOCK_LEVEL_TAGS.has(tag))
      return this.parseBlockContainer(element, inherited)
    return this.parseChildren(element, inherited, inlineContext)
  }
}

/**
 * A textblock that held blocks, a picture where the schema's pictures are
 * blocks, as the textblocks either side of each and the block between: the
 * picture a web page puts in a `<p>` is kept, not dropped with the paragraph
 * that cannot hold it.
 */
function liftedBlocks(
  type: NodeType,
  attrs: Record<string, unknown> | undefined,
  children: readonly EditorNode[],
): EditorNode[] {
  const out: EditorNode[] = []
  let run: EditorNode[] = []
  const flush = (): void => {
    if (run.some((child) => !child.isText || child.textContent.trim() !== '')) {
      out.push(type.create(attrs, mergeInline(Fragment.from(run))))
    }
    run = []
  }
  for (const child of children) {
    if (child.isInline) {
      run.push(child)
      continue
    }
    flush()
    out.push(child)
  }
  flush()
  return out
}

/** An item's depth, as Google Docs writes it: `aria-level`, 1 at the top. */
function itemLevel(item: Element): number {
  const level = Number(item.getAttribute('aria-level'))
  return Number.isInteger(level) && level > 0 ? level : 1
}

/**
 * Google Docs writes a nested list flat: every item in one list, its depth in
 * `aria-level`. Each deeper item goes into a list of its own inside the item
 * before it, so the nesting survives the paste instead of every item landing
 * on one level.
 */
function nestLeveledItems(root: ParentNode): void {
  for (const list of root.querySelectorAll('ul, ol')) {
    const items = [...list.children].filter((child) => child.tagName === 'LI')
    if (!items.some((item) => item.hasAttribute('aria-level'))) continue
    // The lists open at each depth, and the item each last took: the one a
    // deeper item nests under.
    type Open = { level: number; list: Element; last: Element | null }
    const lists: Open[] = [{ level: Math.min(...items.map(itemLevel)), list, last: null }]
    for (const item of items) {
      const level = itemLevel(item)
      while (lists.length > 1 && (lists[lists.length - 1] as Open).level > level) lists.pop()
      let current = lists[lists.length - 1] as Open
      if (level > current.level && current.last) {
        const nested = list.ownerDocument.createElement(list.tagName)
        current.last.appendChild(nested)
        current = { level, list: nested, last: null }
        lists.push(current)
      }
      if (current.list !== list) current.list.appendChild(item)
      current.last = item
    }
  }
}

const parserCache = new WeakMap<Schema, HTMLParser>()

/**
 * Parse an HTML string into a normalized document. Requires a DOM
 * environment (or an explicit `Document`, e.g. from happy-dom in tests).
 */
export function parseHTML(schema: Schema, html: string, document?: Document): EditorNode {
  const dom = document ?? (typeof window !== 'undefined' ? window.document : null)
  if (!dom) {
    throw new RangeError('parseHTML needs a DOM environment; pass a Document explicitly in Node')
  }
  // A template's content fragment is inert by spec: scripts never execute
  // and embedded resources (iframes, images) never load while we walk it.
  const template = dom.createElement('template') as HTMLTemplateElement
  template.innerHTML = html
  nestLeveledItems(template.content)
  let parser = parserCache.get(schema)
  if (!parser) {
    parser = new HTMLParser(schema)
    parserCache.set(schema, parser)
  }
  return parser.parse(template.content)
}
