import { type EditorNode, type Schema, parseHTML } from '@trevixal/core'

/**
 * A web page clipped into a document: its article, without the page around
 * it, as a clipper keeps it. Navigation, headers, footers, sidebars, forms
 * and scripts are left out; links and pictures keep working because their
 * addresses are made whole against the page's. A line at the end says where
 * it came from.
 */

/** What a page wraps its article in, most specific first. */
const ARTICLE = 'article, main, [role="main"]'

/** The parts of a page that are not its article. */
const CHROME =
  'script, style, noscript, template, nav, header, footer, aside, form, button, [role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"]'

/** Make an element's address whole against the page it came from. */
function absolutize(element: Element, attribute: string, base: string): void {
  const value = element.getAttribute(attribute)
  if (!value) return
  try {
    element.setAttribute(attribute, new URL(value, base).href)
  } catch {
    element.removeAttribute(attribute)
  }
}

/**
 * The article of a page, as a document: its title as a heading when the
 * article has none of its own, the article's blocks, and where it came from.
 */
export function clipWebPage(
  html: string,
  url: string,
  schema: Schema,
  document: Document,
): EditorNode {
  const page = new DOMParser().parseFromString(html, 'text/html')
  const article = page.querySelector(ARTICLE) ?? page.body
  const clip = article.cloneNode(true) as HTMLElement
  for (const element of clip.querySelectorAll(CHROME)) element.remove()
  for (const link of clip.querySelectorAll('a[href]')) absolutize(link, 'href', url)
  for (const image of clip.querySelectorAll('img[src]')) absolutize(image, 'src', url)
  const title = page.querySelector('title')?.textContent?.trim()
  const heading = clip.querySelector('h1')
  const host = (() => {
    try {
      return new URL(url).host
    } catch {
      return url
    }
  })()
  const wrapper = page.createElement('div')
  if (title && !heading) {
    const top = page.createElement('h1')
    top.textContent = title
    wrapper.appendChild(top)
  }
  wrapper.append(...clip.childNodes)
  const source = page.createElement('p')
  source.append('Clipped from ')
  const link = page.createElement('a')
  link.href = url
  link.textContent = host
  source.appendChild(link)
  wrapper.appendChild(source)
  return parseHTML(schema, wrapper.innerHTML, document)
}

/**
 * A page's HTML fetched straight from the browser, which only works for a
 * page that allows it (CORS). A host with a server hands its own fetcher in
 * instead.
 */
export async function fetchPageHTML(url: string): Promise<string> {
  const response = await fetch(url, { credentials: 'omit' })
  if (!response.ok) throw new Error(`the page answered ${response.status}`)
  return response.text()
}
