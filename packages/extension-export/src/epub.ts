import { type EditorNode, Fragment, serializeToHTML } from '@trevixal/core'
import { escapeXML } from './xml'
import { type ZipEntry, createZip } from './zip'

/**
 * A document as an EPUB 3 book: a chapter for each level-one heading (the
 * whole document one chapter when it has none), a table of contents from
 * the headings, and the pictures it holds as data packed in beside them.
 * The container is the same stored ZIP the Word writer makes, with the
 * `mimetype` first, as EPUB asks.
 */

export interface EPUBOptions {
  readonly title?: string
  readonly author?: string
  /** A BCP 47 language tag; English by default. */
  readonly language?: string
  /** A fixed identifier and date, for output that does not change from run to run. */
  readonly identifier?: string
  readonly modified?: Date
}

const MIME = 'application/epub+zip'

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`

const STYLE = `body { font-family: serif; line-height: 1.5; margin: 0 5%; }
h1, h2, h3 { font-family: sans-serif; line-height: 1.2; }
img { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; font-family: monospace; font-size: 0.9em; }
blockquote { margin: 1em 2em; font-style: italic; }
table { border-collapse: collapse; }
td, th { border: 1px solid #999; padding: 0.2em 0.4em; }
`

/** One chapter: its title, and the blocks that are its text. */
interface Chapter {
  readonly title: string
  readonly blocks: readonly EditorNode[]
}

/** Split at each level-one heading; the text before the first is a chapter of its own. */
function chaptersOf(doc: EditorNode, fallback: string): Chapter[] {
  const chapters: { title: string; blocks: EditorNode[] }[] = []
  for (const block of doc.content.children) {
    const isChapter = block.type.name === 'heading' && Number(block.attrs.level) === 1
    if (isChapter || chapters.length === 0) {
      chapters.push({
        title: isChapter ? block.textContent.trim() || fallback : fallback,
        blocks: [],
      })
    }
    ;(chapters[chapters.length - 1] as { blocks: EditorNode[] }).blocks.push(block)
  }
  return chapters.filter((chapter) => chapter.blocks.length > 0)
}

/** A picture's bytes and type, from a `data:` URL. */
function decodeDataURL(src: string): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src)
  if (!match) return null
  const mime = match[1] as string
  const payload = match[3] as string
  if (match[2]) {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { mime, bytes }
  }
  return { mime, bytes: new TextEncoder().encode(decodeURIComponent(payload)) }
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

/**
 * HTML as XHTML, well formed as EPUB's content documents must be: parsed as
 * HTML and written back as XML, so every void tag closes and every entity
 * is a character.
 */
function toXHTML(html: string, document: Document): string {
  const parsed = new (document.defaultView?.DOMParser ?? DOMParser)().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  )
  const serializer = new (document.defaultView?.XMLSerializer ?? XMLSerializer)()
  return [...parsed.body.childNodes].map((node) => serializer.serializeToString(node)).join('')
}

/** The book as the bytes of an `.epub` file. */
export function serializeToEPUB(
  doc: EditorNode,
  document: Document,
  options: EPUBOptions = {},
): Uint8Array {
  const title = options.title?.trim() || 'Document'
  const language = options.language ?? 'en'
  const identifier =
    options.identifier ?? `urn:uuid:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`
  const modified = (options.modified ?? new Date()).toISOString().replace(/\.\d+Z$/, 'Z')
  const images: ZipEntry[] = []
  const manifest: string[] = []
  const chapters = chaptersOf(doc, title)

  const files = chapters.map((chapter, index) => {
    const name = `chapter-${index + 1}.xhtml`
    const fragment = doc.type.create(doc.attrs, Fragment.from(chapter.blocks))
    let html = serializeToHTML(fragment)
    // Pictures kept as data become files in the book, which readers want.
    html = html.replace(/src="(data:[^"]+)"/g, (whole, src: string) => {
      const decoded = decodeDataURL(src.replace(/&amp;/g, '&'))
      const extension = decoded ? EXTENSIONS[decoded.mime] : undefined
      if (!decoded || !extension) return whole
      const file = `images/image-${images.length + 1}.${extension}`
      images.push({ name: `OEBPS/${file}`, data: decoded.bytes })
      manifest.push(
        `<item id="image-${images.length}" href="${file}" media-type="${decoded.mime}"/>`,
      )
      return `src="${file}"`
    })
    const body = toXHTML(html, document)
    const page = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXML(language)}" lang="${escapeXML(language)}">
<head><meta charset="UTF-8"/><title>${escapeXML(chapter.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>
`
    return { name, title: chapter.title, page }
  })

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXML(language)}" lang="${escapeXML(language)}">
<head><meta charset="UTF-8"/><title>${escapeXML(title)}</title></head>
<body>
<nav epub:type="toc" id="toc"><h1>Contents</h1>
<ol>
${files.map((file) => `<li><a href="${file.name}">${escapeXML(file.title)}</a></li>`).join('\n')}
</ol>
</nav>
</body>
</html>
`
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeXML(language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXML(identifier)}</dc:identifier>
    <dc:title>${escapeXML(title)}</dc:title>
    <dc:language>${escapeXML(language)}</dc:language>
${options.author ? `    <dc:creator>${escapeXML(options.author)}</dc:creator>\n` : ''}    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="style.css" media-type="text/css"/>
${files.map((file, index) => `    <item id="chapter-${index + 1}" href="${file.name}" media-type="application/xhtml+xml"/>`).join('\n')}
${manifest.map((item) => `    ${item}`).join('\n')}
  </manifest>
  <spine>
${files.map((_, index) => `    <itemref idref="chapter-${index + 1}"/>`).join('\n')}
  </spine>
</package>
`
  return createZip([
    // First, and stored: how a reader knows what the file is.
    { name: 'mimetype', data: MIME },
    { name: 'META-INF/container.xml', data: CONTAINER },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/style.css', data: STYLE },
    ...files.map((file) => ({ name: `OEBPS/${file.name}`, data: file.page })),
    ...images,
  ])
}
