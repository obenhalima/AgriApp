'use client'
import {TranslatedText, useLanguage} from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'

export function CostEntryDetails({entry,domain,farmName,onClose}:{entry:any;domain:string;farmName?:string;onClose:()=>void}) {
  const {t:translateUI,intlLocale}=useLanguage()

  const [source,setSource]=useState<any>(null)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  useEffect(()=>{
    if(!entry.source_stock_movement_id) return
    let cancelled=false
    setLoading(true)
    async function load() {
      const movement=await supabase.from('stock_movements').select('*').eq('domain_id',domain).eq('id',entry.source_stock_movement_id).single()
      if(movement.error) throw movement.error
      const [item,warehouse,review,costs]=await Promise.all([
        supabase.from('stock_items').select('name,unit').eq('domain_id',domain).eq('id',movement.data.stock_item_id).single(),
        supabase.from('warehouses').select('name').eq('domain_id',domain).eq('id',movement.data.warehouse_id).single(),
        supabase.from('inventory_consumption_reviews').select('unit_cost,reason').eq('domain_id',domain).eq('movement_id',movement.data.id).maybeSingle(),
        supabase.from('cost_entries').select('id,amount,greenhouse_id').eq('domain_id',domain).eq('source_stock_movement_id',movement.data.id),
      ])
      const failure=item.error||warehouse.error||review.error||costs.error
      if(failure) throw failure
      if(!cancelled) setSource({movement:movement.data,item:item.data,warehouse:warehouse.data,review:review.data,costs:costs.data})
    }
    load().catch(e=>{if(!cancelled)setError(e.message)}).finally(()=>{if(!cancelled)setLoading(false)})
    return ()=>{cancelled=true}
  },[domain,entry.source_stock_movement_id])
  const money=(value:unknown)=>value==null?translateUI('Non valorisé'):`${Number(value).toLocaleString(intlLocale,{minimumFractionDigits:2,maximumFractionDigits:6})} MAD`
  const fields: [string,unknown][]=[
    ['Date',entry.entry_date],['Campagne',entry.campaigns?.name],['Ferme',farmName],
    ['Serre',entry.greenhouses?.code||translateUI('Charge commune')],['Catégorie',entry.account_categories?.label||entry.cost_category],
    ['Montant de cette ligne',money(entry.amount)],['Description',entry.description],
    ['Origine',translateUI(entry.source_stock_movement_id?'Sortie de stock':entry.source_po_id?'Achat':'Saisie / import')],
    ['Valorisation',translateUI(entry.cost_quality==='verified'?'Confirmée':entry.cost_quality==='provisional'?'Provisoire':'Non renseignée')],
    ['Méthode de répartition',entry.allocation_method==='surface_plantee_confirmee'?translateUI('Au prorata des surfaces plantées'):entry.allocation_method],['Créé le',entry.created_at],['Identifiant du coût',entry.id],
  ]
  return <Modal title={translateUI("Détails du coût")} onClose={onClose} size="lg"><div className="space-y-4">
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{fields.map(([label,value])=><div key={label}><dt className="text-sm text-fg-secondary"><TranslatedText text={label}/></dt><dd className="break-words font-medium">{String(value??'—')}</dd></div>)}</dl>
    {loading&&<p role="status"><TranslatedText text={"Chargement du mouvement source…"}/></p>}
    {error&&<p role="alert"><TranslatedText text={"Détail du mouvement indisponible · "}/>{error}</p>}
    {source&&<section className="space-y-2 rounded-lg border border-border p-4"><h3 className="font-semibold"><TranslatedText text={"Mouvement de stock à l’origine du coût"}/></h3>
      <p>{source.item?.name} · {source.movement.quantity} {source.item?.unit} · {source.warehouse?.name}</p>
      <p><TranslatedText text={"Date · "}/>{source.movement.movement_date}<TranslatedText text={" · Référence · "}/>{source.movement.reference||'—'}</p>
      <p><TranslatedText text={"Coût unitaire · "}/>{money(source.review?.unit_cost??source.movement.unit_cost)}</p>
      <p><TranslatedText text={"Montant total imputé · "}/>{money(source.costs.reduce((sum:number,c:any)=>sum+Number(c.amount),0))} · {source.costs.length}<TranslatedText text={" ligne(s)"}/></p>
      <p><TranslatedText text={"Note · "}/>{source.movement.notes||'—'}</p>
      {source.review&&<p><TranslatedText text={"Justificatif du prix · "}/>{source.review.reason}</p>}
      <p className="text-sm text-fg-secondary"><TranslatedText text={"Les lignes réparties proviennent du même mouvement. Le montant de cette ligne correspond uniquement à son affectation."}/></p>
    </section>}
  </div></Modal>
}
