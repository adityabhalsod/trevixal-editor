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
`restartNumbering`, `continueNumbering`, `continueNumberingFromPrevious`,
`splitListItem`, `sinkListItem`, `liftListItem`, `setCodeBlock`, `lift`,
`selectAll`, `undo`, `redo`. Each returns `boolean`.

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
`toggleTaskList`, `toggleTaskChecked`, `setListStyle`, `restartNumbering`,
`continueNumbering`, `setTextAlign`, `indentBlocks`, `convertCase`,
`toggleSmallCaps`, `setLetterSpacing`, `setLineHeight`,
`setParagraphSpacing`, `clearFormatting`, `clearAllFormatting`, `selectAll`,
the code-block set (`typeInPreformatted`, `insertNewlineInPreformatted`,
`splitBlockInPreformatted`, `deleteBackwardInPreformatted`,
`indentInPreformatted`, `outdentInPreformatted`, `exitPreformatted`), links
(`linkifyText`, `insertEmailLink`, `isEmailAddress`, `removeLink`,
`setLinkTarget`), plus `chainCommands` to try several in order.

## Input rules, search, counts, history, suggestions, format painter

- `defaultInputRules({ autolink?, inlineCode?, emDash? })`, `applyInputRules`, `InputRule`
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
`blockLayoutHTML`, `parseBlockLayout`, `MAX_INDENT`).

`defaultMarks()`: `bold`, `italic`, `underline`, `strikethrough`, `code`,
`link`, `highlight`, `subscript`, `superscript`, `fontFamily`, `fontSize`,
`textColor`, `backgroundColor`, `smallCaps`, `letterSpacing`.

`LIST_STYLES`, `BULLET_LIST_STYLES`, `ORDERED_LIST_STYLES`, `listStylesFor`.

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
