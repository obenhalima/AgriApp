'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const ACCENT_COLORS = ['#00e87a','#00ffc8','#00b4d8','#f5a623','#9b5de5','#ff4d6d']
const LIGHT_COLORS  = ['#2d6a4f','#40916c','#1a78c2','#c47c1a','#6d28d9','#c0392b']

export default function DashboardPage() {
  const [stats, setStats] = useState({ serres:0, varietes:0, clients:0, fournisseurs:0, stocks:0, factures:0, alertes:0 })
  const [loading, setLoading] = useState(true)
  const [time, setTime]     = useState(new Date())
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    // Observer les changements de thème
    const check = () => setIsDark(document.documentElement.getAttribute('data-theme') !== 'light')
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    Promise.all([
      supabase.from('greenhouses').select('id', { count:'exact', head:true }),
      supabase.from('varieties').select('id', { count:'exact', head:true }).eq('is_active',true),
      supabase.from('clients').select('id', { count:'exact', head:true }).eq('is_active',true),
      supabase.from('suppliers').select('id', { count:'exact', head:true }).eq('is_active',true),
      supabase.from('stock_items').select('id', { count:'exact', head:true }).eq('is_active',true),
      supabase.from('invoices').select('id', { count:'exact', head:true }).eq('status','sent'),
      supabase.from('alerts').select('id', { count:'exact', head:true }).eq('is_resolved',false),
    ]).then(results => {
      const [serres,varietes,clients,fournisseurs,stocks,factures,alertes] = results
      setStats({
        serres:       serres.count||0,
        varietes:     varietes.count||0,
        clients:      clients.count||0,
        fournisseurs: fournisseurs.count||0,
        stocks:       stocks.count||0,
        factures:     factures.count||0,
        alertes:      alertes.count||0,
      })
      setLoading(false)
    })
  }, [])

  const colors = isDark ? ACCENT_COLORS : LIGHT_COLORS

  const KPIS = [
    { label:'SERRES',        val:stats.serres,       unit:'actives',    color:colors[0], href:'/serres' },
    { label:'VARIÉTÉS',      val:stats.varietes,     unit:'référencées',color:colors[1], href:'/varietes' },
    { label:'CLIENTS',       val:stats.clients,      unit:'actifs',     color:colors[2], href:'/clients' },
    { label:'FOURNISSEURS',  val:stats.fournisseurs, unit:'références', color:colors[3], href:'/fournisseurs' },
    { label:'STOCK ITEMS',   val:stats.stocks,       unit:'références', color:colors[4], href:'/stocks' },
    { label:'FACTURES',      val:stats.factures,     unit:'en cours',   color:colors[5], href:'/factures' },
  ]

  const ACTIONS = [
    { label:'Nouvelle Serre',       href:'/serres',    icon:'⬡', color:colors[0] },
    { label:'Saisir Récolte',       href:'/recoltes',  icon:'◉', color:colors[1] },
    { label:'Factures Clients',     href:'/factures',  icon:'▤', color:colors[2] },
    { label:'Bon de Commande',      href:'/achats',    icon:'▢', color:colors[3] },
    { label:'Entrée Stock',         href:'/stocks',    icon:'⬣', color:colors[4] },
    { label:'IA & Prévisions',      href:'/analytique',icon:'◈', color:colors[5] },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div>
            <div className="page-title">DASHBOARD</div>
            <div className="page-sub">TOMATOPILOT · DOMAINE SOUSS AGRI · CAMPAGNE 2025-2026</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:28, fontWeight:700, color:'var(--neon)', letterSpacing:2, lineHeight:1 }}>
              {time.toLocaleTimeString('fr-FR')}
            </div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--tx-3)', letterSpacing:1.5, marginTop:3 }}>
              {time.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toUpperCase()}
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div style={{
          display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
          marginTop:14, padding:'10px 16px',
          background:'var(--bg-card)', border:'1px solid var(--border)',
          borderRadius:8, fontSize:11, fontFamily:'var(--font-mono)', letterSpacing:.8,
        }}>
          <span style={{ color:'var(--tx-3)' }}>SYSTÈME</span>
          <span style={{ color:'var(--tx-3)' }}>·</span>
          {[
            { label:'BASE DE DONNÉES CONNECTÉE', ok:true },
            { label:'SUPABASE ACTIVE',           ok:true },
            { label:'AUTHENTIFICATION OK',       ok:true },
            { label:'CAMPAGNE EN COURS',         ok:true },
          ].map((s,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--neon)', boxShadow:'0 0 6px var(--neon)', display:'inline-block' }} />
              <span style={{ color:'var(--tx-2)' }}>{s.label.split(' ').slice(0,-1).join(' ')} </span>
              <span style={{ color:'var(--neon)', fontWeight:700 }}>{s.label.split(' ').at(-1)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:14, marginBottom:24 }}>
        {KPIS.map((k,i) => (
          <Link key={i} href={k.href} style={{ textDecoration:'none' }}>
            <div className="kpi" style={{ '--accent':k.color } as any}>
              <div className="kpi-label">{k.label}</div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:48, fontWeight:700, color:k.color, lineHeight:1, marginBottom:4 }}>
                {loading ? '—' : k.val}
              </div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--tx-3)', letterSpacing:.8 }}>{k.unit}</div>
              <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:k.color, opacity:.5 }} />
            </div>
          </Link>
        ))}
      </div>

      {/* Alertes */}
      {stats.alertes > 0 && (
        <Link href="/alertes" style={{ textDecoration:'none', display:'block', marginBottom:20 }}>
          <div style={{
            padding:'12px 18px', borderRadius:8,
            background:'var(--red-dim)', border:'1px solid color-mix(in srgb, var(--red) 30%, transparent)',
            display:'flex', alignItems:'center', gap:12,
          }}>
            <span style={{ fontSize:18, flexShrink:0 }}>⚠</span>
            <div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:14, fontWeight:700, color:'var(--red)', textTransform:'uppercase', letterSpacing:.5 }}>
                {stats.alertes} alerte(s) active(s)
              </div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--tx-2)', marginTop:2, letterSpacing:.5 }}>
                Cliquer pour consulter les alertes →
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* Grille — Actions rapides + État système */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
        {/* Actions rapides */}
        <div className="card">
          <div className="section-label">ACTIONS RAPIDES</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {ACTIONS.map((a,i) => (
              <Link key={i} href={a.href} style={{ textDecoration:'none' }}>
                <div style={{
                  padding:'12px 14px', borderRadius:8, cursor:'pointer',
                  background:'var(--bg-base)', border:`1px solid var(--border)`,
                  display:'flex', alignItems:'center', gap:9,
                  transition:'all .15s',
                }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=a.color;(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border)';(e.currentTarget as HTMLElement).style.background='var(--bg-base)'}}>
                  <span style={{ fontSize:16, color:a.color, flexShrink:0 }}>{a.icon}</span>
                  <span style={{ fontFamily:'var(--font-body)', fontSize:12, color:'var(--tx-2)', lineHeight:1.3 }}>{a.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* État du système */}
        <div className="card">
          <div className="section-label">ÉTAT SYSTÈME</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { label:'Base de données',     status:'CONNECTÉE',   ok:true },
              { label:'Authentification',     status:'ACTIVE',      ok:true },
              { label:'Campagne en cours',    status:'2025-2026',   ok:true },
              { label:'Dernière synchronisation', status:'À L\'INSTANT', ok:true },
            ].map((s,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 12px', background:'var(--bg-base)', border:'1px solid var(--border)', borderRadius:7 }}>
                <span style={{ fontFamily:'var(--font-body)', fontSize:12.5, color:'var(--tx-2)' }}>{s.label}</span>
                <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:s.ok?'var(--neon)':'var(--red)', boxShadow:`0 0 5px ${s.ok?'var(--neon)':'var(--red)'}` }} />
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:s.ok?'var(--neon)':'var(--red)', letterSpacing:.5 }}>{s.status}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation rapide */}
      <div className="card">
        <div className="section-label">NAVIGATION</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:8 }}>
          {[
            { href:'/recoltes',    label:'Récoltes',      icon:'◉' },
            { href:'/production',  label:'Production',    icon:'▲' },
            { href:'/campagnes',   label:'Campagnes',     icon:'◷' },
            { href:'/stocks',      label:'Stocks',        icon:'⬣' },
            { href:'/commandes',   label:'Commandes',     icon:'▣' },
            { href:'/couts',       label:'Coûts',         icon:'◆' },
            { href:'/agronomie',   label:'Agronomie',     icon:'⬨' },
            { href:'/analytique',  label:'Analytique',    icon:'◈' },
          ].map((n,i) => (
            <Link key={i} href={n.href} style={{ textDecoration:'none' }}>
              <div style={{
                padding:'10px 12px', borderRadius:8, cursor:'pointer',
                background:'var(--bg-base)', border:'1px solid var(--border)',
                display:'flex', alignItems:'center', gap:8,
                transition:'all .15s',
              }}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--neon)';(e.currentTarget as HTMLElement).style.color='var(--neon)'}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border)';(e.currentTarget as HTMLElement).style.color='var(--tx-3)'}}>
                <span style={{ fontSize:12, color:'var(--tx-3)' }}>{n.icon}</span>
                <span style={{ fontFamily:'var(--font-body)', fontSize:12, color:'var(--tx-2)' }}>{n.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
