import { Fragment } from '../model/fragment'
import { mergeInline } from '../model/inline'
import type { Mark } from '../model/mark'
import type { EditorNode } from '../model/node'
import { normalizeDoc } from '../model/normalize'
import type { MarkType, NodeType, ParseRule, Schema } from '../model/schema'

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
    const list = this.byTag.get(element.tagName.toLowerCase())
    if (!list) return null
    for (const { owner, rule } of list) {
      if (rule.attribute && !element.hasAttribute(rule.attribute)) continue
      if (!rule.getAttrs) return { owner, attrs: null }
      const attrs = rule.getAttrs(element)
      if (attrs === false) continue
      return { owner, attrs: (attrs as Record<string, unknown>) ?? null }
    }
    return null
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

  parse(root: globalThis.Node): EditorNode {
    const children = this.parseChildren(root, [], false)
    const doc = this.schema.topType.create(undefined, Fragment.from(children))
    return normalizeDoc(doc)
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

    const markMatch = this.markRules.match(element)
    if (markMatch) {
      const mark = markMatch.owner.create(markMatch.attrs ?? undefined)
      return this.parseChildren(element, mark.addToSet(marks), inlineContext)
    }

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
      const children = this.parseChildren(element, inline ? marks : [], inline)
      if (inline) {
        const inlineChildren = children.filter((child) => child.isInline)
        return [type.create(attrs, mergeInline(Fragment.from(inlineChildren)))]
      }
      return [type.create(attrs, Fragment.from(children))]
    }

    // A dangerous tag whose claiming rule refused it (an iframe pointing
    // somewhere the schema does not allow) is dropped along with its subtree,
    // exactly as an unclaimed one is. Keeping the children would let markup
    // nested inside a rejected frame slip into the document.
    if (dangerous) return []

    // Unknown element (div, span, font, o:p, …): keep content, drop formatting.
    return this.parseChildren(element, marks, inlineContext)
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
  let parser = parserCache.get(schema)
  if (!parser) {
    parser = new HTMLParser(schema)
    parserCache.set(schema, parser)
  }
  return parser.parse(template.content)
}
