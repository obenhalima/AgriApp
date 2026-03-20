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
          <h2 className="font-display text-xl font-bold mb-1">📉 Marges & Rentabilité</h2>
          <p className="text-sm text-[#8b949e]">{isDemo ? 'Campagne 2025-2026 · Domaine Souss Agri' : 'Aucune campagne active'}</p>
        </div>
        <button className="bg-[#e05c3b] text-white px-4 py-2 rounded-lg text-sm font-medium">+ Nouveau</button>
      </div>
      {isDemo ? (<>
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[['CA Total','3.01 M MAD','#388bfd'],['Coûts Directs','1.85 M MAD','#e05c3b'],['Marge Brute','48.5%','#3fb950'],['Marge Nette','38.4%','#a371f7']].map(([l,v,c])=>(
          <div key={l} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4" style={{borderTop:`2px solid ${c}`}}>
            <div className="text-[11px] text-[#4a5568] uppercase tracking-wider mb-2">{l}</div>
            <div className="font-display text-2xl font-extrabold" style={{color:c}}>{v}</div>
          </div>
        ))}
      </div>
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 mb-5">
        <div className="font-display font-bold text-sm mb-4">Compte de Résultat Simplifié — Campagne 2025-2026</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#30363d]">{['Poste','Montant (MAD)','% CA','/ kg produit'].map(h=><th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {[
                {poste:'Chiffre d Affaires',montant:'3 006 000',pct:'100%',kg:'2.67 MAD',color:'#388bfd',bold:true},
                {poste:'└ Marché Local (28%)',montant:'841 680',pct:'28%',kg:'—',color:'',bold:false,indent:true},
                {poste:'└ Grande Distribution (18%)',montant:'541 080',pct:'18%',kg:'—',color:'',bold:false,indent:true},
                {poste:'└ Export (54%)',montant:'1 623 240',pct:'54%',kg:'—',color:'',bold:false,indent:true},
                {poste:'— Coûts de Production',montant:'-1 545 000',pct:'51.4%',kg:'1.37 MAD',color:'#f85149',bold:true},
                {poste:'= MARGE BRUTE',montant:'1 461 000',pct:'48.6%',kg:'1.30 MAD',color:'#3fb950',bold:true},
                {poste:'— Main-d oeuvre',montant:'-780 000',pct:'26%',kg:'0.69',color:'',bold:false,indent:true},
                {poste:'— Frais généraux',montant:'-122 000',pct:'4.1%',kg:'0.11',color:'',bold:false,indent:true},
                {poste:'= RÉSULTAT NET',montant:'559 000',pct:'18.6%',kg:'0.50 MAD',color:'#a371f7',bold:true},
              ].map((r,i)=>(
                <tr key={i} className="border-b border-[#30363d]/50 hover:bg-[#1c2333]">
                  <td className="px-3 py-3" style={{paddingLeft:r.indent?'36px':undefined,color:r.color||'inherit',fontWeight:r.bold?700:400}}>{r.poste}</td>
                  <td className="px-3 py-3 font-mono text-xs" style={{color:r.color||'inherit',fontWeight:r.bold?700:400}}>{r.montant}</td>
                  <td className="px-3 py-3 font-mono text-xs text-[#8b949e]">{r.pct}</td>
                  <td className="px-3 py-3 font-mono text-xs text-[#8b949e]">{r.kg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
        <div className="font-display font-bold text-sm mb-4">Marge par Variété</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#30363d]">{['Variété','Surface','Coût/m²','Coût Total','CA Estimé','Marge Brute','Marge %'].map(h=><th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {DEMO_DATA.varietes.map(v=>{
                const coutTotal = v.surface*v.cout_m2
                const ca = v.surface*v.rend_reel*(v.destination==='Export'?v.prix_export*10.8:v.prix_local)
                const marge = ca-coutTotal
                return <tr key={v.code} className="border-b border-[#30363d]/50 hover:bg-[#1c2333]">
                  <td className="px-3 py-3"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{background:v.couleur}} /><span className="font-semibold">{v.nom}</span></div></td>
                  <td className="px-3 py-3 font-mono text-xs">{v.surface.toLocaleString('fr')} m²</td>
                  <td className="px-3 py-3 font-mono text-xs">{v.cout_m2} MAD</td>
                  <td className="px-3 py-3 font-mono text-xs">{(coutTotal/1000).toFixed(0)}k MAD</td>
                  <td className="px-3 py-3 font-mono text-xs font-semibold">{(ca/1000000).toFixed(2)} M MAD</td>
                  <td className="px-3 py-3 font-mono text-xs text-[#3fb950]">{(marge/1000).toFixed(0)}k MAD</td>
                  <td className="px-3 py-3 font-semibold" style={{color:'#3fb950'}}>{v.marge}%</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </div></>) : (<>
      <div className="card p-16 text-center">
        <div className="text-5xl mb-4 opacity-20">📉</div>
        <div className="font-display text-base font-bold text-[#8b949e] mb-2">Aucune donnée</div>
        <p className="text-sm text-[#4a5568] max-w-xs mx-auto">Configurez votre ferme pour commencer.</p>
      </div></>)}
    </div>
  )
}