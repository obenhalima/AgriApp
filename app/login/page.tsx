'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const { user, signIn, loading: authLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Si déjà connecté, rediriger
  useEffect(() => {
    if (!authLoading && user) router.replace('/')
  }, [user, authLoading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true); setError('')
    try {
      await signIn(email, password)
      router.replace('/')
    } catch (err: any) {
      setError(err?.message?.includes('Invalid') ? 'Email ou mot de passe incorrect' : (err?.message ?? 'Erreur de connexion'))
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-deep)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      fontFamily: 'var(--font-body)',
    }}>
      <div style={{
        width: 420,
        padding: '32px 36px',
        background: 'var(--bg-card)',
        border: '1px solid var(--bd-1)',
        borderRadius: 16,
        boxShadow: '0 24px 60px rgba(0,0,0,.35)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 44, marginBottom: 6 }}>🍅</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--tx-1)', letterSpacing: -.2 }}>
            Domaine BENHALIMA
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--tx-3)', letterSpacing: 1.5, marginTop: 3, textTransform: 'uppercase' }}>
            MES Production
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 5 }}>
              EMAIL
            </label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="admin@domaine-benhalima.ma" required autoFocus
              style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 5 }}>
              MOT DE PASSE
            </label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required
              style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-deep)', color: 'var(--tx-1)', border: '1px solid var(--bd-1)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
          </div>

          {error && (
            <div style={{ padding: 10, marginBottom: 14, background: 'var(--red-dim)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 8, color: 'var(--red)', fontSize: 12 }}>
              ⚠ {error}
            </div>
          )}

          <button type="submit" disabled={loading || !email || !password}
            style={{
              width: '100%', padding: '12px',
              background: loading || !email || !password ? 'var(--bg-deep)' : 'linear-gradient(135deg, var(--neon), color-mix(in srgb, var(--neon) 70%, var(--blue)))',
              color: loading || !email || !password ? 'var(--tx-3)' : '#042416',
              border: '1px solid color-mix(in srgb, var(--neon) 40%, transparent)',
              borderRadius: 8,
              cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              letterSpacing: 1.5,
            }}>
            {loading ? 'CONNEXION...' : 'SE CONNECTER'}
          </button>
        </form>

        <div style={{ marginTop: 20, padding: 10, background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 8, fontSize: 11, color: 'var(--tx-3)', lineHeight: 1.5 }}>
          Pas encore de compte ? Contacte ton administrateur pour recevoir une invitation.
        </div>
      </div>
    </div>
  )
}
