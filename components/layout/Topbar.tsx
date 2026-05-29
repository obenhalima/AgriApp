'use client'
/**
 * Topbar refondu : breadcrumbs dynamiques + Cmd+K trigger + theme toggle
 * smooth + user avatar dropdown.
 */
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Sun, Moon, LogOut, ChevronRight, HelpCircle, Plus, Activity,
  ChevronDown, RefreshCw, AlertCircle,
} from 'lucide-react'

import { getTheme, setTheme } from '@/lib/theme'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { findNavItem, buildBreadcrumbs } from '@/lib/navigation'
import { getModuleKeyForPath } from '@/lib/modules'
import { HelpLink } from '@/components/help/HelpLink'
import { Badge } from '@/components/ui/Badge'

export function Topbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, profile, role, signOut } = useAuth()

  const [out, setOut] = useState(false)
  const [theme, setThemeState] = useState<'dark' | 'light'>('light')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isMac, setIsMac] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = () => {
    setRefreshing(true)
    // 1. Force le re-rendu côté React (réexécute les useEffect via une nouvelle clé)
    router.refresh()
    // 2. Notifie les pages qui veulent recharger leurs données client-side
    window.dispatchEvent(new CustomEvent('app:refresh-data'))
    setTimeout(() => setRefreshing(false), 700)
  }

  useEffect(() => {
    setThemeState(getTheme())
    setIsMac(typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0)
  }, [])

  // Fermer user menu sur clic en dehors
  useEffect(() => {
    if (!userMenuOpen) return
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-user-menu]')) setUserMenuOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [userMenuOpen])

  const breadcrumbs = useMemo(() => buildBreadcrumbs(pathname), [pathname])
  const currentNav = useMemo(() => findNavItem(pathname), [pathname])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  const logout = async () => { setOut(true); await signOut(); router.replace('/login') }

  const triggerCmdK = () => {
    // Synthétise un Cmd+K pour ouvrir la palette
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }))
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-40 h-[52px]',
        'bg-surface-raised/80 backdrop-blur-xl',
        'border-b border-border',
        'flex items-center justify-between',
        'px-md sm:px-lg',
        'transition-colors duration-300',
      )}
    >
      {/* ─── Left : Breadcrumbs ─── */}
      <div className="flex items-center gap-sm min-w-0 flex-1">
        {breadcrumbs.map((crumb, i) => {
          const Icon = crumb.icon
          const isLast = i === breadcrumbs.length - 1
          return (
            <div key={i} className="flex items-center gap-sm min-w-0">
              {i > 0 && <ChevronRight size={12} className="text-fg-tertiary flex-shrink-0" strokeWidth={2.2} />}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="flex items-center gap-1.5 text-body-sm text-fg-tertiary hover:text-fg-primary transition-colors min-w-0"
                >
                  {Icon && <Icon size={13} strokeWidth={2.2} />}
                  <span className="truncate">{crumb.label}</span>
                </Link>
              ) : (
                <span className={cn(
                  'flex items-center gap-1.5 min-w-0',
                  isLast ? 'text-fg-primary font-semibold' : 'text-fg-tertiary',
                  'text-body-sm',
                )}>
                  {Icon && (
                    <span className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{ background: `color-mix(in srgb, ${currentNav?.item.color ?? 'var(--neon)'} 14%, transparent)`,
                                   color: currentNav?.item.color ?? 'var(--neon)' }}>
                      <Icon size={14} strokeWidth={2.2} />
                    </span>
                  )}
                  <span className="truncate">{crumb.label}</span>
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* ─── Right : Actions ─── */}
      <div className="flex items-center gap-xs sm:gap-sm flex-shrink-0">

        {/* Search / Cmd+K trigger */}
        <button
          onClick={triggerCmdK}
          className={cn(
            'group hidden md:flex items-center gap-sm px-md py-1.5 h-8',
            'rounded-md border border-border bg-surface-sunk/50',
            'text-fg-tertiary hover:text-fg-secondary hover:border-border-strong hover:bg-surface-hover',
            'transition-all duration-150 cursor-pointer',
          )}
          title="Recherche rapide"
        >
          <Search size={13} strokeWidth={2.2} />
          <span className="text-caption">Recherche…</span>
          <span className="flex items-center gap-0.5 ml-md">
            <kbd className="px-1.5 py-0.5 rounded border border-border text-[9px] font-mono bg-surface-raised">
              {isMac ? '⌘' : 'Ctrl'}
            </kbd>
            <kbd className="px-1.5 py-0.5 rounded border border-border text-[9px] font-mono bg-surface-raised">K</kbd>
          </span>
        </button>

        {/* Cmd+K mobile */}
        <button
          onClick={triggerCmdK}
          className={cn(
            'md:hidden w-8 h-8 rounded-md',
            'border border-border bg-surface-sunk/50 text-fg-tertiary',
            'flex items-center justify-center',
            'hover:bg-surface-hover hover:text-fg-secondary',
            'transition-all duration-150',
          )}
          title="Recherche"
        >
          <Search size={14} strokeWidth={2.2} />
        </button>

        {/* Refresh data */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title="Rafraîchir les données de la page"
          className={cn(
            'w-8 h-8 rounded-md',
            'border border-border bg-surface-sunk/50 text-fg-tertiary',
            'flex items-center justify-center',
            'hover:bg-surface-hover hover:text-fg-secondary',
            'transition-all duration-150',
            refreshing && 'opacity-60'
          )}
        >
          <RefreshCw size={14} strokeWidth={2.2} className={refreshing ? 'animate-spin' : ''} />
        </button>

        {/* Live badge */}
        <Badge variant="success" size="md" dot pulse className="hidden sm:inline-flex">
          Live · 2025-2026
        </Badge>

        {/* Bouton action contextuel à la page */}
        {currentNav?.item.href && currentNav.item.href !== '/' && (
          <Link
            href={currentNav.item.href}
            className={cn(
              'hidden sm:inline-flex items-center gap-1.5 px-md h-8 rounded-md',
              'text-white text-caption font-bold uppercase tracking-wider',
              'shadow-[0_2px_10px_var(--neon-dim)] transition-all duration-150',
              'hover:brightness-110 hover:-translate-y-0.5 hover:shadow-glow',
            )}
            style={{ background: 'var(--neon)' }}
          >
            <Plus size={13} strokeWidth={2.5} />
            {currentNav.item.label.split(' ')[0]}
          </Link>
        )}

        {/* Aide contextuelle */}
        {(() => {
          const moduleKey = getModuleKeyForPath(pathname) ?? 'intro'
          if (pathname === '/guide' || pathname === '/login') return null
          return (
            <div className="hidden lg:flex">
              <HelpLink module={moduleKey} variant="pill" label="Aide" />
            </div>
          )
        })()}

        {/* Toggle thème animé */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'}
          className={cn(
            'relative w-8 h-8 rounded-md flex items-center justify-center',
            'border border-border bg-surface-sunk/50',
            'hover:bg-surface-hover hover:border-border-strong',
            'transition-all duration-200',
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            {theme === 'dark' ? (
              <motion.div
                key="moon"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Moon size={14} strokeWidth={2.2} className="text-info" />
              </motion.div>
            ) : (
              <motion.div
                key="sun"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Sun size={14} strokeWidth={2.2} className="text-warning" />
              </motion.div>
            )}
          </AnimatePresence>
        </button>

        {/* User menu (fallback : user existe mais profile manquant) */}
        {user && !profile && (
          <div className="flex items-center gap-sm">
            <div className="hidden sm:flex items-center gap-2 px-md py-1.5 rounded-md border border-warning/40 bg-warning/10 text-warning text-caption font-mono"
                 title="Profil manquant — contacte un admin ou exécute le SQL de récupération">
              <AlertCircle size={12} strokeWidth={2.4} />
              <span>Profil manquant</span>
            </div>
            <button
              onClick={logout}
              disabled={out}
              className={cn(
                'flex items-center gap-sm h-8 px-md rounded-md',
                'border border-danger/40 bg-danger/10 text-danger',
                'hover:bg-danger/20 hover:border-danger transition-all duration-150',
                'disabled:opacity-50',
              )}
              title="Se déconnecter (le profil est manquant — Nuclear l'a peut-être supprimé)"
            >
              <LogOut size={14} strokeWidth={2.4} />
              <span className="text-caption font-semibold hidden sm:inline">
                {out ? 'Déconnexion…' : 'Déconnexion'}
              </span>
            </button>
          </div>
        )}

        {/* User menu */}
        {profile && (
          <div className="relative" data-user-menu>
            <button
              onClick={() => setUserMenuOpen(o => !o)}
              className={cn(
                'flex items-center gap-sm h-8 px-2 sm:px-md rounded-md',
                'border border-border bg-surface-sunk/50',
                'hover:bg-surface-hover hover:border-border-strong',
                'transition-all duration-150',
              )}
            >
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                   style={{ background: 'color-mix(in srgb, var(--neon) 25%, transparent)', color: 'var(--neon)' }}>
                {(profile.full_name ?? profile.email).slice(0, 1).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left leading-tight min-w-0 max-w-[140px]">
                <div className="text-caption font-semibold text-fg-primary truncate">{profile.full_name ?? profile.email}</div>
                <div className="text-[9px] font-mono text-fg-tertiary truncate">{role?.name ?? 'Sans rôle'}</div>
              </div>
              <ChevronDown size={12} strokeWidth={2.2} className={cn(
                'text-fg-tertiary transition-transform hidden sm:block',
                userMenuOpen && 'rotate-180'
              )} />
            </button>

            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    'absolute right-0 top-full mt-1 z-50',
                    'min-w-[220px] rounded-md',
                    'bg-surface-raised border border-border-strong',
                    'shadow-overlay overflow-hidden',
                  )}
                >
                  {/* Header */}
                  <div className="px-md py-sm border-b border-border bg-surface-sunk">
                    <div className="text-body-sm font-semibold text-fg-primary truncate">
                      {profile.full_name ?? 'Utilisateur'}
                    </div>
                    <div className="text-caption font-mono text-fg-tertiary truncate">
                      {profile.email}
                    </div>
                    {role && (
                      <Badge variant="brand" size="xs" className="mt-xs">{role.name}</Badge>
                    )}
                  </div>

                  {/* Items */}
                  <div className="p-1">
                    <button
                      onClick={triggerCmdK}
                      className="w-full flex items-center gap-sm px-md py-2 rounded-md text-body-sm text-fg-secondary hover:bg-surface-hover hover:text-fg-primary transition-colors"
                    >
                      <Search size={14} strokeWidth={2.2} />
                      <span className="flex-1 text-left">Recherche rapide</span>
                      <span className="flex items-center gap-0.5">
                        <kbd className="px-1 py-0.5 rounded border border-border text-[9px] font-mono">{isMac ? '⌘' : 'Ctrl'}</kbd>
                        <kbd className="px-1 py-0.5 rounded border border-border text-[9px] font-mono">K</kbd>
                      </span>
                    </button>
                    <button
                      onClick={() => { setUserMenuOpen(false); router.push('/guide') }}
                      className="w-full flex items-center gap-sm px-md py-2 rounded-md text-body-sm text-fg-secondary hover:bg-surface-hover hover:text-fg-primary transition-colors"
                    >
                      <HelpCircle size={14} strokeWidth={2.2} />
                      <span className="flex-1 text-left">Guide utilisateur</span>
                    </button>
                    <button
                      onClick={toggleTheme}
                      className="w-full flex items-center gap-sm px-md py-2 rounded-md text-body-sm text-fg-secondary hover:bg-surface-hover hover:text-fg-primary transition-colors"
                    >
                      {theme === 'dark' ? <Sun size={14} strokeWidth={2.2} /> : <Moon size={14} strokeWidth={2.2} />}
                      <span className="flex-1 text-left">Thème {theme === 'dark' ? 'clair' : 'sombre'}</span>
                    </button>
                  </div>

                  <div className="border-t border-border p-1">
                    <button
                      onClick={logout}
                      disabled={out}
                      className="w-full flex items-center gap-sm px-md py-2 rounded-md text-body-sm text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                    >
                      <LogOut size={14} strokeWidth={2.2} />
                      <span className="flex-1 text-left">{out ? 'Déconnexion…' : 'Se déconnecter'}</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </header>
  )
}
