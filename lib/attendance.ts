export type AttendanceRow = {
  worker_id: string
  work_date: string
  normal_hours: number | null
  overtime_hours: number | null
  entry_source: 'manual' | 'excel'
  source_filename: string | null
  worker_name_snapshot?: string
  worker_code_snapshot?: string
}
export type AttendancePeriod = {
  id: string; domain_id: string; farm_id: string; start_date: string; end_date: string
  status: 'draft' | 'validated'; revision: number; validated_at: string | null
}
export type AttendanceWorker = {
  id: string; farm_id: string | null; first_name: string; last_name: string
  matricule: string | null; is_active: boolean
}

export function attendanceDays(year: number, month: number, half: 'first' | 'second'): string[] {
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Période invalide')
  const first = half === 'first' ? 1 : 16
  const last = half === 'first' ? 15 : new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Array.from({length: last - first + 1}, (_, index) => `${year}-${String(month).padStart(2, '0')}-${String(first + index).padStart(2, '0')}`)
}

export function attendanceKey(worker: string, date: string) { return `${worker}:${date}` }

export function parseAttendanceHours(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null
  const result = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(result) || result < 0 || result > 24 || Math.abs(result * 100 - Math.round(result * 100)) > .00001) {
    throw new Error('Renseignez entre 0 et 24 heures, avec deux décimales au maximum.')
  }
  return result
}

export function attendanceTotals(rows: AttendanceRow[]) {
  return rows.reduce((total, row) => ({
    normal: total.normal + (row.normal_hours ?? 0),
    overtime: total.overtime + (row.overtime_hours ?? 0),
    missing: total.missing + Number(row.normal_hours == null) + Number(row.overtime_hours == null),
  }), {normal: 0, overtime: 0, missing: 0})
}

export function attendanceCompleteRows(workers: string[], days: string[], existing: AttendanceRow[]): AttendanceRow[] {
  const known = new Map(existing.map(row => [attendanceKey(row.worker_id, row.work_date), row]))
  return workers.flatMap(worker => days.map(date => known.get(attendanceKey(worker, date)) || {
    worker_id: worker, work_date: date, normal_hours: null, overtime_hours: null,
    entry_source: 'manual' as const, source_filename: null,
  }))
}

// Blank imported cells preserve existing values. Explicit zero replaces a value.
export function mergeAttendanceRows(existing: AttendanceRow[], incoming: AttendanceRow[]) {
  const merged = new Map(existing.map(row => [attendanceKey(row.worker_id, row.work_date), row]))
  let replacements = 0
  for (const row of incoming) {
    const key = attendanceKey(row.worker_id, row.work_date)
    const previous = merged.get(key)
    if (!previous) {
      if ((row.normal_hours ?? 0) + (row.overtime_hours ?? 0) > 24) throw new Error('Le total N + S dépasse 24 heures sur une journée.')
      merged.set(key, row)
      continue
    }
    for (const field of ['normal_hours', 'overtime_hours'] as const) {
      if (row[field] != null && previous[field] != null && previous[field] !== row[field]) replacements++
    }
    const next = {...previous,
      normal_hours: row.normal_hours ?? previous.normal_hours,
      overtime_hours: row.overtime_hours ?? previous.overtime_hours,
    }
    if (row.normal_hours != null || row.overtime_hours != null) {
      next.entry_source = 'excel'; next.source_filename = row.source_filename
    }
    if ((next.normal_hours ?? 0) + (next.overtime_hours ?? 0) > 24) throw new Error('Le total N + S dépasse 24 heures sur une journée.')
    merged.set(key, next)
  }
  return {rows: [...merged.values()], replacements}
}

export function attendanceDayEquivalent(hours: number) {
  const days = Math.floor((hours + .00000001) / 8)
  const remainder = Math.round((hours - days * 8) * 100) / 100
  return {days, hours: remainder}
}
