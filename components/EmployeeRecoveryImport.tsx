'use client'
import {useState} from 'react'
import {supabase} from '@/lib/supabase'
import {FilterableTable} from '@/components/ui/FilterableTable'
import {useLanguage} from '@/lib/i18n'
import {readEmployeeRecovery,type EmployeeRecoveryRow} from '@/lib/employeeRecovery'
import {Modal} from '@/components/ui/Modal'
import {Button} from '@/components/ui/Button'
import {buildEmployeeRecoveryTemplate} from '@/lib/employeeRecoveryTemplate'
import {downloadBlob} from '@/lib/imports/engine'

type Report = {created:number;skipped:number;conflicts:number;applied:boolean;rows:{excel_row:number;source_name:string;status:string;issue:string|null}[]}
export function EmployeeRecoveryImport({domain,domainCode,domainName,farms,workers,onClose,onImported}:{domain:string;domainCode:string;domainName:string;farms:{id:string;name:string;code:string}[];workers:{farm_id:string|null;first_name:string;last_name:string;matricule:string|null}[];onClose:()=>void;onImported:()=>void}) {
  const {t}=useLanguage()
  const [farm,setFarm]=useState(''),[filename,setFilename]=useState('')
  const [rows,setRows]=useState<EmployeeRecoveryRow[]>([]),[report,setReport]=useState<Report|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false)
  const readFile=async(file?:File)=>{
    setRows([]);setReport(null);setError('');setDone(false);setFilename(file?.name||'')
    if(!file)return
    setBusy(true)
    try {setRows(readEmployeeRecovery(await file.arrayBuffer(),{domain,farm}))}
    catch(failure:any){setError(failure.message)}
    finally {setBusy(false)}
  }
  const exportTemplate=async()=>{
    const destination=farms.find(value=>value.id===farm)
    if(!destination)return
    setBusy(true);setError('')
    try {
      const blob=await buildEmployeeRecoveryTemplate({domain,domainCode,domainName,farm:destination,workers:workers.filter(worker=>worker.farm_id===farm)})
      downloadBlob(blob,`ItriX_Employes_${domainCode.replace(/[^a-z0-9_-]/gi,'_')}_${destination.code.replace(/[^a-z0-9_-]/gi,'_')}.xlsx`)
    } catch(failure:any){setError(failure.message)}
    finally {setBusy(false)}
  }
  const run=async(apply:boolean)=>{
    setBusy(true);setError('')
    try {
      const {data,error:failure}=await supabase.rpc('import_employee_recovery',{
        p_domain:domain,p_farm:farm,p_filename:filename,p_rows:rows,p_apply:apply,
      })
      if(failure){
        if(['PGRST202','42883'].includes(failure.code))throw new Error(t('Appliquez la migration employee_recovery_import pour activer le contrôle et l’import.'))
        throw failure
      }
      setReport(data as Report)
      if(apply){setDone(true);onImported()}
    } catch(failure:any){setReport(null);setError(failure.message)}
    finally {setBusy(false)}
  }
  return <Modal title={t('Importer les employés')} onClose={onClose} size="lg" dirty={!done&&rows.length>0} busy={busy}>
    <div className="space-y-4">
      <p>{domainCode} · {domainName}</p>
      <p>{t('Exportez le modèle du client et de la ferme, complétez les informations disponibles puis rechargez-le. Le classeur consolidé avec l’onglet Employés est également accepté.')}</p>
      <label className="grid gap-2">{t('Ferme destinataire')}<select className="form-input" value={farm} disabled={busy||done} onChange={event=>{setFarm(event.target.value);setReport(null);setRows([]);setFilename('')}}><option value="">{t('Choisir une ferme')}</option>{farms.map(value=><option key={value.id} value={value.id}>{value.code} · {value.name}</option>)}</select></label>
      <Button variant="secondary" disabled={!farm||busy||done} onClick={()=>void exportTemplate()}>{t('Exporter le modèle employés')}</Button>
      <label className="grid gap-2">{t('Classeur des employés')}<input key={farm} type="file" accept=".xlsx" disabled={!farm||busy||done} onChange={event=>void readFile(event.target.files?.[0])}/></label>
      {!!rows.length&&<p>{rows.length} {t('employés lus')} · {rows.filter(row=>row.is_active===true).length} {t('actifs')} · {rows.filter(row=>row.is_active===false).length} {t('inactifs')}</p>}
      {error&&<p role="alert" data-feedback="error" className="rounded p-3">{error}</p>}
      {report&&<section className="space-y-3">
        <p role="status" data-feedback={done?'success':'info'}>{report.created} {t(done?'employés créés':'employés à créer')} · {report.skipped} {t('déjà importés')} · {report.conflicts} {t('rapprochements à vérifier')}</p>
        {!done&&<p>{t('Les fiches existantes sont préservées. Les informations manquantes seront visibles dans Employés à compléter. Toute modification de fiche applique les contrôles habituels.')}</p>}
        <div className="max-h-80 overflow-auto"><FilterableTable className="tbl w-full"><thead><tr>{['Ligne Excel','Nom','Tarif horaire normal','Tarif horaire supplémentaire','Statut'].map(label=><th key={label}>{t(label)}</th>)}</tr></thead><tbody>{report.rows.map((item,index)=><tr key={item.excel_row}><td>{item.excel_row}</td><td>{item.source_name}</td><td>{rows[index]?.normal_hourly_rate??'—'}</td><td>{rows[index]?.overtime_hourly_rate??'—'}</td><td>{item.issue||t(item.status==='create'?'À créer':'Déjà importé')}</td></tr>)}</tbody></FilterableTable></div>
      </section>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>{t(done?'Fermer':'Annuler')}</Button>
        {!done&&<Button variant="secondary" onClick={()=>void run(false)} disabled={busy||!farm||!rows.length}>{t('Contrôler le fichier')}</Button>}
        {!done&&report&&report.conflicts===0&&report.created>0&&<Button onClick={()=>void run(true)} disabled={busy}>{t('Valider l’import des employés')}</Button>}
      </div>
    </div>
  </Modal>
}
