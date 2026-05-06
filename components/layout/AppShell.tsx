'use client'
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
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading } = useAuth()
  const [sidebarW, setSidebarW] = useState(240)
  const [theme, setThemeState] = useState<'dark' | 'light'>('light')

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
    if (!user && pathname !== '/login') router.replace('/login')
    else if (user && pathname === '/login') router.replace('/')
  }, [loading, user, pathname, router])

  // Loader d'initialisation
  if (loading) {
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
          Initialisation…
        </motion.div>
      </div>
    )
  }

  // Page login → rendu nu
  if (pathname === '/login' || !user) return <>{children}</>

  return (
    <div className="flex min-h-screen bg-surface-base transition-colors duration-300">
      <Sidebar />

      <div
        className="flex-1 flex flex-col min-h-screen transition-[margin-left] duration-250"
        style={{
          marginLeft: sidebarW,
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
