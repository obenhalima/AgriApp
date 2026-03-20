import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'

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
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <Sidebar />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 200 }}>
            <Topbar />
            <main style={{ flex: 1, background: '#f4f9f4' }}>
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
