'use client'
/**
 * Command Palette — Cmd+K (Mac) / Ctrl+K (Windows)
 *
 * Inspiré de Linear / Vercel / Notion. Permet :
 *   - Navigation rapide vers toutes les pages
 *   - Quick actions (créer une récolte, etc.)
 *   - Toggle thème
 *   - Recherche fuzzy avec keywords
 *
 * Raccourci global : Cmd+K ou Ctrl+K, n'importe où dans l'app.
 */
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import * as Dialog from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, ArrowRight, Sun, Moon, LogOut, Sparkles, Zap, Hash,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { NAV, QUICK_ACTIONS, flattenNav } from '@/lib/navigation'
import { useAuth } from '@/lib/auth'
import { getTheme, setTheme } from '@/lib/theme'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const router = useRouter()
  const { canAccessModule, signOut } = useAuth()

  // Raccourci clavier global
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) ou Ctrl+K (Windows/Linux)
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => !o)
      }
      // Escape gérée par Radix Dialog
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Réinitialise la recherche à l'ouverture
  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  // Items de nav filtrés par permissions
  const navItems = useMemo(() => {
    return flattenNav().filter(({ item }) => canAccessModule(item.moduleCode))
  }, [canAccessModule])

  const quickActions = useMemo(() => {
    return QUICK_ACTIONS.filter(qa => !qa.moduleCode || canAccessModule(qa.moduleCode))
  }, [canAccessModule])

  const runCommand = (action: () => void) => {
    setOpen(false)
    // Petit délai pour fermer le modal proprement avant l'action
    setTimeout(action, 50)
  }

  const navigate = (href: string) => runCommand(() => router.push(href))
  const toggleTheme = () => runCommand(() => {
    const next = getTheme() === 'dark' ? 'light' : 'dark'
    setTheme(next)
  })
  const logout = () => runCommand(async () => {
    await signOut()
    router.replace('/login')
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild aria-describedby={undefined}>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -4 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  'fixed left-1/2 top-[15vh] z-[101] -translate-x-1/2',
                  'w-full max-w-[640px] mx-md',
                  'bg-surface-raised border border-border-strong rounded-xl',
                  'shadow-modal overflow-hidden',
                )}
              >
                <Dialog.Title className="sr-only">Recherche rapide</Dialog.Title>

                <Command
                  shouldFilter
                  className="flex flex-col"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setOpen(false)
                  }}
                >
                  {/* ─── Search input ─── */}
                  <div className="flex items-center gap-md px-md py-md border-b border-border">
                    <Search size={18} className="text-fg-tertiary flex-shrink-0" strokeWidth={2.2} />
                    <Command.Input
                      autoFocus
                      value={search}
                      onValueChange={setSearch}
                      placeholder="Rechercher une page, une action…"
                      className="flex-1 bg-transparent outline-none text-fg-primary placeholder:text-fg-tertiary text-body"
                    />
                    <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border text-[10px] font-mono text-fg-tertiary">
                      ESC
                    </kbd>
                  </div>

                  <Command.List className="max-h-[60vh] overflow-y-auto p-sm">
                    <Command.Empty className="py-xl text-center text-fg-tertiary text-body-sm font-mono">
                      <Sparkles size={20} className="mx-auto mb-sm opacity-50" />
                      Aucun résultat pour <span className="text-fg-secondary">"{search}"</span>
                    </Command.Empty>

                    {/* ─── Quick Actions ─── */}
                    {quickActions.length > 0 && (
                      <Command.Group
                        heading="ACTIONS RAPIDES"
                        className={cn(
                          '[&_[cmdk-group-heading]]:px-md [&_[cmdk-group-heading]]:py-xs',
                          '[&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-tertiary [&_[cmdk-group-heading]]:font-semibold'
                        )}
                      >
                        {quickActions.map(qa => {
                          const Icon = qa.icon
                          return (
                            <PaletteItem
                              key={qa.id}
                              value={`${qa.label} ${(qa.keywords ?? []).join(' ')}`}
                              onSelect={() => navigate(qa.href)}
                              icon={<Icon size={16} strokeWidth={2.2} style={{ color: qa.color }} />}
                              accent={qa.color}
                              label={qa.label}
                              hint="Action"
                            />
                          )
                        })}
                      </Command.Group>
                    )}

                    {/* ─── Pages (regroupées par section) ─── */}
                    {NAV.map(section => {
                      const items = section.items.filter(it => canAccessModule(it.moduleCode))
                      if (items.length === 0) return null
                      return (
                        <Command.Group
                          key={section.section}
                          heading={section.section}
                          className={cn(
                            '[&_[cmdk-group-heading]]:px-md [&_[cmdk-group-heading]]:py-xs [&_[cmdk-group-heading]]:mt-sm',
                            '[&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-tertiary [&_[cmdk-group-heading]]:font-semibold'
                          )}
                        >
                          {items.map(item => {
                            const Icon = item.icon
                            return (
                              <PaletteItem
                                key={item.href}
                                value={`${item.label} ${section.section} ${(item.keywords ?? []).join(' ')}`}
                                onSelect={() => navigate(item.href)}
                                icon={<Icon size={16} strokeWidth={2.2} style={{ color: item.color }} />}
                                accent={item.color}
                                label={item.label}
                                hint={item.href}
                                shortcut={item.shortcut}
                              />
                            )
                          })}
                        </Command.Group>
                      )
                    })}

                    {/* ─── Système ─── */}
                    <Command.Group
                      heading="SYSTÈME"
                      className={cn(
                        '[&_[cmdk-group-heading]]:px-md [&_[cmdk-group-heading]]:py-xs [&_[cmdk-group-heading]]:mt-sm',
                        '[&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-tertiary [&_[cmdk-group-heading]]:font-semibold'
                      )}
                    >
                      <PaletteItem
                        value="theme switch toggle dark light"
                        onSelect={toggleTheme}
                        icon={<Sun size={16} strokeWidth={2.2} className="text-warning" />}
                        accent="#f59e0b"
                        label="Basculer le thème (clair/sombre)"
                        hint="Système"
                      />
                      <PaletteItem
                        value="logout signout deconnexion"
                        onSelect={logout}
                        icon={<LogOut size={16} strokeWidth={2.2} className="text-danger" />}
                        accent="#ef4444"
                        label="Se déconnecter"
                        hint="Système"
                      />
                    </Command.Group>
                  </Command.List>

                  {/* ─── Footer hints ─── */}
                  <div className="border-t border-border bg-surface-sunk px-md py-xs flex items-center justify-between text-[10px] text-fg-tertiary font-mono">
                    <div className="flex items-center gap-md">
                      <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 rounded bg-surface-raised border border-border">↑</kbd>
                        <kbd className="px-1.5 py-0.5 rounded bg-surface-raised border border-border">↓</kbd>
                        <span className="ml-1">naviguer</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 rounded bg-surface-raised border border-border">↵</kbd>
                        <span className="ml-1">sélectionner</span>
                      </span>
                    </div>
                    <span className="hidden sm:flex items-center gap-1">
                      <Zap size={9} />
                      FarmPilot
                    </span>
                  </div>
                </Command>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

// ════════════════════════════════════════════════════════════════════════════
function PaletteItem({
  value, onSelect, icon, accent, label, hint, shortcut,
}: {
  value: string
  onSelect: () => void
  icon: React.ReactNode
  accent: string
  label: string
  hint?: string
  shortcut?: string[]
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'flex items-center gap-md px-md py-2 mx-1 rounded-md cursor-pointer',
        'text-fg-primary text-body-sm',
        // Style item sélectionné (cmdk gère le data-selected)
        'data-[selected=true]:bg-surface-hover',
        'data-[selected=true]:shadow-sm',
        'transition-colors duration-100',
      )}
    >
      <span
        className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
      >
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {hint && (
        <span className="text-caption font-mono text-fg-tertiary hidden sm:inline-flex items-center gap-1">
          <Hash size={10} className="opacity-50" />
          {hint}
        </span>
      )}
      {shortcut && (
        <span className="flex items-center gap-1">
          {shortcut.map((k, i) => (
            <kbd key={i} className="px-1.5 py-0.5 rounded border border-border bg-surface-sunk text-[9px] font-mono text-fg-tertiary">{k}</kbd>
          ))}
        </span>
      )}
      <ArrowRight size={14} className="text-fg-tertiary opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
    </Command.Item>
  )
}
