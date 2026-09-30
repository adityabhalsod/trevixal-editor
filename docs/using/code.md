# Code, diagrams and equations

## Code blocks

Put the caret in a code block and a bar appears over its top right: the
language, the block's options, Copy, and Run for code that runs.

*Code block options* holds:

| Option | Does |
| --- | --- |
| Line numbers | Numbers every line in a gutter |
| Wrap long lines | Wraps them at the edge instead of scrolling sideways |
| Fold long block | Shows eight lines and a *Show all* bar that unfolds the rest |
| Highlight lines... | Bands the lines you name, as `1, 3-5` |
| Title or file name... | Writes a title, `src/app.ts`, above the code |

The options belong to the block, so they are saved with the document and go
out in Markdown as the fence's meta: ```` ```ts title="app.ts" {1,3-5} showLineNumbers ````.

## Terminal sessions, diffs and code to run

*Insert > Code* adds:

- **Terminal session.** A dark block for commands after a `$` prompt and what
  they printed. Copying it copies only the commands, without the prompts, so
  a paste into a shell runs them.
- **Diff of two versions...** Paste the code before and after a change. The
  block shows the lines removed in red and the lines added in green.
- **JavaScript to run** and **HTML to run.** Press *Run* on the bar.
  JavaScript's console output is listed under the block; HTML is drawn
  there. The code runs in a sealed frame that cannot reach the page, its
  cookies or the network. Change the code and the old output goes.

## Diagrams

*Insert > Diagram* is Mermaid. *Graphviz diagram* draws DOT, and *PlantUML
diagram* draws PlantUML through a PlantUML server. The diagram is drawn
under its source as you type.

## Equations

*Insert > Equation...* and *Display equation...* open the equation dialog:
the LaTeX, a palette that writes it for you, and a preview. A structure from
the palette puts the caret in its first box, so a fraction is typed top
first. Double-click an equation in the document to edit it the same way.

A display equation can be numbered: tick *Number this equation*. It shows
"(1)" at the right, the numbers run through the document with the equation
captions, and *Insert > Cross-reference...* offers them.

Chemistry is written as `\ce{...}`: `\ce{2H2 + O2 -> 2H2O}` sets the
symbols upright, the counts lowered and the arrow between.

## Keys from other editors

*Tools > Key bindings* swaps the editor's keys for Emacs's or Vim's.

- **Emacs.** `Ctrl+F`, `B`, `N` and `P` move; `Ctrl+A` and `E` go to the
  ends of the line; `Ctrl+K` kills to the end of the line and `Ctrl+Y` yanks
  it back; `Ctrl+Space` sets the mark and `Ctrl+W` kills to it.
- **Vim.** The editor starts in normal mode, shown under the editor: `h`,
  `j`, `k` and `l` move, `w`, `b` and `e` move by words, `x` and `dd`
  delete, `yy` and `p` copy and put, `u` undoes. `i`, `a` or `o` start
  typing, and `Escape` stops. `v` selects.

The menus reach every command whichever keys are on, and *Standard* puts
the editor's own keys back.

## Front matter and MDX

*File > Front matter...* edits the YAML a Markdown file keeps above its
text, between two `---` lines. Opening a Markdown file keeps it, and
Markdown and MDX downloads write it back. *Download as > MDX (.mdx)* writes
the document as MDX: its `import` and `export` lines and its components go
out as they came in, and an MDX file opened here keeps each of them in a
block of its own.
