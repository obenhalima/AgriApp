'use client'

import { FilterableTable } from '@/components/ui/FilterableTable'
import {useLanguage, TranslatedText} from '@/lib/i18n'


import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardList, Download, Save, Upload, CheckCircle2, Circle } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import {initializeClientDefaultCrops} from '@/lib/domains'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { InitializationClientStep } from '@/components/InitializationClientStep'
import { InitializationModuleChooser } from '@/components/InitializationModuleChooser'
import { INITIALIZATION_MODULES, initializationModuleSections, initializationModuleProgress, type InitializationModule } from '@/lib/initializationModules'
import { INIT_SECTIONS, emptyInitDraft, initNumber, initGreenhouseCapacity, initProgress, initReferenceRows, newInitRow, isInitDraft, updateInitRows, type InitDraft, type InitRow, type InitCatalog } from '@/lib/initialization'
import { loadInitializationCatalog } from '@/lib/initializationCatalog'
import { draftFromExistingClientData } from '@/lib/initializationExistingData'
import {applyInitializationModule1,rollbackInitializationModule1,getInitializationModule1State,applyInitializationModule2,rollbackInitializationModule2,getInitializationModule2State,canonicalizeModule1Links,type InitializationOperation} from '@/lib/initializationApply'
import { downloadInitFile, initializationWorkbook, readInitializationWorkbook } from '@/lib/initializationWorkbook'
import {startInitializationComplement} from '@/lib/initializationApply'
import {HarvestMigration} from '@/components/harvest/HarvestMigration'
import {StockInitializationPanel} from '@/components/stock/StockInitializationPanel'
import {InfrastructureMigrationAssistant} from '@/components/InfrastructureMigrationAssistant'

export default function InitializationPage() {
 const {t:_ui,text:_uiNode}=useLanguage()

  const { activeDomain, isAdmin, isPlatformAdmin, loading } = useAuth()
  const [confirmedDomain, setConfirmedDomain] = useState<string | null>(null)
  const [choice,setChoice] = useState<{domain:string;module:InitializationModule | 'full' | 'harvests' | 'stock' | 'infrastructure-migration'} | null>(null)
  const chooseClient = () => { setChoice(null); setConfirmedDomain(null) }
  if (loading) return <p>{_ui("Chargement…")}</p>
  if (!isAdmin && !isPlatformAdmin) return <p role="alert">{_ui("L’initialisation est réservée aux administrateurs du client.")}</p>
  if (!activeDomain || confirmedDomain !== activeDomain.domain_id) return <InitializationClientStep onContinue={setConfirmedDomain} />
  if (!choice || choice.domain!==activeDomain.domain_id) return <div className="space-y-md">
    <InitializationModuleChooser name={activeDomain.domain_name} onChangeClient={chooseClient} onStock={()=>setChoice({domain:activeDomain.domain_id,module:'stock'})} onHarvests={()=>setChoice({domain:activeDomain.domain_id,module:'harvests'})} onChoose={module=>setChoice({domain:activeDomain.domain_id,module})} onFull={()=>setChoice({domain:activeDomain.domain_id,module:'full'})} />
    <Button variant="secondary" onClick={() => setChoice({ domain: activeDomain.domain_id, module: 'infrastructure-migration' })}>Simuler une reprise de fermes et serres</Button>
  </div>
  if (choice.module === 'infrastructure-migration') return <InfrastructureMigrationAssistant key={choice.domain}
    domain={choice.domain} code={activeDomain.domain_code} onBack={() => setChoice(null)} />
  if(choice.module==='stock')return <StockInitializationPanel key={activeDomain.domain_id} onBack={()=>setChoice(null)} />
  if(choice.module==='harvests')return <div className="space-y-4"><Button variant="secondary" onClick={()=>setChoice(null)}>{_ui('Retour aux modules')}</Button><h1 className="text-xl font-semibold">{_ui('3. Récoltes')} — {activeDomain.domain_name}</h1><HarvestMigration scope="harvests" initiallyOpen /></div>
  return <InitializationWorkspace key={activeDomain.domain_id+choice.module} domain={activeDomain.domain_id} name={activeDomain.domain_name} module={choice.module==='full'?undefined:choice.module} onBack={()=>setChoice(null)} onChangeClient={chooseClient} />
}

function InitializationWorkspace({ domain, name, module, onBack, onChangeClient }: { domain: string; name: string; module?: InitializationModule; onBack:()=>void; onChangeClient:()=>void }) {
 const {t:_ui,text:_uiNode,intlLocale:_uiLocale}=useLanguage()

  const [draft, setDraft] = useState<InitDraft>(emptyInitDraft)
  const [revision, setRevision] = useState(0)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [missingDraft,setMissingDraft] = useState(false)
  const initializedFromExisting = useRef(false)
  const [finalReviewConfirmed, setFinalReviewConfirmed] = useState(false)
  const [finalReviewedRevision, setFinalReviewedRevision] = useState<number | null>(null)
  const [operation,setOperation]=useState<InitializationOperation|null>(null)
  const [integrationReady,setIntegrationReady]=useState(false)
  const [integrationLoading,setIntegrationLoading]=useState(false)
  const [integrationError,setIntegrationError]=useState('')
  const integrationLoaded=useRef(false)
  const requestId=useRef<string|null>(null)
  const canIntegrate=module==='exploitation' || module==='plantations'
  const applied=canIntegrate && operation?.status==='applied'
  const readIntegration=module==='plantations'?getInitializationModule2State:getInitializationModule1State
  const applyIntegration=module==='plantations'?applyInitializationModule2:applyInitializationModule1
  const rollbackIntegration=module==='plantations'?rollbackInitializationModule2:rollbackInitializationModule1
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<Record<string, InitRow[]> | null>(null)
  const [catalog, setCatalog] = useState<InitCatalog>({ crops: [], varieties: [] })
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [cropFilter, setCropFilter] = useState('')
  const [selectedVariety, setSelectedVariety] = useState('')
  const [selectedExisting, setSelectedExisting] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const sections = useMemo(()=>module?initializationModuleSections(module):INIT_SECTIONS,[module])
  const progress = useMemo(() => module?initializationModuleProgress(draft,module,catalog):initProgress(draft, catalog), [draft, catalog,module])
  const section = sections[step]
  const rows = section ? draft.rows[section.key] || [] : []
  const issues = section ? progress.issues.filter(i => i.section === section.key) : progress.issues
  const visibleFields = section?.fields.filter(f => f.key !== 'existing_id' && !(f.key === 'code' && rows.length > 0 && rows.every(r => r.existing_id))) || []
  const fmt = (n: number) => n.toLocaleString(_uiLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const totals = ['budget', 'sales', 'opening_stock'].map(key => {
    const data = draft.rows[key] || []
    return { key, value: data.reduce((sum, r) => Number.isFinite(initNumber(r.quantity)) && Number.isFinite(initNumber(r.price)) ? sum + initNumber(r.quantity) * initNumber(r.price) : sum, 0), missing: data.filter(r => !Number.isFinite(initNumber(r.price)) || !Number.isFinite(initNumber(r.quantity))).length }
  })
  useEffect(() => {
    let cancelled = false
    async function loadCatalog() {
      try {
        const references = await loadInitializationCatalog(domain)
        if (cancelled) return
        setCatalog(references)
      } catch (e: any) { if (!cancelled) setCatalogError('Référentiels indisponibles : ' + (e.message || 'chargement impossible')) }
      finally { if (!cancelled) setCatalogLoading(false) }
    }
    loadCatalog()
    return () => { cancelled = true }
  }, [domain])
  useEffect(() => {
    let cancelled = false
    supabase.from('initialization_drafts').select('payload,revision').eq('domain_id', domain).maybeSingle().then(({ data, error }) => {
      if (cancelled) return
      if (error) setError('Sauvegarde serveur indisponible. Vérifiez la migration 141. Vous pouvez préparer et exporter le brouillon Excel sans modifier les données métier. Détail : ' + error.message)
      else {
        if (data) {
          if (!isInitDraft(data.payload)) { setError('Format de brouillon non reconnu. Aucun contenu remplacé.'); setLoading(false); return }
          setDraft(data.payload as InitDraft); setRevision(data.revision)
        } else setMissingDraft(true)
        setAvailable(true)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [domain])
  useEffect(()=>{
    if(!missingDraft || loading || catalogLoading || catalogError || dirty || initializedFromExisting.current) return
    initializedFromExisting.current=true
    const existing=draftFromExistingClientData(catalog)
    const count=Object.values(existing.rows).reduce((sum,rows)=>sum+rows.length,0)
    if(count){
      setDraft(existing);setDirty(true)
      setMessage('Dossier prérempli avec '+count+' fiches existantes de ce client. Elles sont liées, pas recréées. Relisez puis sauvegardez le brouillon.')
    }
  },[missingDraft,loading,catalogLoading,catalogError,dirty,catalog])
  useEffect(()=>{
    if(loading || catalogLoading || catalogError) return
    setDraft(current=>canonicalizeModule1Links(current,catalog))
  },[loading,catalogLoading,catalogError,catalog])
  async function refreshIntegrationState() {
    setIntegrationLoading(true);setIntegrationReady(false);setIntegrationError('')
    try {
      const existing=await readIntegration(domain)
      setOperation(existing);setIntegrationReady(true)
      if(existing && existing.revision>=revision){setDraft(canonicalizeModule1Links(existing.payload,catalog));setRevision(existing.revision);setDirty(false)}
    }catch(e:any){setIntegrationError(e.message || 'Validation serveur indisponible')}
    finally{setIntegrationLoading(false)}
  }
  useEffect(()=>{
    if(!canIntegrate || loading || catalogLoading || integrationLoaded.current) return
    integrationLoaded.current=true
    void refreshIntegrationState()
  },[module,loading,catalogLoading])
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  function change(next: InitDraft) { if(applied)return; setDraft(next); setDirty(true); setMessage(''); setFinalReviewConfirmed(false); setFinalReviewedRevision(null) }
  async function finishPreparation() {
    if (busy || catalogLoading || catalogError || !available || !finalReviewConfirmed || progress.complete !== progress.total || progress.issues.some(i => !i.warning)) return
    setBusy(true); setError(''); setMessage('')
    try {
      if(canIntegrate) {
        if(!integrationReady || applied) return
        // Recover a committed operation after a lost response before validating
        // new codes against a catalog that might already contain those creations.
        const existing=await readIntegration(domain)
        const freshCatalog=await loadInitializationCatalog(domain)
        setCatalog(freshCatalog)
        let result=existing
        if(!result) {
          const freshProgress=initializationModuleProgress(draft,module!,freshCatalog)
          if(freshProgress.complete!==freshProgress.total || freshProgress.issues.some(i=>!i.warning))throw new Error('Les références ont changé : relisez les étapes avant de créer le module.')
          requestId.current ||= crypto.randomUUID()
          result=await applyIntegration(domain,revision,draft,requestId.current)
        }
        setOperation(result);setDraft(result.payload);setRevision(result.revision);setDirty(false)
        setMessage(`Module intégré : ${result.created} fiche(s) créée(s), ${result.reused} fiche(s) réutilisée(s).`)
        try{const updated=await loadInitializationCatalog(domain);setCatalog(updated);setDraft(canonicalizeModule1Links(result.payload,updated))}
        catch{setMessage('Module intégré. Actualisation des références indisponible : rechargez la page pour voir les fiches créées.')}
        return
      }
      // Reload references before accepting the final review: another user may have changed them.
      const freshCatalog = await loadInitializationCatalog(domain)
      setCatalog(freshCatalog)
      const freshProgress = module?initializationModuleProgress(draft,module,freshCatalog):initProgress(draft, freshCatalog)
      if (freshProgress.complete !== freshProgress.total || freshProgress.issues.some(i => !i.warning)) throw new Error('Les contrôles ont changé après actualisation des référentiels. Corrigez les étapes signalées avant de terminer.')
      const { data, error: saveError } = await supabase.rpc('save_initialization_draft', { p_domain: domain, p_revision: revision, p_payload: draft })
      if (saveError) throw saveError
      setRevision(data); setDirty(false); setFinalReviewedRevision(data)
      setMessage((module?'Préparation du module terminée : version ':'Préparation terminée : version ') + data + ' sauvegardée pour ' + name + '. Les données métier ne sont pas encore intégrées.')
    } catch (e: any) { setError(e.message || 'Impossible de terminer la préparation. Votre saisie est conservée.'); setFinalReviewConfirmed(false) }
    finally { setBusy(false) }
  }
  async function cancelIntegration() {
    if(busy || !operation || !applied || !window.confirm(_ui('Annuler cette intégration ? Seules les fiches créées par cette opération seront supprimées. Les fiches existantes réutilisées resteront intactes. Les fiches modifiées ou utilisées depuis bloqueront l’annulation.')))return
    setBusy(true);setError('');setMessage('')
    try {
      const result=await rollbackIntegration(domain,operation.operation_id)
      setOperation(result);setDraft(result.payload);setRevision(result.revision);setDirty(false)
      requestId.current=null;setFinalReviewConfirmed(false)
      setMessage('Intégration annulée. Les nouvelles fiches ont été retirées ; les fiches préexistantes sont conservées. Le brouillon est disponible pour correction.')
      try{setCatalog(await loadInitializationCatalog(domain))}catch{setMessage('Intégration annulée. Rechargez la page pour actualiser les références.')}
    }catch(e:any){setError(e.message || 'Annulation impossible : aucune suppression partielle effectuée.')}
    finally{setBusy(false)}
  }
  async function completeModule() {
    if(busy || !applied || !module)return
    setBusy(true);setError('');setMessage('')
    try {
      const result=await startInitializationComplement(domain,module,revision)
      setDraft(canonicalizeModule1Links(result.payload,catalog));setRevision(result.revision)
      setOperation(null);setDirty(false);requestId.current=null
      setFinalReviewConfirmed(false);setFinalReviewedRevision(null);setStep(0)
      setMessage('Nouvelle préparation ouverte. Ajoutez les nouvelles lignes ; les fiches déjà intégrées restent liées et ne seront pas recréées.')
    }catch(e:any){setError(e.message || 'Impossible d’ouvrir une nouvelle préparation. Rechargez le dossier avant de réessayer.')}
    finally{setBusy(false)}
  }
  function changeRows(next: InitRow[]) { change(updateInitRows(draft, section.key, next)) }
  async function initializeCultures() {
    if(busy || catalogLoading || catalogError)return
    setBusy(true);setError('');setMessage('')
    try {
      const result=await initializeClientDefaultCrops(domain)
      setMessage(`${result.created} culture(s) ajoutée(s) pour ce client. Les cultures existantes sont conservées.`)
      try{setCatalog(await loadInitializationCatalog(domain));setCatalogError('')}
      catch{setMessage('Cultures initialisées. Rechargez la page pour actualiser le référentiel.')}
    }catch(e:any){setError(e.message || 'Initialisation des cultures impossible')}
    finally{setBusy(false)}
  }
  async function save() {
    if(applied)return
    setBusy(true); setMessage('')
    try {
      const { data, error } = await supabase.rpc('save_initialization_draft', { p_domain: domain, p_revision: revision, p_payload: draft })
      if (error) throw error
      setRevision(data); setDirty(false); setError(''); setMessage('Brouillon sauvegardé pour ' + name + '. Aucune donnée métier créée.')
    } catch (e: any) { setError(e.message || 'Sauvegarde impossible. Votre saisie est conservée à l’écran.') }
    finally { setBusy(false) }
  }
  async function exportFile(template: boolean) {
    setBusy(true)
    try { downloadInitFile(await initializationWorkbook(domain, draft, catalog, template ? section?.key : undefined), `ItriX Farm_${template ? section.key : 'sauvegarde_complete'}_${domain}.xlsx`); setMessage(template ? `Modèle ${section.title} téléchargé avec votre saisie actuelle. Seule cette étape sera rechargée.` : 'Sauvegarde complète téléchargée. Les modèles de saisie restent disponibles à chaque étape.') }
    catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function importFile(file?: File) {
    if (!file || !section || applied) return
    setBusy(true)
    try {
      const imported = await readInitializationWorkbook(await file.arrayBuffer(), domain, section.key)
      const working = { ...draft, rows: { ...draft.rows, ...imported } }
      for (const s of INIT_SECTIONS) for (const row of imported[s.key] || []) if (!row.code?.trim() && !row.existing_id) row.code = newInitRow(s, working, catalog).code
      setPreview(imported)
    }
    catch (e: any) { setError(e.message) }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = '' }
  }
  if (loading || catalogLoading) return <p>{_ui("Chargement du dossier et des données existantes du client…")}</p>
  return <div className="space-y-5">
    <Button variant="ghost" disabled={busy} onClick={()=>{if(!dirty || window.confirm(_ui('Des modifications ne sont pas sauvegardées. Quitter ce module ?')))onBack()}}>{_ui('Retour aux modules')}</Button>
    <Button variant="secondary" disabled={busy} onClick={()=>{if(!dirty || window.confirm(_ui('Des modifications ne sont pas sauvegardées. Les quitter pour choisir un autre client ?')))onChangeClient()}}>{_ui('Changer de client')}</Button>
    {module&&<h2 className="text-xl font-semibold">{_ui(INITIALIZATION_MODULES.find(item=>item.key===module)!.title)}</h2>}
    <PageHeader icon={ClipboardList} title={_ui("Initialiser l’exploitation")} subtitle={name} description={_ui("Préparez vos données étape par étape, par saisie ou à partir du modèle Excel.")} />
    <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
      <div className="flex justify-between gap-4"><h2 className="font-semibold">{_ui("Préparation du dossier")}</h2><span>{progress.complete} / {progress.total} {" "}{_ui("étapes relues ·")}{" "}{progress.percent} %</span></div>
      <progress className="w-full h-2 accent-violet-500" max={100} value={progress.percent} aria-label={_ui("Progression du dossier")} />
      <p className="text-caption text-fg-secondary">{_ui("Ce dossier est un espace de préparation. Même à 100 %, il ne crée pas encore de données dans les modules. L’intégration métier et ses contrôles serveur restent à raccorder.")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy || !section} onClick={() => exportFile(true)}><Download size={15} /> {" "}{_ui("Modèle Excel")}{section ? ` · ${section.title}` : ''}</Button>
        <Button variant="secondary" disabled={busy || applied || !section} onClick={() => fileInput.current?.click()}><Upload size={15} /> {" "}{_ui("Recharger cette étape")}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => exportFile(false)}>{_ui("Sauvegarde Excel complète")}</Button>
        <Button disabled={busy || applied || !available || !dirty} onClick={save}><Save size={15} /> {" "}{_ui("Sauvegarder le brouillon")}</Button>
        {applied && <Button disabled={busy} onClick={completeModule}>{_ui('Compléter ce module')}</Button>}
        <span className="self-center text-caption text-fg-secondary">{dirty ? _ui("Modifications non sauvegardées — sauvegardez avant de changer de page ou de client") : revision ? _ui("Version sauvegardée : {v0}",{v0:String(revision)}) : _ui("Nouveau dossier")}</span>
        <input ref={fileInput} type="file" accept=".xlsx" className="hidden" aria-label={_ui("Importer le modèle d’initialisation")} onChange={e => importFile(e.target.files?.[0])} />
      </div>
    </div>
    {error && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 p-3 text-sm">{_uiNode(error)}</div>}
    {catalogError && <p role="alert" className="text-red-700">{catalogError}{_ui(". Rechargez la page avant de valider les étapes.")}</p>}
    {message && <p role="status" className="text-sm text-fg-secondary">{_uiNode(message)}</p>}
    {preview && <section className="rounded-xl border border-border bg-surface-raised p-4 space-y-3" aria-label={_ui("Aperçu de l’import")}>
      <h2 className="font-semibold">{_ui("Vérifier avant de remplacer le brouillon")}</h2>
      <p className="text-sm">{_ui("Seule l’étape indiquée ci-dessous sera remplacée, même si le fichier contient d’autres feuilles. Une feuille vide effacera les lignes de cette étape après confirmation. Les autres saisies sont conservées.")}</p>
      <div className="grid sm:grid-cols-3 gap-2 text-sm">{Object.entries(preview).map(([key, data]) => <p key={key}><TranslatedText text={INIT_SECTIONS.find(s => s.key === key)?.title}/> : {data.length} {" "}{_ui("ligne(s), actuellement")}{" "}{draft.rows[key]?.length || 0}</p>)}</div>
      <p className="text-sm">{initProgress({ ...draft, rows: { ...draft.rows, ...preview } }, catalog).issues.filter(i => !i.warning).length} {" "}{_ui("erreur(s) détectée(s). Les lignes pourront être corrigées après chargement.")}</p>
      <Button disabled={busy} onClick={() => { let next = draft; for (const [key, rows] of Object.entries(preview)) next = updateInitRows(next, key, rows); change(next); setPreview(null) }}>{_ui("Charger dans le brouillon")}</Button>{' '}
      <Button variant="secondary" onClick={() => setPreview(null)}>{_ui("Annuler")}</Button>
    </section>}
    <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-5">
      <nav aria-label={_ui("Étapes d’initialisation")} className="rounded-xl border border-border bg-surface-raised p-2 self-start space-y-1">
        {sections.map((s, index) => {
          const done = (draft.reviewed.includes(s.key) && !progress.issues.some(i => i.section === s.key && !i.warning)) || draft.skipped.includes(s.key)
          return <button type="button" key={s.key} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)} className={`w-full text-left p-2 rounded-lg flex gap-2 items-center text-sm ${step === index ? 'bg-violet-100 text-violet-900' : 'hover:bg-surface-sunk'}`}>
            {done ? <CheckCircle2 size={17} className="text-emerald-600 shrink-0" /> : <Circle size={17} className="shrink-0" />}<span>{index + 1}. <TranslatedText text={s.title}/></span>
          </button>
        })}
        <button type="button" className={`w-full text-left p-2 rounded-lg text-sm font-semibold ${!section ? 'bg-violet-100 text-violet-900' : ''}`} onClick={() => setStep(sections.length)}>{_ui("Synthèse et contrôles")}</button>
      </nav>
      <section className="min-w-0 rounded-xl border border-border bg-surface-raised p-4 space-y-4">
        {section ? <>
          <div><h2 className="font-semibold text-xl"><TranslatedText text={section.title}/></h2><p className="text-sm text-fg-secondary mt-2">{section.help}</p></div>
          <p className="text-caption">{_ui("Choisissez les références par nom. Les codes métier sont proposés automatiquement et restent personnalisables. Aucun ID de base de données n’est à saisir. Les nouvelles lignes restent des brouillons, sans ID définitif avant leur création.")}</p>
          {section.key === 'plantings' && <div className="rounded-lg border border-border bg-surface-sunk p-3 text-sm space-y-1">
            <p>{_ui('La surface plantée est propre à la plantation. La limite provient de la surface exploitable de la serre, ou de sa surface officielle à défaut. Toutes les surfaces sont en m².')}</p>
            {rows.map((row, index) => {
              const house = initReferenceRows(draft, 'greenhouses', catalog).find(r => r.code?.trim().toUpperCase() === row.greenhouse?.trim().toUpperCase())
              if (!house) return null
              const capacity = initGreenhouseCapacity(house)
              return <p key={index}>{_ui('Ligne')} {index + 1} — {house.name || house.code} : {_ui('Surface officielle')} {house.area || _ui('Non renseignée')} m² · {_ui('Surface exploitable')} {house.usable_area || _ui('Non renseignée')} m² · {_ui('Surface disponible retenue')} {capacity === null ? _ui('Non renseignée') : `${capacity.toLocaleString('fr-FR')} m²`}</p>
            })}
            <p>{_ui('Pour renseigner ou corriger la surface de la serre, utilisez le module Exploitation, étape Serres. Les fiches existantes se corrigent dans leur module métier, pas dans ce brouillon.')}</p>
          </div>}
          {section.key !== 'varieties' && catalog[section.key] && <div className="rounded-lg border border-border bg-surface-sunk p-4 space-y-3">
            <h3 className="font-semibold">{_ui("Réutiliser une fiche existante")}</h3>
            <select aria-label={_ui("Fiche existante")} className="border border-border rounded p-2 bg-surface-raised max-w-full" value={selectedExisting} onChange={e => setSelectedExisting(e.target.value)}>
              <option value="">{_ui("Choisir parmi")}{" "}{catalog[section.key].length} {" "}{_ui("fiche(s)")}</option>
              {catalog[section.key].filter(r => !rows.some(row => row.existing_id === r.existing_id)).map(r => <option key={r.existing_id} value={r.existing_id}>{r.name || r.code}{r.type && section.key === 'partners' ? ` (${r.type})` : ''}</option>)}
            </select>{' '}
            <Button variant="secondary" disabled={busy || catalogLoading || !catalog[section.key].some(r => r.existing_id === selectedExisting) || rows.length >= 1000} onClick={() => { const r = catalog[section.key].find(r => r.existing_id === selectedExisting); if (r) { const match = rows.findIndex(v => v.code === r.code); if (match >= 0 && !window.confirm(_ui("Remplacer la ligne de ce code par la fiche existante ?"))) return; changeRows(match >= 0 ? rows.map((v, i) => i === match ? { ...r } : v) : [...rows, { ...r }]); setSelectedExisting('') } }}>{_ui("Réutiliser la fiche")}</Button>
            <p className="text-caption">{_ui("La fiche est liée, pas recréée. Ses données restent non modifiables dans ce dossier.")}</p>
            {section.key === 'partners' && <p className="text-caption">{_ui("Les fournisseurs sont ceux du client actif. Les clients commerciaux proviennent du référentiel partagé de l’instance, comme dans le module Clients.")}</p>}
          </div>}
          {section.key === 'varieties' && <div className="rounded-lg border border-border bg-surface-sunk p-4 space-y-3">
            <h3 className="font-semibold">{_ui("Réutiliser une variété existante")}</h3>
            <p className="text-sm text-fg-secondary">{catalogLoading ? _ui("Chargement des référentiels…") : _ui("{v0} culture(s) et {v1} variété(s) actives disponibles. Aucun doublon ne sera créé.",{v0:String(catalog.crops.length),v1:String(catalog.varieties.length)})}</p>
            {!catalogLoading && !catalogError && !catalog.crops.length && <div className="rounded-lg border border-border p-3 space-y-2"><p className="text-sm">{_ui('Aucune culture active pour ce client. Ajoutez les cultures par défaut : elles seront copiées uniquement dans son référentiel. Les cultures existantes, même désactivées, ne seront pas modifiées.')}</p><Button variant="secondary" disabled={busy} onClick={initializeCultures}>{_ui('Initialiser les cultures par défaut')}</Button></div>}
            <div className="flex flex-wrap gap-3 items-end">
              <label className="text-sm">{_ui("Culture")}<select aria-label={_ui("Filtrer les variétés par culture")} className="block border border-border rounded p-2 bg-surface-raised" value={cropFilter} onChange={e => { setCropFilter(e.target.value); setSelectedVariety('') }}><option value="">{_ui("Toutes les cultures")}</option>{catalog.crops.map(c => <option key={c.id} value={c.code}>{c.name}</option>)}</select></label>
              <label className="text-sm">{_ui("Variété")}<select aria-label={_ui("Variété existante")} className="block border border-border rounded p-2 bg-surface-raised max-w-full" value={selectedVariety} onChange={e => setSelectedVariety(e.target.value)}><option value="">{_ui("Choisir dans le référentiel")}</option>{catalog.varieties.filter(v => (!cropFilter || v.crop === cropFilter) && !rows.some(r => r.existing_id === v.existing_id)).map(v => <option key={v.existing_id} value={v.existing_id} disabled={!v.crop}>{v.name} — {v.code}{!v.crop ? _ui("(culture à compléter dans le référentiel)") : ''}</option>)}</select></label>
              <Button variant="secondary" disabled={busy || catalogLoading || !selectedVariety || rows.length >= 1000} onClick={() => { const v = catalog.varieties.find(v => v.existing_id === selectedVariety); if (v) { const same = rows.findIndex(r => r.code?.trim().toUpperCase() === v.code.toUpperCase()); if (same >= 0 && !window.confirm(_ui("Remplacer la ligne de ce code par la référence existante ?"))) return; changeRows(same >= 0 ? rows.map((r, i) => i === same ? { ...v } : r) : [...rows, { ...v }]); setSelectedVariety('') } }}>{_ui("Utiliser cette variété")}</Button>
            </div>
            <p className="text-caption">{_ui("Culture absente ? Complétez d’abord le")}{" "}<a className="underline" href="/cultures" target="_blank" rel="noreferrer">{_ui("référentiel Cultures")}</a>{_ui(", puis rechargez ce dossier après sauvegarde.")}</p>
          </div>}
          <fieldset disabled={busy || applied} className="min-w-0 space-y-3">
            <div className="overflow-x-auto max-h-[520px] border border-border rounded-lg"><FilterableTable className="text-sm w-full"><thead className="sticky top-0 bg-surface-sunk"><tr><th className="p-2">{_ui("Ligne")}</th>{visibleFields.map(f => <th key={f.key} className="p-2 text-left min-w-[175px]">{_uiNode(f.label)}<TranslatedText text={f.required ? ' *' : ''}/></th>)}<th className="p-2">{_ui("Action")}</th></tr></thead><tbody>
              {rows.map((row, index) => <tr key={index}><td className="p-2">{index + 1}{row.existing_id && <span className="block text-emerald-700 text-xs">{_ui("Existante")}</span>}</td>{visibleFields.map(field => {
                const invalid = issues.some(i => i.row === index + 1 && i.field === field.key && !i.warning)
                const props = { 'aria-label': `${field.label}, ligne ${index + 1}`, 'aria-invalid': invalid, className: `w-full min-w-[150px] border rounded p-2 text-slate-900 ${invalid ? 'border-red-500' : 'border-border'} ${field.required ? 'bg-orange-50' : 'bg-blue-50'}`, value: row[field.key] || '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => changeRows(rows.map((r, n) => n === index ? { ...r, [field.key]: e.target.value } : r)) }
                const references = field.ref ? initReferenceRows(draft, field.ref, catalog).filter(r => field.ref !== 'greenhouses' || !row.farm || r.farm === row.farm) : []
                const choices = field.options || (field.ref ? references.filter(r => r.code).map(r => r.code) : null)
                const locked = !!row.existing_id
                return <td key={field.key} className="p-1">{choices ? <select {...props} disabled={locked || (!!field.ref && catalogLoading)}><option value="">{_ui("Choisir")}</option>{props.value && !choices.includes(props.value) && <option value={props.value}>{props.value} {" "}{_ui("— à vérifier")}</option>}{Array.from(new Set(choices)).map(v => <option key={v} value={v}>{references.find(r => r.code === v)?.name || v}</option>)}</select> : <input {...props} readOnly={locked} type={field.type === 'date' ? 'date' : field.type === 'month' ? 'month' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} />}</td>
              })}<td className="p-2"><button type="button" className="text-red-600" aria-label={_ui("Retirer la ligne {v0}",{v0:String(index + 1)})} onClick={() => { if (window.confirm(_ui("Retirer cette ligne du brouillon ?"))) changeRows(rows.filter((_, n) => n !== index)) }}>{_ui("Retirer")}</button></td></tr>)}
            </tbody></FilterableTable>{!rows.length && <p className="p-6 text-sm text-fg-secondary">{_ui("Aucune ligne. Ajoutez une ligne ou chargez votre fichier Excel.")}</p>}</div>
            <Button variant="secondary" disabled={rows.length >= 1000 || catalogLoading || !!catalogError} onClick={() => changeRows([...rows, newInitRow(section, draft, catalog)])}>{section.key === 'varieties' ? _ui("+ Préparer une nouvelle variété") : _ui("+ Ajouter une ligne")}</Button>
          </fieldset>
          {issues.length > 0 && <div className="rounded-lg bg-amber-50 text-amber-900 p-3 max-h-44 overflow-auto text-sm" role="status">{issues.slice(0, 100).map((i, n) => <p key={n}>{_ui("Ligne")}{" "}{i.row} : {_uiNode(i.message)}{i.warning ? _ui("(avertissement)") : ''}</p>)}{issues.length > 100 && <p>… {issues.length - 100} {" "}{_ui("autre(s) contrôle(s).")}</p>}</div>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || applied || !rows.length || issues.some(i => !i.warning) || catalogLoading || !!catalogError} onClick={() => { change({ ...draft, reviewed: Array.from(new Set([...draft.reviewed, section.key])) }); setStep(Math.min(step + 1, sections.length)) }}>{_ui("Marquer comme relu et continuer")}</Button>
            {section.optional && <Button variant="secondary" disabled={busy || !!rows.length} onClick={() => { change({ ...draft, skipped: Array.from(new Set([...draft.skipped, section.key])) }); setStep(step + 1) }}>{_ui("Sans objet pour ce dossier")}</Button>}
          </div>
        </> : <>
          <h2 className="font-semibold text-xl">{_ui(module?'Synthèse du module':'Synthèse du dossier')}</h2>
          <div className="overflow-x-auto rounded-lg border border-border"><FilterableTable className="w-full text-sm"><thead className="bg-surface-sunk"><tr><th className="p-2 text-start">{_ui("Étape")}</th><th className="p-2">{_ui("À créer")}</th><th className="p-2">{_ui("Fiches liées")}</th><th className="p-2">{_ui("Contrôles")}</th></tr></thead><tbody>{sections.map((s, index) => {
            const entries = draft.rows[s.key] || []
            const errors = progress.issues.filter(i => i.section === s.key && !i.warning).length
            return <tr key={s.key} className="border-t border-border"><td className="p-2"><button className="underline" onClick={() => setStep(index)}><TranslatedText text={s.title}/></button></td><td className="p-2 text-center">{entries.filter(r => !r.existing_id).length}</td><td className="p-2 text-center">{entries.filter(r => r.existing_id).length}</td><td className="p-2 text-center">{errors ? `${errors} ${_ui('erreur(s)')}` : draft.skipped.includes(s.key) && !entries.length ? _ui('Sans objet') : draft.reviewed.includes(s.key) && entries.length ? _ui('Relue') : _ui('À relire')}</td></tr>
          })}</tbody></FilterableTable></div>
          {!module&&<div className="grid md:grid-cols-3 gap-3">{totals.map(t => <div key={t.key} className="rounded-xl border border-border p-4"><p className="text-caption">{t.key === 'budget' ? _ui("Budget préparé") : t.key === 'sales' ? _ui("CA prévisionnel") : _ui("Stock d’ouverture valorisé")}</p><p className="text-xl font-bold mt-2">{fmt(t.value)} DH</p>{t.missing > 0 && <p className="text-amber-700 text-caption">{_ui("Partiel :")}{" "}{t.missing} {" "}{_ui("ligne(s) sans quantité ou prix valide")}</p>}</div>)}</div>}
          <p className="text-sm">{progress.issues.filter(i => !i.warning).length} {" "}{_ui("erreur(s) ·")}{" "}{progress.issues.filter(i => i.warning).length} {" "}{_ui(module?'avertissement(s) pour ce module.':'avertissement(s). Les montants ci-dessus sont séparés : ils ne doivent pas être additionnés comme des charges.')}</p>
          <ul className="text-sm space-y-2">{progress.issues.map((i, n) => <li key={n}><button className="underline" onClick={() => setStep(sections.findIndex(s => s.key === i.section))}><TranslatedText text={sections.find(s => s.key === i.section)?.title}/>{_ui(", ligne")}{" "}{i.row}</button> : {_uiNode(i.message)}</li>)}</ul>
          {!canIntegrate && <p className="rounded-lg bg-surface-sunk p-3 text-sm">{_ui("Ce module reste en préparation. L’intégration métier sera activée séparément, avec ses contrôles et son journal.")}</p>}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <h3 className="font-semibold">{_ui(canIntegrate?'Valider et créer le module':'Terminer la préparation')}</h3>
            <p className="text-sm">{_ui(module==='exploitation'?'Les nouvelles fermes, serres et variétés seront créées pour ce client. Les fiches liées seront réutilisées sans modification. Aucun stock, coût, campagne ou récolte ne sera créé.':module==='plantations'?'Les nouvelles campagnes et plantations seront créées pour ce client. Les fiches liées seront réutilisées sans modification. Les fermes, serres et variétés doivent déjà exister. Aucune récolte, dépense réalisée ou donnée de stock ne sera créée.':'Cette action contrôle le dossier et sauvegarde sa préparation. Aucune donnée métier ne sera créée.')}</p>
            {canIntegrate && <div role="status" className="text-sm"><p className="text-amber-700">{integrationError}</p><Button variant="secondary" disabled={busy || integrationLoading} onClick={refreshIntegrationState}>{_ui('Actualiser la validation serveur')}</Button></div>}
            {applied && operation && <div role="status" className="rounded-lg bg-emerald-50 text-emerald-900 p-3 space-y-2"><p>{_ui('Module intégré')} : {operation.created} {_ui('fiche(s) créée(s)')} · {operation.reused} {_ui('fiche(s) réutilisée(s)')}</p><p className="text-xs">{_ui('Opération')} : {operation.operation_id}</p><Button variant="secondary" disabled={busy} onClick={cancelIntegration}>{_ui('Annuler cette intégration')}</Button><p className="text-xs">{_ui('L’annulation est bloquée si le dossier ou les fiches créées ont changé, ou si des données dépendantes existent.')}</p></div>}
            {progress.complete !== progress.total && <p role="status" className="text-sm text-amber-700">{_ui(module?'Relisez les étapes de ce module. Les autres modules pourront être préparés ensuite.':'Relisez toutes les étapes obligatoires et marquez les étapes facultatives vides comme « Sans objet ».')}</p>}
            <label className="flex gap-2 items-start text-sm"><input type="checkbox" checked={finalReviewConfirmed} disabled={busy || applied || finalReviewedRevision !== null} onChange={e => setFinalReviewConfirmed(e.target.checked)} /><span>{_ui(canIntegrate?'Je confirme la synthèse et autorise la création des nouvelles fiches pour ce client.':'Je confirme avoir relu le dossier et les avertissements. Je comprends que seule la préparation sera sauvegardée.')}</span></label>
            <Button disabled={busy || applied || (canIntegrate && (!integrationReady || integrationLoading)) || !available || catalogLoading || !!catalogError || !finalReviewConfirmed || progress.complete !== progress.total || progress.issues.some(i => !i.warning) || finalReviewedRevision !== null} onClick={finishPreparation}>{busy ? _ui('Traitement en cours…') : _ui(canIntegrate?'Valider et créer ce module':module?'Terminer et sauvegarder ce module':'Terminer et sauvegarder le dossier')}</Button>
            {finalReviewedRevision !== null && <p role="status" className="text-sm text-emerald-700">{_ui(module?'Module préparé et sauvegardé. Aucun import métier effectué.':'Dossier préparé et sauvegardé.')} {_ui('Version sauvegardée : {v0}', {v0: String(finalReviewedRevision)})}</p>}
          </div>
        </>}
      </section>
    </div>
  </div>
}
