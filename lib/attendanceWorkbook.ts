import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import {buildTemplate,type ColumnSpec} from './imports/templateBuilder'
import {attendanceCompleteRows,attendanceKey,parseAttendanceHours,type AttendanceRow,type AttendanceWorker} from './attendance'

export type AttendanceWorkbookContext = {domain: string; domainCode: string; farm: string; farmName: string; days: string[]; workers: AttendanceWorker[]}

export async function buildAttendanceWorkbook(context: AttendanceWorkbookContext, records: AttendanceRow[]) {
  const columns: ColumnSpec[] = [
    {header: 'Code employé', width: 20, numFmt: '@'}, {header: 'Nom', width: 32},
    {header: 'Type', width: 9, validation: {type: 'list', values: ['N', 'S'], allowBlank: false}},
    ...context.days.map(day => ({header: day, width: 13, validation: {type: 'decimal' as const, min: 0, max: 24, allowBlank: true}, numFmt: '0.##'})),
    {header: 'Total heures', width: 16, numFmt: '0.##'}, {header: 'Équivalent jours N', width: 22, numFmt: '0.###'},
  ]
  const blob = await buildTemplate({
    title: `Pointage ${context.domainCode} · ${context.days[0]}`,
    targetSheet: {name: 'Pointage', columns: columns.map(column => ({...column, headerBg: '0B3D2E'})), dataRowsCount: Math.max(2, context.workers.length * 2)},
    instructions: {title: 'ItriX Farm — Pointage par quinzaine', lines: [
      `Client : ${context.domainCode}. Ferme : ${context.farmName}. Période : ${context.days[0]} au ${context.days.at(-1)}.`,
      'Deux lignes par employé : N pour les heures normales, S pour les heures supplémentaires.',
      'Saisissez les heures chaque jour. 16 signifie 16 heures. 8 heures normales correspondent à un jour équivalent.',
      'Une cellule vide reste à renseigner. Zéro confirme zéro heure. Le total N + S est limité à 24 heures par jour.',
      'Gardez les codes employés, les types N/S, les dates et le contexte du modèle.',
      'Les totaux sont informatifs. ItriX recalcule les totaux depuis les heures quotidiennes lors du chargement.',
      'Lors du rechargement, une cellule vide conserve une valeur déjà saisie. Zéro peut la remplacer.',
    ]},
    referenceSheets: [
      {name: '_Contexte', headers: ['Clé', 'Valeur'], rows: [['version', 'attendance-1'], ['client', context.domain], ['ferme', context.farm], ['début', context.days[0]], ['fin', context.days.at(-1)]], hidden: true, protected: true},
      {name: 'Ref_Employes', headers: ['Code employé', 'Identifiant ItriX', 'Nom'], rows: context.workers.map(worker => [worker.matricule || worker.id, worker.id, `${worker.last_name} ${worker.first_name}`.trim()]), protected: true},
    ],
  })
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(await blob.arrayBuffer())
  const sheet = book.getWorksheet('Pointage')!
  const known = new Map(records.map(row => [attendanceKey(row.worker_id, row.work_date), row]))
  let rowNumber = 2
  for (const worker of context.workers) {
    for (const type of ['N', 'S'] as const) {
      const values = context.days.map(day => {
        const row = known.get(attendanceKey(worker.id, day))
        return (type === 'N' ? row?.normal_hours : row?.overtime_hours) ?? null
      })
      sheet.getRow(rowNumber).values = [worker.matricule || worker.id, `${worker.last_name} ${worker.first_name}`.trim(), type, ...values]
      const endColumn = XLSX.utils.encode_col(context.days.length + 2)
      const totalColumn = context.days.length + 4
      const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      sheet.getCell(rowNumber, totalColumn).value = {formula: `SUM(D${rowNumber}:${endColumn}${rowNumber})`, result: total}
      if (type === 'N') sheet.getCell(rowNumber, totalColumn + 1).value = {formula: `${XLSX.utils.encode_col(totalColumn - 1)}${rowNumber}/8`, result: total / 8}
      rowNumber++
    }
  }
  sheet.views = [{state: 'frozen', xSplit: 3, ySplit: 1}]
  const bytes = await book.xlsx.writeBuffer()
  return new Blob([bytes], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}

export function readAttendanceWorkbook(buffer: ArrayBuffer, filename: string, context: AttendanceWorkbookContext): AttendanceRow[] {
  const book = XLSX.read(buffer, {type: 'array'})
  const metadata = book.Sheets['_Contexte'], sheet = book.Sheets['Pointage'], references = book.Sheets['Ref_Employes']
  if (!sheet || !references || metadata?.B2?.v !== 'attendance-1') throw new Error('Choisissez le modèle de pointage exporté par ItriX.')
  if (metadata.B3?.v !== context.domain || metadata.B4?.v !== context.farm || metadata.B5?.v !== context.days[0] || metadata.B6?.v !== context.days.at(-1)) {
    throw new Error('Le fichier appartient à un autre client, une autre ferme ou une autre quinzaine.')
  }
  for (let index = 0; index < context.days.length; index++) {
    if (sheet[XLSX.utils.encode_cell({r: 0, c: index + 3})]?.v !== context.days[index]) throw new Error('Les dates du modèle ont été modifiées.')
  }
  const available = new Set(context.workers.map(worker => worker.id))
  const lookup = new Map<string, string>()
  for (const row of XLSX.utils.sheet_to_json<any[]>(references, {header: 1}).slice(1)) {
    if (!available.has(String(row[1])) || lookup.has(String(row[0]))) throw new Error('Référentiel des employés incohérent avec cette ferme.')
    lookup.set(String(row[0]), String(row[1]))
  }
  const data = XLSX.utils.sheet_to_json<any[]>(sheet, {header: 1, defval: null})
  const rows = new Map<string, AttendanceRow>(), pairs = new Map<string, Set<string>>()
  for (let index = 1; index < data.length; index++) {
    const line = data[index]
    if (!line.some(value => value != null && String(value).trim() !== '')) continue
    const worker = lookup.get(String(line[0])), type = String(line[2] || '').trim().toUpperCase()
    if (!worker || !['N', 'S'].includes(type)) throw new Error(`Ligne ${index + 1} : code employé ou type N/S invalide.`)
    const types = pairs.get(worker) || new Set<string>()
    if (types.has(type)) throw new Error(`Ligne ${index + 1} : ligne N/S en double pour cet employé.`)
    types.add(type); pairs.set(worker, types)
    context.days.forEach((date, dayIndex) => {
      const cell = sheet[XLSX.utils.encode_cell({r: index, c: dayIndex + 3})]
      if (cell?.t === 'e' || (cell?.f && cell.v == null)) throw new Error(`Ligne ${index + 1} : formule Excel sans résultat exploitable.`)
      const value = parseAttendanceHours(line[dayIndex + 3])
      const key = attendanceKey(worker, date)
      const row = rows.get(key) || {worker_id: worker, work_date: date, normal_hours: null, overtime_hours: null, entry_source: 'excel' as const, source_filename: filename}
      if (type === 'N') row.normal_hours = value
      else row.overtime_hours = value
      if ((row.normal_hours ?? 0) + (row.overtime_hours ?? 0) > 24) throw new Error(`Ligne ${index + 1} : N + S dépasse 24 heures sur une journée.`)
      rows.set(key, row)
    })
  }
  if (!pairs.size || pairs.size > 500) throw new Error('Sélectionnez entre 1 et 500 employés.')
  if ([...pairs.values()].some(types => types.size !== 2)) throw new Error('Chaque employé doit avoir une ligne N et une ligne S.')
  return attendanceCompleteRows([...pairs.keys()], context.days, [...rows.values()])
}
