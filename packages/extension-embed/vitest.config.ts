import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
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
