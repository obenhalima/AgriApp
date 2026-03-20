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
          <h2 className="font-display text-xl font-bold mb-1">📈 Suivi Production</h2>
          <p className="text-sm text-[#8b949e]">{isDemo ? 'Campagne 2025-2026 · Domaine Souss Agri' : 'Aucune campagne active'}</p>
        </div>
        <button className="bg-[#e05c3b] text-white px-4 py-2 rounded-lg text-sm font-medium">+ Nouveau</button>
      </div>
      {isDemo ? (<>
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[['Production totale','1 124 t','60.8% objectif','#e05c3b'],['Cat. 1 Export','73%','821 tonnes','#3fb950'],['Cat. 2 Local','22%','247 tonnes','#388bfd'],['Déchet+Déclassé','5%','56 tonnes','#d29922']].map(([l,v,s,c])=>(
          <div key={l} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4" style={{borderTop:`2px solid ${c}`}}>
            <div className="text-[11px] text-[#4a5568] uppercase tracking-wider mb-1">{l}</div>
            <div className="font-display text-2xl font-extrabold" style={{color:c}}>{v}</div>
            <div className="text-xs text-[#8b949e] mt-1">{s}</div>
          </div>
        ))}
      </div>
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
        <div className="font-display font-bold text-sm mb-4">Détail par Serre</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#30363d]">
              {['Serre','Variétés','Surface','Prod. Théo.','Prod. Réelle','Écart','Rend. Réel','% Objectif'].map(h=>(
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {DEMO_DATA.serres.filter(s=>s.rend_reel>0).map(s=>{
                const pct=Math.round(s.rend_reel/s.rend_th*100)
                const ecart=((s.rend_reel-s.rend_th)/s.rend_th*100).toFixed(1)
                return <tr key={s.code} className="border-b border-[#30363d]/50 hover:bg-[#1c2333]">
                  <td className="px-3 py-3 font-semibold">{s.nom}</td>
                  <td className="px-3 py-3 text-xs text-[#8b949e]">{s.varietes.join(', ')}</td>
                  <td className="px-3 py-3 font-mono text-xs">{s.exploitable.toLocaleString('fr')} m²</td>
                  <td className="px-3 py-3 font-mono text-xs">{(s.exploitable*s.rend_th/1000).toFixed(1)} t</td>
                  <td className="px-3 py-3 font-mono text-xs font-bold">{s.production} t</td>
                  <td className="px-3 py-3 font-mono text-xs" style={{color:parseFloat(ecart)>=0?'#3fb950':'#d29922'}}>{parseFloat(ecart)>=0?'+':''}{ecart}%</td>
                  <td className="px-3 py-3 font-mono text-xs font-semibold" style={{color:s.rend_reel>=s.rend_th*0.95?'#3fb950':'#d29922'}}>{s.rend_reel} kg/m²</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-[#232c3d] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${Math.min(pct,100)}%`,background:pct>=95?'#3fb950':'#d29922'}} /></div>
                      <span className="text-xs">{pct}%</span>
                    </div>
                  </td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </div></>) : (<>
      <div className="card p-16 text-center">
        <div className="text-5xl mb-4 opacity-20">📈</div>
        <div className="font-display text-base font-bold text-[#8b949e] mb-2">Aucune donnée</div>
        <p className="text-sm text-[#4a5568] max-w-xs mx-auto">Configurez votre ferme pour commencer.</p>
      </div></>)}
    </div>
  )
}