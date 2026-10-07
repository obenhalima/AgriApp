'use client'
import {useLanguage} from '@/lib/i18n'

import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { ProductionCostReport } from '@/components/costs/ProductionCostReport'
import { useAnalyticalEntry } from '@/lib/useAnalyticalEntry'
export default function CostPilotagePage() {
 const {t:_ui,text:_uiNode}=useLanguage()

 const { activeDomain } = useAuth()
 const entry=useAnalyticalEntry(activeDomain?.domain_id)
 if(!activeDomain)return <p>{_ui("Sélectionnez un client.")}</p>
 if(!entry)return <p>{_ui("Chargement du périmètre…")}</p>
 return <div className="space-y-4"><Link href="/couts" className="underline">{_ui("Retour aux saisies de coûts")}</Link><ProductionCostReport key={activeDomain.domain_id+JSON.stringify(entry)} initialScope={entry} /></div>
}
