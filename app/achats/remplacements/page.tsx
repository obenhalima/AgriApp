'use client'
import {PurchaseSubstitutions} from '@/components/purchases/PurchaseSubstitutions'
import {useAuth} from '@/lib/auth'
export default function PurchaseReplacementPage(){
 const {activeDomain}=useAuth()
 return <section><h1 className="font-display text-2xl font-bold">Remplacements fournisseurs — phyto</h1><p className="mt-2 text-sm text-fg-tertiary">Demandes à examiner par le responsable phytosanitaire de la ferme concernée.</p><PurchaseSubstitutions key={activeDomain?.domain_id||'none'}/></section>
}
