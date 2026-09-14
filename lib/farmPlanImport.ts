import type { FarmShape } from './farmLayout'

export type PlanRectangle = { code: string; cell: string; x: number; y: number; width: number; height: number }
export type ExcelFarmPlan = { sheet: string; rectangles: PlanRectangle[] }
export const planCode = (value: string) => value.trim().toUpperCase().replace(/^SERRE\s*/, 'S').replace(/^S[-\s]*0*(\d+)$/, 'S$1')

// Geometry is in drawing units only. Never infer an official area from an Excel rectangle.
export function fitPlan(rectangles: PlanRectangle[]): PlanRectangle[] {
 if (!rectangles.length) throw Error('Aucune serre détectée : utilisez des cellules fusionnées portant un code S1, S2…')
 if (rectangles.length > 500) throw Error('Maximum 500 serres par plan.')
 const seen = new Set<string>()
 for (const r of rectangles) {
  if (seen.has(planCode(r.code))) throw Error(`Code de serre dupliqué : ${r.code}`)
  seen.add(planCode(r.code))
  if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0) throw Error(`Dimensions illisibles : ${r.code}`)
 }
 const left = Math.min(...rectangles.map(r => r.x)), top = Math.min(...rectangles.map(r => r.y))
 const width = Math.max(...rectangles.map(r => r.x + r.width)) - left
 const height = Math.max(...rectangles.map(r => r.y + r.height)) - top
 const scale = Math.min(1160 / width, 760 / height)
 return rectangles.map(r => {
  const w = r.width * scale, h = r.height * scale
  if (w < 12 || h < 12) throw Error(`La serre ${r.code} est trop petite pour être représentée lisiblement. Agrandissez son rectangle dans Excel.`)
  return { ...r, x: (1200 - width * scale) / 2 + (r.x - left) * scale + w / 2,
   y: (800 - height * scale) / 2 + (r.y - top) * scale + h / 2, width: w, height: h }
 })
}

export function matchPlan(plan: ExcelFarmPlan, greenhouses: { id: string; code: string }[]) {
 return plan.rectangles.map(r => {
  const candidates = greenhouses.filter(g => planCode(g.code) === planCode(r.code))
  return { ...r, greenhouse_id: candidates.length === 1 ? candidates[0].id : '' }
 })
}

export function importedShapes(rows: (PlanRectangle & { greenhouse_id: string })[], allowedIds: string[]): FarmShape[] {
 const seen = new Set<string>()
 return rows.map(r => {
  if (!r.greenhouse_id || !allowedIds.includes(r.greenhouse_id)) throw Error(`Rattachez ${r.code} à une serre de cette ferme.`)
  if (seen.has(r.greenhouse_id)) throw Error('Une serre du référentiel ne peut pas être associée deux fois.')
  seen.add(r.greenhouse_id)
  return { greenhouse_id: r.greenhouse_id, x: r.x, y: r.y, width: r.width, height: r.height, rotation: 0 }
 })
}

export async function readExcelFarmPlan(bytes: ArrayBuffer): Promise<ExcelFarmPlan> {
 if (bytes.byteLength > 5 * 1024 * 1024) throw Error('Fichier trop volumineux : maximum 5 Mo.')
 const ExcelJS = await import('exceljs')
 const workbook = new (ExcelJS.default ?? ExcelJS).Workbook()
 await workbook.xlsx.load(bytes)
 const sheet = workbook.worksheets[0]
 if (!sheet) throw Error('Le classeur ne contient aucun onglet.')
 if (sheet.rowCount > 500 || sheet.columnCount > 200) throw Error('Le premier onglet dépasse les limites du plan (500 lignes, 200 colonnes).')
 const xs = [0], ys = [0]
 for (let c = 1; c <= sheet.columnCount; c++) {
  const col = sheet.getColumn(c)
  xs.push(xs[c - 1] + (col.hidden ? 0 : Math.floor((col.width ?? 8.43) * 7 + 5)))
 }
 for (let r = 1; r <= sheet.rowCount; r++) {
  const row = sheet.getRow(r)
  ys.push(ys[r - 1] + (row.hidden ? 0 : (row.height ?? sheet.properties.defaultRowHeight ?? 15) * 4 / 3))
 }
 const rectangles: PlanRectangle[] = []
 for (const range of sheet.model.merges ?? []) {
  const [start, end] = range.split(':')
  const first = sheet.getCell(start), last = sheet.getCell(end ?? start)
  const code = first.text.trim()
  if (!/^(?:S[-\s]*\d+|SERRE\s*\d+)$/i.test(code)) continue
  const row = Number(first.row), col = Number(first.col), endRow = Number(last.row), endCol = Number(last.col)
  rectangles.push({ code, cell: range, x: xs[col - 1], y: ys[row - 1], width: xs[endCol] - xs[col - 1], height: ys[endRow] - ys[row - 1] })
 }
 rectangles.sort((a,b)=>planCode(a.code).localeCompare(planCode(b.code),'fr',{numeric:true}))
 return { sheet: sheet.name, rectangles: fitPlan(rectangles) }
}
