import type { Editor } from '@trevixal/core'

export interface StatusBarOptions {
  /** Show the element path (`p › strong`) on the left. Defaults to true. */
  readonly showPath?: boolean
  /** Show word and character counts on the right. Defaults to true. */
  readonly showCounts?: boolean
}

export interface StatusBar {
  readonly element: HTMLElement
  destroy(): void
}

/**
 * The bar under the editor: current element path on the left, word and
 * character counts on the right. The familiar footer of desktop editors.
 */
export function createStatusBar(
  editor: Editor,
  container: HTMLElement,
  options: StatusBarOptions = {},
): StatusBar {
  const document = container.ownerDocument
  const root = document.createElement('div')
  root.className = 'trevixal-statusbar'

  const path = document.createElement('span')
  path.className = 'trevixal-statusbar__path'
  const counts = document.createElement('span')
  counts.className = 'trevixal-statusbar__counts'

  if (options.showPath !== false) root.appendChild(path)
  if (options.showCounts !== false) root.appendChild(counts)

  const refresh = (): void => {
    if (options.showPath !== false) {
      const snapshot = editor.getSnapshot()
      const parts = [snapshot.blockType ?? '', ...snapshot.activeMarks].filter(Boolean)
      path.textContent = parts.join(' › ')
    }
    if (options.showCounts !== false) {
      const words = editor.getWordCount()
      const characters = editor.getCharacterCount()
      counts.textContent = `${words} word${words === 1 ? '' : 's'}, ${characters} character${
        characters === 1 ? '' : 's'
      }`
    }
  }
  refresh()
  const unsubscribe = editor.on('transaction', refresh)

  container.appendChild(root)
  return {
    element: root,
    destroy() {
      unsubscribe()
      root.remove()
    },
  }
}
