// model
export { type Attrs, attrsEq } from './model/attrs'
export { Mark, type MarkJSON, marksEq, noMarks } from './model/mark'
export { Fragment } from './model/fragment'
export { EditorNode, EditorNode as Node, TextNode, type NodeJSON } from './model/node'
export {
  type HTMLSpec,
  type MarkSpec,
  MarkType,
  type NodeSpec,
  NodeType,
  type ParseRule,
  Schema,
  schema,
  type SchemaSpec,
} from './model/schema'
export { matchesContent, parseContentExpr, type ContentTerm } from './model/content'
export {
  clampPosition,
  comparePositions,
  maxPosition,
  minPosition,
  pos,
  type Position,
  positionsEqual,
  type ResolvedPosition,
  resolvePosition,
} from './model/position'
export {
  lastIndexOfPath,
  nodeAtPath,
  parentPathOf,
  type Path,
  pathStartsWith,
  pathsEqual,
  updateAtPath,
} from './model/tree'
export {
  applyInlineMark,
  coerceInlineFor,
  inlineLength,
  inlineOffsetFromText,
  inlineSize,
  marksAtInlineOffset,
  mergeInline,
  rangeHasMark,
  rangesWithMark,
  replaceInline,
  sliceInline,
} from './model/inline'
export { blocksInRange, type BlockRange, firstTextblockPath, textblocks } from './model/blocks'
export { type DocJSON, markFromJSON, nodeFromJSON } from './model/json'
export { normalizeDoc } from './model/normalize'

// state
export {
  type Bias,
  type PositionMapper,
  Step,
  type StepResult,
  stepFail,
  stepOk,
} from './state/step'
export { ReplaceInlineStep } from './state/steps/replace-inline'
export { ReplaceNodesStep, replaceNodeAt } from './state/steps/replace-nodes'
export { AddMarkStep, RemoveMarkStep } from './state/steps/mark-steps'
export { SetNodeAttrsStep } from './state/steps/attrs-step'
export { JoinNodesStep, SplitNodeStep } from './state/steps/split-join'
export { MoveNodeStep, moveNodeTo } from './state/steps/move-node'
export { LiftNodesStep, WrapNodesStep } from './state/steps/wrap-lift'
export { Transaction } from './state/transaction'
export { EditorState, type EditorStateConfig, validateSelection } from './state/editor-state'
export {
  AllSelection,
  NodeSelection,
  Selection,
  type SelectionJSON,
  selectionNear,
  TextSelection,
} from './state/selection'

// commands
export {
  type CaseMode,
  clearAllFormatting,
  clearBlockFormatting,
  clearFormatting,
  type Command,
  convertCase,
  deleteBackwardInPreformatted,
  deleteCharBackward,
  deleteCharForward,
  deleteSelection,
  escapeWrapperOnEnter,
  exitEnclosingBlock,
  exitPreformatted,
  insertBlockAfter,
  insertInlineNode,
  insertNewlineInPreformatted,
  insertText,
  isMarkActive,
  indentBlocks,
  joinBackward,
  joinForward,
  lift,
  selectAll,
  setBlockAttrs,
  setBlockType,
  setLetterSpacing,
  setLineHeight,
  setMark,
  setParagraphSpacing,
  setTextAlign,
  splitBlock,
  indentInPreformatted,
  outdentInPreformatted,
  splitBlockInPreformatted,
  toggleMark,
  toggleSmallCaps,
  typeInPreformatted,
  unsetMark,
  wrapIn,
} from './commands/commands'
export { chainCommands, insertContent } from './commands/commands'
export {
  continueNumbering,
  continueNumberingFromPrevious,
  isListItemTypeName,
  liftListItem,
  listNumberingAt,
  restartNumbering,
  setListNumbering,
  setListStyle,
  setTaskChecked,
  sinkListItem,
  splitListItem,
  toggleList,
  toggleTaskChecked,
  toggleTaskList,
  unwrapList,
} from './commands/lists'
export {
  type InsertEmailLinkOptions,
  insertEmailLink,
  isEmailAddress,
  type LinkUpdate,
  linkifyText,
  removeLink,
  setLinkTarget,
  updateLink,
} from './commands/links'
export { deleteRange } from './commands/helpers'

// input rules
export {
  applyInputRules,
  type DefaultInputRuleOptions,
  defaultInputRules,
  type InputRule,
  type InputRuleContext,
} from './input-rules/input-rules'

// search & counts
export {
  findMatches,
  replaceAll,
  replaceMatch,
  type SearchMatch,
  type SearchOptions,
} from './search/find-replace'
export { characterCount, paragraphCount, sentenceCount, wordCount } from './model/counts'

// history
export {
  ADD_TO_HISTORY,
  HISTORY_LABEL,
  History,
  type HistoryEntry,
  type HistoryOptions,
  NEW_HISTORY_GROUP,
} from './history/history'

// serialize
export {
  escapeHTML,
  type HTMLSerializeOptions,
  serializeToHTML,
  serializeToText,
} from './serialize/html'
export {
  type HTMLDocumentOptions,
  type HTMLDocumentTheme,
  serializeToHTMLDocument,
} from './serialize/html-document'
export {
  escapeMarkdown,
  type MarkdownSerializeOptions,
  serializeToMarkdown,
} from './serialize/markdown'
export { parseHTML } from './serialize/parse-html'
export {
  cleanPastedHTML,
  detectPasteSource,
  type PasteSource,
} from './serialize/paste-source'
export { type MarkdownParseOptions, parseMarkdown } from './serialize/parse-markdown'

// schema presets
export {
  blockLayoutAttrs,
  blockLayoutHTML,
  BULLET_LIST_STYLES,
  defaultMarks,
  defaultNodes,
  LIST_STYLES,
  listStylesFor,
  MAX_INDENT,
  ORDERED_LIST_STYLES,
  parseBlockLayout,
  safeCSSValue,
  safeColor,
  safeElementId,
  safeFontFamily,
  safeHref,
  safeImageSrc,
  safeLanguageName,
  safeLength,
  safeLineHeight,
} from './schema/basic'
export {
  DEFAULT_LIST_NUMBERING,
  formatListCounter,
  LIST_NUMBERING_SCHEMES,
  type ListCounterStyle,
  type ListNumberingScheme,
  levelMarker,
  listMarker,
  listNumberingOf,
  listNumberingScheme,
  storedNumbering,
  storedNumberingsFor,
} from './schema/list-numbering'

// view
export { EditorView, type EditorViewOptions, type NodeViewFactory } from './view/editor-view'
export {
  type DecorationSource,
  DOMRenderer,
  type InlineDecoration,
  type NodeViewConstructor,
  type NodeViewInstance,
} from './view/renderer'
export {
  type DOMPoint,
  domPointFromPosition,
  pathOfElement,
  positionFromDOMPoint,
} from './view/dom-point'
export {
  baseKeymap,
  type KeyBinding,
  keydownHandler,
  mergeKeymaps,
  type Keymap,
  normalizeKeyName,
} from './view/keymap'

// suggestions (trigger detection shared by slash / emoji)
export {
  findTrigger,
  suggestion,
  type SuggestionListHandle,
  type SuggestionListOptions,
  type SuggestionListState,
  suggestionList,
  type SuggestionOptions,
  type TriggerMatch,
  type TriggerOptions,
} from './suggest/suggest'

// accessibility
export {
  type AnnouncePriority,
  type Announcer,
  type AnnouncerOptions,
  createAnnouncer,
  describeDocChange,
} from './a11y/announce'

// format painter
export {
  type CopiedFormat,
  describeFormat,
  FormatPainter,
  type FormatPainterOptions,
  type FormatPainterState,
  formatFromSnapshot,
} from './editor/format-painter'

// chrome helpers
export { editorDocument } from './view/editor-document'

// shared errors
export { UnsupportedEnvironmentError, UploadError } from './errors'

// editor facade
export {
  Chain,
  createEditor,
  type DispatchTransform,
  Editor,
  type EditorChange,
  EditorCommands,
  type EditorEvent,
  type EditorOptions,
  type EditorSnapshot,
  type SetContentOptions,
  type TransactionEvent,
} from './editor/editor'
