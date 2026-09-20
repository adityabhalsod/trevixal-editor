# @trevixal/angular

[![CI](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adityabhalsod/trevixal-editor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@trevixal/angular.svg)](https://www.npmjs.com/package/@trevixal/angular)
[![types](https://img.shields.io/npm/types/@trevixal/angular.svg)](https://www.npmjs.com/package/@trevixal/angular)
[![license](https://img.shields.io/npm/l/@trevixal/angular.svg)](https://github.com/adityabhalsod/trevixal-editor/blob/main/LICENSE)

[Documentation](https://trevixal-editor.vercel.app) · [Live editor](https://trevixal-editor.vercel.app/full-editor) · [Changelog](https://github.com/adityabhalsod/trevixal-editor/blob/main/packages/angular/CHANGELOG.md) · [Issues](https://github.com/adityabhalsod/trevixal-editor/issues)

[![The Trevixal editor](https://trevixal-editor.vercel.app/media/editor.png)](https://trevixal-editor.vercel.app/full-editor)

## Features

- A signal-backed snapshot and a view lifecycle tied to the component
- No Angular compiler required: it is a plain library, not a schematic
- **0.3 kB** minified and gzipped, with TypeScript types in the package

Angular bindings for the [Trevixal editor](https://github.com/adityabhalsod/trevixal-editor/blob/main/README.md): a signal-backed
snapshot and the view lifecycle, with **no Angular compiler required**.

```sh
npm install @trevixal/core @trevixal/angular
```

## Usage

```ts
import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, viewChild } from '@angular/core'
import { Schema, defaultMarks, defaultNodes } from '@trevixal/core'
import { createAngularEditor } from '@trevixal/angular'

const schema = new Schema({ nodes: defaultNodes(), marks: defaultMarks() })

@Component({
  selector: 'app-editor',
  standalone: true,
  template: `
    <button
      [attr.aria-pressed]="isBold()"
      (mousedown)="$event.preventDefault()"
      (click)="editor.commands.toggleMark('bold')"
    >Bold</button>

    <div class="trevixal" #host></div>
  `,
})
export class EditorComponent {
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host')
  private readonly binding = createAngularEditor({ schema })

  readonly editor = this.binding.editor
  readonly isBold = computed(() => this.binding.snapshot()?.activeMarks.includes('bold') ?? false)

  constructor() {
    afterNextRender(() => this.binding.attach(this.host().nativeElement))
    inject(DestroyRef).onDestroy(() => this.binding.destroy())
  }
}
```

`mousedown` is cancelled rather than handled on `click`: the toolbar must not
take the selection the command is about to act on.

## No compiler, and why that matters

There is no `@Component`, `@Directive` or `@Injectable` in this package. A
package that ships those has to be built by Angular's own compiler into
partial-Ivy output, a second toolchain for a few dozen lines of glue, and a
hand-rolled imitation of that output would be worse than shipping nothing.
That is why this adapter was deferred for a long time
([ADR-0007](https://github.com/adityabhalsod/trevixal-editor/blob/main/docs/adr/0007-adapter-contract.md)).

What the glue actually needs from Angular is `signal`, which is an ordinary
function. So this ships ordinary functions. Your component owns the
decorators; nothing here needs compiling beyond TypeScript, and the package
builds with the same `tsup` pipeline as every other one in the repository.

## Zoneless by construction

The snapshot is a signal, so a change notifies exactly the templates that read
it. No `NgZone`, no `markForCheck`, and nothing else re-renders while somebody
types.

It goes further than that: the snapshot keeps its identity while nothing a
toolbar would draw differently has changed, so ten keystrokes produce **one**
signal change, the first, which flips `canUndo`, rather than ten.

## Server rendering

`createAngularEditor` touches no DOM. The view is built only by `attach`, so a
component can construct the binding in a field initialiser, before its
template exists and on a server that has no document at all.

## Exports

| Export | What it does |
| --- | --- |
| `createAngularEditor(options)` | The editor, its snapshot signal, `attach(host)` and `destroy()` |
| `editorSnapshotSignal(editor)` | Just the signal, for an editor you already have |
| `AngularEditor`, `AngularEditorOptions` | The types |

`attach` returns a disposer, and calling it again replaces the view rather
than stacking a second one, so a host that re-renders its container does not
end up with two editors on one document.

## License

Apache-2.0
