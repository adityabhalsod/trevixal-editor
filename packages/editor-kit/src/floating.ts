/**
 * The controls that follow the caret and the pointer around the writing
 * surface, rather than sitting still in the chrome.
 *
 * All eight take the same container and appear only when the thing they act
 * on is under the caret, a code block, a table, an image, a selection, a
 * link, a block being hovered. None of them is configurable from here: what
 * they need is the editor, the surface they float over, and, for the image
 * pair, the controller that owns the uploads.
 */
import type { Editor } from '@trevixal/core'
import {
  BUNDLED_LANGUAGES,
  copyToClipboard,
  detectLanguage,
  languageDisplayName,
} from '@trevixal/extension-code-highlight'
import {
  type ImageController,
  createImageResizeHandles,
  createImageToolbar,
} from '@trevixal/extension-image'
import { createTableResizeHandles, tableUICommands } from '@trevixal/extension-table'
import {
  createBlockDragHandle,
  createBubbleMenu,
  createCodeLanguageSelect,
  createLinkPopover,
  createTableToolbar,
} from '@trevixal/ui'

export interface FloatingControls {
  /** Takes all eight off the surface, in the order they were installed. */
  destroy(): void
}

/** Install every floating control on `editor`, hanging them off `container`. */
export function createFloatingControls(
  editor: Editor,
  container: HTMLElement,
  images: ImageController,
): FloatingControls {
  const languageSelect = createCodeLanguageSelect(editor, {
    container,
    languages: BUNDLED_LANGUAGES.map((language) => ({
      value: language.name,
      label: languageDisplayName(language),
    })),
    detect: (code) => detectLanguage(code)?.language.name ?? null,
    onCopy: (code) => copyToClipboard(document, code),
  })

  const tableToolbar = createTableToolbar(editor, {
    container,
    commands: tableUICommands({ editor }),
  })
  const tableHandles = createTableResizeHandles(editor, { container })

  // Select an image to align, resize, crop, rotate, caption or describe it.
  const imageToolbar = createImageToolbar(editor, images, { container })
  const imageHandles = createImageResizeHandles(editor, { container })

  // Select text for the inline actions; put the caret in a link to edit it where
  // it sits; hover a block for the grip that moves it.
  const bubble = createBubbleMenu(editor, { container })
  const linkPopover = createLinkPopover(editor, { container })
  const dragHandle = createBlockDragHandle(editor, { container })

  return {
    destroy() {
      // Written out rather than collected as they were made, for the same
      // reason the mount writes out its own list: one left off here is a
      // listener that outlives the page.
      for (const part of [
        languageSelect,
        tableToolbar,
        tableHandles,
        imageToolbar,
        imageHandles,
        bubble,
        linkPopover,
        dragHandle,
      ]) {
        part.destroy()
      }
    },
  }
}
