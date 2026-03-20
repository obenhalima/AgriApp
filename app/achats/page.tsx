'use client'
import { useEffect, useState } from 'react'
import { DEMO_DATA } from '@/lib/data'

export default function Page() {
  const [profile, setProfile] = useState('demo')
  useEffect(() => { setProfile(localStorage.getItem('tomatopilot_profile') || 'demo') }, [])
  const isDemo = profile === 'demo'
  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-xl font-bold mb-1">🛒 Bons de Commande</h2>
          <p className="text-sm text-[#8b949e]">{isDemo ? 'Campagne 2025-2026 · Domaine Souss Agri' : 'Aucune campagne active'}</p>
        </div>
        <button className="bg-[#e05c3b] text-white px-4 py-2 rounded-lg text-sm font-medium">+ Nouveau</button>
      </div>
      {isDemo ? (<>
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="font-display font-bold text-sm">Bons de commande récents</div>
          <button className="bg-[#232c3d] text-[#e6edf3] px-3 py-1.5 rounded-lg text-xs border border-[#30363d]">+ Nouveau BC</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#30363d]">
              {['N° BC','Fournisseur','Catégorie','Date','Livraison','Montant (MAD)','Statut','Actions'].map(h=>(
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {DEMO_DATA.achats.map(a=>{
                const ST: Record<string,string> = {receptionne:'bg-[#1a4a24] text-[#3fb950]',en_attente:'bg-[#3d2e0a] text-[#d29922]',en_cours:'bg-[#0d2149] text-[#388bfd]'}
                const LBL: Record<string,string> = {receptionne:'● reçu',en_attente:'● en attente',en_cours:'● en cours'}
                return <tr key={a.num} className="border-b border-[#30363d]/50 hover:bg-[#1c2333] transition-colors">
                  <td className="px-3 py-3 font-mono text-xs font-semibold">{a.num}</td>
                  <td className="px-3 py-3 font-medium">{a.fournisseur}</td>
                  <td className="px-3 py-3"><span className="px-2 py-0.5 rounded text-xs bg-[#0d2149] text-[#388bfd]">{a.cat}</span></td>
                  <td className="px-3 py-3 font-mono text-xs text-[#8b949e]">{a.date}</td>
                  <td className="px-3 py-3 font-mono text-xs text-[#8b949e]">{a.livraison}</td>
                  <td className="px-3 py-3 font-mono text-xs font-semibold">{a.montant.toLocaleString('fr')}</td>
                  <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs ${ST[a.statut]||'bg-[#232c3d] text-[#8b949e]'}`}>{LBL[a.statut]||a.statut}</span></td>
                  <td className="px-3 py-3"><button className="text-[#8b949e] hover:text-[#e6edf3] text-xs px-2 py-1">👁️</button></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </div></>) : (<>
      <div className="card p-16 text-center">
        <div className="text-5xl mb-4 opacity-20">🛒</div>
        <div className="font-display text-base font-bold text-[#8b949e] mb-2">Aucune donnée</div>
        <p className="text-sm text-[#4a5568] max-w-xs mx-auto">Configurez votre ferme pour commencer.</p>
      </div></>)}
    </div>
  )
}