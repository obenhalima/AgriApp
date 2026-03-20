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
          <h2 className="font-display text-xl font-bold mb-1">🧪 Journal Agronomique</h2>
          <p className="text-sm text-[#8b949e]">{isDemo ? 'Campagne 2025-2026 · Domaine Souss Agri' : 'Aucune campagne active'}</p>
        </div>
        <button className="bg-[#e05c3b] text-white px-4 py-2 rounded-lg text-sm font-medium">+ Nouveau</button>
      </div>
      {isDemo ? (<>
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[['Opérations ce mois','47','color:"#f07050"'],['Traitements','12','color:"#a371f7"'],['Irrigations','18','color:"#388bfd"'],['Tailles / Palissages','17','color:"#3fb950"']].map(([l,v,c])=>(
          <div key={l} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
            <div className="text-[11px] text-[#4a5568] uppercase tracking-wider mb-2">{l}</div>
            <div className="font-display text-2xl font-extrabold" style={{...Object.fromEntries([c.replace('color:','color').split(':').map((x,i)=>i===1?x.replace(/"/g,''):x)])}}>{v}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="font-display font-bold text-sm mb-4">Opérations culturales récentes</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#30363d]">
              {['Date','Serre','Type opération','Produit','Dose','EC','pH','Durée','Ouvriers'].map(h=>(
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {DEMO_DATA.agronomie.map((op,i)=>{
                const TYPE_COLORS: Record<string,string> = { Irrigation:'bg-[#0d2149] text-[#388bfd]', Traitement:'bg-[#2d1a4a] text-[#a371f7]', Fertilisation:'bg-[#1a4a24] text-[#3fb950]', Taille:'bg-[#3d1a0d] text-[#f07050]', Inspection:'bg-[#0d2149] text-[#388bfd]', Palissage:'bg-[#3d2e0a] text-[#d29922]' }
                return <tr key={i} className="border-b border-[#30363d]/50 hover:bg-[#1c2333] transition-colors">
                  <td className="px-3 py-3 font-mono text-xs text-[#8b949e]">{op.date}</td>
                  <td className="px-3 py-3 font-semibold">{op.serre}</td>
                  <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded text-xs ${TYPE_COLORS[op.type]||'bg-[#232c3d] text-[#8b949e]'}`}>{op.type}</span></td>
                  <td className="px-3 py-3 text-xs">{op.produit}</td>
                  <td className="px-3 py-3 font-mono text-xs">{op.dose}</td>
                  <td className="px-3 py-3 font-mono text-xs">{op.ec ?? '—'}</td>
                  <td className="px-3 py-3 font-mono text-xs">{op.ph ?? '—'}</td>
                  <td className="px-3 py-3 text-xs">{op.duree}</td>
                  <td className="px-3 py-3 text-center text-xs font-semibold">{op.ouvriers}</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </div></>) : (<>
      <div className="card p-16 text-center">
        <div className="text-5xl mb-4 opacity-20">🧪</div>
        <div className="font-display text-base font-bold text-[#8b949e] mb-2">Aucune donnée</div>
        <p className="text-sm text-[#4a5568] max-w-xs mx-auto">Configurez votre ferme pour commencer.</p>
      </div></>)}
    </div>
  )
}