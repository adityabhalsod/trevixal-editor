import { inlineLength } from '../model/inline'
import type { EditorNode } from '../model/node'
import type { Position } from '../model/position'
import type { DOMRenderer } from './renderer'

export interface DOMPoint {
  readonly node: globalThis.Node
  readonly offset: number
}

const TEXT_NODE = 3
const ELEMENT_NODE = 1

/** Placeholder `<br>`s and widget decorations occupy no model offsets. */
function isNonContent(node: globalThis.Node): boolean {
  if (node.nodeType !== ELEMENT_NODE) return false
  const dataset = (node as HTMLElement).dataset
  return dataset.trevixalPlaceholder === 'true' || dataset.trevixalWidget === 'true'
}

/** Model node an element renders, if any. */
function modelAt(renderer: DOMRenderer, node: globalThis.Node): EditorNode | null {
  return renderer.modelOf.get(node) ?? null
}

/** Size a DOM node contributes to inline offsets. */
function inlineDOMSize(renderer: DOMRenderer, node: globalThis.Node): number {
  if (node.nodeType === TEXT_NODE) return (node.textContent ?? '').length
  if (isNonContent(node)) return 0
  const model = modelAt(renderer, node)
  if (model && !model.isText) return 1 // inline atom
  // Mark wrapper: sum of contents.
  let size = 0
  for (const child of [...node.childNodes]) size += inlineDOMSize(renderer, child)
  return size
}

/**
 * Map a DOM point inside the view to a model Position. Returns null for
 * points outside any rendered textblock.
 */
export function positionFromDOMPoint(
  root: HTMLElement,
  renderer: DOMRenderer,
  domNode: globalThis.Node,
  domOffset: number,
): Position | null {
  // Find the textblock element containing the point.
  let blockElement: HTMLElement | null = null
  for (
    let current: globalThis.Node | null = domNode;
    current && current !== root.parentNode;
    current = current.parentNode
  ) {
    const model = current.nodeType === ELEMENT_NODE ? modelAt(renderer, current) : null
    if (model?.isTextblock) {
      blockElement = current as HTMLElement
      break
    }
    if (current === root) break
  }
  if (!blockElement) {
    // A point on a container (the root, a blockquote, a list): the offset is
    // a child index. Browsers report whole-block selections this way.
    return positionInContainer(root, renderer, domNode, domOffset)
  }

  const path = pathOfElement(root, renderer, blockElement)
  if (!path) return null

  const content = renderer.contentElementOf(blockElement)
  const offset = inlineOffsetOf(renderer, content, domNode, domOffset)
  return offset === null ? null : { path, offset }
}

/**
 * Resolve a point whose node is a container element: the offset is a child
 * index, so descend into that child (or the last one, for an end-of-container
 * offset) until a textblock is reached.
 */
function positionInContainer(
  root: HTMLElement,
  renderer: DOMRenderer,
  container: globalThis.Node,
  index: number,
): Position | null {
  if (container.nodeType !== ELEMENT_NODE) return null
  const children = [...(container as HTMLElement).children].filter((child) =>
    renderer.modelOf.get(child),
  ) as HTMLElement[]
  if (children.length === 0) return null
  // An offset past the last child means "the end of the container".
  const atEnd = index >= children.length
  const target = children[Math.min(index, children.length - 1)]
  if (!target) return null

  const descend = (element: HTMLElement): Position | null => {
    const model = renderer.modelOf.get(element)
    if (model?.isTextblock) {
      const path = pathOfElement(root, renderer, element)
      if (!path) return null
      return { path, offset: atEnd ? inlineLength(model.content) : 0 }
    }
    const content = renderer.contentElementOf(element)
    const nested = [...content.children].filter((child) =>
      renderer.modelOf.get(child),
    ) as HTMLElement[]
    const next = atEnd ? nested[nested.length - 1] : nested[0]
    return next ? descend(next) : null
  }
  return descend(target)
}

/** Child-index path of a rendered element, climbing to the view root. */
export function pathOfElement(
  root: HTMLElement,
  renderer: DOMRenderer,
  element: HTMLElement,
): number[] | null {
  const path: number[] = []
  let current: HTMLElement = element
  while (current !== root) {
    const parent = current.parentElement
    if (!parent) return null
    // Index among siblings that render model nodes (placeholders don't count).
    let index = 0
    let found = false
    for (const sibling of [...parent.children]) {
      if (sibling === current) {
        found = true
        break
      }
      if (renderer.modelOf.get(sibling)) index++
    }
    if (!found) return null
    path.unshift(index)
    if (renderer.modelOf.get(parent) || parent === root) {
      current = parent
    } else {
      // Content wrapper (e.g. the `code` in `pre > code`): its parent renders the node.
      const owner = parent.parentElement
      if (!owner) return null
      current = owner
    }
  }
  return path
}

/** Inline character offset of a DOM point within a textblock's content element. */
function inlineOffsetOf(
  renderer: DOMRenderer,
  content: HTMLElement,
  targetNode: globalThis.Node,
  targetOffset: number,
): number | null {
  if (targetNode === content || targetNode.nodeType === ELEMENT_NODE) {
    // Element point: sum sizes of children before the offset.
    if (targetNode === content || content.contains(targetNode)) {
      let sum = 0
      if (targetNode !== content) {
        // Count everything before the element itself first.
        const before = offsetToNodeStart(renderer, content, targetNode)
        if (before === null) return null
        sum = before
      }
      const children = [...targetNode.childNodes]
      for (let i = 0; i < Math.min(targetOffset, children.length); i++) {
        sum += inlineDOMSize(renderer, children[i] as globalThis.Node)
      }
      return sum
    }
    return null
  }
  // Text point: distance to the text node plus the offset within it.
  const before = offsetToNodeStart(renderer, content, targetNode)
  return before === null ? null : before + targetOffset
}

/** Inline offset from the start of `content` to the start of `target`. */
function offsetToNodeStart(
  renderer: DOMRenderer,
  content: HTMLElement,
  target: globalThis.Node,
): number | null {
  let sum = 0
  let found = false
  const walk = (node: globalThis.Node): void => {
    if (found) return
    if (node === target) {
      found = true
      return
    }
    if (node.nodeType === TEXT_NODE) {
      sum += (node.textContent ?? '').length
      return
    }
    if (isNonContent(node)) return // occupies no offsets; never contains the target
    const model = node !== content ? modelAt(renderer, node) : null
    if (model && !model.isText && node !== content) {
      sum += 1
      return // atoms are opaque
    }
    for (const child of [...node.childNodes]) {
      walk(child)
      if (found) return
    }
  }
  walk(content)
  return found ? sum : null
}

/**
 * Map a model Position to a concrete DOM point, preferring text nodes so the
 * browser caret renders correctly.
 */
export function domPointFromPosition(
  root: HTMLElement,
  renderer: DOMRenderer,
  position: Position,
): DOMPoint | null {
  // Walk down the path over rendered child elements.
  let element: HTMLElement = root
  for (const index of position.path) {
    const children = [...renderer.contentElementOf(element).children].filter((child) =>
      renderer.modelOf.get(child),
    ) as HTMLElement[]
    const next = children[index]
    if (!next) return null
    element = next
  }
  const model = renderer.modelOf.get(element)
  if (!model?.isTextblock) {
    // Element-level position: offset is a child index.
    const content = renderer.contentElementOf(element)
    return { node: content, offset: Math.min(position.offset, content.childNodes.length) }
  }

  const content = renderer.contentElementOf(element)
  let remaining = position.offset
  let result: DOMPoint | null = null
  const walk = (node: globalThis.Node): boolean => {
    if (node.nodeType === TEXT_NODE) {
      const length = (node.textContent ?? '').length
      if (remaining <= length) {
        result = { node, offset: remaining }
        return true
      }
      remaining -= length
      return false
    }
    if (isNonContent(node)) return false
    const nodeModel = node !== content ? modelAt(renderer, node) : null
    if (nodeModel && !nodeModel.isText) {
      if (remaining === 0) {
        const parent = node.parentNode as globalThis.Node
        const index = [...parent.childNodes].indexOf(node as ChildNode)
        result = { node: parent, offset: index }
        return true
      }
      remaining -= 1
      return false
    }
    for (const child of [...node.childNodes]) {
      if (walk(child)) return true
    }
    return false
  }
  if (walk(content) && result) return result
  // Offset at the very end (or empty block): park at the end of the content.
  return { node: content, offset: content.childNodes.length }
}
