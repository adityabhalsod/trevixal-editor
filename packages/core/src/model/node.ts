import { type Attrs, attrsEq, emptyAttrs } from './attrs'
import { Fragment } from './fragment'
import { type Mark, type MarkJSON, marksEq, noMarks } from './mark'
import type { NodeType } from './schema'

/** JSON shape of a serialized node. */
export interface NodeJSON {
  readonly type: string
  readonly attrs?: Record<string, unknown>
  readonly content?: readonly NodeJSON[]
  readonly marks?: readonly MarkJSON[]
  readonly text?: string
}

/**
 * A node in the document tree. Immutable. All "mutators" return new nodes.
 * Text lives in the {@link TextNode} subclass.
 */
export class EditorNode {
  constructor(
    readonly type: NodeType,
    readonly attrs: Attrs = emptyAttrs,
    readonly content: Fragment = Fragment.empty,
    readonly marks: readonly Mark[] = noMarks,
  ) {}

  get isText(): boolean {
    return false
  }

  get isInline(): boolean {
    return this.type.isInline
  }

  get isBlock(): boolean {
    return !this.type.isInline
  }

  /** True when this node has no editable content of its own (image, hr, …). */
  get isAtom(): boolean {
    return this.type.isAtom
  }

  /** True when this node directly contains inline content (paragraph, heading, …). */
  get isTextblock(): boolean {
    return this.type.inlineContent
  }

  get childCount(): number {
    return this.content.childCount
  }

  child(index: number): EditorNode {
    return this.content.child(index)
  }

  get textContent(): string {
    let text = ''
    for (const child of this.content.children) {
      text += child.isText ? (child as TextNode).text : child.textContent
    }
    return text
  }

  withContent(content: Fragment): EditorNode {
    return new EditorNode(this.type, this.attrs, content, this.marks)
  }

  withAttrs(attrs: Attrs): EditorNode {
    return new EditorNode(this.type, attrs, this.content, this.marks)
  }

  withMarks(marks: readonly Mark[]): EditorNode {
    return new EditorNode(this.type, this.attrs, this.content, marks)
  }

  eq(other: EditorNode): boolean {
    if (this === other) return true
    return (
      this.type === other.type &&
      attrsEq(this.attrs, other.attrs) &&
      marksEq(this.marks, other.marks) &&
      this.content.eq(other.content)
    )
  }

  toJSON(): NodeJSON {
    const json: {
      type: string
      attrs?: Record<string, unknown>
      content?: NodeJSON[]
      marks?: MarkJSON[]
    } = { type: this.type.name }
    const attrs = nonDefaultAttrs(this.type.spec.attrs, this.attrs)
    if (attrs) json.attrs = attrs
    if (this.content.childCount > 0) json.content = this.content.children.map((c) => c.toJSON())
    if (this.marks.length > 0) json.marks = this.marks.map((m) => m.toJSON())
    return json
  }
}

/** A run of text with a uniform mark set. */
export class TextNode extends EditorNode {
  constructor(
    type: NodeType,
    readonly text: string,
    marks: readonly Mark[] = noMarks,
  ) {
    if (text.length === 0) throw new RangeError('TextNode may not be empty')
    super(type, emptyAttrs, Fragment.empty, marks)
  }

  override get isText(): boolean {
    return true
  }

  override get textContent(): string {
    return this.text
  }

  withText(text: string): TextNode {
    return new TextNode(this.type, text, this.marks)
  }

  override withMarks(marks: readonly Mark[]): TextNode {
    return new TextNode(this.type, this.text, marks)
  }

  cut(from: number, to: number = this.text.length): TextNode {
    return this.withText(this.text.slice(from, to))
  }

  override eq(other: EditorNode): boolean {
    if (this === other) return true
    return (
      other.isText && (other as TextNode).text === this.text && marksEq(this.marks, other.marks)
    )
  }

  override toJSON(): NodeJSON {
    const json: { type: string; text: string; marks?: MarkJSON[] } = {
      type: this.type.name,
      text: this.text,
    }
    if (this.marks.length > 0) json.marks = this.marks.map((m) => m.toJSON())
    return json
  }
}

/**
 * Attributes worth serializing: values equal to their schema default are
 * omitted, since {@link computeAttrs} restores them on load. Keeps stored
 * documents free of noise like  on every paragraph.
 */
function nonDefaultAttrs(
  specAttrs: Readonly<Record<string, { default?: unknown }>> | undefined,
  attrs: Attrs,
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(attrs)) {
    const spec = specAttrs?.[name]
    if (spec && 'default' in spec && spec.default === value) continue
    out[name] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}
