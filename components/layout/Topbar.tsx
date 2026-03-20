'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
const TITLES: Record<string,string> = { '/':"Dashboard",' /serres':"Fermes & Serres",'/varietes':"Variétés",'/campagnes':"Campagnes",'/production':"Production",'/recoltes':"Récoltes",'/agronomie':"Agronomie",'/marches':"Marchés",'/clients':"Clients",'/commandes':"Commandes",'/factures':"Factures",'/fournisseurs':"Fournisseurs",'/achats':"Achats",'/stocks':"Stocks",'/couts':"Coûts & Budget",'/marges':"Marges",'/analytique':"IA & Prévisions",'/alertes':"Alertes" }
type Props = { profile: 'demo'|'empty' }
export function Topbar({ profile }: Props) {
  const pathname = usePathname()
  const title = TITLES[pathname] || 'TomatoPilot'
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-6" style={{height:'58px',background:'#161b22',borderBottom:'1px solid #30363d'}}>
      <div className="flex items-center gap-3">
        <h1 className="font-display font-bold text-[17px]">{title}</h1>
        <span className="text-xs text-[#4a5568]">{profile==='demo'?'Domaine Souss Agri':'Votre Ferme'} › {title}</span>
      </div>
      <div className="flex items-center gap-2.5">
        {profile==='demo'&&<span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[#3d2e0a] text-[#d29922] border border-[rgba(210,153,34,0.3)]">DONNÉES DÉMO</span>}
        <div className="relative">
          <Link href="/alertes" className="w-[34px] h-[34px] rounded-lg border border-[#30363d] bg-[#1c2333] text-[#8b949e] flex items-center justify-center text-sm hover:bg-[#232c3d] transition-colors">🔔</Link>
          {profile==='demo'&&<span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#f85149] text-white text-[10px] font-bold flex items-center justify-center">3</span>}
        </div>
      </div>
    </header>
  )
}
