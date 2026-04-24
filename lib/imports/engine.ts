// Moteur d'import générique : parse, auto-mapping, validation, résolution FK.
// Chaque cible (Coûts, Récoltes…) fournit ses FieldDef et son validateRow.

import * as XLSX from 'xlsx'
import {
  ImportTarget, FieldDef, ColumnMapping, ParsedRow, ValidatedRow,
  ValidationReport, RowIssue, ResolutionContext, SheetInfo,
} from './types'

// ═══════════════════════════════════════════════════════════════
// 1. LECTURE : détection des onglets + headers
// ═══════════════════════════════════════════════════════════════
export function readWorkbookSheets(buffer: ArrayBuffer): { wb: XLSX.WorkBook; sheets: SheetInfo[] } {
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheets: SheetInfo[] = wb.SheetNames.map(name => {
    const ws = wb.Sheets[name]
    const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' })
    const headers = (aoa[0] ?? []).map(h => String(h ?? '').trim())
    const preview = aoa.slice(1, 6)
    return {
      name,
      rowCount: Math.max(0, aoa.length - 1),
      columnCount: headers.length,
      headers,
      preview,
    }
  })
  return { wb, sheets }
}

export function readSheetRows(wb: XLSX.WorkBook, sheetName: string, headerRowIndex = 0): {
  headers: string[]
  rows: Record<string, any>[]
} {
  const ws = wb.Sheets[sheetName]
  if (!ws) return { headers: [], rows: [] }
  // Lit tout en tableau, extrait la ligne d'en-tête, construit les objets
  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' })
  if (aoa.length <= headerRowIndex) return { headers: [], rows: [] }
  const headers = (aoa[headerRowIndex] ?? []).map(h => String(h ?? '').trim())
  const rows: Record<string, any>[] = []
  for (let i = headerRowIndex + 1; i < aoa.length; i++) {
    const row = aoa[i]
    const obj: Record<string, any> = {}
    let hasAny = false
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] || `__col${c}`
      const v = row[c]
      obj[key] = v
      if (v !== '' && v !== null && v !== undefined) hasAny = true
    }
    if (hasAny) rows.push(obj)
  }
  return { headers, rows }
}

// ═══════════════════════════════════════════════════════════════
// 2. AUTO-MAPPING : colonne Excel → field de la target par similarité
// ═══════════════════════════════════════════════════════════════
const normalize = (s: string) => s
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[_\s\-.()/\\]+/g, '')
  .trim()

function similarity(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b)
  if (na === nb) return 1
  if (na.length === 0 || nb.length === 0) return 0
  if (na.includes(nb) || nb.includes(na)) return 0.85
  // Dice bigrams
  const bigrams = (s: string) => {
    const out = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
    return out
  }
  const A = bigrams(na), B = bigrams(nb)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return (2 * inter) / (A.size + B.size)
}

export function autoMap(excelHeaders: string[], fields: FieldDef[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const usedFields = new Set<string>()

  for (const header of excelHeaders) {
    if (!header) { mapping[header] = null; continue }
    let best: { field: FieldDef; score: number } | null = null
    for (const f of fields) {
      if (usedFields.has(f.key)) continue
      const candidates = [f.key, f.label, ...(f.aliases ?? [])]
      for (const cand of candidates) {
        const s = similarity(header, cand)
        if (!best || s > best.score) best = { field: f, score: s }
      }
    }
    if (best && best.score >= 0.75) {
      mapping[header] = best.field.key
      usedFields.add(best.field.key)
    } else {
      mapping[header] = null
    }
  }
  return mapping
}

// ═══════════════════════════════════════════════════════════════
// 3. PARSE + COERCE : appliquer le mapping et convertir en types
// ═══════════════════════════════════════════════════════════════
export function parseRows(
  rawRows: Record<string, any>[],
  mapping: ColumnMapping,
  fields: FieldDef[],
  headerRowIndex: number = 0,
): ParsedRow[] {
  const fieldByKey = new Map(fields.map(f => [f.key, f]))
  const result: ParsedRow[] = []
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]
    const mapped: Record<string, any> = {}
    for (const [excelCol, targetKey] of Object.entries(mapping)) {
      if (!targetKey) continue
      const field = fieldByKey.get(targetKey)
      if (!field) continue
      const rawVal = row[excelCol]
      mapped[targetKey] = coerce(rawVal, field)
    }
    // appliquer les defaultValue si champ manquant
    for (const f of fields) {
      if (mapped[f.key] === undefined && f.defaultValue !== undefined) {
        mapped[f.key] = f.defaultValue
      }
    }
    result.push({ rowIndex: i + headerRowIndex + 2, raw: mapped })
  }
  return result
}

function coerce(val: any, field: FieldDef): any {
  if (val === null || val === undefined || val === '') return null
  switch (field.type) {
    case 'string':
      return String(val).trim()
    case 'integer': {
      const n = Number(String(val).replace(/[^\d\-]/g, ''))
      return Number.isFinite(n) ? Math.trunc(n) : null
    }
    case 'number': {
      const n = Number(String(val).replace(/[^\d.\-]/g, ''))
      return Number.isFinite(n) ? n : null
    }
    case 'date': {
      // Excel peut retourner un Date JS, un nombre série, ou une string
      if (val instanceof Date) return val.toISOString().slice(0, 10)
      if (typeof val === 'number') {
        // numéro de série Excel (jours depuis 1900-01-01)
        const d = XLSX.SSF.parse_date_code(val)
        if (!d) return null
        return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
      }
      const s = String(val).trim()
      // essayer ISO ou DD/MM/YYYY
      const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
      if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
      const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (fr) return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`
      return null
    }
    case 'boolean': {
      const s = String(val).trim().toLowerCase()
      if (['1', 'true', 'oui', 'yes', 'o', 'y'].includes(s)) return true
      if (['0', 'false', 'non', 'no', 'n', ''].includes(s)) return false
      return null
    }
  }
  return val
}

// ═══════════════════════════════════════════════════════════════
// 4. VALIDATION : basique (types, required) + délégation à la target
// ═══════════════════════════════════════════════════════════════
export async function validateAndResolve(
  parsed: ParsedRow[],
  target: ImportTarget,
): Promise<ValidationReport> {
  const issues: RowIssue[] = []
  const validated: ValidatedRow[] = []

  // Charger les résolveurs SÉQUENTIELLEMENT (évite les collisions de connexions
  // sur le free tier Supabase + permet de voir quelle table pose souci).
  const loadWithTimeout = <T,>(key: string, p: Promise<T>, ms = 15000): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Résolveur "${key}" n'a pas répondu après ${ms}ms (RLS, table trop grande, ou colonne inexistante ?)`)), ms)
      ),
    ])
  const resolverMap: Record<string, Map<string, any>> = {}
  for (const r of target.resolvers) {
    const t0 = Date.now()
    console.log(`[Import] Chargement résolveur "${r.key}"…`)
    try {
      const map = await loadWithTimeout(r.key, r.load())
      console.log(`[Import] ✓ "${r.key}" chargé : ${map.size} entrées en ${Date.now() - t0}ms`)
      resolverMap[r.key] = map
    } catch (e: any) {
      console.error(`[Import] ✗ "${r.key}" échec :`, e)
      throw new Error(`Résolveur "${r.key}" : ${e.message}`)
    }
  }
  const ctx: ResolutionContext = { resolvers: resolverMap, allRows: parsed.map(p => p.raw) }

  for (const p of parsed) {
    const rowIssues: RowIssue[] = []

    // 4a. Validation basique des fields
    for (const field of target.fields) {
      const v = p.raw[field.key]
      const empty = v === null || v === undefined || v === ''
      if (field.required && empty) {
        rowIssues.push({ rowIndex: p.rowIndex, field: field.key, severity: 'error',
          message: `${field.label} manquant` })
        continue
      }
      if (empty) continue
      if (field.type === 'number' || field.type === 'integer') {
        const n = Number(v)
        if (!Number.isFinite(n)) {
          rowIssues.push({ rowIndex: p.rowIndex, field: field.key, severity: 'error',
            message: `${field.label} : nombre invalide (${v})` })
          continue
        }
        if (field.min !== undefined && n < field.min) {
          rowIssues.push({ rowIndex: p.rowIndex, field: field.key, severity: 'error',
            message: `${field.label} < ${field.min}` })
        }
        if (field.max !== undefined && n > field.max) {
          rowIssues.push({ rowIndex: p.rowIndex, field: field.key, severity: 'error',
            message: `${field.label} > ${field.max}` })
        }
      }
      if (field.oneOf && !field.oneOf.includes(String(v))) {
        rowIssues.push({ rowIndex: p.rowIndex, field: field.key, severity: 'error',
          message: `${field.label} : valeur "${v}" non autorisée (attendu : ${field.oneOf.join('/')})` })
      }
    }

    // 4b. S'il y a déjà une erreur bloquante, on saute la résolution
    if (rowIssues.some(i => i.severity === 'error')) {
      issues.push(...rowIssues)
      validated.push({ rowIndex: p.rowIndex, resolved: null, issues: rowIssues })
      continue
    }

    // 4c. Résolution déléguée à la target
    const res = await Promise.resolve(target.validateRow(p.raw, ctx))
    const hasErr = res.issues.some(i => i.severity === 'error') || rowIssues.some(i => i.severity === 'error')
    const combined = [...rowIssues, ...res.issues.map(i => ({ ...i, rowIndex: p.rowIndex }))]
    issues.push(...combined)
    // Tamponne le numéro de ligne Excel dans la résolution (utile aux targets qui
    // doivent référencer la ligne d'origine lors d'erreurs de commit).
    const resolvedWithRow = hasErr || res.resolved === null
      ? null
      : { ...res.resolved, _row: p.rowIndex, _rowIndex: p.rowIndex }
    validated.push({ rowIndex: p.rowIndex, resolved: resolvedWithRow, issues: combined })
  }

  const errors = issues.filter(i => i.severity === 'error').length
  const warnings = issues.filter(i => i.severity === 'warning').length
  const validRows = validated.filter(v => v.resolved !== null).length

  return {
    rows: parsed,
    validated,
    issues,
    summary: { totalRows: parsed.length, validRows, errors, warnings },
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. COMMIT : appelle la target avec les lignes résolues
// ═══════════════════════════════════════════════════════════════
export async function commitReport(
  target: ImportTarget,
  report: ValidationReport,
): Promise<import('./types').CommitReport> {
  let resolved = report.validated
    .filter(v => v.resolved !== null)
    .map(v => v.resolved)
  if (target.groupBeforeCommit) resolved = target.groupBeforeCommit(resolved)
  return target.commit(resolved)
}

// ═══════════════════════════════════════════════════════════════
// 6. HELPERS EXCEL (téléchargement blob)
// ═══════════════════════════════════════════════════════════════
export function downloadBlob(blob: Blob, filename: string) {
  if (typeof window === 'undefined') return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function workbookToBlob(wb: XLSX.WorkBook): Blob {
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
