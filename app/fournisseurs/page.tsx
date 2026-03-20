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
          <h2 className="font-display text-xl font-bold mb-1">🏭 Fournisseurs</h2>
          <p className="text-sm text-[#8b949e]">{isDemo ? 'Campagne 2025-2026 · Domaine Souss Agri' : 'Aucune campagne active'}</p>
        </div>
        <button className="bg-[#e05c3b] text-white px-4 py-2 rounded-lg text-sm font-medium">+ Nouveau</button>
      </div>
      {isDemo ? (<>
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="bg-[#161b22] border-t-2 border-[#388bfd] border border-[#30363d] rounded-xl p-4"><div className="text-[11px] text-[#4a5568] uppercase tracking-wider mb-1">Fournisseurs actifs</div><div className="font-display text-2xl font-extrabold">6</div></div>
        <div className="bg-[#161b22] border-t-2 border-[#f85149] border border-[#30363d] rounded-xl p-4"><div className="text-[11px] text-[#4a5568] uppercase tracking-wider mb-1">Total à payer</div><div className="font-display text-2xl font-extrabold text-[#f85149]">194k <span className="text-sm font-normal text-[#8b949e]">MAD</span></div></div>
        <div className="bg-[#161b22] border-t-2 border-[#3fb950] border border-[#30363d] rounded-xl p-4"><div className="text-[11px] text-[#4a5568] uppercase tracking-wider mb-1">Catégories</div><div className="font-display text-2xl font-extrabold">6</div></div>
        <div className="bg-[#161b22] border-t-2 border-[#d29922] border border-[#30363d] rounded-xl p-4"><div className="text-[11px] text-[#4a5568] uppercase tracking-wider mb-1">Note moyenne</div><div className="font-display text-2xl font-extrabold">4.2 <span className="text-sm font-normal text-[#d29922]">/ 5</span></div></div>
      </div>
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#30363d]">
              {['Code','Fournisseur','Catégorie','Ville','Email','Encours (MAD)','Statut','Note','Actions'].map(h=>(
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {DEMO_DATA.fournisseurs.map(f=>{
                const ST: Record<string,string> = {'payé':'bg-[#1a4a24] text-[#3fb950]','à payer':'bg-[#3d2e0a] text-[#d29922]','partiellement payé':'bg-[#0d2149] text-[#388bfd]'}
                return <tr key={f.code} className="border-b border-[#30363d]/50 hover:bg-[#1c2333] transition-colors">
                  <td className="px-3 py-3 font-mono text-xs text-[#8b949e]">{f.code}</td>
                  <td className="px-3 py-3 font-semibold">{f.nom}</td>
                  <td className="px-3 py-3"><span className="px-2 py-0.5 rounded text-xs bg-[#0d2149] text-[#388bfd]">{f.cat}</span></td>
                  <td className="px-3 py-3 text-xs text-[#8b949e]">{f.ville}</td>
                  <td className="px-3 py-3 text-xs text-[#8b949e]">{f.email}</td>
                  <td className="px-3 py-3 font-mono text-xs font-semibold">{f.encours.toLocaleString('fr')}</td>
                  <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs ${ST[f.statut]||'bg-[#232c3d] text-[#8b949e]'}`}>● {f.statut}</span></td>
                  <td className="px-3 py-3 text-[#d29922]">{'★'.repeat(f.note)}{'☆'.repeat(5-f.note)}</td>
                  <td className="px-3 py-3"><div className="flex gap-1"><button className="bg-[#232c3d] border border-[#30363d] text-[#e6edf3] px-2 py-1 rounded text-xs">Commandes</button><button className="text-[#8b949e] px-2 py-1 rounded text-xs">✏️</button></div></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </div></>) : (<>
      <div className="card p-16 text-center">
        <div className="text-5xl mb-4 opacity-20">🏭</div>
        <div className="font-display text-base font-bold text-[#8b949e] mb-2">Aucune donnée</div>
        <p className="text-sm text-[#4a5568] max-w-xs mx-auto">Configurez votre ferme pour commencer.</p>
      </div></>)}
    </div>
  )
}