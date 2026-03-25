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
    <aside style={{ position:'fixed', top:0, left:0, bottom:0, zIndex:50, width:'var(--sidebar-w)', display:'flex', flexDirection:'column', overflowY:'auto', background:'#050d09', borderRight:'1px solid #1a3526' }}>
      <style>{`@keyframes scanline{0%{top:0}100%{top:100%}}.scan-line{position:absolute;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,#00e87a,transparent);opacity:.25;animation:scanline 8s linear infinite;pointer-events:none;z-index:0;}`}</style>
      <div className="scan-line"/>

      {/* Logo */}
      <div style={{padding:'18px 16px 14px',borderBottom:'1px solid #1a3526',position:'relative',zIndex:1}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:34,height:34,background:'linear-gradient(135deg,#00e87a,#006633)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,boxShadow:'0 0 14px #00e87a40',flexShrink:0}}>🍅</div>
          <div>
            <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:14,fontWeight:700,color:'#e8f5ee',letterSpacing:1.5,textTransform:'uppercase',lineHeight:1.1}}>TomatoPilot</div>
            <div style={{fontFamily:'DM Mono,monospace',fontSize:8.5,color:'#3d6b52',letterSpacing:2}}>AGRITECH v1.0</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{flex:1,paddingTop:6,position:'relative',zIndex:1}}>
        {NAV.map((group,gi)=>(
          <div key={gi} style={{marginBottom:2}}>
            {group.section && (
              <div style={{fontFamily:'DM Mono,monospace',fontSize:8.5,fontWeight:500,color:'#1f4030',textTransform:'uppercase',letterSpacing:'1.8px',padding:'7px 16px 2px',display:'flex',alignItems:'center',gap:8}}>
                <span>{group.section}</span>
                <span style={{flex:1,height:'1px',background:'#1a3526',display:'block'}}/>
              </div>
            )}
            {group.items.map(item=>{
              const active = pathname===item.href
              return (
                <Link key={item.href} href={item.href}
                  className={`nav-item${active?' active':''}`}
                  style={{textDecoration:'none'}}>
                  <span style={{fontSize:11,opacity:.6,flexShrink:0,width:16,textAlign:'center'}}>{item.icon}</span>
                  <span style={{fontSize:12.5}}>{item.label}</span>
                  {active&&<span style={{marginLeft:'auto',width:4,height:4,borderRadius:'50%',background:'#00e87a',boxShadow:'0 0 8px #00e87a',flexShrink:0}}/>}
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      {/* User */}
      <div style={{padding:'10px 14px',borderTop:'1px solid #1a3526',position:'relative',zIndex:1}}>
        <div style={{display:'flex',alignItems:'center',gap:9,padding:'8px 10px',borderRadius:7,border:'1px solid #1a3526',background:'#0a1810'}}>
          <div style={{width:26,height:26,borderRadius:6,background:'linear-gradient(135deg,#00e87a22,#006633)',border:'1px solid #00e87a40',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Rajdhani,sans-serif',fontSize:10,fontWeight:700,color:'#00e87a',flexShrink:0}}>AH</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:12,fontWeight:600,color:'#e8f5ee',letterSpacing:.5}}>Ahmed Hassani</div>
            <div style={{fontFamily:'DM Mono,monospace',fontSize:8.5,color:'#00e87a',letterSpacing:.5}}>ADMIN · SOUSS AGRI</div>
          </div>
          <div style={{width:5,height:5,borderRadius:'50%',background:'#00e87a',boxShadow:'0 0 6px #00e87a',flexShrink:0}}/>
        </div>
      </div>
    </aside>
  )
}
