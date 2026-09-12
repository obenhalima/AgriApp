'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'

export default function ForcedPasswordChangePage() {
  const router = useRouter()
  const { user, profile, refresh } = useAuth()
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')

  const submit=async(event:FormEvent)=>{
    event.preventDefault()
    if(password.length<8){setError('Le mot de passe doit contenir au moins 8 caractères.');return}
    if(password!==confirm){setError('Les deux mots de passe ne correspondent pas.');return}
    setLoading(true);setError('')
    const authResult=await supabase.auth.updateUser({password})
    if(authResult.error){setError(authResult.error.message);setLoading(false);return}
    const profileResult=await supabase.from('profiles').update({must_change_password:false,password_changed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',user?.id)
    if(profileResult.error){setError(`Mot de passe modifié, mais la validation du profil a échoué : ${profileResult.error.message}`);setLoading(false);return}
    await refresh()
    router.replace('/')
  }

  return <div className="min-h-screen bg-surface-sunk flex items-center justify-center p-lg"><Card variant="elevated" className="p-2xl w-full max-w-[440px]"><div className="w-14 h-14 rounded-2xl bg-warning/15 border border-warning/30 flex items-center justify-center mx-auto"><KeyRound className="text-warning"/></div><h1 className="font-display text-heading font-bold text-center mt-md">Changement obligatoire</h1><p className="text-body-sm text-fg-tertiary text-center mt-sm">Le mot de passe transmis par votre administrateur est temporaire. Choisissez votre mot de passe personnel pour continuer.</p>{!user||!profile?<div className="mt-lg text-center text-body-sm">Initialisation…</div>:<form onSubmit={submit} className="space-y-md mt-lg"><Field label="Nouveau mot de passe"><Input type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required autoFocus/></Field><Field label="Confirmer le mot de passe"><Input type="password" minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)} required/></Field>{error&&<div className="rounded-md border border-danger/30 bg-danger/10 p-md text-body-sm text-danger">{error}</div>}<Button type="submit" loading={loading} disabled={!password||!confirm} className="w-full">ENREGISTRER ET CONTINUER</Button></form>}</Card></div>
}
