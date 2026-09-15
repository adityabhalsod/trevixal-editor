# Track changes

`@trevixal/extension-track-changes`: suggestion mode. Edits become
attributed, timestamped marks to accept or reject, instead of changes to the
document.

```sh
npm install @trevixal/extension-track-changes
```

## Setting up

```ts
import { TrackChanges, trackChangesMarks, createTrackChangesBar } from '@trevixal/extension-track-changes'

const schema = new Schema({ nodes: defaultNodes(), marks: { ...defaultMarks(), ...trackChangesMarks() } })
const track = new TrackChanges(editor, { author: 'ada' })
track.enable()

// Typing  -> <ins data-trevixal-author="ada" data-trevixal-timestamp="...">
// Deleting -> the text stays, wrapped in <del ...>

track.suggestions()   // [{ path, from, to, kind, author, timestamp }]
track.acceptAll()
track.rejectAll()
track.acceptAt(position)
track.rejectAt(position)
track.disable()

createTrackChangesBar(editor, track, { container: reviewHost, author: 'You' })
```

Switching modes changes no document, so it raises no transaction, and
anything watching the editor alone never hears about it. `track.onEnabledChange(fn)`
does. The review bar subscribes to it, so a toggle anywhere (a View menu, a
shortcut, a button of your own) is reflected at once:

```ts
const off = track.onEnabledChange((enabled) => setIndicator(enabled))
```

## How it works, and why that matters

Suggestion mode is a **dispatch transform**: it rewrites each transaction
before it applies, turning a deletion into a strike and an insertion into an
attributed run. Every other command in the editor keeps working unchanged.
Nothing had to learn about suggestions, because nothing sees them.

It also means history metadata set by the source transaction survives the
rewrite, so an input rule that fires in suggestion mode still undoes as one
step.

## Suggestions carry a time

Each mark records an author and a timestamp, so a reviewer can order them and
a document can show who suggested what, when. The attributes round-trip
through `parseHTML`, so a suggestion survives copy and paste.

## Known limit

Structural edits (pressing `Enter`, joining blocks) are not tracked while
suggesting. The text of a suggestion is; a new paragraph is applied directly.
Splitting a block is not expressible as an insertion and deletion over inline
content, and pretending otherwise would produce a document that accept-all
could not reconstruct.
