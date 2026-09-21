/**
 * Total downloads across every published `@trevixal/*` package, as a badge.
 *
 * npm has no endpoint that sums a scope: its bulk download API refuses scoped
 * names outright ("scoped packages are not currently supported in bulk
 * lookups"), and shields.io can read one number, not add up twenty-three. So
 * the sum is computed here, once per cache period, rather than in each
 * reader's browser or at build time where it would freeze until the next
 * deploy.
 *
 * Returns the shape shields.io's endpoint badge expects, so the README can
 * point at this directly:
 *
 *     https://img.shields.io/endpoint?url=https://trevixal-editor.vercel.app/api/downloads
 *
 * The package list is discovered rather than hardcoded, so a new package
 * counts from the day it is published with nothing to remember here.
 */
const SCOPE = '@trevixal/'
const SEARCH = 'https://registry.npmjs.org/-/v1/search?text=%40trevixal&size=250'
const DOWNLOADS = 'https://api.npmjs.org/downloads/point/last-month'
const TIMEOUT_MS = 8000

async function getJSON(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    return response.ok ? await response.json() : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 1234 -> "1.2k". A badge has room for a number, not for seven digits. */
function short(count) {
  if (count < 1000) return String(count)
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`
  return `${(count / 1_000_000).toFixed(1)}M`
}

export default async function handler(_request, response) {
  const search = await getJSON(SEARCH)
  const names = (search?.objects ?? [])
    .map((entry) => entry.package?.name)
    .filter((name) => typeof name === 'string' && name.startsWith(SCOPE))

  const counts = await Promise.all(
    names.map(async (name) => {
      const point = await getJSON(`${DOWNLOADS}/${name}`)
      return typeof point?.downloads === 'number' ? point.downloads : null
    }),
  )

  const answered = counts.filter((count) => count !== null)
  const total = answered.reduce((sum, count) => sum + count, 0)

  // Nothing came back at all: say so rather than publishing a confident zero.
  if (answered.length === 0) {
    response.setHeader('Cache-Control', 'public, s-maxage=60')
    response.status(200).json({
      schemaVersion: 1,
      label: 'downloads',
      message: 'unavailable',
      color: 'lightgrey',
    })
    return
  }

  // An hour at the edge, and a day of serving the old number while a new one
  // is fetched behind it, so a slow registry never makes a reader wait.
  response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  response.status(200).json({
    schemaVersion: 1,
    label: 'downloads',
    message: `${short(total)}/month`,
    color: 'brightgreen',
    // Not part of the badge; the site's nav reads these.
    total,
    packages: names.length,
    counted: answered.length,
  })
}
