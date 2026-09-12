'use client'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { ProductionCostReport } from '@/components/costs/ProductionCostReport'
export default function CostPilotagePage() {
 const { activeDomain } = useAuth()
 return <div className="space-y-4"><Link href="/couts" className="underline">Retour aux saisies de coûts</Link><ProductionCostReport key={activeDomain?.domain_id ?? 'none'} /></div>
}
