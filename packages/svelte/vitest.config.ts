import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Only the tests compile Svelte. The package itself imports nothing from
  // Svelte, which is what lets one build serve both 4 and 5.
  plugins: [svelte({ hot: false })],
  // happy-dom is a browser, so Svelte must resolve to its client build:
  // the server one has no `mount`, and fails with
  // `lifecycle_function_unavailable` the moment a component is created.
  resolve: { conditions: ['browser'] },
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
