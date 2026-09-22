'use client'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { MobileSetup } from '@/components/mobile/MobileSetup'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/lib/auth'

export default function MobileSettingsPage(){
 const {user,isAdmin,isPlatformAdmin}=useAuth()
 if(!user)return <p>Connectez-vous pour configurer votre appareil.</p>
 return <div className="mx-auto max-w-3xl space-y-5">
  <Link href="/validations" className="text-sm text-brand">← Mes validations</Link>
  <PageHeader title="Application et notifications" subtitle="Paramétrage personnel" icon={Bell} description="Installez FarmPilot et configurez les notifications de cet appareil."/>
  <MobileSetup expanded/>
  {(isAdmin||isPlatformAdmin)&&<section className="card space-y-2 p-5"><h2 className="font-semibold">Règles de notification de la société</h2><p className="text-sm text-fg-secondary">Configuration administrateur des envois et des rappels, distincte de l’activation de ce téléphone.</p><Link href="/validations/parametres" className="btn btn-secondary">Paramétrer les notifications et rappels</Link></section>}
 </div>
}
