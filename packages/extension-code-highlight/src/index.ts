import type { DecorationSource, Editor, EditorNode, InlineDecoration } from '@trevixal/core'
import type { Highlighter } from './types'

export { type CopyCodeButtonOptions, copyToClipboard, createCopyCodeButtons } from './copy-button'
export {
  detectLanguage,
  type DetectLanguageOptions,
  detectableLanguages,
  type LanguageGuess,
} from './detect'
export { createHighlighter, type CreateHighlighterOptions, tokenize } from './highlighter'
export {
  BUNDLED_LANGUAGES,
  findLanguage,
  languageDisplayName,
  type LanguageDefinition,
  type LanguageRule,
} from './languages'
export type { Highlighter, HighlightToken } from './types'

export interface CodeHighlightOptions {
  /** Node type to highlight; `"codeBlock"` by default. */
  readonly nodeName?: string
  /**
   * Whether the browser spell-checks code blocks. Off by default: identifiers
   * are not prose, and the squiggles read as errors in the code.
   */
  readonly spellcheck?: boolean
}

/**
 * Render syntax highlighting for code blocks as decorations. The document
 * itself stays plain text. Tokens are computed lazily per block and cached
 * by node identity, so typing in one block never re-tokenizes the others.
 * Returns a disposer.
 */
export function codeHighlight(
  editor: Editor,
  highlighter: Highlighter,
  options: CodeHighlightOptions = {},
): () => void {
  const nodeName = options.nodeName ?? 'codeBlock'
  const cache = new WeakMap<EditorNode, readonly InlineDecoration[]>()

  const source: DecorationSource = (node) => {
    if (node.type.name !== nodeName) return null
    let tokens = cache.get(node)
    if (!tokens) {
      const language = typeof node.attrs.language === 'string' ? node.attrs.language : null
      tokens = highlighter
        .highlight(node.textContent, language)
        .filter((token) => token.to > token.from)
        .map((token) => ({ from: token.from, to: token.to, className: token.className }))
      cache.set(node, tokens)
    }
    return tokens.length > 0 ? tokens : null
  }

  let detach: (() => void) | null = null
  const attach = (): void => {
    if (detach || !editor.view) return
    const view = editor.view
    view.setDecorationLayer('code-highlight', source)
    detach = () => view.setDecorationLayer('code-highlight', null)
  }

  // The tag the renderer gives this node type, read from its own `toHTML`, so
  // this stays right for a custom `nodeName`.
  const selector = ((): string => {
    const type = editor.state.schema.nodes[nodeName]
    return type?.spec.toHTML?.(type.create())?.tag ?? 'pre'
  })()
  // A DOM attribute rather than a rendered one, so it never reaches the
  // serialized document; re-applied after every change because the renderer
  // may rebuild a block from scratch.
  const quieten = (): void => {
    if (options.spellcheck === true || !editor.view) return
    for (const block of editor.view.dom.querySelectorAll<HTMLElement>(selector)) {
      if (block.getAttribute('spellcheck') !== 'false') block.setAttribute('spellcheck', 'false')
    }
  }

  const refresh = (): void => {
    attach() // views can mount late
    quieten()
  }
  refresh()
  const unsubscribe = editor.on('transaction', refresh)
  return () => {
    unsubscribe()
    detach?.()
  }
}
