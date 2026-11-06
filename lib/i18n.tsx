'use client'
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from './auth'
import { isLocale, translate, type Locale } from './i18nCatalog'

const Context = createContext({ locale: 'fr' as Locale, intlLocale:'fr-FR', setLocale: (_: Locale) => {}, t: (source: string, values?: Record<string, string | number>) => translate('fr', source, values), text: (value: React.ReactNode): React.ReactNode => value })
export function LanguageProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale }) {
  const { user, loading } = useAuth()
  const [locale, updateLocale] = useState<Locale>(initialLocale)
  const key = user ? `itrix_language_${user.id}` : 'itrix_language_guest'
  useEffect(() => {
    if (loading) return
    try { const saved = localStorage.getItem(key); if (isLocale(saved)) updateLocale(saved) } catch {}
  }, [key, loading])
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
    document.cookie = `itrix_language=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  }, [locale])
  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return
    updateLocale(next)
    try { localStorage.setItem(key, next) } catch {}
  }, [key])
  const value = useMemo(() => ({ locale, intlLocale:locale==='ar'?'ar-MA':locale==='en'?'en-GB':'fr-FR', setLocale, t: (source: string, values?: Record<string, string | number>) => translate(locale, source, values), text: (node: React.ReactNode): React.ReactNode => typeof node==='string'?translate(locale,node):node }), [locale, setLocale])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export const useLanguage = () => useContext(Context)
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage()
  return <label className="inline-flex items-center gap-2 text-xs text-fg-secondary"><span className="sr-only">{t('Langue')}</span><select aria-label={t('Langue')} value={locale} onChange={e => setLocale(e.target.value as Locale)} className="rounded-lg border border-border bg-surface-raised px-2 py-2 text-sm text-fg-primary" dir="ltr"><option value="fr">Français</option><option value="ar">العربية</option><option value="en">English</option></select></label>
}

/** Translate interface text without introducing markup or changing its spacing. */
export function TranslatedText({text}:{text:React.ReactNode}) {
  const {t}=useLanguage()
  if(typeof text!=='string')return <>{text}</>
  const spaces=text.match(/^(\s*)([\s\S]*?)(\s*)$/)!
  return <>{spaces[1]}{t(spaces[2])}{spaces[3]}</>
}
