/**
 * Starter documents. Templates are plain JSON using only the core default
 * node and mark names, so they load into any schema built on `defaultNodes()`
 * / `defaultMarks()`. An extension schema with more types is a superset.
 */

import { type DocJSON, EditorNode, type Schema, nodeFromJSON, normalizeDoc } from '@trevixal/core'
import { deriveTitle } from './store'

export interface DocumentTemplate {
  readonly id: string
  readonly name: string
  readonly description: string
  /** A glyph for menus (an emoji or a single character). */
  readonly icon?: string
  readonly doc: DocJSON
}

/** One empty paragraph: what a new document opens with. */
export const BLANK_DOCUMENT: DocJSON = { type: 'doc', content: [{ type: 'paragraph' }] }

type Inline = DocJSON

function text(value: string, ...marks: string[]): Inline {
  return marks.length > 0
    ? { type: 'text', text: value, marks: marks.map((type) => ({ type })) }
    : { type: 'text', text: value }
}

function paragraph(...content: (string | Inline)[]): DocJSON {
  const inline = content.map((part) => (typeof part === 'string' ? text(part) : part))
  return inline.length > 0 ? { type: 'paragraph', content: inline } : { type: 'paragraph' }
}

function heading(level: number, value: string): DocJSON {
  return { type: 'heading', attrs: { level }, content: [text(value)] }
}

function bullets(items: readonly string[]): DocJSON {
  return {
    type: 'bulletList',
    content: items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
  }
}

function numbered(items: readonly string[]): DocJSON {
  return {
    type: 'orderedList',
    content: items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
  }
}

function tasks(items: readonly string[]): DocJSON {
  return {
    type: 'taskList',
    content: items.map((item) => ({
      type: 'taskItem',
      attrs: { checked: false },
      content: [paragraph(item)],
    })),
  }
}

function quote(value: string): DocJSON {
  return { type: 'blockquote', content: [paragraph(text(value, 'italic'))] }
}

function code(language: string, value: string): DocJSON {
  return { type: 'codeBlock', attrs: { language }, content: [text(value)] }
}

/** The built-in templates, blank first. */
export function defaultTemplates(): readonly DocumentTemplate[] {
  return [
    {
      id: 'blank',
      name: 'Blank',
      description: 'An empty page.',
      icon: '📄',
      doc: BLANK_DOCUMENT,
    },
    {
      id: 'meeting-notes',
      name: 'Meeting notes',
      description: 'Attendees, agenda, decisions and action items.',
      icon: '🗓️',
      doc: {
        type: 'doc',
        content: [
          heading(1, 'Meeting notes'),
          paragraph(text('Date: ', 'bold'), 'YYYY-MM-DD'),
          paragraph(text('Attendees: ', 'bold'), 'Names'),
          heading(2, 'Agenda'),
          numbered(['Topic one', 'Topic two']),
          heading(2, 'Discussion'),
          paragraph('Notes.'),
          heading(2, 'Decisions'),
          bullets(['Decision']),
          heading(2, 'Action items'),
          tasks(['Owner: task, due date']),
        ],
      },
    },
    {
      id: 'project-brief',
      name: 'Project brief',
      description: 'Goals, scope, timeline and risks on one page.',
      icon: '🧭',
      doc: {
        type: 'doc',
        content: [
          heading(1, 'Project brief'),
          paragraph(text('Owner: ', 'bold'), 'Name · ', text('Status: ', 'bold'), 'Draft'),
          heading(2, 'Summary'),
          paragraph('What this project is and why it matters, in two sentences.'),
          heading(2, 'Goals'),
          bullets(['Goal one', 'Goal two']),
          heading(2, 'Scope'),
          paragraph(text('In: ', 'bold'), 'What is included.'),
          paragraph(text('Out: ', 'bold'), 'What is deliberately excluded.'),
          heading(2, 'Timeline'),
          numbered(['Kick-off', 'Milestone', 'Launch']),
          heading(2, 'Risks'),
          bullets(['Risk: mitigation']),
        ],
      },
    },
    {
      id: 'blog-post',
      name: 'Blog post',
      description: 'Title, hook, body sections and a closing call to action.',
      icon: '✍️',
      doc: {
        type: 'doc',
        content: [
          heading(1, 'Post title'),
          paragraph(text('A one-line hook that tells the reader why to keep going.', 'italic')),
          heading(2, 'Introduction'),
          paragraph('Set the scene.'),
          heading(2, 'The main idea'),
          paragraph('Develop it.'),
          quote('A pull quote worth remembering.'),
          heading(2, 'Conclusion'),
          paragraph('Wrap up and say what to do next.'),
        ],
      },
    },
    {
      id: 'weekly-report',
      name: 'Weekly report',
      description: 'Highlights, progress, blockers and next week.',
      icon: '📈',
      doc: {
        type: 'doc',
        content: [
          heading(1, 'Weekly report'),
          paragraph(text('Week of ', 'bold'), 'YYYY-MM-DD'),
          heading(2, 'Highlights'),
          bullets(['Highlight']),
          heading(2, 'Progress'),
          tasks(['Done this week']),
          heading(2, 'Blockers'),
          bullets(['None']),
          heading(2, 'Next week'),
          bullets(['Plan']),
        ],
      },
    },
    {
      id: 'readme',
      name: 'README',
      description: 'Install, usage and contributing sections for a project.',
      icon: '📘',
      doc: {
        type: 'doc',
        content: [
          heading(1, 'Project name'),
          paragraph('One paragraph on what the project does.'),
          heading(2, 'Installation'),
          code('bash', 'npm install project-name'),
          heading(2, 'Usage'),
          code('ts', "import { thing } from 'project-name'\n\nthing()"),
          heading(2, 'Contributing'),
          paragraph(
            'Open an issue before a large change; small fixes can go straight to a pull request.',
          ),
          heading(2, 'License'),
          paragraph('MIT'),
        ],
      },
    },
  ]
}

/** A template's body as a normalized document node for the given schema. */
export function templateToDoc(template: DocumentTemplate, schema: Schema): EditorNode {
  return normalizeDoc(nodeFromJSON(schema, template.doc))
}

/**
 * The display title of a document: its first heading, else the first sixty
 * characters of text, else "Untitled".
 */
export function documentTitleFrom(doc: DocJSON | EditorNode, untitled = 'Untitled'): string {
  return deriveTitle(doc instanceof EditorNode ? doc.toJSON() : doc, untitled)
}
