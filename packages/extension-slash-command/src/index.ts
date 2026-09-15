import {
  type Editor,
  Fragment,
  ReplaceInlineStep,
  type SuggestionListHandle,
  type SuggestionListState,
  TextSelection,
  type TriggerMatch,
  pos,
  suggestionList,
} from '@trevixal/core'

export interface SlashCommandItem {
  readonly id: string
  readonly title: string
  /** Extra terms the fuzzy filter matches against. */
  readonly keywords?: readonly string[]
  readonly run: (editor: Editor) => void
}

/** Menu entries for the built-in block types. Extend or replace freely. */
export function defaultSlashCommands(): SlashCommandItem[] {
  return [
    {
      id: 'paragraph',
      title: 'Text',
      keywords: ['paragraph', 'plain'],
      run: (e) => e.commands.setParagraph(),
    },
    {
      id: 'heading1',
      title: 'Heading 1',
      keywords: ['h1', 'title'],
      run: (e) => e.commands.setHeading(1),
    },
    { id: 'heading2', title: 'Heading 2', keywords: ['h2'], run: (e) => e.commands.setHeading(2) },
    { id: 'heading3', title: 'Heading 3', keywords: ['h3'], run: (e) => e.commands.setHeading(3) },
    {
      id: 'bulletList',
      title: 'Bullet list',
      keywords: ['ul', 'unordered'],
      run: (e) => e.commands.toggleBulletList(),
    },
    {
      id: 'orderedList',
      title: 'Numbered list',
      keywords: ['ol', 'ordered'],
      run: (e) => e.commands.toggleOrderedList(),
    },
    {
      id: 'codeBlock',
      title: 'Code block',
      keywords: ['pre', 'code'],
      run: (e) => e.commands.setCodeBlock(),
    },
    {
      id: 'blockquote',
      title: 'Quote',
      keywords: ['quote', 'cite'],
      run: (e) => e.commands.wrapIn('blockquote'),
    },
    {
      id: 'horizontalRule',
      title: 'Divider',
      keywords: ['hr', 'rule', 'line'],
      run: (e) => e.commands.insertHorizontalRule(),
    },
  ]
}

/**
 * Case-insensitive subsequence filter: prefix matches rank first, then
 * word-boundary matches, then any subsequence. Empty queries keep the order.
 */
export function fuzzyFilter(items: readonly SlashCommandItem[], query: string): SlashCommandItem[] {
  const needle = query.toLowerCase()
  if (!needle) return [...items]
  const scored: { item: SlashCommandItem; score: number }[] = []
  for (const item of items) {
    const haystacks = [item.title, ...(item.keywords ?? [])].map((term) => term.toLowerCase())
    let best = Number.POSITIVE_INFINITY
    for (const haystack of haystacks) {
      if (haystack.startsWith(needle)) best = Math.min(best, 0)
      else if (haystack.includes(needle)) best = Math.min(best, 1)
      else if (isSubsequence(needle, haystack)) best = Math.min(best, 2)
    }
    if (best < Number.POSITIVE_INFINITY) scored.push({ item, score: best })
  }
  return scored.sort((a, b) => a.score - b.score).map((entry) => entry.item)
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0
  for (const char of haystack) {
    if (char === needle[i]) i++
    if (i === needle.length) return true
  }
  return needle.length === 0
}

export type SlashCommandState = SuggestionListState<SlashCommandItem>

export interface SlashCommandOptions {
  /** Menu items; defaults to {@link defaultSlashCommands}. */
  readonly items?: readonly SlashCommandItem[]
  /** Render hook for the menu: state while open, null when closed. */
  readonly onState: (state: SlashCommandState | null) => void
}

/** Remove the trigger text, then run the chosen command. */
export function runSlashCommand(editor: Editor, item: SlashCommandItem, match: TriggerMatch): void {
  const tr = editor.state.tr.step(
    new ReplaceInlineStep(match.path, match.from, match.to, Fragment.empty),
  )
  tr.setSelection(new TextSelection(pos(match.path, match.from)))
  editor.dispatch(tr)
  item.run(editor)
}

/**
 * Wire a keyboard-first `/` menu onto the editor. The trigger only fires at
 * the start of a block. Returns a handle with `select(index)` and `dispose`.
 */
/**
 * `suggestionList` reports a pick as two closes: once when the popup clears
 * and again when the resulting edit leaves the trigger range. Collapse the
 * repeat so a renderer sees one open/close pair.
 */
function closeOnce<T>(onState: (state: T | null) => void): (state: T | null) => void {
  let closed = true
  return (state) => {
    if (state === null && closed) return
    closed = state === null
    onState(state)
  }
}

export function slashCommand(editor: Editor, options: SlashCommandOptions): SuggestionListHandle {
  const items = options.items ?? defaultSlashCommands()
  return suggestionList<SlashCommandItem>(editor, {
    char: '/',
    startOfBlock: true,
    items: (query) => fuzzyFilter(items, query),
    onState: closeOnce(options.onState),
    onSelect: (item, match) => runSlashCommand(editor, item, match),
  })
}
