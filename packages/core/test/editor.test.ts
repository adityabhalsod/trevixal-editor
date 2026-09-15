import { describe, expect, it } from 'vitest'
import { createEditor } from '../src/editor/editor'
import { Schema } from '../src/model/schema'
import { defaultMarks, defaultNodes } from '../src/schema/basic'
import { serializeToHTML } from '../src/serialize/html'
import { bold, doc, h, p, testSchema, text } from './helpers'

describe('createEditor', () => {
  it('starts from an empty paragraph by default', () => {
    const editor = createEditor({ schema: testSchema })
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    })
  })

  it('accepts JSON content and reports changes', () => {
    const changes: string[] = []
    const editor = createEditor({
      schema: testSchema,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
      },
      onChange: ({ html }) => changes.push(html),
    })
    editor.commands.selectAll()
    editor.commands.deleteSelection()
    editor.commands.insertText('yo')
    expect(changes[changes.length - 1]).toBe('<p>yo</p>')
  })

  it('supports chained commands', () => {
    const editor = createEditor({ schema: testSchema })
    const ok = editor.chain().focus().setHeading(2).insertText('Title').run()
    expect(ok).toBe(true)
    expect(editor.getHTML()).toBe('<h2>Title</h2>')
  })

  it('exposes a toolbar snapshot', () => {
    const editor = createEditor({ schema: testSchema, doc: doc(h(2, 'x')) })
    editor.commands.selectAll()
    const snapshot = editor.getSnapshot()
    expect(snapshot.blockType).toBe('heading')
    expect(snapshot.blockAttrs).toMatchObject({ level: 2 })
    expect(snapshot.selectionEmpty).toBe(false)
    expect(snapshot.canUndo).toBe(false)
    editor.commands.toggleMark('bold')
    expect(editor.getSnapshot().activeMarks).toContain('bold')
    expect(editor.getSnapshot().canUndo).toBe(true)
  })

  it('notifies and unsubscribes listeners', () => {
    const editor = createEditor({ schema: testSchema })
    let updates = 0
    const off = editor.on('update', () => updates++)
    editor.commands.insertText('a')
    off()
    editor.commands.insertText('b')
    expect(updates).toBe(1)
  })
})

describe('HTML serialization', () => {
  it('renders marks, headings and escapes text', () => {
    const html = serializeToHTML(doc(h(1, 'Ti<le'), p(text('a '), bold('b & c'))))
    expect(html).toBe('<h1>Ti&lt;le</h1><p>a <strong>b &amp; c</strong></p>')
  })

  it('renders code blocks with pre > code and void nodes', () => {
    const code = testSchema.node('codeBlock', undefined, [text('x < 1')])
    const html = serializeToHTML(doc(code, testSchema.node('horizontalRule')))
    expect(html).toBe('<pre><code>x &lt; 1</code></pre><hr>')
  })

  it('drops javascript: URLs from links', () => {
    const evil = testSchema.text('click', [
      testSchema.mark('link', { href: 'javascript:alert(1)' }),
    ])
    const safe = testSchema.text('ok', [testSchema.mark('link', { href: 'https://x.dev' })])
    const html = serializeToHTML(doc(p(evil), p(safe)))
    expect(html).toBe('<p><a>click</a></p><p><a href="https://x.dev">ok</a></p>')
  })

  it('escapes attribute values', () => {
    const sneaky = testSchema.text('x', [
      testSchema.mark('link', { href: 'https://x.dev/"><script>' }),
    ])
    const html = serializeToHTML(doc(p(sneaky)))
    expect(html).not.toContain('"><script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
  })
})

describe('SSR safety', () => {
  it('creates schemas and editors without any DOM globals', () => {
    // This suite runs in a plain node environment, reaching here proves it.
    const isolated = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })
    const editor = createEditor({ schema: isolated })
    editor.commands.insertText('no dom needed')
    expect(editor.getText()).toBe('no dom needed')
    editor.destroy()
    expect(editor.commands.insertText('after destroy')).toBe(false)
  })
})

describe('snapshot stability', () => {
  it('hands back the same object while nothing a toolbar draws has changed', () => {
    // Every adapter sits on this. A new object per keystroke means a toolbar
    // re-render per keystroke in React, Vue, Svelte and Angular alike,
    // measured at eleven renders for ten characters before this held.
    const editor = createEditor({ schema: testSchema })
    editor.commands.insertText('a')
    const settled = editor.getSnapshot()
    editor.commands.insertText('b')
    editor.commands.insertText('c')
    expect(editor.getSnapshot()).toBe(settled)
  })

  it('changes when a mark under the caret changes', () => {
    const editor = createEditor({ schema: testSchema })
    editor.commands.insertText('hello')
    const before = editor.getSnapshot()
    editor.commands.selectAll()
    editor.commands.toggleMark('bold')
    const after = editor.getSnapshot()
    expect(after).not.toBe(before)
    expect(after.activeMarks).toContain('bold')
  })

  it('changes when the block type changes', () => {
    const editor = createEditor({ schema: testSchema })
    editor.commands.insertText('hello')
    const before = editor.getSnapshot()
    editor.commands.setHeading(2)
    expect(editor.getSnapshot()).not.toBe(before)
  })

  it('changes when undo becomes available, and then settles', () => {
    // The first keystroke flips `canUndo`, which a toolbar does draw. The
    // second and third change nothing.
    const editor = createEditor({ schema: testSchema })
    const empty = editor.getSnapshot()
    expect(empty.canUndo).toBe(false)
    editor.commands.insertText('a')
    const typed = editor.getSnapshot()
    expect(typed).not.toBe(empty)
    expect(typed.canUndo).toBe(true)
    editor.commands.insertText('b')
    expect(editor.getSnapshot()).toBe(typed)
  })

  it('still notifies subscribers on every transaction', () => {
    // Stability decides whether a subscriber has anything new to look at, not
    // whether it is told something happened.
    const editor = createEditor({ schema: testSchema })
    let notifications = 0
    const stop = editor.subscribe(() => {
      notifications += 1
    })
    // One call per character, the way typing arrives.
    for (const character of 'abc') editor.commands.insertText(character)
    expect(notifications).toBe(3)
    stop()
  })
})
