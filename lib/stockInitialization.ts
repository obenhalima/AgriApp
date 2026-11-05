import { initNumber, type InitCatalog } from './initialization'

export const STOCK_COLUMNS = [
  ['code', 'Code article'], ['name', 'Désignation'], ['category', 'Catégorie'], ['unit', 'Unité'],
  ['warehouse', 'Code entrepôt'], ['date', 'Date inventaire'], ['quantity', 'Quantité disponible'],
  ['price', 'Coût unitaire (MAD)'], ['evidence', 'Justificatif du coût'], ['notes', 'Observations'],
] as const
export type StockInput = Record<typeof STOCK_COLUMNS[number][0], string> & { line: number }
export type StockIssue = { line: number; field: string; message: string; warning?: boolean }
const norm = (v: string) => v.trim().toLocaleUpperCase('fr')
export function checkStockInitialization(input: StockInput[], catalog: InitCatalog, today: string) {
  const issues: StockIssue[] = [], rows: StockInput[] = []
  const definitions = new Map<string, StockInput>(), pairs = new Set<string>(), newCodes = new Set<string>(), reused = new Set<string>()
  for (const raw of input) {
    const row = { ...raw }
    for (const [key] of STOCK_COLUMNS) row[key] = String(row[key] ?? '').trim()
    if (!STOCK_COLUMNS.some(([key]) => !['warehouse','date'].includes(key) && row[key])) continue
    const old = catalog.products.find(p => norm(p.code) === norm(row.code))
    const changed = old && ['name','category','unit'].some(key => norm(row[key as keyof StockInput] as string) !== norm(old[key] || ''))
    // Existing article rows with no declaration remain untouched.
    if (old && !changed && !['quantity','price','evidence','notes'].some(key => row[key as keyof StockInput])) continue
    rows.push(row)
    const add = (field: string, message: string, warning = false) => issues.push({ line: row.line, field, message, warning })
    for (const [key, label] of STOCK_COLUMNS.slice(0, 4)) if (!row[key]) add(label, 'Champ obligatoire.')
    if (row.code.length > 30) add('Code article', 'Maximum 30 caractères.')
    if (row.name.length > 255) add('Désignation', 'Maximum 255 caractères.')
    if (row.notes.length > 2000 || row.evidence.length > 100) add('Justificatif / observations', 'Justificatif : 100 caractères ; observations : 2 000.')
    if (old) {
      reused.add(norm(row.code))
      if (old.is_active === 'non') add('Code article', 'Article inactif : réactivez-le dans le référentiel avant la reprise.')
      if (changed) add('Article', 'Nom, catégorie ou unité différents du référentiel : corrigez la fiche avant la reprise.')
      row.code = old.code; row.name = old.name; row.category = old.category; row.unit = old.unit
    } else {
      newCodes.add(norm(row.code))
      if (catalog.products.some(p => norm(p.name) === norm(row.name))) add('Désignation', 'Un article porte déjà ce nom : utilisez son code existant.')
      if (!catalog.stock_categories?.some(c => c.code === row.category)) add('Catégorie', 'Choisissez un code de Ref_Categories.')
      if (!catalog.units?.some(u => u.code === row.unit)) add('Unité', 'Choisissez un code de Ref_Unites.')
    }
    const prior = definitions.get(norm(row.code))
    if (prior && ['name','category','unit'].some(k => norm(prior[k as keyof StockInput] as string) !== norm(row[k as keyof StockInput] as string))) add('Article', 'Définition contradictoire du même code dans le fichier.')
    if (!prior && [...definitions.values()].some(p => norm(p.name) === norm(row.name) && norm(p.code) !== norm(row.code))) add('Désignation', 'Même nom sous plusieurs codes dans le fichier.')
    definitions.set(norm(row.code), row)
    if (row.quantity !== '') {
      const q = initNumber(row.quantity)
      if (!Number.isFinite(q) || q < 0 || q > 99999999.99 || Math.abs(q * 100 - Math.round(q * 100)) > 0.00001) add('Quantité', 'Nombre positif ou nul, maximum 99 999 999,99 et deux décimales.')
      if (!catalog.warehouses.some(w => norm(w.code) === norm(row.warehouse))) add('Entrepôt', 'Entrepôt actif du client requis.')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date)) || new Date(row.date).toISOString().slice(0, 10) !== row.date || row.date > today) add('Date inventaire', 'Date valide non future requise.')
      const pair = `${norm(row.code)}|${norm(row.warehouse)}`
      if (pairs.has(pair)) add('Entrepôt', 'Un seul stock initial par article et entrepôt.')
      pairs.add(pair)
      if (q > 0 && row.price === '') add('Coût unitaire', 'Stock non valorisé : coût à compléter ultérieurement.', true)
    } else if (row.price || row.evidence) add('Quantité', 'Renseignez la quantité avant de valoriser le stock.')
    if (row.price !== '') {
      const price = initNumber(row.price)
      if (!Number.isFinite(price) || price < 0 || price > 99999999.99 || Math.abs(price * 1e8 - Math.round(price * 1e8)) > 0.001) add('Coût unitaire', 'Coût positif ou nul, maximum 99 999 999,99 et huit décimales.')
      if (!row.evidence) add('Justificatif', 'Justificatif obligatoire quand un coût est renseigné.')
    }
    if (row.quantity !== '' && Number.isFinite(initNumber(row.quantity))) row.quantity = initNumber(row.quantity).toFixed(2)
    if (row.price !== '' && Number.isFinite(initNumber(row.price))) row.price = initNumber(row.price).toFixed(8)
  }
  return { rows, issues, created: newCodes.size, reused: reused.size, positive: rows.filter(r => Number(r.quantity) > 0).length, zero: rows.filter(r => r.quantity !== '' && Number(r.quantity) === 0).length, unvalued: rows.filter(r => Number(r.quantity) > 0 && r.price === '').length }
}

export function stockPayload(rows: StockInput[]) {
  return rows.map(row => Object.fromEntries(STOCK_COLUMNS.map(([key]) => [key, row[key]])))
}
