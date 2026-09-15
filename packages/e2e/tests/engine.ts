import type { Page } from '@playwright/test'

/**
 * Whether this engine's `scrollbar-width` readout says anything about the
 * stylesheet that produced it.
 *
 * Firefox, on a machine whose scrollbars overlay the content rather than take
 * a gutter, computes `none` for every element, including one carrying no CSS
 * of ours at all. Asserting `thin` there measures the browser, not the theme.
 *
 * Probed with a bare element rather than branched on the browser's name, for
 * two reasons: the behaviour belongs to the platform as much as the engine, so
 * a name is the wrong thing to key on; and a probe stops skipping by itself
 * the day the engine starts reporting the declared value, where a name would
 * go on excusing a failure nobody had looked at in a year.
 *
 * `scrollbar-color` is read correctly by every engine, so the tests that use
 * this still check that the palette reached the bar. It is only the width that
 * cannot be read back.
 */
export function scrollbarWidthIsReadable(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'overflow-y:scroll;position:fixed;top:-200px;width:60px;height:40px'
    probe.innerHTML = '<div style="height:400px"></div>'
    document.body.appendChild(probe)
    const reported = getComputedStyle(probe).scrollbarWidth
    probe.remove()
    return reported !== 'none'
  })
}

/**
 * Whether this is a complete browser rather than Chrome's headless shell.
 *
 * `chrome-headless-shell` is the cut-down binary: no PDF viewer, no plugins,
 * and no spellchecking beyond the pass it makes when a document first loads.
 * It draws the marks it found then and never re-checks, however the text
 * underneath is replaced, measured here at twenty seconds of polling, against
 * real Chrome, Firefox and WebKit, which all re-check within a second or two.
 *
 * Probed by what the build carries rather than by the browser's name, because
 * the name does not tell them apart: Playwright calls both this and the system
 * Chrome that the local config drives `chromium`. Keying on the name would
 * quietly drop the check from the local run, which is where most runs happen.
 */
export function isFullBrowserBuild(page: Page): Promise<boolean> {
  return page.evaluate(() => navigator.pdfViewerEnabled === true || navigator.plugins.length > 0)
}
