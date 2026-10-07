'use client'
import {useLanguage} from '@/lib/i18n'


import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardList, Download, Save, Upload, CheckCircle2, Circle } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { InitializationClientStep } from '@/components/InitializationClientStep'
import { INIT_SECTIONS, emptyInitDraft, initNumber, initProgress, initReferenceRows, newInitRow, isInitDraft, updateInitRows, type InitDraft, type InitRow, type InitCatalog } from '@/lib/initialization'
import { loadInitializationCatalog } from '@/lib/initializationCatalog'
import { downloadInitFile, initializationWorkbook, readInitializationWorkbook } from '@/lib/initializationWorkbook'

export default function InitializationPage() {
 const {t:_ui,text:_uiNode}=useLanguage()

  const { activeDomain, isAdmin, isPlatformAdmin, loading } = useAuth()
  const [confirmedDomain, setConfirmedDomain] = useState<string | null>(null)
  if (loading) return <p>{_ui("Chargement…")}</p>
  if (!isAdmin && !isPlatformAdmin) return <p role="alert">{_ui("L’initialisation est réservée aux administrateurs du client.")}</p>
  if (!activeDomain || confirmedDomain !== activeDomain.domain_id) return <InitializationClientStep onContinue={setConfirmedDomain} />
  return <InitializationWorkspace key={activeDomain.domain_id} domain={activeDomain.domain_id} name={activeDomain.domain_name} />
}

function InitializationWorkspace({ domain, name }: { domain: string; name: string }) {
 const {t:_ui,text:_uiNode,intlLocale:_uiLocale}=useLanguage()

  const [draft, setDraft] = useState<InitDraft>(emptyInitDraft)
  const [revision, setRevision] = useState(0)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [finalReviewConfirmed, setFinalReviewConfirmed] = useState(false)
  const [finalReviewedRevision, setFinalReviewedRevision] = useState<number | null>(null)
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
  const progress = useMemo(() => initProgress(draft, catalog), [draft, catalog])
  const section = INIT_SECTIONS[step]
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
        }
        setAvailable(true)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [domain])
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  function change(next: InitDraft) { setDraft(next); setDirty(true); setMessage(''); setFinalReviewConfirmed(false); setFinalReviewedRevision(null) }
  async function finishPreparation() {
    if (busy || catalogLoading || catalogError || !available || !finalReviewConfirmed || progress.complete !== progress.total || progress.issues.some(i => !i.warning)) return
    setBusy(true); setError(''); setMessage('')
    try {
      // Reload references before accepting the final review: another user may have changed them.
      const freshCatalog = await loadInitializationCatalog(domain)
      setCatalog(freshCatalog)
      const freshProgress = initProgress(draft, freshCatalog)
      if (freshProgress.complete !== freshProgress.total || freshProgress.issues.some(i => !i.warning)) throw new Error('Les contrôles ont changé après actualisation des référentiels. Corrigez les étapes signalées avant de terminer.')
      const { data, error: saveError } = await supabase.rpc('save_initialization_draft', { p_domain: domain, p_revision: revision, p_payload: draft })
      if (saveError) throw saveError
      setRevision(data); setDirty(false); setFinalReviewedRevision(data)
      setMessage('Préparation terminée : version ' + data + ' sauvegardée pour ' + name + '. Les données métier ne sont pas encore intégrées.')
    } catch (e: any) { setError(e.message || 'Impossible de terminer la préparation. Votre saisie est conservée.'); setFinalReviewConfirmed(false) }
    finally { setBusy(false) }
  }
  function changeRows(next: InitRow[]) { change(updateInitRows(draft, section.key, next)) }
  async function save() {
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
    if (!file || !section) return
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
  if (loading) return <p>{_ui("Chargement du dossier d’initialisation…")}</p>
  return <div className="space-y-5">
    <PageHeader icon={ClipboardList} title={_ui("Initialiser l’exploitation")} subtitle={name} description={_ui("Préparez vos données étape par étape, par saisie ou à partir du modèle Excel.")} />
    <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
      <div className="flex justify-between gap-4"><h2 className="font-semibold">{_ui("Préparation du dossier")}</h2><span>{progress.complete} / {progress.total} {" "}{_ui("étapes relues ·")}{" "}{progress.percent} %</span></div>
      <progress className="w-full h-2 accent-violet-500" max={100} value={progress.percent} aria-label={_ui("Progression du dossier")} />
      <p className="text-caption text-fg-secondary">{_ui("Ce dossier est un espace de préparation. Même à 100 %, il ne crée pas encore de données dans les modules. L’intégration métier et ses contrôles serveur restent à raccorder.")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy || !section} onClick={() => exportFile(true)}><Download size={15} /> {" "}{_ui("Modèle Excel")}{section ? ` · ${section.title}` : ''}</Button>
        <Button variant="secondary" disabled={busy || !section} onClick={() => fileInput.current?.click()}><Upload size={15} /> {" "}{_ui("Recharger cette étape")}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => exportFile(false)}>{_ui("Sauvegarde Excel complète")}</Button>
        <Button disabled={busy || !available || !dirty} onClick={save}><Save size={15} /> {" "}{_ui("Sauvegarder le brouillon")}</Button>
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
      <div className="grid sm:grid-cols-3 gap-2 text-sm">{Object.entries(preview).map(([key, data]) => <p key={key}>{INIT_SECTIONS.find(s => s.key === key)?.title} : {data.length} {" "}{_ui("ligne(s), actuellement")}{" "}{draft.rows[key]?.length || 0}</p>)}</div>
      <p className="text-sm">{initProgress({ ...draft, rows: { ...draft.rows, ...preview } }, catalog).issues.filter(i => !i.warning).length} {" "}{_ui("erreur(s) détectée(s). Les lignes pourront être corrigées après chargement.")}</p>
      <Button disabled={busy} onClick={() => { let next = draft; for (const [key, rows] of Object.entries(preview)) next = updateInitRows(next, key, rows); change(next); setPreview(null) }}>{_ui("Charger dans le brouillon")}</Button>{' '}
      <Button variant="secondary" onClick={() => setPreview(null)}>{_ui("Annuler")}</Button>
    </section>}
    <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-5">
      <nav aria-label={_ui("Étapes d’initialisation")} className="rounded-xl border border-border bg-surface-raised p-2 self-start space-y-1">
        {INIT_SECTIONS.map((s, index) => {
          const done = (draft.reviewed.includes(s.key) && !progress.issues.some(i => i.section === s.key && !i.warning)) || draft.skipped.includes(s.key)
          return <button type="button" key={s.key} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)} className={`w-full text-left p-2 rounded-lg flex gap-2 items-center text-sm ${step === index ? 'bg-violet-100 text-violet-900' : 'hover:bg-surface-sunk'}`}>
            {done ? <CheckCircle2 size={17} className="text-emerald-600 shrink-0" /> : <Circle size={17} className="shrink-0" />}<span>{index + 1}. {s.title}</span>
          </button>
        })}
        <button type="button" className={`w-full text-left p-2 rounded-lg text-sm font-semibold ${!section ? 'bg-violet-100 text-violet-900' : ''}`} onClick={() => setStep(INIT_SECTIONS.length)}>{_ui("Synthèse et contrôles")}</button>
      </nav>
      <section className="min-w-0 rounded-xl border border-border bg-surface-raised p-4 space-y-4">
        {section ? <>
          <div><h2 className="font-semibold text-xl">{section.title}</h2><p className="text-sm text-fg-secondary mt-2">{section.help}</p></div>
          <p className="text-caption">{_ui("Choisissez les références par nom. Les codes métier sont proposés automatiquement et restent personnalisables. Aucun ID de base de données n’est à saisir. Les nouvelles lignes restent des brouillons, sans ID définitif avant leur création.")}</p>
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
            <div className="flex flex-wrap gap-3 items-end">
              <label className="text-sm">{_ui("Culture")}<select aria-label={_ui("Filtrer les variétés par culture")} className="block border border-border rounded p-2 bg-surface-raised" value={cropFilter} onChange={e => { setCropFilter(e.target.value); setSelectedVariety('') }}><option value="">{_ui("Toutes les cultures")}</option>{catalog.crops.map(c => <option key={c.id} value={c.code}>{c.name}</option>)}</select></label>
              <label className="text-sm">{_ui("Variété")}<select aria-label={_ui("Variété existante")} className="block border border-border rounded p-2 bg-surface-raised max-w-full" value={selectedVariety} onChange={e => setSelectedVariety(e.target.value)}><option value="">{_ui("Choisir dans le référentiel")}</option>{catalog.varieties.filter(v => (!cropFilter || v.crop === cropFilter) && !rows.some(r => r.existing_id === v.existing_id)).map(v => <option key={v.existing_id} value={v.existing_id} disabled={!v.crop}>{v.name} — {v.code}{!v.crop ? _ui("(culture à compléter dans le référentiel)") : ''}</option>)}</select></label>
              <Button variant="secondary" disabled={busy || catalogLoading || !selectedVariety || rows.length >= 1000} onClick={() => { const v = catalog.varieties.find(v => v.existing_id === selectedVariety); if (v) { const same = rows.findIndex(r => r.code?.trim().toUpperCase() === v.code.toUpperCase()); if (same >= 0 && !window.confirm(_ui("Remplacer la ligne de ce code par la référence existante ?"))) return; changeRows(same >= 0 ? rows.map((r, i) => i === same ? { ...v } : r) : [...rows, { ...v }]); setSelectedVariety('') } }}>{_ui("Utiliser cette variété")}</Button>
            </div>
            <p className="text-caption">{_ui("Culture absente ? Complétez d’abord le")}{" "}<a className="underline" href="/cultures" target="_blank" rel="noreferrer">{_ui("référentiel Cultures")}</a>{_ui(", puis rechargez ce dossier après sauvegarde.")}</p>
          </div>}
          <fieldset disabled={busy} className="min-w-0 space-y-3">
            <div className="overflow-x-auto max-h-[520px] border border-border rounded-lg"><table className="text-sm w-full"><thead className="sticky top-0 bg-surface-sunk"><tr><th className="p-2">{_ui("Ligne")}</th>{visibleFields.map(f => <th key={f.key} className="p-2 text-left min-w-[175px]">{_uiNode(f.label)}{f.required ? ' *' : ''}</th>)}<th className="p-2">{_ui("Action")}</th></tr></thead><tbody>
              {rows.map((row, index) => <tr key={index}><td className="p-2">{index + 1}{row.existing_id && <span className="block text-emerald-700 text-xs">{_ui("Existante")}</span>}</td>{visibleFields.map(field => {
                const invalid = issues.some(i => i.row === index + 1 && i.field === field.key && !i.warning)
                const props = { 'aria-label': `${field.label}, ligne ${index + 1}`, 'aria-invalid': invalid, className: `w-full min-w-[150px] border rounded p-2 text-slate-900 ${invalid ? 'border-red-500' : 'border-border'} ${field.required ? 'bg-orange-50' : 'bg-blue-50'}`, value: row[field.key] || '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => changeRows(rows.map((r, n) => n === index ? { ...r, [field.key]: e.target.value } : r)) }
                const references = field.ref ? initReferenceRows(draft, field.ref, catalog).filter(r => field.ref !== 'greenhouses' || !row.farm || r.farm === row.farm) : []
                const choices = field.options || (field.ref ? references.filter(r => r.code).map(r => r.code) : null)
                const locked = !!row.existing_id
                return <td key={field.key} className="p-1">{choices ? <select {...props} disabled={locked || (!!field.ref && catalogLoading)}><option value="">{_ui("Choisir")}</option>{props.value && !choices.includes(props.value) && <option value={props.value}>{props.value} {" "}{_ui("— à vérifier")}</option>}{Array.from(new Set(choices)).map(v => <option key={v} value={v}>{references.find(r => r.code === v)?.name || v}</option>)}</select> : <input {...props} readOnly={locked} type={field.type === 'date' ? 'date' : field.type === 'month' ? 'month' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} />}</td>
              })}<td className="p-2"><button type="button" className="text-red-600" aria-label={_ui("Retirer la ligne {v0}",{v0:String(index + 1)})} onClick={() => { if (window.confirm(_ui("Retirer cette ligne du brouillon ?"))) changeRows(rows.filter((_, n) => n !== index)) }}>{_ui("Retirer")}</button></td></tr>)}
            </tbody></table>{!rows.length && <p className="p-6 text-sm text-fg-secondary">{_ui("Aucune ligne. Ajoutez une ligne ou chargez votre fichier Excel.")}</p>}</div>
            <Button variant="secondary" disabled={rows.length >= 1000 || catalogLoading || !!catalogError} onClick={() => changeRows([...rows, newInitRow(section, draft, catalog)])}>{section.key === 'varieties' ? _ui("+ Préparer une nouvelle variété") : _ui("+ Ajouter une ligne")}</Button>
          </fieldset>
          {issues.length > 0 && <div className="rounded-lg bg-amber-50 text-amber-900 p-3 max-h-44 overflow-auto text-sm" role="status">{issues.slice(0, 100).map((i, n) => <p key={n}>{_ui("Ligne")}{" "}{i.row} : {_uiNode(i.message)}{i.warning ? _ui("(avertissement)") : ''}</p>)}{issues.length > 100 && <p>… {issues.length - 100} {" "}{_ui("autre(s) contrôle(s).")}</p>}</div>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !rows.length || issues.some(i => !i.warning) || catalogLoading || !!catalogError} onClick={() => { change({ ...draft, reviewed: Array.from(new Set([...draft.reviewed, section.key])) }); setStep(Math.min(step + 1, INIT_SECTIONS.length)) }}>{_ui("Marquer comme relu et continuer")}</Button>
            {section.optional && <Button variant="secondary" disabled={busy || !!rows.length} onClick={() => { change({ ...draft, skipped: Array.from(new Set([...draft.skipped, section.key])) }); setStep(step + 1) }}>{_ui("Sans objet pour ce dossier")}</Button>}
          </div>
        </> : <>
          <h2 className="font-semibold text-xl">{_ui("Synthèse du dossier")}</h2>
          <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm"><thead className="bg-surface-sunk"><tr><th className="p-2 text-start">{_ui("Étape")}</th><th className="p-2">{_ui("À créer")}</th><th className="p-2">{_ui("Fiches liées")}</th><th className="p-2">{_ui("Contrôles")}</th></tr></thead><tbody>{INIT_SECTIONS.map((s, index) => {
            const entries = draft.rows[s.key] || []
            const errors = progress.issues.filter(i => i.section === s.key && !i.warning).length
            return <tr key={s.key} className="border-t border-border"><td className="p-2"><button className="underline" onClick={() => setStep(index)}>{s.title}</button></td><td className="p-2 text-center">{entries.filter(r => !r.existing_id).length}</td><td className="p-2 text-center">{entries.filter(r => r.existing_id).length}</td><td className="p-2 text-center">{errors ? `${errors} ${_ui('erreur(s)')}` : draft.skipped.includes(s.key) && !entries.length ? _ui('Sans objet') : draft.reviewed.includes(s.key) && entries.length ? _ui('Relue') : _ui('À relire')}</td></tr>
          })}</tbody></table></div>
          <div className="grid md:grid-cols-3 gap-3">{totals.map(t => <div key={t.key} className="rounded-xl border border-border p-4"><p className="text-caption">{t.key === 'budget' ? _ui("Budget préparé") : t.key === 'sales' ? _ui("CA prévisionnel") : _ui("Stock d’ouverture valorisé")}</p><p className="text-xl font-bold mt-2">{fmt(t.value)} DH</p>{t.missing > 0 && <p className="text-amber-700 text-caption">{_ui("Partiel :")}{" "}{t.missing} {" "}{_ui("ligne(s) sans quantité ou prix valide")}</p>}</div>)}</div>
          <p className="text-sm">{progress.issues.filter(i => !i.warning).length} {" "}{_ui("erreur(s) ·")}{" "}{progress.issues.filter(i => i.warning).length} {" "}{_ui("avertissement(s). Les montants ci-dessus sont séparés : ils ne doivent pas être additionnés comme des charges.")}</p>
          <ul className="text-sm space-y-2">{progress.issues.map((i, n) => <li key={n}><button className="underline" onClick={() => setStep(INIT_SECTIONS.findIndex(s => s.key === i.section))}>{INIT_SECTIONS.find(s => s.key === i.section)?.title}{_ui(", ligne")}{" "}{i.row}</button> : {_uiNode(i.message)}</li>)}</ul>
          <p className="rounded-lg bg-surface-sunk p-3 text-sm">{_ui("Prochaine phase : rapprochement avec les données déjà présentes, puis intégration transactionnelle. Les plans, les invitations, les validations réglementaires et la répartition analytique resteront soumis à leurs contrôles métier. Aucune intégration automatique n’est disponible dans ce premier lot.")}</p>
          <div className="rounded-xl border border-border p-4 space-y-3">
            <h3 className="font-semibold">{_ui('Terminer la préparation')}</h3>
            <p className="text-sm">{_ui('Cette action actualise les référentiels, contrôle le dossier et sauvegarde sa version finale. Elle ne crée ni stocks, ni coûts, ni récoltes dans les modules.')}</p>
            {progress.complete !== progress.total && <p role="status" className="text-sm text-amber-700">{_ui('Relisez toutes les étapes obligatoires et marquez les étapes facultatives vides comme « Sans objet ».')}</p>}
            <label className="flex gap-2 items-start text-sm"><input type="checkbox" checked={finalReviewConfirmed} disabled={busy || finalReviewedRevision !== null} onChange={e => setFinalReviewConfirmed(e.target.checked)} /><span>{_ui('Je confirme avoir relu le dossier et les avertissements. Je comprends que seule la préparation sera sauvegardée.')}</span></label>
            <Button disabled={busy || !available || catalogLoading || !!catalogError || !finalReviewConfirmed || progress.complete !== progress.total || progress.issues.some(i => !i.warning) || finalReviewedRevision !== null} onClick={finishPreparation}>{busy ? _ui('Vérification en cours…') : _ui('Terminer et sauvegarder le dossier')}</Button>
            {finalReviewedRevision !== null && <p role="status" className="text-sm text-emerald-700">{_ui('Dossier préparé et sauvegardé.')} {_ui('Version sauvegardée : {v0}', {v0: String(finalReviewedRevision)})}</p>}
          </div>
        </>}
      </section>
    </div>
  </div>
}
