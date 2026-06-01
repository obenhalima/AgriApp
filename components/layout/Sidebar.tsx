'use client'
/**
 * Sidebar refondue (V2) :
 * - Icône colorée par section (cohérent avec la palette navigation)
 * - Tagline sous chaque section (description courte)
 * - Item actif avec barre latérale gauche colorée + glow subtil
 * - Animations smooth (Framer Motion)
 * - Hover plus élégant (slide + élévation)
 * - Mode collapsed icon-only avec tooltip natif au hover
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight, Pin, PinOff, PanelLeftClose, PanelLeftOpen,
  ChevronsUpDown, ChevronsDownUp, Sprout,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { NAV } from '@/lib/navigation'
import { getOrganization, type OrganizationSettings } from '@/lib/appSettings'
import { useRealtimeReload } from '@/lib/useRealtimeReload'

export function Sidebar() {
  const pathname = usePathname()
  const { canAccessModule, loading: authLoading } = useAuth()

  const [collapsed, setCollapsed] = useState(false)
  const [pinned, setPinned] = useState(true)
  const [isDark, setIsDark] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [sectionsInitialized, setSectionsInitialized] = useState(false)
  const [org, setOrg] = useState<OrganizationSettings>({ name: 'Domaine BENHALIMA', tagline: 'MES Production' })

  // Charge l'identité du domaine (visible dans le logo en haut)
  const loadOrg = async () => {
    try { setOrg(await getOrganization()) } catch { /* fallback default */ }
  }
  useEffect(() => { loadOrg() }, [])

  // Realtime : si admin change le nom, on le voit live
  useRealtimeReload(
    ['app_settings'],
    loadOrg,
    { channelName: 'sidebar-org', debounceMs: 300, verbose: false },
  )

  // Filtrage permissions
  const filteredNav = useMemo(() => {
    if (authLoading) return []
    return NAV
      .map(group => ({ ...group, items: group.items.filter(item => canAccessModule(item.moduleCode)) }))
      .filter(group => group.items.length > 0)
  }, [authLoading, canAccessModule])

  const activeSection = useMemo(() => {
    return filteredNav.find(g => g.items.some(i => i.href === pathname))?.section
  }, [filteredNav, pathname])

  // Init préférences depuis localStorage
  useEffect(() => {
    const savedCollapsed = localStorage.getItem('tp_sidebar_collapsed') === 'true'
    const savedPinned = localStorage.getItem('tp_sidebar_pinned') !== 'false'
    setCollapsed(savedCollapsed)
    setPinned(savedPinned)

    const savedSections = localStorage.getItem('tp_sidebar_sections')
    const initial = new Set<string>()
    if (savedSections) {
      try { JSON.parse(savedSections).forEach((s: string) => initial.add(s)) } catch {}
    }
    setExpandedSections(initial)
    setSectionsInitialized(true)

    const check = () => setIsDark(document.documentElement.getAttribute('data-theme') !== 'light')
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  // Auto-déplie la section active
  useEffect(() => {
    if (!sectionsInitialized || !activeSection) return
    setExpandedSections(prev => {
      if (prev.has(activeSection)) return prev
      const next = new Set(prev)
      next.add(activeSection)
      return next
    })
  }, [activeSection, sectionsInitialized])

  const persistSections = (next: Set<string>) => {
    try { localStorage.setItem('tp_sidebar_sections', JSON.stringify(Array.from(next))) } catch {}
  }
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section); else next.add(section)
      persistSections(next)
      return next
    })
  }
  const expandAll = () => {
    const next = new Set(filteredNav.map(g => g.section))
    setExpandedSections(next); persistSections(next)
  }
  const collapseAll = () => {
    const next = activeSection ? new Set([activeSection]) : new Set<string>()
    setExpandedSections(next); persistSections(next)
  }
  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('tp_sidebar_collapsed', String(next))
    window.dispatchEvent(new CustomEvent('sidebar-change', { detail: { collapsed: next, pinned } }))
  }
  const togglePin = () => {
    const next = !pinned
    setPinned(next)
    localStorage.setItem('tp_sidebar_pinned', String(next))
    window.dispatchEvent(new CustomEvent('sidebar-change', { detail: { collapsed, pinned: next } }))
  }

  const W = collapsed ? 64 : 240   // un peu plus large pour respirer

  // ─── Palette adaptative ───
  const sidebarBg = isDark
    ? 'linear-gradient(180deg, #050d09 0%, #081410 100%)'
    : 'linear-gradient(170deg, #1e1b4b 0%, #312e81 50%, #3730a3 100%)'
  const sidebarBorder = isDark ? '1px solid #1a3526' : 'none'
  const dividerColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.08)'
  const logoBg = isDark ? 'rgba(0,232,122,.12)' : 'rgba(255,255,255,.12)'
  const logoBorderColor = isDark ? 'rgba(0,232,122,.22)' : 'rgba(255,255,255,.18)'
  const logoText = isDark ? '#e8f5ee' : '#fff'
  const logoSub = isDark ? '#5a9376' : 'rgba(255,255,255,.55)'
  // Couleurs contrastées pour distinguer hiérarchie :
  //   • Parent (section) : teinte verte accentuée (mode dark) / blanc cassé (light)
  //   • Enfant (item)    : ton neutre gris-blanc → contraste visible avec parent
  const sectionLabel = isDark ? '#7dd09b' : 'rgba(255,255,255,.92)'      // parent : vert + saturé
  const sectionLabelHover = isDark ? '#a8e8be' : '#fff'
  const sectionLabelActive = isDark ? 'var(--neon)' : '#fff'
  const sectionTagline = isDark ? 'rgba(125,208,155,.5)' : 'rgba(255,255,255,.55)'
  const itemColor = isDark ? '#d0d8db' : 'rgba(255,255,255,.75)'         // enfant : gris neutre (plus de vert)
  const itemHoverColor = isDark ? '#ffffff' : '#fff'
  const itemActiveColor = isDark ? 'var(--neon)' : '#fff'
  // Ligne verticale guide entre les enfants et le bord gauche
  const childGuideColor = isDark ? 'rgba(125,208,155,.18)' : 'rgba(255,255,255,.14)'

  return (
    <>
      <style>{`
        @keyframes sidebarScan { 0%{top:-1px} 100%{top:100%} }
        .sb-scan {
          position:absolute; left:0; right:0; height:1px;
          background: linear-gradient(90deg, transparent, var(--neon), transparent);
          opacity:.16; animation: sidebarScan 16s linear infinite; pointer-events:none; z-index:0;
        }
        [data-theme="light"] .sb-scan {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.4), transparent);
          opacity: .22;
        }
      `}</style>

      <motion.aside
        initial={false}
        animate={{ width: W }}
        transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
        className="fixed left-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
        style={{
          background: sidebarBg,
          border: sidebarBorder,
          boxShadow: isDark ? '4px 0 24px rgba(0,0,0,.4)' : '4px 0 28px rgba(15,23,42,.18)',
        }}
      >
        <div className="sb-scan" />

        {/* ═══════════ LOGO ═══════════ */}
        <div
          className="flex-shrink-0 relative z-[1]"
          style={{
            padding: collapsed ? '16px 14px' : '16px 16px 14px',
            borderBottom: `1px solid ${dividerColor}`,
          }}
        >
          {collapsed ? (
            <div
              onClick={toggleCollapse}
              title="Étendre le menu"
              className="cursor-pointer w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:scale-105"
              style={{
                background: logoBg,
                border: `1px solid ${logoBorderColor}`,
                boxShadow: isDark ? '0 0 16px rgba(0,232,122,.2)' : 'none',
              }}
            >
              <Sprout size={18} className="text-brand" strokeWidth={2.5} />
            </div>
          ) : (
            <div className="flex items-center gap-sm">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: logoBg,
                  border: `1px solid ${logoBorderColor}`,
                  boxShadow: isDark ? '0 0 14px rgba(0,232,122,.18)' : '0 2px 8px rgba(0,0,0,.12)',
                }}
              >
                <Sprout size={17} className="text-brand" strokeWidth={2.5} />
              </motion.div>
              <div className="min-w-0 flex-1">
                <div
                  className="font-display text-[14px] font-extrabold leading-tight truncate"
                  style={{ color: logoText, letterSpacing: '-0.2px' }}
                  title={org.name}
                >
                  {org.name}
                </div>
                <div
                  className="font-mono text-[8px] tracking-[1.6px] uppercase mt-0.5 truncate"
                  style={{ color: logoSub }}
                  title={org.tagline ?? ''}
                >
                  {org.tagline ?? 'MES Production'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════ NAVIGATION ═══════════ */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden pt-2 relative z-[1]">

          {/* Boutons rapides */}
          {!collapsed && filteredNav.length > 0 && (
            <div className="flex gap-1 px-md pb-sm">
              <button
                onClick={expandAll}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[9px] font-mono uppercase tracking-wider transition-colors"
                style={{
                  border: `1px solid ${dividerColor}`,
                  color: sectionLabel,
                  background: 'rgba(255,255,255,.02)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(0,232,122,.06)' : 'rgba(255,255,255,.08)'
                  e.currentTarget.style.color = sectionLabelHover
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,.02)'
                  e.currentTarget.style.color = sectionLabel
                }}
              >
                <ChevronsUpDown size={10} /> Tout
              </button>
              <button
                onClick={collapseAll}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[9px] font-mono uppercase tracking-wider transition-colors"
                style={{
                  border: `1px solid ${dividerColor}`,
                  color: sectionLabel,
                  background: 'rgba(255,255,255,.02)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(0,232,122,.06)' : 'rgba(255,255,255,.08)'
                  e.currentTarget.style.color = sectionLabelHover
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,.02)'
                  e.currentTarget.style.color = sectionLabel
                }}
              >
                <ChevronsDownUp size={10} /> Replier
              </button>
            </div>
          )}

          {filteredNav.map((group, gi) => {
            const isExpanded = collapsed ? true : expandedSections.has(group.section)
            const hasActive = group.items.some(i => i.href === pathname)
            const SectionIcon = group.icon
            const sectionColor = group.color ?? '#64748b'

            return (
              <div key={gi} className="mb-1">
                {/* ═══ Section header ═══ */}
                {!collapsed && (
                  <button
                    onClick={() => toggleSection(group.section)}
                    className="group/section w-full flex items-center gap-sm px-md py-2 mt-2 transition-all"
                    style={{
                      background: hasActive && !isExpanded
                        ? (isDark ? `color-mix(in srgb, ${sectionColor} 8%, transparent)` : 'rgba(255,255,255,.06)')
                        : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!(hasActive && !isExpanded)) {
                        e.currentTarget.style.background = isDark ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.04)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!(hasActive && !isExpanded)) {
                        e.currentTarget.style.background = 'transparent'
                      }
                    }}
                  >
                    <motion.span
                      animate={{ rotate: isExpanded ? 90 : 0 }}
                      transition={{ duration: 0.18 }}
                      style={{ color: sectionLabel, opacity: 0.6 }}
                      className="flex-shrink-0"
                    >
                      <ChevronRight size={10} strokeWidth={2.5} />
                    </motion.span>
                    {SectionIcon && (
                      <span
                        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                        style={{
                          background: hasActive
                            ? `color-mix(in srgb, ${sectionColor} 22%, transparent)`
                            : `color-mix(in srgb, ${sectionColor} 10%, transparent)`,
                          color: hasActive
                            ? sectionLabelActive
                            : sectionLabel,
                        }}
                      >
                        <SectionIcon size={11} strokeWidth={2.4} />
                      </span>
                    )}
                    <div className="flex-1 text-left min-w-0">
                      <div
                        className="font-mono text-[9.5px] font-bold uppercase tracking-[1.4px] leading-tight transition-colors truncate"
                        style={{ color: hasActive ? sectionLabelActive : sectionLabel }}
                      >
                        {group.section}
                      </div>
                      {group.tagline && (
                        <div
                          className="text-[8.5px] mt-0.5 truncate transition-colors"
                          style={{
                            color: sectionTagline,
                            fontFamily: 'var(--font-body)',
                          }}
                        >
                          {group.tagline}
                        </div>
                      )}
                    </div>
                    <span
                      className="text-[8px] font-mono opacity-50 flex-shrink-0"
                      style={{ color: sectionLabel }}
                    >
                      {group.items.length}
                    </span>
                    {hasActive && !isExpanded && (
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          background: sectionColor,
                          boxShadow: `0 0 8px ${sectionColor}`,
                        }}
                      />
                    )}
                  </button>
                )}

                {collapsed && gi > 0 && (
                  <div className="h-px mx-3 my-1.5" style={{ background: dividerColor }} />
                )}

                {/* ═══ Items ═══ */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                      style={!collapsed ? {
                        // Ligne verticale guide à gauche des enfants pour montrer la hierarchie
                        borderLeft: `1px solid ${childGuideColor}`,
                        marginLeft: 18,        // niveau d'indentation des enfants
                        paddingLeft: 4,
                        marginTop: 2,
                        marginBottom: 4,
                      } : undefined}
                    >
                      {group.items.map((item) => {
                        const Icon = item.icon
                        const active = pathname === item.href
                        if (collapsed) {
                          return (
                            <Link key={item.href} href={item.href} title={item.label} className="block px-2.5 py-1">
                              <div
                                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200"
                                style={{
                                  background: active
                                    ? `color-mix(in srgb, ${item.color} 18%, transparent)`
                                    : 'transparent',
                                  border: active
                                    ? `1px solid color-mix(in srgb, ${item.color} 45%, transparent)`
                                    : '1px solid transparent',
                                  color: active ? item.color : itemColor,
                                  boxShadow: active
                                    ? `0 0 12px color-mix(in srgb, ${item.color} 30%, transparent)`
                                    : 'none',
                                }}
                                onMouseEnter={(e) => {
                                  if (!active) {
                                    e.currentTarget.style.background = isDark ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.08)'
                                    e.currentTarget.style.color = itemHoverColor
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!active) {
                                    e.currentTarget.style.background = 'transparent'
                                    e.currentTarget.style.color = itemColor
                                  }
                                }}
                              >
                                <Icon size={16} strokeWidth={2.2} />
                              </div>
                            </Link>
                          )
                        }
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className="group/item relative flex items-center gap-sm ml-1 mr-2 my-0.5 px-2 py-1.5 rounded-md transition-all duration-150"
                            style={{
                              background: active
                                ? (isDark
                                    ? `linear-gradient(90deg, color-mix(in srgb, ${item.color} 14%, transparent), transparent 80%)`
                                    : 'rgba(255,255,255,.18)')
                                : 'transparent',
                              color: active ? itemActiveColor : itemColor,
                              boxShadow: active && isDark
                                ? `inset 3px 0 0 ${item.color}`
                                : active && !isDark
                                ? 'inset 3px 0 0 #fff'
                                : 'none',
                            }}
                            onMouseEnter={(e) => {
                              if (!active) {
                                e.currentTarget.style.background = isDark ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.08)'
                                e.currentTarget.style.color = itemHoverColor
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!active) {
                                e.currentTarget.style.background = 'transparent'
                                e.currentTarget.style.color = itemColor
                              }
                            }}
                          >
                            {/* Pastille colorée à gauche pour item actif (en plus du shadow inset) */}
                            <div
                              className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-all"
                              style={{
                                background: active
                                  ? `color-mix(in srgb, ${item.color} 22%, transparent)`
                                  : 'transparent',
                                color: active ? item.color : 'currentColor',
                              }}
                            >
                              <Icon size={14} strokeWidth={2.2} />
                            </div>
                            <span
                              className={cn(
                                'text-[12.5px] flex-1 truncate transition-all',
                                active ? 'font-semibold tracking-tight' : 'font-medium'
                              )}
                            >
                              {item.label}
                            </span>
                            {active && (
                              <motion.span
                                layoutId="active-dot"
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{
                                  background: item.color,
                                  boxShadow: `0 0 8px ${item.color}`,
                                }}
                              />
                            )}
                          </Link>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>

        {/* ═══════════ FOOTER (Pin / Collapse) ═══════════ */}
        <div
          className="flex-shrink-0 relative z-[1] flex gap-1"
          style={{ padding: '10px 12px', borderTop: `1px solid ${dividerColor}` }}
        >
          {collapsed ? (
            <button
              onClick={toggleCollapse}
              title="Étendre"
              className="flex-1 h-9 rounded-md flex items-center justify-center transition-all"
              style={{
                background: 'rgba(255,255,255,.04)',
                border: `1px solid ${dividerColor}`,
                color: sectionLabel,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDark ? 'rgba(0,232,122,.08)' : 'rgba(255,255,255,.12)'
                e.currentTarget.style.color = isDark ? 'var(--neon)' : '#fff'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,.04)'
                e.currentTarget.style.color = sectionLabel
              }}
            >
              <PanelLeftOpen size={14} strokeWidth={2.2} />
            </button>
          ) : (
            <>
              <button
                onClick={togglePin}
                title={pinned ? 'Désépingler' : 'Épingler'}
                className="flex-1 h-7 rounded-md flex items-center justify-center gap-1.5 text-[9px] font-mono uppercase tracking-wider transition-all"
                style={{
                  background: pinned
                    ? (isDark ? 'rgba(0,232,122,.14)' : 'rgba(255,255,255,.18)')
                    : 'rgba(255,255,255,.04)',
                  border: `1px solid ${pinned ? (isDark ? 'rgba(0,232,122,.3)' : 'rgba(255,255,255,.25)') : dividerColor}`,
                  color: pinned ? (isDark ? 'var(--neon)' : '#fff') : sectionLabel,
                }}
              >
                {pinned ? <Pin size={10} strokeWidth={2.4} /> : <PinOff size={10} strokeWidth={2.4} />}
                Fixé
              </button>
              <button
                onClick={toggleCollapse}
                title="Réduire"
                className="flex-1 h-7 rounded-md flex items-center justify-center gap-1.5 text-[9px] font-mono uppercase tracking-wider transition-all"
                style={{
                  background: 'rgba(255,255,255,.04)',
                  border: `1px solid ${dividerColor}`,
                  color: sectionLabel,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.12)'
                  e.currentTarget.style.color = isDark ? '#e8f5ee' : '#fff'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,.04)'
                  e.currentTarget.style.color = sectionLabel
                }}
              >
                <PanelLeftClose size={10} strokeWidth={2.4} />
                Réduire
              </button>
            </>
          )}
        </div>
      </motion.aside>
    </>
  )
}
