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
          <h2 className="font-display text-xl font-bold mb-1">🍅 Récoltes</h2>
          <p className="text-sm text-[#8b949e]">{isDemo ? 'Campagne 2025-2026 · Domaine Souss Agri' : 'Aucune campagne active'}</p>
        </div>
        <button className="bg-[#e05c3b] text-white px-4 py-2 rounded-lg text-sm font-medium">+ Nouveau</button>
      </div>
      {isDemo ? (<>
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="font-display font-bold text-sm">Récoltes récentes</div>
          <button className="bg-[#232c3d] text-[#e6edf3] px-3 py-1.5 rounded-lg text-xs border border-[#30363d]">📥 Exporter</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#30363d]">
              {['Date','Serre','Variété','Cat 1 (kg)','Cat 2 (kg)','Cat 3 (kg)','Déchets','Total','N° Lot'].map(h=>(
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {DEMO_DATA.recoltes.map((r,i)=>{
                const total = r.cat1+r.cat2+r.cat3+r.dechets
                return <tr key={i} className="border-b border-[#30363d]/50 hover:bg-[#1c2333] transition-colors">
                  <td className="px-3 py-3 font-mono text-xs text-[#8b949e]">{r.date}</td>
                  <td className="px-3 py-3 font-semibold">{r.serre}</td>
                  <td className="px-3 py-3">{r.variete}</td>
                  <td className="px-3 py-3 font-mono text-xs text-[#3fb950] font-semibold">{r.cat1.toLocaleString('fr')}</td>
                  <td className="px-3 py-3 font-mono text-xs">{r.cat2.toLocaleString('fr')}</td>
                  <td className="px-3 py-3 font-mono text-xs text-[#d29922]">{r.cat3.toLocaleString('fr')}</td>
                  <td className="px-3 py-3 font-mono text-xs text-[#f85149]">{r.dechets}</td>
                  <td className="px-3 py-3 font-mono text-xs font-bold">{total.toLocaleString('fr')}</td>
                  <td className="px-3 py-3 font-mono text-xs text-[#8b949e]">{r.lot}</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </div></>) : (<>
      <div className="card p-16 text-center">
        <div className="text-5xl mb-4 opacity-20">🍅</div>
        <div className="font-display text-base font-bold text-[#8b949e] mb-2">Aucune donnée</div>
        <p className="text-sm text-[#4a5568] max-w-xs mx-auto">Configurez votre ferme pour commencer.</p>
      </div></>)}
    </div>
  )
}