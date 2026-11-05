'use client'
import { useLanguage } from '@/lib/i18n'
import { allocationPreview, type StockAllocationPlanting } from '@/lib/stockAllocation'
type Props = { plantings: StockAllocationPlanting[]; farm: string; campaign: string; selected: string[]; onCampaign: (id:string)=>void; onSelected: (ids:string[])=>void; disabled?: boolean; quantity?: number }
export function StockAllocationSelector({plantings,farm,campaign,selected,onCampaign,onSelected,disabled,quantity}:Props) {
  const {t}=useLanguage()
  const candidates=plantings.filter(p=>p.farm_id===farm)
  const campaigns=[...new Map(candidates.map(p=>[p.campaign_id,p.campaign_name])).entries()]
  const eligible=candidates.filter(p=>p.campaign_id===campaign)
  const preview=allocationPreview(eligible,selected,quantity)
  return <fieldset disabled={disabled} className="space-y-3 rounded-lg border border-border p-3">
    <legend className="px-1 font-semibold text-sm">{t('Affectation de la consommation')}</legend>
    <p className="text-sm">{t('Ferme de l’entrepôt')} : <strong>{candidates[0]?.farm_name || t('Aucune plantation disponible')}</strong></p>
    <label className="block text-sm">{t('Campagne de la sortie')}<select aria-label={t('Campagne de la sortie')} value={campaign} onChange={e=>{onCampaign(e.target.value);onSelected([])}} className="mt-1 block w-full rounded border border-border bg-surface-input p-2"><option value="">{t('Choisir une campagne')}</option>{campaigns.map(([id,name])=><option key={id} value={id}>{name||id}</option>)}</select></label>
    {campaign && <><div className="flex flex-wrap gap-3 text-sm"><button type="button" className="underline" onClick={()=>onSelected(eligible.map(p=>p.id))}>{t('Sélectionner toutes les serres')}</button><button type="button" className="underline" onClick={()=>onSelected([])}>{t('Tout désélectionner')}</button></div><div className="max-h-52 overflow-auto space-y-2">{eligible.map(p=><label key={p.id} className="flex items-start gap-2 text-sm"><input type="checkbox" aria-label={`${p.greenhouse_name} — ${p.variety_name}`} checked={selected.includes(p.id)} onChange={e=>onSelected(e.target.checked?[...selected,p.id]:selected.filter(id=>id!==p.id))}/><span>{p.greenhouse_name} · {p.variety_name} · {Number(p.area).toLocaleString('fr-FR')} m²</span></label>)}</div></>}
    <p className="text-xs text-fg-secondary">{t('Répartition au prorata des surfaces plantées sélectionnées. Une seule ferme et une seule campagne par sortie ; plusieurs serres et variétés sont possibles. Le montant total n’est compté qu’une fois.')}</p>
    {preview.length>0 ? <div className="text-sm space-y-1">{preview.map(p=><p key={p.id}>{p.greenhouse_name} · {p.variety_name} : {(p.share*100).toFixed(2)} % {p.quantity!=null?`· ≈ ${p.quantity.toFixed(2)} ${t('unités de stock')}`:''}</p>)}</div> : <p className="text-sm text-fg-secondary">{t('Choisissez au moins une serre avec une surface plantée positive.')}</p>}
  </fieldset>
}
