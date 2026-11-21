'use client'

import {useEffect, useRef, useState} from 'react'
import {Card} from '@/components/ui/Card'
import {Button} from '@/components/ui/Button'
import {FilterableTable} from '@/components/ui/FilterableTable'
import {useLanguage} from '@/lib/i18n'
import {attendanceHourWarnings, attendanceNeedsReview, attendanceTotals, mergeAttendanceRows, type AttendanceWorker} from '@/lib/attendance'
import {readFarmAttendanceBatch, type AttendanceBatchPeriod} from '@/lib/attendanceBatch'
import {readAttendance, saveAttendance} from '@/lib/attendanceApi'
import {downloadBlob} from '@/lib/imports/engine'
import {attendanceCellAddress, type AttendanceIssueLocation} from '@/lib/attendanceValidation'
import AttendanceCorrections from './AttendanceCorrections'
import {consolidateAttendanceCorrespondences, exportAttendanceCorrections, preserveAttendanceWorkbookLayout, restoreAttendanceCorrectionSheet} from '@/lib/attendanceCorrections'

type Preview = AttendanceBatchPeriod & {existing: Awaited<ReturnType<typeof readAttendance>>; replacements: number; selected: boolean; result: string; done: boolean}

export default function AttendanceBatchImport({domain, farm, workers, canWrite, canValidate, blocked, beforeOpen, onSaved, onBusy, onReview}: {
  onReview: (start: string) => void
  domain: string; farm: string; workers: AttendanceWorker[]; canWrite: boolean; canValidate: boolean; blocked: boolean; beforeOpen: () => boolean; onSaved: () => void; onBusy: (busy: boolean) => void
}) {
  const {t, intlLocale} = useLanguage()
  const [focusRequest, setFocusRequest] = useState<(AttendanceIssueLocation & {token: number}) | undefined>()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [periods, setPeriods] = useState<Preview[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [zeros, setZeros] = useState(false)
  const [mappingDirty, setMappingDirty] = useState(false)
  const [correctionsDirty, setCorrectionsDirty] = useState(false)
  const [fileSequence, setFileSequence] = useState(0)
  const [correctionNotice, setCorrectionNotice] = useState('')
  const source = useRef<{buffer: ArrayBuffer; name: string} | null>(null)
  const originalSource = useRef<ArrayBuffer | null>(null)
  const correctionHistory = useRef<{buffer: ArrayBuffer; sheet: string}[]>([])
  const requests = useRef(new Map<string, string>())
  const hours = new Intl.NumberFormat(intlLocale, {maximumFractionDigits: 2})
  const control = 'rounded-md border border-border bg-surface-input px-3 py-2'
  useEffect(() => {onBusy(busy); return () => onBusy(false)}, [busy, onBusy])

  async function preview(nextMapping = mapping, options: {preserveCompleted?: boolean; refreshExisting?: boolean} = {}) {
    if (!source.current) return
    const known = new Map(periods.map(item => [item.start, item.existing]))
    const completed = new Map(options.preserveCompleted !== false ? periods.filter(item => item.done).map(item => [item.start, item]) : [])
    setBusy(true); setError(''); setPeriods([])
    try {
      if (Object.keys(nextMapping).length && mappingDirty) {
        const consolidated = consolidateAttendanceCorrespondences(source.current.buffer, workers, nextMapping)
        source.current = {...source.current, buffer: consolidated.buffer}
      }
      const parsed = readFarmAttendanceBatch(source.current.buffer, source.current.name, workers, nextMapping, {domain, farm})
      const next: Preview[] = []
      for (const period of parsed) {
        const cached = known.get(period.start)
        const existing = options.refreshExisting === false && cached ? cached : await readAttendance(domain, farm, period.start)
        let replacements = 0
        try {
          const merged = mergeAttendanceRows(existing.rows, period.rows)
          period.rows = merged.rows
          period.warnings = merged.rows.filter(attendanceNeedsReview).flatMap(row => {
            const messages = attendanceHourWarnings(row)
            return (messages.length ? messages : ['Valeurs corrigées : résolution à confirmer.']).map(message => ({message, worker: workers.find(worker => worker.id === row.worker_id)?.last_name || row.worker_id, date: row.work_date, sources: row.source_references || []}))
          })
          replacements = merged.replacements
        } catch (reason) {period.issues.push((reason as Error).message)}
        const previous = completed.get(period.start)
        const done = !!previous && existing.period?.revision === previous.existing.period?.revision
        next.push({...period, existing, replacements, selected: !done && !period.empty && !period.issues.length && existing.period?.status !== 'validated', result: done ? previous.result : '', done})
      }
      setPeriods(next)
      setMappingDirty(false)
    } catch (reason) {setError((reason as Error).message)} finally {setBusy(false)}
  }

  async function applyCorrections(buffer: ArrayBuffer, sheet: string, remember = true) {
    if (!source.current) return
    if (remember) correctionHistory.current.push({buffer: source.current.buffer, sheet})
    source.current = {...source.current, buffer}
    setCorrectionNotice(t('Corrections appliquées à l’aperçu. Enregistrez les quinzaines pour les conserver.'))
    await preview(mapping, {refreshExisting: false})
  }

  async function persist(action: 'save' | 'validate', targetStart?: string) {
    const selected = periods.filter(period => (targetStart ? period.start === targetStart : period.selected) && !period.empty && !period.done && !period.issues.length && period.existing.period?.status !== 'validated')
    if (!selected.length || mappingDirty || correctionsDirty || !beforeOpen()) return
    if (!window.confirm(t(targetStart ? 'Enregistrer cette quinzaine en brouillon pour contrôler ses anomalies ?' : 'Enregistrer les quinzaines sélectionnées ? Les valeurs déjà saisies peuvent être remplacées.'))) return
    setBusy(true); setError('')
    let saved = false
    try {
      for (const period of selected) {
        try {
          const merged = mergeAttendanceRows(period.existing.rows, period.rows).rows
          const rows = zeros ? merged.map(row => ({...row, normal_hours: row.normal_hours ?? 0, overtime_hours: row.overtime_hours ?? 0})) : merged
          if (action === 'validate' && rows.some(attendanceNeedsReview)) throw new Error(t('Enregistrez cette quinzaine en brouillon puis contrôlez ses anomalies avant validation et paie.'))
          if (action === 'validate' && attendanceTotals(rows).missing) throw new Error(t('Complétez les heures manquantes ou confirmez les cellules vides à zéro.'))
          const signature = JSON.stringify([period.start, period.existing.period?.revision || 0, rows, action])
          if (!requests.current.has(signature)) requests.current.set(signature, crypto.randomUUID())
          const result = await saveAttendance({domain, farm, start: period.start, end: period.end, revision: period.existing.period?.revision || 0, rows, action, request: requests.current.get(signature)!})
          setPeriods(current => current.map(item => item.start === period.start ? {...item, rows, existing: {period: result, rows}, done: true, selected: false, result: t(action === 'validate' ? 'Validée' : 'Brouillon enregistré')} : item))
          saved = true
        } catch (reason) {
          setPeriods(current => current.map(item => item.start === period.start ? {...item, result: (reason as Error).message || String(reason)} : item))
        }
      }
    } finally {setBusy(false); if (saved) onSaved()}
    return saved
  }

  const names = [...new Set(periods.flatMap(period => period.names))]
  const lastCorrection = correctionHistory.current.at(-1)
  const undoLocked = periods.some(item => item.sheet === lastCorrection?.sheet && (item.done || item.existing.period?.status === 'validated'))
  return <Card className="space-y-4">
    <Button variant="secondary" disabled={blocked || busy || !canWrite} onClick={() => {if (beforeOpen()) setOpen(value => !value)}}>{t('Importer plusieurs quinzaines')}</Button>
    {open && <>
      <p>{t('Chargez le modèle ItriX rempli. Les quinzaines du classeur seront contrôlées ensemble.')}</p>
      <p className="text-body-sm">{t('N = heures normales · S = heures supplémentaires · 8 h = 1 jour. Les tarifs, avances et paiements seront traités dans la paie.')}</p>
      <input type="file" accept=".xlsx" disabled={blocked || busy} aria-label={t('Classeur de plusieurs quinzaines')} onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ''
        if (!file) return
        if (correctionsDirty && !window.confirm(t('Abandonner les modifications non appliquées ?'))) return
        setError(''); setPeriods([]); setMapping({}); setZeros(false)
        setCorrectionNotice(''); correctionHistory.current = []; setFileSequence(value => value + 1)
        if (file.size > 10 * 1024 * 1024) {setError(t('Le fichier dépasse 10 Mo.')); return}
        setBusy(true)
        try {const buffer = await file.arrayBuffer(); originalSource.current = buffer; source.current = {buffer, name: file.name}; await preview({}, {preserveCompleted: false})} catch (reason) {setError((reason as Error).message)}
        finally {setBusy(false)}
      }}/>
      {source.current && <p>{source.current.name}</p>}
      {error && <p role="alert" className="rounded border border-danger/30 bg-danger/10 p-3 text-danger">{t(error)}</p>}
      {busy && <p role="status">{t('Chargement…')}</p>}
      {correctionNotice && <p role="status" className="rounded border border-success/30 bg-success/10 p-3 text-success">{correctionNotice}</p>}
      {!!periods.length && <p className="text-body-sm text-success">{t('Les codes ItriX et les noms exacts sont reconnus automatiquement.')}</p>}
      {!!names.length && <details><summary>{t('Employés à identifier')} ({names.length})</summary><div className="grid gap-3 pt-3 md:grid-cols-2">
        {names.map(name => <label key={name}>{name}<select aria-label={name} className={`${control} block w-full`} disabled={busy || periods.some(item => item.done)} value={mapping[name] || ''} onChange={event => {setMapping(current => ({...current, [name]: event.target.value})); setMappingDirty(true)}}>
          <option value="">{t('Choisissez l’employé correspondant')}</option>{workers.map(worker => <option key={worker.id} value={worker.id}>{worker.last_name} {worker.first_name}</option>)}
        </select></label>)}
      </div></details>}
      {source.current && <>
        <p className="rounded border border-border bg-surface-input p-3">{t('Pour corriger dans Excel, téléchargez le fichier corrigé, consultez Controle_Pointage et Mode_correction, modifiez les onglets de pointage puis rechargez le classeur ici. Les anomalies seront recalculées.')}</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={blocked || busy || correctionsDirty} onClick={() => void preview()}>{t(mappingDirty ? 'Appliquer les correspondances et consolider' : 'Actualiser l’aperçu')}</Button>
          <Button variant="secondary" disabled={blocked || busy || correctionsDirty} onClick={async () => {
            if (!source.current || !originalSource.current) return
            setBusy(true); setError('')
            try {
              const buffer = exportAttendanceCorrections(source.current.buffer, workers, mapping)
              const styled = await preserveAttendanceWorkbookLayout(originalSource.current, buffer)
              downloadBlob(new Blob([styled], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), source.current.name.replace(/\.xlsx$/i, '') + '_corrige.xlsx')
            } catch (reason) {setError((reason as Error).message)}
            finally {setBusy(false)}
          }}>{t('Télécharger le fichier corrigé')}</Button>
          {!!correctionHistory.current.length && <Button variant="ghost" disabled={blocked || busy || correctionsDirty || undoLocked} onClick={() => {
            const snapshot = correctionHistory.current.at(-1)
            if (!snapshot || !source.current) return
            try {
              const buffer = restoreAttendanceCorrectionSheet(source.current.buffer, snapshot.buffer, snapshot.sheet)
              correctionHistory.current.pop()
              void applyCorrections(buffer, snapshot.sheet, false)
            } catch (reason) {setError((reason as Error).message)}
          }}>{t('Annuler la dernière correction')}</Button>}
        </div>
        <AttendanceCorrections key={fileSequence} focusRequest={focusRequest} buffer={source.current.buffer} workers={workers} mapping={mapping}
          locked={periods.filter(item => item.done || item.existing.period?.status === 'validated').map(item => item.start)}
          disabled={blocked || busy || !canWrite} onApply={applyCorrections} onDirty={setCorrectionsDirty}/>
      </>}
      {!!periods.length && <>
        <div className="overflow-auto"><FilterableTable className="w-full text-body-sm"><thead><tr>{['Choisir', 'Quinzaine', 'Employés', 'Heures normales', 'Heures supplémentaires', 'Cellules vides', 'Valeurs remplacées', 'Statut', 'Résultat'].map(label => <th key={label} className="p-2 text-start">{t(label)}</th>)}</tr></thead><tbody>
          {periods.map(period => {const totals = attendanceTotals(period.rows); return <tr key={`${period.sheet}:${period.start}`}>
            <td className="p-2"><input type="checkbox" aria-label={`${t('Choisir')} ${period.start}`} checked={period.selected} disabled={busy || period.done || !!period.empty || !!period.issues.length || period.existing.period?.status === 'validated'} onChange={event => setPeriods(current => current.map(item => item.start === period.start ? {...item, selected: event.target.checked} : item))}/></td>
            <td className="p-2">{period.start} — {period.end}</td><td className="p-2">{new Set(period.rows.map(row => row.worker_id)).size}</td><td className="p-2">{hours.format(totals.normal)}</td><td className="p-2">{hours.format(totals.overtime)}</td><td className="p-2">{totals.missing}</td><td className="p-2">{period.replacements}</td>
            <td className="p-2">{t(period.existing.period?.status === 'validated' ? 'Validée' : period.existing.period ? 'Brouillon' : 'À créer')}</td>
            <td className={`p-2 ${period.empty ? 'text-fg-muted' : period.issues.length || (period.result && !period.done) ? 'text-danger' : 'text-success'}`}>{period.empty ? t('Ignorée — aucune heure renseignée') : period.result || (period.issues.length ? `${period.issues.length} · ${t('À corriger')}` : t('Prêt'))}</td>
          </tr>})}
        </tbody></FilterableTable></div>
        {periods.some(period => period.empty) && <p role="status" className="rounded border border-border bg-surface-input p-3 text-fg-muted">{t('Les quinzaines sans heures renseignées sont ignorées. Elles ne bloquent pas les autres périodes et aucun pointage à zéro n’est créé.')}</p>}
        {periods.filter(period => period.issues.length).map(period => <details key={period.sheet} className="rounded border border-danger/30 bg-danger/10 p-3 text-danger"><summary>{period.sheet} · {period.issues.length} · {t('À corriger')}</summary><ul className="list-disc ps-5">{period.issues.map((issue, index) => <li key={index}>{issue.split(' · ').map(part => t(part)).join(' · ')}{period.issueDetails?.[index] && period.issueDetails[index].location.sheet === period.sheet && <button type="button" className="ms-2 underline" disabled={busy || correctionsDirty} onClick={() => setFocusRequest({...period.issueDetails![index].location, token: Date.now()})}>{t('Ligne')} {period.issueDetails[index].location.row} · {attendanceCellAddress(period.issueDetails[index].location.row, period.issueDetails[index].location.column)}</button>}</li>)}</ul></details>)}
        {periods.filter(period => period.warnings?.length).map(period => <details key={`warnings:${period.sheet}`} open className="rounded border border-warning/30 bg-warning/10 p-3 text-warning"><summary>{period.sheet} · {t('À contrôler')} · {period.warnings!.length}</summary><p>{t('Import accepté en brouillon. Ces anomalies doivent être contrôlées avant validation et paie.')}</p>{period.warnings!.map((warning,index)=><p key={index}>{warning.worker} · {warning.date} · {t(warning.message)} · {warning.sources.join(' · ')}</p>)}<div className="mt-3"><Button disabled={blocked || busy || mappingDirty || correctionsDirty || !!period.issues.length || (!period.done && period.existing.period?.status !== 'validated' && !canWrite)} onClick={async () => {if (period.done || period.existing.period?.status === 'validated' || await persist('save', period.start)) onReview(period.start)}}>{t(period.done ? 'Contrôler les anomalies' : period.existing.period?.status === 'validated' ? 'Ouvrir le pointage validé' : 'Enregistrer puis contrôler les anomalies')}</Button></div></details>)}
        <label className="flex items-center gap-2"><input type="checkbox" checked={zeros} disabled={busy || periods.some(item => item.done)} onChange={event => setZeros(event.target.checked)}/>{t('Je confirme que les cellules vides correspondent à zéro heure.')}</label>
        <div className="flex flex-wrap gap-3"><Button disabled={blocked || busy || mappingDirty || correctionsDirty || !canWrite || !periods.some(item => item.selected && !item.done)} onClick={() => void persist('save')}>{t('Enregistrer les quinzaines en brouillon')}</Button><Button disabled={blocked || busy || mappingDirty || correctionsDirty || !canValidate || !periods.some(item => item.selected && !item.done)} onClick={() => void persist('validate')}>{t('Valider les quinzaines sélectionnées')}</Button></div>
        <p className="text-body-sm">{t('Chaque quinzaine est enregistrée séparément. En cas d’erreur, les périodes réussies restent enregistrées et seules les autres sont à reprendre.')}</p>
      </>}
    </>}
  </Card>
}
