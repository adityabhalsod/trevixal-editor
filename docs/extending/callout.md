# Write a callout extension

A callout is a box with a tone (info, warning, danger) holding blocks of its
own. It is the smallest extension that exercises everything: a node type, an
attribute, commands, a keymap, HTML in both directions, and a menu entry.

About eighty lines, end to end. The finished version ships as part of
[`@trevixal/extension-blocks`](https://www.npmjs.com/package/@trevixal/extension-blocks).

## 1. The node type

```ts
import type { NodeSpec } from '@trevixal/core'

const VARIANTS = ['info', 'success', 'warning', 'danger', 'note'] as const
export type CalloutVariant = (typeof VARIANTS)[number]

/** Anything else becomes `info`: an attribute arrives from parsed HTML. */
export function calloutVariant(value: unknown): CalloutVariant {
  return VARIANTS.includes(value as CalloutVariant) ? (value as CalloutVariant) : 'info'
}

export function calloutNodes(): Record<string, NodeSpec> {
  return {
    callout: {
      group: 'block',
      content: 'block+',
      attrs: { variant: { default: 'info' } },

      toHTML: (node) => {
        const variant = calloutVariant(node.attrs.variant)
        return {
          tag: 'div',
          attrs: {
            class: `my-callout my-callout--${variant}`,
            'data-variant': variant,
          },
        }
      },

      parseHTML: [
        {
          tag: 'div',
          attribute: 'data-variant',
          getAttrs: (element) => {
            // `false` drops the element *and its subtree*. Say no to markup
            // that merely happens to carry a `data-variant`.
            if (!(element.getAttribute('class') ?? '').includes('my-callout')) return false
            return { variant: calloutVariant(element.getAttribute('data-variant')) }
          },
        },
      ],
    },
  }
}
```

Two things worth pausing on.

**`content: 'block+'`** makes this a container, not a textblock. A callout
holds paragraphs, lists, even another callout. `'inline*'` would have made it
hold text directly, like a paragraph.

**`calloutVariant` runs on the way in as well as out.** The attribute reaches
you from parsed HTML, which means it reaches you from a paste, which means it
reaches you from a page you have never seen. Never interpolate one into markup
or a class name without deciding what the legal values are.

## 2. Commands

```ts
import { type Command, Fragment, TextSelection, pos } from '@trevixal/core'

export function insertCallout(variant: CalloutVariant = 'info'): Command {
  return (state) => {
    const paragraph = state.schema.firstTextblockType().create()
    const callout = state.schema
      .nodeType('callout')
      .create({ variant: calloutVariant(variant) }, Fragment.of(paragraph))

    const path = state.selection.from.path
    const index = (path[0] ?? 0) + 1
    const tr = state.tr.step(replaceNodeAt([index], Fragment.of(callout)))
    // Put the caret inside it: an empty box the user has to click into is a
    // worse outcome than no box.
    tr.setSelection(new TextSelection(pos([index, 0], 0)))
    return tr
  }
}

export function setCalloutVariant(variant: CalloutVariant): Command {
  return (state) => {
    const found = findAncestor(state.doc, state.selection.from.path, 'callout')
    // `null` means "not applicable here", which is what disables a toolbar
    // button without a second predicate saying the same thing again.
    if (!found) return null
    return state.tr.step(
      new SetNodeAttrsStep(found.path, { ...found.node.attrs, variant: calloutVariant(variant) }),
    )
  }
}
```

A command is `(state) => Transaction | null`. Returning `null` is not an
error: it is how a command says it does not apply, and it is what lets
commands chain.

## 3. Getting out again

A container at the end of a document traps the caret: every `Enter` makes
another paragraph *inside* it, and there is no way out with the keyboard.

```ts
import { type Keymap } from '@trevixal/core'

export const escapeCalloutOnEnter: Command = (state) => {
  const block = nodeAtPath(state.doc, state.selection.from.path)
  // Only an empty trailing paragraph is the gesture, Enter in written text
  // must still split the paragraph.
  if (!block?.isTextblock || block.textContent.length > 0) return null
  const callout = findAncestor(state.doc, state.selection.from.path, 'callout')
  if (!callout) return null
  return liftOutOf(state, callout)
}

export function calloutKeymap(): Keymap {
  return { Enter: (editor) => editor.exec(escapeCalloutOnEnter) }
}
```

Every container block needs this, and it is the thing most often forgotten.
Try your extension by putting it at the very end of a document and pressing
Enter twice.

## 4. Styling

```css
.my-callout {
  padding: var(--tvx-space-3);
  border-left: 3px solid var(--tvx-color-tone-info-accent);
  background: var(--tvx-color-tone-info-bg);
  border-radius: var(--tvx-radius-sm);
}

.my-callout--warning {
  border-left-color: var(--tvx-color-tone-warning-accent);
  background: var(--tvx-color-tone-warning-bg);
}
```

Use the `--tvx-*` tokens and your callout follows every theme, including ones
a host invents at runtime. Two rules the kit holds itself to are worth
borrowing:

- **Never fill a control with a *border* colour.** A high-contrast palette may
  make it the same ink as the text, and the control swallows its own label.
- **Never put a `var()` in a shorthand a longhand then overrides.** The pair
  cannot be read back out of the CSSOM, so the declaration vanishes from every
  exported page, while looking perfect in the browser.

## 5. Wiring it up

```ts
const editor = createEditor({
  schema: new Schema({
    nodes: { ...defaultNodes(), ...calloutNodes() },
    marks: defaultMarks(),
  }),
  element,
  keymap: calloutKeymap(),
})

createEditorUI(editor, {
  container,
  blockCommands: { insertCallout, setCalloutVariant },
})
```

## 6. What to test

Four things, in this order:

1. **Round-trip.** `parseHTML(schema, serializeToHTML(doc))` equals the
   document you started with. If it does not, copy and paste loses data.
2. **Hostile attributes.** `<div class="my-callout" data-variant="'><script>">`
   produces an `info` callout and nothing else.
3. **The escape gesture.** Enter on an empty trailing paragraph leaves; Enter
   in written text still splits.
4. **Reachability.** The menu entry exists *and runs*. The browser suite
   opens every menu and clicks every entry, because a command with no way to
   reach it is not a feature.

## Next

- [Extension points](../concepts/extension-points): the other three hooks
- [Decorations](../concepts/decorations), for things you draw but do not store
