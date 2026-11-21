'use client'

import {useEffect, useState} from 'react'
import {Card} from '@/components/ui/Card'
import {Button} from '@/components/ui/Button'
import {FilterableTable} from '@/components/ui/FilterableTable'
import {useLanguage} from '@/lib/i18n'
import {attendanceHourWarnings, attendanceNeedsReview, attendanceKey, attendanceReviewReasons, attendanceReviewLabels, type AttendanceRow, type AttendancePeriod, type AttendanceWorker} from '@/lib/attendance'
import {reviewAttendance} from '@/lib/attendanceApi'

export default function AttendanceReview({domain, period, rows, workers, canReview, canEdit, disabled, dirty, onSaved, onSave, onEditRow, onReopen, onDraftDirty, onBusy}: {
 domain: string; period: AttendancePeriod | null; rows: AttendanceRow[]; workers: AttendanceWorker[]; canReview: boolean; canEdit: boolean; disabled: boolean; dirty: boolean
 onSaved: () => Promise<void>; onSave: () => Promise<AttendancePeriod | null>; onEditRow: (row: AttendanceRow) => void
 onReopen: () => void; onDraftDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void
}) {
 const {t}=useLanguage()
 const [forms,setForms]=useState<Record<string,{reason:string;note:string}>>({})
 const hasDraft=Object.keys(forms).length>0
 useEffect(()=>{onDraftDirty(hasDraft);return()=>onDraftDirty(false)},[hasDraft,onDraftDirty])
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const pending=rows.filter(attendanceNeedsReview)
 const reviewed=rows.filter(row=>!attendanceNeedsReview(row)&&row.review_status)
 if(!pending.length&&!reviewed.length)return null
 const control='rounded border border-border bg-surface-input px-2 py-2 text-body-sm'
 function formFor(row:AttendanceRow){
  const needs=attendanceNeedsReview(row)
  const previousReview=needs&&row.review_status!=='pending'
  return forms[attendanceKey(row.worker_id,row.work_date)]||{reason:previousReview?'':row.review_reason||'',note:previousReview?'':row.review_note||''}
 }
 async function decide(row:AttendanceRow,action:'confirm'|'resolve'){
  const form=formFor(row)
  if(!form.reason||(!period&&!dirty))return
  if(!window.confirm(t(action==='confirm'?'Confirmer ces heures malgré l’alerte ? Elles pourront être utilisées dans la paie après validation du pointage.':'Confirmer la résolution de cette anomalie ?')))return
  setBusy(true);onBusy(true);setError('')
  try{
   const saved=dirty||!period?await onSave():period
   if(!saved)throw new Error(t('Le brouillon n’a pas pu être enregistré. Le contrôle n’a pas été appliqué.'))
   onBusy(true)
   await reviewAttendance({domain,period:saved.id,revision:saved.revision,worker:row.worker_id,date:row.work_date,...form,action,request:crypto.randomUUID()})
   await onSaved()
   setForms(current=>{const next={...current};delete next[attendanceKey(row.worker_id,row.work_date)];return next})
  }catch(reason){setError((reason as Error).message||String(reason))}finally{setBusy(false);onBusy(false)}
 }
 return <Card id="attendance-review-panel" className="space-y-3 scroll-mt-24">
  <h2 className="font-semibold">{t('Anomalies de pointage à contrôler')} ({pending.length})</h2>
  {!!pending.length&&<p className="rounded border border-warning/30 bg-warning/10 p-3 text-warning">{t('Modifiez les heures dans la grille de pointage. Renseignez ici le motif et le commentaire, puis résolvez ou confirmez l’anomalie.')}</p>}
  {period?.status==='validated'&&<p className="text-fg-muted">{t('Cette quinzaine est validée. Rouvrez-la pour modifier les heures.')}</p>}
  {dirty&&<p className="text-warning">{t('Le motif reste accessible. Les heures modifiées seront enregistrées avant l’application du contrôle.')}</p>}
  {error&&<p role="alert" className="rounded border border-danger/30 bg-danger/10 p-3 text-danger">{t(error)}</p>}
  <div className="overflow-auto"><FilterableTable className="w-full text-body-sm"><thead><tr>{['Employé','Date','Heures d’origine N / S','Heures actuelles N / S','Alerte','Motif','Commentaire','Statut','Actions'].map(label=><th key={label} className="p-2 text-start">{t(label)}</th>)}</tr></thead><tbody>
  {[...pending,...reviewed].map(row=>{
   const key=attendanceKey(row.worker_id,row.work_date), worker=workers.find(item=>item.id===row.worker_id),needs=attendanceNeedsReview(row), warnings=attendanceHourWarnings(row)
   const form=formFor(row), blocked=disabled||busy||period?.status==='validated'||!canReview||!needs
   const actionLabel=dirty?(warnings.length?'Enregistrer et confirmer la valeur':'Enregistrer et résoudre l’anomalie'):(warnings.length?'Confirmer la valeur':'Résoudre l’anomalie')
   return <tr key={key} className="border-t border-border">
    <td data-filter-value={worker?`${worker.last_name} ${worker.first_name}`.trim():row.worker_name_snapshot||t('Nom manquant')} className="p-2">{worker?`${worker.last_name} ${worker.first_name}`.trim():row.worker_name_snapshot||t('Nom manquant')}<small className="block">{row.source_filename}</small>{row.source_references?.map(source=><small key={source} className="block">{source}</small>)}</td>
    <td className="p-2">{row.work_date}</td><td className="p-2">{row.original_hours ? row.original_hours.normal_hours??'—' : row.normal_hours??'—'} / {row.original_hours ? row.original_hours.overtime_hours??'—' : row.overtime_hours??'—'}</td>
    <td className="p-2">{row.normal_hours??'—'} / {row.overtime_hours??'—'}</td>
    <td className="p-2 text-warning">{warnings.length?warnings.map(message=><p key={message}>{t(message)}</p>):needs?t('Valeurs corrigées : résolution à confirmer.'):t('Contrôle effectué')}</td>
    <td className="p-2"><select aria-label={`${t('Motif')} ${row.work_date} ${row.worker_id}`} className={control} value={form.reason} disabled={blocked} onChange={event=>setForms(current=>({...current,[key]:{...form,reason:event.target.value}}))}><option value="">{t('Choisissez un motif')}</option>{attendanceReviewReasons.map(reason=><option key={reason} value={reason}>{t(attendanceReviewLabels[reason])}</option>)}</select></td>
    <td className="p-2"><textarea aria-label={`${t('Commentaire')} ${row.work_date} ${row.worker_id}`} className={control} maxLength={1000} disabled={blocked} value={form.note} onChange={event=>setForms(current=>({...current,[key]:{...form,note:event.target.value}}))}/>{form.reason==='advance'&&<p className="text-warning">{t('Une avance se saisit en montant dans la paie. Corrigez les heures puis résolvez cette anomalie.')}</p>}</td>
    <td className={`p-2 ${needs?'text-warning':'text-success'}`}><span>{t(needs?'À contrôler':row.review_status==='confirmed'?'Valeur confirmée':'Anomalie résolue')}</span>{row.reviewed_at&&<small className="block">{row.reviewed_at} · {row.reviewed_by}</small>}</td>
    <td className="p-2"><div className="flex flex-col items-start gap-2">
     {period?.status==='validated'?<Button variant="secondary" disabled={disabled||busy||!canReview||!canEdit} onClick={onReopen}>{t('Rouvrir pour correction')}</Button>:<Button variant="secondary" disabled={disabled||busy||!canEdit} onClick={()=>onEditRow(row)}>{t('Modifier dans la grille')}</Button>}
     {needs&&<Button disabled={blocked||!form.reason||(form.reason==='other'&&!form.note.trim())||(warnings.length>0&&form.reason==='advance')} onClick={()=>void decide(row,warnings.length?'confirm':'resolve')}>{t(actionLabel)}</Button>}
    </div></td>
   </tr>
  })}</tbody></FilterableTable></div>
 </Card>
}
