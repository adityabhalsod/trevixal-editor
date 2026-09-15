import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '@trevixal/ui/styles.css'
import '@trevixal/editor-kit/styles.css'
import '../../shared/loading.css'
import '../../shared/page.css'

export const metadata: Metadata = {
  title: 'Trevixal: Next.js',
  description: 'The complete Trevixal editor in a Next.js App Router app.',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: ReactNode }) {
  // `trevixal` on the page as well as on the editor: the theme tokens are
  // inherited, so the margin around the editor follows the theme rather than
  // staying white behind a dark document.
  return (
    <html lang="en">
      <body className="trevixal">{children}</body>
    </html>
  )
}
