'use client'

import {Fragment, useEffect, useMemo, useRef, useState} from 'react'
import Link from 'next/link'
import {ClipboardCheck, LayoutDashboard} from 'lucide-react'
import {PageHeader} from '@/components/ui/PageHeader'
import {Card} from '@/components/ui/Card'
import {Button} from '@/components/ui/Button'
import {KPICard} from '@/components/ui/KPICard'
import {useAuth} from '@/lib/auth'
import {FilterableTable} from '@/components/ui/FilterableTable'
import {useLanguage} from '@/lib/i18n'
import {listClientWorkerFarms, listClientWorkers, type WorkerFarm} from '@/lib/workerScope'
import {attendanceNeedsReview, attendanceDays, attendanceKey, attendanceCompleteRows, attendanceTotals, attendanceDayEquivalent, parseAttendanceHours, mergeAttendanceRows, type AttendanceRow, type AttendancePeriod, type AttendanceWorker} from '@/lib/attendance'
import {readAttendance, saveAttendance} from '@/lib/attendanceApi'
import {buildAttendanceWorkbook, readAttendanceWorkbook} from '@/lib/attendanceWorkbook'
import {downloadBlob} from '@/lib/imports/engine'
import AttendanceHistory from './AttendanceHistory'
import AttendanceReview from './AttendanceReview'
import AttendanceBatchImport from './AttendanceBatchImport'

export default function PointagePage() {
  const {activeDomain} = useAuth()
  const {t} = useLanguage()
  return activeDomain ? <AttendanceGrid key={activeDomain.domain_id} domain={activeDomain.domain_id} domainCode={activeDomain.domain_code}/> : <p>{t('Sélectionnez un client')}</p>
}

function AttendanceGrid({domain, domainCode}: {domain: string; domainCode: string}) {
  const {t, intlLocale} = useLanguage()
  const {isAdmin, hasPermission} = useAuth()
  const today = new Date()
  const [farms, setFarms] = useState<WorkerFarm[]>([])
  const [workers, setWorkers] = useState<AttendanceWorker[]>([])
  const [farm, setFarm] = useState('')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [half, setHalf] = useState<'first' | 'second'>(today.getDate() <= 15 ? 'first' : 'second')
  const [period, setPeriod] = useState<AttendancePeriod | null>(null)
  const [records, setRecords] = useState<AttendanceRow[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [raw, setRaw] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [reviewDraftDirty, setReviewDraftDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [search, setSearch] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [historyRevision, setHistoryRevision] = useState(0)
  const [reviewTarget, setReviewTarget] = useState<string | null>(null)
  const [gridFocus, setGridFocus] = useState<string | null>(null)
  const request = useRef<{signature: string; id: string} | null>(null)
  const days = useMemo(() => attendanceDays(year, month, half), [year, month, half])
  const farmWorkers = useMemo(() => workers.filter(worker => worker.farm_id === farm), [workers, farm])
  const locked = period?.status === 'validated'
  const canWrite = isAdmin || hasPermission('pointage', period ? 'edit' : 'create')
  const canValidate = isAdmin || hasPermission('pointage', 'admin')
  const discard = () => (!dirty && !reviewDraftDirty) || window.confirm(t('Abandonner les modifications non enregistrées ?'))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('farm')) setFarm(params.get('farm')!)
    const nextYear = Number(params.get('year')), nextMonth = Number(params.get('month'))
    if (nextYear >= 1900 && nextYear <= 2200) setYear(nextYear)
    if (nextMonth >= 1 && nextMonth <= 12) setMonth(nextMonth)
    if (params.get('half') === 'first' || params.get('half') === 'second') setHalf(params.get('half') as 'first' | 'second')
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([listClientWorkerFarms(domain), listClientWorkers(domain)]).then(([nextFarms, nextWorkers]) => {
      if (!cancelled) {setFarms(nextFarms); setWorkers(nextWorkers)}
    }).catch(reason => {if (!cancelled) setError(reason.message || String(reason))})
    return () => {cancelled = true}
  }, [domain])

  useEffect(() => {
    let cancelled = false
    setPeriod(null); setRecords([]); setRaw({}); setSelected([]); setDirty(false); setError(''); setInfo(''); request.current = null
    if (!farm) {setLoading(false); return}
    setLoading(true)
    readAttendance(domain, farm, days[0]).then(result => {
      if (cancelled) return
      setPeriod(result.period); setRecords(result.rows)
      setSelected(result.period ? [...new Set(result.rows.map(row => row.worker_id))] : farmWorkers.filter(worker => worker.is_active).map(worker => worker.id))
    }).catch(reason => {
      if (!cancelled) {setError(reason.message || String(reason)); setSelected(farmWorkers.filter(worker => worker.is_active).map(worker => worker.id))}
    }).finally(() => {if (!cancelled) setLoading(false)})
    return () => {cancelled = true}
  }, [domain, farm, days, farmWorkers, refresh])

  useEffect(() => {
    if (!reviewTarget || loading || period?.start_date !== reviewTarget) return
    const panel = document.getElementById('attendance-review-panel') || document.getElementById('attendance-period-toolbar')
    if (panel) {panel.scrollIntoView({behavior: 'smooth', block: 'start'}); setReviewTarget(null)}
  }, [reviewTarget, loading, period])

  useEffect(() => {
    if(!gridFocus)return
    const input=document.getElementById(gridFocus) as HTMLInputElement | null
    if(input){input.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});input.focus({preventScroll:true});setGridFocus(null)}
  }, [gridFocus, search])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {if (dirty || reviewDraftDirty) {event.preventDefault(); event.returnValue = ''}}
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, reviewDraftDirty])

  const available = useMemo(() => {
    const result = new Map(farmWorkers.map(worker => [worker.id, worker]))
    for (const row of records) if (!result.has(row.worker_id)) result.set(row.worker_id, {
      id: row.worker_id, farm_id: farm, first_name: '', last_name: row.worker_name_snapshot || t('Nom manquant'),
      matricule: row.worker_code_snapshot || row.worker_id, is_active: false,
    })
    return [...result.values()]
  }, [farmWorkers, records, farm])
  const grid = useMemo(() => {
    const invalid = new Set<string>()
    const rows = attendanceCompleteRows(selected, days, records).map(row => {
      const next = {...row}
      for (const field of ['normal_hours', 'overtime_hours'] as const) {
        const key = `${attendanceKey(row.worker_id, row.work_date)}:${field}`
        if (raw[key] === undefined) continue
        try {next[field] = parseAttendanceHours(raw[key]); next.entry_source = 'manual'; if(next[field]!==row[field]) next.needs_review = row.review_status ? true : undefined}
        catch {invalid.add(key); next.needs_review=true}
      }
      return next
    })
    return {rows, invalid}
  }, [selected, days, records, raw])
  const cells = useMemo(() => new Map(grid.rows.map(row => [attendanceKey(row.worker_id, row.work_date), row])), [grid.rows])
  const totals = attendanceTotals(grid.rows)
  const context = {domain, domainCode, farm, farmName: farms.find(item => item.id === farm)?.name || farm, days, workers: available}
  const visible = available.filter(worker => selected.includes(worker.id) && `${worker.last_name} ${worker.first_name} ${worker.matricule || ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const number = (value: number) => value.toLocaleString(intlLocale, {maximumFractionDigits: 2})

  function selectWorker(id: string) {
    if (selected.includes(id) && grid.rows.some(row => row.worker_id === id && ((row.normal_hours || 0) > 0 || (row.overtime_hours || 0) > 0)) && !window.confirm(t('Retirer cet employé et son pointage de la période ?'))) return
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); setDirty(true)
  }
  async function exportFile() {
    setBusy(true); setError('')
    try {downloadBlob(await buildAttendanceWorkbook({...context, workers: available.filter(worker => selected.includes(worker.id))}, grid.rows), `ItriX_Pointage_${domainCode}_${days[0]}.xlsx`)}
    catch (reason: any) {setError(reason.message || String(reason))}
    finally {setBusy(false)}
  }
  async function importFile(file: File) {
    setBusy(true); setError(''); setInfo('')
    try {
      if (grid.invalid.size) throw new Error('Corrigez les heures invalides avant de poursuivre.')
      const incoming = await readAttendanceWorkbook(await file.arrayBuffer(), file.name, context)
      const merged = mergeAttendanceRows(grid.rows, incoming)
      if (merged.replacements && !window.confirm(t('Le fichier remplace des heures déjà renseignées. Continuer ?'))) return
      setRecords(merged.rows); setRaw({}); setSelected(current => [...new Set([...current, ...incoming.map(row => row.worker_id)])]); setDirty(true)
      setInfo(t('Fichier contrôlé. Enregistrez le brouillon ou validez la quinzaine.'))
    } catch (reason: any) {setError(reason.message || String(reason))}
    finally {setBusy(false)}
  }
  function confirmZeros() {
    if (!window.confirm(t('Confirmer à zéro toutes les cellules encore vides ?'))) return
    setRecords(grid.rows.map(row => row.normal_hours == null || row.overtime_hours == null ? {...row, normal_hours: row.normal_hours ?? 0, overtime_hours: row.overtime_hours ?? 0, entry_source: 'manual', source_filename: null} : row))
    setRaw({}); setDirty(true)
  }
  async function persist(action: 'save' | 'validate' | 'reopen', propagateError = false): Promise<AttendancePeriod | null> {
    setError(''); setInfo('')
    const reject=(message:string):null=>{setError(t(message));if(propagateError)throw new Error(t(message));return null}
    if (grid.invalid.size) return reject('Corrigez les heures invalides avant de poursuivre.')
    if (action === 'validate' && grid.rows.some(attendanceNeedsReview)) return reject('Des anomalies de pointage restent à contrôler avant validation et paie.')
    if (action === 'validate' && (totals.missing || !selected.length)) return reject('Renseignez les cellules vides ou confirmez-les à zéro avant validation')
    if (action === 'reopen' && !window.confirm(t('Rouvrir cette quinzaine pour correction ?'))) return null
    const rows = grid.rows.map(({worker_id, work_date, normal_hours, overtime_hours, entry_source, source_filename, source_references}) => ({worker_id, work_date, normal_hours, overtime_hours, entry_source, source_filename, source_references}))
    const signature = JSON.stringify({rows, action, revision: period?.revision || 0})
    if (request.current?.signature !== signature) request.current = {signature, id: crypto.randomUUID()}
    setBusy(true)
    try {
      const saved = await saveAttendance({domain, farm, start: days[0], end: days[days.length - 1], revision: period?.revision || 0, rows, action, request: request.current.id})
      const reloaded = await readAttendance(domain,farm,days[0]); setPeriod(reloaded.period || saved); setRecords(reloaded.rows); setRaw({}); setDirty(false); request.current = null
      setHistoryRevision(value => value + 1)
      setInfo(t(action === 'validate' ? 'Quinzaine validée' : action === 'reopen' ? 'Quinzaine rouverte' : 'Brouillon enregistré'))
      return reloaded.period || saved
    } catch (reason: any) {setError(reason.message || String(reason));if(propagateError)throw reason;return null}
    finally {setBusy(false)}
  }

  async function refreshReviewRows(){
    const result=await readAttendance(domain,farm,days[0])
    setPeriod(result.period);setRecords(result.rows);setRaw({});setDirty(false)
    setHistoryRevision(value=>value+1)
  }

  const control = 'rounded-md border border-border bg-surface-input px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50'
  return <main className="space-y-lg">
    <PageHeader title={t('Pointage par quinzaine')} subtitle={`${t('Parcours quinzaine')} · ${domainCode}`} icon={ClipboardCheck} iconColor="#10b981" actions={<>
      <Button asChild variant="ghost"><Link href="/rh" onClick={event => {if (!discard()) event.preventDefault()}}><LayoutDashboard size={14}/>{t('Tableau de bord')}</Link></Button>
      <Button asChild variant="secondary"><Link href="/pointage/recolte" onClick={event => {if (!discard()) event.preventDefault()}}>{t('Productivité récolte')}</Link></Button>
    </>}/>
    <AttendanceHistory domain={domain} farms={farms} revision={historyRevision} onPayroll={discard} onOpen={saved => {
      if (!discard()) return
      const [nextYear, nextMonth, day] = saved.start_date.split('-').map(Number)
      setFarm(saved.farm_id); setYear(nextYear); setMonth(nextMonth); setHalf(day === 1 ? 'first' : 'second')
      setRefresh(value => value + 1)
    }}/>
    <Card className="flex flex-wrap items-end gap-md">
      <label>{t('Ferme')}<select aria-label={t('Ferme')} className={`${control} block`} value={farm} disabled={busy} onChange={event => {if (discard()) setFarm(event.target.value)}}><option value="">{t('Sélectionnez une ferme')}</option>{farms.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
      <label>{t('Année')}<select aria-label={t('Année')} className={`${control} block`} value={year} disabled={busy} onChange={event => {if (discard()) setYear(Number(event.target.value))}}>{Array.from({length: 11}, (_, index) => today.getFullYear() - 5 + index).map(value => <option key={value}>{value}</option>)}</select></label>
      <label>{t('Mois')}<select aria-label={t('Mois')} className={`${control} block`} value={month} disabled={busy} onChange={event => {if (discard()) setMonth(Number(event.target.value))}}>{Array.from({length: 12}, (_, index) => <option key={index} value={index + 1}>{new Date(2026, index, 1).toLocaleString(intlLocale, {month: 'long'})}</option>)}</select></label>
      <label>{t('Quinzaine')}<select aria-label={t('Quinzaine')} className={`${control} block`} value={half} disabled={busy} onChange={event => {if (discard()) setHalf(event.target.value as 'first' | 'second')}}><option value="first">{t('Du 1 au 15')}</option><option value="second">{t('Du 16 à la fin du mois')}</option></select></label>
    </Card>
    {farm && <AttendanceBatchImport onReview={start => {if(!discard()) return; setReviewTarget(start); const [y,m,d]=start.split('-').map(Number); setYear(y);setMonth(m);setHalf(d===1?'first':'second');setRefresh(value=>value+1)}} key={farm} domain={domain} farm={farm} workers={farmWorkers} canWrite={isAdmin || hasPermission('pointage', 'create') || hasPermission('pointage', 'edit')} canValidate={canValidate} blocked={busy} onBusy={setBusy} beforeOpen={discard} onSaved={() => {setHistoryRevision(value => value + 1); setRefresh(value => value + 1)}}/>}
    {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-danger">{t(error)}</div>}
    {info && <div role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-success">{info}</div>}
    {loading && <p role="status">{t('Chargement…')}</p>}
    {farm && !loading && <>
      <div id="attendance-period-toolbar" className="flex flex-wrap justify-between gap-3 scroll-mt-24"><p>{days[0]} — {days[days.length - 1]} · {t(locked ? 'Validée' : 'Brouillon')}{dirty && ` · ${t('Modifications non enregistrées')}`}</p><button className={control} disabled={busy} onClick={() => {if (discard()) setRefresh(value => value + 1)}}>{t('Recharger')}</button></div>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer">{t('Employés de la quinzaine')} ({selected.length})</summary><div className="grid gap-2 mt-3 sm:grid-cols-2 lg:grid-cols-3">{available.map(worker => <label key={worker.id} className="flex gap-2 items-center"><input type="checkbox" checked={selected.includes(worker.id)} disabled={locked || busy || !canWrite} onChange={() => selectWorker(worker.id)}/>{worker.last_name} {worker.first_name}{!worker.is_active && ` · ${t('Inactif')}`}</label>)}</div></details>
      <div className="flex flex-wrap gap-3 items-center"><input className={control} placeholder={t('Rechercher un employé')} aria-label={t('Rechercher un employé')} value={search} onChange={event => setSearch(event.target.value)}/><button className={control} disabled={busy || !selected.length || !!grid.invalid.size} onClick={exportFile}>{t('Exporter le modèle pointage')}</button><label className={`${control} ${locked || busy || !canWrite ? 'opacity-50' : 'cursor-pointer'}`}>{t('Charger le fichier pointage')}<input type="file" accept=".xlsx" className="sr-only" disabled={locked || busy || !canWrite} onChange={event => {const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file)}}/></label></div>
      <div className="grid gap-md sm:grid-cols-3">{[[t('Heures normales'), number(totals.normal)], [t('Heures supplémentaires'), number(totals.overtime)], [t('Cellules à renseigner'), totals.missing]].map(([label, value]) => <KPICard key={label} label={String(label)} value={value} icon={ClipboardCheck} accent="#10b981"/>)}</div>
      <p>{t('N = heures normales · S = heures supplémentaires · 8 h = 1 jour équivalent. Une cellule vide reste à renseigner, zéro confirme zéro heure.')}</p>
      {!!grid.invalid.size && <p role="alert" className="text-danger bg-danger/10 p-3">{t('Heures invalides. Renseignez des nombres positifs ou nuls.')}</p>}
      <div className="overflow-auto max-h-[65vh] rounded-lg border bg-surface-raised"><FilterableTable className="w-full border-collapse text-sm"><thead className="sticky top-0 z-20 bg-surface-input text-fg-secondary"><tr><th className="p-2 min-w-[220px] sticky start-0 bg-surface-input">{t('Employé')}</th><th className="p-2 min-w-[44px] whitespace-nowrap">N / S</th>{days.map(day => <th key={day} className="p-2 min-w-[76px]"><span className="block">{day.slice(-2)}</span><span className="font-normal">{new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale, {weekday: 'short', timeZone: 'UTC'})}</span></th>)}<th className="p-2 min-w-[90px]">{t('Total heures')}</th><th className="p-2 min-w-[120px]">{t('Équivalent jours N')}</th></tr></thead><tbody>
        {visible.map(worker => {const total = attendanceTotals(grid.rows.filter(row => row.worker_id === worker.id)); const equivalent = attendanceDayEquivalent(total.normal); return <Fragment key={worker.id}>{(['normal_hours', 'overtime_hours'] as const).map((field, index) => <tr key={field} data-filter-pair={worker.id} className={index ? 'border-b-2 bg-surface-input' : 'border-t'}>
          {!index && <th data-filter-value={`${worker.last_name} ${worker.first_name}`.trim()} rowSpan={2} className="p-2 text-left sticky start-0 bg-surface-raised z-10 font-medium">{worker.last_name} {worker.first_name}</th>}<th className="p-2">{index ? 'S' : 'N'}</th>
          {days.map(day => {const key = attendanceKey(worker.id, day); const inputKey = `${key}:${field}`; return <td key={day} className="p-1"><input id={`attendance-${worker.id}-${day}-${field}`} aria-label={`${worker.matricule || worker.id} · ${index ? 'S' : 'N'} · ${day}`} aria-invalid={grid.invalid.has(key) || grid.invalid.has(inputKey)} inputMode="decimal" className={`w-[68px] rounded border p-2 text-right disabled:bg-surface-sunk ${grid.invalid.has(key) || grid.invalid.has(inputKey) ? 'border-red-600 bg-red-50' : 'border-border'}`} value={raw[inputKey] ?? cells.get(key)?.[field] ?? ''} disabled={locked || busy || !canWrite} onChange={event => {setRaw(current => ({...current, [inputKey]: event.target.value})); setDirty(true)}}/></td>})}
          <td className="p-2 font-semibold text-right">{number(index ? total.overtime : total.normal)}</td><td className="p-2">{!index && `${number(equivalent.days)} ${t('j')} ${number(equivalent.hours)} h`}</td>
        </tr>)}</Fragment>})}
      </tbody></FilterableTable>{!visible.length && <p className="p-5">{t('Aucun employé à afficher')}</p>}</div>
      <AttendanceReview onSave={() => persist('save',true)} onEditRow={row=>{setSearch('');setGridFocus(`attendance-${row.worker_id}-${row.work_date}-${row.normal_hours==null?'overtime_hours':'normal_hours'}`)}} onReopen={() => void persist('reopen')} onDraftDirty={setReviewDraftDirty} onBusy={setBusy} canEdit={canWrite} domain={domain} period={period} rows={grid.rows} workers={available} canReview={canValidate} disabled={busy} dirty={dirty} onSaved={refreshReviewRows}/>
      <footer className="flex flex-wrap gap-3">{locked && <Link className="rounded-lg bg-brand px-4 py-2 text-white" href={`/rh/paie?farm=${farm}&year=${year}&month=${month}&half=${half}`}>{t("Préparer la paie de la quinzaine")}</Link>}{!locked ? <><button className={control} disabled={busy || !canWrite || !!grid.invalid.size || !totals.missing} onClick={confirmZeros}>{t('Confirmer les cellules vides à zéro')}</button><button className={control} disabled={busy || !canWrite || !!grid.invalid.size} onClick={() => void persist('save')}>{t('Enregistrer le brouillon')}</button><button className="rounded-lg bg-brand px-4 py-2 text-white disabled:opacity-50" disabled={busy || !canWrite || !canValidate || !!grid.invalid.size} onClick={() => void persist('validate')}>{t('Valider la quinzaine')}</button></> : <button className={control} disabled={busy || !canWrite || !canValidate} onClick={() => void persist('reopen')}>{t('Rouvrir pour correction')}</button>}</footer>
    </>}
  </main>
}
