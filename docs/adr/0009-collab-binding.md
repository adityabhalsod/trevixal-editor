# ADR-0009: Collab binding, character-level text CRDT, block-granular structure

**Status:** Superseded, 2026-09-12. Collaboration was removed from the
product (Trevixal is a single-user editor); `@trevixal/extension-collab` and
everything described below no longer ship. Kept as the record of why the
binding was built the way it was.

## Context

Real-time collaboration needs convergence under concurrent edits, remote
cursors, and per-user undo. Yjs is the allowed dependency (peer of
`@trevixal/extension-collab` only). A full per-node CRDT mapping (à la
y-prosemirror) is more machinery than v0 needs.

## Decision

**Document shape in Y:** one `Y.XmlFragment`; every node is a
`Y.XmlElement(typeName)` with its attrs JSON-encoded in one attribute;
textblocks hold a single `Y.XmlText` whose formatting attributes encode
marks and whose embeds encode inline atoms.

**Local → Y:** each local transaction is mirrored by diffing the before/after
documents (structural sharing makes reference-equality prefix/suffix cheap).
Textblock edits become character-level `Y.XmlText` insert/delete ops, the
common concurrent case (two people typing in one paragraph) merges per
character. Structural changes replace the affected Y subtrees, so two users
restructuring the *same* container concurrently resolve coarsely (one
subtree wins) but always converge.

**Y → model:** on a remote transaction the doc is rebuilt from Y and applied
as the smallest top-level replace; a single changed textblock becomes an
inline diff step so local carets map precisely through remote typing. Remote
transactions carry `ADD_TO_HISTORY: false` and `COLLAB_REMOTE_META`.

**Undo:** per-user via `Y.UndoManager` tracking only this binding's origin;
`collabKeymap(binding)` rebinds Mod-Z/Y. Core history stays untouched for
non-collab editors.

**Awareness:** `createAwareness()` returns a `LocalAwareness`, a minimal,
dependency-free per-client state store, structurally compatible with
`y-protocols/awareness` so that library is not a dependency. It is the side
channel `createBroadcastChannelProvider` rides on (peer discovery, heartbeats,
departure); the editor renders nothing from it. The editor deliberately shows
nothing about other people, no remote carets, no online roster, so no
presence payload is published or read back.

## Consequences

- Convergence is delegated to Yjs; both peers rebuild from the same Y state.
- Undo/redo of one user never reverts another user's text (verified by unit
  and browser tests).
- Rowspan-style refinements deferred: relative-position comment anchors under
  collab, sub-block structural merging, and a y-websocket demo server.
