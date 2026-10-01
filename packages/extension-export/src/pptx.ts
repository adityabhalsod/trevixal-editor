import type { EditorNode, TextNode } from '@trevixal/core'
import { type Slide, documentSlides } from './slides'
import { escapeXML } from './xml'
import { type ZipEntry, createZip } from './zip'

/**
 * A document as a PowerPoint deck (`.pptx`): a slide for each top-level
 * heading, its title from the heading and its body from the blocks under
 * it, lists as bullets at their depth, and note callouts as the speaker's
 * notes. One master, one "Title and Content" layout, one theme: the parts
 * PowerPoint needs and no more.
 */

export interface PPTXOptions {
  readonly title?: string
  /** A fixed time, for output that does not change from run to run. */
  readonly modified?: Date
}

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const PML = 'application/vnd.openxmlformats-officedocument.presentationml'
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const NAMESPACES = `xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"`

/** 16:9, in EMU. */
const SLIDE_WIDTH = 12192000
const SLIDE_HEIGHT = 6858000
/** The deepest bullet level PowerPoint styles. */
const MAX_LEVEL = 8
const CODE_FONT = 'Consolas'

/** A run of text with the formatting a slide keeps: bold, italic, underline, code. */
function run(node: TextNode): string {
  const has = (name: string): boolean => node.marks.some((mark) => mark.type.name === name)
  const attrs = [
    'lang="en-US"',
    has('bold') ? 'b="1"' : '',
    has('italic') ? 'i="1"' : '',
    has('underline') ? 'u="sng"' : '',
    has('strikethrough') ? 'strike="sngStrike"' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const font = has('code') ? `<a:latin typeface="${CODE_FONT}"/>` : ''
  return `<a:r><a:rPr ${attrs} dirty="0">${font}</a:rPr><a:t>${escapeXML(node.text)}</a:t></a:r>`
}

/** A textblock's runs; anything inline but text reads as its text. */
function runs(block: EditorNode): string {
  return block.content.children
    .map((child) =>
      child.isText
        ? run(child as TextNode)
        : child.textContent
          ? `<a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escapeXML(child.textContent)}</a:t></a:r>`
          : '',
    )
    .join('')
}

/** One paragraph of a slide's body: bulleted at a level, or plain. */
function paragraph(content: string, level: number | null, bold = false): string {
  const pPr =
    level === null
      ? '<a:pPr marL="0" indent="0"><a:buNone/></a:pPr>'
      : level > 0
        ? `<a:pPr lvl="${Math.min(level, MAX_LEVEL)}"/>`
        : ''
  // A heading in the body reads bold, unless its runs already say so.
  const body = bold
    ? content.replace(/<a:rPr lang="en-US"(?![^>]*\bb="1")/g, '<a:rPr lang="en-US" b="1"')
    : content
  return `<a:p>${pPr}${body || '<a:endParaRPr lang="en-US" dirty="0"/>'}</a:p>`
}

/** A block's paragraphs: lists become bullets at their depth, containers give up their text. */
function bodyParagraphs(block: EditorNode, depth = 0): string[] {
  const name = block.type.name
  if (name === 'bulletList' || name === 'orderedList' || name === 'taskList') {
    return block.content.children.flatMap((item) =>
      item.content.children.flatMap((child) =>
        child.isTextblock ? [paragraph(runs(child), depth)] : bodyParagraphs(child, depth + 1),
      ),
    )
  }
  if (name === 'codeBlock') {
    return block.textContent
      .split('\n')
      .map((line) =>
        paragraph(
          `<a:r><a:rPr lang="en-US" sz="1800" dirty="0"><a:latin typeface="${CODE_FONT}"/></a:rPr><a:t>${escapeXML(line)}</a:t></a:r>`,
          null,
        ),
      )
  }
  if (name === 'table') {
    return block.content.children.map((row) =>
      paragraph(
        `<a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escapeXML(
          row.content.children.map((cell) => cell.textContent).join('  |  '),
        )}</a:t></a:r>`,
        null,
      ),
    )
  }
  if (block.isTextblock) {
    if (block.textContent.trim() === '') return []
    return [paragraph(runs(block), null, name === 'heading')]
  }
  return block.content.children.flatMap((child) => bodyParagraphs(child, depth))
}

const groupShape =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

const placeholder = (
  id: number,
  name: string,
  ph: string,
  body: string,
  spPr = '<p:spPr/>',
  bodyPr = '<a:bodyPr/>',
): string =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr>${spPr}<p:txBody>${bodyPr}<a:lstStyle/>${body}</p:txBody></p:sp>`

function slideXML(slide: Slide): string {
  const title = slide.title
    ? `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escapeXML(slide.title)}</a:t></a:r></a:p>`
    : '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>'
  const body =
    slide.blocks.flatMap((block) => bodyParagraphs(block)).join('') || paragraph('', null)
  // The body shrinks its text to fit, rather than running off the slide.
  const content = placeholder(
    3,
    'Content Placeholder 2',
    '<p:ph idx="1"/>',
    body,
    '<p:spPr/>',
    '<a:bodyPr><a:normAutofit/></a:bodyPr>',
  )
  return `${XML_HEADER}<p:sld ${NAMESPACES}><p:cSld><p:spTree>${groupShape}${placeholder(2, 'Title 1', '<p:ph type="title"/>', title)}${content}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
}

function notesXML(slide: Slide): string {
  const body = slide.notes
    .map(
      (note) =>
        `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escapeXML(note)}</a:t></a:r></a:p>`,
    )
    .join('')
  const image =
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>'
  return `${XML_HEADER}<p:notes ${NAMESPACES}><p:cSld><p:spTree>${groupShape}${image}${placeholder(3, 'Notes Placeholder 2', '<p:ph type="body" idx="1"/>', body)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`
}

const relationships = (entries: readonly [string, string][]): string =>
  `${XML_HEADER}<Relationships xmlns="${NS_REL}">${entries
    .map(
      ([type, target], index) =>
        `<Relationship Id="rId${index + 1}" Type="${NS_R}/${type}" Target="${target}"/>`,
    )
    .join('')}</Relationships>`

const COLOR_MAP =
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'

const solid = (value: string): string => `<a:solidFill><a:schemeClr val="${value}"/></a:solidFill>`

function levelStyle(level: number, size: number, bullet: boolean): string {
  const margin = 228600 + level * 457200
  const bullets = bullet ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>' : '<a:buNone/>'
  return `<a:lvl${level + 1}pPr marL="${margin}" indent="-228600">${bullets}<a:defRPr sz="${size}">${solid('tx1')}<a:latin typeface="+mn-lt"/></a:defRPr></a:lvl${level + 1}pPr>`
}

function slideMasterXML(): string {
  const title = placeholder(
    2,
    'Title Placeholder 1',
    '<p:ph type="title"/>',
    '<a:p><a:endParaRPr lang="en-US"/></a:p>',
    '<p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>',
  )
  const body = placeholder(
    3,
    'Text Placeholder 2',
    '<p:ph type="body" idx="1"/>',
    '<a:p><a:endParaRPr lang="en-US"/></a:p>',
    '<p:spPr><a:xfrm><a:off x="838200" y="1825625"/><a:ext cx="10515600" cy="4351338"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>',
  )
  const sizes = [2800, 2400, 2000, 1800, 1800, 1800, 1800, 1800, 1800]
  return `${XML_HEADER}<p:sldMaster ${NAMESPACES}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${groupShape}${title}${body}</p:spTree></p:cSld>${COLOR_MAP}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="4400" kern="1200">${solid('tx1')}<a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle>${sizes
    .map((size, level) => levelStyle(level, size, true))
    .join(
      '',
    )}</p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:otherStyle></p:txStyles></p:sldMaster>`
}

function slideLayoutXML(): string {
  const empty = '<a:p><a:endParaRPr lang="en-US"/></a:p>'
  return `${XML_HEADER}<p:sldLayout ${NAMESPACES} type="obj" preserve="1"><p:cSld name="Title and Content"><p:spTree>${groupShape}${placeholder(2, 'Title 1', '<p:ph type="title"/>', empty)}${placeholder(3, 'Content Placeholder 2', '<p:ph idx="1"/>', empty)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
}

function notesMasterXML(): string {
  const image =
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp>'
  const notes = placeholder(
    3,
    'Notes Placeholder 2',
    '<p:ph type="body" sz="quarter" idx="3"/>',
    '<a:p><a:endParaRPr lang="en-US"/></a:p>',
    '<p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>',
  )
  return `${XML_HEADER}<p:notesMaster ${NAMESPACES}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${groupShape}${image}${notes}</p:spTree></p:cSld>${COLOR_MAP}<p:notesStyle><a:lvl1pPr marL="0" algn="l"><a:defRPr sz="1200">${solid('tx1')}<a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`
}

function themeXML(): string {
  const colour = (name: string, value: string): string =>
    `<a:${name}><a:srgbClr val="${value}"/></a:${name}>`
  const three = (item: string): string => item + item + item
  return `${XML_HEADER}<a:theme xmlns:a="${NS_A}" name="Trevixal"><a:themeElements><a:clrScheme name="Trevixal"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>${colour('dk2', '1A1A2B')}${colour('lt2', 'F7F7F8')}${colour('accent1', '4F46E5')}${colour('accent2', '0EA5E9')}${colour('accent3', '16A34A')}${colour('accent4', 'EAB308')}${colour('accent5', 'DC2626')}${colour('accent6', '7C3AED')}${colour('hlink', '4F46E5')}${colour('folHlink', '7C3AED')}</a:clrScheme><a:fontScheme name="Trevixal"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Trevixal"><a:fillStyleLst>${three(solid('phClr'))}</a:fillStyleLst><a:lnStyleLst>${[
    6350, 12700, 19050,
  ]
    .map((width) => `<a:ln w="${width}">${solid('phClr')}</a:ln>`)
    .join(
      '',
    )}</a:lnStyleLst><a:effectStyleLst>${three('<a:effectStyle><a:effectLst/></a:effectStyle>')}</a:effectStyleLst><a:bgFillStyleLst>${three(solid('phClr'))}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`
}

function presentationXML(slides: readonly Slide[]): string {
  const ids = slides
    .map((_slide, index) => `<p:sldId id="${256 + index}" r:id="rId${10 + index}"/>`)
    .join('')
  return `${XML_HEADER}<p:presentation ${NAMESPACES} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst><p:sldIdLst>${ids}</p:sldIdLst><p:sldSz cx="${SLIDE_WIDTH}" cy="${SLIDE_HEIGHT}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`
}

function presentationRelationships(slides: readonly Slide[]): string {
  const fixed = [
    ['slideMaster', 'slideMasters/slideMaster1.xml'],
    ['notesMaster', 'notesMasters/notesMaster1.xml'],
    ['presProps', 'presProps.xml'],
    ['viewProps', 'viewProps.xml'],
    ['theme', 'theme/theme1.xml'],
    ['tableStyles', 'tableStyles.xml'],
  ] as const
  const entries = fixed.map(
    ([type, target], index) =>
      `<Relationship Id="rId${index + 1}" Type="${NS_R}/${type}" Target="${target}"/>`,
  )
  slides.forEach((_slide, index) => {
    entries.push(
      `<Relationship Id="rId${10 + index}" Type="${NS_R}/slide" Target="slides/slide${index + 1}.xml"/>`,
    )
  })
  return `${XML_HEADER}<Relationships xmlns="${NS_REL}">${entries.join('')}</Relationships>`
}

function contentTypes(slides: readonly Slide[]): string {
  const override = (part: string, type: string): string =>
    `<Override PartName="${part}" ContentType="${type}"/>`
  const perSlide = slides
    .flatMap((_slide, index) => [
      override(`/ppt/slides/slide${index + 1}.xml`, `${PML}.slide+xml`),
      override(`/ppt/notesSlides/notesSlide${index + 1}.xml`, `${PML}.notesSlide+xml`),
    ])
    .join('')
  return `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${override('/ppt/presentation.xml', `${PML}.presentation.main+xml`)}${override('/ppt/slideMasters/slideMaster1.xml', `${PML}.slideMaster+xml`)}${override('/ppt/slideLayouts/slideLayout1.xml', `${PML}.slideLayout+xml`)}${override('/ppt/notesMasters/notesMaster1.xml', `${PML}.notesMaster+xml`)}${perSlide}${override('/ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml')}${override('/ppt/theme/theme2.xml', 'application/vnd.openxmlformats-officedocument.theme+xml')}${override('/ppt/presProps.xml', `${PML}.presProps+xml`)}${override('/ppt/viewProps.xml', `${PML}.viewProps+xml`)}${override('/ppt/tableStyles.xml', `${PML}.tableStyles+xml`)}${override('/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml')}${override('/docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml')}</Types>`
}

function coreXML(title: string, when: string): string {
  return `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXML(title)}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified></cp:coreProperties>`
}

/** The deck, as the bytes of a `.pptx` file. */
export function serializeToPPTX(doc: EditorNode, options: PPTXOptions = {}): Uint8Array {
  const slides = documentSlides(doc)
  const when = (options.modified ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const title = options.title ?? slides[0]?.title ?? 'Presentation'
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: contentTypes(slides) },
    {
      name: '_rels/.rels',
      data: `${XML_HEADER}<Relationships xmlns="${NS_REL}"><Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="${NS_REL}/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${NS_R}/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    },
    { name: 'docProps/core.xml', data: coreXML(title, when) },
    {
      name: 'docProps/app.xml',
      data: `${XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Trevixal</Application><Slides>${slides.length}</Slides><Notes>${slides.length}</Notes></Properties>`,
    },
    { name: 'ppt/presentation.xml', data: presentationXML(slides) },
    { name: 'ppt/_rels/presentation.xml.rels', data: presentationRelationships(slides) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: slideMasterXML() },
    {
      name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      data: relationships([
        ['slideLayout', '../slideLayouts/slideLayout1.xml'],
        ['theme', '../theme/theme1.xml'],
      ]),
    },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: slideLayoutXML() },
    {
      name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      data: relationships([['slideMaster', '../slideMasters/slideMaster1.xml']]),
    },
    { name: 'ppt/notesMasters/notesMaster1.xml', data: notesMasterXML() },
    {
      name: 'ppt/notesMasters/_rels/notesMaster1.xml.rels',
      data: relationships([['theme', '../theme/theme2.xml']]),
    },
    { name: 'ppt/theme/theme1.xml', data: themeXML() },
    { name: 'ppt/theme/theme2.xml', data: themeXML() },
    { name: 'ppt/presProps.xml', data: `${XML_HEADER}<p:presentationPr ${NAMESPACES}/>` },
    {
      name: 'ppt/viewProps.xml',
      data: `${XML_HEADER}<p:viewPr ${NAMESPACES}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`,
    },
    {
      name: 'ppt/tableStyles.xml',
      data: `${XML_HEADER}<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`,
    },
  ]
  slides.forEach((slide, index) => {
    const n = index + 1
    entries.push(
      { name: `ppt/slides/slide${n}.xml`, data: slideXML(slide) },
      {
        name: `ppt/slides/_rels/slide${n}.xml.rels`,
        data: relationships([
          ['slideLayout', '../slideLayouts/slideLayout1.xml'],
          ['notesSlide', `../notesSlides/notesSlide${n}.xml`],
        ]),
      },
      { name: `ppt/notesSlides/notesSlide${n}.xml`, data: notesXML(slide) },
      {
        name: `ppt/notesSlides/_rels/notesSlide${n}.xml.rels`,
        data: relationships([
          ['notesMaster', '../notesMasters/notesMaster1.xml'],
          ['slide', `../slides/slide${n}.xml`],
        ]),
      },
    )
  })
  return createZip(entries)
}
