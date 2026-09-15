// CDN entry: loading this script defines <trevixal-editor> immediately.
import { FormatPainter, describeFormat } from '@trevixal/core'
import { TrevixalEditorElement, defineTrevixalEditor } from './element'

defineTrevixalEditor()

// A no-build page has no imports, so the pieces it needs to drive an editor
// are re-exported here. The IIFE assigns these to a global.
export { defineTrevixalEditor, describeFormat, FormatPainter, TrevixalEditorElement }
