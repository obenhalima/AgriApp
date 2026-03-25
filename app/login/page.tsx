'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'choose'|'login'>('choose')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loginDemo = async () => {
    setLoading(true)
    // Mode démo : connexion avec compte admin par défaut
    const { error } = await supabase.auth.signInWithPassword({
      email: 'admin@tomatopilot.ma',
      password: 'demo2026'
    })
    if (error) {
      // Si pas encore créé, on crée le compte démo
      await supabase.auth.signUp({ email: 'admin@tomatopilot.ma', password: 'demo2026' })
      await supabase.auth.signInWithPassword({ email: 'admin@tomatopilot.ma', password: 'demo2026' })
    }
    localStorage.setItem('tp_mode', 'demo')
    router.replace('/')
  }

  const loginReel = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Email ou mot de passe incorrect'); setLoading(false); return }
    localStorage.setItem('tp_mode', 'reel')
    router.replace('/')
  }

  const S = {
    page: { minHeight:'100vh', background:'#f4f9f4', display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'Inter,sans-serif' } as React.CSSProperties,
    card: { background:'#fff', border:'1px solid #cce5d4', borderRadius:18, padding:'36px 40px', width:'100%', maxWidth:460, boxShadow:'0 8px 32px rgba(27,58,45,0.1)' } as React.CSSProperties,
    logo: { width:64, height:64, background:'#40916c', borderRadius:'50% 16px 50% 16px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 20px', boxShadow:'0 8px 24px rgba(45,106,79,0.3)' } as React.CSSProperties,
    h1: { fontFamily:'Syne,sans-serif', fontSize:26, fontWeight:800, color:'#1b3a2d', textAlign:'center', marginBottom:6 } as React.CSSProperties,
    sub: { fontSize:13, color:'#5a7a66', textAlign:'center', marginBottom:32 } as React.CSSProperties,
    btn: (color:string) => ({ width:'100%', padding:'13px 0', borderRadius:10, border:'none', fontSize:14, fontWeight:700, cursor:'pointer', background:color, color:'#fff', transition:'all .15s', marginBottom:12 }) as React.CSSProperties,
    btnOut: { width:'100%', padding:'13px 0', borderRadius:10, border:'1px solid #cce5d4', fontSize:13, fontWeight:600, cursor:'pointer', background:'#f4f9f4', color:'#1b3a2d', marginTop:4 } as React.CSSProperties,
    label: { display:'block', fontSize:11, fontWeight:600, color:'#5a7a66', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 } as React.CSSProperties,
    input: { width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid #cce5d4', background:'#f9fdf9', fontSize:13.5, color:'#1b3a2d', outline:'none', marginBottom:14, fontFamily:'Inter,sans-serif', boxSizing:'border-box' } as React.CSSProperties,
    err: { background:'#fff1f1', border:'1px solid #fcc', color:'#9b1d1d', borderRadius:8, padding:'10px 14px', fontSize:12.5, marginBottom:14 } as React.CSSProperties,
    divider: { display:'flex', alignItems:'center', gap:10, margin:'20px 0' } as React.CSSProperties,
    line: { flex:1, height:1, background:'#e8f5ec' } as React.CSSProperties,
    divTxt: { fontSize:11, color:'#5a7a66', fontWeight:500 } as React.CSSProperties,
  }

  if (mode === 'login') return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>🌿</div>
        <h1 style={S.h1}>Connexion</h1>
        <p style={S.sub}>TomatoPilot — Souss Agri</p>
        <form onSubmit={loginReel}>
          {error && <div style={S.err}>{error}</div>}
          <label style={S.label}>Email</label>
          <input style={S.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="votre@email.ma" required autoFocus />
          <label style={S.label}>Mot de passe</label>
          <input style={S.input} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
          <button type="submit" style={S.btn('#2d6a4f')} disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
        <button style={S.btnOut} onClick={()=>setMode('choose')}>← Retour au choix</button>
      </div>
    </div>
  )

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>🌿</div>
        <h1 style={S.h1}>TomatoPilot</h1>
        <p style={S.sub}>Gestion de ferme de tomates sous serre</p>

        {/* Carte Mode Réel */}
        <div style={{ border:'2px solid #2d6a4f', borderRadius:12, padding:'18px 20px', marginBottom:14, cursor:'pointer', transition:'all .15s' }}
          onClick={()=>setMode('login')}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:42, height:42, background:'#2d6a4f', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🏭</div>
            <div>
              <div style={{ fontFamily:'Syne,sans-serif', fontSize:15, fontWeight:800, color:'#1b3a2d', marginBottom:2 }}>Mode Production Réel</div>
              <div style={{ fontSize:12, color:'#5a7a66' }}>Connexion sécurisée — vos vraies données</div>
            </div>
            <div style={{ marginLeft:'auto', fontSize:18, color:'#2d6a4f' }}>→</div>
          </div>
        </div>

        <div style={S.divider}>
          <div style={S.line}/><span style={S.divTxt}>ou</span><div style={S.line}/>
        </div>

        {/* Carte Mode Démo */}
        <div style={{ border:'1px solid #cce5d4', borderRadius:12, padding:'18px 20px', cursor:'pointer', transition:'all .15s', marginBottom:20 }}
          onClick={loginDemo}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:42, height:42, background:'#e9c46a', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🌱</div>
            <div>
              <div style={{ fontFamily:'Syne,sans-serif', fontSize:15, fontWeight:800, color:'#1b3a2d', marginBottom:2 }}>Mode Démo</div>
              <div style={{ fontSize:12, color:'#5a7a66' }}>Exploration sans données réelles</div>
            </div>
            <div style={{ marginLeft:'auto', fontSize:18, color:'#5a7a66' }}>{loading ? '...' : '→'}</div>
          </div>
        </div>

        <div style={{ fontSize:11, color:'#9dc4b0', textAlign:'center' }}>
          TomatoPilot v1.0 — Domaine Souss Agri
        </div>
      </div>
    </div>
  )
}
