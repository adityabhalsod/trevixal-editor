import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // The brief's gate: the parts of the engine a document's correctness
      // depends on. The view is deliberately out. It is covered in a real
      // browser by the Playwright suite, and counting it here would let
      // uncovered model code hide behind well-covered rendering.
      include: [
        'src/model/**',
        'src/state/**',
        'src/commands/**',
        'src/history/**',
        'src/serialize/**',
      ],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { lines: 90, functions: 90, statements: 90 },
    },
    environmentOptions: {
      // The XSS corpus feeds happy-dom hostile markup; never let it try to
      // actually load or execute any of it.
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
