export const alertDefaults = { stock_enabled: true, treatment_enabled: true, harvest_enabled: true, treatment_horizon_days: 15, treatment_delay_hours: 0, no_harvest_days: 3 }
export type AlertSettings = typeof alertDefaults
export type OperationalAlert = { id: string; type: 'stock' | 'treatment_stock' | 'treatment_late' | 'no_harvest'; urgent: boolean; title: string; detail: string; farmId: string; warehouseId?: string; location: string; href: string }
export const alertLabels = { stock: 'Stock faible / épuisé', treatment_stock: 'Traitement : stock manquant', treatment_late: 'Traitement en retard', no_harvest: 'Absence de récolte' }
const one = (x: any) => Array.isArray(x) ? x[0] : x
const fmt = (n: any) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function dayInMorocco(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k)!.value).join('-')
}
export function buildOperationalAlerts(data: { stocks: any[]; balances: any[]; warehouses: any[]; requests: any[]; forecast: any[]; plantings: any[]; harvests: any[] }, settings: AlertSettings, now = new Date()): OperationalAlert[] {
  const alerts: OperationalAlert[] = [], today = dayInMorocco(now)
  const warehouse = new Map(data.warehouses.filter(w => w.is_active).map(w => [w.id, w]))
  const location = (id: string) => { const w = warehouse.get(id); return { warehouseId: id, farmId: w?.farm_id || '', location: [one(w?.farms)?.name, w?.name].filter(Boolean).join(' · ') || 'Entrepôt non renseigné' } }
  if (settings.stock_enabled) for (const s of data.stocks.filter(s => s.is_active)) {
    const balances = data.balances.filter(b => b.stock_item_id === s.id && warehouse.has(b.warehouse_id))
    const candidates = balances.map(b => ({ ...b, scope: location(b.warehouse_id) }))
    // Le seuil article porte sur le total client, le seuil entrepôt sur son propre solde.
    if (Number(s.min_qty) > 0 || !balances.length) candidates.push({ ...s, scope: { farmId: '', location: 'Total client' } })
    for (const b of candidates) {
      const qty = Number(b.current_qty), min = Number(b.min_qty || 0)
      if (!Number.isFinite(qty) || (qty > 0 && (min <= 0 || qty > min))) continue
      alerts.push({ id: `stock:${s.id}:${b.warehouse_id || 'total'}`, type: 'stock', urgent: qty <= 0, title: `${s.name} — ${qty <= 0 ? 'stock épuisé' : 'seuil atteint'}`, detail: `Disponible : ${fmt(qty)} ${s.unit} · Seuil : ${fmt(min)} ${s.unit}`, ...b.scope, href: '/stocks' })
    }
  }
  if (settings.treatment_enabled) for (const f of data.forecast) {
    const r = data.requests.find(r => r.id === f.request_id)
    if (!r || !['soumise', 'approuvee'].includes(r.status)) continue
    const date = new Date(r.planned_at), due = date.getTime()
    if (!Number.isFinite(due)) continue
    const label = `${r.target_name || 'Traitement'}${r.occurrence_number ? ` · occurrence ${r.occurrence_number}` : ''}`
    const context = location(r.warehouse_id), when = date.toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })
    if (due < now.getTime() - settings.treatment_delay_hours * 3600000) alerts.push({ id: `late:${r.id}`, type: 'treatment_late', urgent: true, title: label, detail: `Prévu le ${when} · ${r.status === 'soumise' ? 'validation encore attendue' : 'application non confirmée'}`, ...context, href: '/agronomie/traitements' })
    if (due <= now.getTime() + settings.treatment_horizon_days * 86400000 && f.stock_status !== 'disponible') alerts.push({ id: `short:${r.id}`, type: 'treatment_stock', urgent: due <= now.getTime(), title: label, detail: `Prévu le ${when} · ${(f.shortages || []).map((s: any) => `${s.product} : ${s.article_missing ? 'article à créer, ' : ''}manque ${fmt(s.missing)} ${s.unit || ''}`).join(' ; ') || 'Disponibilité insuffisante'}`, ...context, href: '/agronomie/traitements' })
  }
  if (settings.harvest_enabled) for (const p of data.plantings) {
    const campaign = one(p.campaigns), greenhouse = one(p.greenhouses)
    if (['termine', 'terminee', 'arrache', 'arrachee', 'annule', 'annulee'].includes(p.status) || ['terminee', 'annulee'].includes(campaign?.status)) continue
    const start = p.first_harvest_date || campaign?.harvest_start, end = p.last_harvest_date || campaign?.harvest_end
    if (!start || start > today || (end && end < today)) continue
    const last = data.harvests.filter(h => h.campaign_planting_id === p.id && h.harvest_date >= start && h.harvest_date <= today && Number(h.actual_kg ?? h.estimated_kg ?? h.total_qty) > 0).map(h => h.harvest_date).sort().at(-1)
    const days = Math.floor((Date.parse(today) - Date.parse(last || start)) / 86400000)
    if (!Number.isFinite(days) || days < settings.no_harvest_days) continue
    alerts.push({ id: `harvest:${p.id}`, type: 'no_harvest', urgent: false, title: `${greenhouse?.code || greenhouse?.name || 'Serre'} · ${one(p.varieties)?.commercial_name || 'Plantation'}`, detail: last ? `Aucune récolte positive enregistrée depuis ${days} jours (dernière : ${last}).` : `Aucune récolte positive enregistrée depuis le début prévu (${start}), soit ${days} jours.`, farmId: greenhouse?.farm_id || '', location: one(greenhouse?.farms)?.name || '', href: '/recoltes' })
  }
  return alerts.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.title.localeCompare(b.title, 'fr'))
}
