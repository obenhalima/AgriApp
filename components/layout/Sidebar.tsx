'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { items: [{ href:'/', label:'Dashboard', icon:'◈' }] },
  { section:'Exploitation', items: [
    { href:'/serres',    label:'Serres',    icon:'⬡' },
    { href:'/varietes',  label:'Varietes',  icon:'✦' },
    { href:'/campagnes', label:'Campagnes', icon:'◷' },
  ]},
  { section:'Production', items: [
    { href:'/production', label:'Production', icon:'▲' },
    { href:'/recoltes',   label:'Recoltes',   icon:'◉' },
    { href:'/agronomie',  label:'Agronomie',  icon:'⬨' },
  ]},
  { section:'Commerce', items: [
    { href:'/marches',   label:'Marches',   icon:'◎' },
    { href:'/clients',   label:'Clients',   icon:'◈' },
    { href:'/commandes', label:'Commandes', icon:'▣' },
    { href:'/factures',  label:'Factures',  icon:'▤' },
  ]},
  { section:'Achats', items: [
    { href:'/fournisseurs', label:'Fournisseurs', icon:'⬡' },
    { href:'/achats',       label:'Commandes',    icon:'▢' },
    { href:'/stocks',       label:'Stocks',       icon:'⬣' },
  ]},
  { section:'Finances', items: [
    { href:'/couts',      label:'Couts',      icon:'◆' },
    { href:'/marges',     label:'Marges',     icon:'◇' },
    { href:'/analytique', label:'IA / Predict',icon:'◈' },
  ]},
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside style={{
      position:'fixed', top:0, left:0, bottom:0, zIndex:50,
      width:'var(--sidebar-w)',
      display:'flex', flexDirection:'column',
      overflowY:'auto',
      background:'#050d09',
      borderRight:'1px solid #1a3526',
    }}>
      {/* Scan line animation */}
      <style>{`
        @keyframes scanline { 0%{top:0} 100%{top:100%} }
        .scan-line { position:absolute; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,#00e87a,transparent); opacity:.3; animation:scanline 6s linear infinite; pointer-events:none; z-index:0; }
      `}</style>
      <div className="scan-line" />

      {/* Logo */}
      <div style={{ padding:'20px 18px 16px', borderBottom:'1px solid #1a3526', position:'relative', zIndex:1 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{
            width:36, height:36,
            background:'linear-gradient(135deg, #00e87a, #006633)',
            borderRadius:8,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:16,
            boxShadow:'0 0 16px #00e87a40',
            flexShrink:0,
          }}>🍅</div>
          <div>
            <div style={{ fontFamily:'Rajdhani,sans-serif', fontSize:15, fontWeight:700, color:'#e8f5ee', letterSpacing:1.5, textTransform:'uppercase' }}>TomatoPilot</div>
            <div style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'#3d6b52', letterSpacing:2 }}>AGRITECH v1.0</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex:1, paddingTop:8, position:'relative', zIndex:1 }}>
        {NAV.map((group, gi) => (
          <div key={gi} style={{ marginBottom:4 }}>
            {group.section && (
              <div style={{ fontFamily:'DM Mono,monospace', fontSize:8.5, fontWeight:500, color:'#1f4030', textTransform:'uppercase', letterSpacing:'2px', padding:'8px 18px 3px', display:'flex', alignItems:'center', gap:8 }}>
                <span>{group.section}</span>
                <span style={{ flex:1, height:1, background:'#1a3526', display:'block' }} />
              </div>
            )}
            {group.items.map(item => {
              const active = pathname === item.href
              return (
                <Link key={item.href} href={item.href}
                  className={`nav-item${active ? ' active' : ''}`}
                  style={{ textDecoration:'none' }}>
                  <span style={{ fontFamily:'DM Mono,monospace', fontSize:12, color:'inherit', opacity:.7 }}>{item.icon}</span>
                  <span>{item.label}</span>
                  {active && <span style={{ marginLeft:'auto', width:4, height:4, borderRadius:'50%', background:'#00e87a', boxShadow:'0 0 8px #00e87a', flexShrink:0 }} />}
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      {/* User */}
      <div style={{ padding:'12px 16px', borderTop:'1px solid #1a3526', position:'relative', zIndex:1 }}>
        <div style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 10px', borderRadius:7, border:'1px solid #1a3526', background:'#0a1810' }}>
          <div style={{
            width:28, height:28, borderRadius:6,
            background:'linear-gradient(135deg, #00e87a22, #006633)',
            border:'1px solid #00e87a40',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontFamily:'Rajdhani,sans-serif', fontSize:11, fontWeight:700, color:'#00e87a',
            flexShrink:0,
          }}>AH</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:'Rajdhani,sans-serif', fontSize:12.5, fontWeight:600, color:'#e8f5ee', letterSpacing:.5 }}>Ahmed Hassani</div>
            <div style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'#00e87a', letterSpacing:.5 }}>ADMIN</div>
          </div>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#00e87a', boxShadow:'0 0 8px #00e87a', flexShrink:0 }} />
        </div>
      </div>
    </aside>
  )
}
