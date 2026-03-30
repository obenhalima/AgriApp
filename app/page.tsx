'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const KPI_CONFIG = [
  { key:'recoltes',     label:'Récoltes',     icon:'🌿', color:'#10b981', accent:'rgba(16,185,129,.1)',   progress:78, unit:'lots',       href:'/recoltes' },
  { key:'serres',       label:'Serres',        icon:'🏗️', color:'#3b82f6', accent:'rgba(59,130,246,.1)',   progress:88, unit:'actives',    href:'/serres' },
  { key:'clients',      label:'Clients',       icon:'🤝', color:'#8b5cf6', accent:'rgba(139,92,246,.1)',   progress:55, unit:'actifs',     href:'/clients' },
  { key:'fournisseurs', label:'Fournisseurs',  icon:'🏢', color:'#f59e0b', accent:'rgba(245,158,11,.1)',   progress:40, unit:'référencés', href:'/fournisseurs' },
  { key:'stocks',       label:'Stocks',        icon:'📦', color:'#14b8a6', accent:'rgba(20,184,166,.1)',   progress:62, unit:'articles',   href:'/stocks' },
  { key:'factures',     label:'Factures',      icon:'🧾', color:'#ec4899', accent:'rgba(236,72,153,.1)',   progress:30, unit:'en cours',   href:'/factures' },
]

const ACTIONS = [
  { label:'Nouvelle récolte',   icon:'🌿', color:'#059669', bg:'rgba(16,185,129,.08)',  bd:'rgba(16,185,129,.2)',  href:'/recoltes' },
  { label:'Saisir un prix',     icon:'⚡', color:'#d97706', bg:'rgba(245,158,11,.08)',  bd:'rgba(245,158,11,.2)',  href:'/recoltes' },
  { label:'Dispatcher',         icon:'📦', color:'#2563eb', bg:'rgba(59,130,246,.08)',  bd:'rgba(59,130,246,.2)',  href:'/recoltes' },
  { label:'Période prix',       icon:'📅', color:'#7c3aed', bg:'rgba(139,92,246,.08)', bd:'rgba(139,92,246,.2)',  href:'/recoltes' },
  { label:'Bon de commande',    icon:'🛒', color:'#d97706', bg:'rgba(234,179,8,.08)',   bd:'rgba(234,179,8,.2)',   href:'/achats' },
  { label:'IA & Prévisions',    icon:'🤖', color:'#6366f1', bg:'rgba(99,102,241,.08)', bd:'rgba(99,102,241,.2)',  href:'/analytique' },
]

export default function DashboardPage() {
  const [stats, setStats] = useState<Record<string,number>>({})
  const [loading, setLoading] = useState(true)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    Promise.all([
      supabase.from('harvests').select('id',{count:'exact',head:true}),
      supabase.from('greenhouses').select('id',{count:'exact',head:true}),
      supabase.from('clients').select('id',{count:'exact',head:true}).eq('is_active',true),
      supabase.from('suppliers').select('id',{count:'exact',head:true}).eq('is_active',true),
      supabase.from('stock_items').select('id',{count:'exact',head:true}).eq('is_active',true),
      supabase.from('invoices').select('id',{count:'exact',head:true}).eq('status','sent'),
      supabase.from('alerts').select('id',{count:'exact',head:true}).eq('is_resolved',false),
    ]).then(([recoltes,serres,clients,fournisseurs,stocks,factures,alertes]) => {
      setStats({ recoltes:recoltes.count||0, serres:serres.count||0, clients:clients.count||0, fournisseurs:fournisseurs.count||0, stocks:stocks.count||0, factures:factures.count||0, alertes:alertes.count||0 })
      setLoading(false)
    })
  }, [])

  return (
    <div style={{ position:'relative', zIndex:1 }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <div className="page-title">Tableau de bord</div>
          <div className="page-sub">CAMPAGNE 2025-2026 · DOMAINE SOUSS AGRI · MES PRODUCTION</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {stats.alertes > 0 && (
            <Link href="/alertes" style={{ textDecoration:'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.2)', fontFamily:'var(--font-mono)', fontSize:10, color:'#dc2626', fontWeight:600 }}>
                🔔 {stats.alertes} alerte(s)
              </div>
            </Link>
          )}
          <div style={{ fontFamily:'var(--font-mono)', fontSize:13, fontWeight:500, color:'var(--tx-3)', letterSpacing:1 }}>
            {time.toLocaleTimeString('fr-FR')}
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))', gap:12, marginBottom:18 }}>
        {KPI_CONFIG.map(k => (
          <Link key={k.key} href={k.href} style={{ textDecoration:'none' }}>
            <div className="kpi" style={{ '--accent':k.color, '--progress': `${k.progress}%` } as any}>
              <div className="kpi-label">
                <span>{k.label.toUpperCase()}</span>
                <span style={{ fontSize:18, lineHeight:1 }}>{k.icon}</span>
              </div>
              <div className="kpi-value" style={{ color:k.color }}>
                {loading ? '—' : (stats[k.key] || 0)}
              </div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--tx-3)', marginTop:6 }}>{k.unit}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Grille principale ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

        {/* Actions rapides */}
        <div className="card">
          <div className="section-label">⚡ ACTIONS RAPIDES</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {ACTIONS.map((a,i) => (
              <Link key={i} href={a.href} style={{ textDecoration:'none' }}>
                <div style={{
                  display:'flex', alignItems:'center', gap:9, padding:'11px 13px',
                  borderRadius:9, border:`1px solid ${a.bd}`, background:a.bg,
                  cursor:'pointer', transition:'all .15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 12px ${a.bg}` }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
                  <span style={{ fontSize:16, flexShrink:0 }}>{a.icon}</span>
                  <span style={{ fontSize:12, fontWeight:500, color:'var(--tx-1)', lineHeight:1.3 }}>{a.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* État système */}
        <div className="card">
          <div className="section-label">🖥 ÉTAT SYSTÈME</div>
          <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
            {[
              { label:'Base de données',       val:'Connectée',    ok:true,  icon:'🗄️' },
              { label:'Authentification',       val:'Active',       ok:true,  icon:'🔐' },
              { label:'Campagne en cours',      val:'2025-2026',    ok:true,  icon:'📅' },
              { label:'Alertes actives',        val:`${stats.alertes||0}`, ok:stats.alertes===0, icon:'🔔' },
              { label:'Dernière sync',          val:'À l\'instant', ok:true,  icon:'🔄' },
            ].map((s,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, background:'var(--bg-card2)', border:'1px solid var(--border)' }}>
                <span style={{ fontSize:14, flexShrink:0 }}>{s.icon}</span>
                <span style={{ flex:1, fontSize:12.5, color:'var(--tx-2)', fontWeight:500 }}>{s.label}</span>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:s.ok?'#22c55e':'#ef4444', boxShadow:`0 0 5px ${s.ok?'#22c55e':'#ef4444'}`, flexShrink:0 }} />
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:s.ok?'#059669':'#dc2626', fontWeight:600, letterSpacing:.3 }}>{s.val}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
