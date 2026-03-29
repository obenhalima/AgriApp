'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { items: [{ href:'/', label:'Dashboard', icon:'◈' }] },
  { section:'Exploitation', items: [
    { href:'/fermes',    label:'Fermes & Sites', icon:'🏭' },
    { href:'/serres',    label:'Serres',         icon:'⬡' },
    { href:'/varietes',  label:'Varietes',       icon:'✦' },
    { href:'/campagnes', label:'Campagnes',      icon:'◷' },
  ]},
  { section:'Production', items: [
    { href:'/production', label:'Production',  icon:'▲' },
    { href:'/recoltes',   label:'Recoltes',    icon:'◉' },
    { href:'/agronomie',  label:'Agronomie',   icon:'⬨' },
  ]},
  { section:'Commerce', items: [
    { href:'/marches',   label:'Marches',   icon:'◎' },
    { href:'/clients',   label:'Clients',   icon:'◈' },
    { href:'/commandes', label:'Commandes', icon:'▣' },
    { href:'/factures',  label:'Factures',  icon:'▤' },
  ]},
  { section:'Achats', items: [
    { href:'/fournisseurs', label:'Fournisseurs', icon:'⬡' },
    { href:'/achats',       label:'Bons cmde',    icon:'▢' },
    { href:'/stocks',       label:'Stocks',       icon:'⬣' },
  ]},
  { section:'Finances', items: [
    { href:'/couts',      label:'Couts',       icon:'◆' },
    { href:'/marges',     label:'Marges',      icon:'◇' },
    { href:'/analytique', label:'IA / Predict',icon:'◈' },
  ]},
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside style={{
      position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
      width: 'var(--sidebar-w)',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
      background: 'var(--bg-card)',
      borderRight: '1px solid var(--border)',
      transition: 'background .25s, border-color .25s',
    }}>
      {/* Scan line (dark only) */}
      <style>{`
        @keyframes scanline { 0%{top:0} 100%{top:100%} }
        .scan-line {
          position:absolute; left:0; right:0; height:1px;
          background:linear-gradient(90deg,transparent,var(--neon),transparent);
          opacity:.2; animation:scanline 10s linear infinite;
          pointer-events:none; z-index:0;
        }
        [data-theme="light"] .scan-line { display: none; }
      `}</style>
      <div className="scan-line" />

      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 1, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34,
            background: 'linear-gradient(135deg, var(--neon), var(--neon-2))',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, boxShadow: '0 0 14px var(--neon-dim)', flexShrink: 0,
          }}>🍅</div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--tx-1)', letterSpacing: 1.2, textTransform: 'uppercase', lineHeight: 1.1 }}>TomatoPilot</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--tx-3)', letterSpacing: 2, marginTop: 1 }}>AGRITECH v1.0</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, paddingTop: 6, position: 'relative', zIndex: 1 }}>
        {NAV.map((group, gi) => (
          <div key={gi} style={{ marginBottom: 2 }}>
            {group.section && (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 500, color: 'var(--tx-4)',
                textTransform: 'uppercase', letterSpacing: '1.8px', padding: '7px 16px 2px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>{group.section}</span>
                <span style={{ flex: 1, height: 1, background: 'var(--border)', display: 'block' }} />
              </div>
            )}
            {group.items.map(item => {
              const active = pathname === item.href
              return (
                <Link key={item.href} href={item.href}
                  className={`nav-item${active ? ' active' : ''}`}
                  style={{ textDecoration: 'none' }}>
                  <span style={{ fontSize: 11, opacity: .6, flexShrink: 0, width: 16, textAlign: 'center' }}>{item.icon}</span>
                  <span style={{ fontSize: 12.5 }}>{item.label}</span>
                  {active && <span style={{ marginLeft: 'auto', width: 4, height: 4, borderRadius: '50%', background: 'var(--neon)', boxShadow: '0 0 6px var(--neon)', flexShrink: 0 }} />}
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      {/* User */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', position: 'relative', zIndex: 1, flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
          borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-base)',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'var(--neon-dim)', border: '1px solid var(--border-md)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--neon)', flexShrink: 0,
          }}>AH</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 600, color: 'var(--tx-1)', letterSpacing: .3 }}>Ahmed Hassani</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--neon)', letterSpacing: .5 }}>ADMIN</div>
          </div>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--neon)', boxShadow: '0 0 6px var(--neon)', flexShrink: 0 }} />
        </div>
      </div>
    </aside>
  )
}
