'use client'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { ProductionCostReport } from '@/components/costs/ProductionCostReport'
import { useAnalyticalEntry } from '@/lib/useAnalyticalEntry'
export default function CostPilotagePage() {
 const { activeDomain } = useAuth()
 const entry=useAnalyticalEntry(activeDomain?.domain_id)
 if(!activeDomain)return <p>Sélectionnez un client.</p>
 if(!entry)return <p>Chargement du périmètre…</p>
 return <div className="space-y-4"><Link href="/couts" className="underline">Retour aux saisies de coûts</Link><ProductionCostReport key={activeDomain.domain_id+JSON.stringify(entry)} initialScope={entry} /></div>
}
