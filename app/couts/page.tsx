'use client'
import {useLanguage} from '@/lib/i18n'

import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import '@/components/ui/workspace.css'
export default function CoutsPage() {
 const {t:_ui,text:_uiNode}=useLanguage()

  return <div className="space-y-5"><PageHeader title={_ui("Coûts et prévisions")} subtitle="ItriX Farm · Finance" description={_ui("Choisissez le parcours de saisie. Les charges réelles et le budget disposent chacun de leur écran et de leur modèle Excel.")}/><div className="grid gap-4 md:grid-cols-2"><Link className="card p-6 block" href="/couts/reel"><h2 className="text-xl font-semibold">{_ui("Coûts réels")}</h2><p className="mt-2">{_ui("Saisir ou importer les charges effectivement réalisées.")}</p></Link><Link className="card p-6 block" href="/couts/budget"><h2 className="text-xl font-semibold">{_ui("Budget prévisionnel")}</h2><p className="mt-2">{_ui("Préparer et importer les charges prévues de la campagne.")}</p></Link></div></div>
}
