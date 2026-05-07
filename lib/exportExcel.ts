/**
 * Helpers d'export Excel formaté (couleurs, bordures, polices) avec ExcelJS.
 *
 * ExcelJS (~500KB) est lazy-loadé pour ne pas plomber le bundle initial.
 * Le module n'est chargé que lorsque createWorkbook() est appelé.
 *
 * Usage :
 *   const wb = await createWorkbook()                  // ⚠ async maintenant
 *   const ws = wb.addWorksheet('CPC')
 *   applyTitleRow(ws, 'COMPTE D'EXPLOITATION', totalCols)
 *   ...
 *   await downloadWorkbook(wb, 'CPC_2025-2026.xlsx')
 */
import type ExcelJS from 'exceljs'

// ─── Palette (ARGB hex sans #, format ExcelJS) ───────────────────────────────
export const XLS_COLORS = {
  // Headers
  headerFill:    'FF1E1B4B',  // violet foncé (page-title)
  headerText:    'FFFFFFFF',
  subHeaderFill: 'FFE5E7EB',  // gris clair
  subHeaderText: 'FF374151',
  // Lignes de catégorie
  rowEvenFill:   'FFF9FAFB',  // bandeau alterné
  rowOddFill:    'FFFFFFFF',
  // Types comptables (correspondance avec TYPE_COLORS de l'app)
  typeProduitFill:  'FFD1FAE5',  // vert clair  (produit)
  typeChVarFill:    'FFFEF3C7',  // ambre clair (charge_variable)
  typeChFixFill:    'FFDBEAFE',  // bleu clair  (charge_fixe)
  typeAmortFill:    'FFEDE9FE',  // violet clair (amortissement)
  // Lignes de synthèse
  synthFill:        'FFF3F4F6',
  synthEbitdaFill:  'FFD1FAE5',
  synthResultFill:  'FFCCFBF1',
  // Mois
  pastMonthFill:    'FFFFFFFF',
  futureMonthFill:  'FFFFFBEB',  // ambre très léger
  // Variances
  positiveText:     'FF059669',  // vert
  negativeText:     'FFDC2626',  // rouge
  neutralText:      'FF6B7280',  // gris
  borderColor:      'FFE5E7EB',
} as const

export type CellTypeColor = 'produit' | 'charge_variable' | 'charge_fixe' | 'amortissement'

const TYPE_FILL_MAP: Record<CellTypeColor, string> = {
  produit:         XLS_COLORS.typeProduitFill,
  charge_variable: XLS_COLORS.typeChVarFill,
  charge_fixe:     XLS_COLORS.typeChFixFill,
  amortissement:   XLS_COLORS.typeAmortFill,
}

// ─── Bordures ────────────────────────────────────────────────────────────────
export const thinBorder: Partial<ExcelJS.Borders> = {
  top:    { style: 'thin', color: { argb: XLS_COLORS.borderColor } },
  left:   { style: 'thin', color: { argb: XLS_COLORS.borderColor } },
  bottom: { style: 'thin', color: { argb: XLS_COLORS.borderColor } },
  right:  { style: 'thin', color: { argb: XLS_COLORS.borderColor } },
}

export const thickTopBorder: Partial<ExcelJS.Borders> = {
  ...thinBorder,
  top: { style: 'medium', color: { argb: 'FF1E1B4B' } },
}

// ─── Format nombres ──────────────────────────────────────────────────────────
/** Format comptable : milliers séparés, négatifs entre parenthèses rouges */
export const NUM_FMT = '#,##0.00;[Red](#,##0.00);"—"'
/** Format pourcentage avec 1 décimale et signe */
export const PCT_FMT = '+0.0%;-0.0%;"—"'
/** Format entier avec milliers */
export const INT_FMT = '#,##0;[Red](#,##0);"—"'

// ─── Création workbook (lazy-load ExcelJS) ──────────────────────────────────
// Maintenant async pour permettre le code-splitting d'ExcelJS (~500KB).
let _ExcelJSModule: any = null
async function getExcelJS(): Promise<any> {
  if (!_ExcelJSModule) {
    const mod: any = await import('exceljs')
    // Compat CJS/ESM : exceljs est livré en CJS, son export par défaut peut être
    // soit `mod.default` (interop ESM) soit `mod` lui-même selon le bundler.
    _ExcelJSModule = mod.default ?? mod
  }
  return _ExcelJSModule
}

export async function createWorkbook(): Promise<ExcelJS.Workbook> {
  const ExcelJSMod = await getExcelJS()
  const wb = new ExcelJSMod.Workbook() as ExcelJS.Workbook
  wb.creator = 'FramPilot'
  wb.created = new Date()
  return wb
}

// ─── Ligne de titre ──────────────────────────────────────────────────────────
export function applyTitleRow(ws: ExcelJS.Worksheet, title: string, totalCols: number, opts?: { rowIndex?: number; subtitle?: string }) {
  const r = opts?.rowIndex ?? 1
  const titleRow = ws.getRow(r)
  titleRow.getCell(1).value = title
  titleRow.height = 28
  ws.mergeCells(r, 1, r, totalCols)
  const cell = titleRow.getCell(1)
  cell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS_COLORS.headerFill } }
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  if (opts?.subtitle) {
    const subRow = ws.getRow(r + 1)
    subRow.getCell(1).value = opts.subtitle
    subRow.height = 18
    ws.mergeCells(r + 1, 1, r + 1, totalCols)
    const sub = subRow.getCell(1)
    sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: XLS_COLORS.subHeaderText } }
    sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS_COLORS.subHeaderFill } }
    sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  }
}

// ─── Style header de colonnes ────────────────────────────────────────────────
export function styleHeaderRow(row: ExcelJS.Row, opts?: { fill?: string; height?: number }) {
  row.height = opts?.height ?? 22
  row.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: XLS_COLORS.headerText } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts?.fill ?? XLS_COLORS.headerFill } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = thinBorder
  })
}

export function styleSubHeaderRow(row: ExcelJS.Row) {
  row.height = 18
  row.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: XLS_COLORS.subHeaderText } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLS_COLORS.subHeaderFill } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = thinBorder
  })
}

// ─── Style ligne de catégorie ────────────────────────────────────────────────
export function styleCategoryRow(row: ExcelJS.Row, opts: {
  depth: number
  type?: CellTypeColor
  isLeaf?: boolean
  numericFromCol?: number   // colonne à partir de laquelle les cellules sont numériques (default: 2)
}) {
  const fromCol = opts.numericFromCol ?? 2
  const isRoot = opts.depth === 0
  const fillColor = isRoot && opts.type ? TYPE_FILL_MAP[opts.type] : undefined

  // Première colonne : label
  const labelCell = row.getCell(1)
  labelCell.font = {
    name: 'Calibri',
    size: isRoot ? 11 : 10,
    bold: isRoot || !opts.isLeaf,
    color: { argb: 'FF111827' },
  }
  labelCell.alignment = { vertical: 'middle', horizontal: 'left', indent: opts.depth }
  labelCell.border = thinBorder
  if (fillColor) {
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } }
  }

  // Colonnes numériques
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber < fromCol) return
    cell.font = { name: 'Calibri', size: isRoot ? 11 : 10, bold: isRoot, color: { argb: 'FF111827' } }
    cell.alignment = { vertical: 'middle', horizontal: 'right' }
    cell.border = thinBorder
    if (typeof cell.value === 'number') cell.numFmt = NUM_FMT
    if (fillColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } }
  })
}

// ─── Style ligne de synthèse (TOTAL XXX, EBITDA, RÉSULTAT) ───────────────────
export function styleSynthesisRow(row: ExcelJS.Row, opts: {
  variant: 'total_prod' | 'total_chvar' | 'total_chfix' | 'total_amort' | 'ebitda' | 'resultat'
  numericFromCol?: number
}) {
  const fromCol = opts.numericFromCol ?? 2
  const variantFill: Record<typeof opts.variant, string> = {
    total_prod:  XLS_COLORS.typeProduitFill,
    total_chvar: XLS_COLORS.typeChVarFill,
    total_chfix: XLS_COLORS.typeChFixFill,
    total_amort: XLS_COLORS.typeAmortFill,
    ebitda:      XLS_COLORS.synthEbitdaFill,
    resultat:    XLS_COLORS.synthResultFill,
  }
  const isStrong = opts.variant === 'ebitda' || opts.variant === 'resultat'
  row.height = 22

  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = {
      name: 'Calibri',
      size: isStrong ? 12 : 11,
      bold: true,
      color: { argb: 'FF111827' },
    }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: variantFill[opts.variant] } }
    cell.alignment = colNumber === 1
      ? { vertical: 'middle', horizontal: 'left', indent: 0 }
      : { vertical: 'middle', horizontal: 'right' }
    cell.border = isStrong ? thickTopBorder : thinBorder
    if (typeof cell.value === 'number' && colNumber >= fromCol) cell.numFmt = NUM_FMT
  })
}

// ─── Largeurs de colonnes ────────────────────────────────────────────────────
export function setColumnWidths(ws: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => {
    const col = ws.getColumn(i + 1)
    col.width = w
  })
}

// ─── Geler les lignes/colonnes ───────────────────────────────────────────────
export function freezePanes(ws: ExcelJS.Worksheet, opts: { rows?: number; cols?: number }) {
  ws.views = [{
    state: 'frozen',
    xSplit: opts.cols ?? 0,
    ySplit: opts.rows ?? 0,
    activeCell: 'A1',
  }]
}

// ─── Téléchargement ──────────────────────────────────────────────────────────
export async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
