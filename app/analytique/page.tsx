'use client'
import { useState } from 'react'

export default function AnalytiquePage() {
  const [prix, setPrix] = useState(0)
  const [rend, setRend] = useState(0)
  const [cout, setCout] = useState(0)
  const [exportPct, setExportPct] = useState(54)

  const baseProd = 1850 * (1 + rend / 100)
  const avgPrice = (exportPct / 100) * 6.3 + (1 - exportPct / 100) * 3.5
  const adjPrice = avgPrice * (1 + prix / 100)
  const ca = baseProd * 1000 * adjPrice
  const totalCost = 3400000 * (1 + cout / 100)
  const margin = ca - totalCost
  const marginPct = ca > 0 ? (margin / ca * 100).toFixed(1) : '0'

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-xl font-bold mb-1">🤖 Analytique & Simulation IA</h2>
          <p className="text-sm text-[#8b949e]">Prévisions, scénarios et recommandations automatiques</p>
        </div>
        <span className="px-3 py-1.5 rounded-lg text-xs font-bold tracking-widest uppercase bg-[#2d1a4a] border border-[rgba(163,113,247,0.3)] text-[#a371f7]">
          IA ACTIVE
        </span>
      </div>

      {/* Scénarios */}
      <div className="text-xs font-semibold text-[#4a5568] uppercase tracking-widest mb-3">Simulation Budgétaire — 3 Scénarios</div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: '🔴 Pessimiste', color: '#f85149', bg: 'rgba(248,81,73,0.04)', border: 'rgba(248,81,73,0.25)', prod: '1 572 t', ca: '4.82 M', couts: '4.20 M', marge: '12.8%', result: '+617 k MAD' },
          { label: '🔵 Réaliste', color: '#388bfd', bg: 'rgba(56,139,253,0.04)', border: 'rgba(56,139,253,0.25)', prod: '1 850 t', ca: '5.68 M', couts: '3.96 M', marge: '30.3%', result: '+1.72 M MAD' },
          { label: '🟢 Optimiste', color: '#3fb950', bg: 'rgba(63,185,80,0.04)', border: 'rgba(63,185,80,0.25)', prod: '2 035 t', ca: '6.24 M', couts: '3.80 M', marge: '39.1%', result: '+2.44 M MAD' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 border" style={{ background: s.bg, borderColor: s.border }}>
            <div className="font-display text-sm font-bold mb-3" style={{ color: s.color }}>{s.label}</div>
            {[
              ['Production', s.prod], ['CA', `${s.ca} MAD`],
              ['Coûts', `${s.couts} MAD`], ['Marge nette', s.marge], ['Résultat', s.result]
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between items-center py-1.5 border-b border-[#30363d] last:border-0 text-sm">
                <span className="text-[#8b949e]">{k}</span>
                <span className="font-semibold" style={k === 'Résultat' || k === 'Marge nette' ? { color: s.color } : {}}>{v}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* What-If */}
      <div className="text-xs font-semibold text-[#4a5568] uppercase tracking-widest mb-3">🎛️ What-If Analysis — Simulateur Interactif</div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card">
          <div className="font-display text-sm font-bold mb-4">Paramètres de Simulation</div>
          {[
            { label: 'Variation des Prix de Vente', val: prix, set: setPrix, min: -30, max: 30, unit: '%' },
            { label: 'Variation du Rendement', val: rend, set: setRend, min: -30, max: 30, unit: '%' },
            { label: 'Variation des Coûts Intrants', val: cout, set: setCout, min: -20, max: 40, unit: '%' },
            { label: 'Part Export', val: exportPct, set: setExportPct, min: 0, max: 90, unit: '%' },
          ].map(slider => (
            <div key={slider.label} className="mb-4">
              <label className="form-label">{slider.label}</label>
              <input type="range" min={slider.min} max={slider.max} value={slider.val}
                onChange={e => slider.set(Number(e.target.value))}
                className="w-full h-1.5 bg-[#232c3d] rounded-full appearance-none cursor-pointer accent-[#e05c3b]" />
              <div className="flex justify-between text-xs text-[#4a5568] mt-1">
                <span>{slider.min}{slider.unit}</span>
                <span className="text-[#f07050] font-semibold">{slider.val >= 0 ? '+' : ''}{slider.val}{slider.unit}</span>
                <span>{slider.max}{slider.unit}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="font-display text-sm font-bold mb-4">Résultats Calculés</div>
          <div className="bg-[#1c2333] rounded-lg p-4 mb-3">
            {[
              ['Production estimée', `${Math.round(baseProd).toLocaleString('fr')} t`],
              ['Chiffre d\'affaires', `${(ca / 1000000).toFixed(2)} M MAD`],
              ['Coûts totaux', `${(totalCost / 1000000).toFixed(2)} M MAD`],
              ['Coût au kg', `${(totalCost / (baseProd * 1000)).toFixed(2)} MAD/kg`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5 border-b border-[#30363d] last:border-0 text-sm">
                <span className="text-[#8b949e]">{k}</span>
                <span className="font-semibold">{v}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 text-sm">
              <span className="text-[#8b949e]">Résultat net</span>
              <span className="font-bold text-base" style={{ color: margin > 0 ? '#3fb950' : '#f85149' }}>
                {margin >= 0 ? '+' : ''}{(margin / 1000000).toFixed(2)} M MAD
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#8b949e]">Marge nette</span>
              <span className="font-bold" style={{ color: parseFloat(marginPct) > 25 ? '#3fb950' : parseFloat(marginPct) > 10 ? '#d29922' : '#f85149' }}>
                {marginPct}%
              </span>
            </div>
          </div>
          <div className={`p-3 rounded-lg text-sm border ${
            parseFloat(marginPct) > 25 ? 'bg-[#1a4a24] border-[rgba(63,185,80,0.3)] text-[#3fb950]' :
            parseFloat(marginPct) > 10 ? 'bg-[#0d2149] border-[rgba(56,139,253,0.3)] text-[#388bfd]' :
            'bg-[#3d2e0a] border-[rgba(210,153,34,0.3)] text-[#d29922]'
          }`}>
            {parseFloat(marginPct) > 25 ? '✅ Scénario très rentable — Conditions favorables.' :
             parseFloat(marginPct) > 10 ? '📊 Scénario viable — Surveiller l\'évolution des coûts.' :
             '⚠️ Marge réduite. Revoir la stratégie commerciale.'}
          </div>
        </div>
      </div>

      {/* Recommandations */}
      <div className="text-xs font-semibold text-[#4a5568] uppercase tracking-widest mb-3">💡 Recommandations Automatiques</div>
      <div className="grid grid-cols-2 gap-4">
        {[
          {
            titre: 'Variétés Recommandées',
            items: [
              { color: '#3fb950', bg: 'rgba(63,185,80,0.06)', border: 'rgba(63,185,80,0.15)', text: '🥇 Cherry Sun — Marge la plus élevée (61%). Augmenter la surface de 15-20% en S04 pour la prochaine campagne.' },
              { color: '#388bfd', bg: 'rgba(56,139,253,0.06)', border: 'rgba(56,139,253,0.15)', text: '🥈 Torero — Excellent export (0.60€/kg). Maintenir la superficie actuelle.' },
              { color: '#d29922', bg: 'rgba(210,153,34,0.06)', border: 'rgba(210,153,34,0.15)', text: '⚠️ Vitalia — Rendement légèrement sous objectif. Réviser les apports nutritifs en S05.' },
            ]
          },
          {
            titre: 'Arbitrage Marchés',
            items: [
              { color: '#e05c3b', bg: 'rgba(224,92,59,0.06)', border: 'rgba(224,92,59,0.15)', text: '🏆 Export France — Meilleure marge nette/kg. Augmenter à 40% (actuellement 32%). Potentiel +320 k MAD.' },
              { color: '#3fb950', bg: 'rgba(63,185,80,0.06)', border: 'rgba(63,185,80,0.15)', text: '💡 Grande Distribution — Opportunité avec Torero pour labellisation premium.' },
              { color: '#4a5568', bg: 'rgba(139,148,158,0.06)', border: 'rgba(139,148,158,0.15)', text: '📉 Marché Local — Prix sous pression. Recentrer sur cherry et cocktail à forte valeur.' },
            ]
          }
        ].map(section => (
          <div key={section.titre} className="rounded-xl p-4 border" style={{ background: 'linear-gradient(135deg,rgba(163,113,247,0.05),rgba(56,139,253,0.03))', borderColor: 'rgba(163,113,247,0.15)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase bg-[#2d1a4a] border border-[rgba(163,113,247,0.3)] text-[#a371f7]">IA</span>
              <span className="font-display text-sm font-bold">{section.titre}</span>
            </div>
            {section.items.map((item, i) => (
              <div key={i} className="p-3 rounded-lg mb-2 text-xs border" style={{ background: item.bg, borderColor: item.border, color: item.color }}>
                {item.text}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
