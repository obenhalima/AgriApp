import * as XLSX from 'xlsx'
import {sumAttendanceHours, attendanceHourWarnings, attendanceDays, attendanceKey, parseAttendanceHours, type AttendanceRow, type AttendanceWorker} from './attendance'
import {readAttendanceWorkbook} from './attendanceWorkbook'
import {AttendanceValidationError, attendanceCellAddress, type AttendanceIssueLocation} from './attendanceValidation'

export type AttendanceBatchPeriod = {sheet: string; start: string; end: string; rows: AttendanceRow[]; issues: string[]; names: string[]; empty?: boolean; warnings?: {message: string; worker: string; date: string; sources: string[]}[]; issueDetails?: Record<number, {message: string; location: AttendanceIssueLocation}>}
export const attendanceName = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()

// The farm workbook contains financial columns after S. Only dated D:S cells are attendance.
export function readFarmAttendanceBatch(buffer: ArrayBuffer, filename: string, workers: AttendanceWorker[], mapping: Record<string, string> = {}, binding?: {domain: string; farm: string}): AttendanceBatchPeriod[] {
  const book = XLSX.read(buffer, {type: 'array'})
  if (book.Sheets._Contexte?.B2?.v === 'attendance-multi-1') return withWarnings(readItriXBatch(book, filename, workers, mapping, binding), workers)
  const periods: AttendanceBatchPeriod[] = []
  const known = new Map<string, string[]>()
  for (const worker of workers) {
    const name = attendanceName(`${worker.last_name} ${worker.first_name}`)
    known.set(name, [...(known.get(name) || []), worker.id])
  }
  for (const sheetName of book.SheetNames) {
    const sheet = book.Sheets[sheetName]
    const title = String(sheet.C2?.v || '')
    const dates = [...title.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)]
    if (!/quinzaine/i.test(title) || dates.length !== 2) continue
    const [, day, month, year] = dates[0].map(Number)
    const days = attendanceDays(year, month, day === 1 ? 'first' : 'second')
    const end = `${dates[1][3]}-${dates[1][2].padStart(2, '0')}-${dates[1][1].padStart(2, '0')}`
    const period: AttendanceBatchPeriod = {sheet: sheetName, start: days[0], end, rows: [], issues: [], names: []}
    periods.push(period)
    if (![1, 16].includes(day) || end !== days.at(-1) || periods.filter(item => item.start === period.start).length > 1) period.issues.push('Période invalide ou en double.')
    const tabDate = sheetName.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
    if (tabDate && `${tabDate[3]}-${tabDate[2]}-${tabDate[1]}` !== period.start) period.issues.push('La date de l’onglet diffère de la période en C2.')
    const columns = new Map<number, string>()
    for (let column = 3; column <= 18; column++) {
      const header = sheet[XLSX.utils.encode_cell({r: 5, c: column})]?.v
      const date = days.find(value => Number(value.slice(-2)) === Number(header))
      if (date && ![...columns.values()].includes(date)) columns.set(column, date)
    }
    if (columns.size !== days.length) period.issues.push('Dates quotidiennes manquantes ou en double dans la ligne 6.')
    const rows = new Map<string, AttendanceRow>()
    const pairs = new Set<string>()
    const last = XLSX.utils.decode_range(sheet['!ref'] || 'A1').e.r
    for (let rowIndex = 9; rowIndex <= last; rowIndex++) {
      const type = String(sheet[`C${rowIndex + 1}`]?.v ?? '').trim().toUpperCase()
      const nextType = String(sheet[`C${rowIndex + 2}`]?.v ?? '').trim().toUpperCase()
      if (!['N', 'S'].includes(type) && nextType !== 'S') continue
      let name = String(sheet[`B${rowIndex + 1}`]?.v || '').trim()
      if (type === 'S' && !name) name = String(sheet[`B${rowIndex}`]?.v || '').trim()
      const values = Array.from({length: 16}, (_, index) => sheet[XLSX.utils.encode_cell({r: rowIndex, c: index + 3})])
      if (!values.some(cell => cell?.v != null && String(cell.v).trim() !== '')) continue
      const candidates = known.get(attendanceName(name)) || []
      const worker = mapping[name] || (candidates.length === 1 ? candidates[0] : '')
      if (name && !workers.some(item => item.id === worker) && !period.names.includes(name)) period.names.push(name)
      const issue = (message: string, column = 2) => {
        period.issueDetails ||= {}
        period.issueDetails[period.issues.length] = {message, location: {sheet: sheetName, row: rowIndex + 1, column, employee: name}}
        period.issues.push(`${sheetName} · ligne ${rowIndex + 1} · ${attendanceCellAddress(rowIndex + 1, column)} · ${name || 'Nom manquant'} · ${message}`)
      }
      if (!name) issue('Nom manquant.', 1)
      if (!worker || !workers.some(item => item.id === worker)) issue('Employé à associer.', 1)
      if (!['N', 'S'].includes(type)) issue('Type N/S invalide.')
      const pair = `${worker}:${type}`
      const duplicate = worker && pairs.has(pair)
      pairs.add(pair)
      for (let index = 0; index < values.length; index++) {
        const cell = values[index], address = XLSX.utils.encode_cell({r: rowIndex, c: index + 3})
        try {
          if (cell?.t === 'e' || (cell?.f && cell.v == null)) throw new Error('Formule sans résultat exploitable.')
          const value = parseAttendanceHours(cell?.v)
          const date = columns.get(index + 3)
          if (!date) {if (value != null && value !== 0) issue('Heures sans date à corriger dans le fichier.', index + 3); continue}
          if (!worker || !['N', 'S'].includes(type)) continue
          const key = attendanceKey(worker, date)
          const row = rows.get(key) || {worker_id: worker, work_date: date, normal_hours: null, overtime_hours: null, entry_source: 'excel' as const, source_filename: filename}
          if (type === 'N') row.normal_hours = duplicate && value != null ? sumAttendanceHours([row.normal_hours,value]) : (value ?? row.normal_hours)
          else row.overtime_hours = duplicate && value != null ? sumAttendanceHours([row.overtime_hours,value]) : (value ?? row.overtime_hours)
          row.source_references = [...new Set([...(row.source_references || []), `${sheetName}!${rowIndex + 1}`])]
          rows.set(key, row)
        } catch (error) {issue((error as Error).message, index + 3)}
      }
    }
    period.rows = [...rows.values()]
    period.empty = !period.rows.length && !period.issues.length
  }
  if (!periods.length) throw new Error('Aucun onglet QUINZAINE avec dates de début et de fin en C2.')
  for (const period of periods) {
    if (periods.filter(item => item.start === period.start).length > 1 && !period.issues.includes('Période invalide ou en double.')) period.issues.push('Période invalide ou en double.')
  }
  return withWarnings(periods.sort((a, b) => a.start.localeCompare(b.start)), workers)
}

function readItriXBatch(book: XLSX.WorkBook, filename: string, workers: AttendanceWorker[], mapping: Record<string, string>, binding?: {domain: string; farm: string}): AttendanceBatchPeriod[] {
  const metadata = book.Sheets._Contexte
  if (!binding || metadata.B3?.v !== binding.domain || metadata.B4?.v !== binding.farm) throw new Error('Le fichier appartient à un autre client ou une autre ferme.')
  if (!book.Sheets.Periodes || !book.Sheets.Ref_Employes) throw new Error('Le manifeste des périodes ou le référentiel des employés est manquant.')
  const manifest = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets.Periodes, {header: 1}).slice(1).filter(row => row.some(value => value != null && value !== ''))
  const periods: AttendanceBatchPeriod[] = []
  for (const entry of manifest) {
    const [name, start, end] = entry.map(String)
    const sheet = book.Sheets[name]
    const period: AttendanceBatchPeriod = {sheet: name, start, end, rows: [], issues: [], names: []}
    periods.push(period)
    try {
      const [year, month, day] = start.split('-').map(Number)
      const days = attendanceDays(year, month, day === 1 ? 'first' : 'second')
      if (![1, 16].includes(day) || days[0] !== start || days.at(-1) !== end || !sheet) throw new Error('Période invalide ou en double.')
      const headers = XLSX.utils.sheet_to_json<unknown[]>(sheet, {header: 1})[0] || []
      const undated = headers.indexOf('Heures sans date')
      const refs = structuredClone(book.Sheets.Ref_Employes)
      const refRows = XLSX.utils.sheet_to_json<unknown[]>(refs, {header: 1}).slice(1)
      const codeById = new Map(refRows.map(row => [String(row[1]), String(row[0])]))
      const idByCode = new Map(refRows.map(row => [String(row[0]), String(row[1])]))
      const workersById = new Map(workers.map(worker => [worker.id, worker]))
      const copy = structuredClone(sheet)
      const last = XLSX.utils.decode_range(sheet['!ref'] || 'A1').e.r
      for (let index = 1; index <= last; index++) {
        const name = String(sheet[`B${index + 1}`]?.v || '').trim()
        const code = String(sheet[`A${index + 1}`]?.v || '').trim()
        const identifiedByCode = workersById.get(idByCode.get(code) || '')
        const candidates = !code && name ? workers.filter(worker => attendanceName(`${worker.last_name} ${worker.first_name}`) === attendanceName(name)) : []
        const identifiedByName = candidates.length === 1 ? candidates[0] : undefined
        const needsMapping = !identifiedByCode && !identifiedByName
        // Exported IDs take precedence over optional name overrides.
        const worker = identifiedByName || (needsMapping ? workersById.get(mapping[name]) : undefined)
        if (name && needsMapping && !worker && !period.names.includes(name)) period.names.push(name)
        if (!identifiedByCode && worker) {
          if (!codeById.has(worker.id)) {
            const code = worker.matricule || worker.id
            XLSX.utils.sheet_add_aoa(refs, [[code, worker.id, `${worker.last_name} ${worker.first_name}`.trim()]], {origin: -1})
            codeById.set(worker.id, code)
          }
          copy[`A${index + 1}`] = {t: 's', v: codeById.get(worker.id)!}
        }
        if (undated >= 0) {
          const cell = sheet[XLSX.utils.encode_cell({r: index, c: undated})]
          if (cell?.v != null && String(cell.v).trim() !== '' && Number(cell.v) !== 0) {
            period.issueDetails ||= {}
            period.issueDetails[period.issues.length] = {message: 'Heures sans date à affecter.', location: {sheet: period.sheet, row: index + 1, column: undated, employee: name}}
            period.issues.push(`${index + 1} · ${name} · Heures sans date à corriger dans le fichier.`)
          }
        }
      }
      const single = XLSX.utils.book_new()
      const context = structuredClone(metadata)
      context.B2 = {t: 's', v: 'attendance-1'}; context.B5 = {t: 's', v: start}; context.B6 = {t: 's', v: end}
      context['!ref'] = 'A1:B6'
      XLSX.utils.book_append_sheet(single, copy, 'Pointage')
      XLSX.utils.book_append_sheet(single, refs, 'Ref_Employes')
      XLSX.utils.book_append_sheet(single, context, '_Contexte')
      period.rows = readAttendanceWorkbook(XLSX.write(single, {type: 'array', bookType: 'xlsx'}), filename, {...binding, domainCode: '', farmName: '', days, workers})
      period.empty = !period.rows.some(row => row.normal_hours != null || row.overtime_hours != null) && !period.issues.length
    } catch (reason) {
      if (reason instanceof AttendanceValidationError) {
        period.issueDetails ||= {}
        const location = {...reason.location, sheet: reason.location.sheet === 'Pointage' ? period.sheet : reason.location.sheet}
        period.issueDetails[period.issues.length] = {message: reason.reason, location}
      }
      period.issues.push((reason as Error).message)
    }
  }
  if (!periods.length) throw new Error('Aucune période dans le classeur.')
  for (const period of periods) if (periods.filter(item => item.start === period.start).length > 1 || periods.filter(item => item.sheet === period.sheet).length > 1) period.issues.push('Période invalide ou en double.')
  return withWarnings(periods.sort((a, b) => a.start.localeCompare(b.start)), workers)
}


function withWarnings(periods: AttendanceBatchPeriod[], workers: AttendanceWorker[]) {
  return periods.map(period => ({...period, warnings: period.rows.flatMap(row => attendanceHourWarnings(row).map(message => ({message, worker: workers.find(worker => worker.id === row.worker_id)?.last_name || row.worker_id, date: row.work_date, sources: row.source_references || []})))}))
}
