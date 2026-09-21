/**
 * Downloads across the `@trevixal/*` packages, as shields.io badge JSON.
 *
 * Two shapes, served from one place so every number on a page comes from the
 * same snapshot and the same cache period:
 *
 *     /api/downloads               the whole scope, summed
 *     /api/downloads?package=core  one package
 *
 * npm has no endpoint that sums a scope: its bulk download API refuses scoped
 * names outright ("scoped packages are not currently supported in bulk
 * lookups"), and shields.io can read one number, not add up twenty-three. So
 * the sum is computed here, once per cache period, rather than in each
 * reader's browser or at build time where it would freeze until the next
 * deploy.
 *
 * Point shields at it, overriding the label and colour as any badge does:
 *
 *     https://img.shields.io/endpoint?url=https%3A%2F%2Ftrevixal-editor.vercel.app%2Fapi%2Fdownloads
 *
 * The package list is discovered rather than hardcoded, so a new package
 * counts towards the total from the day it is published, with nothing to
 * remember here.
 */
const SCOPE = '@trevixal/'
const SEARCH = 'https://registry.npmjs.org/-/v1/search?text=%40trevixal&size=250'
const DOWNLOADS = 'https://api.npmjs.org/downloads/point/last-month'
const TIMEOUT_MS = 8000

/** One npm name segment. Anything else is refused rather than forwarded. */
const PACKAGE_SEGMENT = /^[a-z0-9][a-z0-9._-]*$/

/**
 * An hour at the edge, then a day of serving the old number while a new one is
 * fetched behind it, so a slow registry never makes a reader wait.
 */
const CACHE_FRESH = 'public, s-maxage=3600, stale-while-revalidate=86400'

/** Short, so a registry blip is retried soon rather than cached all hour. */
const CACHE_BRIEF = 'public, s-maxage=60'

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

/** Last month's downloads for one package, or null if npm did not answer. */
async function downloadsFor(name) {
  const point = await getJSON(`${DOWNLOADS}/${name}`)
  return typeof point?.downloads === 'number' ? point.downloads : null
}

/**
 * The `package` query value as a scoped name, or null to total the scope.
 *
 * Both `core` and `@trevixal/core` are accepted; anything outside the scope
 * throws, so the endpoint reports on Trevixal rather than becoming an open
 * proxy to the whole registry.
 */
function requestedPackage(request) {
  const asked = new URL(request.url ?? '/', 'http://localhost').searchParams.get('package')
  if (!asked) return null

  const segment = asked.startsWith(SCOPE) ? asked.slice(SCOPE.length) : asked
  if (!PACKAGE_SEGMENT.test(segment)) throw new RangeError(`not a ${SCOPE} package: ${asked}`)
  return { name: `${SCOPE}${segment}`, segment }
}

function sendBadge(response, { status = 200, cache = CACHE_FRESH, ...badge }) {
  response.setHeader('Cache-Control', cache)
  response.status(status).json({ schemaVersion: 1, ...badge })
}

async function sendPackage(response, { name, segment }) {
  const count = await downloadsFor(name)

  // npm did not answer: say so rather than publishing a confident zero.
  if (count === null) {
    sendBadge(response, {
      cache: CACHE_BRIEF,
      label: segment,
      message: 'unavailable',
      color: 'lightgrey',
    })
    return
  }

  sendBadge(response, {
    label: segment,
    message: `${short(count)}/month`,
    color: 'blue',
    downloads: count,
  })
}

async function sendScopeTotal(response) {
  const search = await getJSON(SEARCH)
  const names = (search?.objects ?? [])
    .map((entry) => entry.package?.name)
    .filter((name) => typeof name === 'string' && name.startsWith(SCOPE))

  const counts = await Promise.all(names.map(downloadsFor))
  const answered = counts.filter((count) => count !== null)

  if (answered.length === 0) {
    sendBadge(response, {
      cache: CACHE_BRIEF,
      label: 'downloads',
      message: 'unavailable',
      color: 'lightgrey',
    })
    return
  }

  const total = answered.reduce((sum, count) => sum + count, 0)

  sendBadge(response, {
    // A partial answer (npm rate-limits a burst with a 1015) sums too low, so
    // it is published but not cached for the hour: the next reader retries.
    cache: answered.length === names.length ? CACHE_FRESH : CACHE_BRIEF,
    label: 'downloads',
    message: `${short(total)}/month`,
    color: 'brightgreen',
    // Not part of the badge; the site's nav reads these.
    total,
    packages: names.length,
    counted: answered.length,
  })
}

export default async function handler(request, response) {
  let asked
  try {
    asked = requestedPackage(request)
  } catch (error) {
    sendBadge(response, {
      status: 400,
      cache: CACHE_BRIEF,
      label: 'downloads',
      message: 'invalid package',
      color: 'lightgrey',
      error: error.message,
    })
    return
  }

  await (asked ? sendPackage(response, asked) : sendScopeTotal(response))
}
