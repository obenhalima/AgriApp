'use client'
import { KpiCard } from '@/components/dashboard/KpiCard'

const STOCKS = [
  { code:'ST001', nom:'Plants Vitalia (greffés)', cat:'Plants', qte:24500, unite:'unité', min_qte:5000, cout_u:1.2, alerte:false },
  { code:'ST002', nom:'NPK 20-20-20', cat:'Engrais', qte:850, unite:'kg', min_qte:200, cout_u:12.5, alerte:false },
  { code:'ST003', nom:'Nitrate de Calcium', cat:'Engrais', qte:320, unite:'kg', min_qte:400, cout_u:8.2, alerte:true },
  { code:'ST004', nom:'Boîtes export 5kg', cat:'Emballages', qte:12400, unite:'unité', min_qte:3000, cout_u:2.8, alerte:false },
  { code:'ST005', nom:'Filets 1kg cerise', cat:'Emballages', qte:4800, unite:'unité', min_qte:5000, cout_u:0.85, alerte:true },
  { code:'ST006', nom:'Azoxystrobin 250SC', cat:'Phyto', qte:42, unite:'L', min_qte:20, cout_u:95.0, alerte:false },
  { code:'ST007', nom:'Substrat Coco 70L', cat:'Substrat', qte:180, unite:'sac', min_qte:50, cout_u:45.0, alerte:false },
]

const totalValeur = STOCKS.reduce((s, i) => s + i.qte * i.cout_u, 0)
const alertCount = STOCKS.filter(s => s.alerte).length

export default function StocksPage() {
  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-xl font-bold mb-1">📦 Gestion des Stocks</h2>
          <p className="text-sm text-[#8b949e]">{alertCount} article(s) sous le seuil d'alerte</p>
        </div>
        <button className="btn-primary">+ Mouvement Stock</button>
      </div>

      {STOCKS.filter(s => s.alerte).map(s => (
        <div key={s.code} className="flex items-center gap-3 p-3 rounded-lg mb-2 text-sm border bg-[#3d2e0a] border-[rgba(210,153,34,0.3)] text-[#d29922]">
          ⚠️ <strong>{s.nom}</strong> — Stock actuel <strong>{s.qte.toLocaleString('fr')} {s.unite}</strong> sous le seuil minimum ({s.min_qte.toLocaleString('fr')} {s.unite})
        </div>
      ))}

      <div className="grid grid-cols-4 gap-4 mb-5 mt-3">
        <KpiCard label="Articles en stock" value={String(STOCKS.length)} sub="7 références actives" color="blue" />
        <KpiCard label="Valeur totale" value={`${(totalValeur / 1000).toFixed(0)} k MAD`} sub="Stock valorisé" color="green" />
        <KpiCard label="Alertes stock" value={String(alertCount)} sub="sous seuil minimum" color="red" />
        <KpiCard label="Catégories" value="5" sub="Plants, Engrais, Phyto, Emballages, Substrat" />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <input type="text" placeholder="🔍  Rechercher un article…" className="form-input" style={{maxWidth:240}} />
            <select className="form-input" style={{maxWidth:160}}>
              <option>Toutes catégories</option><option>Plants</option><option>Engrais</option><option>Phyto</option><option>Emballages</option>
            </select>
          </div>
          <button className="btn-secondary text-xs">📊 Valorisation</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#30363d]">
                {['Code','Article','Catégorie','Stock Actuel','Seuil Min.','Coût Unitaire','Valeur Stock','Alerte','Actions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STOCKS.map(s => (
                <tr key={s.code} className="border-b border-[#30363d]/50 hover:bg-[#1c2333] transition-colors">
                  <td className="px-3 py-3 font-mono text-xs text-[#8b949e]">{s.code}</td>
                  <td className="px-3 py-3 font-semibold">{s.nom}</td>
                  <td className="px-3 py-3"><span className="px-2 py-0.5 rounded text-xs bg-[#0d2149] text-[#388bfd]">{s.cat}</span></td>
                  <td className="px-3 py-3 font-mono text-xs font-semibold" style={{color: s.alerte ? '#f85149' : 'inherit'}}>
                    {s.qte.toLocaleString('fr')} {s.unite}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-[#8b949e]">{s.min_qte.toLocaleString('fr')} {s.unite}</td>
                  <td className="px-3 py-3 font-mono text-xs">{s.cout_u.toFixed(2)} MAD</td>
                  <td className="px-3 py-3 font-mono text-xs font-semibold">{(s.qte * s.cout_u).toLocaleString('fr', {maximumFractionDigits:0})} MAD</td>
                  <td className="px-3 py-3">
                    {s.alerte
                      ? <span className="px-2 py-0.5 rounded text-xs bg-[#4a1a1a] text-[#f85149]">⚠ ALERTE</span>
                      : <span className="px-2 py-0.5 rounded text-xs bg-[#1a4a24] text-[#3fb950]">✓ OK</span>
                    }
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <button className="btn-secondary text-xs px-2 py-1">+ Entrée</button>
                      <button className="btn-ghost text-xs px-2 py-1">- Sortie</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#30363d] bg-[#1c2333]">
                <td colSpan={6} className="px-3 py-3 font-bold text-[#8b949e] text-sm">TOTAL STOCK</td>
                <td className="px-3 py-3 font-bold text-[#f07050]">{totalValeur.toLocaleString('fr', {maximumFractionDigits:0})} MAD</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
