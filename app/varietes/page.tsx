'use client'
import { KpiCard } from '@/components/dashboard/KpiCard'

const VARIETES = [
  { code:'V001', nom:'Vitalia', type:'Ronde', destination:'Mixte', surface:10500, rend_th:45, rend_reel:43.6, cout_m2:118, prix_local:3.2, prix_export:0.55, marge:42, couleur:'#e05c3b' },
  { code:'V002', nom:'Torero', type:'Ronde', destination:'Export', surface:11600, rend_th:50, rend_reel:48.8, cout_m2:132, prix_local:3.5, prix_export:0.60, marge:48, couleur:'#3fb950' },
  { code:'V003', nom:'Cherry Sun', type:'Cerise', destination:'Local', surface:7200, rend_th:30, rend_reel:27.5, cout_m2:95, prix_local:8.0, prix_export:1.20, marge:61, couleur:'#a371f7' },
  { code:'V004', nom:'Grappe Premium', type:'Grappe', destination:'Export', surface:5100, rend_th:40, rend_reel:38.5, cout_m2:148, prix_local:5.5, prix_export:0.90, marge:55, couleur:'#388bfd' },
  { code:'V005', nom:'Brillante', type:'Cocktail', destination:'Mixte', surface:4700, rend_th:35, rend_reel:34.0, cout_m2:110, prix_local:6.0, prix_export:0.85, marge:52, couleur:'#d29922' },
]

const DEST_COLORS: Record<string, string> = {
  Export: 'bg-[#3d1a0d] text-[#f07050]',
  Local: 'bg-[#1a4a24] text-[#3fb950]',
  Mixte: 'bg-[#3d2e0a] text-[#d29922]',
}

export default function VarietesPage() {
  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-xl font-bold mb-1">🌱 Référentiel Variétés</h2>
          <p className="text-sm text-[#8b949e]">5 variétés actives cette campagne · 39 100 m² plantés</p>
        </div>
        <button className="btn-primary">+ Nouvelle Variété</button>
      </div>

      <div className="card mb-5">
        <div className="flex items-center gap-3 mb-4">
          <input type="text" placeholder="🔍  Rechercher une variété…" className="form-input" style={{maxWidth: 260}} />
          <select className="form-input" style={{maxWidth: 160}}>
            <option>Tous types</option><option>Ronde</option><option>Grappe</option><option>Cerise</option><option>Cocktail</option>
          </select>
          <select className="form-input" style={{maxWidth: 180}}>
            <option>Toutes destinations</option><option>Export</option><option>Local</option><option>Mixte</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#30363d]">
                {['Code','Variété','Type','Destination','Surface (m²)','Rend. Th.','Rend. Réel','Coût/m²','Prix Local','Prix Export','Marge %','Actions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VARIETES.map(v => (
                <tr key={v.code} className="border-b border-[#30363d]/50 hover:bg-[#1c2333] transition-colors">
                  <td className="px-3 py-3 font-mono text-xs text-[#8b949e]">{v.code}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background: v.couleur}} />
                      <span className="font-semibold">{v.nom}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3"><span className="px-2 py-0.5 rounded text-xs bg-[#0d2149] text-[#388bfd]">{v.type}</span></td>
                  <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded text-xs ${DEST_COLORS[v.destination]}`}>{v.destination}</span></td>
                  <td className="px-3 py-3 font-mono text-xs">{v.surface.toLocaleString('fr')}</td>
                  <td className="px-3 py-3 font-mono text-xs">{v.rend_th} kg/m²</td>
                  <td className="px-3 py-3 font-mono text-xs" style={{color: v.rend_reel >= v.rend_th * 0.95 ? '#3fb950' : '#d29922'}}>{v.rend_reel} kg/m²</td>
                  <td className="px-3 py-3 font-mono text-xs">{v.cout_m2} MAD</td>
                  <td className="px-3 py-3 font-mono text-xs">{v.prix_local} MAD/kg</td>
                  <td className="px-3 py-3 font-mono text-xs">{v.prix_export} €/kg</td>
                  <td className="px-3 py-3"><span className="font-bold text-sm" style={{color:'#3fb950'}}>{v.marge}%</span></td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <button className="btn-ghost text-xs px-2 py-1">✏️</button>
                      <button className="btn-ghost text-xs px-2 py-1">📊</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs font-semibold text-[#4a5568] uppercase tracking-widest mb-3">Production Théorique par Variété</div>
      <div className="grid grid-cols-5 gap-4">
        {VARIETES.map(v => {
          const prodTheo = (v.surface * v.rend_th / 1000).toFixed(1)
          const prodReel = (v.surface * v.rend_reel / 1000).toFixed(1)
          const pct = Math.round((v.rend_reel / v.rend_th) * 100)
          return (
            <div key={v.code} className="card" style={{borderTop: `2px solid ${v.couleur}`}}>
              <div className="font-display text-sm font-bold mb-1">{v.nom}</div>
              <div className="text-xs text-[#4a5568] mb-3">{v.surface.toLocaleString('fr')} m² · {v.type}</div>
              <div className="mb-2">
                <div className="text-[10px] text-[#4a5568] mb-1">Production théorique</div>
                <div className="font-display text-lg font-extrabold">{prodTheo} <span className="text-xs font-normal text-[#8b949e]">t</span></div>
              </div>
              <div className="mb-3">
                <div className="text-[10px] text-[#4a5568] mb-1">Production réelle</div>
                <div className="text-base font-semibold" style={{color: v.couleur}}>{prodReel} <span className="text-xs text-[#8b949e]">t ({pct}%)</span></div>
              </div>
              <div className="h-1.5 bg-[#232c3d] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{width: `${pct}%`, background: v.couleur}} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
