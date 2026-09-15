import {
  Component,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core'
import { type FullEditor, mountFullEditor } from '@trevixal/editor-kit'

/**
 * The whole editor, mounted from Angular's lifecycle.
 *
 * `afterNextRender` rather than a constructor or `ngOnInit`: the mount reaches
 * for `window` and `document` immediately, and `afterNextRender` is the one
 * hook Angular guarantees never runs on the server. It also runs outside
 * change detection, which is the point. Nothing the editor does afterwards
 * passes through Angular at all.
 */
@Component({
  selector: 'app-full-editor',
  standalone: true,
  template: '<div #host data-testid="full-editor"></div>',
})
export class FullEditorComponent {
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host')
  private editor: FullEditor | null = null

  constructor() {
    afterNextRender(() => {
      this.editor = mountFullEditor({
        element: this.host().nativeElement,
        namespace: 'trevixal:angular',
        aboutRows: [
          { term: 'Framework', description: 'Angular 22, zoneless, mounted after render' },
        ],
      })
    })
    inject(DestroyRef).onDestroy(() => {
      this.editor?.destroy()
      this.editor = null
    })
  }
}
