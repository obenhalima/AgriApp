'use client'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { ProductionChart } from '@/components/dashboard/ProductionChart'
import { CostChart, MarketPieChart } from '@/components/dashboard/CostChart'
import Link from 'next/link'

// ⚠️ Ces données ne s'affichent qu'en mode DEMO
// En production, les données viennent de Supabase
const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

const DEMO_ALERTES = [
  { type: 'error',   titre: 'Facture en retard',  msg: 'Groupe Carrefour — FV-2026-0086 — 41 000 MAD' },
  { type: 'warning', titre: 'Stock critique',      msg: 'Filets 1kg cerise — 4 800 < seuil 5 000 unités' },
  { type: 'warning', titre: 'Budget dépassé',      msg: 'Engrais +8.4% vs budget prévu' },
]

const DEMO_SERRES = [
  { code:'S01', nom:'Serre Nord A',  statut:'active',       varietes:'Vitalia, Torero',  rendement:44.2, couleur:'#d94535' },
  { code:'S02', nom:'Serre Nord B',  statut:'active',       varietes:'Torero',           rendement:48.8, couleur:'#5a7a35' },
  { code:'S03', nom:'Serre Sud A',   statut:'active',       varietes:'Grappe Premium',   rendement:38.5, couleur:'#c8882a' },
  { code:'S04', nom:'Serre Sud B',   statut:'active',       varietes:'Cherry Sun',       rendement:33.2, couleur:'#4a8ab0' },
  { code:'S05', nom:'Serre Est A',   statut:'active',       varietes:'Vitalia',          rendement:43.0, couleur:'#7aab45' },
  { code:'S06', nom:'Serre Est B',   statut:'en_preparation', varietes:'—',             rendement:0,    couleur:'#9b8a6e' },
]

const VARIETES_TOP = [
  { nom:'Cherry Sun',    marge:61, couleur:'#5a7a35' },
  { nom:'Grappe Premium',marge:55, couleur:'#c8882a' },
  { nom:'Brillante',     marge:52, couleur:'#d94535' },
  { nom:'Torero',        marge:48, couleur:'#4a8ab0' },
  { nom:'Vitalia',       marge:42, couleur:'#7aab45' },
]

export default function DashboardPage() {
  return (
    <div>
      {/* Bannière DEMO */}
      {IS_DEMO && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-5 text-sm font-medium"
          style={{ background: 'rgba(200,136,42,0.1)', border: '1px solid rgba(200,136,42,0.25)', color: 'var(--ochre)' }}>
          🌾 <strong>Mode Démo</strong> — Les données affichées sont des exemples. Connectez Supabase pour les données réelles.
        </div>
      )}

      {/* Filtres */}
      <div className="flex items-center gap-3 p-4 rounded-2xl mb-5 flex-wrap"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Filtres :</span>
        {['Campagne 2025-2026 ▾', 'Toutes les serres ▾', 'Toutes variétés ▾', 'Tous marchés ▾'].map(f => (
          <button key={f} className="text-xs px-3 py-1.5 rounded-xl font-medium transition-colors"
            style={{ background: 'var(--straw)', border: '1px solid var(--border-dark)', color: 'var(--text-sub)' }}>
            {f}
          </button>
        ))}
        <button className="ml-auto text-xs px-3 py-1.5 rounded-xl"
          style={{ background: 'var(--straw)', border: '1px solid var(--border-dark)', color: 'var(--text-muted)' }}>
          🔄 Actualiser
        </button>
      </div>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-5 gap-4 mb-4">
        <KpiCard label="Production Réelle" value={IS_DEMO ? "1 124 t" : "—"} sub={IS_DEMO ? "60.8% objectif 1 850t" : "Aucune donnée"} color="tomato" icon="🍅" progress={IS_DEMO ? 61 : 0} />
        <KpiCard label="Rendement Moyen"   value={IS_DEMO ? "42.8 kg/m²" : "—"} sub={IS_DEMO ? "▲ +1.3% vs objectif" : "Aucune donnée"} color="green" icon="🌿" />
        <KpiCard label="Chiffre d'Affaires" value={IS_DEMO ? "3.01 M MAD" : "—"} sub={IS_DEMO ? "▲ +8.2% vs campagne préc." : "Aucune donnée"} color="amber" icon="🌾" />
        <KpiCard label="Coût au kg"        value={IS_DEMO ? "2.54 MAD" : "—"} sub={IS_DEMO ? "✓ Objectif ≤ 2.80 MAD" : "Aucune donnée"} color="leaf" icon="💰" />
        <KpiCard label="Marge Nette"       value={IS_DEMO ? "38.4%" : "—"} sub={IS_DEMO ? "▲ +2.1 pts vs an dernier" : "Aucune donnée"} color="blue" icon="📊" />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-5 gap-4 mb-5">
        <KpiCard label="Surface Exploitée"   value={IS_DEMO ? "42 000 m²" : "—"} sub="8 serres actives" />
        <KpiCard label="Budget Consommé"     value={IS_DEMO ? "67.9%" : "—"} sub={IS_DEMO ? "2.85M / 4.20M MAD" : ""} progress={IS_DEMO ? 68 : 0} color="amber" />
        <KpiCard label="Encours Clients"     value={IS_DEMO ? "530 k MAD" : "—"} sub={IS_DEMO ? "⚠ 1 facture en retard" : ""} color="rust" />
        <KpiCard label="Dettes Fournisseurs" value={IS_DEMO ? "194 k MAD" : "—"} sub={IS_DEMO ? "3 factures à régler" : ""} />
        <KpiCard label="Alertes Actives"     value={IS_DEMO ? "5" : "0"} sub={IS_DEMO ? "2 critiques · 3 avert." : "Aucune alerte"} color="rust" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card">
          <h3 className="text-sm font-bold mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
            🌱 Courbe de Production (Semaines)
          </h3>
          {IS_DEMO
            ? <ProductionChart />
            : <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>Connectez Supabase pour afficher les données</div>
          }
        </div>
        <div className="card">
          <h3 className="text-sm font-bold mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
            💰 Coûts Prévu vs Réel
          </h3>
          {IS_DEMO
            ? <CostChart />
            : <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>Connectez Supabase pour afficher les données</div>
          }
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="card">
          <h3 className="text-sm font-bold mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>🌍 Répartition par Marché</h3>
          {IS_DEMO ? <MarketPieChart /> : <div className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>Aucune donnée</div>}
        </div>

        <div className="card">
          <h3 className="text-sm font-bold mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>🏆 Top Variétés — Marge</h3>
          {IS_DEMO && VARIETES_TOP.map(v => (
            <div key={v.nom} className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-semibold" style={{ color: 'var(--text-main)' }}>{v.nom}</span>
                <span className="font-bold" style={{ color: v.couleur }}>{v.marge}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--sand)' }}>
                <div className="h-full rounded-full" style={{ width: `${v.marge}%`, background: v.couleur, opacity: 0.85 }} />
              </div>
            </div>
          ))}
          {!IS_DEMO && <div className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>Aucune donnée</div>}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>🔔 Alertes Récentes</h3>
            <Link href="/alertes" className="text-xs font-medium" style={{ color: 'var(--leaf)' }}>Voir tout →</Link>
          </div>
          {IS_DEMO && DEMO_ALERTES.map((a, i) => (
            <div key={i} className={`text-xs mb-2 ${a.type === 'error' ? 'alert-error' : 'alert-warning'}`}>
              <div className="font-bold mb-0.5">{a.titre}</div>
              <div className="opacity-80">{a.msg}</div>
            </div>
          ))}
          {!IS_DEMO && <div className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>Aucune alerte active</div>}
        </div>
      </div>

      {/* Serres */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>🏡 Statut des Serres</h3>
          <Link href="/serres" className="btn-ghost text-xs">Gérer →</Link>
        </div>
        {IS_DEMO ? (
          <div className="grid grid-cols-3 gap-3">
            {DEMO_SERRES.map(s => (
              <div key={s.code} className="flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer"
                style={{ background: 'var(--straw)', border: '1px solid var(--border)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: `${s.couleur}18`, border: `1.5px solid ${s.couleur}40`, color: s.couleur }}>
                  {s.code}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-main)' }}>{s.nom}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{s.varietes}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={s.statut === 'active' ? 'status-active' : 'status-pending'} style={{ fontSize: 10 }}>
                    {s.statut === 'active' ? '● actif' : '● prép.'}
                  </span>
                  {s.rendement > 0 && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.rendement} kg/m²</div>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>
            Aucune serre enregistrée. <Link href="/serres" style={{ color: 'var(--leaf)' }}>Créer une serre →</Link>
          </div>
        )}
      </div>
    </div>
  )
}
