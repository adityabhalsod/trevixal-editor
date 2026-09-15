# @trevixal/extension-diagram

Diagrams drawn from the code block that defines them, through any renderer you
like.

```sh
npm install @trevixal/extension-diagram
```

## Usage

```ts
import { diagram, createMermaidRenderer, loadMermaid, insertDiagram } from '@trevixal/extension-diagram'

const controller = diagram(editor, {
  render: createMermaidRenderer(await loadMermaid()),
  languages: ['mermaid'],
  debounceMs: 300,
})

editor.exec(insertDiagram()) // a code block seeded with `graph TD …`
```

`loadMermaid()` imports mermaid from jsDelivr on first use, so a document with
no diagram in it never pays for the library.

## Any renderer

```ts
type DiagramRenderer = (code: string, context: DiagramRenderContext) => Promise<string>
```

Return SVG markup. Anything that turns text into a picture fits (Graphviz,
PlantUML through a service, or something of your own) and `languages` decides
which code-block languages get a preview.

## The preview is not in the document

It is an element the view appends under the block, which keeps the document a
plain code block: copy, paste, Markdown export and the word count all see the
source, exactly as typed. That also means every serializer is blind to it,
which is why `@trevixal/ui` captures the drawn SVG separately for exports and
rasterises it for Word and RTF.

## The plate is light in every theme

A renderer draws in a palette of its own, Mermaid's is dark ink on nothing at
all, and no token here reaches inside it. So the plate under the drawing
stays light whatever the page theme is. On a dark theme the alternative is
near-black on near-black, which is what it used to be.

## License

Apache-2.0
