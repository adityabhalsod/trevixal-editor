---
layout: home

hero:
  name: Trevixal
  text: A rich-text editor engine
  tagline: Written from scratch. No ProseMirror, no Lexical, no Slate, and no runtime dependencies in anything it ships.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Try the full editor
      link: /full-editor
    - theme: alt
      text: Using the editor
      link: /using/
    - theme: alt
      text: Concepts
      link: /concepts/state

features:
  - title: The document is data
    details: Every document is schema-validated JSON you can store, diff and transform. The editor on screen is one view of it; a Word file, a web page or a PDF are others.
  - title: Every change is invertible
    details: Edits are ordered lists of small, self-inverting steps. Undo falls out of step inversion rather than a second bookkeeping system, and every step remaps positions so selections and decorations survive.
  - title: Safe by construction
    details: Imported HTML is parsed inside an inert template through an allowlist, with a protocol allowlist on every URL. Scripts cannot run during parsing, and an XSS corpus holds it to that.
  - title: Typing does not re-render your app
    details: The editor's DOM lives outside your framework's reconciliation, and toolbars subscribe to a snapshot that keeps its identity while nothing they draw has changed. Ten keystrokes cost two renders, not ten.
  - title: Exports look like the editor did
    details: A download carries the theme you wrote in, the colours of your code and the diagrams it drew, verified by rendering the real .docx, .rtf and PDF files, not by reading the markup.
  - title: Five ways in
    details: React, Vue, Svelte and Angular adapters, a web component that runs from one script tag, and a headless core that works in Node with no DOM at all.
---
