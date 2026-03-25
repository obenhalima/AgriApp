
// Générer un code court unique (ex: S01, V003, F012)
export function genCode(prefix: string, existingCodes: string[]): string {
  let n = 1
  while (true) {
    const code = `${prefix}${String(n).padStart(2, '0')}`
    if (!existingCodes.includes(code)) return code
    n++
  }
}

// Générer un code de campagne (ex: CAMP-2026-01)
export function genCampagneCode(existingCodes: string[]): string {
  const year = new Date().getFullYear()
  let n = 1
  while (true) {
    const code = `CAMP-${year}-${String(n).padStart(2,'0')}`
    if (!existingCodes.includes(code)) return code
    n++
  }
}

// Générer un numéro de facture (ex: FV-2026-00089)
export function genFactureNum(): string {
  const year = new Date().getFullYear()
  const ts = String(Date.now()).slice(-5)
  return `FV-${year}-${ts}`
}
