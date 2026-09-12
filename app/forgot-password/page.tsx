'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (resetError) {
      setError(resetError.message)
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-surface-sunk flex items-center justify-center p-lg">
      <Card variant="elevated" className="p-2xl w-full max-w-[420px]">
        <div className="w-14 h-14 rounded-2xl bg-brand/15 border border-brand/30 flex items-center justify-center mx-auto">
          <KeyRound className="text-brand" />
        </div>
        <h1 className="font-display text-heading font-bold text-center mt-md">Réinitialiser le mot de passe</h1>
        {sent ? (
          <div className="mt-lg space-y-md">
            <div className="rounded-md border border-success/30 bg-success/10 p-md text-body-sm text-success">
              Si cette adresse correspond à un compte, un lien de réinitialisation a été envoyé.
            </div>
            <Button asChild className="w-full" variant="secondary">
              <Link href="/login"><ArrowLeft size={14} /> Retour à la connexion</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-md mt-lg">
            <Field label="Adresse email">
              <Input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoFocus />
            </Field>
            {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-md text-body-sm text-danger">{error}</div>}
            <Button type="submit" loading={loading} disabled={!email} className="w-full">ENVOYER LE LIEN</Button>
            <Link href="/login" className="flex justify-center items-center gap-1 text-caption text-fg-tertiary hover:text-fg-primary">
              <ArrowLeft size={12} /> Retour à la connexion
            </Link>
          </form>
        )}
      </Card>
    </div>
  )
}
