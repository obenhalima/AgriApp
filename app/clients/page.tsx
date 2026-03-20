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
          <h2 className="font-display text-xl font-bold mb-1">👥 Clients</h2>
          <p className="text-sm text-[#8b949e]">{isDemo ? 'Campagne 2025-2026 · Domaine Souss Agri' : 'Aucune campagne active'}</p>
        </div>
        <button className="bg-[#e05c3b] text-white px-4 py-2 rounded-lg text-sm font-medium">+ Nouveau</button>
      </div>
      {isDemo ? (<>
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 border-t-2" style={{borderTopColor:'#388bfd'}}><div className="text-[11px] text-[#4a5568] uppercase tracking-wider mb-1">Clients actifs</div><div className="font-display text-2xl font-extrabold">6</div></div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 border-t-2" style={{borderTopColor:'#3fb950'}}><div className="text-[11px] text-[#4a5568] uppercase tracking-wider mb-1">Encours total</div><div className="font-display text-2xl font-extrabold">530k <span className="text-sm font-normal text-[#8b949e]">MAD</span></div></div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 border-t-2" style={{borderTopColor:'#d29922'}}><div className="text-[11px] text-[#4a5568] uppercase tracking-wider mb-1">Top clients</div><div className="font-display text-2xl font-extrabold">4</div></div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 border-t-2" style={{borderTopColor:'#f85149'}}><div className="text-[11px] text-[#4a5568] uppercase tracking-wider mb-1">Factures en retard</div><div className="font-display text-2xl font-extrabold text-[#f85149]">1</div></div>
      </div>
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <input type="text" placeholder="🔍  Rechercher un client…" className="bg-[#1c2333] border border-[#30363d] rounded-lg text-[#e6edf3] text-xs px-3 py-2 outline-none focus:border-[#e05c3b]" style={{maxWidth:240}} />
          <select className="bg-[#1c2333] border border-[#30363d] rounded-lg text-[#8b949e] text-xs px-3 py-2 outline-none" style={{maxWidth:160}}><option>Tous types</option><option>Exportateur</option><option>Grande Surface</option><option>Grossiste</option></select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#30363d]">
              {['Code','Client','Type','Marché','Ville','Email','Délai pmt','Encours (MAD)','Statut','Actions'].map(h=>(
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {DEMO_DATA.clients.map(c=>(
                <tr key={c.code} className="border-b border-[#30363d]/50 hover:bg-[#1c2333] transition-colors">
                  <td className="px-3 py-3 font-mono text-xs text-[#8b949e]">{c.code}</td>
                  <td className="px-3 py-3"><div className="flex items-center gap-1.5">{c.top&&<span className="text-[#d29922]" title="Top client">⭐</span>}<span className="font-semibold">{c.nom}</span></div></td>
                  <td className="px-3 py-3"><span className="px-2 py-0.5 rounded text-xs bg-[#0d2149] text-[#388bfd]">{c.type}</span></td>
                  <td className="px-3 py-3 text-xs text-[#8b949e]">{c.marche}</td>
                  <td className="px-3 py-3 text-xs">{c.ville}</td>
                  <td className="px-3 py-3 text-xs text-[#8b949e]">{c.email}</td>
                  <td className="px-3 py-3 font-mono text-xs">{c.delai}j</td>
                  <td className="px-3 py-3 font-mono text-xs font-semibold">{c.encours.toLocaleString('fr')}</td>
                  <td className="px-3 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-[#1a4a24] text-[#3fb950]">● actif</span></td>
                  <td className="px-3 py-3"><div className="flex gap-1"><button className="bg-[#232c3d] text-[#e6edf3] px-2 py-1 rounded text-xs border border-[#30363d]">Factures</button><button className="text-[#8b949e] hover:text-[#e6edf3] px-2 py-1 rounded text-xs">✏️</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div></>) : (<>
      <div className="card p-16 text-center">
        <div className="text-5xl mb-4 opacity-20">👥</div>
        <div className="font-display text-base font-bold text-[#8b949e] mb-2">Aucune donnée</div>
        <p className="text-sm text-[#4a5568] max-w-xs mx-auto">Configurez votre ferme pour commencer.</p>
      </div></>)}
    </div>
  )
}