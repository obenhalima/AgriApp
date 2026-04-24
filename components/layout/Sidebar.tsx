'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth'

/* ── Config navigation avec icônes colorées + code module (pour permissions) ── */
const NAV = [
  {
    section: 'PILOTAGE',
    items: [
      { href:'/',            moduleCode:'dashboard',  label:'Dashboard',    icon:'📊', color:'#6366f1', bg:'rgba(99,102,241,.15)' },
      { href:'/recoltes',   moduleCode:'recoltes',   label:'Récoltes',     icon:'🌿', color:'#10b981', bg:'rgba(16,185,129,.15)' },
      { href:'/production', moduleCode:'production', label:'Production',   icon:'⚙️', color:'#f59e0b', bg:'rgba(245,158,11,.15)' },
      { href:'/agronomie',  moduleCode:'agronomie',  label:'Agronomie',    icon:'🔬', color:'#06b6d4', bg:'rgba(6,182,212,.15)'  },
    ],
  },
  {
    section: 'COMMERCE',
    items: [
      { href:'/marches',    moduleCode:'marches',   label:'Marchés',      icon:'🌍', color:'#3b82f6', bg:'rgba(59,130,246,.15)' },
      { href:'/clients',    moduleCode:'clients',   label:'Clients',      icon:'🤝', color:'#8b5cf6', bg:'rgba(139,92,246,.15)' },
      { href:'/commandes',  moduleCode:'commandes', label:'Commandes',    icon:'📋', color:'#ec4899', bg:'rgba(236,72,153,.15)' },
      { href:'/factures',   moduleCode:'factures',  label:'Factures',     icon:'🧾', color:'#f43f5e', bg:'rgba(244,63,94,.15)'  },
    ],
  },
  {
    section: 'EXPLOITATION',
    items: [
      { href:'/fermes',      moduleCode:'fermes',    label:'Fermes',      icon:'🏭', color:'#64748b', bg:'rgba(100,116,139,.15)'},
      { href:'/serres',      moduleCode:'serres',    label:'Serres',      icon:'🏗️', color:'#0ea5e9', bg:'rgba(14,165,233,.15)' },
      { href:'/varietes',    moduleCode:'varietes',  label:'Variétés',    icon:'🧬', color:'#a855f7', bg:'rgba(168,85,247,.15)' },
      { href:'/campagnes',   moduleCode:'campagnes', label:'Campagnes',   icon:'📅', color:'#22c55e', bg:'rgba(34,197,94,.15)'  },
    ],
  },
  {
    section: 'RESSOURCES',
    items: [
      { href:'/fournisseurs', moduleCode:'fournisseurs', label:'Fournisseurs',icon:'🏢', color:'#f97316', bg:'rgba(249,115,22,.15)' },
      { href:'/achats',       moduleCode:'achats',       label:'Achats',      icon:'🛒', color:'#eab308', bg:'rgba(234,179,8,.15)'  },
      { href:'/stocks',       moduleCode:'stocks',       label:'Stocks',      icon:'📦', color:'#14b8a6', bg:'rgba(20,184,166,.15)' },
    ],
  },
  {
    section: 'FINANCES',
    items: [
      { href:'/couts',      moduleCode:'couts',      label:'Coûts',        icon:'💰', color:'#f59e0b', bg:'rgba(245,158,11,.15)' },
      { href:'/marges',     moduleCode:'marges',     label:'Marges',       icon:'📈', color:'#10b981', bg:'rgba(16,185,129,.15)' },
      { href:'/analytique', moduleCode:'analytique', label:'IA & Prévisions',icon:'🤖',color:'#6366f1',bg:'rgba(99,102,241,.15)'},
    ],
  },
  {
    section: 'PARAMÉTRAGE',
    items: [
      { href:'/admin/account-categories',  moduleCode:'plan_comptable',      label:'Plan comptable',        icon:'📒', color:'#0ea5e9', bg:'rgba(14,165,233,.15)' },
      { href:'/admin/budgets',             moduleCode:'budgets',             label:'Budgets',               icon:'💼', color:'#8b5cf6', bg:'rgba(139,92,246,.15)' },
      { href:'/admin/imports',             moduleCode:'imports',             label:'Imports',               icon:'📥', color:'#06b6d4', bg:'rgba(6,182,212,.15)'  },
      { href:'/admin/compte-exploitation', moduleCode:'compte_exploitation', label:'Compte d\'exploitation', icon:'📈', color:'#10b981', bg:'rgba(16,185,129,.15)' },
      { href:'/admin/workflows',           moduleCode:'workflows',           label:'Workflows',             icon:'🔀', color:'#64748b', bg:'rgba(100,116,139,.15)' },
    ],
  },
  {
    section: 'ADMINISTRATION',
    items: [
      { href:'/admin/users', moduleCode:'users', label:'Utilisateurs',        icon:'👥', color:'#ef4444', bg:'rgba(239,68,68,.15)' },
      { href:'/admin/roles', moduleCode:'roles', label:'Rôles & Permissions', icon:'🔐', color:'#ef4444', bg:'rgba(239,68,68,.15)' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { canAccessModule, loading: authLoading } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [pinned,    setPinned]    = useState(true)
  const [isDark,    setIsDark]    = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [sectionsInitialized, setSectionsInitialized] = useState(false)

  // Filtre les items selon les permissions (tant que l'auth charge, on affiche vide)
  const filteredNav = useMemo(() => {
    if (authLoading) return []
    return NAV
      .map(group => ({
        ...group,
        items: group.items.filter(item => canAccessModule(item.moduleCode)),
      }))
      .filter(group => group.items.length > 0)
  }, [authLoading, canAccessModule])

  // Section courante (celle qui contient l'item actif)
  const activeSection = useMemo(() => {
    return filteredNav.find(g => g.items.some(i => i.href === pathname))?.section
  }, [filteredNav, pathname])

  useEffect(() => {
    // Charger préférences au mount uniquement (pas de boucle possible)
    const savedCollapsed = localStorage.getItem('tp_sidebar_collapsed') === 'true'
    const savedPinned    = localStorage.getItem('tp_sidebar_pinned') !== 'false'
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

  // Auto-déplie la section active quand on navigue
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
  const expandAllSections = () => {
    const next = new Set(filteredNav.map(g => g.section))
    setExpandedSections(next); persistSections(next)
  }
  const collapseAllSections = () => {
    const next = activeSection ? new Set([activeSection]) : new Set<string>()
    setExpandedSections(next); persistSections(next)
  }

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('tp_sidebar_collapsed', String(next))
    // Notifier le layout
    window.dispatchEvent(new CustomEvent('sidebar-change', { detail: { collapsed: next, pinned } }))
  }

  const togglePin = () => {
    const next = !pinned
    setPinned(next)
    localStorage.setItem('tp_sidebar_pinned', String(next))
    window.dispatchEvent(new CustomEvent('sidebar-change', { detail: { collapsed, pinned: next } }))
  }

  const W = collapsed ? 60 : 220

  // Couleurs selon thème
  const sidebarBg     = isDark ? '#0a1810' : 'linear-gradient(160deg,#1e1b4b 0%,#312e81 55%,#4338ca 100%)'
  const sidebarBorder = isDark ? '1px solid #1a3526' : 'none'
  const logoBg        = isDark ? 'rgba(0,232,122,.15)' : 'rgba(255,255,255,.15)'
  const logoText      = isDark ? '#e8f5ee' : '#fff'
  const logoSub       = isDark ? '#3d6b52' : 'rgba(255,255,255,.4)'
  const sectionColor  = isDark ? '#3d6b52' : 'rgba(255,255,255,.35)'
  const pinBg         = isDark ? '#0d1f14' : 'rgba(255,255,255,.08)'
  const pinBorder     = isDark ? '#1a3526' : 'rgba(255,255,255,.15)'
  const pinColor      = isDark ? '#3d6b52' : 'rgba(255,255,255,.5)'
  const pinActiveColor= isDark ? '#00e87a' : '#fff'
  const pinActiveBg   = isDark ? '#0f2518'  : 'rgba(255,255,255,.18)'
  const dividerColor  = isDark ? '#1a3526'  : 'rgba(255,255,255,.12)'

  return (
    <>
      <style>{`
        @keyframes scanline{0%{top:0}100%{top:100%}}
        .sidebar-scan{position:absolute;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--neon),transparent);opacity:.12;animation:scanline 14s linear infinite;pointer-events:none;z-index:0}
        [data-theme="light"] .sidebar-scan{display:none}
        .sidebar-navitem{transition:background .12s,color .12s}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
      `}</style>

      <aside style={{
        position: pinned ? 'fixed' : 'fixed',
        top: 0, left: 0, bottom: 0,
        width: W,
        zIndex: 50,
        display: 'flex', flexDirection: 'column',
        background: sidebarBg,
        border: sidebarBorder,
        transition: 'width .25s cubic-bezier(.4,0,.2,1)',
        overflow: 'hidden',
        boxShadow: isDark ? 'none' : '4px 0 24px rgba(0,0,0,.15)',
      }}>
        <div className="sidebar-scan" />

        {/* ── Logo ── */}
        <div style={{ padding: collapsed ? '14px 12px' : '14px 14px 10px', borderBottom: `1px solid ${dividerColor}`, flexShrink: 0, position: 'relative', zIndex: 1 }}>
          {collapsed ? (
            <div style={{ width: 36, height: 36, borderRadius: 10, background: logoBg, border: `1px solid ${pinBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer' }} onClick={toggleCollapse}>
              🍅
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: logoBg, border: `1px solid ${pinBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🍅</div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: 800, color: logoText, letterSpacing: -.2, lineHeight: 1.1 }}>Domaine BENHALIMA</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: logoSub, letterSpacing: 1.5, marginTop: 2, textTransform: 'uppercase' }}>MES Production</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Navigation ── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: 6, position: 'relative', zIndex: 1 }}>
          {/* Boutons rapides en mode étendu */}
          {!collapsed && filteredNav.length > 0 && (
            <div style={{ display: 'flex', gap: 4, padding: '6px 10px 10px' }}>
              <button onClick={expandAllSections}
                style={{ flex: 1, padding: '4px 6px', border: `1px solid ${pinBorder}`, background: 'transparent', color: pinColor, borderRadius: 5, fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: .5, cursor: 'pointer' }}>
                ⇓ Tout
              </button>
              <button onClick={collapseAllSections}
                style={{ flex: 1, padding: '4px 6px', border: `1px solid ${pinBorder}`, background: 'transparent', color: pinColor, borderRadius: 5, fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: .5, cursor: 'pointer' }}>
                ⇑ Replier
              </button>
            </div>
          )}

          {filteredNav.map((group, gi) => {
            const isExpanded = collapsed ? true : expandedSections.has(group.section)
            const hasActiveItem = group.items.some(i => i.href === pathname)
            return (
            <div key={gi} style={{ marginBottom: 2 }}>
              {/* Section header */}
              {!collapsed && (
                <button
                  onClick={() => toggleSection(group.section)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 14px 7px', marginTop: gi > 0 ? 4 : 0,
                    background: hasActiveItem && !isExpanded ? (isDark ? 'rgba(0,232,122,.04)' : 'rgba(255,255,255,.06)') : 'transparent',
                    border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 600,
                    color: hasActiveItem ? (isDark ? 'var(--neon)' : '#fff') : sectionColor,
                    textTransform: 'uppercase', letterSpacing: '1.8px',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = hasActiveItem && !isExpanded ? (isDark ? 'rgba(0,232,122,.04)' : 'rgba(255,255,255,.06)') : 'transparent')}
                >
                  <span style={{ fontSize: 9, opacity: .7, transition: 'transform .15s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
                  <span style={{ flex: 1, textAlign: 'left' }}>{group.section}</span>
                  <span style={{ fontSize: 8, opacity: .5, fontFamily: 'var(--font-mono)', letterSpacing: 0 }}>
                    {group.items.length}
                  </span>
                  {hasActiveItem && !isExpanded && (
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: isDark ? '#00e87a' : '#fff' }} />
                  )}
                </button>
              )}
              {collapsed && gi > 0 && <div style={{ height: 1, background: dividerColor, margin: '4px 10px' }} />}

              {isExpanded && group.items.map(item => {
                const active = pathname === item.href
                return collapsed ? (
                  /* Mode rétracté — icône seule avec tooltip */
                  <div key={item.href} title={item.label} style={{ padding: '3px 10px' }}>
                    <Link href={item.href} style={{ textDecoration: 'none', display: 'block' }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 9,
                        background: active ? (isDark ? 'rgba(0,232,122,.15)' : 'rgba(255,255,255,.2)') : 'transparent',
                        border: active ? `1px solid ${isDark ? 'rgba(0,232,122,.3)' : 'rgba(255,255,255,.3)'}` : '1px solid transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 17, cursor: 'pointer', transition: 'all .12s',
                      }}>
                        {item.icon}
                      </div>
                    </Link>
                  </div>
                ) : (
                  /* Mode étendu — icône + label */
                  <Link key={item.href} href={item.href}
                    className={`nav-item sidebar-navitem${active ? ' active' : ''}`}
                    style={{ textDecoration: 'none', margin: '1px 6px', borderRadius: 8, borderLeft: 'none' }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 7,
                      background: active ? item.bg : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, flexShrink: 0, transition: 'background .12s',
                    }}>
                      {item.icon}
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 500 }}>{item.label}</span>
                    {active && <span style={{ marginLeft: 'auto', width: 4, height: 4, borderRadius: '50%', background: isDark ? '#00e87a' : '#fff', flexShrink: 0 }} />}
                  </Link>
                )
              })}
            </div>
          )})}
        </div>

        {/* ── Boutons Fixe / Réduire ── */}
        <div style={{ padding: collapsed ? '8px 10px' : '8px 10px', borderTop: `1px solid ${dividerColor}`, flexShrink: 0, position: 'relative', zIndex: 1, display: 'flex', gap: 4 }}>
          {collapsed ? (
            <button onClick={toggleCollapse} title="Étendre" style={{ flex: 1, padding: '7px', border: `1px solid ${pinBorder}`, borderRadius: 8, background: pinBg, color: pinColor, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ›
            </button>
          ) : (
            <>
              <button onClick={togglePin} title={pinned ? 'Déséépingler' : 'Épingler'} style={{ flex: 1, padding: '7px 6px', border: `1px solid ${pinned ? pinBorder : pinBorder}`, borderRadius: 8, background: pinned ? pinActiveBg : pinBg, color: pinned ? pinActiveColor : pinColor, fontSize: 10, fontFamily: 'var(--font-mono)', cursor: 'pointer', letterSpacing: .5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                {pinned ? '📌' : '📌'} {pinned ? 'FIXE' : 'FIXE'}
              </button>
              <button onClick={toggleCollapse} title="Réduire" style={{ flex: 1, padding: '7px 6px', border: `1px solid ${pinBorder}`, borderRadius: 8, background: pinBg, color: pinColor, fontSize: 10, fontFamily: 'var(--font-mono)', cursor: 'pointer', letterSpacing: .5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                ‹ RÉD.
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  )
}
