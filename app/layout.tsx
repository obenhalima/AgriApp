import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '@/components/layout/AppShell'
import { AuthProvider } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Domaine BENHALIMA — Production MES',
  description: 'Pilotage de production agricole — Domaine BENHALIMA',
}

// Script exécuté avant l'hydratation React : lit le thème stocké et l'applique immédiatement.
// Évite le "flash" de thème (FOUC) au chargement.
const themeInitScript = `
(function(){
  try {
    var t = localStorage.getItem('tp_theme') || 'light';
    if (t === 'light') document.documentElement.setAttribute('data-theme','light');
  } catch(e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  )
}
