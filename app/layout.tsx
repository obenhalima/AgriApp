import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '@/components/layout/AppShell'

export const metadata: Metadata = {
  title: 'TomatoPilot',
  description: 'Gestion ferme de tomates sous serre',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" style={{ colorScheme: 'light', background: '#f4f9f4' }}>
      <head>
        <meta name="color-scheme" content="light" />
      </head>
      <body style={{ background: '#f4f9f4', color: '#1b3a2d', minHeight: '100vh' }}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
