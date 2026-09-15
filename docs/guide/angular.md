# Angular

```sh
npm install @trevixal/core @trevixal/angular
```

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

## No decorators in the package

There is no `@Component`, `@Directive` or `@Injectable` in
`@trevixal/angular`, and that is deliberate. A package shipping those must be
built by Angular's own compiler into partial-Ivy output, a second toolchain
for a few dozen lines of glue.

What the glue needs from Angular is `signal`, which is an ordinary function.
So the package exports ordinary functions and **your** component owns the
decorators. Nothing here needs compiling beyond TypeScript.

## Zoneless

The snapshot is a signal, so a change notifies exactly the templates that read
it, no `NgZone`, no `markForCheck`. And because the snapshot keeps its
identity while nothing a toolbar draws has changed, ten keystrokes produce one
signal change rather than ten.

```ts
bootstrapApplication(AppComponent, {
  providers: [provideExperimentalZonelessChangeDetection()],
})
```

## Server rendering

`createAngularEditor` touches no DOM, the view is built only by `attach`, so
a component can construct the binding in a field initialiser, before its
template exists and on a server with no document at all.
