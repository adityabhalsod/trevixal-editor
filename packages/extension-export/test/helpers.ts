import {
  type Attrs,
  type EditorNode,
  Fragment,
  type Mark,
  type NodeSpec,
  Schema,
  defaultMarks,
  defaultNodes,
} from '@trevixal/core'
import { base64Encode } from '../src/shared'

/**
 * The table and image nodes both writers understand live in sibling packages
 * this one does not depend on, so the tests declare the same shapes locally.
 */
export function extraNodes(): Record<string, NodeSpec> {
  return {
    table: {
      content: 'tableRow+',
      group: 'block',
      attrs: {
        width: { default: null },
        layout: { default: null },
        borders: { default: null },
        borderColor: { default: null },
        borderStyle: { default: null },
        borderWidth: { default: null },
        tableStyle: { default: null },
        accentColor: { default: null },
        firstColumn: { default: false },
        lastColumn: { default: false },
        totalRow: { default: false },
        bandedRows: { default: false },
        bandedColumns: { default: false },
      },
    },
    tableRow: { content: 'tableCell+', attrs: { height: { default: null } } },
    tableCell: {
      content: 'block+',
      attrs: {
        header: { default: false },
        colspan: { default: 1 },
        align: { default: null },
        width: { default: null },
        background: { default: null },
        hiddenBorders: { default: null },
      },
    },
    image: {
      group: 'block',
      atom: true,
      attrs: {
        src: { default: '' },
        alt: { default: '' },
        title: { default: null },
        width: { default: null },
        height: { default: null },
        align: { default: 'none' },
      },
    },
    figure: { content: 'block+', group: 'block' },
    caption: { content: 'inline*', group: 'block' },
  }
}

export const schema = new Schema({
  nodes: { ...defaultNodes(), ...extraNodes() },
  marks: defaultMarks(),
})

export function text(value: string, ...marks: Mark[]): EditorNode {
  return schema.text(value, marks)
}

export function mark(name: string, attrs?: Attrs): Mark {
  return schema.mark(name, attrs)
}

export function p(content: string | EditorNode[] = '', attrs?: Attrs): EditorNode {
  const children = typeof content === 'string' ? (content ? [text(content)] : []) : content
  return schema.node('paragraph', attrs, Fragment.from(children))
}

export function heading(level: number, content: string | EditorNode[]): EditorNode {
  const children = typeof content === 'string' ? [text(content)] : content
  return schema.node('heading', { level }, Fragment.from(children))
}

export function codeBlock(code: string, language: string | null = null): EditorNode {
  return schema.node('codeBlock', { language }, code ? [text(code)] : [])
}

export function listItem(...blocks: EditorNode[]): EditorNode {
  return schema.node('listItem', undefined, Fragment.from(blocks))
}

export function bulletList(...items: EditorNode[]): EditorNode {
  return schema.node('bulletList', undefined, Fragment.from(items))
}

export function orderedList(start: number, ...items: EditorNode[]): EditorNode {
  return schema.node('orderedList', { start }, Fragment.from(items))
}

export function taskItem(checked: boolean, ...blocks: EditorNode[]): EditorNode {
  return schema.node('taskItem', { checked }, Fragment.from(blocks))
}

export function taskList(...items: EditorNode[]): EditorNode {
  return schema.node('taskList', undefined, Fragment.from(items))
}

export function cell(content: string | EditorNode[], attrs?: Attrs): EditorNode {
  const blocks = typeof content === 'string' ? [p(content)] : content
  return schema.node('tableCell', attrs, Fragment.from(blocks))
}

export function row(...cells: EditorNode[]): EditorNode {
  return schema.node('tableRow', undefined, Fragment.from(cells))
}

export function table(attrs: Attrs | undefined, ...rows: EditorNode[]): EditorNode {
  return schema.node('table', attrs, Fragment.from(rows))
}

export function blockquote(...blocks: EditorNode[]): EditorNode {
  return schema.node('blockquote', undefined, Fragment.from(blocks))
}

export function image(attrs: Attrs): EditorNode {
  return schema.node('image', attrs)
}

export function hardBreak(): EditorNode {
  return schema.node('hardBreak')
}

export function horizontalRule(): EditorNode {
  return schema.node('horizontalRule')
}

export function doc(...blocks: EditorNode[]): EditorNode {
  return schema.node('doc', undefined, Fragment.from(blocks))
}

/** A syntactically valid PNG header of the given size; enough for sniffing. */
export function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

export function pngDataURL(width: number, height: number): string {
  return `data:image/png;base64,${base64Encode(pngBytes(width, height))}`
}

const decoder = new TextDecoder()

/** Decode one ZIP entry as UTF-8 text. */
export function partText(parts: ReadonlyMap<string, Uint8Array>, name: string): string {
  const bytes = parts.get(name)
  if (!bytes) throw new Error(`missing part ${name}`)
  return decoder.decode(bytes)
}
