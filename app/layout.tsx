import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '@/components/layout/AppShell'
export const metadata: Metadata = { title: 'TomatoPilot', description: 'Gestion de ferme de tomates sous serre' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-[#0d1117] text-[#e6edf3] min-h-screen">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
