import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '@/components/layout/AppShell'
import { AuthProvider } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Domaine BENHALIMA — Production MES',
  description: 'Pilotage de production agricole — Domaine BENHALIMA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Le thème clair est l'état par défaut (CSS :root = light).
  // AppShell appliquera le thème stocké via applyTheme(getTheme()) en useEffect.
  return (
    <html lang="fr" data-theme="light" suppressHydrationWarning>
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  )
}
