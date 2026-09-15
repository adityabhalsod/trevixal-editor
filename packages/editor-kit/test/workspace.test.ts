import type { Editor } from '@trevixal/core'
import { beforeEach, expect, test } from 'vitest'
import { createDocumentWorkspace } from '../src/workspace'

/**
 * The store is opened before anything is drawn, and none of the tests below
 * gets as far as drawing, so the editor is never read.
 */
const editor = null as unknown as Editor

const workspace = (namespace: string) =>
  createDocumentWorkspace({
    editor,
    stripHost: document.createElement('div'),
    panelHost: document.createElement('div'),
    namespace,
  })

beforeEach(() => {
  window.localStorage.clear()
})

test('opens the store once and hands the same one to every caller', async () => {
  const documents = workspace('trevixal')
  const [first, second] = await Promise.all([documents.store(), documents.store()])

  // The strip autosaves into the store and the sidebar reads it. Two stores
  // over one prefix would each think they held the whole list.
  expect(first).toBe(second)
})

test('keeps two namespaces out of each other documents', async () => {
  const mine = await workspace('mine').store()
  await mine.create({ title: 'Notes', doc: { type: 'doc', content: [] } })
  const theirs = await workspace('theirs').store()

  expect(mine.list()).toHaveLength(1)
  expect(theirs.list()).toHaveLength(0)
})

test('reports itself closed until something has been drawn', () => {
  // `toggleWorkspace` asks this before building, so a wrong answer here is a
  // second tab strip fighting the first over the store.
  expect(workspace('trevixal').isOpen()).toBe(false)
})

test('tearing down a workspace that was never opened does nothing', () => {
  expect(() => workspace('trevixal').destroy()).not.toThrow()
})
