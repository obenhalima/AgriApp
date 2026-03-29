'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const [stats, setStats] = useState({ serres:0, varietes:0, clients:0, fournisseurs:0, stocks:0, factures:0, alertes:0, recoltes:0 })
  const [loading, setLoading] = useState(true)
  const [time, setTime]  = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    Promise.all([
      supabase.from('greenhouses').select('id',{count:'exact',head:true}),
      supabase.from('varieties').select('id',{count:'exact',head:true}).eq('is_active',true),
      supabase.from('clients').select('id',{count:'exact',head:true}).eq('is_active',true),
      supabase.from('suppliers').select('id',{count:'exact',head:true}).eq('is_active',true),
      supabase.from('stock_items').select('id',{count:'exact',head:true}).eq('is_active',true),
      supabase.from('invoices').select('id',{count:'exact',head:true}).eq('status','sent'),
      supabase.from('alerts').select('id',{count:'exact',head:true}).eq('is_resolved',false),
      supabase.from('harvests').select('id',{count:'exact',head:true}),
    ]).then(([serres,varietes,clients,fournisseurs,stocks,factures,alertes,recoltes]) => {
      setStats({ serres:serres.count||0, varietes:varietes.count||0, clients:clients.count||0,
        fournisseurs:fournisseurs.count||0, stocks:stocks.count||0, factures:factures.count||0,
        alertes:alertes.count||0, recoltes:recoltes.count||0 })
      setLoading(false)
    })
  }, [])

  const KPIS = [
    { label:'Récoltes',     val:stats.recoltes,     unit:'lots',          color:'#10b981', href:'/recoltes' },
    { label:'Serres',       val:stats.serres,       unit:'actives',       color:'#34d399', href:'/serres' },
    { label:'Clients',      val:stats.clients,      unit:'actifs',        color:'#3b82f6', href:'/clients' },
    { label:'Fournisseurs', val:stats.fournisseurs, unit:'référencés',    color:'#f59e0b', href:'/fournisseurs' },
    { label:'Stock Items',  val:stats.stocks,       unit:'références',    color:'#8b5cf6', href:'/stocks' },
    { label:'Factures',     val:stats.factures,     unit:'en cours',      color:'#ec4899', href:'/factures' },
  ]

  const ACTIONS = [
    { label:'Nouvelle récolte',  href:'/recoltes',   icon:'🌿', color:'#10b981', bg:'rgba(16,185,129,.1)' },
    { label:'Saisir un prix',    href:'/recoltes',   icon:'⚡', color:'#f59e0b', bg:'rgba(245,158,11,.1)' },
    { label:'Dispatcher',        href:'/recoltes',   icon:'📦', color:'#3b82f6', bg:'rgba(59,130,246,.1)' },
    { label:'Bons de commande',  href:'/achats',     icon:'📋', color:'#8b5cf6', bg:'rgba(139,92,246,.1)' },
    { label:'Entrée stock',      href:'/stocks',     icon:'⬣',  color:'#ec4899', bg:'rgba(236,72,153,.1)' },
    { label:'IA & Prévisions',   href:'/analytique', icon:'✦',  color:'#06b6d4', bg:'rgba(6,182,212,.1)' },
  ]

  return (
    <div style={{ position:'relative', zIndex:1 }}>

      {/* ══ HERO ══ */}
      <div style={{ marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div>
            <div className="page-title">Bonjour 👋</div>
            <div className="page-sub">TOMATOPILOT · DOMAINE SOUSS AGRI · CAMPAGNE 2025-2026</div>
          </div>
          <div style={{
            padding:'10px 18px', background:'var(--bg-card)', border:'1px solid var(--border)',
            borderRadius:14, textAlign:'right',
            backdropFilter:'blur(16px)', boxShadow:'var(--shadow-card)',
          }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:22, fontWeight:500, color:'var(--neon)', letterSpacing:2, lineHeight:1 }}>
              {time.toLocaleTimeString('fr-FR')}
            </div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--tx-3)', letterSpacing:1.5, marginTop:3 }}>
              {time.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'}).toUpperCase()}
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div style={{
          display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
          marginTop:14, padding:'10px 16px',
          background:'var(--bg-card)', border:'1px solid var(--border)',
          borderRadius:12, backdropFilter:'blur(16px)', boxShadow:'var(--shadow-card)',
        }}>
          {[
            { dot:'var(--neon)',   text:'Base connectée' },
            { dot:'var(--neon)',   text:'Supabase active' },
            { dot:'var(--neon)',   text:'Auth OK' },
            { dot:'var(--amber)',  text:`${stats.alertes} alerte(s)` },
          ].map((s,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:6, fontFamily:'var(--font-mono)', fontSize:10, color:'var(--tx-2)' }}>
              {i>0 && <span style={{ color:'var(--border-hi)', marginRight:4 }}>·</span>}
              <span style={{ width:6, height:6, borderRadius:'50%', background:s.dot, boxShadow:`0 0 6px ${s.dot}`, display:'inline-block', flexShrink:0 }} />
              {s.text}
            </div>
          ))}
        </div>
      </div>

      {/* ══ KPIs ══ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12, marginBottom:20 }}>
        {KPIS.map((k,i) => (
          <Link key={i} href={k.href} style={{ textDecoration:'none' }}>
            <div className="kpi" style={{ '--accent':k.color } as any}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:44, fontWeight:800, color:k.color, lineHeight:1, marginBottom:4, letterSpacing:'-1px' }}>
                {loading ? '—' : k.val}
              </div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--tx-3)', letterSpacing:.8 }}>{k.unit}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* ══ ALERTES ══ */}
      {stats.alertes > 0 && (
        <Link href="/alertes" style={{ textDecoration:'none', display:'block', marginBottom:16 }}>
          <div style={{
            padding:'12px 18px', borderRadius:12,
            background:'var(--red-dim)', border:'1px solid color-mix(in srgb,var(--red) 25%,transparent)',
            display:'flex', alignItems:'center', gap:12,
            backdropFilter:'blur(12px)',
          }}>
            <span style={{ fontSize:18, flexShrink:0 }}>⚠</span>
            <div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:13, fontWeight:700, color:'var(--red)' }}>
                {stats.alertes} alerte(s) active(s) — cliquer pour consulter →
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* ══ GRILLE ══ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        {/* Actions */}
        <div className="card">
          <div className="section-label">ACTIONS RAPIDES</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {ACTIONS.map((a,i) => (
              <Link key={i} href={a.href} style={{ textDecoration:'none' }}>
                <div style={{
                  padding:'12px 14px', borderRadius:12, cursor:'pointer',
                  background:a.bg, border:'1px solid color-mix(in srgb,'+a.color+' 20%,transparent)',
                  display:'flex', alignItems:'center', gap:9, transition:'all .18s',
                }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-1px)';(e.currentTarget as HTMLElement).style.boxShadow=`0 4px 14px ${a.bg}`}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='none';(e.currentTarget as HTMLElement).style.boxShadow='none'}}>
                  <span style={{ fontSize:16, flexShrink:0 }}>{a.icon}</span>
                  <span style={{ fontFamily:'var(--font-body)', fontSize:12, color:'var(--tx-1)', fontWeight:500, lineHeight:1.3 }}>{a.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Système */}
        <div className="card">
          <div className="section-label">ÉTAT SYSTÈME</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[
              { label:'Base de données',      status:'Connectée',  ok:true },
              { label:'Authentification',      status:'Active',     ok:true },
              { label:'Campagne en cours',     status:'2025-2026',  ok:true },
              { label:'Sync',                  status:'À l\'instant',ok:true },
            ].map((s,i) => (
              <div key={i} style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'9px 12px', borderRadius:10,
                background:'color-mix(in srgb,var(--neon) 4%,transparent)',
                border:'1px solid var(--border)',
              }}>
                <span style={{ fontSize:12.5, color:'var(--tx-2)', fontWeight:500 }}>{s.label}</span>
                <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--neon)', boxShadow:'0 0 5px var(--neon)', display:'inline-block' }} />
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--neon)', letterSpacing:.5 }}>{s.status}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
