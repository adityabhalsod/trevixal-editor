import type { Editor } from '@trevixal/core'
import type { ImageController } from '@trevixal/extension-image'
import { defaultSlashCommands } from '@trevixal/extension-slash-command'
import { iconNames } from '@trevixal/ui'
import { expect, test, vi } from 'vitest'
import { slashItems } from '../src/suggestions'

/**
 * `pickFiles` is the only thing the list asks an `ImageController` for, so a
 * stub carrying that one method is the whole of what it needs; the cast
 * stands in for the rest of the class.
 */
const imageController = (pickFiles = vi.fn()) => ({ pickFiles }) as unknown as ImageController

test('offers the core blocks first, then everything this build adds', () => {
  const items = slashItems(imageController(), vi.fn())
  const core = defaultSlashCommands().map((item) => item.id)

  expect(items.slice(0, core.length).map((item) => item.id)).toEqual(core)
  expect(items.slice(core.length).map((item) => item.id)).toEqual([
    'taskList',
    'table',
    'image',
    'video',
    'diagram',
    'equation',
    'callout',
    'columns',
    'tabs',
    'toggle',
    'pageBreak',
  ])
})

test('every entry is searchable by something other than its title', () => {
  // The filter matches on title and keywords together. An entry added with
  // neither is reachable only by typing its title exactly.
  for (const item of slashItems(imageController(), vi.fn())) {
    expect(item.keywords?.length ?? 0, `${item.id} has no keywords`).toBeGreaterThan(0)
  }
})

test('every entry has an icon the UI draws, and a line saying what it makes', () => {
  const drawn = new Set<string>(iconNames())
  for (const item of slashItems(imageController(), vi.fn())) {
    expect(drawn.has(item.icon ?? ''), `${item.id} has no icon`).toBe(true)
    expect(item.description?.length ?? 0, `${item.id} has no description`).toBeGreaterThan(0)
  }
})

test('the video entry asks for its link the way Insert ▸ Video… does', () => {
  const runMenuEntry = vi.fn()
  slashItems(imageController(), runMenuEntry)
    .find((item) => item.id === 'video')
    ?.run(null as unknown as Editor)
  expect(runMenuEntry).toHaveBeenCalledWith('insertVideo')
})

test('the image entry opens the upload picker rather than inserting a node', () => {
  const pickFiles = vi.fn()
  const entry = slashItems(imageController(pickFiles), vi.fn()).find((item) => item.id === 'image')

  // It ignores the editor it is handed: the node arrives when the upload does.
  entry?.run(null as unknown as Editor)
  expect(pickFiles).toHaveBeenCalledOnce()
})
