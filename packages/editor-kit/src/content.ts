import {
  DEFAULT_PAGE_SETUP,
  type DocJSON,
  customListScheme,
  storedListSchemesAttr,
  storedPageSetup,
  storedVariables,
} from '@trevixal/core'

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

/** A cost, typed as money (Table ▸ Column type), so it lines up on the right. */
const cost = (text: string): unknown => ({
  type: 'tableCell',
  attrs: { header: false, valueType: 'currency' },
  content: [paragraph(text)],
})

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

/** When the tour's comment thread was written: fixed, so every app shows the same. */
const COMMENTED_AT = Date.UTC(2026, 8, 28, 9, 30)

/** A comment thread on the tour's words, a reply in it, as View ▸ Comments keeps one. */
const COMMENTS = JSON.stringify([
  {
    id: 'c-tour',
    resolved: false,
    comments: [
      { author: 'Priya', text: 'Could the tour show a comment thread?', time: COMMENTED_AT },
      {
        author: 'Sam',
        text: '@Priya Here it is. Reply below, or resolve it.',
        time: COMMENTED_AT + 60 * 60 * 1000,
      },
    ],
  },
])

/** A small picture for the gallery, drawn as SVG: shapes of its own colours, on a sky. */
const picture = (sky: string, shapes: string): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" fill="${sky}"/>${shapes}</svg>`,
  )}`

const galleryImage = (src: string, alt: string): unknown => ({ type: 'image', attrs: { src, alt } })

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
    // The thread on the words about comments, below.
    comments: COMMENTS,
    // What the block shown only when a variable says so reads.
    variables: storedVariables({ edition: 'pro' }),
    // Each printed page numbered at its foot (File ▸ Page setup).
    pageSetup: storedPageSetup({ ...DEFAULT_PAGE_SETUP, footer: 'Page {page} of {pages}' }),
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
            '// Fourteen languages ship with the highlighter.\n' +
            'const editor = createEditor({ schema, content })\n' +
            'editor.commands.toggleMark("bold")',
        },
      ],
    },
    {
      // The code bar's options: numbered lines, one picked out, and a title.
      type: 'codeBlock',
      attrs: { language: 'sql', lineNumbers: true, highlightLines: '3', title: 'report.sql' },
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
    paragraph(
      'The options on a code block’s bar number its lines, pick lines out, wrap, fold and title it. Insert ▸ Code adds a terminal, a diff, or code to run.',
    ),
    paragraph('Copy a terminal session and only its commands go, without the prompts:'),
    {
      type: 'codeBlock',
      attrs: { language: 'console' },
      content: [
        {
          type: 'text',
          text: '$ pnpm add @trevixal/editor-kit\nPackages: +1\n$ pnpm dev',
        },
      ],
    },
    paragraph(
      'Tools ▸ Key bindings swaps in Emacs’s or Vim’s keys. File ▸ Front matter keeps a Markdown file’s YAML, and MDX downloads too.',
    ),
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
        { type: 'toggleContent', content: [paragraph('Click the summary to show or hide this.')] },
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
        { type: 'text', text: ', chemistry too: ' },
        { type: 'math', attrs: { latex: '\\ce{2H2 + O2 -> 2H2O}' } },
        { type: 'text', text: '. On their own line they take a number:' },
      ],
    },
    {
      type: 'mathBlock',
      // Numbered, with the number and id the field updater gives it.
      attrs: {
        latex: '\\int_0^1 x^2 \\, dx = \\frac{1}{3}',
        numbered: true,
        number: '1',
        id: 'eq-1',
      },
    },
    paragraph('Double-click an equation to edit it with a palette of symbols and a preview.'),
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
    paragraph(
      'Insert ▸ Link can point at any block, not only a heading. Tools ▸ Check links lists the links that go nowhere.',
    ),
    paragraph(
      'In a workspace document, type [[ to link to another one. The Backlinks list shows which documents link to the one open.',
    ),
    paragraph(
      'Insert ▸ Include from workspace shows another document here, kept in step as it changes. File ▸ Import from a web address clips a page’s article in.',
    ),
    paragraph(
      'File ▸ Save version keeps a named checkpoint. Local backups compares any two, and Tools ▸ Compare with a file compares with another file.',
    ),
    paragraph(
      'View ▸ Suggesting mode records edits as suggestions. The review bar accepts or rejects them all, or one reviewer’s.',
    ),
    {
      type: 'paragraph',
      content: [
        text('Select words and press Ctrl+Alt+M to comment on them. View ▸ Comments '),
        text('holds the replies, @mentions and Resolve', [
          { type: 'comment', attrs: { id: 'c-tour' } },
        ]),
        text(', as the thread on these words shows.'),
      ],
    },
    paragraph(
      'Alt+click adds a caret, and Ctrl+D the next match; typing goes to each. Ctrl+G goes to a line, a heading or a bookmark.',
    ),
    paragraph(
      'Tools ▸ Snippets keeps text under an abbreviation that expands as you type it. Tools ▸ Macro records what you do, and F8 plays it.',
    ),
    paragraph(
      'File ▸ Download as writes OpenDocument, EPUB, LaTeX, or a web page in one file. File ▸ Open reads a PDF’s text and Notion or Google Docs exports.',
    ),
    paragraph(
      'View ▸ Present shows each top-level heading as a slide, note callouts as speaker notes, and File ▸ Download as writes it to PowerPoint.',
    ),
    {
      type: 'paragraph',
      content: [
        text('Insert ▸ Form field adds boxes to fill in, like these: '),
        { type: 'formField', attrs: { kind: 'text', name: 'your_name', label: 'Your name' } },
        text(', a tick box '),
        { type: 'formField', attrs: { kind: 'checkbox', name: 'agree', label: 'I agree' } },
        text(' and a drop-down '),
        {
          type: 'formField',
          attrs: {
            kind: 'dropdown',
            name: 'plan',
            label: 'Plan',
            options: JSON.stringify(['Basic', 'Pro', 'Team']),
          },
        },
        text(
          '. File ▸ Download as writes a Fillable PDF form, and Tools ▸ Mail merge makes a copy for each row of a CSV file.',
        ),
      ],
    },
    paragraph(
      'File ▸ Page setup sets the paper, the margins, a header and footer with page numbers, and a watermark. Insert ▸ Section break turns the pages after it. File ▸ Print preview shows the pages as they print.',
    ),
    paragraph(
      'Insert ▸ Margin note, Poll and Map add a sticky note, a vote and a map. Insert ▸ Show only when hides blocks until a template variable says so.',
    ),
    {
      type: 'poll',
      attrs: {
        question: 'Which download do you use most?',
        options: JSON.stringify([
          { label: 'Word', votes: 4 },
          { label: 'PDF', votes: 6 },
          { label: 'Markdown', votes: 2 },
        ]),
      },
    },
    {
      type: 'conditional',
      attrs: { variable: 'edition', equals: 'pro' },
      content: [
        paragraph(
          'This paragraph shows while the edition variable is pro. Tools ▸ Template variables changes it.',
        ),
      ],
    },
    // Floated beside the plain text after it: a bordered block would run under it.
    {
      type: 'marginNote',
      attrs: { color: 'yellow' },
      content: [paragraph('A sticky note sits in the margin, beside the text it is about.')],
    },
    paragraph(
      'Tools ▸ Redact selection blacks out words, and a download, a print or a copy carries only a stand-in. Tools ▸ Lock selected blocks keeps a section as it is.',
    ),
    paragraph(
      'A password-protected document locks itself when left alone, or at once from File ▸ Lock now. It prints under a watermark.',
    ),
    paragraph(
      'File ▸ Sign document signs it, and the status line shows any later change. Tools ▸ Audit log lists who changed what.',
    ),
    paragraph(
      'An app that ships the catalogues gets View ▸ Language: the menus in eight more languages, Arabic right to left. View ▸ Toolbar offers four toolbars.',
    ),
    paragraph(
      'View ▸ Theme imports and exports themes, and saves one with the document. Format ▸ Document fonts saves its fonts too.',
    ),
    paragraph(
      'View ▸ Reduce motion stops animations, and View ▸ Dyslexia-friendly font widens the spacing.',
    ),
    paragraph(
      'Tools ▸ Check writing flags wording that leaves people out, and on request tone and clichés. Its Reading heat map tints hard sentences.',
    ),
    paragraph(
      'Right-click a word for synonyms. Tools ▸ Accessibility check lists missing alt text, skipped headings and vague links.',
    ),
    paragraph(
      'Tools ▸ Writing assistant rewrites or summarises the selection, through whichever provider the app plugs in.',
    ),
    paragraph(
      'Tools ▸ Read aloud reads from the caret, the caret following the voice. Tools ▸ Dictate types what the microphone hears.',
    ),
    paragraph(
      'Insert ▸ Import sources reads BibTeX or CSL, and Insert ▸ Citation style sets APA, MLA, Chicago or IEEE.',
    ),
    paragraph(
      'Insert ▸ Image gallery lays photos out in a grid. Double-click any image to see it full size.',
    ),
    {
      type: 'gallery',
      attrs: { columns: 3 },
      content: [
        galleryImage(
          picture(
            '#fde68a',
            '<circle cx="80" cy="96" r="30" fill="#f97316"/><path d="M0 160 L0 116 Q48 86 96 118 T160 104 L160 160 Z" fill="#65a30d"/>',
          ),
          'A sunrise over green hills',
        ),
        galleryImage(
          picture(
            '#1e3a8a',
            '<circle cx="112" cy="44" r="18" fill="#f8fafc"/><circle cx="120" cy="38" r="16" fill="#1e3a8a"/><rect y="104" width="160" height="56" fill="#0ea5e9"/>',
          ),
          'A crescent moon over a lake',
        ),
        galleryImage(
          picture(
            '#bae6fd',
            '<path d="M40 140 L60 70 L80 140 Z M72 140 L96 52 L120 140 Z M108 140 L126 84 L144 140 Z" fill="#166534"/><rect y="138" width="160" height="22" fill="#4d7c0f"/>',
          ),
          'Three pines on a green slope',
        ),
      ],
    },
    paragraph(
      'Insert ▸ Camera photo, Screenshot and Record audio capture straight into the document. New images ask for their alt text.',
    ),
    paragraph(
      'Paste a link to a post on X, a CodePen, a map or a Spotify track, and it plays in place. Insert ▸ Video chapters lists a video’s chapters.',
    ),
    paragraph(
      'Insert ▸ Drawing opens a whiteboard for a pen, boxes and arrows. Double-click this one to draw on it:',
    ),
    {
      type: 'drawing',
      attrs: {
        data: JSON.stringify({
          width: 640,
          height: 200,
          shapes: [
            { kind: 'rect', color: '#2563eb', width: 3, x1: 40, y1: 60, x2: 200, y2: 140 },
            { kind: 'arrow', color: '#1f2937', width: 3, x1: 210, y1: 100, x2: 420, y2: 100 },
            { kind: 'ellipse', color: '#16a34a', width: 3, x1: 430, y1: 50, x2: 600, y2: 150 },
            {
              kind: 'pen',
              color: '#dc2626',
              width: 3,
              points: [
                [60, 170],
                [110, 185],
                [160, 172],
                [210, 186],
              ],
            },
          ],
        }),
      },
    },

    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Diagrams' }] },
    paragraph(
      'Insert ▸ Graphviz diagram and PlantUML diagram draw those languages beside Mermaid.',
    ),
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
                paragraph('Native <details> elements: the model keeps which ones are open.'),
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
        row([cell('Hall hire, two days'), cost('1,200.00')]),
        row([cell('Catering, 120 guests'), cost('2,640.00')]),
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
            attrs: { header: false, verticalAlign: 'middle', valueType: 'currency' },
            content: [paragraph('780.00')],
          },
        ]),
        row([cell('Banners and programmes'), cost('483.00')]),
        row([cell('Photographer'), cost('600.00')]),
        row([cell('Insurance'), cost('140.00')]),
        row([
          cell('Total'),
          {
            // Table ▸ Formula: Word's =SUM(ABOVE), kept up to date as the costs change.
            type: 'tableCell',
            attrs: { header: false, valueType: 'currency' },
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'tableFormula',
                    attrs: { expression: 'SUM(ABOVE)', format: '#,##0.00', result: '5,843.00' },
                  },
                ],
              },
            ],
          },
        ]),
      ],
    },
    paragraph(
      'Its header row stays at the top of the window while the table scrolls by (Table ▸ Freeze header row). Table ▸ Freeze first column keeps the first column in view as a wide table scrolls sideways. In a print, the header row heads every page the table runs onto. Table ▸ Cell padding and Table ▸ Cell alignment set the room in its cells and where their content sits.',
    ),
    paragraph(
      'The total is a formula: change a cost and it adds up again (Table ▸ Formula). Table ▸ Column type lines numbers, money and dates up on the right.',
    ),
    paragraph(
      'Table ▸ Filter rows hides the rows you do not need without deleting them, and Table ▸ Insert chart draws the table as a chart.',
    ),
    paragraph(
      'Cells merge down a column as well as along a row, from Table ▸ Merge cells. Table ▸ Split cells cuts one into rows or columns:',
    ),
    {
      type: 'table',
      content: [
        row([cell('Day', true), cell('Session', true)]),
        row([
          // One day over two sessions: a cell merged down a column.
          {
            type: 'tableCell',
            attrs: { header: false, rowspan: 2 },
            content: [paragraph('Friday')],
          },
          cell('Rehearsal'),
        ]),
        row([cell('Sound check')]),
        row([cell('Saturday'), cell('Launch')]),
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
