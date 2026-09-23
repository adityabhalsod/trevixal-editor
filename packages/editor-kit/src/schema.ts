import { Schema, defaultMarks, defaultNodes } from '@trevixal/core'
import { blockNodes, referenceMarks } from '@trevixal/extension-blocks'
import { embedNodes } from '@trevixal/extension-embed'
import { imageNodes } from '@trevixal/extension-image'
import { mathNodes } from '@trevixal/extension-math'
import { tableNodes } from '@trevixal/extension-table'
import { trackChangesMarks } from '@trevixal/extension-track-changes'

/**
 * The schema `mountFullEditor` builds on, on its own.
 *
 * It lives apart from the mount because a schema is not browser work: a server
 * that stores or renders a document this editor produced needs exactly these
 * nodes to read it back, and has no DOM to mount into. Both callers take it
 * from here so there is one definition of what a kit document may contain.
 */
export function createFullSchema(): Schema {
  return new Schema({
    nodes: {
      ...defaultNodes(),
      ...tableNodes(),
      ...imageNodes(),
      ...blockNodes(),
      ...embedNodes(),
      ...mathNodes(),
    },
    // Suggestion marks come from track changes, so an edit made while
    // "Suggesting" is on lands as a reviewable insertion rather than as text;
    // the index mark files words for Insert ▸ Index.
    marks: { ...defaultMarks(), ...trackChangesMarks(), ...referenceMarks() },
  })
}
