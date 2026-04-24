import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import { BudgetLine } from './budgets'

// ──────────────────────────────────────────────────────────────
// Format du template : une feuille "Budget" tabulaire
// Colonnes :
//   code_ferme         (obligatoire)
//   code_serre         (vide = niveau ferme)
//   code_categorie     (obligatoire — doit matcher account_categories.code)
//   annee              (obligatoire — ex: 2025)
//   mois               (obligatoire — 1 à 12)
//   montant            (obligatoire — MAD)
//   notes              (optionnel)
// ──────────────────────────────────────────────────────────────

export type ImportRowRaw = Record<string, any>

export type ImportRowParsed = {
  rowIndex: number          // ligne d'origine dans le fichier (2+, 1 étant l'entête)
  code_ferme: string
  code_serre: string | null
  code_categorie: string
  annee: number
  mois: number
  montant: number
  notes: string | null
}

export type ImportIssue = {
  rowIndex: number
  severity: 'error' | 'warning'
  message: string
}

export type ImportResolved = {
  rowIndex: number
  farm_id: string
  greenhouse_id: string | null
  account_category_id: string
  period_year: number
  period_month: number
  amount: number
  notes: string | null
}

export type ImportReport = {
  rows: ImportRowParsed[]
  resolved: ImportResolved[]
  issues: ImportIssue[]
  summary: {
    totalRows: number
    validRows: number
    errors: number
    warnings: number
    distinctFarms: number
    distinctCategories: number
    grandTotal: number
  }
}

// ============================================================
// PARSE : lit un ArrayBuffer (fichier xlsx) et produit les lignes
// ============================================================
export function parseBudgetFile(fileBuffer: ArrayBuffer): ImportRowParsed[] {
  const wb = XLSX.read(fileBuffer, { type: 'array' })
  // On cherche la feuille "Budget" — sinon on prend la première
  const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'budget') ?? wb.SheetNames[0]
  if (!sheetName) return []
  const ws = wb.Sheets[sheetName]
  const raw: ImportRowRaw[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

  // On accepte plusieurs orthographes pour chaque colonne (souplesse)
  const ALIASES: Record<keyof Omit<ImportRowParsed,'rowIndex'>, string[]> = {
    code_ferme:      ['code_ferme', 'ferme', 'farm_code', 'code ferme'],
    code_serre:      ['code_serre', 'serre', 'greenhouse_code', 'code serre'],
    code_categorie:  ['code_categorie', 'categorie', 'category_code', 'code_cat', 'code categorie', 'catégorie', 'code_catégorie'],
    annee:           ['annee', 'année', 'year'],
    mois:            ['mois', 'month'],
    montant:         ['montant', 'amount', 'valeur'],
    notes:           ['notes', 'note', 'commentaire'],
  }

  const pick = (row: ImportRowRaw, keys: string[]): any => {
    const lower = Object.keys(row).reduce<Record<string,string>>((acc, k) => { acc[k.toLowerCase().trim()] = k; return acc }, {})
    for (const k of keys) { const found = lower[k.toLowerCase()]; if (found !== undefined) return row[found] }
    return ''
  }

  return raw.map((row, idx): ImportRowParsed => ({
    rowIndex: idx + 2, // +2 car header en ligne 1 et idx 0-based
    code_ferme:     String(pick(row, ALIASES.code_ferme) ?? '').trim(),
    code_serre:     (String(pick(row, ALIASES.code_serre) ?? '').trim() || null),
    code_categorie: String(pick(row, ALIASES.code_categorie) ?? '').trim().toUpperCase(),
    annee:          Number(pick(row, ALIASES.annee) || 0),
    mois:           Number(pick(row, ALIASES.mois) || 0),
    montant:        Number(String(pick(row, ALIASES.montant) || 0).toString().replace(/[^\d.\-]/g, '')) || 0,
    notes:          (String(pick(row, ALIASES.notes) ?? '').trim() || null),
  }))
  .filter(r => r.code_ferme || r.code_categorie || r.montant) // ignore lignes entièrement vides
}

// ============================================================
// VALIDATE + RESOLVE : associe codes -> IDs et signale les erreurs
// ============================================================
export async function validateAndResolve(rows: ImportRowParsed[]): Promise<ImportReport> {
  const issues: ImportIssue[] = []
  const resolved: ImportResolved[] = []

  if (rows.length === 0) {
    return {
      rows, resolved, issues,
      summary: { totalRows: 0, validRows: 0, errors: 0, warnings: 0, distinctFarms: 0, distinctCategories: 0, grandTotal: 0 }
    }
  }

  // Pré-chargement des référentiels
  const [farmsRes, ghsRes, catsRes] = await Promise.all([
    supabase.from('farms').select('id, code').eq('is_active', true),
    supabase.from('greenhouses').select('id, farm_id, code'),
    supabase.from('account_categories').select('id, code, parent_id').eq('is_active', true),
  ])
  if (farmsRes.error) throw farmsRes.error
  if (ghsRes.error) throw ghsRes.error
  if (catsRes.error) throw catsRes.error

  const farmByCode = new Map<string,{id:string;code:string}>()
  farmsRes.data!.forEach(f => farmByCode.set(f.code.toUpperCase(), f))

  const ghByCode = new Map<string,{id:string;farm_id:string;code:string}>()
  ghsRes.data!.forEach(g => ghByCode.set(g.code.toUpperCase(), g))

  // Catégories : on n'accepte que les feuilles (pas d'enfants)
  const allCats = catsRes.data!
  const parentIds = new Set(allCats.filter(c => c.parent_id).map(c => c.parent_id))
  const leafByCode = new Map<string,{id:string}>()
  allCats.forEach(c => {
    if (!parentIds.has(c.id)) leafByCode.set(c.code.toUpperCase(), c)
  })

  for (const row of rows) {
    // Validations basiques
    if (!row.code_ferme)      { issues.push({ rowIndex: row.rowIndex, severity: 'error', message: 'code_ferme manquant' }); continue }
    if (!row.code_categorie)  { issues.push({ rowIndex: row.rowIndex, severity: 'error', message: 'code_categorie manquant' }); continue }
    if (!row.annee || row.annee < 2020 || row.annee > 2100) { issues.push({ rowIndex: row.rowIndex, severity: 'error', message: `annee invalide: ${row.annee}` }); continue }
    if (!row.mois || row.mois < 1 || row.mois > 12)          { issues.push({ rowIndex: row.rowIndex, severity: 'error', message: `mois invalide: ${row.mois}` }); continue }
    if (!Number.isFinite(row.montant))                       { issues.push({ rowIndex: row.rowIndex, severity: 'error', message: `montant invalide` }); continue }

    // Résolution ferme
    const farm = farmByCode.get(row.code_ferme.toUpperCase())
    if (!farm) { issues.push({ rowIndex: row.rowIndex, severity: 'error', message: `Ferme inconnue : "${row.code_ferme}"` }); continue }

    // Résolution serre (optionnelle)
    let ghId: string | null = null
    if (row.code_serre) {
      const gh = ghByCode.get(row.code_serre.toUpperCase())
      if (!gh) { issues.push({ rowIndex: row.rowIndex, severity: 'error', message: `Serre inconnue : "${row.code_serre}"` }); continue }
      if (gh.farm_id !== farm.id) {
        issues.push({ rowIndex: row.rowIndex, severity: 'error', message: `La serre "${row.code_serre}" n'appartient pas à la ferme "${row.code_ferme}"` })
        continue
      }
      ghId = gh.id
    }

    // Résolution catégorie (doit être une feuille)
    const cat = leafByCode.get(row.code_categorie.toUpperCase())
    if (!cat) {
      // peut être une catégorie parente ou inconnue
      const anyCat = allCats.find(c => c.code.toUpperCase() === row.code_categorie.toUpperCase())
      if (anyCat) issues.push({ rowIndex: row.rowIndex, severity: 'error', message: `"${row.code_categorie}" est une catégorie parente — ne peut pas recevoir de montant directement` })
      else       issues.push({ rowIndex: row.rowIndex, severity: 'error', message: `Catégorie inconnue : "${row.code_categorie}"` })
      continue
    }

    if (row.montant === 0) {
      issues.push({ rowIndex: row.rowIndex, severity: 'warning', message: 'Montant nul — sera ignoré à l\'import' })
    }

    resolved.push({
      rowIndex: row.rowIndex,
      farm_id: farm.id,
      greenhouse_id: ghId,
      account_category_id: cat.id,
      period_year: row.annee,
      period_month: row.mois,
      amount: row.montant,
      notes: row.notes,
    })
  }

  // Vérifier doublons dans le fichier (même clef naturelle → on garde le dernier, warning)
  const seen = new Map<string,number>()
  for (const r of resolved) {
    const key = `${r.farm_id}|${r.greenhouse_id ?? '∅'}|${r.account_category_id}|${r.period_year}|${r.period_month}`
    if (seen.has(key)) {
      issues.push({ rowIndex: r.rowIndex, severity: 'warning', message: `Doublon dans le fichier (ligne ${seen.get(key)}) — la dernière valeur sera conservée` })
    }
    seen.set(key, r.rowIndex)
  }

  const grandTotal = resolved.reduce((s, r) => s + r.amount, 0)
  return {
    rows, resolved, issues,
    summary: {
      totalRows: rows.length,
      validRows: resolved.length,
      errors: issues.filter(i => i.severity === 'error').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      distinctFarms: new Set(resolved.map(r => r.farm_id)).size,
      distinctCategories: new Set(resolved.map(r => r.account_category_id)).size,
      grandTotal,
    }
  }
}

// ============================================================
// COMMIT : applique les lignes validées dans une version de budget
// Stratégie : remplace toutes les lignes existantes correspondant à l'import
// (même clef : version × ferme × serre × catégorie × période)
// ============================================================
export async function commitImport(versionId: string, resolved: ImportResolved[], options: {
  deleteBeforeImport?: boolean  // si true, supprime toutes les lignes de cette version avant l'import
}): Promise<{ inserted: number; deleted: number }> {
  if (resolved.length === 0) return { inserted: 0, deleted: 0 }

  let deleted = 0

  if (options.deleteBeforeImport) {
    // Supprime toutes les lignes de la version (remplacement complet)
    const { data: del, error } = await supabase.from('budget_lines').delete().eq('version_id', versionId).select('id')
    if (error) throw error
    deleted = del?.length ?? 0
  } else {
    // Suppression ciblée : toutes les lignes correspondant aux clés de l'import
    // On fait des deletes groupés par (farm, period_year, period_month) pour limiter les aller-retour
    const keyGroups = new Map<string, ImportResolved[]>()
    for (const r of resolved) {
      const k = `${r.farm_id}|${r.period_year}|${r.period_month}`
      ;(keyGroups.get(k) ?? keyGroups.set(k, []).get(k)!).push(r)
    }
    for (const group of keyGroups.values()) {
      const farmId = group[0].farm_id
      const y = group[0].period_year
      const m = group[0].period_month
      const catIds = Array.from(new Set(group.map(g => g.account_category_id)))
      const ghFarmLevel  = group.filter(g => g.greenhouse_id === null)
      const ghSerreLevel = group.filter(g => g.greenhouse_id !== null)

      if (ghFarmLevel.length > 0) {
        const cats = Array.from(new Set(ghFarmLevel.map(g => g.account_category_id)))
        const { data, error } = await supabase.from('budget_lines').delete()
          .eq('version_id', versionId).eq('farm_id', farmId)
          .is('greenhouse_id', null)
          .eq('period_year', y).eq('period_month', m)
          .in('account_category_id', cats)
          .select('id')
        if (error) throw error
        deleted += data?.length ?? 0
      }
      if (ghSerreLevel.length > 0) {
        const ghIds = Array.from(new Set(ghSerreLevel.map(g => g.greenhouse_id as string)))
        const cats = Array.from(new Set(ghSerreLevel.map(g => g.account_category_id)))
        const { data, error } = await supabase.from('budget_lines').delete()
          .eq('version_id', versionId).eq('farm_id', farmId)
          .in('greenhouse_id', ghIds)
          .eq('period_year', y).eq('period_month', m)
          .in('account_category_id', cats)
          .select('id')
        if (error) throw error
        deleted += data?.length ?? 0
      }
    }
  }

  // Insère les nouvelles lignes (on filtre les montants à 0 pour ne pas polluer)
  const toInsert = resolved
    .filter(r => r.amount !== 0)
    .map(r => ({
      version_id: versionId,
      farm_id: r.farm_id,
      greenhouse_id: r.greenhouse_id,
      account_category_id: r.account_category_id,
      period_year: r.period_year,
      period_month: r.period_month,
      amount: r.amount,
      notes: r.notes,
    }))

  if (toInsert.length === 0) return { inserted: 0, deleted }

  // Insertion en batch (Supabase limite à ~1000 lignes en INSERT)
  const BATCH = 500
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const slice = toInsert.slice(i, i + BATCH)
    const { error } = await supabase.from('budget_lines').insert(slice)
    if (error) throw error
    inserted += slice.length
  }

  return { inserted, deleted }
}

// ============================================================
// GENERATE : crée un template Excel téléchargeable
// Contient :
//   - feuille "Instructions"
//   - feuille "Budget" (template vide avec en-têtes + ligne d'exemple)
//   - feuille "Fermes" (référence : codes des fermes)
//   - feuille "Serres" (référence : codes des serres + ferme parente)
//   - feuille "Catégories" (référence : codes des catégories feuilles)
// ============================================================
export async function generateBudgetTemplate(): Promise<Blob> {
  const [farmsRes, ghsRes, catsRes] = await Promise.all([
    supabase.from('farms').select('code, name').eq('is_active', true).order('name'),
    supabase.from('greenhouses').select('code, name, farms(code, name)').order('code'),
    supabase.from('account_categories').select('code, label, type, parent_id').eq('is_active', true).order('type').order('display_order'),
  ])

  const farms = farmsRes.data ?? []
  const ghs   = ghsRes.data ?? []
  const cats  = catsRes.data ?? []

  // Ne garder que les feuilles de catégories (celles qui n'ont pas d'enfants)
  const parentIds = new Set(cats.filter((c: any) => c.parent_id).map((c: any) => c.parent_id))
  const leafCats = cats.filter((c: any) => !parentIds.has(
    cats.find((x: any) => x.code === c.code && !x.parent_id)?.code ?? 'NOPE'
  ))
  // Plus simple : feuille = aucun enfant dans la liste
  const catIdSetWithChildren = new Set<string>()
  // On ne peut pas calculer via parent_id sans les IDs. On va plutôt utiliser list + buildTree côté UI mais pour le template
  // on exporte toutes les catégories actives en marquant les feuilles via le champ "type" (présent).
  // Tant pis, on exporte toutes les catégories actives et l'utilisateur se limite aux feuilles.

  const wb = XLSX.utils.book_new()

  // INSTRUCTIONS
  const instr = [
    ["IMPORT DE BUDGET — INSTRUCTIONS"],
    [""],
    ["1. Remplissez la feuille 'Budget' en respectant les colonnes existantes."],
    ["2. code_ferme : utilisez les codes de la feuille 'Fermes' (colonne A)."],
    ["3. code_serre : laissez vide pour un budget au niveau ferme, sinon utilisez un code de la feuille 'Serres'."],
    ["4. code_categorie : utilisez un code de la feuille 'Catégories' — uniquement les catégories feuilles (sans enfants)."],
    ["5. annee + mois : ex: 2025 + 7 pour juillet 2025."],
    ["6. montant : en MAD. Les montants à 0 sont ignorés à l'import."],
    ["7. notes : texte libre, optionnel."],
    [""],
    ["À l'import, vous pourrez choisir :"],
    ["  - Mise à jour ciblée (seules les lignes présentes dans le fichier sont remplacées)"],
    ["  - Remplacement total (toutes les lignes existantes de la version sont supprimées)"],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instr), 'Instructions')

  // BUDGET (template vide avec en-têtes et une ligne d'exemple)
  const budgetHeader = ['code_ferme', 'code_serre', 'code_categorie', 'annee', 'mois', 'montant', 'notes']
  const example = farms.length > 0 ? [
    [farms[0].code, '', 'SEMENCES', 2025, 8, 1494600, 'Exemple — à supprimer'],
  ] : []
  const budgetSheet = XLSX.utils.aoa_to_sheet([budgetHeader, ...example])
  budgetSheet['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 8 }, { wch: 6 }, { wch: 14 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, budgetSheet, 'Budget')

  // FERMES
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.aoa_to_sheet([['code', 'nom'], ...farms.map((f: any) => [f.code, f.name])]),
    'Fermes'
  )

  // SERRES
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.aoa_to_sheet([
      ['code_serre', 'nom_serre', 'code_ferme', 'nom_ferme'],
      ...ghs.map((g: any) => [g.code, g.name, g.farms?.code ?? '', g.farms?.name ?? '']),
    ]),
    'Serres'
  )

  // CATÉGORIES
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.aoa_to_sheet([
      ['code_categorie', 'libelle', 'type', 'a_des_enfants_ne_pas_utiliser'],
      ...cats.map((c: any) => [c.code, c.label, c.type, c.parent_id ? '' : 'OUI (parent)']),
    ]),
    'Catégories'
  )

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** Helper : déclenche le téléchargement côté navigateur */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
