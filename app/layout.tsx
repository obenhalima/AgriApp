import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '@/components/layout/AppShell'

export const metadata: Metadata = {
  title: 'TomatoPilot — AgriTech',
  description: 'Gestion de ferme de tomates sous serre',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" style={{ background: '#030a07' }}>
      <head><meta name="color-scheme" content="dark" /></head>
      <body style={{ background: '#030a07', color: '#e8f5ee' }}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
