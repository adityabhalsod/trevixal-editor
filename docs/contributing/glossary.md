# Glossary

| Term | Meaning |
| --- | --- |
| **WYSIWYG** | "What You See Is What You Get": formatting is visible while you type, instead of writing markup |
| **Headless** | The engine without any visual part. It manages the document data and can run on a server |
| **Schema** | The rulebook for a document: which building blocks exist (paragraph, heading, table) and how they may nest |
| **Node / Mark** | A node is a piece of content (a paragraph, an image); a mark is styling applied to text (bold, a link) |
| **Transaction / Step** | Every change is a small, reversible instruction (a step) bundled into a transaction. This is what makes undo reliable |
| **Decoration** | A purely visual overlay (a search highlight, a syntax colour, a grammar mark) that is displayed but never saved |
| **Extension** | An optional add-on package (tables, images, diagrams) that plugs into the editor through its public hooks |
| **Sanitizing** | Cleaning pasted or imported HTML so hidden scripts and dangerous links are removed before they reach the page |
| **IME** | Input Method Editor: how Japanese, Chinese, Korean and other scripts compose characters; handled with a dedicated composition state machine |
| **Snapshot** | A reference-stable summary of the editor's state (active marks, block type, can undo) that toolbars subscribe to |
| **Suggesting mode** | Edits become attributed suggestions to accept or reject, instead of direct changes |
| **Envelope** | The encrypted container a protected document is saved as (`.tvx`) |
| **Token (design)** | A named CSS custom property (`--tvx-color-accent`) every colour and size is expressed through |
| **Dispatch transform** | A function that rewrites a transaction before it applies; suggesting mode is one |
| **Input rule** | A typing shortcut that fires when the last character is typed, such as `# ` for a heading |
| **Position** | `{ path, offset }`: a trail of child indexes to a block, then an inline offset within it |
