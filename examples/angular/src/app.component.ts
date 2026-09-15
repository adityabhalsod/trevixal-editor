import { Component } from '@angular/core'
import { FullEditorComponent } from './full-editor.component'

/**
 * The whole application.
 *
 * There is nothing else here on purpose: the editor is a package, and mounting
 * it is four lines in `full-editor.component.ts`. What Angular contributes is
 * the lifecycle hook that says when those four lines may run. See that file
 * for why it has to be `afterNextRender` and not a constructor.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FullEditorComponent],
  template: '<app-full-editor />',
})
export class AppComponent {}
