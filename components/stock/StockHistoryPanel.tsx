'use client'
import Link from 'next/link'
import {useEffect,useRef,useState} from 'react'
import {useAuth} from '@/lib/auth'
import {useLanguage} from '@/lib/i18n'
import {Button} from '@/components/ui/Button'
import {Card} from '@/components/ui/Card'
import {FilterableTable} from '@/components/ui/FilterableTable'
import {downloadInitFile} from '@/lib/initializationWorkbook'
import {checkStockHistory,type HistoryRow,type HistoryCatalog,type HistoryResult} from '@/lib/stockHistory'
import {loadStockHistoryCatalog,importStockHistory} from '@/lib/stockHistoryApi'
import {stockHistoryWorkbook,readStockHistoryWorkbook} from '@/lib/stockHistoryWorkbook'
import {StockHistoryReset} from './StockHistoryReset'
import type {StockResetResult} from '@/lib/stockHistoryApi'

export function StockHistoryPanel(){
 const {activeDomain,isAdmin,isPlatformAdmin}=useAuth(),{t,intlLocale}=useLanguage()
 const domain=activeDomain?.domain_id,name=activeDomain?.domain_name??'',allowed=isAdmin||isPlatformAdmin
 const [catalog,setCatalog]=useState<HistoryCatalog|null>(null),[error,setError]=useState('')
 const [busy,setBusy]=useState(false),[fileName,setFileName]=useState(''),[confirmed,setConfirmed]=useState(false)
 const [checked,setChecked]=useState<ReturnType<typeof checkStockHistory>|null>(null),[result,setResult]=useState<HistoryResult|null>(null)
 const [mode,setMode]=useState<'complete'|'reset'>('complete'),[resetReceipt,setResetReceipt]=useState<StockResetResult|null>(null)
 const scope=useRef(0),request=useRef(''),rows=useRef<HistoryRow[]>([]),working=useRef(false)
 const applied=result?.status==='applied'
 const number=(value:number|null)=>value===null?t('Non valorisé'):Number(value).toLocaleString(intlLocale,{maximumFractionDigits:6})
 const plantingLabels=(refs:string)=>refs.split(';').map(ref=>{
  const planting=catalog?.plantings.find(p=>p.ref===ref.trim())
  return planting?`${planting.greenhouse} · ${planting.variety} · ${number(planting.area)} m²`:ref
 }).join(' ; ')
 useEffect(()=>{
  const token=++scope.current
  setCatalog(null);setError('');setChecked(null);setResult(null);setConfirmed(false);setFileName('');setBusy(false)
  setMode('complete');setResetReceipt(null)
  rows.current=[];request.current='';working.current=false
  if(domain&&allowed)loadStockHistoryCatalog(domain).then(value=>{if(token===scope.current)setCatalog(value)}).catch(e=>{if(token===scope.current)setError(e.message)})
  return()=>{scope.current++}
 },[domain,allowed])
 async function run(action:()=>Promise<void>){
  if(working.current)return
  working.current=true;setBusy(true);setError('')
  const token=scope.current
  try{await action()}catch(e){if(token===scope.current)setError(e instanceof Error?e.message:String(e))}
  finally{if(token===scope.current){working.current=false;setBusy(false)}}
 }
 async function download(){
  if(!domain)return
  const token=scope.current
  await run(async()=>{
   const fresh=await loadStockHistoryCatalog(domain),blob=await stockHistoryWorkbook(domain,name,fresh)
   if(token===scope.current){setCatalog(fresh);downloadInitFile(blob,'ItriX_Historique_Stock.xlsx')}
  })
 }
 async function check(source:HistoryRow[],token:number){
  if(!domain)return
  const fresh=await loadStockHistoryCatalog(domain)
  if(token!==scope.current)return
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const validation=checkStockHistory(source,fresh,today)
  setCatalog(fresh);setChecked(validation);rows.current=validation.rows
  if(validation.rows.length&&!validation.issues.length){
   const response=await importStockHistory(domain,request.current,validation.rows)
   if(token===scope.current)setResult(response)
  }
 }
 async function upload(file?:File){
  if(!file||!domain||working.current)return
  const token=scope.current
  setFileName(file.name);setChecked(null);setResult(null);setConfirmed(false)
  request.current=crypto.randomUUID();rows.current=[]
  await run(async()=>check(await readStockHistoryWorkbook(await file.arrayBuffer(),domain),token))
 }
 async function recheck(){const token=scope.current;setResult(null);setConfirmed(false);await run(async()=>check(rows.current,token))}
 async function apply(){
  if(!domain||!confirmed||result?.status!=='preview'||!rows.current.length)return
  const token=scope.current
  await run(async()=>{
   const response=await importStockHistory(domain,request.current,rows.current,true)
   if(token===scope.current){setResult(response);setConfirmed(false)}
  })
 }
 async function afterReset(receipt:StockResetResult){
  const token=scope.current
  setResetReceipt(receipt);setMode('complete');setBusy(false);setCatalog(null);setChecked(null);setResult(null);setConfirmed(false);setFileName('')
  rows.current=[];request.current='';working.current=false
  if(domain){
   try{const fresh=await loadStockHistoryCatalog(domain);if(token===scope.current)setCatalog(fresh)}
   catch(e){if(token===scope.current)setError(e instanceof Error?e.message:String(e))}
  }
 }
 if(!allowed)return <p role="alert">{t('Reprise historique réservée aux administrateurs du client')}</p>
 return <div className="space-y-5">
  <div className="flex flex-wrap gap-3"><Button asChild variant="secondary"><Link href="/stocks">{t('Retour aux stocks')}</Link></Button><Button asChild variant="secondary"><Link href="/admin/initialisation">{t('Retour à l’initialisation')}</Link></Button></div>
  <h1 className="text-2xl font-semibold">{t('Historique des entrées et sorties')} — {name}</h1>
  <Card className="space-y-3">
   <h2 className="font-semibold">{t('Comment souhaitez-vous reprendre le stock ?')}</h2>
   <div className="flex flex-wrap gap-3" role="group" aria-label={t('Mode de reprise des stocks')}>
    <Button variant={mode==='complete'?'primary':'secondary'} aria-pressed={mode==='complete'} disabled={busy} onClick={()=>setMode('complete')}>{t('Compléter l’historique existant')}</Button>
    <Button variant={mode==='reset'?'primary':'secondary'} aria-pressed={mode==='reset'} disabled={busy} onClick={()=>setMode('reset')}>{t('Repartir de zéro')}</Button>
   </div>
   <p>{t(mode==='complete'?'Les nouveaux mouvements complètent les soldes existants dans l’ordre chronologique.':'Un aperçu et une confirmation sont requis avant la suppression des mouvements de ce client.')}</p>
  </Card>
  {resetReceipt&&<Card role="status">{t('Stock remis à zéro. Vous pouvez maintenant importer les entrées et sorties historiques.')} · {resetReceipt.operation_id}</Card>}
  {mode==='reset'?domain&&<StockHistoryReset key={domain} domain={domain} onApplied={afterReset} onBusy={setBusy}/>:<>
  <Card className="space-y-3">
   <p>{t('Reconstituez les mouvements réels avec leurs dates, pièces et affectations. Les coûts sont générés lors de l’import des sorties valorisées.')}</p>
   <p>{t('Le stock existant sert de point de départ. Une période déjà couverte par une reprise ou des mouvements doit être réconciliée avant import.')}</p>
   <p>{t('Ordre de calcul : date, puis ordre dans la journée. Les entrées sans prix et les sorties non valorisées restent identifiables pour rapprochement.')}</p>
   {catalog&&<p>{t('Méthode de valorisation')} · {(catalog.cost_method??'cump').toUpperCase()}</p>}
   {catalog&&<p>{catalog.items.length} {t('Articles')} · {catalog.movement_count} {t('Mouvements existants')}</p>}
  </Card>
  <Card className="space-y-3"><h2 className="font-semibold">{t('1. Exporter le modèle historique')}</h2>
   <p>{t('Une ligne par mouvement. Utilisez les codes et références des onglets Ref_. Pour plusieurs plantations, séparez les références par ;.')}</p>
   <Button disabled={busy||!catalog?.items.length||!catalog?.warehouses.length} onClick={download}>{t('Exporter le modèle historique')}</Button>
   {catalog&&<details><summary className="cursor-pointer">{t('Voir les soldes déjà enregistrés')}</summary><Balances balances={catalog.balances} number={number}/></details>}
  </Card>
  <Card className="space-y-3"><h2 className="font-semibold">{t('2. Charger et contrôler les mouvements')}</h2>
   <label className="block">{t('Fichier historique des stocks')}<input className="mt-2 block w-full" type="file" accept=".xlsx" disabled={busy||!catalog||applied} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void upload(file)}}/></label>
   {fileName&&<p>{fileName}</p>}
   {checked?.issues.map((issue,i)=><p key={i} role="alert" className="text-danger">{t('Ligne Excel')} {issue.line} · {t(issue.message)}</p>)}
   {checked&&!checked.rows.length&&<p role="status">{t('Aucun mouvement renseigné dans le fichier.')}</p>}
   {checked&&<div className="max-h-80 overflow-auto"><FilterableTable className="w-full text-sm"><thead><tr>{['Ligne','Identifiant','Date','Type','Article','Entrepôt','Quantité','Campagne','Plantations'].map(label=><th key={label} className="p-2 text-start">{t(label)}</th>)}</tr></thead><tbody>{checked.rows.map(row=><tr key={row.line}><td>{row.line}</td><td>{row.external_id}</td><td>{row.date}</td><td>{t(row.type==='entree'?'Entrée':'Sortie')}</td><td>{row.item}</td><td>{row.warehouse}</td><td>{row.quantity} {row.unit}</td><td>{row.campaign}</td><td className="break-all">{plantingLabels(row.plantings)}</td></tr>)}</tbody></FilterableTable></div>}
  </Card>
  {result&&<Card className="space-y-3"><h2 className="font-semibold">{t(applied?'Import historique enregistré':'3. Synthèse avant import')}</h2>
   <p>{result.entries} {t('Entrées')} · {result.exits} {t('Sorties')} · {result.skipped} {t('Mouvements déjà importés ignorés')}</p>
   <p>{t('Coûts des sorties')} · {number(result.cost_total)} MAD · {result.unvalued} {t('Sorties à valoriser')}</p>
   {applied&&<p>{result.cost_lines??0} {t('Lignes de coûts générées')} · {result.operation_id}</p>}
   <h3 className="font-medium">{t('Stock final après import')}</h3><Balances balances={result.balances} number={number}/>
   {result.unvalued>0&&<Link className="underline" href="/couts/pilotage?tab=stock">{t('Ouvrir la valorisation et le rapprochement')}</Link>}
  </Card>}
  <Card className="space-y-3" role="region" aria-label={t('Validation de l’historique')}>
   {error&&<p role="alert" className="text-danger">{t(error)}</p>}
   {!applied&&<><p>{t('La validation enregistre les mouvements et leurs coûts en une seule transaction. En cas de délai dépassé, recontrôlez le même fichier avec les mêmes identifiants.')}</p>
    {checked?.rows.length&&!checked.issues.length?<Button variant="secondary" disabled={busy} onClick={recheck}>{t('Recontrôler avant import')}</Button>:null}
    <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={busy||result?.status!=='preview'} onChange={e=>setConfirmed(e.target.checked)}/><span>{t('Je confirme les dates, quantités, prix et affectations de cet historique déjà réalisé.')}</span></label>
    <Button disabled={busy||!confirmed||result?.status!=='preview'} onClick={apply}>{t('Valider les mouvements et générer les coûts')}</Button></>}
   {applied&&<Button asChild variant="secondary"><Link href="/stocks/mouvements">{t('Voir les mouvements de stock')}</Link></Button>}
  </Card>
 </>}
 </div>
}
function Balances({balances,number}:{balances:HistoryResult['balances'];number:(value:number|null)=>string}){
 const {t}=useLanguage()
 return <div className="max-h-72 overflow-auto"><FilterableTable className="w-full text-sm"><thead><tr>{['Article','Entrepôt','Quantité','Valeur (MAD)','Dernière date existante'].map(label=><th key={label} className="p-2 text-start">{t(label)}</th>)}</tr></thead><tbody>{balances.map(balance=><tr key={balance.warehouse+'/'+balance.item}><td>{balance.item}</td><td>{balance.warehouse}</td><td>{number(balance.quantity)}</td><td>{number(balance.value)}</td><td>{balance.last_date??'—'}</td></tr>)}</tbody></FilterableTable></div>
}
