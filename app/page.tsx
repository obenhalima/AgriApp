'use client'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { ProductionChart } from '@/components/dashboard/ProductionChart'
import { CostChart, MarketPieChart } from '@/components/dashboard/CostChart'


import Link from 'next/link'

const ALERTES = [
  { type: 'error', titre: 'Facture en retard', msg: 'Groupe Carrefour — FV-2026-0086 — 41 000 MAD — Échue le 31/03' },
  { type: 'warning', titre: 'Stock critique', msg: 'Filets 1kg cerise — Stock 4800 < Seuil 5000 unités' },
  { type: 'warning', titre: 'Budget dépassé', msg: 'Engrais — Réel 412 000 MAD vs Prévu 380 000 MAD (+8.4%)' },
]

const SERRES = [
  { code: 'S01', nom: 'Serre Nord A', statut: 'active', varietes: 'Vitalia, Torero', superficie: 6200, rendement: 44.2, couleur: '#e05c3b' },
  { code: 'S02', nom: 'Serre Nord B', statut: 'active', varietes: 'Torero', superficie: 6200, rendement: 48.8, couleur: '#3fb950' },
  { code: 'S03', nom: 'Serre Sud A', statut: 'active', varietes: 'Grappe Premium', superficie: 5500, rendement: 38.5, couleur: '#a371f7' },
  { code: 'S04', nom: 'Serre Sud B', statut: 'active', varietes: 'Cherry Sun', superficie: 5500, rendement: 33.2, couleur: '#388bfd' },
  { code: 'S05', nom: 'Serre Est A', statut: 'active', varietes: 'Vitalia', superficie: 4800, rendement: 43.0, couleur: '#d29922' },
  { code: 'S06', nom: 'Serre Est B', statut: 'en_preparation', varietes: '—', superficie: 4800, rendement: 0, couleur: '#4a5568' },
]

const VARIETES_TOP = [
  { nom: 'Cherry Sun', marge: 61, couleur: '#3fb950' },
  { nom: 'Grappe Premium', marge: 55, couleur: '#a371f7' },
  { nom: 'Brillante', marge: 52, couleur: '#f07050' },
  { nom: 'Torero', marge: 48, couleur: '#388bfd' },
  { nom: 'Vitalia', marge: 42, couleur: '#d29922' },
]

export default function DashboardPage() {
  return (
    <div>
      {/* Filtres */}
      <div className="flex items-center gap-3 p-4 bg-[#161b22] border border-[#30363d] rounded-xl mb-5 flex-wrap">
        <span className="text-xs text-[#4a5568] font-medium">Filtres :</span>
        <select className="text-xs px-2.5 py-1.5 bg-[#1c2333] border border-[#30363d] rounded-lg text-[#8b949e] outline-none focus:border-[#e05c3b]">
          <option>Campagne 2025-2026</option>
          <option>Campagne 2024-2025</option>
        </select>
        <select className="text-xs px-2.5 py-1.5 bg-[#1c2333] border border-[#30363d] rounded-lg text-[#8b949e] outline-none">
          <option>Toutes les serres</option>
          {SERRES.map(s => <option key={s.code}>{s.code} — {s.nom}</option>)}
        </select>
        <select className="text-xs px-2.5 py-1.5 bg-[#1c2333] border border-[#30363d] rounded-lg text-[#8b949e] outline-none">
          <option>Toutes variétés</option>
          {VARIETES_TOP.map(v => <option key={v.nom}>{v.nom}</option>)}
        </select>
        <button className="ml-auto btn-secondary text-xs py-1.5">🔄 Actualiser</button>
      </div>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-5 gap-4 mb-4">
        <KpiCard label="Production Réelle" value="1 124 t" sub="60.8% de l'objectif 1 850t" color="tomato" icon="🍅" progress={61} />
        <KpiCard label="Rendement Moyen" value="42.8 kg/m²" sub="▲ +1.3% vs objectif" color="green" icon="📈" />
        <KpiCard label="Chiffre d'Affaires" value="3.01 M MAD" sub="▲ +8.2% vs campagne préc." color="blue" icon="💶" />
        <KpiCard label="Coût au kg" value="2.54 MAD" sub="✓ Objectif ≤ 2.80 MAD" color="amber" icon="💰" />
        <KpiCard label="Marge Nette" value="38.4%" sub="▲ +2.1 pts vs an dernier" color="purple" icon="📊" />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-5 gap-4 mb-5">
        <KpiCard label="Surface Totale" value="42 000 m²" sub="8 serres (7 en production)" />
        <KpiCard label="Budget Consommé" value="67.9%" sub="2.85M / 4.20M MAD" progress={68} color="amber" />
        <KpiCard label="Encours Clients" value="530 k MAD" sub="⚠ 1 facture en retard" color="red" />
        <KpiCard label="Dettes Fournisseurs" value="194 k MAD" sub="3 factures à régler" />
        <KpiCard label="Alertes Actives" value="5" sub="2 critiques · 3 avertissements" color="red" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-sm">Courbe de Production (Semaines)</h3>
          </div>
          <ProductionChart />
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-sm">Coûts Prévu vs Réel</h3>
          </div>
          <CostChart />
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="card">
          <h3 className="font-display font-bold text-sm mb-4">Répartition par Marché</h3>
          <MarketPieChart />
        </div>

        <div className="card">
          <h3 className="font-display font-bold text-sm mb-4">Top Variétés — Marge %</h3>
          {VARIETES_TOP.map(v => (
            <div key={v.nom} className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">{v.nom}</span>
                <span style={{ color: v.couleur }} className="font-semibold">{v.marge}%</span>
              </div>
              <div className="h-1.5 bg-[#232c3d] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${v.marge}%`, background: v.couleur }} />
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-sm">🔔 Alertes Récentes</h3>
            <Link href="/alertes" className="text-xs text-[#8b949e] hover:text-[#e6edf3]">Voir tout →</Link>
          </div>
          {ALERTES.map((a, i) => (
            <div key={i} className={`p-3 rounded-lg mb-2 border text-sm ${
              a.type === 'error' ? 'bg-[#4a1a1a] border-[rgba(248,81,73,0.3)] text-[#f85149]' :
              'bg-[#3d2e0a] border-[rgba(210,153,34,0.3)] text-[#d29922]'
            }`}>
              <div className="font-semibold text-xs mb-1">{a.titre}</div>
              <div className="text-xs opacity-80">{a.msg}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Serres Status */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-sm">🏗️ Statut des Serres</h3>
          <Link href="/serres" className="btn-ghost text-xs">Gérer →</Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {SERRES.map(s => (
            <div key={s.code} className="flex items-center gap-3 p-3 bg-[#1c2333] rounded-lg border border-[#30363d] hover:border-[#4a5568] transition-colors">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: `${s.couleur}22`, border: `1px solid ${s.couleur}44`, color: s.couleur }}>
                {s.code}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{s.nom}</div>
                <div className="text-xs text-[#4a5568] truncate">{s.varietes}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={s.statut === 'active' ? 'status-active text-[10px]' : 'status-pending text-[10px]'}>
                  {s.statut === 'active' ? '● actif' : '● prép.'}
                </div>
                {s.rendement > 0 && <div className="text-xs text-[#8b949e] mt-0.5">{s.rendement} kg/m²</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
