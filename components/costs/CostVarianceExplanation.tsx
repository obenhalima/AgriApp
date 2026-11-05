'use client'

import { FilterableTable } from '@/components/ui/FilterableTable'
import {useState,useEffect,useRef} from 'react'
import {analyzeCostVariance} from '@/lib/aiCostVariance'
import {useAuth} from '@/lib/auth'
import {useLanguage} from '@/lib/i18n'
import type {PerformanceData,PerformanceRow} from '@/lib/farmPerformance'
import {explainCostVariance} from '@/lib/costVariance'

const labels:Record<string,string>={
 distinct:'Choisissez deux serres différentes.',scope:'Plantations de comparaison indisponibles.',variety:'Choisissez deux serres de la même variété.',campaign:'Choisissez deux serres de la même campagne.',data:'Charges renseignées, surface et récolte positives requises pour les deux serres.',
 open:'Cycles en cours : comparaison à date, pas un bilan final.',provisional:'Charges provisoires ou mouvements en attente : conclusions à confirmer.',datesMissing:'Dates de début de cycle incomplètes : maturité des cycles non comparable.',datesDifferent:'Dates de début de cycle différentes : le décalage peut influencer le rendement à date.',farms:'Fermes différentes : les conditions de production peuvent différer.',cycles:'Plusieurs plantations sont agrégées dans une serre : comparaison globale, pas cycle par cycle.',
}
function AnalysisText({content}:{content:string}) {
 const inline=(line:string)=>line.split(/(\*\*[^*]+\*\*)/g).map((part,i)=>part.startsWith('**')?<strong key={i}>{part.slice(2,-2)}</strong>:part)
 return <div className="space-y-3 text-sm leading-relaxed">{content.split('\n').filter(line=>line.trim()).map((line,i)=>{
  if(/^#{1,6}\s/.test(line))return <h4 key={i} className="font-semibold text-base mt-4">{inline(line.replace(/^#{1,6}\s+/,''))}</h4>
  if(/^\s*[-*]\s/.test(line))return <p key={i} className="ps-4">• {inline(line.replace(/^\s*[-*]\s+/,''))}</p>
  return <p key={i}>{inline(line)}</p>
 })}</div>
}
export function CostVarianceExplanation({data,rows,period}:{data:PerformanceData;rows:PerformanceRow[];period:string}) {
 const {text:t,intlLocale}=useLanguage()
 const {activeDomain}=useAuth()
 const [open,setOpen]=useState(false),[reference,setReference]=useState(''),[compared,setCompared]=useState('')
 const a=rows.find(r=>r.id===reference),b=rows.find(r=>r.id===compared)
 const result=a&&b?explainCostVariance(a,b,data):null
 const fmt=(v:number)=>new Intl.NumberFormat(intlLocale,{maximumFractionDigits:3}).format(v)
 const [ai,setAi]=useState<{reply:string;model:string}|null>(null),[aiError,setAiError]=useState(''),[busy,setBusy]=useState(false)
 const generation=useRef(0)
 useEffect(()=>{generation.current++;setAi(null);setAiError('');setBusy(false)},[reference,compared,data,period,intlLocale])
 async function runAI(report=false){
  if(!a||!b||!result||result.error||busy||!activeDomain)return
  const request=++generation.current
  setBusy(true);setAiError('');setAi(null)
  try{const response=await analyzeCostVariance(a,b,data,period,intlLocale.split('-')[0],activeDomain.domain_id,report);if(request===generation.current)setAi(response)}
  catch{if(request===generation.current)setAiError('L’analyse est temporairement indisponible. Vos chiffres restent accessibles ; réessayez dans quelques instants.')}
  finally{if(request===generation.current)setBusy(false)}
 }
 return <section className="card p-4 space-y-3">
  <button className="btn btn-secondary" aria-expanded={open} onClick={()=>setOpen(!open)}>{t('Expliquer l’écart de coût/kg')}</button>
  {open&&<>
   <p className="text-sm">{t('Comparez deux serres de même variété et de même campagne. Les dépenses et la production sont ramenées au m² pour tenir compte des surfaces.')} {period}</p>
   <div className="grid gap-3 md:grid-cols-2">{[['Serre de référence A',reference,setReference],['Serre comparée B',compared,setCompared]].map(([label,value,setter])=><label key={String(label)} className="text-sm space-y-1"><span className="block">{t(String(label))}</span><select className="input w-full" value={String(value)} onChange={e=>(setter as (v:string)=>void)(e.target.value)}><option value="">{t('Choisir une serre')}</option>{rows.map(r=>{
    const reason=label==='Serre comparée B'&&a?explainCostVariance(a,r,data).error:null
    return <option key={r.id} value={r.id} disabled={!!reason}>{r.name}{reason?` — ${t(labels[reason])}`:''}</option>
   })}</select></label>)}</div>
   {result?.error&&<p role="alert">{t(labels[result.error])}</p>}
   {result&&!result.error&&<>
    <div className="rounded-xl border p-4 space-y-3">
     <h3 className="font-semibold">{t('Comprendre l’écart et décider')}</h3>
     <p className="text-sm">{a!.name} ↔ {b!.name} · {t('Lecture croisée agronomie et finance, à partir des données disponibles. Les causes possibles restent à confirmer sur le terrain.')}</p>
     <div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={busy} onClick={()=>runAI()}>{t(busy?'Analyse en cours…':ai?'Actualiser l’analyse':'Analyser la comparaison')}</button>
     <button className="btn btn-secondary" disabled={busy} onClick={()=>runAI(true)}>{t('Générer le rapport de synthèse')}</button></div>
     <p className="text-xs">{t('Rapport limité aux deux serres sélectionnées : situation, alertes et recommandations à date.')}</p>
     {busy&&<p role="status" className="text-sm">{t('Examen des dépenses, de la production et des dates de culture…')}</p>}
     {aiError&&<p role="alert">{t(aiError)}</p>}
     {ai&&<><AnalysisText content={ai.reply}/><p className="text-xs">{t('Aide à la décision : vérifiez les hypothèses avec le responsable et l’agronome. Les données sont traitées par un service d’analyse externe uniquement à votre demande.')}</p></>}
    </div>
    <p className="font-semibold">{a!.name} : {fmt(result.aCost!)} DH/kg · {b!.name} : {fmt(result.bCost!)} DH/kg</p>
    <p>{t('Écart B − A')} : {fmt(result.gap!)} DH/kg. {t('Effet dépenses par m²')} : {fmt(result.chargeEffect!)} DH/kg. {t('Effet rendement')} : {fmt(result.yieldEffect!)} DH/kg.</p>
    <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-2 text-sm text-green-950">
     <h3 className="font-semibold">{t('Lecture agronomique et économique')}</h3>
     <p>{t('Coût/kg = charges imputées ÷ kilos récoltés. Il mesure les dépenses rapportées à la production enregistrée, pas seulement le niveau des dépenses.')}</p>
     <p>{b!.name} / {a!.name} : {t('Rendement récolté par m²')} {fmt((result.bYield!/result.aYield!-1)*100)} % · {t('Dépenses par m²')} {fmt((result.bIntensity!-result.aIntensity!))} DH/m².</p>
     <p>{t(result.yieldEffect!>0.0005?'La serre comparée a moins de kilos récoltés par m² : ses charges sont réparties sur moins de production, ce qui augmente son coût/kg.':result.yieldEffect!<-.0005?'La serre comparée a plus de kilos récoltés par m² : sa production dilue davantage les charges, ce qui réduit son coût/kg.':'Le rendement enregistré est comparable : il ne contribue pas sensiblement à cet écart de coût/kg.')}</p>
     <p>{t(Math.abs(result.chargeEffect!)<.0005?'Les dépenses par m² sont comparables : l’écart ne vient pas de dépenses supplémentaires significatives.':'Les dépenses par m² diffèrent aussi : examiner les postes et leurs clés de répartition avant de parler de surconsommation.')}</p>
     <h4 className="font-semibold">{t('Vérifications du responsable, dans cet ordre')}</h4>
     <ol className="list-decimal ps-5 space-y-1">
      <li>{t('Vérifier que les récoltes des deux serres sont entièrement saisies sur la même période, avec les bonnes quantités et unités.')}</li>
      <li>{t('Comparer les dates de plantation et de première récolte : une serre plus tardive peut avoir moins récolté à date sans être moins performante en fin de cycle.')}</li>
      <li>{t('Contrôler les charges communes et directes : des montants identiques peuvent provenir d’une répartition, pas de consommations identiques sur le terrain.')}</li>
      <li>{t('Si l’écart de rendement persiste à stade comparable, examiner avec l’agronome les observations terrain, la densité, l’irrigation, la nutrition, l’état sanitaire et les pertes. Ces pistes ne sont pas des causes démontrées par ce rapport.')}</li>
     </ol>
     <p>{t('Ne pas réduire les intrants sur la seule base du coût/kg. Les chiffres identifient un écart à investiguer ; ils ne constituent pas un diagnostic agronomique.')}</p>
    </div>
    <div className="overflow-auto"><FilterableTable className="tbl w-full text-sm"><thead><tr>{['Indicateur','Serre de référence A','Serre comparée B'].map(s=><th key={s}>{t(s)}</th>)}</tr></thead><tbody>
     <tr><th>{t('Surface plantée')}</th><td>{fmt(a!.area)} m²</td><td>{fmt(b!.area)} m²</td></tr>
     <tr><th>{t('Production récoltée')}</th><td>{fmt(a!.kg)} kg</td><td>{fmt(b!.kg)} kg</td></tr>
     <tr><th>{t('Charges imputées')}</th><td>{fmt(a!.direct+a!.shared)} DH</td><td>{fmt(b!.direct+b!.shared)} DH</td></tr>
     <tr><th>{t('Charges par m²')}</th><td>{fmt(result.aIntensity!)} DH/m²</td><td>{fmt(result.bIntensity!)} DH/m²</td></tr>
     <tr><th>{t('Rendement réel')}</th><td>{fmt(result.aYield!)} kg/m²</td><td>{fmt(result.bYield!)} kg/m²</td></tr>
    </tbody></FilterableTable></div>
    <h3 className="font-semibold">{t('Contribution des postes de charges')} — {t('Effet dépenses par m²')}</h3>
    <div className="overflow-auto"><FilterableTable className="tbl w-full text-sm"><thead><tr>{['Poste','Serre de référence A','Serre comparée B','Contribution à l’écart'].map(s=><th key={s}>{t(s)}</th>)}</tr></thead><tbody>{result.posts!.map(p=><tr key={p.name}><th>{t(p.name)}</th><td>{fmt(p.a)} DH</td><td>{fmt(p.b)} DH</td><td>{fmt(p.effect)} DH/kg</td></tr>)}{Math.abs(result.residual!)>.000001&&<tr><th>{t('Charges non ventilées')}</th><td colSpan={2}>—</td><td>{fmt(result.residual!)} DH/kg</td></tr>}</tbody></FilterableTable></div>
    <p className="text-xs">{t('Méthode : dépenses de B au rendement de A, puis rendement de B aux dépenses de B. Les deux effets totalisent l’écart. Une contribution positive augmente le coût/kg de B. Cette décomposition dépend de la référence choisie.')}</p>
    <ul className="list-disc pl-5 text-sm">{result.warnings!.map(w=><li key={w}>{t(labels[w])}</li>)}</ul>
    <p className="text-sm">{t('À vérifier : saisie des récoltes, imputations de charges et clés de répartition. Les kg peuvent inclure des estimations ; ce rapport ne distingue pas les pesées des estimations. Un écart ne prouve pas une cause agronomique.')}</p>
   </>}
  </>}
 </section>
}
