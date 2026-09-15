import type { DocJSON } from '@trevixal/core'

const paragraph = (text: string): unknown => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
})

const cell = (text: string, header = false): unknown => ({
  type: 'tableCell',
  attrs: { header },
  content: [paragraph(text)],
})

const row = (cells: unknown[]): unknown => ({ type: 'tableRow', content: cells })

const listItem = (text: string): unknown => ({ type: 'listItem', content: [paragraph(text)] })

const task = (text: string, checked: boolean): unknown => ({
  type: 'taskItem',
  attrs: { checked },
  content: [paragraph(text)],
})

const callout = (variant: string, text: string): unknown => ({
  type: 'callout',
  attrs: { variant, icon: null },
  content: [paragraph(text)],
})

/**
 * The document the showcase opens with. It exists so the page demonstrates
 * something on load rather than an empty box. Every block here exercises a
 * feature the chrome above it controls.
 */
export const initialContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Trevixal' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'The full editor: ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'bold' },
        { type: 'text', text: ', ' },
        { type: 'text', marks: [{ type: 'italic' }], text: 'italic' },
        { type: 'text', text: ', ' },
        { type: 'text', marks: [{ type: 'underline' }], text: 'underline' },
        { type: 'text', text: ', ' },
        { type: 'text', marks: [{ type: 'strikethrough' }], text: 'strikethrough' },
        { type: 'text', text: ', ' },
        { type: 'text', marks: [{ type: 'code' }], text: 'code' },
        { type: 'text', text: ' and ' },
        {
          type: 'text',
          marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
          text: 'a link',
        },
        { type: 'text', text: '.' },
      ],
    },
    {
      type: 'paragraph',
      attrs: { align: 'center' },
      content: [
        {
          type: 'text',
          marks: [
            { type: 'fontFamily', attrs: { family: 'Georgia, serif' } },
            { type: 'fontSize', attrs: { size: '18pt' } },
            { type: 'textColor', attrs: { color: '#2f6fed' } },
          ],
          text: 'Centered, in Georgia at 18pt, in blue.',
        },
      ],
    },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [paragraph('A bullet list')] },
        { type: 'listItem', content: [paragraph('Tab indents, Shift+Tab lifts')] },
      ],
    },
    {
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [paragraph('A numbered list')] },
        { type: 'listItem', content: [paragraph('Try the indent buttons')] },
      ],
    },
    {
      type: 'blockquote',
      content: [paragraph('A blockquote, from the toolbar or > plus a space.')],
    },
    paragraph('A table: click a cell to see it highlighted, then use the Table menu:'),
    {
      type: 'table',
      content: [
        row([cell('Feature', true), cell('Where', true), cell('Notes', true)]),
        row([cell('Menubar'), cell('Above'), cell('File, Edit, Insert, Format, Table, Tools')]),
        row([cell('Images'), cell('Toolbar'), cell('Drag one in, or paste a screenshot')]),
      ],
    },
    paragraph('Code blocks carry a language; the picker appears when the caret is inside one:'),
    {
      type: 'codeBlock',
      attrs: { language: 'typescript' },
      content: [
        {
          type: 'text',
          text:
            '// Twelve languages ship with the highlighter.\n' +
            'const editor = createEditor({ schema, content })\n' +
            'editor.commands.toggleMark("bold")',
        },
      ],
    },
    {
      type: 'codeBlock',
      attrs: { language: 'sql' },
      content: [
        {
          type: 'text',
          text: 'SELECT name, count(*) AS total\nFROM users\nWHERE active = true\nGROUP BY name;',
        },
      ],
    },
    paragraph('This block names no language: the highlighter works it out:'),
    {
      // Deliberately unlabelled: `autoDetect` recognises it as Python.
      type: 'codeBlock',
      attrs: { language: null },
      content: [
        {
          type: 'text',
          text:
            'def summarize(rows):\n' +
            '    total = sum(row.value for row in rows)\n' +
            '    return None if total == 0 else total',
        },
      ],
    },
    { type: 'horizontalRule' },
    paragraph('Select formatted text and use the brush to copy its styling elsewhere.'),

    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tasks' }] },
    {
      type: 'taskList',
      content: [
        task('Ship the advanced blocks', true),
        task('Wire every menu entry to a real command', true),
        task('Export to PDF, DOCX and RTF', false),
      ],
    },
    {
      // The two inline triggers, named where a reader will meet them. Their
      // output is not baked in here: the point is to make someone type them.
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Type ' },
        { type: 'text', marks: [{ type: 'code' }], text: ':' },
        { type: 'text', text: ' for emoji, or ' },
        { type: 'text', marks: [{ type: 'code' }], text: '/' },
        { type: 'text', text: ' at the start of a block for anything else.' },
      ],
    },

    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Callouts' }] },
    callout('info', 'Info: the neutral note, and the default variant.'),
    callout('success', 'Success: something completed.'),
    callout('warning', 'Warning: proceed carefully.'),
    callout('danger', 'Danger: this one destroys data.'),
    callout('note', 'Note: an aside worth keeping.'),

    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Layout' }] },
    {
      type: 'columnBlock',
      attrs: { count: 3 },
      content: [
        { type: 'column', attrs: { width: null }, content: [paragraph('First column.')] },
        { type: 'column', attrs: { width: null }, content: [paragraph('Second column.')] },
        { type: 'column', attrs: { width: null }, content: [paragraph('Third column.')] },
      ],
    },
    {
      type: 'card',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'A card' }] },
        paragraph('Grouped content that reads as one unit.'),
      ],
    },
    {
      type: 'toggleBlock',
      attrs: { open: true },
      content: [
        { type: 'toggleSummary', content: [{ type: 'text', text: 'A collapsible section' }] },
        { type: 'toggleContent', content: [paragraph('Hidden until the summary is clicked.')] },
      ],
    },
    {
      type: 'timeline',
      content: [
        {
          type: 'timelineItem',
          attrs: { marker: null },
          content: [paragraph('Wave 1: editor features.')],
        },
        {
          type: 'timelineItem',
          attrs: { marker: null },
          content: [paragraph('Wave 2: export and diagrams.')],
        },
      ],
    },

    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Typography' }] },
    {
      type: 'paragraph',
      attrs: { lineHeight: '2', spaceBefore: null, spaceAfter: '16px' },
      content: [
        { type: 'text', text: 'Double line height, ' },
        { type: 'text', marks: [{ type: 'smallCaps' }], text: 'small caps' },
        { type: 'text', text: ', and ' },
        {
          type: 'text',
          marks: [{ type: 'letterSpacing', attrs: { spacing: '0.1em' } }],
          text: 'wide letter spacing',
        },
        { type: 'text', text: '.' },
      ],
    },
    {
      type: 'bulletList',
      attrs: { listStyle: 'square' },
      content: [listItem('A square-bulleted list.'), listItem('Set from the Format menu.')],
    },
    {
      type: 'orderedList',
      attrs: { start: 1, listStyle: 'upper-roman' },
      content: [listItem('Roman numerals.'), listItem('Also from the Format menu.')],
    },

    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Inline extras: ' },
        { type: 'badge', attrs: { label: 'New', tone: 'success' } },
        { type: 'text', text: ' a badge, ' },
        { type: 'buttonBlock', attrs: { label: 'A button', href: 'https://example.com' } },
        { type: 'text', text: ', and a footnote reference.' },
        { type: 'footnoteRef', attrs: { id: 'fn1' } },
      ],
    },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Media and maths' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Equations sit inline: ' },
        { type: 'math', attrs: { latex: 'e^{i\\pi} + 1 = 0' } },
        { type: 'text', text: ', and on their own line:' },
      ],
    },
    { type: 'mathBlock', attrs: { latex: '\\int_0^1 x^2 \\, dx = \\frac{1}{3}' } },
    {
      type: 'iframeEmbed',
      attrs: {
        src: 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
        title: 'Big Buck Bunny',
        provider: 'youtube',
        width: null,
        height: null,
      },
    },
    {
      type: 'linkCard',
      attrs: {
        href: 'https://developer.mozilla.org/en-US/docs/Web/API/Selection',
        title: 'Selection: Web APIs | MDN',
        description: 'The Selection interface represents the range of text selected by the user.',
        image: null,
        siteName: 'MDN Web Docs',
      },
    },

    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Diagrams' }] },
    {
      type: 'codeBlock',
      attrs: { language: 'mermaid' },
      content: [
        {
          type: 'text',
          text: 'graph LR\n  Type[Type] --> Model[Model]\n  Model --> Render[Render]\n  Render --> Type',
        },
      ],
    },

    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Tabs and accordions' }],
    },
    {
      type: 'tabsBlock',
      content: [
        {
          type: 'tabItem',
          attrs: { active: true },
          content: [
            { type: 'tabTitle', content: [{ type: 'text', text: 'Install' }] },
            {
              type: 'tabContent',
              content: [
                paragraph('Click a tab title to switch; the choice is part of the document.'),
              ],
            },
          ],
        },
        {
          type: 'tabItem',
          attrs: { active: false },
          content: [
            { type: 'tabTitle', content: [{ type: 'text', text: 'Use' }] },
            { type: 'tabContent', content: [paragraph('So it survives a save and a reload.')] },
          ],
        },
      ],
    },
    {
      type: 'accordion',
      attrs: { exclusive: true },
      content: [
        {
          type: 'accordionItem',
          attrs: { open: true },
          content: [
            { type: 'accordionTitle', content: [{ type: 'text', text: 'What is an accordion?' }] },
            {
              type: 'accordionContent',
              content: [
                paragraph('Native <details> elements whose folding is written back to the model.'),
              ],
            },
          ],
        },
        {
          type: 'accordionItem',
          attrs: { open: false },
          content: [
            { type: 'accordionTitle', content: [{ type: 'text', text: 'Exclusive?' }] },
            {
              type: 'accordionContent',
              content: [paragraph('Opening one section closes the others.')],
            },
          ],
        },
      ],
    },

    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Citations number themselves' },
        { type: 'citation', attrs: { id: 'ref1', label: '1' } },
        { type: 'text', text: ' and collect into a reference list.' },
      ],
    },
    {
      type: 'referenceList',
      content: [
        {
          type: 'referenceItem',
          attrs: { id: 'ref1' },
          content: [{ type: 'text', text: 'Trevixal: a rich text editor built from scratch.' }],
        },
      ],
    },

    { type: 'pageBreak' },
    {
      type: 'footnoteList',
      content: [
        {
          type: 'footnoteItem',
          attrs: { id: 'fn1' },
          content: [paragraph('Footnotes collect at the end of the document.')],
        },
      ],
    },
  ],
} as unknown as DocJSON
