/**
 * The second surfaces on one document: a read-only preview of the page a
 * download would produce, and a second live editor beside it.
 *
 * Both are the same `createSplitView` in different modes, both hang off the
 * layout rather than the writing surface, and both are toggles, which is
 * why they are one module rather than two. The editor that owns them keeps
 * no handle on either; it asks whether one is open and tells them to swap.
 */
import type { Editor } from '@trevixal/core'
import { blockBindings, installFieldUpdater } from '@trevixal/extension-blocks'
import { type Highlighter, codeHighlight } from '@trevixal/extension-code-highlight'
import { diagram } from '@trevixal/extension-diagram'
import { createSplitView } from '@trevixal/extension-workspace'
import {
  captureRenderedBlocks,
  collectDocumentCSS,
  createNamedStyleSheet,
  documentBehaviourScript,
  editorTheme,
  renderedNodeHTML,
} from '@trevixal/ui'

export interface SplitPanesContext {
  editor: Editor
  /** Where the preview goes. Hidden until it is asked for. */
  previewHost: HTMLElement
  /** Where the second editor goes. Hidden until it is asked for. */
  mirrorHost: HTMLElement
  /** The editor's own, so a pane does not build a second set of caches. */
  highlighter: Highlighter
  /** The editor's own, so a pane draws through the same loaded Mermaid. */
  render: NonNullable<Parameters<typeof diagram>[1]['render']>
}

export interface SplitPanes {
  togglePreview(): void
  toggleMirror(): void
  isPreviewOpen(): boolean
  isMirrorOpen(): boolean
  /**
   * Redraw the preview if one is open. The pane renders from the document,
   * so anything that changes the page without changing the document has to
   * say so.
   */
  refreshPreview(): void
  /** Close both, in that order. Safe to call with neither open. */
  destroy(): void
}

export function createSplitPanes(context: SplitPanesContext): SplitPanes {
  const { editor, previewHost, mirrorHost, highlighter, render } = context
  let preview: ReturnType<typeof createSplitView> | null = null
  let mirror: ReturnType<typeof createSplitView> | null = null

  /**
   * Everything a second editing surface needs to behave like the first.
   *
   * A mirror shares the document and nothing else: highlighting is a decoration
   * layer, a diagram is an element the view appends beside its code block, and
   * the tab and accordion titles are click handlers. All of them installed per
   * editor. A mirror without them shows grey code, no diagrams, and tab titles
   * that do not respond, which makes the pane look broken rather than mirrored.
   * The field updater too: an edit made here carries its renumbering with it
   * into the editor, and a mirror without one would keep the old numbers.
   */
  function dressPane(pane: Editor): () => void {
    const offHighlight = codeHighlight(pane, highlighter)
    const offBindings = blockBindings(pane)
    const diagrams = diagram(pane, { render })
    const offFields = installFieldUpdater(pane)
    // Its own scope for the document's named styles, as the editor's surface has.
    const namedStyles = createNamedStyleSheet(pane)
    return () => {
      offHighlight()
      offBindings()
      diagrams.destroy()
      offFields()
      namedStyles.destroy()
    }
  }

  return {
    togglePreview() {
      if (preview) {
        preview.destroy()
        preview = null
        previewHost.hidden = true
        return
      }
      previewHost.hidden = false
      preview = createSplitView(editor, {
        container: previewHost,
        mode: 'preview',
        styles: collectDocumentCSS(),
        theme: () => editorTheme(editor),
        // The same three the downloaded page gets. Colours and diagrams are
        // not in the document, one is a decoration, the other an element
        // beside the block, so they are read off the live editor; the script
        // is what makes the preview's tabs and accordions work rather than
        // being a picture of a tab strip.
        renderNode: () => renderedNodeHTML(captureRenderedBlocks(editor)),
        script: documentBehaviourScript,
      })
    },

    toggleMirror() {
      if (mirror) {
        mirror.destroy()
        mirror = null
        mirrorHost.hidden = true
        return
      }
      mirrorHost.hidden = false
      mirror = createSplitView(editor, {
        container: mirrorHost,
        mode: 'mirror',
        onMirror: dressPane,
      })
    },

    isPreviewOpen: () => preview !== null,
    isMirrorOpen: () => mirror !== null,
    refreshPreview: () => preview?.refresh(),

    destroy() {
      preview?.destroy()
      mirror?.destroy()
    },
  }
}
