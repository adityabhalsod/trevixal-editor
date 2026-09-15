import { Fragment } from '../src/model/fragment'
import type { Mark } from '../src/model/mark'
import type { EditorNode } from '../src/model/node'
import { type Position, pos } from '../src/model/position'
import { Schema } from '../src/model/schema'
import type { Path } from '../src/model/tree'
import { defaultMarks, defaultNodes } from '../src/schema/basic'
import { EditorState } from '../src/state/editor-state'
import { TextSelection } from '../src/state/selection'

export const testSchema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

export function doc(...children: EditorNode[]): EditorNode {
  return testSchema.node('doc', undefined, Fragment.from(children))
}

export function p(...content: (EditorNode | string)[]): EditorNode {
  return block('paragraph', content)
}

export function h(level: number, ...content: (EditorNode | string)[]): EditorNode {
  return testSchema.node('heading', { level }, inline(content))
}

export function blockquote(...children: EditorNode[]): EditorNode {
  return testSchema.node('blockquote', undefined, Fragment.from(children))
}

export function hr(): EditorNode {
  return testSchema.node('horizontalRule')
}

export function br(): EditorNode {
  return testSchema.node('hardBreak')
}

export function text(value: string, marks: readonly Mark[] = []): EditorNode {
  return testSchema.text(value, marks)
}

export function bold(value: string): EditorNode {
  return testSchema.text(value, [testSchema.mark('bold')])
}

export function italic(value: string): EditorNode {
  return testSchema.text(value, [testSchema.mark('italic')])
}

function block(type: string, content: (EditorNode | string)[]): EditorNode {
  return testSchema.node(type, undefined, inline(content))
}

function inline(content: (EditorNode | string)[]): Fragment {
  return Fragment.from(
    content
      .filter((item) => typeof item !== 'string' || item.length > 0)
      .map((item) => (typeof item === 'string' ? testSchema.text(item) : item)),
  )
}

export function stateWith(
  document: EditorNode,
  selection?: { anchor: Position; head?: Position },
): EditorState {
  return EditorState.create({
    schema: testSchema,
    doc: document,
    selection: selection ? new TextSelection(selection.anchor, selection.head) : undefined,
  })
}

export function cursor(path: Path, offset: number): { anchor: Position } {
  return { anchor: pos(path, offset) }
}

export function range(
  fromPath: Path,
  fromOffset: number,
  toPath: Path,
  toOffset: number,
): { anchor: Position; head: Position } {
  return { anchor: pos(fromPath, fromOffset), head: pos(toPath, toOffset) }
}
