'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectedFrom = searchParams.get('redirectedFrom') || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    try {
      const supabase = getSupabaseBrowserClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        throw signInError
      }

      router.push(redirectedFrom)
      router.refresh()
    } catch (submitError) {
      const messageText = submitError instanceof Error ? submitError.message : 'Une erreur est survenue.'
      setError(messageText)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f4f9f4', padding: 24 }}>
      <div
        className="w-full max-w-md"
        style={{
          background: '#ffffff',
          border: '1px solid #cce5d4',
          borderRadius: 18,
          boxShadow: '0 24px 64px rgba(27,58,45,0.14)',
          padding: 28,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 62,
              height: 62,
              margin: '0 auto 14px',
              borderRadius: 16,
              background: 'linear-gradient(135deg,#2d6a4f,#40916c)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 28,
            }}
          >
            T
          </div>
          <h1 style={{ fontFamily: 'Syne,sans-serif', fontSize: 28, fontWeight: 800, color: '#1b3a2d', marginBottom: 6 }}>
            TomatoPilot
          </h1>
          <p style={{ fontSize: 13, color: '#5a7a66' }}>Connectez-vous avec les acces fournis par votre administrateur.</p>
        </div>

        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            type="email"
            className="form-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="vous@entreprise.com"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Mot de passe</label>
          <input
            type="password"
            className="form-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Minimum 6 caracteres"
          />
        </div>

        {error && (
          <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: '#fce4e5', border: '1px solid #fcc', color: '#9b1d1d', fontSize: 12.5 }}>
            {error}
          </div>
        )}

        <button
          className="btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }}
          onClick={handleSubmit}
          disabled={loading || !email || !password}
        >
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>

        <p style={{ marginTop: 14, fontSize: 12.5, color: '#5a7a66', lineHeight: 1.5 }}>
          Si vous n&apos;avez pas encore d&apos;acces, contactez votre administrateur. Les comptes sont crees et les modules sont attribues par l&apos;administration.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  )
}
