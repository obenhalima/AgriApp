import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'

export const metadata: Metadata = {
  title: 'TomatoPilot — Gestion de Ferme de Tomates',
  description: 'Application de gestion intégrée pour ferme de tomates sous serre',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ background: 'var(--bg-main)', minHeight: '100vh' }}>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col" style={{ marginLeft: '240px' }}>
            <Topbar />
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  )
}
