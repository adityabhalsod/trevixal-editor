# Reviewing with tracked changes

Suggesting mode turns edits into reviewable suggestions, the way Word's
suggesting mode does.

## Switching it on

*View > Suggesting mode*. From then on, typing produces colour-coded
**insertions** attributed to you, and deleting **strikes text through**
instead of removing it. Switch it off to edit directly again.

The entry shows a tick while it is on, and the review bar reflects the state
at once wherever it was toggled from. Without that, a bar could read "off"
while every keystroke was being recorded as a suggestion, which is the worst
way for this feature to be wrong.

## The review bar

A bar above the editor steps through the suggestions. Accept or reject each
one, or all at once. Suggestions carry an author and a timestamp, so a
reviewer can order them, and they survive copy and paste.

When more than one person has suggestions pending, a list on the bar picks
whose: choose *By Priya* and the bar's buttons become *Accept Priya's* and
*Reject Priya's*, which settle her suggestions and leave everyone else's, as
Word's *Accept All Changes by This Reviewer* does.

## What is not tracked

Structural edits, such as pressing `Enter` or joining two blocks, are applied
directly while suggesting. The text of a suggestion is tracked; a new
paragraph is not. Splitting a block cannot be expressed as an insertion and
deletion over inline content, and pretending otherwise would produce a
document that accept-all could not reconstruct.

## Comments

Select some text and choose *Insert > Comment...* (`Ctrl+Alt+M`). The thread
appears in the Comments panel (*View > Comments*) beside the document. Reply
in the box under it: type `@` and the first letters of a name to mention
someone, when the app supplies the names. **Resolve** fades a thread and takes
the highlight off its text, and **Reopen** brings it back. **Delete** removes
the thread and its highlight together. A click on a thread's quote selects its
text.

Comments are saved with the document, and a Word download carries them as Word
comments, replies included.

## In your own app

The [track changes extension](../extensions/track-changes) page has the API:
`TrackChanges`, `trackChangesMarks()` for the schema, and
`createTrackChangesBar` for the bar.
