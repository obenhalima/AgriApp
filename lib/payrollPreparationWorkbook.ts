import ExcelJS from 'exceljs'
import {BRAND} from './brand'
import {payrollLineAmounts, type PayrollPreparationLine, type PayrollPayment} from './payrollPreparation'

export async function buildPayrollDocuments(input: {client: string; farm: string; start: string; end: string; status: string; rows: PayrollPreparationLine[]; payments: PayrollPayment[]}) {
  const book = new ExcelJS.Workbook()
  book.creator = BRAND.company
  const netBasis = input.rows.every(line => line.calculation_basis === 'net-v1')
  const headings = ['Employé', 'Code', 'Origine', 'Heures N', 'Heures S', 'Taux N fiche', 'Taux N appliqué', 'Écart N', 'Taux S fiche', 'Taux S appliqué', 'Écart S', netBasis ? 'Net normal acquis' : 'Salaire normal', netBasis ? 'Net heures supplémentaires acquis' : 'Heures supplémentaires', netBasis ? 'Primes nettes' : 'Primes', 'Brut', 'CNSS salarié', 'AMO salarié', 'IR', 'Avances récupérées', 'Autres retenues', 'Net à payer', 'CNSS employeur', 'AMO employeur', 'Allocations familiales', 'Formation professionnelle', 'Coût employeur', 'Payé', 'Reste à payer', 'Employé déclaré', netBasis ? 'Net acquis' : 'Base de calcul']
  const state = book.addWorksheet('Etat_Paie')
  const signatures = book.addWorksheet('Emargement')
  for (const sheet of [state, signatures]) {
    sheet.addRow([BRAND.name, input.client, input.farm])
    sheet.addRow([`${input.start} — ${input.end}`, input.status === 'validated' ? 'Paie validée' : 'Brouillon'])
    sheet.addRow([])
    sheet.views = [{state: 'frozen', ySplit: 4, xSplit: 1}]
    sheet.pageSetup = {orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:4'}
    sheet.headerFooter.oddFooter = '&L' + BRAND.company + '&RPage &P / &N'
  }
  state.addRow(headings)
  signatures.addRow(['Employé', 'Code', 'Heures N', 'Heures S', 'Net à payer', 'Payé', 'Reste à payer', 'Date de paiement', 'Signature'])
  for (const line of input.rows) {
    const amounts = payrollLineAmounts(line)
    const paid = input.payments.filter(payment => payment.worker_id === line.worker_id).reduce((sum, payment) => sum + Number(payment.amount), 0)
    const remaining = Math.round((amounts.net_salary - paid) * 100) / 100
    state.addRow([line.worker_name, line.worker_code, line.source === 'attendance' ? 'Pointage validé' : 'Saisie manuelle', line.normal_hours, line.overtime_hours,
      line.original_normal_rate, line.normal_rate, line.original_normal_rate == null || line.normal_rate == null ? null : line.normal_rate - line.original_normal_rate,
      line.original_overtime_rate, line.overtime_rate, line.original_overtime_rate == null || line.overtime_rate == null ? null : line.overtime_rate - line.original_overtime_rate,
      amounts.base_amount, amounts.overtime_amount, line.bonuses, amounts.gross_salary, amounts.cnss_employee, amounts.amo_employee, amounts.ir_amount, line.advance, line.other_deductions,
      amounts.net_salary, amounts.cnss_employer, amounts.amo_employer, amounts.family_allowance_employer, amounts.prof_training_employer, amounts.total_employer_cost, paid, remaining, line.is_declared !== false ? 'Oui' : 'Non', Math.round((amounts.base_amount + amounts.overtime_amount + line.bonuses) * 100) / 100])
    signatures.addRow([line.worker_name, line.worker_code, line.normal_hours, line.overtime_hours, amounts.net_salary, paid, remaining, '', ''])
  }
  for (const sheet of [state, signatures]) {
    const lastDataRow = sheet.rowCount
    const totals = sheet.addRow(['TOTAL'])
    const columns = sheet === state ? [4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28] : [3, 4, 5, 6, 7]
    for (const index of columns) {
      const letter = sheet.getColumn(index).letter
      totals.getCell(index).value = {formula: `SUM(${letter}5:${letter}${lastDataRow})`, result: input.rows.reduce((sum, _, row) => sum + Number(sheet.getCell(row + 5, index).value || 0), 0)}
    }
    sheet.columns.forEach((column, index) => {column.width = index === 0 ? 34 : index === 1 ? 23 : 20})
    sheet.eachRow((row, index) => {
      row.height = index === 4 ? 32 : 24
      row.eachCell(cell => {
        cell.font = {name: 'Montserrat', size: 10, bold: index <= 4 || index === sheet.rowCount}
        if (index === 4) {cell.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FF0B3D2E'}}; cell.font = {...cell.font, color: {argb: 'FFFFFFFF'}}; cell.alignment = {wrapText: true, vertical: 'middle'}}
        if (typeof cell.value === 'number') cell.numFmt = '#,##0.00'
      })
    })
    if (sheet === state) for (const index of [6, 7, 8, 9, 10, 11]) sheet.getColumn(index).numFmt = '0.#########'
    sheet.autoFilter = {from: {row: 4, column: 1}, to: {row: lastDataRow, column: sheet.columnCount}}
  }
  return new Blob([await book.xlsx.writeBuffer()], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}
