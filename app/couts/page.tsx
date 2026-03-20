'use client'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { CostChart } from '@/components/dashboard/CostChart'

const COUTS = [
  { cat:'Semences/Plants', prev:245000, reel:238000 },
  { cat:'Engrais', prev:380000, reel:412000 },
  { cat:'Phytosanitaires', prev:185000, reel:178000 },
  { cat:'Irrigation/Eau', prev:210000, reel:198000 },
  { cat:'Énergie', prev:320000, reel:345000 },
  { cat:"Main-d'œuvre", prev:850000, reel:780000 },
  { cat:'Emballage', prev:620000, reel:590000 },
  { cat:'Transport', prev:290000, reel:268000 },
  { cat:'Frais Export', prev:180000, reel:165000 },
  { cat:'Maintenance', prev:95000, reel:88000 },
  { cat:'Divers', prev:125000, reel:110000 },
]

const totalPrev = COUTS.reduce((s, c) => s + c.prev, 0)
const totalReel = COUTS.reduce((s, c) => s + c.reel, 0)
const ecartPct = ((totalReel - totalPrev) / totalPrev * 100).toFixed(1)

export default function CoutsPage() {
  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-xl font-bold mb-1">💰 Coûts & Budget Campagne</h2>
          <p className="text-sm text-[#8b949e]">Campagne 2025-2026 · Budget 4.2 M MAD</p>
        </div>
        <button className="btn-primary">+ Saisir Coût</button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-5">
        <KpiCard label="Budget Total" value="4.20 M MAD" sub="prévisionnel campagne" color="blue" />
        <KpiCard label="Coûts Réels" value={`${(totalReel/1000000).toFixed(2)} M MAD`} sub="engagés à ce jour" color="tomato" />
        <KpiCard label="Coût / kg produit" value="3.00 MAD" sub="Objectif ≤ 3.20 MAD ✓" color="green" />
        <KpiCard label="Écart Budget" value={`${parseFloat(ecartPct) > 0 ? '+' : ''}${ecartPct}%`} sub="Légère dérive à surveiller" color={parseFloat(ecartPct) > 5 ? 'red' : 'amber'} />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="card">
          <div className="font-display font-bold text-sm mb-4">Prévu vs Réel par Catégorie</div>
          <CostChart />
        </div>
        <div className="card">
          <div className="font-display font-bold text-sm mb-4">Analyse par Catégorie</div>
          <div className="space-y-2">
            {COUTS.slice(0, 6).map(c => {
              const pct = Math.round((c.reel / c.prev) * 100)
              const over = c.reel > c.prev
              return (
                <div key={c.cat}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">{c.cat}</span>
                    <span style={{color: over ? '#f85149' : '#3fb950'}} className="font-semibold">
                      {over ? '+' : ''}{((c.reel - c.prev) / c.prev * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#232c3d] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.min(pct, 100)}%`,
                      background: over ? '#f85149' : '#3fb950'
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="font-display font-bold text-sm">Tableau Détaillé — Analyse par Catégorie</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#30363d]">
                {['Catégorie','Budget Prévu (MAD)','Réel (MAD)','Écart (MAD)','Écart %','Avancement'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#4a5568] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COUTS.map(c => {
                const ecart = c.reel - c.prev
                const ep = (ecart / c.prev * 100).toFixed(1)
                const pct = Math.round(c.reel / c.prev * 100)
                return (
                  <tr key={c.cat} className="border-b border-[#30363d]/50 hover:bg-[#1c2333] transition-colors">
                    <td className="px-3 py-3 font-semibold">{c.cat}</td>
                    <td className="px-3 py-3 font-mono text-xs">{c.prev.toLocaleString('fr')}</td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold">{c.reel.toLocaleString('fr')}</td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold" style={{color: ecart > 0 ? '#f85149' : '#3fb950'}}>
                      {ecart > 0 ? '+' : ''}{ecart.toLocaleString('fr')}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs" style={{color: ecart > 0 ? '#f85149' : '#3fb950'}}>
                      {ecart > 0 ? '+' : ''}{ep}%
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-[#232c3d] rounded-full overflow-hidden flex-shrink-0">
                          <div className="h-full rounded-full" style={{
                            width: `${Math.min(pct, 100)}%`,
                            background: pct > 100 ? '#f85149' : '#3fb950'
                          }} />
                        </div>
                        <span className="text-xs" style={{color: pct > 100 ? '#f85149' : '#8b949e'}}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#30363d] bg-[#1c2333]">
                <td className="px-3 py-3 font-bold">TOTAL</td>
                <td className="px-3 py-3 font-mono font-bold">{totalPrev.toLocaleString('fr')}</td>
                <td className="px-3 py-3 font-mono font-bold text-[#f07050]">{totalReel.toLocaleString('fr')}</td>
                <td className="px-3 py-3 font-mono font-bold text-[#d29922]">+{(totalReel-totalPrev).toLocaleString('fr')}</td>
                <td className="px-3 py-3 font-mono text-[#d29922]">+{ecartPct}%</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
