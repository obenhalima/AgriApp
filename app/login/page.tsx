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
    const { error } = await supabase.auth.signInWithPassword({ email:'admin@tomatopilot.ma', password:'demo2026' })
    if (error) {
      await supabase.auth.signUp({ email:'admin@tomatopilot.ma', password:'demo2026' })
      await supabase.auth.signInWithPassword({ email:'admin@tomatopilot.ma', password:'demo2026' })
    }
    localStorage.setItem('tp_mode','demo')
    router.replace('/')
  }

  const loginReel = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Identifiants incorrects'); setLoading(false); return }
    localStorage.setItem('tp_mode','reel')
    router.replace('/')
  }

  return (
    <div style={{
      minHeight:'100vh',
      background:'#030a07',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:24,
      position:'relative',
      overflow:'hidden',
      fontFamily:'Outfit,sans-serif',
    }}>
      {/* Grid background */}
      <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(#1a352620 1px,transparent 1px),linear-gradient(90deg,#1a352620 1px,transparent 1px)', backgroundSize:'40px 40px', pointerEvents:'none' }} />

      {/* Glow center */}
      <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:500, height:500, background:'radial-gradient(circle, #00e87a08 0%, transparent 70%)', pointerEvents:'none' }} />

      <div style={{ width:'100%', maxWidth:440, position:'relative', zIndex:1 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{
            width:64, height:64, margin:'0 auto 16px',
            background:'linear-gradient(135deg,#00e87a,#006633)',
            borderRadius:14,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:28,
            boxShadow:'0 0 40px #00e87a30',
          }}>🍅</div>
          <div style={{ fontFamily:'Rajdhani,sans-serif', fontSize:28, fontWeight:700, color:'#e8f5ee', letterSpacing:3, textTransform:'uppercase' }}>TomatoPilot</div>
          <div style={{ fontFamily:'DM Mono,monospace', fontSize:10, color:'#3d6b52', letterSpacing:3, marginTop:4 }}>AGRITECH MANAGEMENT SYSTEM</div>
        </div>

        {/* Card */}
        <div style={{ background:'#0a1810', border:'1px solid #1f4030', borderRadius:14, overflow:'hidden', boxShadow:'0 0 60px #00e87a08, 0 24px 48px #00000080', position:'relative' }}>
          {/* Top line */}
          <div style={{ height:2, background:'linear-gradient(90deg,transparent,#00e87a,transparent)' }} />

          <div style={{ padding:'32px 36px 36px' }}>
            {mode === 'login' ? (
              <>
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontFamily:'Rajdhani,sans-serif', fontSize:18, fontWeight:700, color:'#e8f5ee', textTransform:'uppercase', letterSpacing:1, marginBottom:3 }}>Connexion Admin</div>
                  <div style={{ fontFamily:'DM Mono,monospace', fontSize:10, color:'#3d6b52', letterSpacing:1 }}>Acces securise — Production</div>
                </div>
                <form onSubmit={loginReel}>
                  {error && (
                    <div style={{ padding:'10px 13px', background:'#ff4d6d18', border:'1px solid #ff4d6d30', borderRadius:7, color:'#ff4d6d', fontFamily:'DM Mono,monospace', fontSize:11, marginBottom:16 }}>
                      ⚠ {error}
                    </div>
                  )}
                  <div style={{ marginBottom:14 }}>
                    <label className="form-label">Adresse Email</label>
                    <input className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@ferme.ma" required autoFocus />
                  </div>
                  <div style={{ marginBottom:22 }}>
                    <label className="form-label">Mot de passe</label>
                    <input className="form-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
                  </div>
                  <button type="submit" className="btn-primary" style={{ width:'100%', justifyContent:'center', fontSize:13, letterSpacing:2 }} disabled={loading}>
                    {loading ? '...' : '⮞ CONNEXION'}
                  </button>
                </form>
                <button onClick={()=>setMode('choose')} style={{ width:'100%', marginTop:12, padding:'9px', background:'transparent', border:'1px solid #1a3526', borderRadius:7, color:'#3d6b52', fontFamily:'DM Mono,monospace', fontSize:10, cursor:'pointer', letterSpacing:1.5, transition:'all .15s' }}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.borderColor='#2a5a40'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.borderColor='#1a3526'}>
                  ← RETOUR
                </button>
              </>
            ) : (
              <>
                <div style={{ marginBottom:28 }}>
                  <div style={{ fontFamily:'Rajdhani,sans-serif', fontSize:18, fontWeight:700, color:'#e8f5ee', textTransform:'uppercase', letterSpacing:1, marginBottom:3 }}>Acces Systeme</div>
                  <div style={{ fontFamily:'DM Mono,monospace', fontSize:10, color:'#3d6b52', letterSpacing:1 }}>Selectionner un mode d'acces</div>
                </div>

                {/* Mode Production */}
                <div onClick={()=>setMode('login')}
                  style={{ border:'1px solid #1f4030', borderRadius:10, padding:'18px 20px', marginBottom:12, cursor:'pointer', background:'#0d1f14', transition:'all .2s', display:'flex', alignItems:'center', gap:14 }}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='#00e87a';(e.currentTarget as HTMLElement).style.boxShadow='0 0 20px #00e87a10'}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='#1f4030';(e.currentTarget as HTMLElement).style.boxShadow='none'}}>
                  <div style={{ width:44, height:44, background:'linear-gradient(135deg,#00e87a20,#006633)', border:'1px solid #00e87a30', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🏭</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'Rajdhani,sans-serif', fontSize:15, fontWeight:700, color:'#e8f5ee', textTransform:'uppercase', letterSpacing:.5, marginBottom:2 }}>Mode Production</div>
                    <div style={{ fontFamily:'DM Mono,monospace', fontSize:10, color:'#3d6b52' }}>Connexion securisee · Donnees reelles</div>
                  </div>
                  <span style={{ fontFamily:'DM Mono,monospace', fontSize:14, color:'#00e87a' }}>→</span>
                </div>

                {/* Mode Demo */}
                <div onClick={loginDemo}
                  style={{ border:'1px solid #1a3526', borderRadius:10, padding:'18px 20px', cursor:'pointer', background:'#0a1810', transition:'all .2s', display:'flex', alignItems:'center', gap:14 }}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='#f5a623';(e.currentTarget as HTMLElement).style.boxShadow='0 0 20px #f5a62310'}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='#1a3526';(e.currentTarget as HTMLElement).style.boxShadow='none'}}>
                  <div style={{ width:44, height:44, background:'#f5a62318', border:'1px solid #f5a62330', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🌱</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'Rajdhani,sans-serif', fontSize:15, fontWeight:700, color:'#e8f5ee', textTransform:'uppercase', letterSpacing:.5, marginBottom:2 }}>Mode Demo</div>
                    <div style={{ fontFamily:'DM Mono,monospace', fontSize:10, color:'#3d6b52' }}>Exploration · Aucune donnee reelle</div>
                  </div>
                  <span style={{ fontFamily:'DM Mono,monospace', fontSize:14, color:'#f5a623' }}>{loading ? '...' : '→'}</span>
                </div>

                <div style={{ marginTop:20, fontFamily:'DM Mono,monospace', fontSize:9, color:'#1f4030', textAlign:'center', letterSpacing:1 }}>
                  TOMATOPILOT · AGRITECH v1.0 · SOUSS AGRI
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
