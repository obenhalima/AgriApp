import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'

export const metadata: Metadata = {
  title: 'TomatoPilot - Gestion Ferme de Tomates',
  description: 'Application de gestion integree pour ferme de tomates sous serre',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ background:'var(--bg)' }}>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col" style={{ marginLeft: 200 }}>
            <Topbar />
            <main className="flex-1">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
