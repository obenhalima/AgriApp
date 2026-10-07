'use client'
import {useLanguage} from '@/lib/i18n'

/**
 * AppShell : root layout côté client.
 *   - Sidebar à gauche
 *   - Topbar collante en haut
 *   - CommandPalette (Cmd+K) globale
 *   - Toaster Sonner pour les notifications
 *   - Loader d'init élégant
 */
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { Toaster } from 'sonner'
import { Sprout } from 'lucide-react'
import { applyTheme, getTheme } from '@/lib/theme'
import { useAuth } from '@/lib/auth'
import { findNavItem } from '@/lib/navigation'
import { getAccessGate } from '@/lib/accessGate'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { AIAssistantFAB } from '@/components/ai/AIAssistantFAB'
import { GuideLauncher } from '@/components/help/GuideLauncher'

export function AppShell({ children }: { children: React.ReactNode }) {
 const {t:_ui,text:_uiNode}=useLanguage()

  const router = useRouter()
  const pathname = usePathname()
  const { user, profile, loading, canAccessModule, isPlatformAdmin, signOut } = useAuth()
  const navItem = findNavItem(pathname)?.item
  const deniedModule = Boolean(navItem && (navItem.platformOnly ? !isPlatformAdmin : !!navItem.moduleCode && !canAccessModule(navItem.moduleCode)))
  const gate = getAccessGate({ loading, hasUser: !!user, activeProfile: !!profile?.is_active,
    mustChangePassword: !!profile?.must_change_password, pathname, moduleAllowed: !deniedModule })
  const isPublicAuthPage = ['/login','/forgot-password','/reset-password','/change-password'].includes(pathname)
  const [sidebarW, setSidebarW] = useState(240)
  const [isDesktop, setIsDesktop] = useState(true)
  const [theme, setThemeState] = useState<'dark' | 'light'>('light')

  // Desktop (lg+) : la sidebar pousse le contenu. Mobile : drawer, contenu pleine largeur.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Theme + sidebar
  useEffect(() => {
    const t = getTheme()
    applyTheme(t)
    setThemeState(t)
    const onSidebarChange = (e: any) => {
      const { collapsed } = e.detail
      setSidebarW(collapsed ? 64 : 240)
    }
    window.addEventListener('sidebar-change', onSidebarChange)
    const saved = localStorage.getItem('tp_sidebar_collapsed') === 'true'
    setSidebarW(saved ? 64 : 240)
    return () => window.removeEventListener('sidebar-change', onSidebarChange)
  }, [])

  // Watch theme changes (depuis Topbar/CommandPalette)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const current = (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') ?? 'light'
      setThemeState(current)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // Redirection auth
  useEffect(() => {
    if (loading) return
    if (!user && !isPublicAuthPage) router.replace(pathname === '/validations' ? '/login?next=validations' : '/login')
    else if (user && profile?.must_change_password && pathname !== '/change-password') router.replace('/change-password')
    else if (user && profile?.is_active && !profile?.must_change_password && (pathname === '/login' || pathname === '/change-password')) router.replace(new URLSearchParams(window.location.search).get('next') === 'validations' ? '/validations' : '/')
  }, [loading, user, profile?.is_active, profile?.must_change_password, pathname, router, isPublicAuthPage])

  // Loader d'initialisation
  if (gate === 'loading') {
    return (
      <div className="min-h-screen bg-surface-sunk flex items-center justify-center flex-col gap-md">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
          className="relative"
        >
          <div className="absolute inset-0 rounded-full blur-2xl opacity-50"
            style={{ background: 'radial-gradient(circle, var(--neon), transparent 70%)' }} />
          <div className="relative w-14 h-14 rounded-2xl bg-brand/15 border border-brand/30 flex items-center justify-center">
            <Sprout size={28} className="text-brand animate-pulse" strokeWidth={2.5} />
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="font-mono text-caption text-fg-tertiary tracking-[2px] uppercase"
        >
          {" "}{_ui("Initialisation…")}{" "}</motion.div>
      </div>
    )
  }

  // Never mount protected children while waiting for the redirect.
  if (gate === 'login' || gate === 'password') return null
  if (gate === 'inactive') return (
    <div role="alert" className="p-8">{_ui("Compte indisponible ou désactivé. Contactez votre administrateur.")}{" "}<button className="btn ml-4" onClick={() => void signOut()}>{_ui("Se déconnecter")}</button>
    </div>
  )
  if (gate === 'public') return <>{children}</>
  if (gate === 'denied') return (
    <div role="alert" className="p-8">{_ui("Vous n’avez pas les droits nécessaires pour ce module.")}{" "}<button className="btn ml-4" onClick={() => router.back()}>{_ui("Retour")}</button>
      <button className="btn ml-4" onClick={() => void signOut()}>{_ui("Se déconnecter")}</button>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-surface-base transition-colors duration-300">
      <Sidebar />

      <div
        className="flex-1 flex flex-col min-h-screen min-w-0 transition-[margin-inline-start] duration-250"
        style={{
          marginInlineStart: isDesktop ? sidebarW : 0,
          transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <Topbar />
        <main className="flex-1 px-md sm:px-lg lg:px-xl py-lg relative z-[1]">
          {children}
        </main>
      </div>

      {/* Cmd+K Command Palette (globale) */}
      <CommandPalette />
      <GuideLauncher key={pathname}/>

      {/* IA Assistant FAB (globale) */}
      {!pathname.startsWith('/validations') && <AIAssistantFAB />}

      {/* Toaster Sonner (notifications) */}
      <Toaster
        position="bottom-right"
        theme={theme === 'dark' ? 'dark' : 'light'}
        richColors
        expand
        closeButton
        toastOptions={{
          style: {
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--tx-1)',
            fontFamily: 'var(--font-body)',
          },
          className: 'shadow-overlay',
        }}
      />
    </div>
  )
}
