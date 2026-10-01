/**
 * Import and export for the Trevixal editor. Everything here is
 * dependency-free: the ZIP container, the XML parser, the DOCX and RTF
 * writers and the DOCX reader are all written against the platform alone,
 * so the package adds nothing to an application's bundle beyond itself.
 */

export { ArchiveError, crc32, createZip, readZip, type ZipEntry } from './zip'
export {
  decodeEntities,
  escapeXML,
  isXmlElement,
  parseXML,
  XmlElement,
  type XmlNode,
  type XmlText,
} from './xml'
export { type RTFOptions, serializeToRTF } from './rtf'
export { parseExportArchive } from './archive-import'
export { type EPUBOptions, serializeToEPUB } from './epub'
export { type LaTeXOptions, escapeLaTeX, serializeToLaTeX } from './latex'
export { type ODTOptions, parseODT, serializeToODT } from './odt'
export { type PPTXOptions, serializeToPPTX } from './pptx'
export { type Slide, documentSlides } from './slides'
export {
  PDFJS_CDN_URL,
  PDFJS_WORKER_URL,
  type PdfJsLike,
  type PdfTextItem,
  linesToBlocks,
  loadPdfJs,
  pageLines,
  parsePDF,
} from './pdf'
export type {
  RenderedBlock,
  RenderedDocument,
  RenderedImage,
  RenderedRun,
} from './rendered'
export { type DocumentPalette, type ThemeTokens, documentPalette } from './theme'
export { type DOCXOptions, serializeToDOCX } from './docx-writer'
export { type DOCXImportOptions, parseDOCX } from './docx-reader'
export {
  type DownloadOptions,
  downloadFile,
  readFileBytes,
  readFileText,
  suggestFileName,
} from './download'
export {
  archiveImporter,
  docxExporter,
  docxImporter,
  epubExporter,
  latexExporter,
  odtExporter,
  odtImporter,
  pdfImporter,
  type DocumentExporter,
  type DocumentImporter,
  type ExportContext,
  exportFormats,
  type ImportContext,
  importFormats,
  rtfExporter,
} from './formats'
