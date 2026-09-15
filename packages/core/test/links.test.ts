import { describe, expect, it } from 'vitest'
import {
  insertEmailLink,
  isEmailAddress,
  removeLink,
  setLinkTarget,
  updateLink,
} from '../src/commands/links'
import { applyInputRules, defaultInputRules } from '../src/input-rules/input-rules'
import { Fragment } from '../src/model/fragment'
import type { EditorNode } from '../src/model/node'
import { serializeToHTML } from '../src/serialize/html'
import type { EditorState } from '../src/state/editor-state'
import { cursor, doc, p, range, stateWith, testSchema } from './helpers'

const rules = defaultInputRules()

function typeChar(state: EditorState, char: string): EditorState | null {
  const tr = applyInputRules(state, char, rules)
  return tr ? state.apply(tr) : null
}

function codeBlock(text: string): EditorNode {
  return testSchema.node('codeBlock', { language: null }, Fragment.of(testSchema.text(text)))
}

/** The link mark on the first text child carrying one, if any. */
function linkOn(state: EditorState, blockIndex = 0) {
  const block = state.doc.child(blockIndex)
  for (const child of block.content.children) {
    const mark = child.marks.find((candidate) => candidate.type.name === 'link')
    if (mark) return mark
  }
  return null
}

function linked(value: string, attrs: Record<string, unknown>): EditorNode {
  return testSchema.text(value, [testSchema.mark('link', attrs)])
}

describe('autolink input rule', () => {
  it('links a URL once a space follows it', () => {
    const state = stateWith(doc(p('see https://x.dev')), cursor([0], 17))
    const next = typeChar(state, ' ')
    expect(next).not.toBeNull()
    const mark = linkOn(next as EditorState)
    expect(mark?.attrs.href).toBe('https://x.dev')
    // The typed space is preserved, and is not part of the link.
    expect((next as EditorState).doc.child(0).textContent).toBe('see https://x.dev ')
  })

  it('gives a bare www. host an https scheme', () => {
    const state = stateWith(doc(p('www.example.com')), cursor([0], 15))
    const next = typeChar(state, ' ')
    expect(linkOn(next as EditorState)?.attrs.href).toBe('https://www.example.com')
  })

  it('leaves trailing sentence punctuation out of the link', () => {
    const state = stateWith(doc(p('go to https://x.dev/a.')), cursor([0], 22))
    const next = typeChar(state, ' ')
    const mark = linkOn(next as EditorState)
    expect(mark?.attrs.href).toBe('https://x.dev/a')
  })

  it('keeps balanced parentheses inside the link', () => {
    const state = stateWith(doc(p('https://x.dev/a_(b)')), cursor([0], 19))
    const next = typeChar(state, ' ')
    expect(linkOn(next as EditorState)?.attrs.href).toBe('https://x.dev/a_(b)')
  })

  it('does not fire inside a code block', () => {
    // A code block allows no marks at all, which is what must stop the rule.
    const state = stateWith(doc(codeBlock('https://x.dev')), cursor([0], 13))
    expect(typeChar(state, ' ')).toBeNull()
  })

  it('does not link a javascript: URL', () => {
    const state = stateWith(doc(p('javascript:alert(1)')), cursor([0], 19))
    // The pattern only matches http(s):// and www., so this never even runs;
    // safeHref is the second line of defence behind it.
    expect(typeChar(state, ' ')).toBeNull()
  })

  it('does not fire on a partial URL with no terminating space', () => {
    const state = stateWith(doc(p('https://x.de')), cursor([0], 12))
    expect(typeChar(state, 'v')).toBeNull()
  })

  it('can be turned off', () => {
    const noAutolink = defaultInputRules({ autolink: false })
    const state = stateWith(doc(p('https://x.dev')), cursor([0], 13))
    expect(applyInputRules(state, ' ', noAutolink)).toBeNull()
  })
})

describe('setLinkTarget', () => {
  it('adds the target to a selected link', () => {
    const document = doc(p(linked('site', { href: 'https://x.dev' })))
    const state = stateWith(document, range([0], 0, [0], 4))
    const next = state.apply(setLinkTarget('_blank')(state) as never)
    expect(linkOn(next)?.attrs.target).toBe('_blank')
  })

  it('always emits rel="noopener noreferrer" alongside target=_blank', () => {
    // Without the rel, the opened page can retarget this one via
    // window.opener, the reverse-tabnabbing issue. They ship together.
    const document = doc(p(linked('site', { href: 'https://x.dev', target: '_blank' })))
    const html = serializeToHTML(document)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('emits neither target nor rel without the attr', () => {
    const html = serializeToHTML(doc(p(linked('site', { href: 'https://x.dev' }))))
    expect(html).not.toContain('target=')
    expect(html).not.toContain('rel=')
  })

  it('retargets the whole link from a bare cursor inside it', () => {
    const document = doc(p(linked('a long link', { href: 'https://x.dev' })))
    const state = stateWith(document, cursor([0], 4))
    const next = state.apply(setLinkTarget('_blank')(state) as never)
    expect(
      next.doc.eq(doc(p(linked('a long link', { href: 'https://x.dev', target: '_blank' })))),
    ).toBe(true)
  })

  it('clears the target with null', () => {
    const document = doc(p(linked('site', { href: 'https://x.dev', target: '_blank' })))
    const state = stateWith(document, range([0], 0, [0], 4))
    const next = state.apply(setLinkTarget(null)(state) as never)
    expect(linkOn(next)?.attrs.target).toBeNull()
  })

  it('declines when the selection touches no link', () => {
    const state = stateWith(doc(p('plain text')), range([0], 0, [0], 5))
    expect(setLinkTarget('_blank')(state)).toBeNull()
  })

  it('declines when the target is already set', () => {
    const document = doc(p(linked('site', { href: 'https://x.dev', target: '_blank' })))
    const state = stateWith(document, range([0], 0, [0], 4))
    expect(setLinkTarget('_blank')(state)).toBeNull()
  })
})

describe('insertEmailLink', () => {
  it('inserts a mailto link at the cursor', () => {
    const state = stateWith(doc(p('')), cursor([0], 0))
    const next = state.apply(insertEmailLink('a@b.com')(state) as never)
    expect(next.doc.eq(doc(p(linked('a@b.com', { href: 'mailto:a@b.com' }))))).toBe(true)
    expect(next.selection.from).toEqual({ path: [0], offset: 7 })
  })

  it('uses custom link text when given', () => {
    const state = stateWith(doc(p('')), cursor([0], 0))
    const next = state.apply(insertEmailLink('a@b.com', { text: 'Email me' })(state) as never)
    expect(next.doc.child(0).textContent).toBe('Email me')
    expect(linkOn(next)?.attrs.href).toBe('mailto:a@b.com')
  })

  it('links an existing selection instead of inserting', () => {
    const state = stateWith(doc(p('contact us')), range([0], 0, [0], 10))
    const next = state.apply(insertEmailLink('a@b.com')(state) as never)
    expect(next.doc.child(0).textContent).toBe('contact us')
    expect(linkOn(next)?.attrs.href).toBe('mailto:a@b.com')
  })

  it('carries the target through when asked', () => {
    const state = stateWith(doc(p('')), cursor([0], 0))
    const next = state.apply(insertEmailLink('a@b.com', { target: '_blank' })(state) as never)
    expect(linkOn(next)?.attrs.target).toBe('_blank')
  })

  it('declines a bogus address', () => {
    const state = stateWith(doc(p('')), cursor([0], 0))
    for (const bogus of [
      'not-an-email',
      'a@',
      '@b.com',
      'a@b',
      'a b@c.com',
      'a@b..com',
      'a@b.c',
      '',
      '   ',
      'a@b.com extra',
      'a<b>@c.com',
    ]) {
      expect(insertEmailLink(bogus)(state), `accepted "${bogus}"`).toBeNull()
    }
  })

  it('accepts ordinary addresses', () => {
    for (const good of [
      'a@b.com',
      'first.last@sub.example.co.uk',
      'user+tag@example.io',
      'a_b-c@example-host.dev',
    ]) {
      expect(isEmailAddress(good), `rejected "${good}"`).toBe(true)
    }
  })
})

describe('removeLink', () => {
  it('removes the link from a selection', () => {
    const document = doc(p(linked('site', { href: 'https://x.dev' })))
    const state = stateWith(document, range([0], 0, [0], 4))
    const next = state.apply(removeLink(state) as never)
    expect(next.doc.eq(doc(p('site')))).toBe(true)
  })

  it('removes the whole link from a bare cursor inside it', () => {
    const document = doc(p(linked('a long link', { href: 'https://x.dev' })))
    const state = stateWith(document, cursor([0], 4))
    const next = state.apply(removeLink(state) as never)
    expect(next.doc.eq(doc(p('a long link')))).toBe(true)
  })

  it('declines when there is no link', () => {
    const state = stateWith(doc(p('plain')), range([0], 0, [0], 5))
    expect(removeLink(state)).toBeNull()
  })
})

describe('updateLink', () => {
  const linkOf = (state: EditorState) =>
    state.doc
      .child(0)
      .content.child(0)
      .marks.find((mark) => mark.type.name === 'link')?.attrs

  it('rewrites the whole link from a bare cursor inside it', () => {
    // The case that matters. `setLink` writes over the *selection*, and a
    // caret selects nothing, so editing an address with the cursor merely
    // parked in the link used to store a pending mark and change nothing,
    // which reads from the outside as an edit that silently failed.
    const document = doc(p(linked('a long link', { href: 'https://old.dev' })))
    const state = stateWith(document, cursor([0], 4))
    const next = state.apply(updateLink({ href: 'https://new.dev/' })(state) as never)
    expect(next.doc.textContent).toBe('a long link')
    expect(linkOf(next)?.href).toBe('https://new.dev/')
  })

  it('rewrites every link a selection covers', () => {
    const document = doc(p(linked('site', { href: 'https://x.dev' })))
    const state = stateWith(document, range([0], 0, [0], 4))
    const next = state.apply(updateLink({ href: 'https://y.dev/' })(state) as never)
    expect(linkOf(next)?.href).toBe('https://y.dev/')
  })

  it('leaves the attributes it was not asked about alone', () => {
    const document = doc(p(linked('site', { href: 'https://x.dev', title: 'Home' })))
    const state = stateWith(document, cursor([0], 2))
    const next = state.apply(updateLink({ href: 'https://y.dev/' })(state) as never)
    expect(linkOf(next)?.title).toBe('Home')
  })

  it('refuses an address that is not a document reference', () => {
    // The address comes from a text field, so what this accepts is a security
    // boundary and not a convenience.
    const document = doc(p(linked('site', { href: 'https://x.dev' })))
    const state = stateWith(document, cursor([0], 2))
    expect(updateLink({ href: 'javascript:alert(1)' })(state)).toBeNull()
    expect(updateLink({ href: '  ' })(state)).toBeNull()
  })

  it('declines when nothing would change, so it never lands in history', () => {
    const document = doc(p(linked('site', { href: 'https://x.dev' })))
    const state = stateWith(document, cursor([0], 2))
    expect(updateLink({ href: 'https://x.dev' })(state)).toBeNull()
  })

  it('declines when the selection touches no link at all', () => {
    const state = stateWith(doc(p('plain')), cursor([0], 2))
    expect(updateLink({ href: 'https://x.dev' })(state)).toBeNull()
  })
})
