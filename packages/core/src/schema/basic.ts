import type { EditorNode } from '../model/node'
import type { HTMLSpec, MarkSpec, NodeSpec } from '../model/schema'
import { type TextDirection, documentAttrs, textDirection } from './document-settings'
import { storedNumberingsFor } from './list-numbering'

const SAFE_PROTOCOLS = /^(?:https?|mailto|tel|ftp):/i

/** Allow only safe URL protocols (and relative URLs) in serialized links. */
export function safeHref(href: unknown): string | null {
  if (typeof href !== 'string' || href.length === 0) return null
  const trimmed = href.trim()
  // Reject control characters that can smuggle "java\tscript:" style URLs.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !SAFE_PROTOCOLS.test(trimmed)) return null
  return trimmed
}

/**
 * Image sources allow everything {@link safeHref} does, plus the two schemes
 * that only ever yield inert bytes: `data:image/*` and `blob:`. Both are
 * produced by the bundled storage adapters, and neither can execute, unlike
 * a `data:text/html` href, which is why links keep the stricter rule.
 */
export function safeImageSrc(src: unknown): string | null {
  if (typeof src !== 'string') return null
  const trimmed = src.trim()
  if (trimmed.length === 0) return null
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return null
  if (SAFE_IMAGE_SCHEMES.test(trimmed)) return trimmed
  return safeHref(trimmed)
}

/** `data:` restricted to image media types, so no markup can ride along. */
const SAFE_IMAGE_SCHEMES = /^(?:data:image\/[a-z0-9.+-]+[;,]|blob:)/i

const CSS_UNSAFE = /[<>"'();{}]|url\(|expression|javascript:|@import/i

/**
 * Allow only simple, self-contained CSS values in style attributes. Anything
 * that could open a new declaration, call url() or smuggle script is
 * rejected outright rather than escaped.
 */
export function safeCSSValue(value: unknown, maxLength = 120): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > maxLength) return null
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return null
  if (CSS_UNSAFE.test(trimmed)) return null
  return trimmed
}

/**
 * A font stack. Quoted family names are allowed, unlike other CSS values,
 * but only as balanced quotes around plain words, never as a way to close
 * the declaration and start another.
 */
export function safeFontFamily(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 200) return null
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return null
  if (/[<>();{}]|url\(|expression|javascript:|@import/i.test(trimmed)) return null
  const families = trimmed.split(',').map((family) => family.trim())
  if (families.length === 0 || families.length > 12) return null
  return families.every((family) => FONT_FAMILY.test(family)) ? families.join(', ') : null
}

const FONT_FAMILY = /^("[\w \-]+"|'[\w \-]+'|[\w-]+)$/

/**
 * Named, hex, rgb() and hsl() colors only. Validated against an explicit
 * grammar rather than the general CSS sanitizer, which forbids the
 * parentheses these functional notations need.
 */
export function safeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 64) return null
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return null
  return COLOR.test(trimmed) ? trimmed : null
}

const COLOR =
  /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\( *\d{1,3}%? *(,| ) *\d{1,3}%? *(,| ) *\d{1,3}%? *((,|\/) *[\d.]+%? *)?\)|hsla?\( *[\d.]+(deg|rad|turn)? *(,| ) *[\d.]+%? *(,| ) *[\d.]+%? *((,|\/) *[\d.]+%? *)?\))$/i

/** A CSS length with an explicit unit, or a bare number treated as px. */
export function safeLength(value: unknown): string | null {
  const css = safeCSSValue(value, 32)
  if (!css) return null
  if (/^\d+(\.\d+)?$/.test(css)) return `${css}px`
  return /^\d+(\.\d+)?(px|pt|em|rem|%|vw|vh|ch)$/i.test(css) ? css : null
}

/** Alignment, indent, vertical-rhythm and direction attrs shared by textblocks. */
export function blockLayoutAttrs(): Record<string, { default?: unknown }> {
  return {
    align: { default: null },
    indent: { default: 0 },
    lineHeight: { default: null },
    spaceBefore: { default: null },
    spaceAfter: { default: null },
    // `rtl` or `ltr` against the document's own direction; null follows it.
    dir: { default: null },
  }
}

/**
 * Line height accepts a bare multiplier (`1.5`) as well as a length, so it
 * cannot go through {@link safeLength}. That helper rewrites a unitless
 * number as px, which is exactly the wrong reading here. Unitless values pass
 * through the general CSS sanitizer and are then range-checked; anything with
 * a unit falls back to {@link safeLength}.
 */
export function safeLineHeight(value: unknown): string | null {
  const raw = typeof value === 'number' ? String(value) : value
  const css = safeCSSValue(raw, 32)
  if (!css) return null
  if (/^\d+(\.\d+)?$/.test(css)) return Number.parseFloat(css) <= 10 ? css : null
  return safeLength(css)
}

const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify'])

/** Maximum indent steps; each step is one 2.5rem margin. */
export const MAX_INDENT = 8

/**
 * An element id safe to emit: a letter, then up to 127 letters, digits, `-`,
 * `_`, `:` or `.`. Ids the kit generates for its own navigation (`tvx-…`)
 * are rejected so they can never leak from the rendered DOM into a document.
 */
export function safeElementId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!/^[A-Za-z][\w:.-]{0,127}$/.test(value) || value.startsWith('tvx-')) return null
  return value
}

/** Render align/indent/line-height/spacing/direction as sanitized attributes. */
export function blockLayoutHTML(node: EditorNode): Record<string, string> {
  const declarations: string[] = []
  const align = typeof node.attrs.align === 'string' ? node.attrs.align : null
  if (align && ALIGNMENTS.has(align)) declarations.push(`text-align: ${align}`)
  const indent = typeof node.attrs.indent === 'number' ? node.attrs.indent : 0
  const steps = Math.min(MAX_INDENT, Math.max(0, Math.round(indent)))
  // The start side rather than the left: a right-to-left paragraph indents
  // from the right, including one that takes its direction from the document.
  if (steps > 0) declarations.push(`margin-inline-start: ${steps * 2.5}rem`)
  const lineHeight = safeLineHeight(node.attrs.lineHeight)
  if (lineHeight) declarations.push(`line-height: ${lineHeight}`)
  const before = safeLength(node.attrs.spaceBefore)
  if (before) declarations.push(`margin-top: ${before}`)
  const after = safeLength(node.attrs.spaceAfter)
  if (after) declarations.push(`margin-bottom: ${after}`)
  const attrs: Record<string, string> = {}
  if (declarations.length > 0) attrs.style = declarations.join('; ')
  const dir = textDirection(node.attrs.dir)
  if (dir) attrs.dir = dir
  return attrs
}

/**
 * The indent a block's markup carries, in rem: our own `margin-inline-start`,
 * or the `margin-left` (`margin-right` when right-to-left) that other editors
 * and older exports write.
 */
function indentOf(element: HTMLElement, dir: TextDirection | null): number {
  const logical = /margin-inline-start:\s*([\d.]+)rem/i.exec(element.getAttribute('style') ?? '')
  if (logical) return Number.parseFloat(logical[1] as string)
  return Number.parseFloat(dir === 'rtl' ? element.style.marginRight : element.style.marginLeft)
}

/** Read align/indent/line-height/spacing/direction back from imported HTML. */
export function parseBlockLayout(element: HTMLElement): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}
  const align = element.style.textAlign || element.getAttribute('align')
  if (align && ALIGNMENTS.has(align)) attrs.align = align
  const dir = textDirection(element.getAttribute('dir')?.toLowerCase())
  if (dir) attrs.dir = dir
  const margin = indentOf(element, dir)
  if (Number.isFinite(margin) && margin > 0) {
    attrs.indent = Math.min(MAX_INDENT, Math.round(margin / 2.5))
  }
  const lineHeight = safeLineHeight(element.style.lineHeight)
  if (lineHeight) attrs.lineHeight = lineHeight
  const before = safeLength(element.style.marginTop)
  if (before) attrs.spaceBefore = before
  const after = safeLength(element.style.marginBottom)
  if (after) attrs.spaceAfter = after
  return attrs
}

/**
 * `list-style-type` values each list kind accepts. Anything outside these
 * sets is dropped rather than escaped: the value lands in a `style`
 * attribute, so an allowlist is the only trustworthy filter.
 */
export const BULLET_LIST_STYLES: ReadonlySet<string> = new Set(['disc', 'circle', 'square'])

export const ORDERED_LIST_STYLES: ReadonlySet<string> = new Set([
  'decimal',
  'lower-alpha',
  'upper-alpha',
  'lower-roman',
  'upper-roman',
])

/** Every marker value any list type allows, for command-level validation. */
export const LIST_STYLES: ReadonlySet<string> = new Set([
  ...BULLET_LIST_STYLES,
  ...ORDERED_LIST_STYLES,
])

/** Marker values legal on one list type; unknown types allow none. */
export function listStylesFor(listTypeName: string): ReadonlySet<string> {
  if (listTypeName === 'bulletList') return BULLET_LIST_STYLES
  if (listTypeName === 'orderedList') return ORDERED_LIST_STYLES
  return EMPTY_STYLES
}

const EMPTY_STYLES: ReadonlySet<string> = new Set()

/** Render a validated `listStyle` attr as a style attribute, or nothing. */
function listStyleHTML(node: EditorNode, allowed: ReadonlySet<string>): Record<string, string> {
  const style = node.attrs.listStyle
  if (typeof style !== 'string' || !allowed.has(style)) return {}
  return { style: `list-style-type: ${style}` }
}

/** Read a `list-style-type` back from imported HTML, if it is allowed. */
function parseListStyle(
  element: HTMLElement,
  allowed: ReadonlySet<string>,
): Record<string, unknown> {
  const style = element.style.listStyleType
  return allowed.has(style) ? { listStyle: style } : {}
}

/**
 * Render a list's multilevel scheme as `data-numbering`, which the editor's
 * stylesheet reads. Only a scheme this list type may store is written, so the
 * attribute never carries anything but a known name.
 */
function numberingHTML(node: EditorNode): Record<string, string> {
  const id = node.attrs.numbering
  if (typeof id !== 'string' || !storedNumberingsFor(node.type.name).has(id)) return {}
  return { 'data-numbering': id }
}

/** Read a multilevel scheme back from imported HTML, if this list type allows it. */
function parseNumbering(element: HTMLElement, listTypeName: string): Record<string, unknown> {
  const id = element.getAttribute('data-numbering')
  return id !== null && storedNumberingsFor(listTypeName).has(id) ? { numbering: id } : {}
}

/**
 * The `<input type=checkbox>` a task item carries in pasted markdown, looked
 * up among the element's own children (or one wrapper paragraph deep). The
 * search is deliberately not a descendant one: a plain `<li>` holding a
 * nested checkbox list must stay a plain item, and its list a bullet list.
 * Written as an explicit walk rather than a `:scope >` selector, which not
 * every DOM implementation the parser runs against supports.
 */
function ownCheckbox(element: Element): Element | null {
  for (const child of element.children) {
    if (isCheckbox(child)) return child
    if (child.tagName.toLowerCase() !== 'p') continue
    for (const inner of child.children) {
      if (isCheckbox(inner)) return inner
    }
  }
  return null
}

function isCheckbox(element: Element): boolean {
  return (
    element.tagName.toLowerCase() === 'input' &&
    (element.getAttribute('type') ?? '').toLowerCase() === 'checkbox'
  )
}

/**
 * A code fence's language name. Real names are short and made of letters,
 * digits and a little punctuation (`c++`, `c#`, `objective-c`), so anything
 * else, including whatever a hostile document put in the attribute, is
 * dropped rather than written back out.
 */
export function safeLanguageName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9+#._-]{0,31}$/.test(trimmed) ? trimmed : null
}

/**
 * The language of a `<pre>`, from our own attribute or from the
 * `language-*` / `lang-*` class every other renderer marks code with, which
 * is what arrives when a block is pasted from a docs site or a repository.
 */
function languageOf(element: HTMLElement): string | null {
  const declared = safeLanguageName(element.getAttribute('data-language'))
  if (declared) return declared
  const code = element.querySelector('code')
  for (const host of [element, code]) {
    for (const name of host?.classList ?? []) {
      const match = /^(?:language|lang)-(.+)$/.exec(name)
      const language = match ? safeLanguageName(match[1]) : null
      if (language) return language
    }
  }
  return null
}

/** The built-in node set: doc, paragraph, headings, quote, code, lists, … */
export function defaultNodes(): Record<string, NodeSpec> {
  return {
    // The whole document's settings are its attributes (document-settings.ts).
    doc: { content: 'block+', attrs: documentAttrs() },
    paragraph: {
      content: 'inline*',
      group: 'block',
      // `id` is what a link to this block points at, as a heading's is. Null
      // until something (the block menu's "Copy link") asks for one.
      attrs: { id: { default: null }, ...blockLayoutAttrs() },
      toHTML: (node) => {
        const attrs = blockLayoutHTML(node)
        const id = safeElementId(node.attrs.id)
        return { tag: 'p', attrs: id ? { ...attrs, id } : attrs }
      },
      parseHTML: [
        {
          tag: 'p',
          getAttrs: (element) => ({
            id: safeElementId(element.getAttribute('id')),
            ...parseBlockLayout(element),
          }),
        },
      ],
    },
    heading: {
      content: 'inline*',
      group: 'block',
      // `id` makes a heading a link target within the document; it is null
      // until something (the link dialog, an import) needs one.
      attrs: { level: { default: 1 }, id: { default: null }, ...blockLayoutAttrs() },
      toHTML: (node) => {
        const attrs = blockLayoutHTML(node)
        const id = safeElementId(node.attrs.id)
        return { tag: `h${clampLevel(node.attrs.level)}`, attrs: id ? { ...attrs, id } : attrs }
      },
      parseHTML: [1, 2, 3, 4, 5, 6].map((level) => ({
        tag: `h${level}`,
        getAttrs: (element) => ({
          level,
          id: safeElementId(element.getAttribute('id')),
          ...parseBlockLayout(element),
        }),
      })),
    },
    blockquote: {
      content: 'block+',
      group: 'block',
      toHTML: () => ({ tag: 'blockquote' }),
      parseHTML: [{ tag: 'blockquote' }],
    },
    codeBlock: {
      content: 'text*',
      group: 'block',
      marks: '',
      attrs: { language: { default: null } },
      preserveWhitespace: true,
      toHTML: (node) => {
        const language = safeLanguageName(node.attrs.language)
        const attrs: Record<string, string> = {}
        if (language) attrs['data-language'] = language
        return { tag: 'pre', attrs, childTag: 'code' }
      },
      parseHTML: [{ tag: 'pre', getAttrs: (element) => ({ language: languageOf(element) }) }],
    },
    horizontalRule: {
      group: 'block',
      atom: true,
      toHTML: () => ({ tag: 'hr', isVoid: true }),
      parseHTML: [{ tag: 'hr' }],
    },
    hardBreak: {
      inline: true,
      atom: true,
      group: 'inline',
      toHTML: () => ({ tag: 'br', isVoid: true }),
      parseHTML: [{ tag: 'br' }],
    },
    taskList: {
      content: 'taskItem+',
      group: 'block',
      toHTML: () => ({ tag: 'ul', attrs: { 'data-type': 'taskList' } }),
      // Registered before bulletList so both rules below are consulted first
      // (RuleSet tries attribute-constrained rules ahead of bare ones, and
      // otherwise keeps registration order).
      parseHTML: [
        {
          tag: 'ul',
          attribute: 'data-type',
          getAttrs: (element) => (element.getAttribute('data-type') === 'taskList' ? {} : false),
        },
        // A bare `<ul>` whose items carry checkboxes, GitHub-flavoured
        // markdown, and most markdown renderers. The items themselves parse
        // as `taskItem`, which only a `taskList` may contain, so this rule is
        // what keeps the pasted list schema-valid.
        {
          tag: 'ul',
          getAttrs: (element) =>
            [...element.children].some(
              (child) => child.tagName.toLowerCase() === 'li' && ownCheckbox(child),
            )
              ? {}
              : false,
        },
      ],
    },
    taskItem: {
      content: 'block+',
      attrs: { checked: { default: false } },
      toHTML: (node) => ({
        tag: 'li',
        attrs: {
          'data-type': 'taskItem',
          'data-checked': node.attrs.checked === true ? 'true' : 'false',
        },
      }),
      parseHTML: [
        {
          tag: 'li',
          attribute: 'data-checked',
          getAttrs: (element) => ({ checked: element.getAttribute('data-checked') === 'true' }),
        },
        // GitHub-flavoured markdown and other editors paste a bare `<li>`
        // holding an `<input type=checkbox>`. The parser drops the input
        // itself (it is on the dangerous-tags list), so the state has to be
        // read here, before the element's children are walked. Matching on
        // the input is also what distinguishes such an `<li>` from a plain
        // one, which must stay a `listItem`.
        {
          tag: 'li',
          getAttrs: (element) => {
            const box = ownCheckbox(element)
            return box ? { checked: box.hasAttribute('checked') } : false
          },
        },
      ],
    },
    bulletList: {
      content: 'listItem+',
      group: 'block',
      // `numbering` is the multilevel scheme for the whole tree this list
      // roots; only the outermost list stores one (see list-numbering.ts).
      attrs: { listStyle: { default: null }, numbering: { default: null } },
      toHTML: (node) => ({
        tag: 'ul',
        attrs: { ...listStyleHTML(node, BULLET_LIST_STYLES), ...numberingHTML(node) },
      }),
      parseHTML: [
        {
          tag: 'ul',
          getAttrs: (element) => ({
            ...parseListStyle(element, BULLET_LIST_STYLES),
            ...parseNumbering(element, 'bulletList'),
          }),
        },
      ],
    },
    orderedList: {
      content: 'listItem+',
      group: 'block',
      attrs: { start: { default: 1 }, listStyle: { default: null }, numbering: { default: null } },
      toHTML: (node) => {
        const attrs: Record<string, string> = {
          ...listStyleHTML(node, ORDERED_LIST_STYLES),
          ...numberingHTML(node),
        }
        if (node.attrs.start !== 1) attrs.start = String(node.attrs.start)
        return { tag: 'ol', attrs }
      },
      parseHTML: [
        {
          tag: 'ol',
          getAttrs: (element) => {
            const start = Number.parseInt(element.getAttribute('start') ?? '1', 10)
            return {
              start: Number.isNaN(start) ? 1 : start,
              ...parseListStyle(element, ORDERED_LIST_STYLES),
              ...parseNumbering(element, 'orderedList'),
            }
          },
        },
      ],
    },
    listItem: {
      content: 'block+',
      toHTML: () => ({ tag: 'li' }),
      parseHTML: [{ tag: 'li' }],
    },
    text: { group: 'inline' },
  }
}

/** The built-in mark set: bold, italic, underline, strike, code, link, … */
export function defaultMarks(): Record<string, MarkSpec> {
  return {
    bold: {
      toHTML: () => ({ tag: 'strong' }),
      parseHTML: [{ tag: 'strong' }, { tag: 'b' }],
    },
    italic: {
      toHTML: () => ({ tag: 'em' }),
      parseHTML: [{ tag: 'em' }, { tag: 'i' }],
    },
    underline: {
      toHTML: () => ({ tag: 'u' }),
      parseHTML: [{ tag: 'u' }],
    },
    strikethrough: {
      toHTML: () => ({ tag: 's' }),
      parseHTML: [{ tag: 's' }, { tag: 'strike' }, { tag: 'del' }],
    },
    code: {
      toHTML: () => ({ tag: 'code' }),
      parseHTML: [{ tag: 'code' }],
    },
    link: {
      attrs: { href: {}, title: { default: null }, target: { default: null } },
      toHTML: (mark) => {
        const href = safeHref(mark.attrs.href)
        const attrs: Record<string, string> = href ? { href } : {}
        if (typeof mark.attrs.title === 'string') attrs.title = mark.attrs.title
        // A `target=_blank` link without this rel lets the opened page reach
        // back through `window.opener` and retarget this one (reverse
        // tabnabbing), so the two are emitted together, always.
        if (mark.attrs.target === '_blank') {
          attrs.target = '_blank'
          attrs.rel = 'noopener noreferrer'
        }
        return { tag: 'a', attrs }
      },
      parseHTML: [
        {
          tag: 'a',
          getAttrs: (element) => {
            const href = safeHref(element.getAttribute('href'))
            if (!href) return false // unsafe or missing link: keep text, drop mark
            const title = element.getAttribute('title')
            // Only `_blank` is modelled; any other target is dropped rather
            // than trusted, since it can name an arbitrary frame.
            const target = element.getAttribute('target') === '_blank' ? '_blank' : null
            const attrs: Record<string, unknown> = { href }
            if (title) attrs.title = title
            if (target) attrs.target = target
            return attrs
          },
        },
      ],
    },
    highlight: {
      toHTML: () => ({ tag: 'mark' }),
      parseHTML: [{ tag: 'mark' }],
    },
    subscript: {
      excludes: 'superscript',
      toHTML: () => ({ tag: 'sub' }),
      parseHTML: [{ tag: 'sub' }],
    },
    superscript: {
      excludes: 'subscript',
      toHTML: () => ({ tag: 'sup' }),
      parseHTML: [{ tag: 'sup' }],
    },
    fontFamily: {
      attrs: { family: {} },
      toHTML: (mark) => styleSpan('font-family', safeFontFamily(mark.attrs.family)),
      parseHTML: [
        {
          tag: 'span',
          getAttrs: (element) => {
            const family = safeFontFamily(element.style.fontFamily)
            return family ? { family } : false
          },
        },
        {
          tag: 'font',
          getAttrs: (element) => {
            const family = safeFontFamily(element.getAttribute('face'))
            return family ? { family } : false
          },
        },
      ],
    },
    fontSize: {
      attrs: { size: {} },
      toHTML: (mark) => styleSpan('font-size', safeLength(mark.attrs.size)),
      parseHTML: [
        {
          tag: 'span',
          getAttrs: (element) => {
            const size = safeLength(element.style.fontSize)
            return size ? { size } : false
          },
        },
      ],
    },
    textColor: {
      attrs: { color: {} },
      toHTML: (mark) => styleSpan('color', safeColor(mark.attrs.color)),
      parseHTML: [
        {
          tag: 'span',
          getAttrs: (element) => {
            const color = safeColor(element.style.color)
            return color ? { color } : false
          },
        },
      ],
    },
    backgroundColor: {
      attrs: { color: {} },
      toHTML: (mark) => styleSpan('background-color', safeColor(mark.attrs.color)),
      parseHTML: [
        {
          tag: 'span',
          getAttrs: (element) => {
            const color = safeColor(element.style.backgroundColor)
            return color ? { color } : false
          },
        },
      ],
    },
    smallCaps: {
      toHTML: () => styleSpan('font-variant-caps', 'small-caps'),
      parseHTML: [
        {
          tag: 'span',
          getAttrs: (element) => {
            // `font-variant-caps` is the modern property; happy-dom and older
            // pasted markup only ever populate the `font-variant` shorthand,
            // so accept small-caps from either one.
            const caps = element.style.fontVariantCaps || element.style.fontVariant || ''
            return caps.trim().toLowerCase() === 'small-caps' ? {} : false
          },
        },
      ],
    },
    letterSpacing: {
      attrs: { spacing: {} },
      toHTML: (mark) => styleSpan('letter-spacing', safeLength(mark.attrs.spacing)),
      parseHTML: [
        {
          tag: 'span',
          getAttrs: (element) => {
            const spacing = safeLength(element.style.letterSpacing)
            return spacing ? { spacing } : false
          },
        },
      ],
    },
  }
}

/** A span carrying one sanitized declaration; unsafe values render bare. */
function styleSpan(property: string, value: string | null): HTMLSpec {
  return value ? { tag: 'span', attrs: { style: `${property}: ${value}` } } : { tag: 'span' }
}

function clampLevel(level: unknown): number {
  const value = typeof level === 'number' ? Math.round(level) : 1
  return Math.min(6, Math.max(1, value))
}
