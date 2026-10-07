import { cookies } from 'next/headers'
import { LanguageProvider } from '@/lib/i18n'
import { isLocale } from '@/lib/i18nCatalog'
import type { Metadata } from 'next'
import './globals.css'
import { BRAND } from '@/lib/brand'
import { AppShell } from '@/components/layout/AppShell'
import { AuthProvider } from '@/lib/auth'

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s | ${BRAND.name}` },
  description: BRAND.description,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/pwa/apple.png?v=itrix' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const saved = cookies().get('itrix_language')?.value
  const locale = isLocale(saved) ? saved : 'fr'
  // Le thème clair est l'état par défaut (CSS :root = light).
  // AppShell appliquera le thème stocké via applyTheme(getTheme()) en useEffect.
  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} data-theme="light" suppressHydrationWarning>
      <body>
        <AuthProvider>
          <LanguageProvider initialLocale={locale}><AppShell>{children}</AppShell></LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
