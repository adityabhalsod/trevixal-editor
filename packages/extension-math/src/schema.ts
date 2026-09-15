import type { NodeSpec } from '@trevixal/core'
import { type MathRenderer, defaultMathRenderer } from './mathml'

/** Node name of the inline formula atom, so callers never spell it by hand. */
export const MATH_NODE = 'math'

/** Node name of the display formula atom. */
export const MATH_BLOCK_NODE = 'mathBlock'

/** Shared class on both nodes; the block adds `--block`. Used by the stylesheet and by tests. */
export const MATH_CLASS = 'trevixal-math'

/**
 * Shown in place of the MathML when the formula is empty, so a freshly
 * inserted node is still clickable instead of collapsing to zero width.
 */
const EMPTY_MARKUP = `<span class="${MATH_CLASS}__empty">∅</span>`

/**
 * Annotation encodings that carry LaTeX source. Only these are read back:
 * the MathML markup itself is never interpreted, so a pasted `<math>` can
 * never smuggle anything into the document beyond a source string.
 */
const TEX_ENCODINGS = new Set(['application/x-tex', 'application/x-latex'])

export interface MathNodeOptions {
  /**
   * Converts LaTeX to the markup shown inside the atom. Defaults to the
   * built-in MathML converter; swap it for KaTeX/MathJax output. Whatever it
   * returns is inserted as trusted `innerHTML`, so a replacement must escape
   * every piece of the source it echoes.
   */
  readonly render?: MathRenderer
}

function latexOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Walk for an `<annotation encoding="application/x-tex">`. Recursive because
 * the annotation lives under `<semantics>`, and a hand-written `<math>` may
 * nest it deeper still.
 */
function findTexAnnotation(element: Element): string | null {
  for (const child of Array.from(element.children)) {
    const name = (child.localName ?? child.tagName).toLowerCase()
    if (name === 'annotation') {
      if (!TEX_ENCODINGS.has(child.getAttribute('encoding') ?? '')) continue
      const latex = (child.textContent ?? '').trim()
      if (latex.length > 0) return latex
      continue
    }
    const nested = findTexAnnotation(child)
    if (nested !== null) return nested
  }
  return null
}

/** MathML marks display formulas with `display="block"`; everything else is inline. */
function isBlockMathElement(element: HTMLElement): boolean {
  return (element.getAttribute('display') ?? '').trim().toLowerCase() === 'block'
}

/**
 * The `math` (inline) and `mathBlock` (display) node specs, to merge into a
 * schema: `new Schema({ nodes: { ...defaultNodes(), ...mathNodes() }, … })`.
 *
 * Both are atoms holding nothing but their LaTeX source: the rendered MathML
 * is derived on every draw, so changing the renderer re-renders every formula
 * in the document without touching it.
 */
export function mathNodes(options: MathNodeOptions = {}): Record<string, NodeSpec> {
  const render = options.render ?? defaultMathRenderer

  return {
    [MATH_NODE]: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { latex: { default: '' } },
      /*
       * A <span>, not a bare <math>: core's HTML parser drops `math` subtrees
       * unless a rule claims the tag, and keeping the source on the wrapper
       * means a round trip never has to read the generated markup back.
       */
      toHTML: (node) => {
        const latex = latexOf(node.attrs.latex)
        return {
          tag: 'span',
          attrs: {
            class: MATH_CLASS,
            'data-latex': latex,
            role: 'math',
            'aria-label': latex,
          },
          innerHTML: latex === '' ? EMPTY_MARKUP : render(latex, false),
        }
      },
      parseHTML: [
        {
          tag: 'span',
          attribute: 'data-latex',
          getAttrs: (element) => ({ latex: element.getAttribute('data-latex') ?? '' }),
        },
        {
          // A `<math>` pasted from elsewhere: only its LaTeX annotation is
          // trusted. Without one there is nothing safe to import, so the
          // rule declines and the element falls through to `mathBlock`.
          tag: 'math',
          getAttrs: (element) => {
            if (isBlockMathElement(element)) return false
            const latex = findTexAnnotation(element)
            return latex === null ? false : { latex }
          },
        },
      ],
    },

    [MATH_BLOCK_NODE]: {
      group: 'block',
      atom: true,
      attrs: { latex: { default: '' } },
      toHTML: (node) => {
        const latex = latexOf(node.attrs.latex)
        return {
          tag: 'div',
          attrs: {
            class: `${MATH_CLASS} ${MATH_CLASS}--block`,
            'data-latex': latex,
            role: 'math',
            'aria-label': latex,
          },
          innerHTML: latex === '' ? EMPTY_MARKUP : render(latex, true),
        }
      },
      parseHTML: [
        {
          tag: 'div',
          attribute: 'data-latex',
          getAttrs: (element) => ({ latex: element.getAttribute('data-latex') ?? '' }),
        },
        {
          tag: 'math',
          getAttrs: (element) => {
            if (!isBlockMathElement(element)) return false
            const latex = findTexAnnotation(element)
            return latex === null ? false : { latex }
          },
        },
      ],
    },
  }
}
