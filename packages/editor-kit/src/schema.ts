import { Schema, defaultMarks, defaultNodes } from '@trevixal/core'
import {
  type MapNodeOptions,
  advancedBlockNodes,
  blockNodes,
  referenceMarks,
} from '@trevixal/extension-blocks'
import { commentMarks } from '@trevixal/extension-comments'
import { embedNodes } from '@trevixal/extension-embed'
import { formFieldNodes } from '@trevixal/extension-forms'
import { imageNodes } from '@trevixal/extension-image'
import { mathNodes } from '@trevixal/extension-math'
import { lockedSectionNodes, redactionMarks } from '@trevixal/extension-security'
import { formulaNodes, tableNodes } from '@trevixal/extension-table'
import { trackChangesMarks } from '@trevixal/extension-track-changes'
import { transclusionNodes, wikiLinkNodes } from '@trevixal/extension-workspace'

/**
 * The schema `mountFullEditor` builds on, on its own.
 *
 * It lives apart from the mount because a schema is not browser work: a server
 * that stores or renders a document this editor produced needs exactly these
 * nodes to read it back, and has no DOM to mount into. Both callers take it
 * from here so there is one definition of what a kit document may contain.
 */
export function createFullSchema(maps: MapNodeOptions = {}): Schema {
  return new Schema({
    nodes: {
      ...defaultNodes(),
      ...tableNodes(),
      ...formulaNodes(),
      ...imageNodes(),
      ...blockNodes(),
      // A margin note, a poll, a map (on the tiles the host names), and
      // content shown only when a template variable is set.
      ...advancedBlockNodes(maps),
      ...embedNodes(),
      ...mathNodes(),
      ...wikiLinkNodes(),
      ...transclusionNodes(),
      // Blocks no edit can change until they are unlocked.
      ...lockedSectionNodes(),
      // Fields to fill in: text, tick box, drop-down, date, signature.
      ...formFieldNodes(),
    },
    // Suggestion marks come from track changes, so an edit made while
    // "Suggesting" is on lands as a reviewable insertion rather than as text;
    // the index mark files words for Insert ▸ Index; redaction blacks words
    // out, and they leave the editor as a stand-in.
    marks: {
      ...defaultMarks(),
      ...trackChangesMarks(),
      ...referenceMarks(),
      ...redactionMarks(),
      // Comment threads: the mark names the thread its text is under.
      ...commentMarks(),
    },
  })
}
