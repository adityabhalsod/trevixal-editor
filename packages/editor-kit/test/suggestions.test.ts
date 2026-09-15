import type { Editor } from '@trevixal/core'
import type { ImageController } from '@trevixal/extension-image'
import { defaultSlashCommands } from '@trevixal/extension-slash-command'
import { expect, test, vi } from 'vitest'
import { slashItems } from '../src/suggestions'

/**
 * `pickFiles` is the only thing the list asks an `ImageController` for, so a
 * stub carrying that one method is the whole of what it needs; the cast
 * stands in for the rest of the class.
 */
const imageController = (pickFiles = vi.fn()) => ({ pickFiles }) as unknown as ImageController

test('offers the core blocks first, then everything this build adds', () => {
  const items = slashItems(imageController())
  const core = defaultSlashCommands().map((item) => item.id)

  expect(items.slice(0, core.length).map((item) => item.id)).toEqual(core)
  expect(items.slice(core.length).map((item) => item.id)).toEqual([
    'table',
    'image',
    'diagram',
    'equation',
    'callout',
    'columns',
    'toggle',
  ])
})

test('every entry is searchable by something other than its title', () => {
  // The filter matches on title and keywords together. An entry added with
  // neither is reachable only by typing its title exactly.
  for (const item of slashItems(imageController())) {
    expect(item.keywords?.length ?? 0, `${item.id} has no keywords`).toBeGreaterThan(0)
  }
})

test('the image entry opens the upload picker rather than inserting a node', () => {
  const pickFiles = vi.fn()
  const entry = slashItems(imageController(pickFiles)).find((item) => item.id === 'image')

  // It ignores the editor it is handed: the node arrives when the upload does.
  entry?.run(null as unknown as Editor)
  expect(pickFiles).toHaveBeenCalledOnce()
})
