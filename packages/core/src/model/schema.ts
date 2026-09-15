import { type Attrs, computeAttrs } from './attrs'
import { type ContentTerm, matchesContent, parseContentExpr } from './content'
import { Fragment } from './fragment'
import { Mark, noMarks } from './mark'
import { EditorNode, TextNode } from './node'

/** Declarative HTML output for a node or mark, consumed by the HTML serializer. */
export interface HTMLSpec {
  readonly tag: string
  readonly attrs?: Readonly<Record<string, string>>
  /** Void elements (br, hr, img) render without children or a closing tag. */
  readonly isVoid?: boolean
  /** Optional inner wrapper tag (e.g. the `code` in `pre > code`). */
  readonly childTag?: string
  /** Literal text content for atom nodes (a badge's label, a footnote marker). */
  readonly text?: string
  /**
   * Trusted markup rendered inside an atom in place of `text`, a formula's
   * MathML, a link card's title and description. It is inserted verbatim by
   * both the serializer and the DOM renderer, so the spec author builds it
   * and must escape every dynamic value it carries.
   */
  readonly innerHTML?: string
}

/**
 * A rule for importing HTML: which tag maps to this node/mark, and how its
 * attributes translate. `getAttrs` returning `false` rejects the match (the
 * element is then treated as unknown: kept content, dropped formatting).
 */
export interface ParseRule {
  /** Lowercase tag name to match (e.g. `"h2"`, `"strong"`). */
  readonly tag: string
  /** Attribute that must additionally be present on the element. */
  readonly attribute?: string
  readonly getAttrs?: (element: HTMLElement) => Attrs | null | false
}

export interface NodeSpec {
  /** Content expression, e.g. `"block+"` or `"inline*"`. Omit for leaf nodes. */
  readonly content?: string
  /** Space-separated group names this node belongs to (e.g. `"block"`). */
  readonly group?: string
  readonly inline?: boolean
  readonly atom?: boolean
  readonly attrs?: Readonly<Record<string, { default?: unknown }>>
  /**
   * Marks allowed on inline content: `"_"` for all (default for textblocks),
   * `""` for none, or space-separated mark names.
   */
  readonly marks?: string
  /** Preserve whitespace verbatim when parsing into this node (code blocks). */
  readonly preserveWhitespace?: boolean
  readonly toHTML?: (node: EditorNode) => HTMLSpec
  readonly parseHTML?: readonly ParseRule[]
}

export interface MarkSpec {
  readonly attrs?: Readonly<Record<string, { default?: unknown }>>
  /** Space-separated mark names this mark excludes, or `"_"` for all. Always excludes itself. */
  readonly excludes?: string
  readonly toHTML?: (mark: Mark) => HTMLSpec
  readonly parseHTML?: readonly ParseRule[]
}

export interface SchemaSpec {
  readonly nodes: Readonly<Record<string, NodeSpec>>
  readonly marks?: Readonly<Record<string, MarkSpec>>
  /** Name of the top-level node type. Defaults to `"doc"`. */
  readonly topNode?: string
}

export class NodeType {
  private contentTerms: readonly ContentTerm[] = []
  private allowedMarks: 'all' | 'none' | ReadonlySet<string> = 'none'
  /** Whether this node's content expression admits inline children. */
  inlineContent = false

  constructor(
    readonly name: string,
    readonly schema: Schema,
    readonly spec: NodeSpec,
  ) {}

  get isText(): boolean {
    return this.name === 'text'
  }

  get isInline(): boolean {
    return this.isText || this.spec.inline === true
  }

  get isAtom(): boolean {
    return this.spec.atom === true
  }

  get groups(): readonly string[] {
    return this.spec.group ? this.spec.group.split(/\s+/) : []
  }

  /** @internal Resolve content expression and mark rules; called once by Schema. */
  resolve(resolveName: (name: string) => readonly string[]): void {
    this.contentTerms = this.spec.content ? parseContentExpr(this.spec.content, resolveName) : []
    const childNames = new Set<string>()
    for (const term of this.contentTerms) {
      for (const name of term.names) childNames.add(name)
    }
    const childTypes = [...childNames].map((name) => this.schema.nodeType(name))
    const hasInline = childTypes.some((type) => type.isInline)
    const hasBlock = childTypes.some((type) => !type.isInline)
    if (hasInline && hasBlock) {
      throw new RangeError(`Node "${this.name}" mixes inline and block content`)
    }
    this.inlineContent = hasInline
    const marks = this.spec.marks
    if (marks === undefined) {
      this.allowedMarks = this.inlineContent ? 'all' : 'none'
    } else if (marks === '_') {
      this.allowedMarks = 'all'
    } else if (marks.trim() === '') {
      this.allowedMarks = 'none'
    } else {
      this.allowedMarks = new Set(marks.trim().split(/\s+/))
    }
  }

  validContent(content: Fragment): boolean {
    return matchesContent(
      this.contentTerms,
      content.children.map((child) => child.type.name),
    )
  }

  allowsMarkType(markType: MarkType): boolean {
    if (this.allowedMarks === 'all') return true
    if (this.allowedMarks === 'none') return false
    return this.allowedMarks.has(markType.name)
  }

  /** True when this type can hold an empty fragment as content. */
  get allowsEmptyContent(): boolean {
    return matchesContent(this.contentTerms, [])
  }

  create(
    attrs?: Attrs,
    content: Fragment = Fragment.empty,
    marks: readonly Mark[] = noMarks,
  ): EditorNode {
    if (this.isText) throw new RangeError('Use schema.text() to create text nodes')
    return new EditorNode(
      this,
      computeAttrs(this.spec.attrs, attrs, `node "${this.name}"`),
      content,
      marks,
    )
  }

  /** Like {@link create} but validates the content against this type's expression. */
  createChecked(
    attrs?: Attrs,
    content: Fragment = Fragment.empty,
    marks: readonly Mark[] = noMarks,
  ): EditorNode {
    if (!this.validContent(content)) {
      throw new RangeError(`Invalid content for node type "${this.name}"`)
    }
    return this.create(attrs, content, marks)
  }
}

export class MarkType {
  private excluded: 'all' | ReadonlySet<string>

  constructor(
    readonly name: string,
    readonly rank: number,
    readonly spec: MarkSpec,
  ) {
    const excludes = spec.excludes
    if (excludes === '_') {
      this.excluded = 'all'
    } else {
      const names = excludes ? excludes.trim().split(/\s+/).filter(Boolean) : []
      this.excluded = new Set(names)
    }
  }

  /** Whether adding this mark should displace marks of `other`'s type. */
  excludes(other: MarkType): boolean {
    if (other === this) return true
    if (this.excluded === 'all') return true
    return this.excluded.has(other.name)
  }

  create(attrs?: Attrs): Mark {
    return new Mark(this, computeAttrs(this.spec.attrs, attrs, `mark "${this.name}"`))
  }
}

/**
 * The set of node and mark types a document may contain, plus factory helpers.
 * Requires a `text` node type and a top-level type (default `"doc"`).
 */
export class Schema {
  readonly nodes: Readonly<Record<string, NodeType>>
  readonly marks: Readonly<Record<string, MarkType>>
  readonly topType: NodeType
  readonly textType: NodeType

  constructor(readonly spec: SchemaSpec) {
    const nodes: Record<string, NodeType> = {}
    for (const [name, nodeSpec] of Object.entries(spec.nodes)) {
      nodes[name] = new NodeType(name, this, nodeSpec)
    }
    const marks: Record<string, MarkType> = {}
    let rank = 0
    for (const [name, markSpec] of Object.entries(spec.marks ?? {})) {
      marks[name] = new MarkType(name, rank++, markSpec)
    }
    this.nodes = nodes
    this.marks = marks

    const topName = spec.topNode ?? 'doc'
    const top = nodes[topName]
    if (!top) throw new RangeError(`Schema is missing its top node type "${topName}"`)
    const text = nodes.text
    if (!text) throw new RangeError('Schema is missing the required "text" node type')
    this.topType = top
    this.textType = text

    const groups = new Map<string, string[]>()
    for (const type of Object.values(nodes)) {
      for (const group of type.groups) {
        const members = groups.get(group) ?? []
        members.push(type.name)
        groups.set(group, members)
      }
    }
    const resolveName = (name: string): readonly string[] => {
      if (nodes[name]) return [name]
      return groups.get(name) ?? []
    }
    for (const type of Object.values(nodes)) type.resolve(resolveName)
  }

  nodeType(name: string): NodeType {
    const type = this.nodes[name]
    if (!type) throw new RangeError(`Unknown node type "${name}"`)
    return type
  }

  markType(name: string): MarkType {
    const type = this.marks[name]
    if (!type) throw new RangeError(`Unknown mark type "${name}"`)
    return type
  }

  node(
    name: string,
    attrs?: Attrs,
    content?: Fragment | readonly EditorNode[],
    marks?: readonly Mark[],
  ): EditorNode {
    const fragment = content instanceof Fragment ? content : Fragment.from(content ?? [])
    return this.nodeType(name).create(attrs, fragment, marks)
  }

  text(text: string, marks: readonly Mark[] = noMarks): TextNode {
    return new TextNode(this.textType, text, marks)
  }

  mark(name: string, attrs?: Attrs): Mark {
    return this.markType(name).create(attrs)
  }

  /** First non-text node type with inline content, used as the default block. */
  firstTextblockType(): NodeType {
    for (const type of Object.values(this.nodes)) {
      if (!type.isText && type.inlineContent && !type.isInline) return type
    }
    throw new RangeError('Schema has no textblock node type')
  }
}

/** Convenience factory matching the documented API: `schema({ nodes, marks })`. */
export function schema(spec: SchemaSpec): Schema {
  return new Schema(spec)
}
