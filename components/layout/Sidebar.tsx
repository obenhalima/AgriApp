'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV = [
  { items: [{ href:'/', icon:'📊', label:'Dashboard' }] },
  { section:'Exploitation', items: [{ href:'/serres',icon:'🏗️',label:'Fermes & Serres'},{href:'/varietes',icon:'🌱',label:'Variétés'},{href:'/campagnes',icon:'📅',label:'Campagnes'}] },
  { section:'Production', items: [{href:'/production',icon:'📈',label:'Suivi Production'},{href:'/recoltes',icon:'🍅',label:'Récoltes'},{href:'/agronomie',icon:'🧪',label:'Agronomie'}] },
  { section:'Commerce', items: [{href:'/marches',icon:'🌍',label:'Marchés'},{href:'/clients',icon:'👥',label:'Clients'},{href:'/commandes',icon:'📋',label:'Commandes'},{href:'/factures',icon:'🧾',label:'Factures'}] },
  { section:'Achats', items: [{href:'/fournisseurs',icon:'🏭',label:'Fournisseurs'},{href:'/achats',icon:'🛒',label:'Bons de Commande'},{href:'/stocks',icon:'📦',label:'Stocks'}] },
  { section:'Finances', items: [{href:'/couts',icon:'💰',label:'Coûts & Budget'},{href:'/marges',icon:'📉',label:'Marges'}] },
  { section:'Analytique', items: [{href:'/analytique',icon:'🤖',label:'IA & Prévisions'},{href:'/alertes',icon:'🔔',label:'Alertes'}] },
]

type Props = { profile: 'demo'|'empty' }
export function Sidebar({ profile }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  return (
    <aside className="fixed top-0 left-0 bottom-0 z-50 flex flex-col overflow-y-auto" style={{width:'240px',background:'#161b22',borderRight:'1px solid #30363d'}}>
      <div className="p-4 border-b border-[#30363d]">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg" style={{background:'linear-gradient(135deg,#e05c3b,#c0392b)',boxShadow:'0 0 14px rgba(224,92,59,0.35)'}}>🍅</div>
          <div className="font-display font-extrabold text-base">Tomato<span className="text-[#f07050]">Pilot</span></div>
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${profile==='demo'?'bg-[#3d2e0a] text-[#d29922] border border-[rgba(210,153,34,0.3)]':'bg-[#0d2149] text-[#388bfd] border border-[rgba(56,139,253,0.3)]'}`}>
            {profile==='demo'?'🌱 Démo':'🏗️ Réel'}
          </span>
          <button onClick={()=>{localStorage.removeItem('tomatopilot_profile');router.push('/login')}} className="text-[10px] text-[#4a5568] hover:text-[#8b949e]">Changer →</button>
        </div>
      </div>
      <div className="flex-1 py-2">
        {NAV.map((g,gi)=>(
          <div key={gi} className="px-2.5 mb-1">
            {g.section&&<div className="text-[10px] font-semibold text-[#4a5568] uppercase tracking-widest px-2.5 py-1.5">{g.section}</div>}
            {g.items.map(item=>{
              const active=pathname===item.href
              return <Link key={item.href} href={item.href} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg mb-0.5 text-[13.5px] font-medium transition-all border ${active?'bg-[#3d1a0d] text-[#f07050] border-[rgba(224,92,59,0.25)]':'text-[#8b949e] hover:bg-[#1c2333] hover:text-[#e6edf3] border-transparent'}`}>
                <span className="text-base w-5 text-center">{item.icon}</span><span>{item.label}</span>
              </Link>
            })}
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-[#30363d]">
        <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[#1c2333] cursor-pointer">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{background:'linear-gradient(135deg,#e05c3b,#a371f7)'}}>AH</div>
          <div className="min-w-0 flex-1"><div className="text-xs font-semibold">Ahmed Hassani</div><div className="text-[11px] text-[#4a5568]">Administrateur</div></div>
        </div>
      </div>
    </aside>
  )
}
