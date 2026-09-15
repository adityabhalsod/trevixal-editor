import type { EditorNode, NodeSpec } from '@trevixal/core'
import { escapeHTML, safeHref, safeLength } from '@trevixal/core'

/** Callout flavors, in the order a variant picker should present them. */
export type CalloutVariant = 'info' | 'success' | 'warning' | 'danger' | 'note'

export const CALLOUT_VARIANTS: readonly CalloutVariant[] = [
  'info',
  'success',
  'warning',
  'danger',
  'note',
]

/** Badge tones. `neutral` is the default and carries no semantic color. */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export const BADGE_TONES: readonly BadgeTone[] = ['neutral', 'info', 'success', 'warning', 'danger']

/** Columns narrower than two are not a layout; wider than four is unreadable. */
export const MIN_COLUMNS = 2
export const MAX_COLUMNS = 4

/** A tab strip or accordion with more than this many entries stops being navigable. */
export const MAX_SECTIONS = 12

/**
 * Ids reach the DOM as both an `id` attribute and a `#fragment` href, so
 * they are held to a strict allowlist rather than escaped. This rejects the
 * whole class of `../`, `javascript:` and quote-breaking payloads outright.
 * A malformed id drops the attribute instead of emitting something clever.
 */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/

/** A document-fragment-safe identifier, or null when it fails the allowlist. */
export function safeAnchorId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return SAFE_ID.test(value) ? value : null
}

/** Coerce any input to a known callout variant, falling back to `info`. */
export function calloutVariant(value: unknown): CalloutVariant {
  return CALLOUT_VARIANTS.includes(value as CalloutVariant) ? (value as CalloutVariant) : 'info'
}

/** Coerce any input to a known badge tone, falling back to `neutral`. */
export function badgeTone(value: unknown): BadgeTone {
  return BADGE_TONES.includes(value as BadgeTone) ? (value as BadgeTone) : 'neutral'
}

/** Clamp a requested column count into the supported 2..4 range. */
export function clampColumnCount(value: unknown): number {
  const count =
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : MIN_COLUMNS
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, count))
}

function stringAttr(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function hasClass(element: HTMLElement, name: string): boolean {
  return (element.getAttribute('class') ?? '').split(/\s+/).includes(name)
}

/**
 * Structural block node specs to merge into a schema:
 * `new Schema({ nodes: { ...defaultNodes(), ...blockNodes() }, marks: … })`.
 *
 * These are the layout primitives a document editor needs beyond prose:
 * containers (callout, card, column, toggle), sequences (timeline, footnote
 * list), inline chrome (badge, button, footnote ref, anchor) and the
 * print-only page break.
 */
export function blockNodes(): Record<string, NodeSpec> {
  return {
    callout: {
      content: 'block+',
      group: 'block',
      attrs: {
        variant: { default: 'info' },
        /** Optional emoji or short glyph overriding the variant's default. */
        icon: { default: null },
      },
      toHTML: (node) => {
        const variant = calloutVariant(node.attrs.variant)
        const attrs: Record<string, string> = {
          class: `trevixal-callout trevixal-callout--${variant}`,
          'data-variant': variant,
        }
        // The icon is author-supplied text, so it rides as a data attribute
        // the stylesheet echoes through `content` rather than as raw markup.
        const icon = node.attrs.icon
        if (typeof icon === 'string' && icon.length > 0 && icon.length <= 8) {
          attrs['data-icon'] = icon
        }
        return { tag: 'div', attrs }
      },
      parseHTML: [
        {
          tag: 'div',
          attribute: 'data-variant',
          getAttrs: (element) => {
            const classes = element.getAttribute('class') ?? ''
            if (!classes.includes('trevixal-callout')) return false
            return {
              variant: calloutVariant(element.getAttribute('data-variant')),
              icon: element.getAttribute('data-icon'),
            }
          },
        },
      ],
    },

    toggleBlock: {
      content: 'toggleSummary toggleContent',
      group: 'block',
      attrs: { open: { default: true } },
      toHTML: (node) => {
        const attrs: Record<string, string> = { class: 'trevixal-toggle' }
        // `open` is a boolean attribute: present means open, so a closed
        // toggle omits it entirely rather than writing open="false".
        if (node.attrs.open !== false) attrs.open = 'open'
        return { tag: 'details', attrs }
      },
      // Any <details> is a toggle, except an accordion item, which owns the
      // same tag and is told apart by its class. Rules on one tag run in
      // schema order, so this one has to step aside rather than the
      // accordion's having to win.
      parseHTML: [
        {
          tag: 'details',
          getAttrs: (element) =>
            hasClass(element, 'trevixal-accordion__item')
              ? false
              : { open: element.hasAttribute('open') },
        },
      ],
    },
    toggleSummary: {
      content: 'inline*',
      toHTML: () => ({ tag: 'summary', attrs: { class: 'trevixal-toggle__summary' } }),
      parseHTML: [
        {
          tag: 'summary',
          getAttrs: (element) => (hasClass(element, 'trevixal-accordion__title') ? false : {}),
        },
      ],
    },
    toggleContent: {
      content: 'block+',
      toHTML: () => ({ tag: 'div', attrs: { class: 'trevixal-toggle__content' } }),
      parseHTML: [
        {
          tag: 'div',
          getAttrs: (element) =>
            (element.getAttribute('class') ?? '').includes('trevixal-toggle__content') ? {} : false,
        },
      ],
    },

    columnBlock: {
      content: 'column+',
      group: 'block',
      attrs: { count: { default: MIN_COLUMNS } },
      toHTML: (node) => {
        const count = clampColumnCount(node.attrs.count)
        return {
          tag: 'div',
          attrs: {
            class: `trevixal-columns trevixal-columns--${count}`,
            'data-columns': String(count),
            // An inline grid template keeps the export self-describing when
            // the stylesheet is absent (email, static site output).
            style: `display: grid; grid-template-columns: repeat(${count}, minmax(0, 1fr))`,
          },
        }
      },
      parseHTML: [
        {
          tag: 'div',
          attribute: 'data-columns',
          getAttrs: (element) => {
            const raw = Number.parseInt(element.getAttribute('data-columns') ?? '', 10)
            return { count: clampColumnCount(Number.isNaN(raw) ? MIN_COLUMNS : raw) }
          },
        },
      ],
    },
    column: {
      content: 'block+',
      attrs: { width: { default: null } },
      toHTML: (node) => {
        const attrs: Record<string, string> = { class: 'trevixal-columns__column' }
        const width = safeLength(node.attrs.width)
        if (width) attrs.style = `flex-basis: ${width}`
        return { tag: 'div', attrs }
      },
      parseHTML: [
        {
          tag: 'div',
          getAttrs: (element) => {
            if (!(element.getAttribute('class') ?? '').includes('trevixal-columns__column')) {
              return false
            }
            const width = safeLength(element.style.flexBasis || element.style.width)
            return width ? { width } : {}
          },
        },
      ],
    },

    card: {
      content: 'block+',
      group: 'block',
      toHTML: () => ({ tag: 'div', attrs: { class: 'trevixal-card' } }),
      parseHTML: [
        {
          tag: 'div',
          getAttrs: (element) =>
            (element.getAttribute('class') ?? '').includes('trevixal-card') ? {} : false,
        },
      ],
    },

    timeline: {
      content: 'timelineItem+',
      group: 'block',
      toHTML: () => ({ tag: 'ol', attrs: { class: 'trevixal-timeline', 'data-timeline': 'true' } }),
      // `ol` and `li` are orderedList's and listItem's tags, and those rules
      // match unconditionally. `RuleSet.add` tries attribute-constrained
      // rules first, so a marker attribute is what makes these reachable.
      parseHTML: [{ tag: 'ol', attribute: 'data-timeline' }],
    },
    timelineItem: {
      content: 'block+',
      attrs: {
        /** Short label rendered in the rail bullet (a date, a step number). */
        marker: { default: null },
      },
      toHTML: (node) => {
        const attrs: Record<string, string> = {
          class: 'trevixal-timeline__item',
          'data-timeline-item': 'true',
        }
        const marker = node.attrs.marker
        if (typeof marker === 'string' && marker.length > 0 && marker.length <= 32) {
          attrs['data-marker'] = marker
        }
        return { tag: 'li', attrs }
      },
      parseHTML: [
        {
          tag: 'li',
          attribute: 'data-timeline-item',
          getAttrs: (element) => ({ marker: element.getAttribute('data-marker') }),
        },
      ],
    },

    pageBreak: {
      group: 'block',
      atom: true,
      toHTML: () => ({
        tag: 'div',
        // Not void: an empty div needs a closing tag to stay valid HTML, and
        // the print rule that actually breaks the page lives in the SCSS.
        attrs: { class: 'trevixal-page-break', 'data-page-break': 'true', 'aria-hidden': 'true' },
      }),
      parseHTML: [{ tag: 'div', attribute: 'data-page-break' }],
    },

    badge: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { label: { default: '' }, tone: { default: 'neutral' } },
      toHTML: (node) => {
        const tone = badgeTone(node.attrs.tone)
        return {
          tag: 'span',
          attrs: {
            class: `trevixal-badge trevixal-badge--${tone}`,
            'data-tone': tone,
          },
          text: stringAttr(node.attrs.label),
        }
      },
      parseHTML: [
        {
          tag: 'span',
          attribute: 'data-tone',
          getAttrs: (element) => {
            if (!(element.getAttribute('class') ?? '').includes('trevixal-badge')) return false
            return {
              label: element.textContent ?? '',
              tone: badgeTone(element.getAttribute('data-tone')),
            }
          },
        },
      ],
    },

    buttonBlock: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { label: { default: '' }, href: { default: null } },
      // Rendered as a <span>, not an <a>: core's `link` mark claims every
      // <a> with a valid href, and marks are matched before nodes, so an
      // <a>-tagged node here would import as a link-marked text run and the
      // button node would never survive a round trip. The target lives in
      // `data-href`, which the view turns into navigation.
      toHTML: (node) => {
        const attrs: Record<string, string> = {
          class: 'trevixal-button',
          role: 'button',
          'data-button': 'true',
        }
        const href = safeHref(node.attrs.href)
        // An unsafe target drops the attribute rather than the node: the
        // label still reads, it simply stops being actionable.
        if (href) attrs['data-href'] = href
        return { tag: 'span', attrs, text: stringAttr(node.attrs.label) }
      },
      parseHTML: [
        {
          tag: 'span',
          attribute: 'data-button',
          getAttrs: (element) => ({
            label: element.textContent ?? '',
            href: safeHref(element.getAttribute('data-href')),
          }),
        },
      ],
    },

    footnoteRef: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { id: {} },
      /*
       * Rendered as a <span>, not the `<sup><a>` the DOM would suggest.
       * Marks are matched before nodes during import, and core claims both
       * candidate tags unconditionally: `superscript` takes every <sup> and
       * `link` takes every <a> carrying a valid href. Either spelling
       * therefore imports as a marked text run and loses the node entirely
       * (verified in test/parse.test.ts). <span> is the one inline tag whose
       * core rules are all style-guarded, so it survives a round trip; the
       * superscript look and the link affordance come from the class, and
       * `data-href` carries the target for the view to act on.
       */
      toHTML: (node) => {
        const id = safeAnchorId(node.attrs.id)
        const attrs: Record<string, string> = { class: 'trevixal-footnote-ref' }
        // A rejected id yields a bare marker rather than one pointing
        // somewhere unvalidated.
        if (!id) return { tag: 'span', attrs }
        return {
          tag: 'span',
          attrs: {
            ...attrs,
            id: `fnref-${id}`,
            'data-footnote': id,
            'data-href': `#fn-${id}`,
          },
          text: id,
        }
      },
      parseHTML: [
        {
          tag: 'span',
          attribute: 'data-footnote',
          getAttrs: (element) => {
            const id = safeAnchorId(element.getAttribute('data-footnote'))
            return id ? { id } : false
          },
        },
      ],
    },
    footnoteList: {
      content: 'footnoteItem+',
      group: 'block',
      toHTML: () => ({
        tag: 'ol',
        attrs: { class: 'trevixal-footnotes', 'data-footnotes': 'true' },
      }),
      // `ol` is also orderedList's tag and that rule matches unconditionally;
      // an attribute-constrained rule is tried first, so the marker is
      // required rather than merely checked for in getAttrs.
      parseHTML: [{ tag: 'ol', attribute: 'data-footnotes' }],
    },
    footnoteItem: {
      content: 'block+',
      attrs: { id: {} },
      toHTML: (node) => {
        const id = safeAnchorId(node.attrs.id)
        const attrs: Record<string, string> = { class: 'trevixal-footnotes__item' }
        if (id) {
          attrs.id = `fn-${id}`
          attrs['data-footnote'] = id
        }
        return { tag: 'li', attrs }
      },
      // `data-footnote` both identifies the item and outranks listItem's
      // unconditional `li` rule.
      parseHTML: [
        {
          tag: 'li',
          attribute: 'data-footnote',
          getAttrs: (element) => {
            const id = safeAnchorId(element.getAttribute('data-footnote'))
            return id ? { id } : false
          },
        },
      ],
    },

    // ---- tabs ------------------------------------------------------------------
    // A tab strip is a flex container whose panels use `display: contents`,
    // so every title takes part in one row (order 0) while every body drops
    // below it (order 1, full width), pure CSS, no JS needed to lay it out.
    // Exactly one item is active; `activateTabAt` maintains that invariant.
    tabsBlock: {
      content: 'tabItem+',
      group: 'block',
      toHTML: () => ({
        tag: 'div',
        // Deliberately not `role="tablist"`. A tablist may own only tabs, and
        // the document model keeps each title with the panel it titles, so
        // every panel would be owned by it too. What this shape really is,
        // a set of titled sections with one showing, is the disclosure
        // pattern below, which it can honour completely.
        attrs: { class: 'trevixal-tabs', 'data-trevixal-tabs': 'true' },
      }),
      parseHTML: [{ tag: 'div', attribute: 'data-trevixal-tabs' }],
    },
    tabItem: {
      content: 'tabTitle tabContent',
      attrs: { active: { default: false } },
      toHTML: (node) => ({
        tag: 'section',
        attrs: {
          class: 'trevixal-tabs__panel',
          'data-trevixal-tab': 'true',
          'data-active': node.attrs.active === true ? 'true' : 'false',
        },
      }),
      parseHTML: [
        {
          tag: 'section',
          attribute: 'data-trevixal-tab',
          getAttrs: (element) => ({ active: element.getAttribute('data-active') === 'true' }),
        },
      ],
    },
    tabTitle: {
      content: 'inline*',
      // A button, because that is what it is: pressing it discloses the
      // section below. `aria-expanded` is maintained beside `data-active` by
      // whatever is driving the strip, the editor, or the script an export
      // carries with it.
      toHTML: () => ({
        tag: 'h4',
        attrs: { class: 'trevixal-tabs__title', role: 'button', tabindex: '0' },
      }),
      // `h4` is also heading's tag, matched unconditionally; the attribute
      // constraint is what makes this rule run first.
      parseHTML: [
        {
          tag: 'h4',
          attribute: 'class',
          getAttrs: (element) => (element.classList.contains('trevixal-tabs__title') ? {} : false),
        },
      ],
    },
    tabContent: {
      content: 'block+',
      toHTML: () => ({
        tag: 'div',
        attrs: { class: 'trevixal-tabs__content' },
      }),
      parseHTML: [
        {
          tag: 'div',
          attribute: 'class',
          getAttrs: (element) =>
            element.classList.contains('trevixal-tabs__content') ? {} : false,
        },
      ],
    },

    // ---- accordion -------------------------------------------------------------
    // A stack of <details>, each its own disclosure. `exclusive` makes the
    // stack behave like a classic accordion: opening one closes the rest.
    accordion: {
      content: 'accordionItem+',
      group: 'block',
      attrs: { exclusive: { default: true } },
      toHTML: (node) => {
        const attrs: Record<string, string> = {
          class: 'trevixal-accordion',
          'data-trevixal-accordion': 'true',
        }
        // Boolean attribute: present means exclusive.
        if (node.attrs.exclusive !== false) attrs['data-exclusive'] = 'true'
        return { tag: 'div', attrs }
      },
      parseHTML: [
        {
          tag: 'div',
          attribute: 'data-trevixal-accordion',
          getAttrs: (element) => ({ exclusive: element.hasAttribute('data-exclusive') }),
        },
      ],
    },
    accordionItem: {
      content: 'accordionTitle accordionContent',
      attrs: { open: { default: false } },
      toHTML: (node) => {
        const attrs: Record<string, string> = { class: 'trevixal-accordion__item' }
        if (node.attrs.open === true) attrs.open = 'open'
        return { tag: 'details', attrs }
      },
      // The toggle's `details` rule declines this class, so the two never
      // compete for one element.
      parseHTML: [
        {
          tag: 'details',
          getAttrs: (element) =>
            hasClass(element, 'trevixal-accordion__item')
              ? { open: element.hasAttribute('open') }
              : false,
        },
      ],
    },
    accordionTitle: {
      content: 'inline*',
      toHTML: () => ({ tag: 'summary', attrs: { class: 'trevixal-accordion__title' } }),
      parseHTML: [
        {
          tag: 'summary',
          getAttrs: (element) => (hasClass(element, 'trevixal-accordion__title') ? {} : false),
        },
      ],
    },
    accordionContent: {
      content: 'block+',
      toHTML: () => ({ tag: 'div', attrs: { class: 'trevixal-accordion__content' } }),
      parseHTML: [
        {
          tag: 'div',
          getAttrs: (element) => (hasClass(element, 'trevixal-accordion__content') ? {} : false),
        },
      ],
    },

    // ---- citations -------------------------------------------------------------
    // A numbered pointer into the reference list. The label is denormalized
    // onto the node so the export needs no second pass; `renumberCitations`
    // brings labels back in line with the list's order.
    citation: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { id: {}, label: { default: '?' } },
      /*
       * A <span>, not the <sup> the DOM would suggest: core's `superscript`
       * mark claims every <sup> on import, and marks are matched before
       * nodes, so a <sup>-tagged citation would come back as marked text and
       * the node would be lost (the same trap footnoteRef documents). The
       * raised position comes from the class; the bracketed link inside is
       * built here, so every dynamic value is escaped.
       */
      toHTML: (node) => {
        const id = safeAnchorId(node.attrs.id)
        const label = escapeHTML(stringAttr(node.attrs.label) || '?')
        const attrs: Record<string, string> = { class: 'trevixal-citation' }
        // A rejected id renders a bare bracketed label rather than a link
        // pointing somewhere unvalidated.
        if (!id) return { tag: 'span', attrs, innerHTML: `[${label}]` }
        return {
          tag: 'span',
          attrs: { ...attrs, 'data-trevixal-citation': id },
          innerHTML: `[<a href="#ref-${id}">${label}</a>]`,
        }
      },
      parseHTML: [
        {
          tag: 'span',
          attribute: 'data-trevixal-citation',
          getAttrs: (element) => {
            const id = safeAnchorId(element.getAttribute('data-trevixal-citation'))
            if (!id) return false
            const text = (element.textContent ?? '').trim().replace(/^\[|\]$/g, '')
            return { id, label: text || '?' }
          },
        },
      ],
    },
    referenceList: {
      content: 'referenceItem+',
      group: 'block',
      toHTML: () => ({
        tag: 'ol',
        attrs: { class: 'trevixal-references', 'data-trevixal-references': 'true' },
      }),
      // `ol` is orderedList's tag; the marker attribute outranks its rule.
      parseHTML: [{ tag: 'ol', attribute: 'data-trevixal-references' }],
    },
    referenceItem: {
      content: 'inline*',
      attrs: { id: {} },
      toHTML: (node) => {
        const id = safeAnchorId(node.attrs.id)
        const attrs: Record<string, string> = { class: 'trevixal-references__item' }
        if (id) {
          attrs.id = `ref-${id}`
          attrs['data-reference-id'] = id
        }
        return { tag: 'li', attrs }
      },
      parseHTML: [
        {
          tag: 'li',
          attribute: 'data-reference-id',
          getAttrs: (element) => {
            const id = safeAnchorId(element.getAttribute('data-reference-id'))
            return id ? { id } : false
          },
        },
      ],
    },

    anchor: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { id: {} },
      toHTML: (node) => {
        const id = safeAnchorId(node.attrs.id)
        const attrs: Record<string, string> = { class: 'trevixal-anchor' }
        if (id) attrs.id = id
        return { tag: 'a', attrs }
      },
      parseHTML: [
        {
          tag: 'a',
          getAttrs: (element) => {
            if (!(element.getAttribute('class') ?? '').includes('trevixal-anchor')) return false
            const id = safeAnchorId(element.getAttribute('id'))
            return id ? { id } : false
          },
        },
      ],
    },
  }
}

/**
 * True for a content slot: the `block+` body of a toggle, tab or accordion
 * item. These are fixed structure, their parent accepts nothing else in
 * that position, so escaping one means leaving the whole outer block.
 */
export function isContentContainerNode(node: EditorNode): boolean {
  const name = node.type.name
  return name === 'toggleContent' || name === 'tabContent' || name === 'accordionContent'
}

/** True when a node type is one of the containers `liftOutOfContainer` escapes. */
export function isContainerNode(node: EditorNode): boolean {
  const name = node.type.name
  return name === 'callout' || name === 'card' || name === 'column' || isContentContainerNode(node)
}

/** True for the single-line title of a toggle, tab or accordion item. */
export function isTitleNode(node: EditorNode): boolean {
  const name = node.type.name
  return name === 'toggleSummary' || name === 'tabTitle' || name === 'accordionTitle'
}
