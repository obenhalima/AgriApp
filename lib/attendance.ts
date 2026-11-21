export type AttendanceRow = {
  worker_id: string
  work_date: string
  normal_hours: number | null
  overtime_hours: number | null
  entry_source: 'manual' | 'excel'
  source_filename: string | null
  source_references?: string[]
  needs_review?: boolean
  review_status?: 'pending' | 'confirmed' | 'resolved' | null
  review_reason?: string | null
  review_note?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  original_hours?: {normal_hours: number | null; overtime_hours: number | null}
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
  if (!Number.isFinite(result) || result < 0 || result > 99999999) {
    throw new Error('Renseignez un nombre d’heures positif ou nul et inférieur à 100 millions.')
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
      merged.set(key, row)
      continue
    }
    for (const field of ['normal_hours', 'overtime_hours'] as const) {
      if (row[field] != null && previous[field] != null && previous[field] !== row[field]) replacements++
    }
    const changed = (row.normal_hours != null && row.normal_hours !== previous.normal_hours) || (row.overtime_hours != null && row.overtime_hours !== previous.overtime_hours) || ((row.normal_hours != null || row.overtime_hours != null) && (row.source_filename !== previous.source_filename || JSON.stringify(row.source_references || []) !== JSON.stringify(previous.source_references || [])))
    const next = {...previous,
      needs_review: changed ? (previous.review_status ? true : undefined) : previous.needs_review,
      normal_hours: row.normal_hours ?? previous.normal_hours,
      overtime_hours: row.overtime_hours ?? previous.overtime_hours,
    }
    if (row.normal_hours != null || row.overtime_hours != null) {
      next.entry_source = 'excel'; next.source_filename = row.source_filename; next.source_references = row.source_references || previous.source_references
    }
    merged.set(key, next)
  }
  return {rows: [...merged.values()], replacements}
}

export function attendanceDayEquivalent(hours: number) {
  const days = Math.floor((hours + .00000001) / 8)
  const remainder = Math.round((hours - days * 8) * 100) / 100
  return {days, hours: remainder}
}


export const attendanceReviewReasons = ['duplicate', 'entry_error', 'advance', 'other'] as const
export const attendanceReviewLabels: Record<string, string> = {duplicate: 'Doublon', entry_error: 'Erreur de saisie', advance: 'Avance', other: 'Autre'}
export function attendanceHourWarnings(row: Pick<AttendanceRow, 'normal_hours' | 'overtime_hours'>): string[] {
  const warnings: string[] = []
  if ((row.normal_hours ?? 0) + (row.overtime_hours ?? 0) > 24) warnings.push('N + S dépasse 24 heures sur une journée.')
  if ([row.normal_hours, row.overtime_hours].some(value => value != null && Math.abs(value * 100 - Math.round(value * 100)) > .00001)) warnings.push('Plus de deux décimales : valeur d’origine conservée, précision à contrôler.')
  return warnings
}
export function attendanceNeedsReview(row: AttendanceRow) {
  return row.needs_review === true || (row.needs_review === undefined && attendanceHourWarnings(row).length > 0)
}


export function sumAttendanceHours(values: (number | null)[]): number | null {
 const present=values.filter((value):value is number=>value!=null)
 if(!present.length)return null
 const parts=present.map(value=>{
  const [mantissa,exponent='0']=String(value).split('e'), [whole,fraction='']=mantissa.split('.')
  return {integer:BigInt(whole+fraction),scale:fraction.length-Number(exponent)}
 })
 const scale=Math.max(0,...parts.map(part=>part.scale))
 const total=parts.reduce((sum,part)=>sum+part.integer*(BigInt(10)**BigInt(scale-part.scale)),BigInt(0))
 return Number(`${total}e-${scale}`)
}
