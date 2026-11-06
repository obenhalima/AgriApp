'use client'
import {useEffect,useRef,useState} from 'react'
import {History} from 'lucide-react'
import {usePathname} from 'next/navigation'
import {useAuth} from '@/lib/auth'
import {useLanguage} from '@/lib/i18n'
import {supabase} from '@/lib/supabase'
import {Modal} from '@/components/ui/Modal'
import {Select} from '@/components/ui/Input'
import {auditActionLabels,auditError,type AuditEvent} from '@/lib/auditReport'
import {auditEntityLabel,auditTableLabel,auditTablesForPath,auditPlatformPaths} from '@/lib/auditPresentation'
import {AuditEventDetails} from './AuditEventDetails'
import {AuditEventIdentity} from './AuditEventIdentity'
export function AuditHistoryButton({table,tables,entity,label,platformScope=false}:{table?:string;tables?:string[];entity?:string;label?:string;platformScope?:boolean}){
 const {activeDomain,isAdmin,isPlatformAdmin}=useAuth(),{t:_ui}=useLanguage()
 const choices=tables||[table||''],[open,setOpen]=useState(false),[selected,setSelected]=useState(choices[0])
 const [record,setRecord]=useState<string|undefined>(entity),[events,setEvents]=useState<AuditEvent[]>([]),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const seq=useRef(0),abort=useRef<AbortController|null>(null),domain=platformScope?null:activeDomain?.domain_id
 const [loadedScope,setLoadedScope]=useState<string|null>(null),scope=platformScope?'platform':domain||''
 const visibleEvents=loadedScope===scope?events:[]
 useEffect(()=>{seq.current++;abort.current?.abort();setOpen(false);setEvents([]);setRecord(entity);setSelected(choices[0])},[domain,entity,choices.join('|')])
 useEffect(()=>()=>{seq.current++;abort.current?.abort()},[])
 async function load(next=false,chosen=selected,id:string|null=record||null){
  if(!domain&&!platformScope)return;const version=++seq.current;abort.current?.abort();const controller=new AbortController();abort.current=controller
  setBusy(true);setError('');if(!next)setEvents([])
  const last=next?events.at(-1):undefined
  try{
   const {data,error}=await supabase.rpc('audit_entity_history',{p_domain:domain,p_table:chosen,p_entity:id||null,p_before:last?.occurred_at||null,p_before_id:last?.cursor_id||last?.event_id.replace(/^tx:/,'')||null,p_limit:50}).abortSignal(controller.signal)
   if(seq.current!==version)return
   if(error){setError(error.code==='PGRST202'?'Historique détaillé à activer avec le complément d’audit.':auditError(error));return}
   setLoadedScope(scope);setEvents(old=>[...(next?old:[]),...(data?.events||[])]);setMore(Boolean(data?.has_more))
  }catch(e){if(seq.current===version&&!controller.signal.aborted)setError(auditError(e as {code?:string}))}
  finally{if(seq.current===version)setBusy(false)}
 }
 if(!(isAdmin||isPlatformAdmin)||(!domain&&!platformScope)||(platformScope&&!isPlatformAdmin)||!choices[0])return null
 return <><button type="button" className="btn btn-secondary print:hidden" onClick={()=>{setOpen(true);setRecord(entity);void load(false,selected,entity||null)}}><History size={15}/>{_ui(label||'Historique')}</button>
 {open&&<Modal title={_ui(record?'Historique de la fiche':'Historique du module')} size="lg" dirty={false} onClose={()=>{seq.current++;abort.current?.abort();setOpen(false)}}>
  <p className="mb-3 text-sm">{platformScope?_ui('Plateforme / paramétrage partagé'):activeDomain?.domain_name} · {_ui(auditTableLabel(selected))}</p>
  {!entity&&<div className="mb-3 flex flex-wrap gap-2"><Select aria-label={_ui('Type de fiche')} value={selected} onChange={e=>{setSelected(e.target.value);setRecord(undefined);void load(false,e.target.value,null)}}>{choices.map(t=><option value={t} key={t}>{_ui(auditTableLabel(t))}</option>)}</Select>{record&&<button className="btn btn-secondary" onClick={()=>{setRecord(undefined);void load(false,selected,null)}}>{_ui('Toutes les fiches du module')}</button>}</div>}
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{_ui(error)}</p>}
  {busy&&<p role="status">{_ui('Chargement…')}</p>}
  {!busy&&!error&&!visibleEvents.length&&<p>{_ui('Aucun événement enregistré pour cette fiche ou ce module.')}</p>}
  <ol className="space-y-3">{visibleEvents.map(e=><li key={e.event_id} className="rounded-xl border border-border p-3"><p className="font-semibold">{_ui(auditActionLabels[e.action]||e.action)} · {auditEntityLabel(e)}</p><AuditEventIdentity event={e}/><AuditEventDetails event={e} showIdentity={false}/>{!record&&e.entity_id&&<button className="btn btn-secondary mt-2" onClick={()=>{setRecord(e.entity_id!);void load(false,selected,e.entity_id!)}}>{_ui('Historique de cette fiche')}</button>}</li>)}</ol>
  {more&&<button className="btn btn-secondary mt-3" disabled={busy} onClick={()=>void load(true)}>{_ui('Charger la suite')}</button>}
 </Modal>}</>
}
export function ModuleAuditHistory(){
  const {t:translateUI}=useLanguage()
const path=usePathname(),tables=auditTablesForPath(path);return tables.length?<div className="mb-4 flex justify-end"><AuditHistoryButton tables={tables} platformScope={auditPlatformPaths.some(p=>path===p||path.startsWith(p+'/'))} label={translateUI("Historique de ce module")}/></div>:null}
