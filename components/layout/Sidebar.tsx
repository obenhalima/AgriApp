'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

/* ── Config navigation avec icônes colorées ── */
const NAV = [
  {
    section: 'PILOTAGE',
    items: [
      { href:'/',            label:'Dashboard',    icon:'📊', color:'#6366f1', bg:'rgba(99,102,241,.15)' },
      { href:'/recoltes',   label:'Récoltes',     icon:'🌿', color:'#10b981', bg:'rgba(16,185,129,.15)' },
      { href:'/production', label:'Production',   icon:'⚙️', color:'#f59e0b', bg:'rgba(245,158,11,.15)' },
      { href:'/agronomie',  label:'Agronomie',    icon:'🔬', color:'#06b6d4', bg:'rgba(6,182,212,.15)'  },
    ],
  },
  {
    section: 'COMMERCE',
    items: [
      { href:'/marches',    label:'Marchés',      icon:'🌍', color:'#3b82f6', bg:'rgba(59,130,246,.15)' },
      { href:'/clients',    label:'Clients',      icon:'🤝', color:'#8b5cf6', bg:'rgba(139,92,246,.15)' },
      { href:'/commandes',  label:'Commandes',    icon:'📋', color:'#ec4899', bg:'rgba(236,72,153,.15)' },
      { href:'/factures',   label:'Factures',     icon:'🧾', color:'#f43f5e', bg:'rgba(244,63,94,.15)'  },
    ],
  },
  {
    section: 'EXPLOITATION',
    items: [
      { href:'/fermes',      label:'Fermes',      icon:'🏭', color:'#64748b', bg:'rgba(100,116,139,.15)'},
      { href:'/serres',      label:'Serres',      icon:'🏗️', color:'#0ea5e9', bg:'rgba(14,165,233,.15)' },
      { href:'/varietes',    label:'Variétés',    icon:'🧬', color:'#a855f7', bg:'rgba(168,85,247,.15)' },
      { href:'/campagnes',   label:'Campagnes',   icon:'📅', color:'#22c55e', bg:'rgba(34,197,94,.15)'  },
    ],
  },
  {
    section: 'RESSOURCES',
    items: [
      { href:'/fournisseurs',label:'Fournisseurs',icon:'🏢', color:'#f97316', bg:'rgba(249,115,22,.15)' },
      { href:'/achats',      label:'Achats',      icon:'🛒', color:'#eab308', bg:'rgba(234,179,8,.15)'  },
      { href:'/stocks',      label:'Stocks',      icon:'📦', color:'#14b8a6', bg:'rgba(20,184,166,.15)' },
    ],
  },
  {
    section: 'FINANCES',
    items: [
      { href:'/couts',      label:'Coûts',        icon:'💰', color:'#f59e0b', bg:'rgba(245,158,11,.15)' },
      { href:'/marges',     label:'Marges',       icon:'📈', color:'#10b981', bg:'rgba(16,185,129,.15)' },
      { href:'/analytique', label:'IA & Prévisions',icon:'🤖',color:'#6366f1',bg:'rgba(99,102,241,.15)'},
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [pinned,    setPinned]    = useState(true)
  const [isDark,    setIsDark]    = useState(true)

  useEffect(() => {
    // Charger préférences
    const savedCollapsed = localStorage.getItem('tp_sidebar_collapsed') === 'true'
    const savedPinned    = localStorage.getItem('tp_sidebar_pinned') !== 'false'
    setCollapsed(savedCollapsed)
    setPinned(savedPinned)

    const check = () => setIsDark(document.documentElement.getAttribute('data-theme') !== 'light')
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

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
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: 800, color: logoText, letterSpacing: -.2, lineHeight: 1.1 }}>TomatoPilot</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: logoSub, letterSpacing: 1.5, marginTop: 2, textTransform: 'uppercase' }}>Production MES</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Navigation ── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: 6, position: 'relative', zIndex: 1 }}>
          {NAV.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 2 }}>
              {/* Section header */}
              {!collapsed && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600, color: sectionColor, textTransform: 'uppercase', letterSpacing: '1.8px', padding: '8px 14px 3px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{group.section}</span>
                  <span style={{ flex: 1, height: 1, background: dividerColor }} />
                </div>
              )}
              {collapsed && gi > 0 && <div style={{ height: 1, background: dividerColor, margin: '4px 10px' }} />}

              {group.items.map(item => {
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
          ))}
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
