import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    /**
     * The seeded document carries a YouTube embed, and iframe loading is off
     * below. The environment reports each refusal straight to `console.error`
     * before it dispatches anything, so there is no event to prevent. It has
     * to be filtered here. Refusing to load the frame is the setting working;
     * a stack trace per mount is not worth reading it again.
     */
    onConsoleLog: (log) => (log.includes('Iframe page loading is disabled') ? false : undefined),
    environmentOptions: {
      // Tests must never reach the network or run what they parse: a font
      // <link> or a pasted <script> would otherwise be fetched for real,
      // which is slow, flaky offline, and noisy in the output.
      happyDOM: {
        settings: {
          disableJavaScriptEvaluation: true,
          disableJavaScriptFileLoading: true,
          disableCSSFileLoading: true,
          // A blocked resource is a no-op, not a page error: without this
          // happy-dom reports every skipped font and stylesheet on stderr.
          handleDisabledFileLoadingAsSuccess: true,
          disableIframePageLoading: true,
        },
      },
    },
  },
})
