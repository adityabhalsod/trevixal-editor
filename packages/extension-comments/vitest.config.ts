import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    environmentOptions: {
      // Tests must never reach the network or run what they parse: a font
      // <link> or a pasted <script> would otherwise be fetched for real,
      // which is slow, flaky offline, and noisy in the output. Applies to the
      // files that opt into happy-dom with a `@vitest-environment` directive.
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
