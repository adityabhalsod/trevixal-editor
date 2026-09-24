import { type DocJSON, customListScheme, storedListSchemesAttr } from '@trevixal/core'

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

const task = (
  text: string,
  attrs: { checked: boolean; assignee?: string; due?: string },
): unknown => ({
  type: 'taskItem',
  attrs,
  content: [paragraph(text)],
})

const text = (value: string, marks?: unknown[]): unknown =>
  marks ? { type: 'text', text: value, marks } : { type: 'text', text: value }

/** Words marked for the index, filed under `entry`. */
const indexed = (value: string, id: string): unknown =>
  text(value, [{ type: 'indexTerm', attrs: { id, entry: value, sub: null } }])

const heading = (level: number, value: string): unknown => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
})

/**
 * A multilevel list of the tour's own, as Format ▸ Lists ▸ Define new
 * multilevel list makes one: `Step 1:`, then `1.a)`, and the gallery offers
 * it for the document's other lists.
 */
const STEPS = customListScheme('custom-1', 'Steps', [
  { style: 'decimal', text: 'Step %1:', start: 1, indent: 3.5 },
  { style: 'lower-alpha', text: '%1.%2)', start: 1, indent: 2 },
])

/**
 * A paragraph style of the tour's own, as the Styles pane's New style makes
 * one. No colour of its own: one that reads on the light theme fails on the
 * dark one.
 */
const PULL_QUOTE = {
  id: 'pull-quote',
  name: 'Pull quote',
  kind: 'paragraph',
  props: {
    fontSize: 13,
    italic: true,
    align: 'center',
    spaceBefore: 6,
    spaceAfter: 12,
  },
}

/**
 * The fields' results as the field updater works them out, written in, so a
 * page rendered without the kit (a server, as `examples/ssr` does) shows
 * them too; the updater finds them current and leaves them be.
 */
const CAPTION_LIST_ENTRIES = JSON.stringify([{ id: 'tab-launch', text: 'Table 1: Launch budget' }])
const INDEX_ENTRIES = JSON.stringify(
  [
    ['Captions', 'xe-captions'],
    ['cross-reference', 'xe-xref'],
    ['endnote', 'xe-endnote'],
    ['index', 'xe-index'],
  ].map(([term, id]) => ({ term, locations: [{ id, label: '1' }], subentries: [] })),
)

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
  // Document settings: the style and the multilevel list the tour defines.
  attrs: {
    styles: JSON.stringify([PULL_QUOTE]),
    listSchemes: storedListSchemesAttr([STEPS]),
  },
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
        // An assignee and a due date each, shown after the task; the list
        // counts what is done under it.
        task('Ship the advanced blocks', { checked: true, assignee: 'Priya' }),
        task('Wire every menu entry to a real command', {
          checked: true,
          assignee: 'Sam',
          due: '2026-09-12',
        }),
        task('Export to PDF, DOCX and RTF', { checked: false, assignee: 'Lee', due: '2027-06-30' }),
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

    heading(2, 'Long documents'),
    {
      type: 'paragraph',
      content: [
        indexed('Captions', 'xe-captions'),
        text(' on tables, figures and equations number themselves (Insert ▸ Caption). A '),
        indexed('cross-reference', 'xe-xref'),
        text(' follows what it names when the numbers change: the budget further down is '),
        {
          type: 'crossReference',
          attrs: { target: 'tab-launch', format: 'label', text: 'Table 1' },
        },
        text(
          '. The list of tables below keeps up with it, and heading and line numbers are under Format.',
        ),
      ],
    },
    { type: 'captionList', attrs: { kind: 'table', entries: CAPTION_LIST_ENTRIES } },
    {
      type: 'paragraph',
      content: [
        text('Mark a word for the '),
        indexed('index', 'xe-index'),
        text(' (Insert ▸ Mark index entry), and Insert ▸ Index files it with a link back. An '),
        indexed('endnote', 'xe-endnote'),
        text(' collects at the very end, after the footnotes.'),
        { type: 'endnoteRef', attrs: { id: '1' } },
      ],
    },
    { type: 'documentIndex', attrs: { entries: INDEX_ENTRIES } },
    paragraph('A paragraph can run right to left beside the others, from Format ▸ Text direction:'),
    {
      type: 'paragraph',
      attrs: { dir: 'rtl' },
      content: [text('هذه الفقرة تُكتب من اليمين إلى اليسار، وتبقى الفقرات حولها كما هي.')],
    },
    paragraph(
      'Every block has a menu on the grip beside it. Duplicate a block, delete it, move it, turn it into another kind, or copy a link to it.',
    ),

    heading(2, 'Formatting tools'),
    {
      type: 'paragraph',
      attrs: { paragraphStyle: 'pull-quote' },
      content: [
        text(
          'A paragraph in a style of its own, Pull quote. Change the style once in Format ▸ Styles pane, and every paragraph in it follows.',
        ),
      ],
    },
    {
      type: 'paragraph',
      content: [
        text('Text can take a character style too, such as '),
        text('Subtle emphasis', [{ type: 'charStyle', attrs: { id: 'subtleEmphasis' } }]),
        text(', from the same pane.'),
      ],
    },
    {
      type: 'paragraph',
      attrs: { dropCap: 'drop', dropCapLines: 3 },
      content: [
        text(
          'Drop caps set the first letter of a paragraph large, over the lines beside it, as a magazine does. Format ▸ Drop cap drops one into any paragraph, or hangs it in the margin instead. Its options set how many lines it spans. In a Word file it is a frame of its own, as Word makes one.',
        ),
      ],
    },
    {
      type: 'paragraph',
      attrs: {
        borderSides: 'top right bottom left',
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: '#2f6fed',
        shading: '#eef4ff',
      },
      // Dark text of its own, as Word's automatic colour is on a light fill,
      // so the notice still reads when the theme's text turns light.
      content: [
        text('A boxed and shaded notice, from Format ▸ Borders and shading.', [
          { type: 'textColor', attrs: { color: '#1f2a44' } },
        ]),
      ],
    },
    paragraph(
      'Tab stops line figures up on their decimal point, with dots leading to them (Format ▸ Tabs):',
    ),
    ...[
      ['Hall hire', '1,200.00'],
      ['Catering', '2,640.00'],
      ['Stage lighting', '780.00'],
    ].map(([item, cost]) => ({
      type: 'paragraph',
      attrs: { tabStops: '360 decimal dot' },
      content: [text(`${item}\t${cost}`)],
    })),
    paragraph(
      'As you type, straight quotes curl, two hyphens make a dash, and 1/2 becomes ½. A word on the AutoCorrect list puts itself right (Tools ▸ AutoCorrect options). Text columns, hyphenation, and widow and orphan control belong to the whole document, under Format.',
    ),

    heading(2, 'Lists and tables'),
    paragraph(
      'Each task above has an assignee or a due date, from Format ▸ Lists ▸ Task due date and assignee. The list counts the tasks you have ticked off. Click the arrow beside an item to fold what is under it, and sort a list from Format ▸ Lists ▸ Sort A to Z:',
    ),
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          attrs: { folded: true },
          content: [
            paragraph('Venue: The Riverside Hall'),
            {
              type: 'bulletList',
              content: [
                listItem('Main hall, 120 seats'),
                listItem('Garden room for the reception'),
              ],
            },
          ],
        },
        listItem('Printing: Inkwell Print'),
        listItem('Catering: Bramble & Co'),
        listItem('Audio: Soundhouse'),
      ],
    },
    paragraph(
      'A multilevel list of the document’s own, from Format ▸ Lists ▸ Define new multilevel list. It joins the gallery, for the other lists:',
    ),
    {
      type: 'orderedList',
      attrs: { numbering: 'custom-1' },
      content: [
        {
          type: 'listItem',
          content: [
            paragraph('Plan'),
            { type: 'orderedList', content: [listItem('Scope'), listItem('Budget')] },
          ],
        },
        listItem('Build'),
        listItem('Launch'),
      ],
    },
    {
      // Table ▸ Insert caption: a table is captioned above it, as in Word.
      type: 'paragraph',
      content: [
        text('Table '),
        { type: 'captionNumber', attrs: { kind: 'table', id: 'tab-launch', number: 1 } },
        text(': Launch budget'),
      ],
    },
    {
      type: 'table',
      // The header row held in view as the table scrolls by, and wide cell
      // padding. Two columns, so that with the table inside it, it still fits
      // a 320px phone: a table has no scrollbar of its own, and one wider
      // than the screen scrolls the whole page sideways.
      attrs: { freezeHeader: true, cellPadding: '16px' },
      content: [
        row([cell('Item', true), cell('Cost (£)', true)]),
        row([cell('Hall hire, two days'), cell('1,200.00')]),
        row([cell('Catering, 120 guests'), cell('2,640.00')]),
        row([
          {
            // A table inside a cell, with a look of its own.
            type: 'tableCell',
            attrs: { header: false },
            content: [
              paragraph('Stage lighting, delivered the day before:'),
              {
                type: 'table',
                content: [
                  row([cell('Set-up', true), cell('Get-out', true)]),
                  row([cell('08:00'), cell('22:00')]),
                ],
              },
            ],
          },
          // Sat in the middle of its row, beside the crew table.
          {
            type: 'tableCell',
            attrs: { header: false, verticalAlign: 'middle' },
            content: [paragraph('780.00')],
          },
        ]),
        row([cell('Banners and programmes'), cell('483.00')]),
        row([cell('Photographer'), cell('600.00')]),
        row([cell('Insurance'), cell('140.00')]),
      ],
    },
    paragraph(
      'Its header row stays at the top of the window while the table scrolls by (Table ▸ Freeze header row). Table ▸ Freeze first column keeps the first column in view as a wide table scrolls sideways. In a print, the header row heads every page the table runs onto. Table ▸ Cell padding and Table ▸ Cell alignment set the room in its cells and where their content sits.',
    ),

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
    {
      type: 'endnoteList',
      content: [
        {
          type: 'endnoteItem',
          attrs: { id: '1' },
          content: [paragraph('Endnotes collect after the footnotes, at the very end.')],
        },
      ],
    },
  ],
} as unknown as DocJSON
