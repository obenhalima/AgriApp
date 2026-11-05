import { emptyInitDraft, validateInit, initNumber, type InitCatalog, type InitRow } from './initialization'

export function stockOpeningDraft(catalog: InitCatalog, warehouse: string, date: string) {
  if (!catalog.warehouses?.some(row => row.code === warehouse)) throw new Error('Choisissez un entrepôt du client actif.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Date de reprise invalide.')
  const products = catalog.products || []
  if (!products.length) throw new Error('Créez les articles du client avant de télécharger le modèle.')
  if (products.length > 1000) throw new Error('Le modèle accepte au maximum 1 000 articles.')
  const draft = emptyInitDraft()
  draft.rows.opening_stock = products.map((product, index) => ({ code: `STO-${String(index + 1).padStart(4, '0')}`, warehouse, product: product.code, date, quantity: '', price: '', evidence: '', notes: '' }))
  return draft
}

export function checkStockOpening(rows: InitRow[], catalog: InitCatalog, today: string) {
  // Untouched prefilled articles are not inventory declarations. Zero is explicit.
  const included: InitRow[] = rows.filter(row => ['quantity', 'price', 'evidence', 'notes', 'reference'].some(key => row[key]?.trim())).map(row => ({ ...row, existing_id: '' }))
  const draft = emptyInitDraft()
  draft.rows.opening_stock = included
  const issues = validateInit(draft, catalog).filter(issue => issue.section === 'opening_stock')
  included.forEach((row, index) => {
    if (row.date > today) issues.push({ section: 'opening_stock', row: index + 1, field: 'date', message: 'Date de reprise future interdite.', warning: false })
  })
  return { rows: included, issues, untouched: rows.length - included.length, positive: included.filter(row => initNumber(row.quantity) > 0).length, zero: included.filter(row => row.quantity?.trim() && initNumber(row.quantity) === 0).length }
}
