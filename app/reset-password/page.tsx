'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [ready, setReady] = useState(false)
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setReady(Boolean(data.session))
      setChecking(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true)
        setChecking(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setLoading(true)
    setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }
    await supabase.auth.signOut()
    router.replace('/login?password_reset=success')
  }

  return (
    <div className="min-h-screen bg-surface-sunk flex items-center justify-center p-lg">
      <Card variant="elevated" className="p-2xl w-full max-w-[420px]">
        <div className="w-14 h-14 rounded-2xl bg-brand/15 border border-brand/30 flex items-center justify-center mx-auto">
          <KeyRound className="text-brand" />
        </div>
        <h1 className="font-display text-heading font-bold text-center mt-md">Nouveau mot de passe</h1>
        {checking ? (
          <div className="mt-lg text-center text-body-sm text-fg-tertiary">Vérification du lien…</div>
        ) : !ready ? (
          <div className="mt-lg space-y-md">
            <div className="rounded-md border border-warning/30 bg-warning/10 p-md text-body-sm text-warning">
              Ce lien est invalide ou a expiré. Demande un nouveau lien de réinitialisation.
            </div>
            <Button asChild className="w-full" variant="secondary"><Link href="/forgot-password">DEMANDER UN NOUVEAU LIEN</Link></Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-md mt-lg">
            <Field label="Nouveau mot de passe">
              <Input type="password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required />
            </Field>
            <Field label="Confirmer le mot de passe">
              <Input type="password" minLength={8} value={confirm} onChange={event => setConfirm(event.target.value)} required />
            </Field>
            {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-md text-body-sm text-danger">{error}</div>}
            <Button type="submit" loading={loading} disabled={!password || !confirm} className="w-full">ENREGISTRER</Button>
          </form>
        )}
      </Card>
    </div>
  )
}
