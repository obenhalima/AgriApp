'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const [stats, setStats] = useState({ serres:0, varietes:0, clients:0, fournisseurs:0, stocks:0, factures:0, alertes:0 })
  const [loading, setLoading] = useState(true)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    Promise.all([
      supabase.from('greenhouses').select('id', { count:'exact', head:true }),
      supabase.from('varieties').select('id', { count:'exact', head:true }).eq('is_active',true),
      supabase.from('clients').select('id', { count:'exact', head:true }).eq('is_active',true),
      supabase.from('suppliers').select('id', { count:'exact', head:true }).eq('is_active',true),
      supabase.from('stock_items').select('id', { count:'exact', head:true }).eq('is_active',true),
      supabase.from('invoices').select('id', { count:'exact', head:true }).neq('status','paye'),
      supabase.from('stock_items').select('id', { count:'exact', head:true }).eq('is_active',true),
    ]).then(([s,v,c,f,st,inv]) => {
      setStats({
        serres: s.count||0, varietes: v.count||0, clients: c.count||0,
        fournisseurs: f.count||0, stocks: st.count||0,
        factures: inv.count||0, alertes: 0,
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const MODULES = [
    { label:'SERRES',       val:stats.serres,       unit:'actives',    color:'#00e87a', icon:'⬡', href:'/serres' },
    { label:'VARIETES',     val:stats.varietes,     unit:'referencees',color:'#00ffc8', icon:'✦', href:'/varietes' },
    { label:'CLIENTS',      val:stats.clients,      unit:'actifs',     color:'#00b4d8', icon:'◈', href:'/clients' },
    { label:'FOURNISSEURS', val:stats.fournisseurs, unit:'references', color:'#9b5de5', icon:'⬡', href:'/fournisseurs' },
    { label:'STOCK ITEMS',  val:stats.stocks,       unit:'references', color:'#f5a623', icon:'⬣', href:'/stocks' },
    { label:'FACTURES',     val:stats.factures,     unit:'en cours',   color:'#ff4d6d', icon:'▤', href:'/factures' },
  ]

  const QUICK = [
    { label:'Nouvelle Serre',       href:'/serres',       icon:'⬡', color:'#00e87a' },
    { label:'Nouvelle Variete',     href:'/varietes',     icon:'✦', color:'#00ffc8' },
    { label:'Nouveau Client',       href:'/clients',      icon:'◈', color:'#00b4d8' },
    { label:'Factures Clients',     href:'/factures',     icon:'▤', color:'#f5a623' },
    { label:'Mouvements Stock',     href:'/stocks',       icon:'⬣', color:'#9b5de5' },
    { label:'Saisir un Cout',       href:'/couts',        icon:'◆', color:'#ff4d6d' },
    { label:'Nouveau Fournisseur',  href:'/fournisseurs', icon:'⬡', color:'#00b4d8' },
    { label:'IA & Previsions',      href:'/analytique',   icon:'◈', color:'#00e87a' },
  ]

  return (
    <div className="fade-in">

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28 }}>
        <div>
          <div style={{ fontFamily:'Rajdhani,sans-serif', fontSize:26, fontWeight:700, color:'#e8f5ee', textTransform:'uppercase', letterSpacing:1.5, marginBottom:4 }}>
            DASHBOARD
          </div>
          <div style={{ fontFamily:'DM Mono,monospace', fontSize:10, color:'#3d6b52', letterSpacing:1.5 }}>
            TOMATOPILOT · DOMAINE SOUSS AGRI · CAMPAGNE 2025-2026
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:'DM Mono,monospace', fontSize:18, color:'#00e87a', letterSpacing:2, textShadow:'0 0 12px #00e87a80' }}>
            {time.toLocaleTimeString('fr',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
          </div>
          <div style={{ fontFamily:'DM Mono,monospace', fontSize:10, color:'#3d6b52', letterSpacing:1, marginTop:2 }}>
            {time.toLocaleDateString('fr',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).toUpperCase()}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', background:'#0a1810', border:'1px solid #1a3526', borderRadius:8, marginBottom:24, flexWrap:'wrap' }}>
        <div style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'#3d6b52', letterSpacing:2, marginRight:4 }}>SYSTEME ·</div>
        {[
          { l:'BASE DE DONNEES', v:'CONNECTEE', ok:true },
          { l:'SUPABASE', v:'ACTIVE', ok:true },
          { l:'AUTHENTIFICATION', v:'OK', ok:true },
          { l:'CAMPAGNE', v:'EN COURS', ok:true },
        ].map((s,i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 9px', background:'#0d1f14', border:'1px solid #1a3526', borderRadius:4 }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background: s.ok ? '#00e87a' : '#ff4d6d', boxShadow: s.ok ? '0 0 6px #00e87a' : '0 0 6px #ff4d6d', display:'inline-block' }} />
            <span style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'#3d6b52', letterSpacing:1 }}>{s.l}</span>
            <span style={{ fontFamily:'DM Mono,monospace', fontSize:9, color: s.ok ? '#00e87a' : '#ff4d6d', letterSpacing:1 }}>{s.v}</span>
          </div>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12, marginBottom:24 }}>
        {MODULES.map((m,i) => (
          <Link key={i} href={m.href} style={{ textDecoration:'none' }}>
            <div className="kpi" style={{ '--accent':m.color } as React.CSSProperties}>
              <div style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'#3d6b52', letterSpacing:1.5, textTransform:'uppercase', marginBottom:10 }}>{m.label}</div>
              <div style={{ fontFamily:'Rajdhani,sans-serif', fontSize:30, fontWeight:700, color: loading ? '#1f4030' : m.color, lineHeight:1, marginBottom:4, textShadow: loading ? 'none' : `0 0 16px ${m.color}60` }}>
                {loading ? '—' : m.val}
              </div>
              <div style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'#3d6b52', letterSpacing:1 }}>{m.unit}</div>
              <div style={{ marginTop:12, height:2, background:'#1a3526', borderRadius:1, overflow:'hidden' }}>
                <div style={{ height:'100%', width: loading ? '0%' : '100%', background:m.color, boxShadow:`0 0 8px ${m.color}`, transition:'width 1s cubic-bezier(.4,0,.2,1)', transitionDelay:`${i*0.1}s` }} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Grille principale */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.2fr', gap:16, marginBottom:16 }}>

        {/* Modules rapides */}
        <div className="card">
          <div className="section-label" style={{ marginBottom:16 }}>ACCES RAPIDE</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {QUICK.map((q,i) => (
              <Link key={i} href={q.href} style={{ textDecoration:'none' }}>
                <div style={{
                  padding:'12px 14px',
                  background:'#0d1f14',
                  border:'1px solid #1a3526',
                  borderRadius:8,
                  display:'flex', alignItems:'center', gap:10,
                  cursor:'pointer',
                  transition:'all .15s',
                }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=q.color;(e.currentTarget as HTMLElement).style.background='#0f2518'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='#1a3526';(e.currentTarget as HTMLElement).style.background='#0d1f14'}}>
                  <span style={{ fontFamily:'DM Mono,monospace', fontSize:14, color:q.color, opacity:.8 }}>{q.icon}</span>
                  <span style={{ fontFamily:'Outfit,sans-serif', fontSize:12, fontWeight:500, color:'#7aab90' }}>{q.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Info systeme */}
        <div className="card">
          <div className="section-label" style={{ marginBottom:16 }}>SYSTEME INFO</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[
              { l:'Version Application', v:'TomatoPilot v1.0', c:'#00e87a' },
              { l:'Base de donnees', v:'Supabase PostgreSQL', c:'#00b4d8' },
              { l:'Serveur', v:'Vercel Edge Network', c:'#9b5de5' },
              { l:'Referentiel', v:'Domaine Souss Agri', c:'#f5a623' },
              { l:'Campagne active', v:'2025 — 2026', c:'#00e87a' },
              { l:'Region', v:'Souss-Massa · Maroc', c:'#00ffc8' },
            ].map((r,i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'#0d1f14', border:'1px solid #1a3526', borderRadius:6 }}>
                <span style={{ fontFamily:'DM Mono,monospace', fontSize:10, color:'#3d6b52', letterSpacing:.5 }}>{r.l}</span>
                <span style={{ fontFamily:'Rajdhani,sans-serif', fontSize:13, fontWeight:600, color:r.c }}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#0a1810', border:'1px solid #1a3526', borderRadius:8 }}>
        <div style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'#1f4030', letterSpacing:2 }}>
          TOMATOPILOT © 2026 · AGRITECH MANAGEMENT SYSTEM
        </div>
        <div style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'#1f4030', letterSpacing:1 }}>
          POWERED BY SUPABASE + VERCEL + NEXT.JS 14
        </div>
      </div>
    </div>
  )
}
