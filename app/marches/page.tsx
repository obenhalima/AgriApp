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
          <h2 className="font-display text-xl font-bold mb-1">🌍 Marchés & Prix</h2>
          <p className="text-sm text-[#8b949e]">{isDemo ? 'Campagne 2025-2026 · Domaine Souss Agri' : 'Aucune campagne active'}</p>
        </div>
        <button className="bg-[#e05c3b] text-white px-4 py-2 rounded-lg text-sm font-medium">+ Nouveau</button>
      </div>
      {isDemo ? (<>
      <div className="grid grid-cols-5 gap-4 mb-5">
        {DEMO_DATA.marches.map((m,i)=>{
          const colors=['#3fb950','#388bfd','#e05c3b','#a371f7','#d29922']
          return <div key={m.code} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4" style={{borderTop:`2px solid ${colors[i]}`}}>
            <div className="text-[11px] text-[#4a5568] uppercase tracking-wider mb-1">{m.nom}</div>
            <div className="font-display text-xl font-extrabold mb-1">{(m.ca/1000000).toFixed(2)}<span className="text-sm font-normal text-[#8b949e]"> M MAD</span></div>
            <div className="text-xs text-[#8b949e]">{m.part_pct}% du CA · {m.prix_moy} {m.devise}/kg</div>
            <div className="mt-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${m.type==='Export'?'bg-[#3d1a0d] text-[#f07050]':m.type==='Local'?'bg-[#1a4a24] text-[#3fb950]':'bg-[#0d2149] text-[#388bfd]'}`}>{m.type}</span></div>
          </div>
        })}
      </div>
      <div className="card">
        <div className="font-display font-bold text-sm mb-4">Analyse Comparative des Marchés</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#30363d]">
              {['Marché','Type','Pays','Devise','Prix/kg','Coût Logist.','Part CA','CA Total'].map(h=>(
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {DEMO_DATA.marches.map(m=>(
                <tr key={m.code} className="border-b border-[#30363d]/50 hover:bg-[#1c2333]">
                  <td className="px-3 py-3 font-semibold">{m.nom}</td>
                  <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded text-xs ${m.type==='Export'?'bg-[#3d1a0d] text-[#f07050]':m.type==='Local'?'bg-[#1a4a24] text-[#3fb950]':'bg-[#0d2149] text-[#388bfd]'}`}>{m.type}</span></td>
                  <td className="px-3 py-3 text-[#8b949e]">{m.pays}</td>
                  <td className="px-3 py-3 font-mono text-xs">{m.devise}</td>
                  <td className="px-3 py-3 font-mono text-xs font-semibold">{m.prix_moy} {m.devise}/kg</td>
                  <td className="px-3 py-3 font-mono text-xs">{m.cout_log} {m.devise}/kg</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-[#232c3d] rounded-full overflow-hidden"><div className="h-full rounded-full bg-[#3fb950]" style={{width:`${m.part_pct*2}%`}} /></div>
                      <span className="text-xs">{m.part_pct}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs font-bold">{(m.ca/1000000).toFixed(2)} M MAD</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div></>) : (<>
      <div className="card p-16 text-center">
        <div className="text-5xl mb-4 opacity-20">🌍</div>
        <div className="font-display text-base font-bold text-[#8b949e] mb-2">Aucune donnée</div>
        <p className="text-sm text-[#4a5568] max-w-xs mx-auto">Configurez votre ferme pour commencer.</p>
      </div></>)}
    </div>
  )
}