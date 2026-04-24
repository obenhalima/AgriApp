import { supabase } from './supabase'

export type CostEntryInput = {
  campaign_id: string
  farm_id?: string           // pour la répartition ; non persisté directement (déduit via greenhouse ou campaign)
  greenhouse_id?: string | null
  account_category_id: string
  cost_category?: string | null     // legacy — auto-rempli depuis account_category.code si non fourni
  amount: number
  entry_date: string
  description?: string | null
  is_planned?: boolean
}

export type CostEntry = {
  id: string
  campaign_id: string
  greenhouse_id: string | null
  account_category_id: string | null
  cost_category: string | null
  amount: number
  entry_date: string
  description: string | null
  is_planned: boolean
  created_at: string
}

// ============================================================
// 1. Saisie unique
// ============================================================
export async function createCostEntry(input: CostEntryInput): Promise<CostEntry> {
  // Récupérer le code de la catégorie pour remplir cost_category (legacy)
  let legacyCode = input.cost_category
  if (!legacyCode && input.account_category_id) {
    const { data } = await supabase
      .from('account_categories')
      .select('code')
      .eq('id', input.account_category_id)
      .maybeSingle()
    legacyCode = data?.code?.toLowerCase() ?? 'divers'
  }

  const { data, error } = await supabase.from('cost_entries').insert({
    campaign_id: input.campaign_id,
    greenhouse_id: input.greenhouse_id ?? null,
    account_category_id: input.account_category_id,
    cost_category: legacyCode ?? 'divers',
    amount: Math.round(input.amount * 100) / 100,
    entry_date: input.entry_date,
    description: input.description ?? null,
    is_planned: input.is_planned ?? false,
  }).select('*, campaigns(name), greenhouses(code,name,exploitable_area), account_categories(id,parent_id,code,label,type,level)').single()

  if (error) throw error
  return data as any as CostEntry
}

// ============================================================
// 2. Répartition mensuelle
//    Étale un montant total sur N mois consécutifs à partir d'une date de début.
//    Mode 'linear'  → parts égales
//    Mode 'prorata' → au prorata du nombre de jours de chaque mois (plus réaliste)
// ============================================================
export type MonthlyDistribution = {
  startDate: string        // ISO : première date à enregistrer
  months: number           // nombre de mois à couvrir (>= 1)
  distribution: 'linear' | 'prorata'
}

export async function createCostEntriesMonthly(
  base: Omit<CostEntryInput, 'entry_date'> & { total_amount: number },
  dist: MonthlyDistribution
): Promise<{ created: CostEntry[]; totalDistributed: number }> {
  const total = Number(base.total_amount) || 0
  const n = Math.max(1, Math.floor(dist.months))
  if (total <= 0) throw new Error('Montant total doit être > 0')

  // Génère les dates (1er du mois)
  const startParts = dist.startDate.split('-').map(Number)
  const d0 = new Date(startParts[0], startParts[1] - 1, 1)
  const periods: { date: string; daysInMonth: number }[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(d0.getFullYear(), d0.getMonth() + i, 1)
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    periods.push({ date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`, daysInMonth: dim })
  }

  let amounts: number[]
  if (dist.distribution === 'linear') {
    // Parts égales avec ajustement sur la dernière pour que la somme = total
    const part = Math.round((total / n) * 100) / 100
    amounts = Array(n - 1).fill(part)
    const remainder = Math.round((total - part * (n - 1)) * 100) / 100
    amounts.push(remainder)
  } else {
    // Prorata des jours
    const totalDays = periods.reduce((s, p) => s + p.daysInMonth, 0)
    const raw = periods.map(p => total * p.daysInMonth / totalDays)
    // Arrondi à 2 décimales avec ajustement sur la dernière
    const rounded = raw.map(v => Math.round(v * 100) / 100)
    const adjustedLast = Math.round((total - rounded.slice(0, -1).reduce((s, v) => s + v, 0)) * 100) / 100
    rounded[rounded.length - 1] = adjustedLast
    amounts = rounded
  }

  const created: CostEntry[] = []
  for (let i = 0; i < n; i++) {
    const entry = await createCostEntry({
      ...base,
      amount: amounts[i],
      entry_date: periods[i].date,
      description: base.description
        ? `${base.description} (${i + 1}/${n})`
        : `Répartition mensuelle ${i + 1}/${n}`,
    })
    created.push(entry)
  }

  return { created, totalDistributed: amounts.reduce((s, v) => s + v, 0) }
}

// ============================================================
// 2bis. Répartition mensuelle × surface (combinée)
//    Étale un montant sur N mois ET sur les serres d'une ferme au prorata
//    des surfaces. Crée N × G entrées où G = nombre de serres sélectionnées.
//
//    Pour chaque mois : quote-part temporelle = total × (jours_mois / jours_total)
//    Pour chaque serre dans ce mois : part = quote-part × (surface_serre / surface_totale)
// ============================================================
export async function createCostEntriesMonthlyBySurface(
  base: Omit<CostEntryInput, 'entry_date' | 'greenhouse_id'> & { total_amount: number },
  dist: MonthlyDistribution,
  greenhouses: { id: string; code: string; name: string; exploitable_area: number | null; total_area: number | null }[],
  selectedIds?: string[]
): Promise<{ created: CostEntry[]; totalDistributed: number; byMonth: { date: string; amount: number }[] }> {
  const total = Number(base.total_amount) || 0
  if (total <= 0) throw new Error('Montant total doit être > 0')

  const filtered = selectedIds?.length
    ? greenhouses.filter(g => selectedIds.includes(g.id))
    : greenhouses
  if (filtered.length === 0) throw new Error('Aucune serre sélectionnée pour la répartition')

  const surfaceOf = (g: typeof filtered[number]) => Number(g.exploitable_area || g.total_area || 0)
  const totalSurface = filtered.reduce((s, g) => s + surfaceOf(g), 0)
  if (totalSurface <= 0) throw new Error('Somme des surfaces = 0 — impossible de répartir')

  // 1. Générer les périodes mensuelles
  const n = Math.max(1, Math.floor(dist.months))
  const startParts = dist.startDate.split('-').map(Number)
  const d0 = new Date(startParts[0], startParts[1] - 1, 1)
  const periods: { date: string; daysInMonth: number }[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(d0.getFullYear(), d0.getMonth() + i, 1)
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    periods.push({ date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`, daysInMonth: dim })
  }

  // 2. Pour chaque mois, calculer le montant mensuel
  let monthlyAmounts: number[]
  if (dist.distribution === 'linear') {
    const part = Math.round((total / n) * 100) / 100
    monthlyAmounts = Array(n - 1).fill(part)
    monthlyAmounts.push(Math.round((total - part * (n - 1)) * 100) / 100)
  } else {
    const totalDays = periods.reduce((s, p) => s + p.daysInMonth, 0)
    const raw = periods.map(p => total * p.daysInMonth / totalDays)
    const rounded = raw.map(v => Math.round(v * 100) / 100)
    rounded[rounded.length - 1] = Math.round((total - rounded.slice(0, -1).reduce((s, v) => s + v, 0)) * 100) / 100
    monthlyAmounts = rounded
  }

  // 3. Pour chaque mois × chaque serre, calculer la part et créer les entrées
  const created: CostEntry[] = []
  const byMonth: { date: string; amount: number }[] = []

  for (let i = 0; i < n; i++) {
    const monthAmount = monthlyAmounts[i]
    const monthDate = periods[i].date
    byMonth.push({ date: monthDate, amount: monthAmount })

    // Répartition de ce montant mensuel au prorata des surfaces
    const raw = filtered.map(g => (monthAmount * surfaceOf(g)) / totalSurface)
    const rounded = raw.map(v => Math.round(v * 100) / 100)
    // Ajustement sur la dernière ligne pour que la somme = monthAmount
    const adjusted = Math.round((monthAmount - rounded.slice(0, -1).reduce((s, v) => s + v, 0)) * 100) / 100
    rounded[rounded.length - 1] = adjusted

    for (let j = 0; j < filtered.length; j++) {
      const g = filtered[j]
      if (rounded[j] === 0) continue
      const entry = await createCostEntry({
        ...base,
        greenhouse_id: g.id,
        amount: rounded[j],
        entry_date: monthDate,
        description: base.description
          ? `${base.description} — ${g.code} (${i + 1}/${n})`
          : `Mensuel × surface — ${g.code} (${i + 1}/${n})`,
      })
      created.push(entry)
    }
  }

  return { created, totalDistributed: monthlyAmounts.reduce((s, v) => s + v, 0), byMonth }
}

// ============================================================
// 3. Répartition par surface
//    Étale un montant sur les serres d'une ferme au prorata de la surface exploitable.
// ============================================================
export type SurfaceDistributionGreenhouse = {
  id: string
  code: string
  name: string
  exploitable_area: number | null
  total_area: number | null
}

export async function getGreenhousesForSurfaceDistribution(farmId: string): Promise<SurfaceDistributionGreenhouse[]> {
  const { data, error } = await supabase
    .from('greenhouses')
    .select('id, code, name, exploitable_area, total_area, farm_id')
    .eq('farm_id', farmId)
    .order('code')
  if (error) throw error
  return (data ?? []) as any
}

export async function createCostEntriesBySurface(
  base: Omit<CostEntryInput, 'greenhouse_id'> & { total_amount: number },
  greenhouses: SurfaceDistributionGreenhouse[],
  selectedIds?: string[]   // si fourni, restreint à ces serres
): Promise<{ created: CostEntry[]; breakdown: { greenhouse_id: string; surface: number; amount: number }[] }> {
  const total = Number(base.total_amount) || 0
  if (total <= 0) throw new Error('Montant total doit être > 0')

  const filtered = selectedIds
    ? greenhouses.filter(g => selectedIds.includes(g.id))
    : greenhouses
  if (filtered.length === 0) throw new Error('Aucune serre sélectionnée pour la répartition')

  const surfaceOf = (g: SurfaceDistributionGreenhouse) => Number(g.exploitable_area || g.total_area || 0)
  const totalSurface = filtered.reduce((s, g) => s + surfaceOf(g), 0)
  if (totalSurface <= 0) throw new Error('Somme des surfaces = 0 — impossible de répartir')

  // Calcul pro-rata + arrondi avec ajustement sur la dernière ligne
  const raw = filtered.map(g => (total * surfaceOf(g)) / totalSurface)
  const rounded = raw.map(v => Math.round(v * 100) / 100)
  const adjustedLast = Math.round((total - rounded.slice(0, -1).reduce((s, v) => s + v, 0)) * 100) / 100
  rounded[rounded.length - 1] = adjustedLast

  const created: CostEntry[] = []
  const breakdown: { greenhouse_id: string; surface: number; amount: number }[] = []
  for (let i = 0; i < filtered.length; i++) {
    const g = filtered[i]
    const entry = await createCostEntry({
      ...base,
      greenhouse_id: g.id,
      amount: rounded[i],
      description: base.description
        ? `${base.description} — ${g.code} (${surfaceOf(g)} m²)`
        : `Répartition surface — ${g.code}`,
    })
    created.push(entry)
    breakdown.push({ greenhouse_id: g.id, surface: surfaceOf(g), amount: rounded[i] })
  }

  return { created, breakdown }
}

// ============================================================
// BATCH : suppression et modification en masse
// ============================================================
export async function deleteCostEntries(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const BATCH = 200
  let deleted = 0
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH)
    const { data, error } = await supabase.from('cost_entries').delete().in('id', slice).select('id')
    if (error) throw error
    deleted += data?.length ?? 0
  }
  return deleted
}

export type AmountAdjustment =
  | { kind: 'set';      value: number }       // écrase avec une valeur absolue
  | { kind: 'multiply'; factor: number }      // amount = amount × factor
  | { kind: 'percent';  delta: number }       // amount = amount × (1 + delta/100)

export type DescriptionChange = { mode: 'replace' | 'prepend' | 'append'; text: string }

export async function bulkUpdateCostEntries(ids: string[], patch: Partial<{
  campaign_id: string
  account_category_id: string
  is_planned: boolean
  greenhouse_id: string | null
  entry_date: string
  description: DescriptionChange
  amount: AmountAdjustment
}>): Promise<number> {
  if (ids.length === 0) return 0
  if (Object.keys(patch).length === 0) return 0

  // ── Patches simples applicables en une seule requête ──
  const simplePatch: any = {}
  let hasSimple = false
  if (patch.campaign_id !== undefined) { simplePatch.campaign_id = patch.campaign_id; hasSimple = true }
  if (patch.is_planned !== undefined) { simplePatch.is_planned = patch.is_planned; hasSimple = true }
  if (patch.greenhouse_id !== undefined) { simplePatch.greenhouse_id = patch.greenhouse_id; hasSimple = true }
  if (patch.entry_date !== undefined) { simplePatch.entry_date = patch.entry_date; hasSimple = true }
  if (patch.account_category_id !== undefined) {
    simplePatch.account_category_id = patch.account_category_id
    const { data } = await supabase.from('account_categories').select('code').eq('id', patch.account_category_id).maybeSingle()
    simplePatch.cost_category = data?.code?.toLowerCase() ?? 'divers'
    hasSimple = true
  }
  // Pour description en mode "replace", c'est aussi un patch simple
  if (patch.description?.mode === 'replace') {
    simplePatch.description = patch.description.text
    hasSimple = true
  }
  // Montant en mode 'set' (valeur absolue) = patch simple
  if (patch.amount?.kind === 'set') {
    simplePatch.amount = Math.round(patch.amount.value * 100) / 100
    hasSimple = true
  }

  const BATCH = 200
  let updated = 0
  if (hasSimple) {
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH)
      const { data, error } = await supabase.from('cost_entries').update(simplePatch).in('id', slice).select('id')
      if (error) throw error
      updated += data?.length ?? 0
    }
  }

  // ── Patches nécessitant la valeur actuelle (amount multiply/percent, description prepend/append) ──
  const needsCurrent = (patch.amount && patch.amount.kind !== 'set')
    || (patch.description && patch.description.mode !== 'replace')

  if (needsCurrent) {
    // Charger les entrées sélectionnées
    const current: Record<string, { amount: number; description: string | null }> = {}
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH)
      const { data, error } = await supabase.from('cost_entries').select('id, amount, description').in('id', slice)
      if (error) throw error
      for (const r of data ?? []) current[r.id] = { amount: Number(r.amount || 0), description: r.description }
    }

    // Construire les updates individuels
    const updatesToApply: { id: string; body: any }[] = []
    for (const id of ids) {
      const cur = current[id]
      if (!cur) continue
      const body: any = {}

      if (patch.amount && patch.amount.kind !== 'set') {
        const factor = patch.amount.kind === 'multiply' ? patch.amount.factor : 1 + patch.amount.delta / 100
        body.amount = Math.round(cur.amount * factor * 100) / 100
      }
      if (patch.description && patch.description.mode !== 'replace') {
        const existing = cur.description ?? ''
        body.description = patch.description.mode === 'prepend'
          ? `${patch.description.text} ${existing}`.trim()
          : `${existing} ${patch.description.text}`.trim()
      }
      updatesToApply.push({ id, body })
    }

    // Appliquer un par un (Supabase ne supporte pas les UPDATE avec expression différente par ligne)
    for (const u of updatesToApply) {
      const { data, error } = await supabase.from('cost_entries').update(u.body).eq('id', u.id).select('id').single()
      if (error) throw error
      if (data) updated++
    }
  }

  return updated
}

// ============================================================
// LOAD : liste des coûts avec jointures
// ============================================================
export async function listCostEntries(filters?: {
  campaignId?: string
  farmId?: string
  isPlanned?: boolean
  limit?: number
}): Promise<CostEntry[]> {
  let q = supabase.from('cost_entries')
    .select('*, campaigns(name), greenhouses(code,name,farm_id), account_categories(id,parent_id,code,label,type,level)')
    .order('entry_date', { ascending: false })
    .limit(filters?.limit ?? 500)
  if (filters?.campaignId) q = q.eq('campaign_id', filters.campaignId)
  if (filters?.isPlanned !== undefined) q = q.eq('is_planned', filters.isPlanned)
  const { data, error } = await q
  if (error) throw error
  let res = (data ?? []) as any[]
  if (filters?.farmId) {
    res = res.filter(c => c.greenhouses?.farm_id === filters.farmId)
  }
  return res as CostEntry[]
}
