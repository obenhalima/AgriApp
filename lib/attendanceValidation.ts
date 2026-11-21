export type AttendanceIssueLocation = {
  sheet: string
  row: number
  column: number
  employee?: string
  relatedRows?: number[]
}

export function attendanceCellAddress(row: number, column: number) {
  let letters = ''
  for (let index = column + 1; index > 0; index = Math.floor((index - 1) / 26)) letters = String.fromCharCode(65 + (index - 1) % 26) + letters
  return `${letters}${row}`
}

export class AttendanceValidationError extends Error {
  constructor(public reason: string, public location: AttendanceIssueLocation) {
    super(`${location.sheet} · Ligne ${location.row} · ${attendanceCellAddress(location.row, location.column)}${location.employee ? ` · ${location.employee}` : ''} · ${reason}`)
    this.name = 'AttendanceValidationError'
  }
}
