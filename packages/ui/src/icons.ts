/**
 * Inline SVG icons for the toolbar and menus.
 *
 * Paths only: no icon font, no sprite sheet, no network request. Every icon
 * inherits `currentColor` so theming needs no icon-specific rules.
 */

const PATHS: Readonly<Record<string, string>> = {
  bold: 'M6 4h5.5a3.5 3.5 0 0 1 0 7H6zm0 7h6a3.5 3.5 0 0 1 0 7H6z',
  italic: 'M10 4h6M8 18h6M13.5 4 10.5 18',
  underline: 'M6 4v6a6 6 0 0 0 12 0V4M5 20h14',
  strikethrough:
    'M5 12h14M8 8a3.5 3.5 0 0 1 3.5-3h1A3.5 3.5 0 0 1 16 8m-9 8a3.5 3.5 0 0 0 3.5 3h1a3.5 3.5 0 0 0 3.5-3',
  code: 'm9 8-5 4 5 4m6-8 5 4-5 4',
  // The numeral is a full 2, a top arc, the diagonal down, and a bar along
  // the foot. Without that last bar the arc and the diagonal read as a
  // question mark, which is what these drew before.
  subscript:
    'm4 5 8 10M12 5 4 15M15.4 14.3c.3-1.1 1.3-1.8 2.5-1.8s2.4.9 2.4 2.1c0 2-2.6 3-4.9 5.1h5',
  superscript:
    'm4 8 8 10M12 8 4 18M15.4 6.2c.3-1.1 1.3-1.8 2.5-1.8s2.4.9 2.4 2.1c0 2-2.6 3-4.9 5.1h5',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5',
  unlink:
    'M9 15 5 19M15 9l4-4M10 13a5 5 0 0 0 6.5.5M13.5 7.5A5 5 0 0 1 20 10m-16 4a5 5 0 0 1 3-4.5M4 4l16 16',
  bulletList: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  // Two numerals, not three. Three have to share the column an inch at a
  // time and each lands about two units wide, which at 18px is a smear. The
  // same reason `listStyleDecimal` below carries one numeral rather than a
  // row of them. A 1 against the first rule and a 2 against the last are far
  // enough apart to stay separate glyphs, and say "ordered" between them.
  orderedList:
    'M10 6h11M10 12h11M10 18h11M3.6 4.6 5 3.9v4.8M3.3 8.7h3.6M3.2 15.3c0-.9.8-1.5 1.7-1.5s1.7.6 1.7 1.5c0 1.2-3.4 2-3.4 3.6h3.8',
  // Three levels stepping in, a marker dot and a rule each: the nesting is
  // the point, and numerals at this size would smear as `orderedList` notes.
  multilevelList: 'M7 6h14M10 12h11M13 18h8M3.5 6h.01M6.5 12h.01M9.5 18h.01',
  alignLeft: 'M3 6h18M3 12h11M3 18h15',
  alignCenter: 'M3 6h18M6 12h12M5 18h14',
  alignRight: 'M3 6h18M10 12h11M8 18h13',
  alignJustify: 'M3 6h18M3 12h18M3 18h18',
  indent: 'M3 6h18M11 12h10M3 18h18M3 10l3 2-3 2z',
  outdent: 'M3 6h18M11 12h10M3 18h18M6 10l-3 2 3 2z',
  undo: 'M4 9h11a5 5 0 0 1 0 10h-3M4 9l4-4M4 9l4 4',
  redo: 'M20 9H9a5 5 0 0 0 0 10h3M20 9l-4-4M20 9l-4 4',
  quote:
    'M7 15c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3c0 3-1 5-4 6m11-3c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3c0 3-1 5-4 6',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
  // Code languages. Simple marks rather than brand logos: legible at 18px,
  // and no trademark questions. `codeLanguage` is the fallback.
  codeLanguage: 'M9 8l-4 4 4 4M15 8l4 4-4 4',
  langPlain: 'M5 6h14M5 12h14M5 18h9',
  // JS/TS: the letters, drawn as strokes.
  langJavascript: 'M13 5v9a3 3 0 0 1-5 2M20 7a3 3 0 0 0-5 2c0 3 5 2 5 5a3 3 0 0 1-5 2',
  langTypescript: 'M4 6h8M8 6v12M14 8h6M17 8v10',
  // Python: two closed interlocking tabs, the two-snake silhouette. Each is
  // a full closed path, so neither reads as a stray stroke at 18px.
  langPython:
    'M11.5 2.5h-3a2.5 2.5 0 0 0-2.5 2.5v2.5h6v1.5H4.5A2.5 2.5 0 0 0 2 11.5v2A2.5 2.5 0 0 0 4.5 16H6v-2.5A2.5 2.5 0 0 1 8.5 11h5A2.5 2.5 0 0 0 16 8.5V5a2.5 2.5 0 0 0-2.5-2.5zM9 5.2h.01M12.5 21.5h3a2.5 2.5 0 0 0 2.5-2.5v-2.5h-6v-1.5h7.5A2.5 2.5 0 0 0 22 12.5v-2A2.5 2.5 0 0 0 19.5 8H18v2.5A2.5 2.5 0 0 1 15.5 13h-5A2.5 2.5 0 0 0 8 15.5V19a2.5 2.5 0 0 0 2.5 2.5zM15 18.8h.01',
  // HTML: angle brackets around a slash.
  langHtml: 'M8 7l-4 5 4 5M16 7l4 5-4 5M13 5l-2 14',
  // CSS: a rule, braces around two declaration lines. What CSS source
  // looks like, rather than a paint drop that could mean any colour control.
  langCss: 'M9 4H5v16h4M15 4h4v16h-4M9 10h6M9 14h3',
  // JSON: braces.
  langJson:
    'M9 4a3 3 0 0 0-3 3v2a3 3 0 0 1-3 3 3 3 0 0 1 3 3v2a3 3 0 0 0 3 3M15 4a3 3 0 0 1 3 3v2a3 3 0 0 0 3 3 3 3 0 0 0-3 3v2a3 3 0 0 1-3 3',
  // SQL: a database cylinder.
  langSql:
    'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  // Shell: a prompt caret and cursor.
  langShell: 'M4 5h16v14H4zM8 10l2 2-2 2M13 14h4',
  // Go: the letters, which no other language here could be mistaken for.
  // A "G" with its crossbar, then an "O".
  langGo:
    'M10 9.5A3.5 3.5 0 1 0 6.5 16h.5a3.5 3.5 0 0 0 3.5-3.5H8M17 8.5a3.5 3.5 0 0 1 3.5 3.5v.5a3.5 3.5 0 0 1-7 0V12a3.5 3.5 0 0 1 3.5-3.5z',
  // Rust: its gear mark. A notched ring with a large hub. Eight chunky
  // teeth rather than many fine ones: at 18px fine teeth blur into a sun.
  langRust:
    'M10.4 2.4h3.2l.5 2.3 2.1.9 1.9-1.4 2.3 2.3-1.4 1.9.9 2.1 2.3.5v3.2l-2.3.5-.9 2.1 1.4 1.9-2.3 2.3-1.9-1.4-2.1.9-.5 2.3h-3.2l-.5-2.3-2.1-.9-1.9 1.4-2.3-2.3 1.4-1.9-.9-2.1-2.3-.5v-3.2l2.3-.5.9-2.1-1.4-1.9 2.3-2.3 1.9 1.42.1-.9zM12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z',
  // Java: a steaming cup.
  langJava:
    'M5 10h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 11h2a2 2 0 0 1 0 4h-2M9 3c0 1.5 1.5 1.5 1.5 3M13 3c0 1.5 1.5 1.5 1.5 3',
  // Markdown: the enclosing box with the arrow.
  langMarkdown: 'M3 6h18v12H3zM6 15V9l3 3 3-3v6M17 9v5M15 12l2 2 2-2',
  // Table operations. Each draws the grid plus a marker for what changes, so
  // "row above" and "row below" are distinguishable at menu size.
  tableRowAbove: 'M4 10h16M4 15h16M4 20h16M9 15v5M15 15v5M12 2v6M9 5l3-3 3 3',
  tableRowBelow: 'M4 4h16M4 9h16M9 4v5M15 4v5M12 22v-6M9 19l3 3 3-3',
  tableRowDelete: 'M4 6h16M4 18h16M4 6v12M20 6v12M9 9l6 6M15 9l-6 6',
  tableColumnLeft: 'M10 4v16M15 4v16M20 4v16M10 4h10M10 20h10M2 12h6M5 9l-3 3 3 3',
  tableColumnRight: 'M4 4v16M9 4v16M4 4h5M4 20h5M22 12h-6M19 9l3 3-3 3',
  tableColumnDelete: 'M6 4h12M6 20h12M6 4v16M18 4v16M9 9l6 6M15 9l-6 6',
  tableMerge: 'M4 5h16v14H4zM4 12h7M13 12h7M9 9l3 3-3 3M15 15l-3-3 3-3',
  tableSplit: 'M4 5h16v14H4zM12 5v14M9 9l3 3-3 3M15 9l-3 3 3 3',
  tableHeaderRow: 'M4 5h16v14H4zM4 10h16M9 10v9M15 10v9',
  tableDelete: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M8 8l8 8M16 8l-8 8',
  lineBreak: 'M20 6v6a2 2 0 0 1-2 2H5M9 10l-4 4 4 4',
  selectAll:
    'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 8h8v8H8z',
  // Counting, as a tally of five. Deliberately not letters: this used to draw
  // an A beside an I, which read as the word 'AI'.
  wordCount: 'M6.5 5v14M10.5 5v14M14.5 5v14M4.5 19 18 5',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14',
  horizontalRule: 'M3 12h18',
  // A brush: slim handle, wider ferrule, flared bristles.
  // A brush drawn as three strokes (handle, ferrule, bristles) so
  // the parts stay distinct instead of merging into one shape.
  // A brush seen head-on: thin handle, wider ferrule band, and a
  // head that tapers to the tip. The width contrast is what makes
  // it read as a brush rather than a pen at 18px.
  // A brush seen head-on: thin handle, a ferrule band almost three
  // times its width, and a head tapering to the tip. That width
  // contrast is what separates a brush from a pen at 18px.
  formatPainter: 'M10 2.5h4V9h-4zM6.6 9h10.8v4H6.6zM7.6 13h8.8l-1 6.2a3.4 3.4 0 0 1-6.8 0z',
  removeFormat: 'M6 5h12M9 5 8 19M14 5l-1 14M4 5l16 14',
  textColor: 'M6 17 12 4l6 13M8.5 13h7M4 21h16',
  backgroundColor: 'M4 21h16M8 3l8 8-5 5-8-8zM11 6l6 6',
  specialChar: 'M8 20h8m-4-4V9a4 4 0 1 0-4 4M12 16v4',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5',
  paste: 'M9 4h6v3H9zM7 5H5v15h14V5h-2',
  help: 'M12 18h.01M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7v.5',
  chevronDown: 'm6 9 6 6 6-6',
  check: 'm5 12 5 5 9-11',
  print: 'M7 8V3h10v5M7 18H4v-7h16v7h-3M8 14h8v7H8z',
  save: 'M5 4h11l3 3v13H5zM8 4v6h7V4M8 20v-6h8v6',
  cut: 'M7 4v9m10-9v9M6 20a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm12 0a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM8 16.5 17 6M16 16.5 7 6',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  // ---- lists & tasks --------------------------------------------------------
  // A ticked box beside two rules: the checkbox is the whole story, so it gets
  // the space, and the text rules just say "list".
  taskList: 'M3 6.5h3.5v3.5H3zM4 8.2l1 1 1.6-1.8M10 8h11M10 16h11M3 14h3.5v3.5H3z',
  // Bullet styles: three stacked rules say "list"; the oversized marker on
  // the first row alone says which bullet. A marker beside one full-width
  // rule averages into a single stroke at 18px.
  listStyleDisc: 'M10 6.5h11M10 12h11M10 17.5h11M3.6 6.5a2.4 2.4 0 1 0 4.8 0 2.4 2.4 0 0 0-4.8 0z',
  listStyleCircle: 'M10 6.5h11M10 12h11M10 17.5h11M3.6 6.5a2.4 2.4 0 1 0 4.8 0 2.4 2.4 0 0 0-4.8 0',
  listStyleSquare: 'M10 6.5h11M10 12h11M10 17.5h11M3.4 4.4h4.6v4.2H3.4z',
  // Numbered styles: the marker glyph fills the left column at full row
  // height. A small numeral beside three rules is unreadable at 18px.
  listStyleDecimal: 'M11 7h10M11 12h10M11 17h10M4.5 5.5h2v6M3.5 11.5h4',
  // Alphabetic: a capital A, which survives 18px where a lowercase "a" with
  // its bowl and stem does not.
  listStyleAlpha: 'M11 7h10M11 12h10M11 17h10M2.6 12 5.5 5l2.9 7M3.6 9.9h3.8',
  // Roman: three stems with serifs. Bare stems read as nothing; the serifs
  // are what make it "III" rather than a picket fence.
  listStyleRoman: 'M11 7h10M11 12h10M11 17h10M3 6h5M3 12h5M5.5 6v6',
  // Numbering: an arrow returning to a 1 restarts; an arrow leaving it continues.
  restartNumbering: 'M6 5.5h1.5v5M4.5 10.5h4M20 8h-7a3 3 0 0 0 0 6h5m-2-3 2 3-2 3',
  continueNumbering: 'M6 5.5h1.5v5M4.5 10.5h4M13 11h7m-3-3 3 3-3 3',

  // ---- advanced formatting --------------------------------------------------
  // Small caps: a tall A beside a small one. The effect shown, not described.
  smallCaps: 'M3 18 7.5 6l4.5 12M4.6 14h5.8M14.5 18l3-8 3 8M15.7 15.4h3.6',
  // Letter spacing: two glyph stems with a double arrow measuring the gap
  // between them, over a baseline.
  letterSpacing: 'M5 5v10M19 5v10M9.5 10h5M9.5 10l2 2M9.5 10l2-2M14.5 10l-2 2M14.5 10l-2-2M4 19h16',
  // Line height: stacked rules with a double arrow spanning them.
  lineHeight: 'M9 6h12M9 12h12M9 18h12M4 6v12M4 6l-1.6 2M4 6l1.6 2M4 18l-1.6-2M4 18l1.6-2',
  // Paragraph spacing: two text blocks pushed apart by arrows.
  paragraphSpacing: 'M4 4h16M4 7.5h11M12 12h1M4 20h16M4 16.5h11',
  // Case conversion, drawn as two big letterforms. The same approach that
  // makes `smallCaps` legible at 18px. Two letters fit at that size; three,
  // or a letter plus an arrow, do not.
  // UPPERCASE: two capitals.
  caseUpper: 'M2 18 6.5 6 11 18M3.2 14.2h6.6M13 18l4.5-12L22 18M14.2 14.2h6.6',
  // lowercase: two bowls with no ascenders. The missing tall strokes are
  // what read as "lowercase".
  caseLower:
    'M4 13.5a3 3 0 1 1 6 0V18M10 15.4H6.4a2.3 2.3 0 0 0 0 4.6H10M14 13.5a3 3 0 1 1 6 0V18M20 15.4h-3.6a2.3 2.3 0 0 0 0 4.6H20',
  // Title Case: a capital followed by a lowercase bowl.
  caseTitle:
    'M2 18 6.5 6 11 18M3.2 14.2h6.6M14 13.5a3 3 0 1 1 6 0V18M20 15.4h-3.6a2.3 2.3 0 0 0 0 4.6H20',

  // ---- advanced blocks ------------------------------------------------------
  // Callout: a panel with an accent bar down its left edge, which is exactly
  // how callouts render, plus a dot to mark the icon slot.
  callout: 'M4 5.5h16v13H4zM7.5 5.5v13M11 10h6M11 14h4',
  // The five variants: the same panel, differentiated by its glyph. At 18px a
  // glyph swap reads far better than a colour swap alone.
  calloutInfo: 'M4 5.5h16v13H4zM12 11v4M12 8.6h.01',
  calloutSuccess: 'M4 5.5h16v13H4zM8.5 12.2l2.5 2.5L15.5 10',
  calloutWarning: 'M12 6.5 21 19H3zM12 11v3.5M12 16.6h.01',
  calloutDanger: 'M12 5.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M9.5 9.5l5 5M14.5 9.5l-5 5',
  calloutNote: 'M4 5.5h16v13H4zM8 10h8M8 13.5h5',
  // Toggle: a filled disclosure triangle beside its summary rule, with the
  // hidden body implied below. A bare chevron reads as "indent".
  toggleBlock: 'M4.5 7.5l4.5 3.2-4.5 3.2zM12 8h9M12 13h9M14 18h7',
  // Columns: a frame divided vertically. The divider count is the icon.
  columns: 'M4 5.5h16v13H4zM12 5.5v13',
  columns2: 'M4 5.5h16v13H4zM12 5.5v13',
  columns3: 'M4 5.5h16v13H4zM9.3 5.5v13M14.6 5.5v13',
  columns4: 'M4 5.5h16v13H4zM8 5.5v13M12 5.5v13M16 5.5v13',
  // Card: a rounded panel with a header band.
  card: 'M4 5.5h16v13H4zM4 10h16M7.5 14h6',
  // Timeline: the rail with nodes on it, one connected shape.
  timeline:
    'M7 4v16M7 8.5h11M7 15.5h8M4.8 8.5a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 0 0-4.4 0M4.8 15.5a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 0 0-4.4 0',
  // Page break: content above and below a dashed break line with end caps.
  pageBreak: 'M6 4h12M6 7.5h12M3 12h3M9 12h6M18 12h3M6 16.5h12M6 20h12',
  // Badge: a pill with a tick inside. An empty pill collapses to a dash at
  // 18px; the interior mark is what keeps it a badge.
  badge: 'M6.5 7.5h11a4.5 4.5 0 0 1 0 9h-11a4.5 4.5 0 0 1 0-9zM9.2 12.2l2 2 3.6-4',
  // Button: a pill with a cursor arrow on it, pressable, not just a label.
  buttonBlock: 'M4 8h16v8H4zM12.5 12.5l2 4 1-1.7 1.9.4z',
  // Footnote: a page with a rule near the foot and a superscript tick.
  footnote: 'M5 4h14v16H5zM8 17h8M15.5 7.5V10M14.3 8.7h2.4M8 8h4',
  // Anchor: the nautical anchor, ring, shank, crossbar, flukes.
  anchor:
    'M12 6.8V20M9.8 5.7a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 0 0-4.4 0M8 10h8M4.5 14a7.5 7.5 0 0 0 15 0',

  // ---- structure & navigation -----------------------------------------------
  // Table of contents: headings with leader dots to page numbers.
  tableOfContents: 'M4 6h9M17 6h3M4 11h11M18 11h2M4 16h8M16 16h4M4 20h11M18 20h2',
  // Outline: a nested tree, drawn with the elbows that make hierarchy obvious.
  outline: 'M4 5.5h16M7 10h13M7 14.5h13M4 5.5v9M7 10H4M4 10v4.5',
  // Command palette: a search field over a list of results.
  commandPalette: 'M4 4.5h16v15H4zM4 9h16M6.5 6.8h.01M7 12.5h10M7 16h6',
  // Focus mode: one lit line between dimmed ones, brackets frame the focus.
  focusMode: 'M4 6h4M16 6h4M4 18h4M16 18h4M4 12h16M4 6v2M20 6v2M4 18v-2M20 18v-2',
  // Fullscreen exit: arrows pulling inward, the mirror of `fullscreen`.
  fullscreenExit: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  // Editor width: a text column with width handles on both sides.
  editorWidth: 'M3 5v14M21 5v14M7 8h10M7 12h10M7 16h6',

  // ---- developer tools ------------------------------------------------------
  // Copy code: the copy pair, with angle brackets marking it as code.
  copyCode: 'M9 9h11v11H9zM5 15H4V4h11v1M12.5 13l-1.5 1.5 1.5 1.5M16.5 13l1.5 1.5-1.5 1.5',
  // Format JSON: braces around aligned rules, pretty-printed structure.
  formatJson:
    'M8 4.5a3 3 0 0 0-3 3v2.5a2 2 0 0 1-2 2 2 2 0 0 1 2 2V17a3 3 0 0 0 3 3M16 4.5a3 3 0 0 1 3 3V10a2 2 0 0 0 2 2 2 2 0 0 0-2 2v2.5a3 3 0 0 1-3 3M10 9h5M10 12h4M10 15h5',
  // Format XML: angle brackets around the same aligned rules.
  formatXml: 'M8 8l-4 4 4 4M16 8l4 4-4 4M11 9.5h4M11 14.5h3',
  // Minify: chevrons closing in on a shortened line, content squeezed
  // together. Plain arrows between two walls read as "resize" instead.
  minify: 'M4 6h16M4 18h16M3.5 9.5l3 2.5-3 2.5M20.5 9.5l-3 2.5 3 2.5M9 12h6',
  // Markdown mode: the M-with-arrow of the markdown mark, simplified.
  markdownMode: 'M3 6.5h18v11H3zM6 15V9l3 3.5L12 9v6M16 9v4.5M16 15l-2-2M16 15l2-2',
  // HTML mode: a tag pair with a slash, source, not rendered output.
  htmlMode: 'M8.5 7 4 12l4.5 5M15.5 7 20 12l-4.5 5M13.5 6.5l-3 11',

  // ---- links ----------------------------------------------------------------
  // Open in new tab: a frame with an arrow leaving it.
  linkNewTab: 'M13 5H5v14h14v-8M14 4h6v6M20 4l-8 8',
  // Email link: an envelope. Its flap is what makes it read instantly.
  linkEmail: 'M3 6.5h18v11H3zM3 7l9 6.5L21 7',
  // Edit link: a chain link with a pencil over it.
  linkEdit: 'M10 14a4 4 0 0 1 0-5.5l2-2a4 4 0 0 1 5.5 5.5M4 20l1-3.5 8-8 2.5 2.5-8 8z',
  // Suggestion mode: a pencil over the line it is writing on. Previously the
  // menu entry borrowed the tick, which read as "already on" whether it was
  // or not. The one icon a toggle must never wear.
  suggesting: 'M3 21h18M5 17.5l1-3.5 9-9 2.5 2.5-9 9z',

  // Auto-link: a chain link with the sparkle used elsewhere for automatic.
  autoLink:
    'M9 14a4.5 4.5 0 0 1 0-6l1.5-1.5a4.5 4.5 0 0 1 6 6M6 19l-1.5 1.5M19 6.5l1.5-1.5M18 11l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',

  // ---- table extras ---------------------------------------------------------
  // Cell background: a grid with one cell filled in by hatching.
  cellBackground: 'M4 5.5h16v13H4zM4 12h16M12 5.5v13M13 13.5l5.5 5.5M16 13.5l4 4M13 16.5l2.5 2.5',
  // Cell alignment: a cell with its content pushed to one edge.
  cellAlign: 'M4 5.5h16v13H4zM7 9h10M7 12h6',
  // Table sort: a grid beside the A-Z arrow that means sort everywhere.
  tableSort: 'M4 5.5h9v13H4zM4 12h9M17 6v12M17 18l-2-2.5M17 18l2-2.5M20.5 6h-3.5',
  // Table borders: a grid whose outer edge is emphasized over its inner rules.
  tableBorders: 'M4 5.5h16v13H4zM9 8v8M15 8v8M7 12h10',
  // CSV import/export: a spreadsheet with an arrow in or out.
  csvImport: 'M5 4.5h14v15H5zM5 9h14M10 4.5v15M12 12.5v5M12 17.5l-2-2M12 17.5l2-2',
  csvExport: 'M5 4.5h14v15H5zM5 9h14M10 4.5v15M12 17.5v-5M12 12.5l-2 2M12 12.5l2 2',
  // Text to table: lines becoming a grid.
  convertTextTable: 'M3 5h7M3 9h7M3 13h5M13 4.5h8v15h-8zM13 11.5h8M17 4.5v15',
  // Resize columns: a divider with arrows either side of it.
  resizeColumns: 'M12 4v16M6 12h3M9 12l-2-2M9 12l-2 2M18 12h-3M15 12l2-2M15 12l2 2M4 5.5h16v13H4z',
  // ---- table move & resize ---------------------------------------------------
  // Moving a row: the grid with an arrow along the axis it travels. The arrow
  // is oversized because it is the whole message at 18px.
  tableMoveRowUp: 'M4 9.5h16M4 14.5h16M4 5.5h16v13H4zM12 16.5v-5M12 11.5l-2 2M12 11.5l2 2',
  tableMoveRowDown: 'M4 9.5h16M4 14.5h16M4 5.5h16v13H4zM12 7.5v5M12 12.5l-2-2M12 12.5l2-2',
  // Moving a column: the moving column is filled, and the arrow sits
  // outside the grid where nothing can merge with it. An arrow between two
  // inner dividers reads as neither at menu size.
  tableMoveColumnLeft: 'M13 5.5h7v13h-7zM9 8.5v7M9 15.5l-2.6-3.5L9 8.5M4 5.5v13',
  tableMoveColumnRight: 'M4 5.5h7v13H4zM15 8.5v7M15 15.5l2.6-3.5L15 8.5M20 5.5v13',
  // Swapping cells: two boxes and ONE double-headed arrow between them.
  // Two counter-arrows need vertical room this grid does not have once
  // the boxes are placed. Their heads fuse into a blob at 18px.
  tableSwapCell:
    'M2.5 7h6v10h-6zM15.5 7h6v10h-6M10.5 12h3M10.5 12l2-2M10.5 12l2 2M13.5 12l-2-2M13.5 12l-2 2',
  // The same, rotated.
  tableSwapCellVertical:
    'M7 2.5h10v6H7zM7 15.5h10v6H7M12 10.5v3M12 10.5l-2 2M12 10.5l2 2M12 13.5l-2-2M12 13.5l2-2',
  // Distribute evenly: equal columns with measure marks between them.
  tableDistribute: 'M4 5.5h16v13H4zM9.3 5.5v13M14.6 5.5v13M6.6 12h.01M12 12h.01M17.3 12h.01',
  // ---- toolbar ---------------------------------------------------------------
  // A grip: two columns of three dots, the handle a toolbar group is dragged by.
  grip: 'M9.5 6h.01M9.5 12h.01M9.5 18h.01M14.5 6h.01M14.5 12h.01M14.5 18h.01',
  // Sliders: what 'customize' looks like everywhere, two tracks, two handles.
  sliders: 'M4 8h16M4 16h16M10 5v6M15 13v6',
  // ---- files -----------------------------------------------------------------
  // A blank sheet with a folded corner.
  fileNew: 'M6.5 3h7.5l4 4v14h-11.5zM14 3v4h4',
  // An open folder.
  folderOpen: 'M3 19V6h5.5l2 2H18v3M3 19h15.5l2.5-8H5.5z',
  // An arrow into a tray: download, whatever the format.
  download: 'M12 3.5v10M8 10.5l4 4 4-4M4 19.5h16',
  // A sheet marked with a W, for a Word document.
  fileWord: 'M6.5 3h7.5l4 4v14h-11.5zM14 3v4h4M9 12.5l1.2 5 1.3-3.6 1.3 3.6 1.2-5',
  // A sheet with styled lines, for rich text.
  fileRich: 'M6.5 3h7.5l4 4v14h-11.5zM14 3v4h4M9 13h6M9 16.5h4',
  // ---- security ---------------------------------------------------------------
  lock: 'M6 11h12v9.5H6zM9 11V8a3 3 0 0 1 6 0v3M12 14.5v2.5',
  key: 'M15 4.5a4.5 4.5 0 1 0-3.6 7.2L4 19.1V21h3v-2h2v-2h1.9l.5-.5A4.5 4.5 0 0 0 15 4.5zM16 8.5h.01',
  shield: 'M12 3.2 20 6v6.2c0 4-3.4 7.4-8 8.9-4.6-1.5-8-4.9-8-8.9V6z',
  // ---- writing tools ---------------------------------------------------------
  // Bar chart, for document statistics.
  statistics: 'M4 20h16M7 20v-6M12 20V8M17 20v-9',
  // A target, for a writing goal.
  target:
    'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM12 12h.01',
  // ---- help ------------------------------------------------------------------
  // A keyboard: the outline, a row of keys and a space bar.
  keyboard: 'M3 6.5h18v11H3zM6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8',
  // An i in a circle, distinct from the question mark that `help` already draws.
  info: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 8h.01M11 11.5h1V17h1',
  // ---- themes ----------------------------------------------------------------
  // Each preset gets its own mark: eight entries sharing one glyph is a list
  // the eye cannot use.
  themeLight:
    'M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  themeDark: 'M20 14.7A8.5 8.5 0 0 1 9.3 4 8.5 8.5 0 1 0 20 14.7z',
  // A monitor: the system decides, so the mark is the machine.
  themeSystem: 'M3 5h18v11H3zM9 20h6M12 16v4',
  // A drop of ink, for the paper-and-ink preset.
  themeSepia: 'M12 3.5s5.5 6 5.5 9.6a5.5 5.5 0 0 1-11 0C6.5 9.5 12 3.5 12 3.5z',
  // A snowflake, for the cold palette.
  themeNord: 'M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2',
  // A sun low over the horizon.
  themeSolarized:
    'M12 9a3.5 3.5 0 1 1 0 7M12 9a3.5 3.5 0 1 0 0 7M4 19h16M12 3v2M5 6l1.4 1.4M19 6l-1.4 1.4',
  // A disc split down the middle: the most contrast two halves can carry.
  themeContrast: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 3v18M12 5a7 7 0 0 1 0 14z',
  // A moon with stars, for the darkest preset.
  themeMidnight: 'M20 15A8 8 0 0 1 9 4a8.5 8.5 0 1 0 11 11zM5 5.5h.01M7.5 3h.01M4 9h.01',
  // An artist's palette, for a theme the user mixes themselves.
  palette:
    'M12 3.2a8.8 8.8 0 0 0 0 17.6c1.1 0 1.6-.8 1.6-1.6 0-1.3 1-2.3 2.3-2.3h1.3a3 3 0 0 0 3-3c0-5-3.7-10.7-8.2-10.7zM7.6 10.2h.01M10.4 7.2h.01M14.4 7.6h.01',
  // A glyph plus a plus sign: add a typeface.
  fontAdd: 'M3.5 17 8 6l4.5 11M5.4 13.5h5.2M15.5 14.5h6M18.5 11.5v6',
}

export type IconName = keyof typeof PATHS | (string & {})

/** Every icon name the kit ships, for consumers building custom toolbars. */
export function iconNames(): readonly string[] {
  return Object.keys(PATHS)
}

/**
 * Build an SVG element for `name`. Unknown names render nothing so a custom
 * item can supply a text label instead.
 */
export function createIcon(document: Document, name: IconName): SVGElement | null {
  const path = PATHS[name]
  if (!path) return null
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '18')
  svg.setAttribute('height', '18')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.7')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  element.setAttribute('d', path)
  svg.appendChild(element)
  return svg
}
