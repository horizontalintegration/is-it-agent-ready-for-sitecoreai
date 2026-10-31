import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Is It Agent-Ready? for SitecoreAI',
  description:
    'Make every page reachable, readable and citable by AI agents, then fix it right in Sitecore.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
