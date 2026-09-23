import type { Editor, EditorSnapshot } from '@trevixal/core'
import { NO_LIST_NUMBERING, defaultListNumberings } from './controls'
import { type Dropdown, bindListNavigation, createDropdown, focusFirstItem } from './dropdown'
import { MENU_KEY, type Messages, type Translator, createTranslator } from './i18n'
import { type IconName, createIcon } from './icons'
import type { ShortcutLabels } from './shortcuts'

/** One entry in a menu. A `separator` draws a rule and takes no action. */
export interface MenuItem {
  readonly name: string
  readonly label: string
  readonly icon?: IconName
  /**
   * Shown right-aligned, e.g. `"Ctrl+B"`. Display only, bind keys in the
   * keymap, or pass `shortcutLabels` so the shortcut manager decides what is
   * printed and this default is ignored.
   */
  readonly shortcut?: string
  readonly run?: (editor: Editor) => void
  readonly isActive?: (snapshot: EditorSnapshot) => boolean
  readonly isEnabled?: (snapshot: EditorSnapshot) => boolean
  readonly separator?: boolean
  /** Nested submenu, rendered as a flyout. */
  readonly items?: readonly MenuItem[]
}

export interface Menu {
  readonly name: string
  readonly label: string
  readonly items: readonly MenuItem[]
}

export interface MenubarOptions {
  readonly menus?: readonly Menu[]
  readonly ariaLabel?: string
  /**
   * Printed shortcuts by item name, from `createShortcutManager().labels()`.
   * When given it is the single source of truth: an item's own `shortcut` is
   * ignored, and an item absent from the map prints nothing, so a label can
   * never advertise a key that some other binding actually owns.
   */
  readonly shortcutLabels?: ShortcutLabels
  /**
   * Translations, keyed `menu.<item name>`. Anything missing keeps its
   * English; see {@link defaultMessages} for the full list of keys.
   */
  readonly messages?: Messages
}

export interface Menubar {
  readonly element: HTMLElement
  /** Re-print every shortcut; call it when the manager reports a rebind. */
  setShortcutLabels(labels: ShortcutLabels | undefined): void
  destroy(): void
}

const separator = (name: string): MenuItem => ({ name, label: '', separator: true })

/**
 * The stock menu set. Pass your own `menus` to add, remove or reorder.
 * Nothing here is special-cased by {@link createMenubar}.
 */
export function defaultMenus(): readonly Menu[] {
  return [
    {
      name: 'file',
      label: 'File',
      items: [
        { name: 'newDocument', label: 'New document', icon: 'fileNew', shortcut: 'Ctrl+Alt+N' },
        { name: 'openDocument', label: 'Open…', icon: 'folderOpen', shortcut: 'Ctrl+O' },
        { name: 'saveDocument', label: 'Save', icon: 'save', shortcut: 'Ctrl+S' },
        separator('file-sep-export'),
        {
          name: 'downloadAs',
          label: 'Download as',
          icon: 'download',
          items: [
            { name: 'downloadHtml', label: 'Web page (.html)', icon: 'htmlMode' },
            { name: 'downloadMarkdown', label: 'Markdown (.md)', icon: 'markdownMode' },
            { name: 'downloadText', label: 'Plain text (.txt)', icon: 'langPlain' },
            { name: 'downloadJson', label: 'Trevixal JSON (.json)', icon: 'formatJson' },
            { name: 'downloadDocx', label: 'Word document (.docx)', icon: 'fileWord' },
            { name: 'downloadRtf', label: 'Rich text (.rtf)', icon: 'fileRich' },
            { name: 'downloadPdf', label: 'PDF (via print)', icon: 'print' },
            { name: 'downloadEncrypted', label: 'Encrypted document (.tvx)', icon: 'key' },
          ],
        },
        { name: 'exportSelection', label: 'Download selection…', icon: 'copy' },
        { name: 'importDocument', label: 'Import a file…', icon: 'csvImport' },
        separator('file-sep-history'),
        { name: 'documentBackups', label: 'Local backups…', icon: 'undo' },
        separator('file-sep-security'),
        { name: 'protectDocument', label: 'Protect with password…', icon: 'lock' },
        { name: 'documentRestrictions', label: 'Restrictions…', icon: 'shield' },
        separator('file-sep-print'),
        { name: 'printPreview', label: 'Print preview…', icon: 'print' },
        {
          name: 'print',
          label: 'Print…',
          icon: 'print',
          shortcut: 'Ctrl+P',
          run: (editor) => editor.view?.dom.ownerDocument.defaultView?.print(),
        },
      ],
    },
    {
      name: 'edit',
      label: 'Edit',
      items: [
        {
          name: 'undo',
          label: 'Undo',
          icon: 'undo',
          shortcut: 'Ctrl+Z',
          run: (editor) => editor.commands.undo(),
          isEnabled: (snapshot) => snapshot.canUndo,
        },
        {
          name: 'redo',
          label: 'Redo',
          icon: 'redo',
          shortcut: 'Ctrl+Y',
          run: (editor) => editor.commands.redo(),
          isEnabled: (snapshot) => snapshot.canRedo,
        },
        separator('edit-sep-1'),
        separator('edit-sep-cut'),
        { name: 'cut', label: 'Cut', icon: 'cut', shortcut: 'Ctrl+X' },
        { name: 'copy', label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C' },
        { name: 'paste', label: 'Paste', icon: 'paste', shortcut: 'Ctrl+V' },
        { name: 'pastePlain', label: 'Paste without formatting', icon: 'paste' },
        separator('edit-sep-case'),
        {
          name: 'changeCase',
          label: 'Change case',
          icon: 'caseTitle',
          items: [
            {
              name: 'caseUpper',
              label: 'UPPERCASE',
              icon: 'caseUpper',
              run: (editor) => editor.commands.convertCase('upper'),
              isEnabled: (snapshot) => !snapshot.selectionEmpty,
            },
            {
              name: 'caseLower',
              label: 'lowercase',
              icon: 'caseLower',
              run: (editor) => editor.commands.convertCase('lower'),
              isEnabled: (snapshot) => !snapshot.selectionEmpty,
            },
            {
              name: 'caseTitle',
              label: 'Title Case',
              icon: 'caseTitle',
              run: (editor) => editor.commands.convertCase('title'),
              isEnabled: (snapshot) => !snapshot.selectionEmpty,
            },
          ],
        },
        separator('edit-sep-find'),
        { name: 'findReplace', label: 'Find and replace…', icon: 'search', shortcut: 'Ctrl+F' },
        {
          name: 'selectAll',
          icon: 'selectAll',
          label: 'Select all',
          shortcut: 'Ctrl+A',
          run: (editor) => editor.commands.selectAll(),
        },
      ],
    },
    {
      name: 'insert',
      label: 'Insert',
      items: [
        { name: 'insertImage', label: 'Image…', icon: 'image' },
        { name: 'insertLink', label: 'Link…', icon: 'link', shortcut: 'Ctrl+K' },
        {
          name: 'removeLink',
          label: 'Remove link',
          icon: 'unlink',
          run: (editor) => editor.commands.unsetLink(),
          isEnabled: (snapshot) => snapshot.activeMarks.includes('link'),
        },
        {
          name: 'insertHorizontalRule',
          label: 'Horizontal rule',
          icon: 'horizontalRule',
          run: (editor) => editor.commands.insertHorizontalRule(),
        },
        {
          name: 'insertHardBreak',
          icon: 'lineBreak',
          label: 'Line break',
          shortcut: 'Shift+Enter',
          run: (editor) => editor.commands.insertHardBreak(),
        },
        { name: 'insertSpecialChar', label: 'Special character…', icon: 'specialChar' },
        { name: 'insertEmoji', label: 'Emoji…', icon: 'badge' },
        separator('insert-sep-media'),
        { name: 'insertVideo', label: 'Video…', icon: 'image' },
        { name: 'insertAudio', label: 'Audio…', icon: 'image' },
        { name: 'insertEmbed', label: 'Embed a link…', icon: 'link' },
        { name: 'insertLinkCard', label: 'Link preview card…', icon: 'linkNewTab' },
        { name: 'insertAttachment', label: 'File attachment…', icon: 'csvImport' },
        separator('insert-sep-science'),
        { name: 'insertMath', label: 'Equation…', icon: 'specialChar' },
        { name: 'insertMathBlock', label: 'Display equation…', icon: 'specialChar' },
        { name: 'insertDiagram', label: 'Diagram', icon: 'columns' },
        separator('insert-sep-blocks'),
        {
          name: 'insertCallout',
          label: 'Callout',
          icon: 'callout',
          items: [
            { name: 'calloutInfo', label: 'Info', icon: 'calloutInfo' },
            { name: 'calloutSuccess', label: 'Success', icon: 'calloutSuccess' },
            { name: 'calloutWarning', label: 'Warning', icon: 'calloutWarning' },
            { name: 'calloutDanger', label: 'Danger', icon: 'calloutDanger' },
            { name: 'calloutNote', label: 'Note', icon: 'calloutNote' },
          ],
        },
        { name: 'insertToggleBlock', label: 'Toggle block', icon: 'toggleBlock' },
        {
          name: 'insertColumns',
          label: 'Columns',
          icon: 'columns',
          items: [
            { name: 'columns2', label: '2 columns', icon: 'columns2' },
            { name: 'columns3', label: '3 columns', icon: 'columns3' },
            { name: 'columns4', label: '4 columns', icon: 'columns4' },
          ],
        },
        { name: 'insertCard', label: 'Card', icon: 'card' },
        { name: 'insertTimeline', label: 'Timeline', icon: 'timeline' },
        {
          name: 'insertTabs',
          label: 'Tabs',
          icon: 'toggleBlock',
          items: [
            { name: 'tabs2', label: '2 tabs', icon: 'columns2' },
            { name: 'tabs3', label: '3 tabs', icon: 'columns3' },
          ],
        },
        { name: 'insertAccordion', label: 'Accordion', icon: 'toggleBlock' },
        separator('insert-sep-inline'),
        { name: 'insertBadge', label: 'Badge…', icon: 'badge' },
        { name: 'insertButton', label: 'Button…', icon: 'buttonBlock' },
        { name: 'insertAnchor', label: 'Anchor…', icon: 'anchor' },
        { name: 'insertFootnote', label: 'Footnote', icon: 'footnote' },
        { name: 'insertCitation', label: 'Citation…', icon: 'footnote' },
        { name: 'insertReferenceList', label: 'References list', icon: 'footnote' },
        { name: 'renumberCitations', label: 'Renumber citations', icon: 'restartNumbering' },
        separator('insert-sep-break'),
        { name: 'insertPageBreak', label: 'Page break', icon: 'pageBreak' },
      ],
    },
    {
      name: 'format',
      label: 'Format',
      items: [
        {
          name: 'bold',
          label: 'Bold',
          icon: 'bold',
          shortcut: 'Ctrl+B',
          run: (editor) => editor.commands.toggleMark('bold'),
          isActive: (snapshot) => snapshot.activeMarks.includes('bold'),
        },
        {
          name: 'italic',
          label: 'Italic',
          icon: 'italic',
          shortcut: 'Ctrl+I',
          run: (editor) => editor.commands.toggleMark('italic'),
          isActive: (snapshot) => snapshot.activeMarks.includes('italic'),
        },
        {
          name: 'underline',
          label: 'Underline',
          icon: 'underline',
          shortcut: 'Ctrl+U',
          run: (editor) => editor.commands.toggleMark('underline'),
          isActive: (snapshot) => snapshot.activeMarks.includes('underline'),
        },
        {
          name: 'strikethrough',
          label: 'Strikethrough',
          icon: 'strikethrough',
          run: (editor) => editor.commands.toggleMark('strikethrough'),
          isActive: (snapshot) => snapshot.activeMarks.includes('strikethrough'),
        },
        separator('format-sep-1'),
        {
          name: 'formats',
          label: 'Formats',
          items: [
            {
              name: 'superscript',
              label: 'Superscript',
              icon: 'superscript',
              run: (editor) => editor.commands.toggleMark('superscript'),
              isActive: (snapshot) => snapshot.activeMarks.includes('superscript'),
            },
            {
              name: 'subscript',
              label: 'Subscript',
              icon: 'subscript',
              run: (editor) => editor.commands.toggleMark('subscript'),
              isActive: (snapshot) => snapshot.activeMarks.includes('subscript'),
            },
            {
              name: 'inlineCode',
              label: 'Code',
              icon: 'code',
              run: (editor) => editor.commands.toggleMark('code'),
              isActive: (snapshot) => snapshot.activeMarks.includes('code'),
            },
            {
              name: 'smallCaps',
              label: 'Small caps',
              icon: 'smallCaps',
              run: (editor) => editor.commands.toggleSmallCaps(),
              isActive: (snapshot) => snapshot.activeMarks.includes('smallCaps'),
            },
            {
              name: 'highlight',
              label: 'Highlight',
              icon: 'backgroundColor',
              run: (editor) => editor.commands.toggleMark('highlight'),
              isActive: (snapshot) => snapshot.activeMarks.includes('highlight'),
            },
          ],
        },
        separator('format-sep-styles'),
        {
          name: 'paragraphStyles',
          label: 'Paragraph styles',
          icon: 'quote',
          items: [
            {
              name: 'styleParagraph',
              label: 'Paragraph',
              icon: 'langPlain',
              run: (editor) => editor.commands.setParagraph(),
              isActive: (snapshot) => snapshot.blockType === 'paragraph',
            },
            ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
              name: `styleHeading${level}`,
              label: `Heading ${level}`,
              icon: 'langPlain' as IconName,
              run: (editor: Editor) => editor.commands.setHeading(level),
              isActive: (snapshot: EditorSnapshot) =>
                snapshot.blockType === 'heading' && snapshot.blockAttrs?.level === level,
            })),
            {
              name: 'styleQuote',
              label: 'Quote',
              icon: 'quote',
              run: (editor) => editor.commands.wrapIn('blockquote'),
              isActive: (snapshot) => snapshot.blockType === 'blockquote',
            },
            {
              name: 'styleCodeBlock',
              label: 'Code block',
              icon: 'codeLanguage',
              run: (editor) => editor.commands.setCodeBlock(),
              isActive: (snapshot) => snapshot.blockType === 'codeBlock',
            },
          ],
        },
        {
          name: 'alignMenu',
          label: 'Align',
          icon: 'alignLeft',
          items: (['left', 'center', 'right', 'justify'] as const).map((align) => ({
            name: `align${align}`,
            label: align[0].toUpperCase() + align.slice(1),
            icon: `align${align[0].toUpperCase()}${align.slice(1)}` as IconName,
            run: (editor: Editor) => editor.commands.setTextAlign(align),
            isActive: (snapshot: EditorSnapshot) => snapshot.align === align,
          })),
        },
        {
          name: 'indentMenu',
          label: 'Indentation',
          icon: 'indent',
          items: [
            {
              name: 'indentMore',
              label: 'Increase indent',
              icon: 'indent',
              run: (editor) => editor.commands.indent(),
            },
            {
              name: 'indentLess',
              label: 'Decrease indent',
              icon: 'outdent',
              run: (editor) => editor.commands.outdent(),
              isEnabled: (snapshot) => snapshot.indent > 0,
            },
          ],
        },
        separator('format-sep-spacing'),
        {
          name: 'lineHeightMenu',
          label: 'Line height',
          icon: 'lineHeight',
          items: [
            { value: '', label: 'Default' },
            { value: '1', label: 'Single' },
            { value: '1.15', label: '1.15' },
            { value: '1.5', label: '1.5' },
            { value: '2', label: 'Double' },
          ].map((entry) => ({
            name: `lineHeight-${entry.value || 'default'}`,
            label: entry.label,
            icon: 'lineHeight' as IconName,
            run: (editor: Editor) => editor.commands.setLineHeight(entry.value || null),
          })),
        },
        {
          name: 'paragraphSpacingMenu',
          label: 'Paragraph spacing',
          icon: 'paragraphSpacing',
          items: [
            ...(
              [
                ['', 'Before and after: none'],
                ['4px', 'Before and after: small'],
                ['8px', 'Before and after: medium'],
                ['16px', 'Before and after: large'],
              ] as const
            ).map(([value, label]) => ({
              name: `paragraphSpacing-${value || 'none'}`,
              label,
              icon: 'paragraphSpacing' as IconName,
              run: (editor: Editor) =>
                editor.commands.setParagraphSpacing({
                  before: value || null,
                  after: value || null,
                }),
            })),
            separator('spacing-sep-before'),
            // Space above and below are separate properties in the model, so
            // the menu offers them separately rather than only in lockstep.
            ...(
              [
                ['', 'Space before: none'],
                ['8px', 'Space before: medium'],
                ['16px', 'Space before: large'],
              ] as const
            ).map(([value, label]) => ({
              name: `spaceBefore-${value || 'none'}`,
              label,
              icon: 'paragraphSpacing' as IconName,
              run: (editor: Editor) =>
                editor.commands.setParagraphSpacing({ before: value || null }),
            })),
            separator('spacing-sep-after'),
            ...(
              [
                ['', 'Space after: none'],
                ['8px', 'Space after: medium'],
                ['16px', 'Space after: large'],
              ] as const
            ).map(([value, label]) => ({
              name: `spaceAfter-${value || 'none'}`,
              label,
              icon: 'paragraphSpacing' as IconName,
              run: (editor: Editor) =>
                editor.commands.setParagraphSpacing({ after: value || null }),
            })),
          ],
        },
        {
          name: 'letterSpacingMenu',
          label: 'Letter spacing',
          icon: 'letterSpacing',
          items: [
            { value: '', label: 'Normal' },
            { value: '-0.02em', label: 'Tight' },
            { value: '0.05em', label: 'Wide' },
            { value: '0.1em', label: 'Wider' },
          ].map((entry) => ({
            name: `letterSpacing-${entry.value || 'normal'}`,
            label: entry.label,
            icon: 'letterSpacing' as IconName,
            run: (editor: Editor) => editor.commands.setLetterSpacing(entry.value || null),
          })),
        },
        separator('format-sep-lists'),
        {
          name: 'listsMenu',
          label: 'Lists',
          icon: 'bulletList',
          items: [
            {
              name: 'listBullet',
              label: 'Bullet list',
              icon: 'bulletList',
              run: (editor) => editor.commands.toggleBulletList(),
              isActive: (snapshot) => snapshot.listType === 'bulletList',
            },
            {
              name: 'listOrdered',
              label: 'Numbered list',
              icon: 'orderedList',
              run: (editor) => editor.commands.toggleOrderedList(),
              isActive: (snapshot) => snapshot.listType === 'orderedList',
            },
            {
              name: 'listTask',
              label: 'Task list',
              icon: 'taskList',
              run: (editor) => editor.commands.toggleTaskList(),
              isActive: (snapshot) => snapshot.listType === 'taskList',
            },
            separator('list-sep-style'),
            ...(
              [
                ['disc', 'Disc', 'listStyleDisc'],
                ['circle', 'Circle', 'listStyleCircle'],
                ['square', 'Square', 'listStyleSquare'],
                ['decimal', '1, 2, 3', 'listStyleDecimal'],
                ['lower-alpha', 'a, b, c', 'listStyleAlpha'],
                ['upper-alpha', 'A, B, C', 'listStyleAlpha'],
                ['lower-roman', 'i, ii, iii', 'listStyleRoman'],
                ['upper-roman', 'I, II, III', 'listStyleRoman'],
              ] as const
            ).map(([style, label, icon]) => ({
              name: `listStyle-${style}`,
              label,
              icon: icon as IconName,
              run: (editor: Editor) => editor.commands.setListStyle(style),
              isEnabled: (snapshot: EditorSnapshot) => snapshot.listType !== null,
            })),
            separator('list-sep-numbering'),
            {
              name: 'restartNumbering',
              label: 'Restart numbering',
              icon: 'restartNumbering',
              run: (editor) => editor.commands.restartNumbering(),
              isEnabled: (snapshot) => snapshot.listType === 'orderedList',
            },
            {
              name: 'continueNumbering',
              label: 'Continue numbering',
              icon: 'continueNumbering',
              run: (editor) => editor.commands.continueNumberingFromPrevious(),
              isEnabled: (snapshot) => snapshot.listType === 'orderedList',
            },
            separator('list-sep-multilevel'),
            // The toolbar gallery's schemes, by name. Its "None" is already
            // here, as toggling a list off.
            ...defaultListNumberings()
              .filter((option) => option.value !== NO_LIST_NUMBERING)
              .map((option) => ({
                name: `listNumbering-${option.value}`,
                label: `${option.label}: ${option.markers.join(' ')}`,
                icon: 'multilevelList' as IconName,
                run: (editor: Editor) => editor.commands.setListNumbering(option.value),
                // A task list keeps its checkboxes, so no scheme applies there.
                isEnabled: (snapshot: EditorSnapshot) => snapshot.listType !== 'taskList',
              })),
          ],
        },
        separator('format-sep-2'),
        { name: 'formatPainter', label: 'Format painter', icon: 'formatPainter' },
        {
          name: 'clearFormatting',
          label: 'Clear text formatting',
          icon: 'removeFormat',
          run: (editor) => editor.commands.clearFormatting(),
        },
        {
          name: 'clearAllFormatting',
          label: 'Clear all formatting',
          icon: 'removeFormat',
          run: (editor) => editor.commands.clearAllFormatting(),
        },
      ],
    },
    {
      name: 'tools',
      label: 'Tools',
      items: [
        { name: 'findReplace', label: 'Find and replace…', icon: 'search', shortcut: 'Ctrl+F' },
        {
          name: 'commandPalette',
          label: 'Command palette…',
          icon: 'commandPalette',
          shortcut: 'Ctrl+K',
        },
        separator('tools-sep-panels'),
        { name: 'tableOfContents', label: 'Table of contents', icon: 'tableOfContents' },
        { name: 'documentOutline', label: 'Document outline', icon: 'outline' },
        separator('tools-sep-code'),
        { name: 'sourceCode', label: 'Source code…', icon: 'htmlMode' },
        { name: 'markdownSource', label: 'Markdown source…', icon: 'markdownMode' },
        { name: 'markdownMode', label: 'Edit as Markdown', icon: 'markdownMode' },
        { name: 'htmlMode', label: 'Edit as HTML', icon: 'htmlMode' },
        { name: 'formatJson', label: 'Format JSON', icon: 'formatJson' },
        { name: 'formatXml', label: 'Format XML', icon: 'formatXml' },
        { name: 'minifyCode', label: 'Minify', icon: 'minify' },
        { name: 'copyCode', label: 'Copy code block', icon: 'copyCode' },
        separator('tools-sep-writing'),
        { name: 'writingStats', label: 'Document statistics…', icon: 'statistics' },
        { name: 'writingGoal', label: 'Writing goal…', icon: 'target' },
        {
          name: 'writingChecks',
          label: 'Check writing',
          icon: 'search',
          items: [
            { name: 'writingAssistant', label: 'All checks', icon: 'search' },
            { name: 'writingGrammar', label: 'Grammar', icon: 'check' },
            { name: 'writingPassive', label: 'Passive voice', icon: 'check' },
            { name: 'writingRepeated', label: 'Repeated words', icon: 'check' },
            { name: 'writingLong', label: 'Long sentences', icon: 'check' },
          ],
        },
        { name: 'spellcheck', label: 'Spell check', icon: 'check' },
        separator('tools-sep-count'),
        { name: 'wordCount', icon: 'wordCount', label: 'Word count' },
      ],
    },
    {
      name: 'table',
      label: 'Table',
      items: [
        { name: 'insertTable', label: 'Insert table', icon: 'table' },
        { name: 'drawTable', label: 'Draw table', icon: 'tableDraw' },
        { name: 'tableEraser', label: 'Eraser', icon: 'tableEraser' },
        separator('table-sep-1'),
        { name: 'addRowBefore', icon: 'tableRowAbove', label: 'Row above' },
        { name: 'addRowAfter', icon: 'tableRowBelow', label: 'Row below' },
        { name: 'deleteRow', icon: 'tableRowDelete', label: 'Delete row' },
        separator('table-sep-2'),
        { name: 'addColumnBefore', icon: 'tableColumnLeft', label: 'Column left' },
        { name: 'addColumnAfter', icon: 'tableColumnRight', label: 'Column right' },
        { name: 'deleteColumn', icon: 'tableColumnDelete', label: 'Delete column' },
        separator('table-sep-3'),
        { name: 'mergeCells', icon: 'tableMerge', label: 'Merge cells' },
        { name: 'splitCell', icon: 'tableSplit', label: 'Split cells…' },
        { name: 'toggleHeaderRow', icon: 'tableHeaderRow', label: 'Header row' },
        separator('table-sep-cell'),
        { name: 'cellBackground', icon: 'cellBackground', label: 'Cell background…' },
        {
          name: 'cellAlign',
          icon: 'cellAlign',
          label: 'Cell alignment',
          items: [
            { name: 'cellAlignLeft', label: 'Left', icon: 'alignLeft' },
            { name: 'cellAlignCenter', label: 'Center', icon: 'alignCenter' },
            { name: 'cellAlignRight', label: 'Right', icon: 'alignRight' },
            { name: 'cellAlignNone', label: 'Default', icon: 'removeFormat' },
          ],
        },
        {
          name: 'tableBorders',
          icon: 'tableBorders',
          label: 'Borders',
          items: [
            { name: 'bordersAll', label: 'All borders', icon: 'tableBorders' },
            { name: 'bordersOuter', label: 'Outside only', icon: 'tableBorders' },
            { name: 'bordersHorizontal', label: 'Rows only', icon: 'tableBorders' },
            { name: 'bordersNone', label: 'No borders', icon: 'tableBorders' },
            { name: 'borderColor', label: 'Border colour…', icon: 'textColor' },
          ],
        },
        {
          name: 'tableSort',
          icon: 'tableSort',
          label: 'Sort by this column',
          items: [
            { name: 'sortAscending', label: 'Ascending', icon: 'tableSort' },
            { name: 'sortDescending', label: 'Descending', icon: 'tableSort' },
          ],
        },
        separator('table-sep-convert'),
        { name: 'convertTextToTable', icon: 'convertTextTable', label: 'Convert text to table' },
        { name: 'convertTableToText', icon: 'convertTextTable', label: 'Convert table to text' },
        { name: 'importCsv', icon: 'csvImport', label: 'Import CSV…' },
        { name: 'exportCsv', icon: 'csvExport', label: 'Copy as CSV' },
        separator('table-sep-size'),
        {
          name: 'tableAutoFit',
          icon: 'tableAutoFit',
          label: 'AutoFit',
          items: [
            { name: 'autoFitContents', label: 'AutoFit contents', icon: 'tableAutoFit' },
            { name: 'autoFitWindow', label: 'AutoFit window', icon: 'tableAutoFit' },
            { name: 'fixColumnWidths', label: 'Fixed column width', icon: 'tableAutoFit' },
          ],
        },
        { name: 'distributeRows', icon: 'tableDistributeRows', label: 'Distribute rows evenly' },
        { name: 'distributeColumns', icon: 'tableDistribute', label: 'Distribute columns evenly' },
        { name: 'clearTableSizing', icon: 'resizeColumns', label: 'Reset column sizes' },
        separator('table-sep-delete'),
        { name: 'deleteTable', icon: 'tableDelete', label: 'Delete table' },
      ],
    },
    {
      name: 'view',
      label: 'View',
      items: [
        {
          name: 'themeMenu',
          label: 'Theme',
          icon: 'palette',
          items: [
            { name: 'themeLight', label: 'Light', icon: 'themeLight' },
            { name: 'themeDark', label: 'Dark', icon: 'themeDark' },
            { name: 'themeSystem', label: 'Match the system', icon: 'themeSystem' },
            { name: 'themeSepia', label: 'Sepia', icon: 'themeSepia' },
            { name: 'themeNord', label: 'Nord', icon: 'themeNord' },
            { name: 'themeSolarized', label: 'Solarized', icon: 'themeSolarized' },
            { name: 'themeContrast', label: 'High contrast', icon: 'themeContrast' },
            { name: 'themeMidnight', label: 'Midnight', icon: 'themeMidnight' },
            { name: 'customTheme', label: 'Custom theme…', icon: 'palette' },
            { name: 'customCss', label: 'Custom CSS…', icon: 'htmlMode' },
          ],
        },
        { name: 'manageFonts', label: 'Add a font…', icon: 'fontAdd' },
        separator('view-sep-modes'),
        { name: 'focusMode', label: 'Focus mode', icon: 'focusMode' },
        { name: 'typewriterMode', label: 'Typewriter scrolling', icon: 'focusMode' },
        { name: 'fullscreen', label: 'Fullscreen', icon: 'fullscreen' },
        { name: 'pageMode', label: 'Page view', icon: 'pageBreak' },
        separator('view-sep-panels'),
        { name: 'tableOfContents', label: 'Table of contents', icon: 'tableOfContents' },
        { name: 'documentOutline', label: 'Document outline', icon: 'outline' },
        { name: 'historyPanel', label: 'History', icon: 'undo' },
        { name: 'workspacePanel', label: 'Documents', icon: 'save' },
        { name: 'splitPreview', label: 'Side-by-side preview', icon: 'columns2' },
        { name: 'splitEditor', label: 'Split editor', icon: 'columns2' },
        separator('view-sep-width'),
        { name: 'widthNarrow', label: 'Narrow width', icon: 'editorWidth' },
        { name: 'widthNormal', label: 'Normal width', icon: 'editorWidth' },
        { name: 'widthWide', label: 'Wide width', icon: 'editorWidth' },
        { name: 'widthFull', label: 'Full width', icon: 'editorWidth' },
        separator('view-sep-access'),
        { name: 'readOnly', label: 'Read-only mode', icon: 'lock' },
        { name: 'trackChanges', label: 'Suggesting mode', icon: 'suggesting' },
      ],
    },
    {
      name: 'help',
      label: 'Help',
      items: [
        { name: 'keyboardShortcuts', label: 'Keyboard shortcuts…', icon: 'keyboard' },
        { name: 'customizeToolbar', label: 'Customize toolbar…', icon: 'sliders' },
        { name: 'about', label: 'About', icon: 'info' },
      ],
    },
  ]
}

/**
 * A WAI-ARIA menubar. Items with no `run` are inert until an integration
 * supplies one, {@link createEditorUI} wires the table and dialog entries,
 * and unhandled items are disabled rather than silently doing nothing.
 */
export function createMenubar(
  editor: Editor,
  container: HTMLElement,
  options: MenubarOptions = {},
): Menubar {
  const document = container.ownerDocument
  const menus = options.menus ?? defaultMenus()
  const translate = createTranslator(options.messages)
  const root = document.createElement('div')
  root.className = 'trevixal-menubar'
  root.setAttribute('role', 'menubar')
  root.setAttribute('aria-label', options.ariaLabel ?? 'Editor menu')

  const refreshers: ((snapshot: EditorSnapshot) => void)[] = []
  const disposers: (() => void)[] = []
  const dropdowns: Dropdown[] = []
  // A list per name, not one slot: the same item appears in more than one
  // menu (`findReplace` in Edit and Tools, `tableOfContents` in Tools and
  // View), and keeping only the last one leaves the first copy blank.
  const shortcutSlots = new Map<string, ShortcutSlot[]>()
  let shortcutLabels = options.shortcutLabels

  const printShortcuts = (): void => {
    for (const [name, slots] of shortcutSlots) {
      for (const slot of slots) {
        const text = shortcutLabels ? (shortcutLabels[name] ?? '') : slot.fallback
        slot.element.textContent = text
        slot.element.hidden = text.length === 0
      }
    }
  }

  const refresh = (): void => {
    const snapshot = editor.getSnapshot()
    for (const apply of refreshers) apply(snapshot)
  }

  for (const menu of menus) {
    const dropdown = createDropdown({
      document,
      className: 'trevixal-menubar__menu',
      // Recompute the moment the menu is opened, not only after the document
      // changes. Half of what these entries report is chrome (a panel, the
      // split view, read-only, the theme) and none of that raises a
      // transaction, so a menu refreshed only by editing shows the state the
      // editor was in at the last keystroke. Opening a menu is exactly when
      // its answers have to be current, and it happens once per open.
      onOpen: () => refresh(),
      // The second argument is the dropdown being created; the outer binding is not
      // assigned yet while render runs.
      render: (panel, self) => {
        panel.setAttribute('role', 'menu')
        panel.setAttribute('aria-label', translate(`${MENU_KEY}${menu.name}`, menu.label))
        for (const item of menu.items) {
          renderMenuItem(
            document,
            panel,
            item,
            editor,
            self,
            refreshers,
            shortcutSlots,
            refresh,
            translate,
          )
        }
        disposers.push(bindListNavigation(panel))
      },
    })
    dropdown.trigger.classList.add('trevixal-menubar__trigger')
    dropdown.trigger.setAttribute('role', 'menuitem')
    dropdown.trigger.textContent = translate(`${MENU_KEY}${menu.name}`, menu.label)
    dropdown.trigger.dataset.trevixalMenu = menu.name
    // Hovering while another menu is open switches menus, as menubars do.
    dropdown.trigger.addEventListener('mouseenter', () => {
      if (dropdowns.some((entry) => entry !== dropdown && entry.isOpen)) dropdown.open()
    })
    root.appendChild(dropdown.element)
    dropdowns.push(dropdown)
  }

  bindMenubarNavigation(root, dropdowns)

  printShortcuts()
  refresh()
  disposers.push(editor.on('transaction', refresh))

  container.appendChild(root)
  return {
    element: root,
    setShortcutLabels(labels) {
      shortcutLabels = labels
      printShortcuts()
    },
    destroy() {
      for (const dispose of disposers) dispose()
      for (const dropdown of dropdowns) dropdown.destroy()
      root.remove()
    },
  }
}

/** Where one menu entry prints its shortcut, and what it prints without a manager. */
interface ShortcutSlot {
  readonly element: HTMLElement
  readonly fallback: string
}

function renderMenuItem(
  document: Document,
  panel: HTMLElement,
  item: MenuItem,
  editor: Editor,
  dropdown: Dropdown,
  refreshers: ((snapshot: EditorSnapshot) => void)[],
  shortcutSlots: Map<string, ShortcutSlot[]>,
  refresh: () => void,
  translate: Translator,
): void {
  if (item.separator) {
    const rule = document.createElement('div')
    rule.className = 'trevixal-menu__separator'
    rule.setAttribute('role', 'separator')
    panel.appendChild(rule)
    return
  }

  if (item.items) {
    const group = document.createElement('div')
    group.className = 'trevixal-menu__group'
    const heading = document.createElement('div')
    heading.className = 'trevixal-menu__heading'
    heading.textContent = translate(`${MENU_KEY}${item.name}`, item.label)
    group.appendChild(heading)
    for (const child of item.items) {
      renderMenuItem(
        document,
        group,
        child,
        editor,
        dropdown,
        refreshers,
        shortcutSlots,
        refresh,
        translate,
      )
    }
    panel.appendChild(group)
    return
  }

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'trevixal-menu__item'
  // An item that reports a state is a checkbox, not a plain command. ARIA
  // does not allow `aria-checked` on `menuitem`, and a reader given the
  // attribute on the wrong role is told nothing about whether bold is on.
  button.setAttribute('role', item.isActive ? 'menuitemcheckbox' : 'menuitem')
  button.dataset.trevixalItem = item.name

  const icon = item.icon ? createIcon(document, item.icon) : null
  const glyph = document.createElement('span')
  glyph.className = 'trevixal-menu__icon'
  if (icon) glyph.appendChild(icon)
  const label = document.createElement('span')
  label.className = 'trevixal-menu__label'
  label.textContent = translate(`${MENU_KEY}${item.name}`, item.label)
  button.append(glyph, label)
  // Every item gets a slot, so a binding added later by the shortcut manager
  // has somewhere to print; `printShortcuts` hides the empty ones.
  const shortcut = document.createElement('span')
  shortcut.className = 'trevixal-menu__shortcut'
  shortcut.hidden = true
  button.appendChild(shortcut)
  const slots = shortcutSlots.get(item.name)
  const slot: ShortcutSlot = { element: shortcut, fallback: item.shortcut ?? '' }
  if (slots) slots.push(slot)
  else shortcutSlots.set(item.name, [slot])

  // A tick, for an item that reports a state. `aria-checked` alone tells a
  // screen reader everything and a sighted user nothing, and the accent
  // colour the checked style adds is not a signal on its own, plenty of
  // menus colour an item for other reasons. The element is always in the
  // layout and only its visibility changes, so labels do not shift as
  // entries switch on and off.
  if (item.isActive) {
    const check = document.createElement('span')
    check.className = 'trevixal-menu__check'
    check.setAttribute('aria-hidden', 'true')
    const tick = createIcon(document, 'check')
    if (tick) check.appendChild(tick)
    button.appendChild(check)
  }

  button.addEventListener('click', () => {
    dropdown.close()
    editor.view?.focus()
    item.run?.(editor)
    // A toggle that touches chrome rather than the document (a panel, a
    // writing check) emits no transaction, so its checked state is refreshed
    // here instead of waiting for the next edit.
    refresh()
  })

  refreshers.push((snapshot) => {
    if (item.isActive) button.setAttribute('aria-checked', String(item.isActive(snapshot)))
    // An item with no action is inert; disable it rather than pretend.
    button.disabled = item.run ? Boolean(item.isEnabled && !item.isEnabled(snapshot)) : true
  })

  panel.appendChild(button)
}

/** Left/right arrows move between menus, as the menubar pattern requires. */
function bindMenubarNavigation(root: HTMLElement, dropdowns: readonly Dropdown[]): void {
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    const active = root.ownerDocument.activeElement
    const index = dropdowns.findIndex(
      (dropdown) => dropdown.trigger === active || dropdown.panel.contains(active),
    )
    if (index === -1) return
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const next = dropdowns[(index + delta + dropdowns.length) % dropdowns.length]
    if (!next) return
    const wasOpen = dropdowns[index]?.isOpen
    dropdowns[index]?.close()
    next.trigger.focus()
    if (wasOpen) {
      next.open()
      focusFirstItem(next.panel)
    }
    event.preventDefault()
  })
}
