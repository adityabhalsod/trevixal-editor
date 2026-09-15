import { type Signal, signal } from '@angular/core'
import {
  type Editor,
  type EditorOptions,
  type EditorSnapshot,
  EditorView,
  type EditorViewOptions,
  createEditor,
} from '@trevixal/core'

/**
 * Angular bindings for the Trevixal editor.
 *
 * There is no `@Component`, `@Directive` or `@Injectable` here, and that is
 * deliberate. A package that ships those has to be built by Angular's own
 * compiler into partial-Ivy output, which is a second toolchain for the sake
 * of a few dozen lines of glue, and a hand-rolled imitation of that output
 * would be worse than none, which is why this adapter was deferred for so
 * long ([ADR-0007](../../docs/adr/0007-adapter-contract.md)).
 *
 * What the glue actually needs from Angular is `signal`, which is an ordinary
 * function. So this ships ordinary functions: your component owns the
 * decorators, and nothing here needs compiling beyond TypeScript.
 *
 * It is zoneless by construction. The snapshot is a signal, so a change
 * notifies exactly the templates that read it, no `NgZone`, no
 * `markForCheck`, and no re-render of anything else while somebody types.
 */

export interface AngularEditorOptions extends EditorOptions {
  /** Options for the view, applied when {@link AngularEditor.attach} is called. */
  readonly view?: EditorViewOptions
}

export interface AngularEditor {
  /** The engine. Everything in `@trevixal/core` is reachable through it. */
  readonly editor: Editor
  /**
   * Toolbar state as a signal: active marks, block type, `canUndo` and the
   * rest. Reading it in a template subscribes that template and nothing else.
   */
  readonly snapshot: Signal<EditorSnapshot | null>
  /**
   * Mount the editing surface into a host element, typically a `viewChild`
   * in `ngAfterViewInit`, or an `afterNextRender` callback.
   *
   * Returns a disposer. Calling `attach` again replaces the view, so a host
   * that re-renders its container does not end up with two.
   */
  attach(host: HTMLElement, options?: EditorViewOptions): () => void
  /** Destroy the view and the editor. Wire it to `DestroyRef`. */
  destroy(): void
}

/**
 * A signal that tracks an editor's snapshot.
 *
 * `Editor.subscribe` is the same `useSyncExternalStore` contract React, Vue
 * and Svelte all sit on, and the snapshot it hands back is reference-stable,
 * so the signal changes when the *state a toolbar shows* changes, and not on
 * every keystroke.
 *
 * Returns the signal and an unsubscribe; use {@link createAngularEditor} if
 * you want the lifecycle handled for you.
 */
export function editorSnapshotSignal(editor: Editor): {
  readonly snapshot: Signal<EditorSnapshot | null>
  readonly unsubscribe: () => void
} {
  const current = signal<EditorSnapshot | null>(editor.isDestroyed ? null : editor.getSnapshot())
  const unsubscribe = editor.subscribe(() => {
    if (!editor.isDestroyed) current.set(editor.getSnapshot())
  })
  return { snapshot: current.asReadonly(), unsubscribe }
}

/**
 * Create an editor with its snapshot signal and view lifecycle.
 *
 * ```ts
 * @Component({
 *   standalone: true,
 *   template: `
 *     <button [attr.aria-pressed]="isBold()" (mousedown)="$event.preventDefault()"
 *             (click)="editor.commands.toggleMark('bold')">Bold</button>
 *     <div #host></div>
 *   `,
 * })
 * export class EditorComponent {
 *   private readonly host = viewChild.required<ElementRef<HTMLElement>>('host')
 *   private readonly binding = createAngularEditor({ schema })
 *   readonly editor = this.binding.editor
 *   readonly isBold = computed(() => this.binding.snapshot()?.activeMarks.includes('bold') ?? false)
 *
 *   constructor() {
 *     afterNextRender(() => this.binding.attach(this.host().nativeElement))
 *     inject(DestroyRef).onDestroy(() => this.binding.destroy())
 *   }
 * }
 * ```
 *
 * Creating the editor touches no DOM, the view is built only by `attach`,
 * so this is safe to construct during server rendering.
 */
export function createAngularEditor(options: AngularEditorOptions): AngularEditor {
  // `element` is dropped: the view belongs to `attach`, so that constructing
  // the binding stays DOM-free and a component can do it in a field
  // initialiser, before its template exists.
  const { view, element: _element, ...editorOptions } = options
  const editor = createEditor(editorOptions)
  const { snapshot, unsubscribe } = editorSnapshotSignal(editor)
  let current: EditorView | null = null

  const detach = (): void => {
    current?.destroy()
    current = null
  }

  return {
    editor,
    snapshot,
    attach(host, viewOptions) {
      detach()
      current = new EditorView(editor, host, { ...view, ...viewOptions })
      return detach
    },
    destroy() {
      detach()
      unsubscribe()
      editor.destroy()
    },
  }
}
