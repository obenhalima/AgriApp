'use client'
import {Fragment,useEffect,useMemo,useState} from 'react'
import {supabase} from '@/lib/supabase'
import {useLanguage} from '@/lib/i18n'
import {FilterableTable} from '@/components/ui/FilterableTable'
import {CostEntryDetails} from './CostEntryDetails'
import {costFarmId,groupCostAllocations} from '@/lib/costLedgerScope'

async function readSources(domain:string,entries:any[]){
 const ids=[...new Set(entries.map(entry=>entry.source_stock_movement_id).filter(Boolean))] as string[]
 const movements:any[]=[];const reviews:any[]=[];const items:any[]=[]
 for(let offset=0;offset<ids.length;offset+=100){
  const batch=ids.slice(offset,offset+100)
  const results=await Promise.all([
   supabase.from('stock_movements').select('id,stock_item_id,quantity,unit_cost,total_cost,reference,movement_date,costing_method').eq('domain_id',domain).in('id',batch),
   supabase.from('inventory_consumption_reviews').select('movement_id,unit_cost,reason').eq('domain_id',domain).in('movement_id',batch),
  ])
  for(const result of results)if(result.error)throw result.error
  movements.push(...(results[0].data??[]));reviews.push(...(results[1].data??[]))
 }
 const itemIds=[...new Set(movements.map(m=>m.stock_item_id))]
 for(let offset=0;offset<itemIds.length;offset+=100){
  const result=await supabase.from('stock_items').select('id,code,name,unit').eq('domain_id',domain).in('id',itemIds.slice(offset,offset+100))
  if(result.error)throw result.error
  items.push(...(result.data??[]))
 }
 return Object.fromEntries(movements.map(m=>[m.id,{...m,item:items.find(item=>item.id===m.stock_item_id),review:reviews.find(review=>review.movement_id===m.id)}]))
}

export function CostLedger({entries,domain,farms=[],clientName,scope,onScopeChange}:{entries:any[];domain:string;farms?:{id:string;name:string}[];clientName?:string;scope?:{farm:string|null;greenhouse:string|null};onScopeChange?:(farm:string|null,greenhouse:string|null)=>void}){
 const {t,intlLocale}=useLanguage()
 const [sources,setSources]=useState<Record<string,any>>({})
 const [loading,setLoading]=useState(false),[error,setError]=useState('')
 const [search,setSearch]=useState(''),[month,setMonth]=useState(''),[category,setCategory]=useState('')
 const [sort,setSort]=useState('date'),[detail,setDetail]=useState<any>(null)
 const [localFarm,setFarm]=useState<string|null>(null),[localGreenhouse,setGreenhouse]=useState<string|null>(null)
 const farm=scope?scope.farm:localFarm,greenhouse=scope?scope.greenhouse:localGreenhouse
 const changeScope=(nextFarm:string|null,nextGreenhouse:string|null)=>{
  if(onScopeChange)onScopeChange(nextFarm,nextGreenhouse)
  else {setFarm(nextFarm);setGreenhouse(nextGreenhouse)}
 }
 const [expanded,setExpanded]=useState<Set<string>>(new Set())
 useEffect(()=>{setFarm(null);setGreenhouse(null);setExpanded(new Set())},[domain])
 useEffect(()=>{setSearch('');setMonth('');setCategory('');setDetail(null)},[domain])
 const ids=entries.map(entry=>entry.source_stock_movement_id).filter(Boolean).sort().join(',')
 useEffect(()=>{
  let cancelled=false
  setSources({});setError('');setLoading(true)
  readSources(domain,entries).then(result=>{if(!cancelled)setSources(result)})
   .catch(failure=>{if(!cancelled)setError(failure.message)})
   .finally(()=>{if(!cancelled)setLoading(false)})
  return()=>{cancelled=true}
 // Source details depend on the selected movement IDs, not on table filter state.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[domain,ids])
 const money=(value:unknown)=>value==null?'—':Number(value).toLocaleString(intlLocale,{minimumFractionDigits:2,maximumFractionDigits:2})
 const origin=(entry:any)=>t(entry.source_stock_movement_id?'Sortie de stock':entry.source_po_id?'Achat':entry.payroll_period_id?'Paie':'Saisie / import')
 const categoryKey=(entry:any)=>entry.account_category_id||entry.cost_category||''
 const months=[...new Set(entries.map(entry=>String(entry.entry_date).slice(0,7)))].sort()
 const categories=[...new Map<string,string>(entries.map(entry=>[String(categoryKey(entry)),String(entry.account_categories?.label||entry.cost_category||t('Non catégorisé'))])).entries()]
 const filtered=useMemo(()=>entries.filter(entry=>{
  if(month&&!String(entry.entry_date).startsWith(month))return false
  if(category&&categoryKey(entry)!==category)return false
  const source=sources[entry.source_stock_movement_id]
  return !search.trim()||[entry.description,entry.cost_category,entry.account_categories?.label,source?.item?.name,source?.item?.code,source?.reference,source?.review?.reason].filter(Boolean).join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
 }).sort((a,b)=>(sort==='amount'?Number(b.amount)-Number(a.amount):String(sort==='created'?b.created_at||'':b.entry_date).localeCompare(String(sort==='created'?a.created_at||'':a.entry_date)))||String(a.id).localeCompare(String(b.id))),[entries,month,category,search,sources,sort])
 const scoped=filtered.filter(entry=>(farm===null||costFarmId(entry)===farm)&&(greenhouse===null||(entry.greenhouse_id||'')===greenhouse))
 const total=scoped.reduce((sum,entry)=>sum+Number(entry.amount||0),0)
 const rows=groupCostAllocations(scoped)
 if(sort==='amount')rows.sort((a,b)=>b.amount-a.amount)
 const scopeGroups=new Map<string,{label:string;amount:number;count:number}>()
 for(const entry of filtered){
  if(farm!==null&&costFarmId(entry)!==farm)continue
  const key=farm===null?costFarmId(entry):entry.greenhouse_id||''
  const label=farm===null?(farms.find(value=>value.id===key)?.name||t('Ferme non renseignée')):(entry.greenhouses?.code||t('Charge commune'))
  const group=scopeGroups.get(key)||{label,amount:0,count:0}
  group.amount+=Number(entry.amount||0);group.count++;scopeGroups.set(key,group)
 }
 const farmName=(entry:any)=>farms.find(farm=>farm.id===(entry.greenhouses?.farm_id||entry.campaigns?.farm_id))?.name
 return <div className="space-y-3">
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
   <label className="grid gap-1 text-sm">{t('Article, référence ou description')}<input className="form-input" value={search} onChange={event=>setSearch(event.target.value)}/></label>
   <label className="grid gap-1 text-sm">{t('Mois')}<select className="form-input" value={month} onChange={event=>setMonth(event.target.value)}><option value="">{t('Tous les mois')}</option>{months.map(value=><option key={value}>{value}</option>)}</select></label>
   <label className="grid gap-1 text-sm">{t('Catégorie')}<select className="form-input" value={category} onChange={event=>setCategory(event.target.value)}><option value="">{t('Toutes les catégories')}</option>{categories.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   <label className="grid gap-1 text-sm">{t('Trier les écritures')}<select className="form-input" value={sort} onChange={event=>setSort(event.target.value)}><option value="date">{t('Date du coût')}</option><option value="created">{t('Dernières écritures créées')}</option><option value="amount">{t('Montant décroissant')}</option></select></label>
  </div>
  <section className="rounded-lg border p-3 space-y-3" aria-label={t('Vue client, ferme et serre')}>
   <nav className="flex flex-wrap gap-2" aria-label={t('Périmètre des coûts')}>
    <button className="btn-ghost" aria-pressed={farm===null&&greenhouse===null} onClick={()=>changeScope(null,null)}>{t('Vue globale client')}{clientName?` · ${clientName}`:''}</button>
    {farm!==null&&<button className="btn-ghost" aria-pressed={greenhouse===null} onClick={()=>changeScope(farm,null)}>{t('Ferme')} · {farms.find(value=>value.id===farm)?.name||t('Ferme non renseignée')}</button>}
    {greenhouse!==null&&<span>{t('Serre')} · {entries.find(entry=>entry.greenhouse_id===greenhouse)?.greenhouses?.code||t('Charge commune')}</span>}
   </nav>
   {greenhouse===null&&<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[...scopeGroups].map(([id,group])=><button key={id} className="rounded border p-3 text-start hover:bg-surface" onClick={()=>changeScope(farm===null?id:farm,farm===null?null:id)}><span className="block">{group.label}</span><strong>{money(group.amount)} MAD</strong><small className="block">{group.count} {t('écritures')}</small></button>)}</div>}
  </section>
  <p className="font-semibold">{t('Total des écritures affichées')} · {money(total)} MAD · {scoped.length} {t('écritures')} · {rows.length} {t('lignes regroupées')}</p>
  {loading&&<p role="status">{t('Chargement des articles et mouvements sources…')}</p>}
  {error&&<p role="alert">{t('Détail des articles indisponible')} · {error}</p>}
  <p className="text-sm text-fg-secondary">{t('Chaque montant correspond à une affectation de coût. Un même mouvement peut être réparti sur plusieurs serres.')}</p>
  <div className="overflow-auto"><FilterableTable className="tbl w-full text-sm" amountSummary={{total,count:rows.length,currency:'MAD'}}><thead><tr>{['Date du coût','Créé le','Catégorie','Article','Référence mouvement','Quantité du mouvement','PU (MAD)','Ferme','Serre','Montant imputé (MAD)','Origine','Détails'].map(label=><th key={label}>{t(label)}</th>)}</tr></thead><tbody>
   {rows.map(entry=>{const source=sources[entry.source_stock_movement_id];const multiple=entry.allocations.length>1;return <Fragment key={entry.id}><tr>
    <td>{entry.entry_date}</td><td>{entry.created_at?new Date(entry.created_at).toLocaleString(intlLocale):'—'}</td>
    <td>{[...new Set(entry.allocations.map((allocation:any)=>allocation.account_categories?.label||allocation.cost_category||'—'))].join(', ')}</td><td>{source?.item?.name||'—'}<small className="block text-fg-secondary">{entry.description}</small></td>
    <td>{source?.reference||source?.id||'—'}</td><td>{source?`${source.quantity} ${source.item?.unit||''}`:'—'}</td><td>{money(source?.review?.unit_cost??source?.unit_cost)}</td>
    <td>{[...new Set(entry.allocations.map((allocation:any)=>farmName(allocation)||t('Ferme non renseignée')))].join(', ')}</td>
    <td>{multiple?`${entry.allocations.length} ${t('affectations')}`:entry.greenhouses?.code||t('Charge commune')}</td><td className="text-right font-semibold">{money(entry.amount)}</td><td>{origin(entry)}</td>
    <td>{multiple?<button className="btn-ghost" aria-expanded={expanded.has(entry.id)} onClick={()=>setExpanded(previous=>{const next=new Set(previous);if(next.has(entry.id))next.delete(entry.id);else next.add(entry.id);return next})}>{t('Voir les affectations')}</button>:<button className="btn-ghost" onClick={()=>setDetail(entry.allocations[0])}>{t('Voir les détails')}</button>}</td>
   </tr>{expanded.has(entry.id)&&multiple&&<tr><td colSpan={12}><div className="space-y-2 p-3" aria-label={t('Affectations du mouvement')}>{entry.allocations.map((allocation:any)=><div key={allocation.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-2"><span>{farmName(allocation)||t('Ferme non renseignée')} · {allocation.greenhouses?.code||t('Charge commune')} · {allocation.account_categories?.label||allocation.cost_category}</span><strong>{money(allocation.amount)} MAD</strong><button className="btn-ghost" onClick={()=>setDetail(allocation)}>{t('Voir les détails')}</button></div>)}</div></td></tr>}</Fragment>})}
  </tbody></FilterableTable></div>
  {!scoped.length&&<p>{t('Aucune écriture dans ce périmètre.')}</p>}
  {detail&&<CostEntryDetails key={detail.id} domain={domain} entry={detail} farmName={farmName(detail)} onClose={()=>setDetail(null)}/>}
 </div>
}
