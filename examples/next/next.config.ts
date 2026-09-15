import type { NextConfig } from 'next'

const config: NextConfig = {
  // The workspace packages ship built ES2022 in `dist`, so Next needs no help
  // compiling them. They are listed anyway because a workspace link is a
  // symlink, and without this Next resolves their `react` import through the
  // package's own directory rather than the app's, two Reacts, and hooks
  // that throw the moment a node view renders.
  transpilePackages: ['@trevixal/editor-kit', '@trevixal/ui'],
}

export default config
