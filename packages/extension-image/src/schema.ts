import type { NodeSpec } from '@trevixal/core'
import { safeImageSrc, safeLength } from '@trevixal/core'

export type ImageAlign = 'left' | 'center' | 'right' | 'none'

const ALIGNMENTS = new Set<string>(['left', 'center', 'right', 'none'])

/**
 * The `image` node: a block-level atom carrying its source, alt text,
 * dimensions and float alignment. Merge into your schema:
 * `nodes: { ...defaultNodes(), ...imageNodes() }`.
 *
 * Uploads in flight render as the same node with a `uploadId` and no `src`,
 * so a failed upload leaves nothing to clean up in the document.
 */
export function imageNodes(): Record<string, NodeSpec> {
  return {
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
        /** Storage handle, kept so the backend can delete the object later. */
        storageKey: { default: null },
        /** Set while an upload is running; cleared when it resolves. */
        uploadId: { default: null },
      },
      toHTML: (node) => {
        const src = safeImageSrc(node.attrs.src)
        const attrs: Record<string, string> = { src: src ?? '' }
        attrs.alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : ''
        if (typeof node.attrs.title === 'string') attrs.title = node.attrs.title
        const width = safeLength(node.attrs.width)
        if (width) attrs.width = width.replace(/px$/, '')
        const height = safeLength(node.attrs.height)
        if (height) attrs.height = height.replace(/px$/, '')
        const align = typeof node.attrs.align === 'string' ? node.attrs.align : 'none'
        if (ALIGNMENTS.has(align) && align !== 'none') {
          attrs.class = `trevixal-image trevixal-image--${align}`
        } else {
          attrs.class = 'trevixal-image'
        }
        if (typeof node.attrs.uploadId === 'string') {
          attrs['data-trevixal-uploading'] = node.attrs.uploadId
        }
        return { tag: 'img', attrs, isVoid: true }
      },
      parseHTML: [
        {
          tag: 'img',
          getAttrs: (element) => {
            const src = safeImageSrc(element.getAttribute('src'))
            if (!src) return false // unsafe or missing source: drop the node
            const attrs: Record<string, unknown> = { src, alt: element.getAttribute('alt') ?? '' }
            const title = element.getAttribute('title')
            if (title) attrs.title = title
            const width = safeLength(element.getAttribute('width'))
            if (width) attrs.width = width
            const height = safeLength(element.getAttribute('height'))
            if (height) attrs.height = height
            const align = readAlign(element)
            if (align) attrs.align = align
            return attrs
          },
        },
      ],
    },
    figure: {
      content: 'image caption?',
      group: 'block',
      toHTML: () => ({ tag: 'figure', attrs: { class: 'trevixal-figure' } }),
      parseHTML: [{ tag: 'figure' }],
    },
    caption: {
      content: 'inline*',
      toHTML: () => ({ tag: 'figcaption' }),
      parseHTML: [{ tag: 'figcaption' }],
    },
  }
}

function readAlign(element: HTMLElement): ImageAlign | null {
  const float = element.style.float
  if (float === 'left' || float === 'right') return float
  if (element.style.marginLeft === 'auto' && element.style.marginRight === 'auto') return 'center'
  const attribute = element.getAttribute('align')
  if (attribute && ALIGNMENTS.has(attribute)) return attribute as ImageAlign
  const classes = element.getAttribute('class') ?? ''
  for (const align of ALIGNMENTS) {
    if (classes.includes(`trevixal-image--${align}`)) return align as ImageAlign
  }
  return null
}
