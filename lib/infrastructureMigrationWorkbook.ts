import { parseInfrastructureSnapshot, type InfrastructureSnapshot } from './infrastructureMigrationPreview'
import type { CellValue, Worksheet } from 'exceljs'

const format = 'itrix-fermes-serres-v1'
const farmFields = ['code', 'name', 'city', 'country', 'area', 'active', 'manager_link'] as const
const farmDetails = ['address', 'region', 'gps_lat', 'gps_lng', 'notes'] as const
const greenhouseFields = ['farm_code', 'code', 'name', 'type', 'status', 'total', 'usable', 'zone_link'] as const
const greenhouseDetails = ['length', 'width', 'height', 'commissioning_date', 'last_renovation_date',
  'irrigation_type', 'heating_system', 'climate_control', 'notes'] as const

function addTable(sheet: Worksheet, headers: readonly string[]) {
  sheet.columns = headers.map(header => ({ header, width: header === 'notes' ? 34 : 21 }))
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } }
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176144' } }
  for (const header of ['code', 'farm_code']) {
    const index = headers.indexOf(header)
    if (index !== -1) sheet.getColumn(index + 1).numFmt = '@'
  }
}

export async function infrastructureMigrationWorkbook(snapshot?: InfrastructureSnapshot): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const guide = workbook.addWorksheet('Guide')
  guide.getColumn(1).width = 105
  guide.addRows([
    ['ItriX Farm · Reprise des fermes et des serres'],
    ['Dans Dossier, renseigner le code de la société source. La cible se choisit dans l’application.'],
    ['Fermes · code et name requis. area est la surface totale en m². Une surface inconnue peut rester vide.'],
    ['Serres · farm_code doit correspondre à un code dans Fermes. code, name, type, status, total et usable sont requis.'],
    ['Exemples · type = tunnel ou chapelle, status = active. Les surfaces des serres sont en m².'],
    ['Indiquer oui ou non pour les booléens. Laisser manager_link et zone_link sur non pour une nouvelle fiche sans rattachement.'],
    ['Pour une fiche exportée déjà liée, conserver manager_link ou zone_link. Le rapprochement sera signalé dans l’aperçu.'],
    ['Renseigner les dates au format AAAA-MM-JJ. Conserver les noms des onglets et des colonnes.'],
    ['Charger ce classeur dans l’assistant et consulter l’aperçu avant tout import.'],
  ])
  guide.getRow(1).font = { bold: true, size: 15, color: { argb: 'FF176144' } }
  guide.eachRow(row => { row.alignment = { wrapText: true, vertical: 'middle' }; row.height = 27 })

  const dossier = workbook.addWorksheet('Dossier')
  addTable(dossier, ['format', 'company_code'])
  dossier.addRow([format, snapshot?.company_code ?? ''])
  const farms = workbook.addWorksheet('Fermes')
  addTable(farms, [...farmFields, ...farmDetails])
  for (const row of snapshot?.farms ?? []) {
    farms.addRow([...farmFields.map(key => row[key]), ...farmDetails.map(key => row.attributes?.[key] as CellValue)])
  }
  const greenhouses = workbook.addWorksheet('Serres')
  addTable(greenhouses, [...greenhouseFields, ...greenhouseDetails])
  for (const row of snapshot?.greenhouses ?? []) {
    greenhouses.addRow([...greenhouseFields.map(key => row[key]), ...greenhouseDetails.map(key => row.attributes?.[key] as CellValue)])
  }
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer
}

function readRows(sheet: Worksheet | undefined, headers: readonly string[]) {
  if (!sheet || !headers.every((header, index) => sheet.getCell(1, index + 1).text.trim() === header)) {
    throw new Error(`Onglet ${sheet?.name ?? headers[0]} manquant ou en-têtes modifiés. Utilise le modèle ItriX Farm.`)
  }
  if (sheet.rowCount > 10001) throw new Error(`L’onglet ${sheet.name} dépasse 10 000 lignes.`)
  const rows: Record<string, CellValue>[] = []
  for (let row = 2; row <= sheet.rowCount; row++) {
    const values = headers.map((_, index) => sheet.getCell(row, index + 1).value)
    if (values.every(value => value == null || value === '')) continue
    if (values.some(value => value != null && typeof value === 'object' && !(value instanceof Date))) {
      throw new Error(`${sheet.name}, ligne ${row} : utilise des valeurs simples, sans formule.`)
    }
    rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index]])))
  }
  return rows
}

const text = (value: CellValue) => value == null ? '' : String(value).trim()
const optionalText = (value: CellValue) => value == null ? null : String(value)
function number(value: CellValue): number | null {
  if (value == null || text(value) === '') return null
  if (typeof value !== 'number' && !/^[+-]?\d+(?:[.,]\d+)?$/.test(text(value))) throw new Error('Surface ou dimension non numérique.')
  return Number(text(value).replace(',', '.'))
}
function bool(value: CellValue, fallback: boolean) {
  if (typeof value === 'boolean') return value
  switch (text(value).toLowerCase()) {
    case '': return fallback
    case 'oui': case 'true': case '1': return true
    case 'non': case 'false': case '0': return false
    default: throw new Error('Valeur booléenne invalide. Utilise oui ou non.')
  }
}
function detail(key: string, value: CellValue) {
  if (value == null) return null
  if (key === 'climate_control') return bool(value, false)
  if (['length', 'width', 'height', 'gps_lat', 'gps_lng'].includes(key)) return number(value)
  if (key.endsWith('_date')) {
    const date = value instanceof Date ? value.toISOString().slice(0, 10) : text(value)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date invalide. Utilise AAAA-MM-JJ.')
    return date
  }
  return optionalText(value)
}

export async function readInfrastructureMigrationWorkbook(file: ArrayBuffer): Promise<InfrastructureSnapshot> {
  if (file.byteLength > 5 * 1024 * 1024) throw new Error('Le dossier dépasse 5 Mo.')
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(file)
  const rows = readRows(workbook.getWorksheet('Dossier'), ['format', 'company_code'])
  if (rows.length !== 1 || text(rows[0].format) !== format) throw new Error('Version du classeur inconnue.')
  return parseInfrastructureSnapshot({
    company_code: text(rows[0].company_code),
    farms: readRows(workbook.getWorksheet('Fermes'), [...farmFields, ...farmDetails]).map(row => ({
      code: text(row.code), name: text(row.name), city: optionalText(row.city), country: optionalText(row.country),
      area: number(row.area), active: bool(row.active, true), manager_link: bool(row.manager_link, false),
      attributes: Object.fromEntries(farmDetails.map(key => [key, detail(key, row[key])])),
    })),
    greenhouses: readRows(workbook.getWorksheet('Serres'), [...greenhouseFields, ...greenhouseDetails]).map(row => ({
      farm_code: text(row.farm_code), code: text(row.code), name: text(row.name), type: text(row.type),
      status: text(row.status), total: number(row.total), usable: number(row.usable), zone_link: bool(row.zone_link, false),
      attributes: Object.fromEntries(greenhouseDetails.map(key => [key, detail(key, row[key])])),
    })),
  })
}
