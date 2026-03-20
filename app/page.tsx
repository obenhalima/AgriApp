'use client'
import Link from 'next/link'
import { ProductionChart } from '@/components/dashboard/ProductionChart'
import { CostChart, MarketPieChart } from '@/components/dashboard/CostChart'

const SERRES = [
  { code:'S01', nom:'Nord A', var:'Vitalia, Torero', rend:44.2, th:47, color:'#40916c' },
  { code:'S02', nom:'Nord B', var:'Torero', rend:48.8, th:50, color:'#2d6a4f' },
  { code:'S03', nom:'Sud A', var:'Grappe Premium', rend:38.5, th:40, color:'#74c69d' },
  { code:'S04', nom:'Sud B', var:'Cherry Sun', rend:33.2, th:35, color:'#e9c46a' },
  { code:'S05', nom:'Est A', var:'Vitalia', rend:43.0, th:45, color:'#f4a261' },
  { code:'S06', nom:'Est B', var:'—', rend:0, th:0, color:'#aaa', prep:true } as any,
]

const VARS = [
  { nom:'Cherry Sun', pct:61, color:'#74c69d' },
  { nom:'Grappe Premium', pct:55, color:'#40916c' },
  { nom:'Brillante', pct:52, color:'#2d6a4f' },
  { nom:'Torero', pct:48, color:'#e9c46a' },
  { nom:'Vitalia', pct:42, color:'#f4a261' },
]

const ALERTES = [
  { type:'err', titre:'Facture en retard', msg:'Carrefour · FV-2026-0086 · 41 000 MAD' },
  { type:'warn', titre:'Stock critique', msg:'Filets 1kg cerise — 4 800 / 5 000 min' },
  { type:'warn', titre:'Budget engrais dépassé', msg:'412k vs 380k prévu (+8.4%)' },
]

export default function DashboardPage() {
  return (
    <div style={{ padding: '20px 24px' }}>

      {/* Filtres */}
      <div className="flex items-center gap-2 p-3 mb-4 rounded-xl"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Vue :</span>
        {['Toutes les serres','Toutes les variétés','Mars 2026'].map((opt, i) => (
          <select key={i} className="form-input" style={{ width: 'auto', padding: '4px 8px', fontSize: 11.5 }}>
            <option>{opt}</option>
          </select>
        ))}
      </div>

      {/* KPI ROW — 4 cartes */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label:'Récolte cumulée', value:'1 124', unit:'t', sub:'61% de l'objectif 1 850t', tag:'tag-green', tagTxt:'En bonne voie', color:'#2d6a4f', progress:61, icon:'🍅' },
          { label:'Rendement moyen', value:'42.8', unit:'kg/m²', sub:'+1.3% vs objectif', tag:'tag-green', tagTxt:'Bon rendement', color:'#40916c', icon:'☀️' },
          { label:'Chiffre d\'affaires', value:'3.01', unit:'M MAD', sub:'+8.2% vs an dernier', tag:'tag-green', tagTxt:'En hausse', color:'#e9c46a', icon:'💰' },
          { label:'Marge nette', value:'38.4', unit:'%', sub:'Budget consommé à 68%', tag:'tag-amber', tagTxt:'À surveiller', color:'#f4a261', icon:'📊' },
        ].map((k, i) => (
          <div key={i} className="kpi-card" style={{ borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 17, marginBottom: 8 }}>{k.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 24, fontWeight: 800, lineHeight: 1, marginBottom: 5 }}>
              {k.value} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{k.unit}</span>
            </div>
            <span className={k.tag}>{k.tagTxt}</span>
            {k.progress && (
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${k.progress}%`, background: k.color, borderRadius: 2 }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700 }}>Production hebdomadaire (tonnes)</h3>
            <Link href="/production" style={{ fontSize:11, color:'var(--leaf2)', fontWeight:500 }}>Voir détail →</Link>
          </div>
          <ProductionChart />
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700 }}>Serres actives</h3>
            <Link href="/serres" style={{ fontSize:11, color:'var(--leaf2)', fontWeight:500 }}>Gérer →</Link>
          </div>
          {SERRES.map(s => {
            const pct = s.th > 0 ? Math.round(s.rend / s.th * 100) : 0
            const ok = pct >= 93
            return (
              <div key={s.code} className="flex items-center gap-2.5 py-2" style={{ borderBottom:'1px solid var(--border)' }}>
                <div className="flex items-center justify-center flex-shrink-0"
                  style={{ width:34, height:34, borderRadius:8, background:`${s.color}22`, color:s.color, fontSize:10, fontWeight:700 }}>
                  {s.code}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12.5, fontWeight:600 }}>{s.nom}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>{s.var}</div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  {s.prep
                    ? <span className="tag-amber">prép.</span>
                    : <>
                        <div style={{ fontSize:12, fontWeight:600, color: ok ? '#2d6a4f' : '#c07a00' }}>{s.rend} kg/m²</div>
                        <div style={{ fontSize:10, color:'var(--muted)' }}>{pct}% obj.</div>
                      </>
                  }
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-4">

        {/* Marchés */}
        <div className="card">
          <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700, marginBottom:14 }}>Débouchés commerciaux</h3>
          <MarketPieChart />
        </div>

        {/* Variétés */}
        <div className="card">
          <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700, marginBottom:14 }}>Marge par variété</h3>
          {VARS.map(v => (
            <div key={v.nom} style={{ marginBottom:10 }}>
              <div className="flex justify-between" style={{ fontSize:12, marginBottom:3 }}>
                <span style={{ fontWeight:500 }}>{v.nom}</span>
                <span style={{ color:v.color, fontWeight:600 }}>{v.pct}%</span>
              </div>
              <div style={{ height:6, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${v.pct}%`, background:v.color, borderRadius:3 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Alertes */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700 }}>Alertes récentes</h3>
            <Link href="/alertes" style={{ fontSize:11, color:'var(--leaf2)', fontWeight:500 }}>Voir tout →</Link>
          </div>
          {ALERTES.map((a, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'flex-start', gap:8,
              padding:'9px 11px', borderRadius:8, marginBottom:6, fontSize:12,
              background: a.type==='err' ? '#fff1f1' : '#fffaed',
              border: `1px solid ${a.type==='err' ? '#fcc' : '#f0e0a0'}`,
              color: a.type==='err' ? '#7a1010' : '#7a5500',
            }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background: a.type==='err' ? '#e63946' : '#e9c46a', flexShrink:0, marginTop:3, display:'block' }} />
              <div>
                <div style={{ fontWeight:600, marginBottom:1 }}>{a.titre}</div>
                <div style={{ opacity:.8, fontSize:11 }}>{a.msg}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
