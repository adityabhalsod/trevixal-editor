import {
  type Command,
  type EditorNode,
  EditorState,
  Fragment,
  NodeSelection,
  Schema,
  TextSelection,
  defaultMarks,
  defaultNodes,
  pos,
} from '@trevixal/core'
import { describe, expect, it, vi } from 'vitest'
import {
  deleteEmbed,
  embedNodes,
  embedUICommands,
  insertAttachment,
  insertAudio,
  insertEmbed,
  insertIframe,
  insertLinkCard,
  insertLinkCardFor,
  insertVideo,
  updateEmbedAttrs,
} from '../src'

const options = { allowIframeHosts: ['example.com'] }

const schema = new Schema({
  nodes: { ...defaultNodes(), ...embedNodes(options) },
  marks: defaultMarks(),
})

function p(text = ''): EditorNode {
  return schema.node('paragraph', undefined, text ? [schema.text(text)] : [])
}

function stateOf(blocks: EditorNode[], selection?: TextSelection | NodeSelection): EditorState {
  const doc = schema.node('doc', undefined, Fragment.from(blocks))
  return EditorState.create({ schema, doc, selection: selection ?? new TextSelection(pos([0], 0)) })
}

function run(state: EditorState, command: Command): EditorState | null {
  const tr = command(state)
  return tr ? state.apply(tr) : null
}

function names(state: EditorState): string[] {
  return state.doc.content.children.map((node) => node.type.name)
}

const YT = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'

describe('block inserts', () => {
  it('replaces an empty paragraph at the caret', () => {
    const next = run(stateOf([p()]), insertVideo({ src: 'https://cdn.test/a.mp4' }))
    expect(next && names(next)).toEqual(['video'])
    expect(next?.doc.child(0).attrs.src).toBe('https://cdn.test/a.mp4')
  })

  it('inserts after a non-empty block and leaves the text alone', () => {
    const state = stateOf([p('hello'), p('world')], new TextSelection(pos([0], 2)))
    const next = run(state, insertAudio({ src: 'https://cdn.test/a.mp3', title: 'Song' }))
    expect(next && names(next)).toEqual(['paragraph', 'audio', 'paragraph'])
    expect(next?.doc.child(1).attrs).toMatchObject({ src: 'https://cdn.test/a.mp3', title: 'Song' })
    expect(next?.doc.textContent).toBe('helloworld')
  })

  it('inserts after a node-selected embed rather than replacing it', () => {
    const video = schema.node('video', { src: 'https://cdn.test/a.mp4' })
    const state = stateOf([p('x'), video], new NodeSelection([1]))
    const next = run(state, insertLinkCard({ href: 'https://example.com/' }))
    expect(next && names(next)).toEqual(['paragraph', 'video', 'linkCard'])
  })

  it('stringifies numeric dimensions and keeps controls off when asked', () => {
    const next = run(
      stateOf([p()]),
      insertVideo({ src: '/a.mp4', width: 640, height: 360, controls: false, poster: '/a.jpg' }),
    )
    expect(next?.doc.child(0).attrs).toMatchObject({
      width: '640',
      height: '360',
      controls: false,
      poster: '/a.jpg',
    })
  })

  it('declines unsafe media sources', () => {
    expect(run(stateOf([p()]), insertVideo({ src: 'javascript:alert(1)' }))).toBeNull()
    expect(run(stateOf([p()]), insertAudio({ src: 'data:audio/mp3;base64,AA' }))).toBeNull()
  })

  it('inserts an iframe only for an allowlisted host, deriving the provider', () => {
    const yt = run(stateOf([p()]), insertIframe({ src: YT, title: 'Clip' }, options))
    expect(yt?.doc.child(0).attrs).toMatchObject({ src: YT, title: 'Clip', provider: 'youtube' })

    const generic = run(
      stateOf([p()]),
      insertIframe({ src: 'https://maps.example.com/e', width: 600 }, options),
    )
    expect(generic?.doc.child(0).attrs).toMatchObject({ provider: 'generic', width: '600' })

    expect(run(stateOf([p()]), insertIframe({ src: 'https://evil.test/' }, options))).toBeNull()
    expect(run(stateOf([p()]), insertIframe({ src: 'https://maps.example.com/e' }))).toBeNull()
  })

  it('inserts a link card only for an absolute http(s) URL', () => {
    const next = run(
      stateOf([p()]),
      insertLinkCard({ href: 'https://example.com/a', title: 'A', siteName: 'Ex' }),
    )
    expect(next?.doc.child(0).attrs).toMatchObject({
      href: 'https://example.com/a',
      title: 'A',
      description: null,
      image: null,
      siteName: 'Ex',
    })
    expect(run(stateOf([p()]), insertLinkCard({ href: '/relative' }))).toBeNull()
    expect(run(stateOf([p()]), insertLinkCard({ href: 'javascript:x' }))).toBeNull()
  })
})

describe('insertEmbed', () => {
  it.each([
    ['https://youtu.be/dQw4w9WgXcQ', 'iframeEmbed', { src: YT, provider: 'youtube' }],
    [
      'https://vimeo.com/123456',
      'iframeEmbed',
      { src: 'https://player.vimeo.com/video/123456', provider: 'vimeo' },
    ],
    ['https://cdn.test/a.mp4', 'video', { src: 'https://cdn.test/a.mp4' }],
    ['https://cdn.test/a.mp3', 'audio', { src: 'https://cdn.test/a.mp3' }],
    ['https://maps.example.com/e', 'iframeEmbed', { provider: 'generic' }],
  ])('turns %s into a %s node', (url, name, attrs) => {
    const next = run(stateOf([p()]), insertEmbed(url, options))
    expect(next?.doc.child(0).type.name).toBe(name)
    expect(next?.doc.child(0).attrs).toMatchObject(attrs)
  })

  it('declines URLs it does not recognise', () => {
    expect(run(stateOf([p()]), insertEmbed('https://unknown.test/page', options))).toBeNull()
    expect(run(stateOf([p()]), insertEmbed('garbage'))).toBeNull()
  })
})

describe('insertAttachment', () => {
  it('inserts an inline chip at the caret', () => {
    const state = stateOf([p('see ')], new TextSelection(pos([0], 4)))
    const next = run(
      state,
      insertAttachment({ href: 'https://f.test/a.pdf', name: 'a.pdf', size: 12, type: 'x/y' }),
    )
    const chip = next?.doc.child(0).child(1)
    expect(chip?.type.name).toBe('attachment')
    expect(chip?.attrs).toEqual({
      href: 'https://f.test/a.pdf',
      name: 'a.pdf',
      size: 12,
      type: 'x/y',
      storageKey: null,
      uploadId: null,
    })
    expect(next?.selection.from).toEqual(pos([0], 5))
  })

  it('allows an empty href only for a pending upload', () => {
    expect(run(stateOf([p()]), insertAttachment({ href: '', name: 'a' }))).toBeNull()
    const pending = run(stateOf([p()]), insertAttachment({ href: '', name: 'a', uploadId: 'u1' }))
    expect(pending?.doc.child(0).child(0).attrs.uploadId).toBe('u1')
    expect(run(stateOf([p()]), insertAttachment({ href: 'javascript:x', name: 'a' }))).toBeNull()
  })
})

describe('insertLinkCardFor', () => {
  it('uses the fetched preview when one is available', async () => {
    const fetchPreview = vi.fn(async () => ({
      title: 'Fetched',
      description: 'D',
      image: 'https://example.com/i.png',
      siteName: 'Site',
    }))
    const command = await insertLinkCardFor('https://example.com/page', fetchPreview)
    expect(fetchPreview).toHaveBeenCalledWith('https://example.com/page')
    const next = command && run(stateOf([p()]), command)
    expect(next?.doc.child(0).attrs).toEqual({
      href: 'https://example.com/page',
      title: 'Fetched',
      description: 'D',
      image: 'https://example.com/i.png',
      siteName: 'Site',
    })
  })

  it('falls back to the hostname without a fetcher, or when it fails', async () => {
    const bare = await insertLinkCardFor('https://www.example.com/page')
    expect(bare && run(stateOf([p()]), bare)?.doc.child(0).attrs.title).toBe('example.com')

    const failing = await insertLinkCardFor('https://www.example.com/page', async () => {
      throw new Error('offline')
    })
    expect(failing && run(stateOf([p()]), failing)?.doc.child(0).attrs.title).toBe('example.com')

    const empty = await insertLinkCardFor('https://www.example.com/page', async () => null)
    expect(empty && run(stateOf([p()]), empty)?.doc.child(0).attrs.description).toBeNull()
  })

  it('resolves null for a URL that is not http(s)', async () => {
    expect(await insertLinkCardFor('javascript:alert(1)')).toBeNull()
    expect(await insertLinkCardFor('not a url')).toBeNull()
  })
})

describe('updateEmbedAttrs and deleteEmbed', () => {
  const video = () => schema.node('video', { src: 'https://cdn.test/a.mp4' })

  it('patches the node-selected embed', () => {
    const state = stateOf([p('x'), video()], new NodeSelection([1]))
    const next = run(state, updateEmbedAttrs({ title: 'Titled', width: '320' }))
    expect(next?.doc.child(1).attrs).toMatchObject({
      src: 'https://cdn.test/a.mp4',
      title: 'Titled',
      width: '320',
    })
  })

  it('patches the embed right after the caret, where an insert leaves it', () => {
    const inserted = run(
      stateOf([p('x')], new TextSelection(pos([0], 1))),
      insertVideo({ src: '/a.mp4' }),
    )
    expect(inserted && names(inserted)).toEqual(['paragraph', 'video'])
    const next = inserted && run(inserted, updateEmbedAttrs({ poster: '/a.jpg' }))
    expect(next?.doc.child(1).attrs.poster).toBe('/a.jpg')
  })

  it('declines when no embed is near the selection', () => {
    expect(run(stateOf([p('x'), p('y')]), updateEmbedAttrs({ title: 't' }))).toBeNull()
    expect(run(stateOf([p('x'), p('y')]), deleteEmbed)).toBeNull()
  })

  it('removes the embed and keeps the surrounding blocks', () => {
    const state = stateOf([p('x'), video(), p('y')], new NodeSelection([1]))
    const next = run(state, deleteEmbed)
    expect(next && names(next)).toEqual(['paragraph', 'paragraph'])
    expect(next?.doc.textContent).toBe('xy')
  })

  it('leaves an empty paragraph when the embed was the only block', () => {
    const next = run(stateOf([video()], new NodeSelection([0])), deleteEmbed)
    expect(next && names(next)).toEqual(['paragraph'])
    expect(next?.selection.from).toEqual(pos([0], 0))
  })
})

describe('embedUICommands', () => {
  it('closes over the allowlist and forwards to the commands', () => {
    const ui = embedUICommands(options)
    expect(
      run(stateOf([p()]), ui.insertEmbed('https://maps.example.com/e'))?.doc.child(0).type.name,
    ).toBe('iframeEmbed')
    expect(run(stateOf([p()]), ui.insertIframe('https://evil.test/', 'nope'))).toBeNull()
    expect(run(stateOf([p()]), ui.insertIframe(YT, 'Clip'))?.doc.child(0).attrs.title).toBe('Clip')
    expect(run(stateOf([p()]), ui.insertVideo('/a.mp4'))?.doc.child(0).type.name).toBe('video')
    expect(run(stateOf([p()]), ui.insertAudio('/a.mp3'))?.doc.child(0).type.name).toBe('audio')
    expect(
      run(
        stateOf([p()]),
        ui.insertLinkCard({ href: 'https://example.com/', title: 'T' }),
      )?.doc.child(0).type.name,
    ).toBe('linkCard')
  })
})
