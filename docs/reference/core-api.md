# Core API

Everything below is exported from `@trevixal/core`. The generated
[API reference](/api/index.html) has every signature; this page is the map.

## The editor facade

```ts
createEditor(options: EditorOptions): Editor
```

| `EditorOptions` | |
| --- | --- |
| `schema` | Required: `new Schema({ nodes, marks })` |
| `content` / `doc` | Initial content as `DocJSON` or an `EditorNode` |
| `element` | Mount point; omit for a headless editor |
| `autofocus`, `placeholder`, `editable`, `spellcheck`, `maxLength` | Surface behaviour |
| `keymap` | Extra bindings that win over `baseKeymap()` |
| `inputRules` | Replaces `defaultInputRules()` |
| `nodeViews` | `{ [nodeName]: NodeViewFactory }`: framework components inside the document |
| `onChange({ editor, json, html })` | After every document change |
| `history` | `{ groupDelay?, depth? }` |

| `Editor` | |
| --- | --- |
| `state`, `schema`, `view`, `commands`, `isDestroyed`, `isEditable` | |
| `exec(command)`, `dispatch(tr)`, `chain()` | Run a `Command`, apply a `Transaction`, or build one fluently |
| `onTransaction(listener)`, `addDispatchTransform(fn)`, `on('transaction' \| 'update' \| 'selectionUpdate', fn)`, `subscribe(fn)` | Events; each returns an unsubscribe |
| `getSnapshot()` | Reference-stable `EditorSnapshot` (`activeMarks`, `markAttrs`, `blockType`, `blockAttrs`, `listType`, `align`, `indent`, `canUndo`, `canRedo`, `selectionEmpty`), the `useSyncExternalStore` contract |
| `undo()`, `redo()`, `canUndo`, `canRedo`, `historyEntries()`, `clearHistory()` | |
| `setContent(json \| node, { addToHistory? })`, `getJSON()`, `getHTML()`, `getText()` | |
| `getCharacterCount()`, `getWordCount()`, `getSentenceCount()`, `getParagraphCount()` | |
| `setEditable(bool)`, `setSpellcheck(bool)`, `isActive(markName)`, `destroy()` | |

**`editor.commands`**: `insertText`, `deleteSelection`, `toggleMark`,
`setMark`, `unsetMark`, `setFontFamily`, `setFontSize`, `setTextColor`,
`setBackgroundColor`, `setLink`, `unsetLink`, `clearFormatting`,
`clearBlockFormatting`, `clearAllFormatting`, `setTextAlign`,
`setLineHeight`, `setParagraphSpacing`, `setLetterSpacing`,
`toggleSmallCaps`, `convertCase`, `indent`, `outdent`, `setBlockAttrs`,
`setBlockType`, `setParagraph`, `setHeading`, `splitBlock`, `joinBackward`,
`insertHardBreak`, `insertHorizontalRule`, `wrapIn`, `toggleBulletList`,
`toggleOrderedList`, `toggleTaskList`, `toggleTaskChecked`, `setListStyle`,
`setListNumbering`, `unwrapList`, `restartNumbering`, `continueNumbering`,
`continueNumberingFromPrevious`,
`splitListItem`, `sinkListItem`, `liftListItem`, `setCodeBlock`, `lift`,
`setHeadingNumbering`, `setDocumentDirection`, `setLineNumbers`,
`setTextDirection`, `setHyphenation`, `setWidowControl`, `setColumns`,
`setColumnRule`, `setParagraphBorder`, `setParagraphShading`, `setDropCap`,
`setTabStops`, `setParagraphStyle`, `toggleCharacterStyle`, `setStyle`,
`deleteStyle`, `selectAll`, `undo`, `redo`. Each returns `boolean`.

**`editor.chain()`**: `focus()`, `command(cmd)`, `insertText()`,
`toggleMark()`, `setBlockType()`, `setHeading()`, `setParagraph()`, then
`run()`.

## Model

`EditorNode` (alias `Node`), `TextNode`, `Fragment`, `Mark`, `Schema`,
`NodeType`, `MarkType`, `NodeSpec`, `MarkSpec`, `HTMLSpec`, `ParseRule`,
`Attrs`.

Positions are `{ path: number[], offset }` ([ADR-0001](../adr/0001-path-offset-positions)):
`pos`, `resolvePosition`, `comparePositions`, `clampPosition`, `nodeAtPath`,
`updateAtPath`, `parentPathOf`. Inline helpers: `inlineLength`,
`sliceInline`, `replaceInline`, `applyInlineMark`, `marksAtInlineOffset`,
`rangeHasMark`. Content expressions: `parseContentExpr`, `matchesContent`
([ADR-0002](../adr/0002-greedy-content-expressions)). `normalizeDoc` repairs
an invalid tree deterministically. `nodeFromJSON`, `markFromJSON`, `DocJSON`.

## State, steps and selections

`EditorState`, `Transaction`, `validateSelection`. Nine step classes, each
self-invertible and carrying its own position mapper
([ADR-0003](../adr/0003-primitive-steps-over-monolithic-replace)):
`ReplaceInlineStep`, `ReplaceNodesStep`, `AddMarkStep`, `RemoveMarkStep`,
`SetNodeAttrsStep`, `SplitNodeStep`, `JoinNodesStep`, `WrapNodesStep`,
`LiftNodesStep`. Selections: `TextSelection`, `NodeSelection`,
`AllSelection`, `selectionNear`. Transaction meta keys: `ADD_TO_HISTORY`
(`false` keeps a transaction out of history), `NEW_HISTORY_GROUP`,
`HISTORY_LABEL`.

## Commands as functions

A `Command` is `(state) => Transaction | null`. All of `editor.commands` are
exported as plain functions too: `toggleMark`, `setBlockType`, `wrapIn`,
`lift`, `splitBlock`, `joinBackward`, `joinForward`, `deleteSelection`,
`insertText`, `insertContent`, `insertBlockAfter`, `insertInlineNode`,
`toggleList`, `splitListItem`, `sinkListItem`, `liftListItem`,
`toggleTaskList`, `toggleTaskChecked`, `setListStyle`, `setListNumbering`,
`unwrapList`, `listNumberingAt`, `restartNumbering`, `continueNumbering`,
`setTextAlign`, `indentBlocks`, `convertCase`,
`toggleSmallCaps`, `setLetterSpacing`, `setLineHeight`,
`setParagraphSpacing`, `clearFormatting`, `clearAllFormatting`, `selectAll`,
the code-block set (`typeInPreformatted`, `insertNewlineInPreformatted`,
`splitBlockInPreformatted`, `deleteBackwardInPreformatted`,
`indentInPreformatted`, `outdentInPreformatted`, `exitPreformatted`), links
(`linkifyText`, `insertEmailLink`, `isEmailAddress`, `removeLink`,
`setLinkTarget`), the formatting tools (`setParagraphBorder`,
`setParagraphShading`, `setDropCap`, `setTabStops`, `insertTabAtStop`,
`setHyphenation`, `setWidowControl`, `setColumns`, `setColumnRule`), named
styles (`setParagraphStyle`, `toggleCharacterStyle`, `setStyle`,
`deleteStyle`, `newStyleId`, `paragraphStyleOf`, `characterStyleAt`), plus
`chainCommands` to try several in order.

## Input rules, search, counts, history, suggestions, format painter

- `defaultInputRules({ autolink?, inlineCode?, emDash? })`, `applyInputRules`, `InputRule`
- Word's AutoFormat and AutoCorrect as you type, which a host adds to `inputRules` beside the defaults: `smartTypographyRules({ enabled? })` (curly quotes and apostrophes, the en dash, the ellipsis, ½ ¼ ¾, arrows, © ® ™) and `autocorrectRule({ words?, enabled?, curlyQuotes? })` with `AUTOCORRECT_WORDS`. Each option is a function read on every keystroke, so a setting can switch them at once. They are `after` rules (`InputRule.after`): the character goes in first and the change follows as an undo step of its own (`applyTypedTextRules`), so `Ctrl+Z` straight after gives back what was typed. Code is left alone.
- `findMatches(doc, query, { caseSensitive? })`, `replaceMatch`, `replaceAll`; regular-expression search is layered on top by the UI kit's `compileSearch` and `createFindReplace`
- `wordCount`, `characterCount`, `sentenceCount`, `paragraphCount`
- `History`, `HistoryEntry`, `HistoryOptions`
- `findTrigger`, `suggestion`, `suggestionList`: the driver behind slash and emoji, reusable for `@`-style triggers
- `FormatPainter` (`copy`, `copyAndLock`, `apply`, `cancel`, `state`), `formatFromSnapshot`, `describeFormat`

## Serializers and sanitizers

`serializeToHTML(node, { renderNode? })`, `serializeToHTMLDocument(doc, {
title, styleSheets, scripts, baseURL, inlineCSS, inlineJS, lang, theme,
renderNode })`, `serializeToText`, `serializeToMarkdown`, `parseHTML(schema,
html)`, `parseMarkdown`, `escapeHTML`, `escapeMarkdown`.

Value sanitizers every schema uses: `safeHref`, `safeImageSrc`, `safeColor`,
`safeLength`, `safeLineHeight`, `safeCSSValue`, `safeElementId`,
`safeFontFamily`, `safeLanguageName`. `parseHTML` runs inside an inert
`<template>` through allowlisted `parseHTML` rules; a rule returning `false`
drops the element **and its subtree**, and dangerous tags are dropped unless a
schema claims them.

## Schema preset

`defaultNodes()`: `doc`, `paragraph`, `heading`, `blockquote`, `codeBlock`,
`horizontalRule`, `hardBreak`, `bulletList`, `orderedList`, `listItem`,
`taskList`, `taskItem`, `text`. Block nodes carry `align`, `indent`,
`lineHeight`, `spaceBefore`, `spaceAfter` (`blockLayoutAttrs`,
`blockLayoutHTML`, `parseBlockLayout`, `MAX_INDENT`), and the paragraph
format: `borderSides`, `borderStyle`, `borderWidth`, `borderColor`,
`shading`, `dropCap`, `dropCapLines` and `tabStops`, read through
`paragraphBorderOf`, `paragraphShadingOf`, `dropCapOf` and `tabStopsOf`
(`BORDER_SIDES`, `BORDER_STYLES`, `MAX_BORDER_WIDTH`, `DROP_CAP_LINES`,
`TAB_ALIGNMENTS`, `TAB_LEADERS`, `DEFAULT_TAB_INTERVAL`). Tab stops are
stored as `72 left, 216 right dot`, positions in points
(`parseTabStops`, `formatTabStops`); a tab is the `\t` character. A
border and a fill are written as inline style, a drop cap and tab stops as
`data-drop-cap`, `data-drop-cap-lines` and `data-tab-stops`, and all of them
read back. A paragraph also takes `paragraphStyle`, its named style.

`defaultMarks()`: `bold`, `italic`, `underline`, `strikethrough`, `code`,
`link`, `highlight`, `subscript`, `superscript`, `fontFamily`, `fontSize`,
`textColor`, `backgroundColor`, `smallCaps`, `letterSpacing`, `charStyle`
(text in a named character style, written as `data-char-style`).

`LIST_STYLES`, `BULLET_LIST_STYLES`, `ORDERED_LIST_STYLES`, `listStylesFor`.

Multilevel list numbering: `LIST_NUMBERING_SCHEMES` (`default` 1. a. i.,
`parenthesis` 1) a) i), `outline` 1. 1.1. 1.1.1., `roman-outline` I. A. 1.,
`symbols` ❖ ➢ ▪), `DEFAULT_LIST_NUMBERING`, `listNumberingScheme`,
`listNumberingOf`, `storedNumbering`, `storedNumberingsFor`, `levelMarker`,
`listMarker`, `formatListCounter`. A scheme is stored once, in the outermost
list's `numbering` attr (written as `data-numbering`), and every list nested
under it takes the marker for its depth, so an item indented later follows it
with nothing written to the new list. The Word and RTF writers and the
toolbar gallery all read this one table.

Document settings: the doc node's attributes, `headingNumbering` (a numbered
scheme's id), `direction` (`'rtl'`), `lineNumbers`, `hyphenation`,
`widowControl` (on unless `false`), `columns` (1 to `MAX_COLUMNS`, through
`columnCount`), `columnRule` and `styles`, from `documentAttrs()`.
They are set with `setHeadingNumbering(id | null)`, `setDocumentDirection`,
`setLineNumbers` or `setDocumentAttrs`, each one undoable step, and the
snapshot carries them as `documentAttrs`. In HTML a document with any of them
set is wrapped in one `<div data-trevixal-document …>` carrying them
(`documentSettingsAttrs`, `parseDocumentSettings`); a document with none is
written as it always was. The view puts the same attributes on the editing
surface, so one stylesheet draws both.

Heading numbering: `HEADING_NUMBERING_SCHEMES` (the numbered list schemes,
outline first), `headingNumberingScheme`, `headingNumberingOf`, and
`headingNumbers(doc)`, every top-level heading's number as the stylesheet's
counters draw it (`1.0.1.` for a skipped level).

Named styles: `styles` holds, as JSON, only what differs from
`BUILT_IN_STYLES` (Normal, Title, Subtitle, Heading 1 to 6, Emphasis, Strong,
Subtle emphasis): a built-in style's changed props, and the writer's own
styles whole. `documentStyles(doc)` and `documentStyle(doc, id)` read them
with the built-in ones; `parseStoredStyles`, `storedStylesAttr`,
`sanitizeStyleProps`, `styleDeclarations`, `safeStyleId` and
`headingLevelOfStyle` are the pieces. `namedStylesCSS(doc, scope)` draws them
as one stylesheet under `scope`: Normal's font, size, colour and line height
on the scope itself, so every style is based on them, as in Word.
`serializeToHTMLDocument` adds it to a saved page.

Direction: paragraphs and headings take a `dir` attr (`'ltr'`, `'rtl'`, or
null to follow the document), written as `dir`; `setTextDirection(dir)` sets
it on the selected blocks. An indent is written as `margin-inline-start`, so
it comes from the right in right-to-left text; `margin-left` still imports.
Paragraphs take an `id` too, as headings do, and a split keeps it on the
first half only.

## View

`EditorView`, `EditorViewOptions`, `DOMRenderer`, `DecorationSource`,
`InlineDecoration`, `NodeViewFactory`, `NodeViewConstructor`.
`view.setDecorationLayer(key, source)`: each extension owns a key so layers
compose. `view.renderer.modelOf` maps a rendered element back to its node.
`domPointFromPosition`, `positionFromDOMPoint`, `pathOfElement`.
`baseKeymap()`, `keydownHandler`, `normalizeKeyName`; `Mod` is Cmd on macOS
and Ctrl elsewhere. `editorDocument(editor, caller)` returns the document the
view lives in, or throws when there is no view.

## Errors

`UploadError` (shared by the image and embed extensions, so one `instanceof`
catches both), `UnsupportedEnvironmentError` (a browser API the feature
needs is absent: WebCrypto on an insecure origin, `DecompressionStream` on an
older engine, a canvas on a server).
