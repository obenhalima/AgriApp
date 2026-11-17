'use client'
import {useEffect,useState} from 'react'
import {getActualChargeEntries} from '@/lib/actuals'
import {useLanguage} from '@/lib/i18n'
import {Modal} from '@/components/ui/Modal'
import {CostLedger} from './CostLedger'

export type CostBreakdownScope={campaignId:string;categoryIds:string[];label:string;months:string[];month?:string;expected:number;farmId?:string;greenhouseId?:string|null}
export function CostBreakdownDialog({scope,domain,farms,onClose}:{scope:CostBreakdownScope;domain:string;farms:{id:string;name:string}[];onClose:()=>void}){
 const {t,intlLocale}=useLanguage()
 const [entries,setEntries]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{
  let cancelled=false
  setLoading(true);setError('');setEntries([])
  getActualChargeEntries(scope).then(rows=>{
   if(cancelled)return
   const categories=new Set(scope.categoryIds)
   setEntries(rows.filter(entry=>categories.has(entry.account_category_id)&&scope.months.includes(entry.entry_date.slice(0,7))&&(!scope.month||entry.entry_date.startsWith(scope.month))))
  }).catch(failure=>{if(!cancelled)setError(failure.message)}).finally(()=>{if(!cancelled)setLoading(false)})
  return()=>{cancelled=true}
 },[scope])
 const total=entries.reduce((sum,entry)=>sum+Number(entry.amount||0),0)
 const money=(value:number)=>value.toLocaleString(intlLocale,{minimumFractionDigits:2,maximumFractionDigits:2})
 return <Modal title={t('Écritures derrière ce montant')} onClose={onClose} size="lg" dirty={false}>
  <div className="space-y-4">
   <p className="font-semibold">{scope.label} · {scope.month||t('Période du rapport')}</p>
   <p>{t('Montant du compte d’exploitation')} · {money(scope.expected)} MAD</p>
   {loading&&<p role="status">{t('Chargement des écritures…')}</p>}
   {error&&<p role="alert">{error}</p>}
   {!loading&&!error&&<>
    {Math.abs(total-scope.expected)>.02&&<p role="alert" data-feedback="warning" className="rounded p-3">{t('Le total détaillé diffère du rapport. Actualisez le compte d’exploitation pour vérifier les écritures récentes.')} · {money(total)} MAD</p>}
    <CostLedger entries={entries} domain={domain} farms={farms}/>
   </>}
  </div>
 </Modal>
}
