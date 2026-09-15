import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { describe, expect, test } from 'vitest'
import { createBlockDragHandle } from '../src/block-drag-handle'
import { createBubbleMenu } from '../src/bubble-menu'
import { createCodeLanguageSelect } from '../src/code-language'
import { createLinkPopover } from '../src/link-popover'
import { createSourceMode } from '../src/source-mode'
import { type TableToolbarCommands, createTableToolbar } from '../src/table-toolbar'

/** Headless: no `element`, so the editor builds no view and owns no document. */
const headless = () =>
  createEditor({ schema: new Schema({ nodes: defaultNodes(), marks: defaultMarks() }) })

/**
 * What every piece of floating chrome does when handed an editor that has no
 * view and no container to fall back to.
 *
 * Each names itself in the message, which is the whole value of the guard: a
 * host mounting six of these in a row learns which one it called too early.
 */
describe('chrome that needs a document', () => {
  const cases: ReadonlyArray<readonly [string, () => unknown]> = [
    ['createBubbleMenu', () => createBubbleMenu(headless())],
    ['createLinkPopover', () => createLinkPopover(headless())],
    ['createSourceMode', () => createSourceMode(headless())],
    [
      'createTableToolbar',
      // Cast rather than stubbed: the guard runs before a single command is
      // read, so supplying ten no-ops would only obscure what is under test.
      () => createTableToolbar(headless(), { commands: {} as TableToolbarCommands }),
    ],
    ['createBlockDragHandle', () => createBlockDragHandle(headless(), {})],
    ['createCodeLanguageSelect', () => createCodeLanguageSelect(headless(), { languages: [] })],
  ]

  for (const [name, call] of cases) {
    test(`${name} refuses an editor with no view`, () => {
      expect(call).toThrow(`${name}: the editor must have a view`)
    })
  }
})
