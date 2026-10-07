'use client'
import {useLanguage} from '@/lib/i18n'

import '@/components/ui/workspace.css'
import {PageHeader} from '@/components/ui/PageHeader'
import {ArrowLeftRight} from 'lucide-react'
import Link from 'next/link'
import {PurchaseSubstitutions} from '@/components/purchases/PurchaseSubstitutions'
import {useAuth} from '@/lib/auth'
export default function PurchaseReplacementPage(){
 const {t:_ui,text:_uiNode}=useLanguage()

 const {activeDomain}=useAuth()
 return <section className="itrix-workspace"><Link href="/achats" className="inline-flex mb-3 text-sm text-fg-secondary">{_ui("← Retour aux bons d’achat")}</Link><PageHeader title={_ui("Remplacements fournisseurs — phyto")} subtitle={_ui("Approvisionnement · Validations")} icon={ArrowLeftRight} description={_ui("Demandes à examiner par le responsable phytosanitaire de la ferme concernée.")}/><PurchaseSubstitutions key={activeDomain?.domain_id||'none'}/></section>
}
