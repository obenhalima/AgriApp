'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Sprout, AlertCircle, LogIn } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input as TInput, Field } from '@/components/ui/Input'

export default function LoginPage() {
  const router = useRouter()
  const { user, signIn, loading: authLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
    <div className="min-h-screen bg-surface-sunk flex items-center justify-center p-lg relative overflow-hidden">
      {/* Halos décoratifs */}
      <div aria-hidden className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, var(--neon), transparent 70%)' }} />
      <div aria-hidden className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-15 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #3b82f6, transparent 70%)' }} />

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
        className="w-full max-w-[420px] relative z-10"
      >
        <Card variant="elevated" className="p-2xl">
          {/* Logo */}
          <div className="text-center mb-xl">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
              className="relative inline-block"
            >
              <div className="absolute inset-0 rounded-2xl blur-xl opacity-50"
                style={{ background: 'radial-gradient(circle, var(--neon), transparent 70%)' }} />
              <div className="relative w-16 h-16 rounded-2xl bg-brand/15 border border-brand/30 flex items-center justify-center mx-auto">
                <Sprout size={32} className="text-brand" strokeWidth={2.5} />
              </div>
            </motion.div>
            <div className="font-display text-display-sm font-extrabold text-fg-primary mt-md tracking-tight">
              Domaine BENHALIMA
            </div>
            <div className="font-mono text-caption uppercase tracking-[2px] text-fg-tertiary mt-1">
              MES Production
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-md">
            <Field label="Email">
              <TInput type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@domaine-benhalima.ma" required autoFocus />
            </Field>
            <Field label="Mot de passe">
              <TInput type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required />
            </Field>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-md border border-danger/30 bg-danger/10 p-md text-danger text-body-sm flex items-center gap-2"
              >
                <AlertCircle size={14} /> {error}
              </motion.div>
            )}

            <Button type="submit" loading={loading} disabled={!email || !password} variant="primary" size="lg" className="w-full">
              <LogIn size={14} strokeWidth={2.5} /> Se connecter
            </Button>
          </form>

          <div className="mt-lg rounded-md bg-surface-sunk border border-border p-md text-caption text-fg-tertiary leading-relaxed">
            Pas encore de compte ? Contacte ton administrateur pour recevoir une invitation.
          </div>
        </Card>
      </motion.div>
    </div>
  )
}
