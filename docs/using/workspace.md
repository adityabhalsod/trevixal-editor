# Working with several documents

*View > Documents* opens the workspace panel.

## The document store

A store with folders, six templates (Blank, Meeting notes, Project brief, Blog
post, Weekly report, README), recents, favourites, pinning, duplicate, rename
and search. In the assembled editor the store lives in the browser's local
storage, behind an interface your own app can point at anything: an API,
IndexedDB, or an encrypted wrapper.

## Tabs

Open documents appear as tabs above the editor. The tab strip owns the
autosave into the store, so there is one strip per page.

## Two views of one document

*View > Side-by-side preview* renders the document as a downloaded page would
look, live, in its own frame. *View > Split editor* opens a second editing
surface on the same document; type in either, and both stay on the same
block as you scroll.

Both panes carry the syntax colours, the drawn diagrams and the working tab
strips the editor has, none of which is in the document itself. The
[workspace extension](../extensions/workspace) page explains how, and what
the preview's sandbox does and does not allow.
