import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'

export const metadata: Metadata = {
  title: 'TomatoPilot — AgriTech',
  description: 'Gestion de ferme de tomates sous serre — Haute technologie agricole',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" style={{ background: '#030a07' }}>
      <head><meta name="color-scheme" content="dark" /></head>
      <body>
        <div style={{ display:'flex', minHeight:'100vh' }}>
          <Sidebar />
          <div style={{ flex:1, display:'flex', flexDirection:'column', marginLeft:'var(--sidebar-w)', minHeight:'100vh' }}>
            <Topbar />
            <main style={{ flex:1, padding:'24px', position:'relative', zIndex:1 }}>
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
