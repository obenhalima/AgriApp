'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { items: [{ href: '/', label: 'Tableau de bord' }] },
  { section: 'Exploitation', items: [
    { href: '/serres', label: 'Serres' },
    { href: '/varietes', label: 'Varietes' },
    { href: '/campagnes', label: 'Campagnes' },
  ]},
  { section: 'Production', items: [
    { href: '/production', label: 'Suivi production' },
    { href: '/recoltes', label: 'Recoltes' },
    { href: '/agronomie', label: 'Agronomie' },
  ]},
  { section: 'Commerce', items: [
    { href: '/marches', label: 'Marches' },
    { href: '/clients', label: 'Clients' },
    { href: '/commandes', label: 'Commandes' },
    { href: '/factures', label: 'Factures' },
  ]},
  { section: 'Achats', items: [
    { href: '/fournisseurs', label: 'Fournisseurs' },
    { href: '/achats', label: 'Bons de commande' },
    { href: '/stocks', label: 'Stocks' },
  ]},
  { section: 'Finances', items: [
    { href: '/couts', label: 'Couts & Budget' },
    { href: '/marges', label: 'Marges' },
    { href: '/analytique', label: 'IA & Previsions' },
  ]},
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside style={{
      position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
      width: 200, display: 'flex', flexDirection: 'column', overflowY: 'auto',
      background: '#1b3a2d', borderRight: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* Logo */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'20px 16px', borderBottom:'1px solid rgba(255,255,255,0.09)' }}>
        <div style={{ width:32, height:32, background:'#40916c', borderRadius:'50% 8px 50% 8px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
          🌿
        </div>
        <div>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:14, color:'#fff', lineHeight:1.2 }}>TomatoPilot</div>
          <div style={{ fontSize:10, color:'#74c69d', fontWeight:600, marginTop:1 }}>Souss Agri</div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex:1, paddingTop:8 }}>
        {NAV.map((group, gi) => (
          <div key={gi} style={{ marginBottom:4 }}>
            {group.section && (
              <div style={{ fontSize:9, fontWeight:600, letterSpacing:'1.2px', color:'rgba(255,255,255,0.28)', textTransform:'uppercase', padding:'8px 16px 3px' }}>
                {group.section}
              </div>
            )}
            {group.items.map(item => {
              const active = pathname === item.href
              return (
                <Link key={item.href} href={item.href}
                  className={active ? 'nav-item active-nav' : 'nav-item'}
                  style={{ textDecoration:'none' }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:'currentColor', opacity:.7, flexShrink:0, display:'block' }} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      {/* User */}
      <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.09)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
          <div style={{ width:29, height:29, borderRadius:'50%', background:'#40916c', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>
            AH
          </div>
          <div>
            <div style={{ fontSize:11.5, fontWeight:500, color:'rgba(255,255,255,0.78)' }}>Ahmed Hassani</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.38)' }}>Administrateur</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
