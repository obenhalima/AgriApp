'use client'

import {useEffect, useMemo, useRef, useState} from 'react'
import {Button} from '@/components/ui/Button'
import {FilterableTable} from '@/components/ui/FilterableTable'
import {useLanguage} from '@/lib/i18n'
import {AttendanceValidationError, attendanceCellAddress, type AttendanceIssueLocation} from '@/lib/attendanceValidation'
import type {AttendanceWorker} from '@/lib/attendance'
import {applyAttendanceAllocations, removeUnnamedAttendanceRow, applyAttendanceEdits, inspectAttendanceCorrections, mergeAttendanceDuplicates, type AttendanceCellEdit} from '@/lib/attendanceCorrections'

export default function AttendanceCorrections({buffer, workers, mapping, locked, disabled, onApply, onDirty, focusRequest}: {
  focusRequest?: AttendanceIssueLocation & {token: number}
  buffer: ArrayBuffer; workers: AttendanceWorker[]; mapping: Record<string, string>
  locked: string[]; disabled: boolean; onApply: (buffer: ArrayBuffer, sheet: string) => Promise<void>; onDirty: (dirty: boolean) => void
}) {
  const {t, intlLocale} = useLanguage()
  const dateFormat = new Intl.DateTimeFormat(intlLocale, {day: '2-digit', month: '2-digit', timeZone: 'UTC'})
  const inspection = useMemo(() => {
    try {return {periods: inspectAttendanceCorrections(buffer, workers, mapping), error: ''}}
    catch (reason) {return {periods: [], error: (reason as Error).message}}
  }, [buffer, workers, mapping])
  const root = useRef<HTMLElement>(null)
  const [target, setTarget] = useState<AttendanceIssueLocation | null>(null)
  const [errorLocation, setErrorLocation] = useState<AttendanceIssueLocation | null>(null)
  function jump(location: AttendanceIssueLocation) {setOpen(true); setSheetName(location.sheet); setOnlyIssues(false); setSearch(''); setTarget({...location})}
  const [open, setOpen] = useState(false)
  const [sheetName, setSheetName] = useState('')
  const [onlyIssues, setOnlyIssues] = useState(true)
  const [search, setSearch] = useState('')
  const [edits, setEdits] = useState<Record<string, AttendanceCellEdit>>({})
  const [allocations, setAllocations] = useState<Record<number, {date: string; amount: string}>>({})
  const dirty = Object.keys(edits).length > 0 || Object.values(allocations).some(item => !!item.date || !!item.amount)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {if (focusRequest) jump(focusRequest)}, [focusRequest])
  useEffect(() => {
    if (!target || !open) return
    const field = root.current?.querySelector<HTMLElement>(`[data-attendance-row="${target.row}"][data-attendance-column="${target.column}"]`)
    field?.scrollIntoView({block: 'center', inline: 'center'}); field?.focus({preventScroll: true})
  }, [target, open])
  const periods = inspection.periods
  const period = periods.find(item => item.sheet === sheetName) || periods.find(item => !locked.includes(item.start) && item.rows.some(row => row.issues.length) && item.rows.some(row => [...row.hours, ...row.undated].some(value => value != null && String(value).trim() !== ''))) || periods[0]
  const readOnly = disabled || busy || !period || locked.includes(period.start)
  const control = 'rounded-md border border-border bg-surface-input px-2 py-2 text-body-sm disabled:opacity-50'
  useEffect(() => {setEdits({}); setAllocations({})}, [buffer])
  useEffect(() => {onDirty(dirty); return () => onDirty(false)}, [dirty, onDirty])

  function change(row: number, column: number, value: string) {
    setEdits(current => ({...current, [`${row}:${column}`]: {row, column, value}}))
  }
  function current(row: number, column: number, original: unknown) {
    return edits[`${row}:${column}`]?.value ?? (original == null ? '' : String(original))
  }
  function selectedWorker(row: {row: number; nameRow: number; workerId: string}) {
    if (!period) return ''
    const editedCode = edits[`${row.row}:0`]?.value
    if (period.native && editedCode) return workers.find(worker => period.workerCodes[worker.id] === editedCode)?.id || ''
    const editedName = edits[`${row.nameRow}:1`]?.value
    if (!period.native && editedName) return workers.find(worker => `${worker.last_name} ${worker.first_name}`.trim() === editedName)?.id || ''
    return row.workerId
  }
  async function apply(operation?: (edited: ArrayBuffer) => ArrayBuffer) {
    if (readOnly || !period) return
    setBusy(true); setError(''); setErrorLocation(null)
    try {
      let edited = applyAttendanceEdits(buffer, period.sheet, Object.values(edits), workers, mapping)
      edited = applyAttendanceAllocations(edited, period.sheet, allocations, workers, mapping)
      await onApply(operation ? operation(edited) : edited, period.sheet)
      setEdits({}); setAllocations({})
    } catch (reason) {setError((reason as Error).message || String(reason)); if (reason instanceof AttendanceValidationError) setErrorLocation(reason.location)}
    finally {setBusy(false)}
  }

  if (!periods.length) return inspection.error ? <p className="text-danger">{t(inspection.error)}</p> : null
  const visible = period.rows.filter(row => (!onlyIssues || row.issues.length) && `${row.name} ${row.row}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const duplicate = period.rows.some(row => row.duplicate)
  const emptyPeriod = !!period.rows.length && period.rows.every(row => row.issues.includes('Heures à renseigner.'))
  return <section ref={root} className="rounded-lg border border-border p-3 space-y-3">
    <Button variant="secondary" disabled={disabled || busy} onClick={() => {if (!open && !sheetName && period) setSheetName(period.sheet); setOpen(value => !value)}}>{t('Corriger les anomalies dans l’application')}</Button>
    {open && <>
      <div className="flex flex-wrap items-end gap-3">
        <label>{t('Quinzaine à corriger')}<select aria-label={t('Quinzaine à corriger')} className={`${control} block`} value={period.sheet} disabled={disabled || busy} onChange={event => {
          if (dirty && !window.confirm(t('Abandonner les modifications non appliquées ?'))) return
          setSheetName(event.target.value); setEdits({}); setAllocations({}); setError('')
        }}>{periods.map(item => <option key={item.sheet} value={item.sheet}>{item.start} — {item.end}{locked.includes(item.start) ? ` · ${t('Lecture seule')}` : ''}</option>)}</select></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={onlyIssues} onChange={event => setOnlyIssues(event.target.checked)}/>{t('Afficher uniquement les lignes à corriger')}</label>
        <input aria-label={t('Rechercher un employé ou une ligne')} placeholder={t('Rechercher un employé ou une ligne')} className={control} value={search} onChange={event => setSearch(event.target.value)}/>
        <Button disabled={readOnly || !dirty} onClick={() => void apply()}>{t('Appliquer les corrections')}</Button>
        {dirty && <Button variant="ghost" disabled={readOnly} onClick={() => {setEdits({}); setAllocations({})}}>{t('Annuler la saisie')}</Button>}
        {duplicate && period.native && <Button variant="secondary" disabled={readOnly} onClick={() => void apply(edited => mergeAttendanceDuplicates(edited, period.sheet, workers, mapping))}>{t('Additionner les lignes en double')}</Button>}
      </div>
      <p className="text-body-sm">{t('Les cellules vides restent inconnues. Corrigez les heures ou le type N/S, puis appliquez les corrections pour relancer les contrôles.')}</p><p className="text-body-sm text-fg-muted">{t('Une date sans quantité affecte tout le solde sans date. Appliquer les corrections enregistre aussi les affectations dans l’aperçu.')}</p>
      {duplicate && period.native && <div className="rounded border border-warning/30 bg-warning/10 p-3 text-warning">
        {period.rows.filter(row => row.duplicate).map(row => <p key={row.row}><button type="button" className="underline" onClick={() => jump({sheet: period.sheet, row: row.row, column: 2})}>{row.name} · {row.type} · {t('Ligne')} {row.row} · {attendanceCellAddress(row.row, 2)}</button></p>)}
        <p className="mt-2 text-body-sm">{t('La fusion additionne les heures du même employé et du même type N/S. Choisissez un autre employé si les lignes concernent deux personnes différentes.')}</p>
      </div>}
      {emptyPeriod && <p className="rounded border border-border bg-surface-input p-3 text-fg-muted">{t('Quinzaine sans heures : ignorée à l’import tant que vous ne la complétez pas.')}</p>}
      {locked.includes(period.start) && <p className="rounded bg-warning/10 p-3 text-warning">{t('Cette quinzaine est déjà enregistrée. Ouvrez son pointage pour la modifier.')}</p>}
      {error && <p role="alert" className="rounded border border-danger/30 bg-danger/10 p-3 text-danger">{t(error)}{errorLocation && <button type="button" className="ms-2 underline" onClick={() => jump(errorLocation)}>{t('Ligne')} {errorLocation.row} · {attendanceCellAddress(errorLocation.row, errorLocation.column)}</button>}</p>}
      <div className="max-h-[65vh] overflow-auto rounded border border-border">
        <FilterableTable className="w-full text-body-sm"><thead className="sticky top-0 z-10 bg-surface-input"><tr>
          <th className="sticky start-0 z-20 w-[250px] min-w-[250px] max-w-[250px] bg-surface-input p-2 text-start">{t('Employé et ligne')}</th><th className="sticky start-[250px] z-20 min-w-[80px] bg-surface-input p-2">N / S</th>
          {period.days.map(day => <th key={day.date} className="p-2 min-w-[90px]">{dateFormat.format(new Date(`${day.date}T12:00:00Z`))}</th>)}
          {!!period.undatedColumns.length && <th className="p-2 min-w-[290px]">{t('Heures sans date')}</th>}
          <th className="p-2 min-w-[230px] text-start">{t('Points à corriger')}</th>
        </tr></thead><tbody>{visible.map(row => <tr key={row.row} className="border-t border-border">
          <td data-filter-value={row.name || t('Nom manquant')} className="sticky start-0 z-10 w-[250px] min-w-[250px] max-w-[250px] bg-surface-raised p-2 align-top"><span className="block break-words font-medium">{row.name || t('Nom manquant')}</span><span className="block text-fg-muted">{t('Ligne')} {row.row}</span>
            {!row.workerId && <Button variant="ghost" disabled={readOnly} onClick={() => {if (window.confirm(`${t('Supprimer la ligne sans employé')} ${row.row} · ${row.name || t('Nom manquant')} ? ${t('Les heures de cette ligne seront retirées du fichier à importer.')}`)) void apply(edited => removeUnnamedAttendanceRow(edited, period.sheet, row.row, workers, mapping))}}>{t('Supprimer la ligne sans employé')}</Button>}
            {(!row.workerId || row.duplicate) && <select data-attendance-row={row.row} data-attendance-column={period.native ? 0 : 1} aria-label={`${period.sheet} · ${row.row} · ${t('Employé')}`} className={`${control} mt-2 w-full`} disabled={readOnly} value={selectedWorker(row)} onChange={event => {
              const worker = workers.find(item => item.id === event.target.value)
              if (!worker) return
              if (period.native) change(row.row, 0, period.workerCodes[worker.id])
              change(period.native ? row.row : row.nameRow, 1, `${worker.last_name} ${worker.first_name}`.trim())
            }}><option value="">{t('Choisissez l’employé correspondant')}</option>{workers.map(worker => <option key={worker.id} value={worker.id}>{worker.last_name} {worker.first_name}</option>)}</select>}
          </td>
          <td className="sticky start-[250px] z-10 bg-surface-raised p-2 align-top"><select data-attendance-row={row.row} data-attendance-column={2} aria-label={`${period.sheet} · ${row.row} · N/S`} className={control} disabled={readOnly} value={current(row.row, 2, row.type)} onChange={event => change(row.row, 2, event.target.value)}>
            {!['N', 'S'].includes(row.type) && <option value={row.type}>{row.type || t('À corriger')}</option>}<option value="N">N</option><option value="S">S</option>
          </select></td>
          {period.days.map((day, index) => <td key={day.date} className="p-2 align-top"><input data-attendance-row={row.row} data-attendance-column={day.column} aria-label={`${period.sheet} · ${row.row} · ${day.date}`} inputMode="decimal" className={`${control} w-20`} disabled={readOnly} value={current(row.row, day.column, row.hours[index])} onChange={event => change(row.row, day.column, event.target.value)}/></td>)}
          {!!period.undatedColumns.length && <td className="p-2 align-top space-y-2">
            {period.undatedColumns.map((column, index) => <input key={column} data-attendance-row={row.row} data-attendance-column={column} aria-label={`${period.sheet} · ${row.row} · ${t('Sans date')}`} inputMode="decimal" className={`${control} w-24`} disabled={readOnly} value={current(row.row, column, row.undated[index])} onChange={event => change(row.row, column, event.target.value)}/>)}
            {period.undatedColumns.length === 1 && Number(String(current(row.row, period.undatedColumns[0], row.undated[0])).replace(',', '.')) > 0 && <div className="flex flex-wrap gap-2">
              <select aria-label={`${period.sheet} · ${row.row} · ${t('Date d’affectation')}`} className={control} disabled={readOnly} value={allocations[row.row]?.date || ''} onChange={event => setAllocations(previous => ({...previous, [row.row]: {date: event.target.value, amount: previous[row.row]?.amount || ''}}))}>
                <option value="">{t('Choisissez une date')}</option>{period.days.map(day => <option key={day.date} value={day.date}>{day.date}</option>)}
              </select>
              <input aria-label={`${period.sheet} · ${row.row} · ${t('Heures à affecter')}`} placeholder={t('Heures à affecter')} inputMode="decimal" className={`${control} w-24`} disabled={readOnly} value={allocations[row.row]?.amount ?? ''} onChange={event => setAllocations(previous => ({...previous, [row.row]: {date: previous[row.row]?.date || '', amount: event.target.value}}))}/>
              <Button variant="secondary" disabled={readOnly || !allocations[row.row]?.date} onClick={() => void apply()}>{t('Affecter les heures')}</Button>
            </div>}
          </td>}
          <td className={`p-2 align-top ${emptyPeriod ? 'text-fg-muted' : 'text-danger'}`}>{row.problems.map((problem, index) => <p key={index}><button type="button" className="text-start underline" onClick={() => jump(problem.location)}>{attendanceCellAddress(problem.location.row, problem.location.column)} · {problem.message.split(' · ').map(part => t(part)).join(' · ')}</button></p>)}</td>
        </tr>)}</tbody></FilterableTable>
      </div>
      {!visible.length && <p role="status" className="text-success">{t('Aucune ligne à corriger pour ce filtre.')}</p>}
    </>}
  </section>
}
