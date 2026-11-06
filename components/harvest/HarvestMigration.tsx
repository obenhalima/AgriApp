'use client'

import { FilterableTable } from '@/components/ui/FilterableTable'
import {useLanguage, TranslatedText} from '@/lib/i18n'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { Modal } from '@/components/ui/Modal'
import { MIGRATION_SHEETS, checkHarvestMigration,harvestCollectionKg } from '@/lib/harvestMigration'
import {type MigrationData,type MigrationCatalog} from '@/lib/harvestMigration'
import {harvestWorkflowImportPayload,harvestImportPayload} from '@/lib/harvestMigrationImport'
import {supabase} from '@/lib/supabase'
import {loadHarvestModuleDraft,saveHarvestModuleDraft,importSavedHarvestModule,listHarvestModuleHistory} from '@/lib/harvestModuleDraft'

export function HarvestMigration({scope='workflow',initiallyOpen=false}:{scope?:'workflow'|'harvests';initiallyOpen?:boolean}={}) {
  const { activeDomain, hasPermission }=useAuth()
  if(!activeDomain || !hasPermission('recoltes','view')) return null
  return <MigrationPanel key={activeDomain.domain_id+scope} scope={scope} initiallyOpen={initiallyOpen} domainId={activeDomain.domain_id} domainName={`${activeDomain.domain_code} — ${activeDomain.domain_name}`} />
}
function MigrationPanel({domainId,domainName,scope,initiallyOpen}:{domainId:string;domainName:string;scope:'workflow'|'harvests';initiallyOpen:boolean}) {
 const {hasPermission}=useAuth()
 const {t:_ui,text:_uiNode,intlLocale:_uiLocale}=useLanguage()

  const [open,setOpen]=useState(initiallyOpen),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const buildPayload=(data:MigrationData,c:MigrationCatalog)=>{
    const payload=scope==='harvests'?{harvests:harvestImportPayload(data,c),dispatches:[]}:harvestWorkflowImportPayload(data,c)
    if(!payload.harvests.length)throw new Error('Le fichier ne contient aucune récolte à importer.')
    return payload
  }
  const [report,setReport]=useState<ReturnType<typeof checkHarvestMigration>|null>(null)
  const [checked,setChecked]=useState<{data:MigrationData;catalog:MigrationCatalog}|null>(null)
  const [confirmed,setConfirmed]=useState(false)
  const [importResult,setImportResult]=useState<{created:number;already_imported:number;dispatches_created?:number;dispatches_already_imported?:number}|null>(null)
  const alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  // Keyed by client: a previous client's download/control must not appear in the new context.
  const identity=useRef(domainId); identity.current=domainId
  const [draftRevision,setDraftRevision]=useState(0),[restoring,setRestoring]=useState(scope==='harvests')
  const savedRows=useRef<unknown[]|null>(null)
  const [history,setHistory]=useState<Awaited<ReturnType<typeof listHarvestModuleHistory>>>([])
  async function catalog() {return (await import('@/lib/harvestMigrationCatalog')).loadHarvestMigrationCatalog(domainId,domainName)}
  useEffect(()=>{
    if(scope!=='harvests')return
    let stopped=false
    void (async()=>{
      try{
        const [draft,previous]=await Promise.all([loadHarvestModuleDraft(domainId),listHarvestModuleHistory(domainId)])
        if(!stopped)setHistory(previous)
        if(!draft||stopped)return
        const c=await catalog()
        if(stopped)return
        setDraftRevision(draft.revision);savedRows.current=draft.import_rows
        setChecked({data:draft.input_data,catalog:c});setReport(checkHarvestMigration(draft.input_data,c))
        setImportResult(draft.import_result);setMessage(draft.import_result?'Bilan d’import retrouvé. Les récoltes déjà créées ne sont pas réimportées.':'Brouillon sauvegardé retrouvé : vérifiez la synthèse avant validation.')
      }catch(e:any){if(!stopped)setError(e.message)}
      finally{if(!stopped)setRestoring(false)}
    })()
    return()=>{stopped=true}
  },[domainId,scope])
  async function download() {
    setBusy(true);setError('');setMessage('')
    try {
      const c=await catalog(), {harvestMigrationWorkbook}=await import('@/lib/harvestMigrationWorkbook')
      if(scope==='harvests' && !c.plantings.length)throw new Error('Aucune plantation disponible pour ce client : terminez le module 2 avant les récoltes.')
      const blob=await harvestMigrationWorkbook(c,scope)
      if(!alive.current || identity.current!==domainId)return
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`ItriX_Reprise_Recoltes_${domainName.split(' — ')[0].replace(/[^a-z0-9_-]/gi,'_')}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
      setMessage(`Modèle téléchargé : ${c.plantings.length} plantations, ${c.markets.length} marchés. Aucun enregistrement créé.`)
    } catch(e:any) {setError(e.message||'Téléchargement impossible.')} finally {setBusy(false)}
  }
  async function check(file:File) {
    if(restoring)return
    setBusy(true);setError('');setReport(null);setMessage('');setChecked(null);setConfirmed(false);setImportResult(null)
    try {
      if(!/\.xlsx$/i.test(file.name)||file.size>10*1024*1024)throw new Error('Choisir un fichier .xlsx de 10 Mo maximum.')
      const c=await catalog(), {readHarvestMigration}=await import('@/lib/harvestMigrationWorkbook')
      const data=await readHarvestMigration(await file.arrayBuffer(),domainId,scope,c)
      if(scope==='harvests'){
        const payload=buildPayload(data,c)
        const revision=await saveHarvestModuleDraft(domainId,draftRevision,data,payload.harvests)
        if(!alive.current)return
        setDraftRevision(revision);savedRows.current=payload.harvests
        setMessage('Brouillon sauvegardé pour ce client. Vérifiez la synthèse et confirmez la création des récoltes.')
      }
      if(alive.current && identity.current===domainId){setReport(checkHarvestMigration(data,c));setChecked({data,catalog:c})}
    } catch(e:any) {setError(e.message||'Contrôle impossible.')} finally {setBusy(false)}
  }
  let importProblem=''
  if(checked)try{buildPayload(checked.data,checked.catalog)}catch(e:any){importProblem=e.message}
  async function importHarvests(){
    if(!checked||!confirmed||busy||!hasPermission('recoltes','create'))return
    setBusy(true);setError('')
    try{
      const fresh=await catalog()
      const payload=buildPayload(checked.data,fresh)
      if(JSON.stringify(payload)!==JSON.stringify(buildPayload(checked.data,checked.catalog)))throw new Error('Le référentiel a changé depuis le contrôle. Rechargez le fichier et vérifiez les nouveaux poids avant import.')
      if(scope==='harvests'){
        if(JSON.stringify(payload.harvests)!==JSON.stringify(savedRows.current))throw new Error('Le référentiel a changé : recontrôlez et sauvegardez le brouillon avant validation.')
        const result=await importSavedHarvestModule(domainId,draftRevision)
        if(alive.current){setImportResult(result);setConfirmed(false);setMessage('Import terminé et bilan sauvegardé. Aucune pesée, tarification ou facture créée.')}
        try{const previous=await listHarvestModuleHistory(domainId);if(alive.current)setHistory(previous)}catch{if(alive.current)setMessage('Import terminé et bilan sauvegardé. Rechargez le module pour actualiser l’historique.')}
        return
      }
      const {data,error:rpcError}=payload.dispatches.length
        ? await supabase.rpc('import_historical_harvest_workflow',{p_domain:domainId,p_rows:payload.harvests,p_dispatches:payload.dispatches})
        : await supabase.rpc('import_historical_harvests',{p_domain:domainId,p_rows:payload.harvests})
      if(rpcError)throw new Error(rpcError.code==='PGRST202'?`Import serveur indisponible : appliquer la migration ${payload.dispatches.length?'148_historical_dispatch_import.sql':'145_historical_harvest_import.sql'} avant de réessayer.`:rpcError.message)
      if(alive.current&&identity.current===domainId){setImportResult(data);setConfirmed(false);setMessage('Import terminé. Aucune pesée, tarification ou facture créée.')}
    }catch(e:any){if(alive.current)setError(e.message||'Import impossible. Relancez le contrôle avant de réessayer.')}
    finally{if(alive.current)setBusy(false)}
  }
  const errors=report?.issues.filter(i=>i.severity==='error').length||0
  async function recheckDraft(){
    if(!checked||busy||restoring)return
    setBusy(true);setError('');setConfirmed(false)
    try{const c=await catalog(),payload=buildPayload(checked.data,c)
      const revision=await saveHarvestModuleDraft(domainId,draftRevision,checked.data,payload.harvests)
      if(alive.current){setDraftRevision(revision);savedRows.current=payload.harvests;setChecked({data:checked.data,catalog:c});setReport(checkHarvestMigration(checked.data,c));setImportResult(null);setMessage('Brouillon recontrôlé et sauvegardé. Vérifiez les nouveaux kilos avant validation.')}
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  }
  return <>
    <button className="btn-ghost" onClick={()=>setOpen(true)}>{_ui("Reprise historique · Excel")}</button>
    {open && <Modal title={_ui("Reprise historique des récoltes")} size="lg" busy={busy} dirty={scope==='workflow' && !!checked && !importResult} onClose={()=>{if(!busy)setOpen(false)}}>
      <div className="space-y-4">
        <p><strong>{domainName}</strong></p>
        {scope==='harvests' && <p role="status">{restoring?_ui('Chargement du brouillon sauvegardé…'):`Version sauvegardée : ${draftRevision}`}</p>}
        <p>{_ui(scope==='harvests'?'Module 3 : reprenez uniquement les récoltes et leurs plateaux. Kilos calculés = nombre de plateaux × poids unitaire. Les plantations doivent déjà exister ; les envois seront traités au module 4.':"Récupérez les récoltes absentes du système et les étapes déjà réalisées : plateaux, envois, pesée, tri et prix.")}</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>{_ui("Téléchargez le modèle avec les plantations et référentiels actuels.")}</li>
          <li>{_ui("Complétez les étapes connues. Laissez les étapes non réalisées vides.")}</li>
          <li>{_ui("Rechargez le fichier pour contrôler les références, dates et quantités.")}</li>
        </ol>
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" disabled={busy} onClick={download}>{busy?_ui("Traitement en cours…"):_ui("Télécharger le modèle du client")}</button>
          <label className="space-y-1"><span className="block text-sm">{_ui("Contrôler le fichier rempli")}</span><input aria-label={_ui("Contrôler le fichier rempli")} type="file" accept=".xlsx" disabled={busy||restoring} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void check(f)}} /></label>
          {scope==='harvests' && checked && !importResult && <button className="btn-ghost" disabled={busy||restoring} onClick={recheckDraft}>{_ui('Recontrôler et sauvegarder le brouillon')}</button>}
          {scope==='harvests' && importResult && <button className="btn-primary" disabled={busy||restoring} onClick={()=>{setChecked(null);setReport(null);setImportResult(null);setConfirmed(false);setMessage('Chargez un nouveau fichier pour compléter ce module. Le bilan précédent reste conservé en base.')}}>{_ui('Compléter ce module')}</button>}
        </div>
        <details><summary>{_ui("Contenu des onglets")}</summary><ul className="list-disc pl-5 space-y-2 mt-2">{MIGRATION_SHEETS.filter(s=>scope!=='harvests'||['Recoltes','Plateaux'].includes(s.name)).map(s=><li key={s.name}><strong>{s.name}</strong> : {s.help}</li>)}</ul></details>
        <p className="rounded-lg border p-3 text-sm">{_ui(scope==='harvests'?'Le contrôle ne crée aucune donnée. La confirmation importe uniquement les récoltes et leurs plateaux. Les références déjà importées sont réutilisées sans doublon. Aucun envoi, pesée, tri, prix ou facture n’est créé.':'Le contrôle ne crée aucune donnée. Après confirmation, l’import crée les récoltes, leurs plateaux et les envois renseignés avec leurs sources. Les références déjà importées sont réutilisées sans doublon. Les récoltes envoyées deviennent non modifiables. Aucune pesée, tarification ni facture n’est créée.')}</p>
        {error&&<p role="alert" className="text-red-700">{_uiNode(error)}</p>}
        {message&&<p role="status">{_uiNode(message)}</p>}
        {scope==='harvests' && importResult && <div className="rounded-lg border p-3 text-sm space-y-2"><h3 className="font-semibold">{_ui('Étapes suivantes')}</h3><p>{_ui('À envoyer : composer un envoi par date, variété et marché. À peser : renseigner le poids réellement reçu et le ticket. À trier : répartir accepté, écart et freinte. À tarifer / Bordereaux station : renseigner les kilos tarifés, prix et justificatifs. Le paiement reste distinct.')}</p><a href="/recoltes" className="underline">{_ui('Ouvrir les récoltes et le suivi station')}</a></div>}
        {scope==='harvests' && !!history.length && <details><summary>{_ui('Historique des imports')} ({history.length})</summary><ul className="space-y-2 mt-2">{history.map(h=><li key={h.id}>{new Date(h.created_at).toLocaleString(_uiLocale)}<TranslatedText text={" · version "}/>{h.revision} · {h.result.created}<TranslatedText text={" récolte(s) créée(s) · "}/>{h.result.already_imported}<TranslatedText text={" déjà importée(s)"}/></li>)}</ul></details>}
        {report && !importResult&&<div className="rounded-lg border border-border p-3 space-y-3">
            {importProblem&&<p className="text-sm text-amber-800">{_uiNode(importProblem)}</p>}
            {!hasPermission('recoltes','create')&&<p>{_ui('Le droit de créer des récoltes est nécessaire pour importer.')}</p>}
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy||!!importProblem} onChange={e=>setConfirmed(e.target.checked)}/><span>{_ui(scope==='harvests'?'Je confirme les plantations, dates, types et nombres de plateaux ainsi que les kilos calculés. Je souhaite importer uniquement ces récoltes et plateaux.':'Je confirme les quantités, plantations, destinataires et hypothèses d’envoi du fichier. J’ai vérifié les doublons possibles et je souhaite importer ces données en base.')}</span></label>
            <button className="btn-primary" disabled={busy||!confirmed||!!importProblem||!hasPermission('recoltes','create')} onClick={importHarvests}>{busy?_ui('Import en cours…'):_ui(scope==='harvests'?'Valider et créer les récoltes':'Confirmer et importer')}{!busy&&(scope==='harvests'?` · ${report.counts.Recoltes} récoltes`:` · ${report.counts.Recoltes} récoltes · ${report.counts.Envois} envois`)}</button>
          </div>}
        {report&&<section className="space-y-3" aria-label={_ui("Résultat du contrôle")}>
          {scope==='harvests' && checked && <div className="rounded-lg border p-3 space-y-2"><h3 className="font-semibold">{_ui('Synthèse des récoltes')}</h3><p>{checked.data.Recoltes.length}<TranslatedText text={" récolte(s) · "}/>{report.harvestKg.toLocaleString(_uiLocale)}<TranslatedText text={" kg calculés"}/></p><div className="overflow-auto max-h-64"><FilterableTable className="w-full text-sm"><thead><tr>{['Date','Ferme','Serre','Variété','Caisses','Nombre','Kg'].map(h=><th key={h} className="p-2 text-left">{_ui(h)}</th>)}</tr></thead><tbody>{checked.data.Recoltes.slice(0,500).map((r,i)=>{const p=checked.catalog.plantings.find(p=>p.label===r.planting),lines=r.tray?[r]:(checked.data.Plateaux||[]).filter(t=>t.harvest===r.ref);return <tr key={i} className="border-t">{[r.date,p?.farm,p?.greenhouse,p?.variety,lines.map(t=>checked.catalog.trays.find(v=>v.code===t.tray)?.label||t.tray).join(' + '),lines.reduce((sum,t)=>sum+Number(t.count||0),0),harvestCollectionKg(r,checked.data,checked.catalog)].map((v,j)=><td key={j} className="p-2">{String(v??'')}</td>)}</tr>})}</tbody></FilterableTable></div></div>}
          <h3 className={`font-semibold ${errors ? 'text-red-700' : 'text-emerald-700'}`}>{errors ? `${errors} ${_ui('erreur(s)')}` : _ui('Contrôle structurel réussi')}{report.issues.length-errors>0 ? ` · ${report.issues.length-errors} ${_ui('point(s) à vérifier')}` : ''}</h3>
          {!!report.notes.length && <div className="rounded-lg border border-border bg-surface-sunk p-3 text-sm space-y-2" aria-label={_ui('Informations de calcul')}>{report.notes.map((note,i)=><p key={i}>{_uiNode(note)}</p>)}</div>}
          <p>{report.harvestKg.toLocaleString(_uiLocale)} {" "}{_ui("kg collectés.")}{" "}{Object.entries(report.counts).map(([key,n])=>`${key} : ${n}`).join(' · ')}</p>
          {!report.issues.length&&<p role="status">{_ui("Aucune anomalie structurelle détectée. Le fichier n’est pas importé ; validation métier et DAR encore requis.")}</p>}
          {!!report.issues.length&&<div className="overflow-auto max-h-80"><FilterableTable className="w-full text-sm"><thead><tr>{[_ui("Niveau"),_ui("Onglet"),_ui("Ligne"),_ui("Champ"),_ui("À corriger / vérifier")].map(h=><th className="text-left p-2" key={h}><TranslatedText text={h}/></th>)}</tr></thead><tbody>{report.issues.slice(0,500).map((i,n)=><tr key={n} className="border-t"><td className="p-2">{i.severity==='error'?_ui("Erreur"):_ui("À vérifier")}</td><td className="p-2">{i.sheet}</td><td className="p-2">{i.row}</td><td className="p-2">{i.field}</td><td className="p-2">{_uiNode(i.message)}</td></tr>)}</tbody></FilterableTable>{report.issues.length>500&&<p>{_ui("500 premiers messages affichés. Corrigez-les puis relancez le contrôle.")}</p>}</div>}
          {importResult&&<div role="status" className="rounded-lg border border-emerald-300 p-3 space-y-2"><p>{_ui('{v0} récolte(s) créée(s) ; {v1} déjà importée(s), non recréée(s).',{v0:String(importResult.created),v1:String(importResult.already_imported)})}</p><p>{importResult.dispatches_created||0}<TranslatedText text={" envoi(s) créé(s) ; "}/>{importResult.dispatches_already_imported||0}<TranslatedText text={" déjà importé(s)."}/></p><button className="btn-primary" onClick={()=>window.location.reload()}>{_ui('Actualiser la liste des récoltes')}</button></div>}
        </section>}
      </div>
    </Modal>}
  </>
}
