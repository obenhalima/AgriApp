'use client'
import {useLanguage} from '@/lib/i18n'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { MobileSetup } from '@/components/mobile/MobileSetup'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/lib/auth'

export default function MobileSettingsPage(){
 const {t:_ui,text:_uiNode}=useLanguage()

 const {user,isAdmin,isPlatformAdmin}=useAuth()
 if(!user)return <p>{_ui("Connectez-vous pour configurer votre appareil.")}</p>
 return <div className="mx-auto max-w-3xl space-y-5">
  <Link href="/validations" className="text-sm text-brand">{_ui("← Mes validations")}</Link>
  <PageHeader title={_ui("Application et notifications")} subtitle={_ui("Paramétrage personnel")} icon={Bell} description={_ui("Installez ItriX Farm et configurez les notifications de cet appareil.")}/>
  <MobileSetup expanded/>
  {(isAdmin||isPlatformAdmin)&&<section className="card space-y-2 p-5"><h2 className="font-semibold">{_ui("Règles de notification de la société")}</h2><p className="text-sm text-fg-secondary">{_ui("Configuration administrateur des envois et des rappels, distincte de l’activation de ce téléphone.")}</p><Link href="/validations/parametres" className="btn btn-secondary">{_ui("Paramétrer les notifications et rappels")}</Link></section>}
 </div>
}
