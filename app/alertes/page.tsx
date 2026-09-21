'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui/PageHeader'
import { alertDefaults, alertLabels, AlertSettings, buildOperationalAlerts, OperationalAlert } from '@/lib/operationalAlerts'
import { culturalAlerts } from '@/lib/cultural'

// Paginer pour ne pas masquer une récolte derrière la limite PostgREST.
async function allRows(table: string, select: string, domain: string, signal: AbortSignal) {
  const rows: any[] = []
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from(table).select(select).eq('domain_id', domain)
    query = table === 'warehouse_stocks' ? query.order('warehouse_id').order('stock_item_id') : query.order('id')
    const r = await query.range(offset, offset + 499).abortSignal(signal)
    if (r.error) throw Error(`${table} : ${r.error.message}`)
    rows.push(...(r.data || []))
    if ((r.data || []).length < 500) return rows
  }
}
export default function AlertesPage() {
  const { activeDomain, isAdmin, isPlatformAdmin } = useAuth(), domain = activeDomain?.domain_id
  const [settings, setSettings] = useState<AlertSettings>(alertDefaults), [draft, setDraft] = useState<AlertSettings>(alertDefaults)
  const [data, setData] = useState<any>(null), [errors, setErrors] = useState<string[]>([]), [loading, setLoading] = useState(false)
  const [reload, setReload] = useState(0), [category, setCategory] = useState(''), [farm, setFarm] = useState(''), [wh, setWh] = useState('')
  const [showSettings, setShowSettings] = useState(false), [saving, setSaving] = useState(false), [message, setMessage] = useState(''), [loadedDomain, setLoadedDomain] = useState('')
  const [now, setNow] = useState(new Date()), [updated, setUpdated] = useState('')
  const currentDomain = useRef(domain); currentDomain.current = domain
  const editing = useRef(showSettings); editing.current = showSettings
  useEffect(() => { setFarm(''); setWh(''); setMessage(''); setShowSettings(false); setUpdated(''); setSettings(alertDefaults) }, [domain])
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') setReload(n => n + 1) }, 60000)
    const focus = () => setReload(n => n + 1)
    window.addEventListener('focus', focus)
    return () => { clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [])
  useEffect(() => {
    if (!domain) { setData(null); return }
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 30000)
    let cancelled = false
    setLoading(true); setErrors([])
    const load = async () => {
      const warnings: string[] = [], result: any = {}
      await Promise.all([
        ['stocks', 'stock_items', 'id,name,unit,current_qty,min_qty,is_active'],
        ['balances', 'warehouse_stocks', '*'],
        ['warehouses', 'warehouses', 'id,name,farm_id,is_active,farms(name)'],
        ['requests', 'treatment_requests', 'id,status,planned_at,target_name,warehouse_id,occurrence_number'],
        ['plantings', 'campaign_plantings', 'id,status,first_harvest_date,last_harvest_date,greenhouses(code,name,farm_id,farms(name)),varieties(commercial_name),campaigns(status,harvest_start,harvest_end)'],
        ['harvests', 'harvests', 'id,campaign_planting_id,harvest_date,total_qty,estimated_kg,actual_kg'],
      ].map(async ([key, table, select]) => { try { result[key] = await allRows(table, select, domain, controller.signal) } catch (e: any) { result[key] = []; warnings.push(e.message) } }))
      const forecastRows: any[] = []
      for (let offset = 0; ; offset += 500) {
        const r = await supabase.rpc('get_treatment_stock_forecast', { p_domain: domain }).order('request_id').range(offset, offset + 499).abortSignal(controller.signal)
        if (r.error) { warnings.push(`Prévision des traitements indisponible : ${r.error.message}`); forecastRows.length = 0; break }
        forecastRows.push(...(r.data || [])); if ((r.data || []).length < 500) break
      }
      const config = await supabase.from('operational_alert_settings').select('*').eq('domain_id', domain).abortSignal(controller.signal).maybeSingle()
      result.forecast = forecastRows
      const cultural = await supabase.rpc('cultural_workspace',{p_domain:domain}).abortSignal(controller.signal)
      if(cultural.error) warnings.push(`Interventions culturales indisponibles : ${cultural.error.message}`)
      else result.cultural=cultural.data
      if (config.error) warnings.push(`Paramétrage indisponible : valeurs par défaut utilisées. ${config.error.message}`)
      // Ne pas générer de fausses alertes à partir de sources non chargées.
      if (warnings.some(w => w.startsWith('harvests :'))) result.plantings = []
      if (warnings.some(w => w.startsWith('warehouse_stocks :') || w.startsWith('warehouses :'))) result.stocks = []
      if (cancelled) return
      const cfg = { ...alertDefaults, ...(config.data || {}) }
      setSettings(cfg); if (!editing.current) setDraft(cfg)
      setData(result); setLoadedDomain(domain); setErrors(warnings); setNow(new Date()); setUpdated(new Date().toLocaleTimeString('fr-FR')); setLoading(false)
    }
    load().catch(e => { if (!cancelled) { setErrors([String(e.message)]); setData(null); setLoading(false) } }).finally(() => clearTimeout(timeout))
    return () => { cancelled = true; clearTimeout(timeout); controller.abort() }
  }, [domain, reload])
  const alerts: OperationalAlert[] = data && loadedDomain === domain ? [...buildOperationalAlerts(data, settings, now),...(data.cultural?culturalAlerts(data.cultural,now):[])] : []
  const visible = alerts.filter(a => (!category || a.type === category) && (!farm || a.farmId === farm) && (!wh || a.warehouseId === wh))
  const farms = Array.from(new Map(alerts.filter(a => a.farmId).map(a => [a.farmId, a.location.split(' · ')[0]])).entries())
  async function save() {
    if (!domain) return
    const target = domain
    if (![draft.treatment_horizon_days, draft.no_harvest_days].every(n => Number.isInteger(n) && n >= 1 && n <= 365) || !Number.isInteger(draft.treatment_delay_hours) || draft.treatment_delay_hours < 0 || draft.treatment_delay_hours > 720) { setMessage('Saisir des jours entiers entre 1 et 365 et une tolérance entre 0 et 720 heures.'); return }
    setSaving(true); setMessage('')
    try {
      const payload = Object.fromEntries(Object.keys(alertDefaults).map(k => [k, draft[k as keyof AlertSettings]]))
      const r = await supabase.from('operational_alert_settings').upsert({ ...payload, domain_id: target }).abortSignal(AbortSignal.timeout(20000))
      if (r.error) throw r.error
      if (currentDomain.current === target) { setSettings(draft); setMessage('Paramètres enregistrés pour ce client.'); setReload(n => n + 1) }
    } catch (e: any) { if (currentDomain.current === target) setMessage(e.message) } finally { setSaving(false) }
  }
  return <main className="space-y-4">
    <PageHeader title="Alertes" subtitle="Surveillance de l’exploitation" icon={Bell} description="Alertes du client sélectionné, recalculées à partir des données métier." actions={<div className="flex gap-3"><button className="border rounded px-3 py-2" disabled={loading} onClick={() => setReload(n => n + 1)}>{loading ? 'Chargement…' : 'Actualiser'}</button>{(isAdmin || isPlatformAdmin) && <button className="border rounded px-3 py-2" disabled={loading || !domain} onClick={() => { setDraft(settings); setShowSettings(!showSettings) }}>Paramétrer</button>}</div>} />
    {!domain && <p>Sélectionnez un client / une société.</p>}
    {showSettings && domain && <section className="border rounded-lg p-4 space-y-3"><h2 className="font-bold">Paramètres du client sélectionné</h2>
      {([['stock_enabled', 'Stock'], ['treatment_enabled', 'Traitements'], ['harvest_enabled', 'Récoltes']] as const).map(([key, label]) => <label className="inline-flex gap-2 mr-5" key={key}><input type="checkbox" checked={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.checked })} />{label}</label>)}
      {([['treatment_horizon_days', 'Anticipation du stock des traitements (jours)', 1, 365], ['treatment_delay_hours', 'Tolérance de retard traitement (heures)', 0, 720], ['no_harvest_days', 'Alerte après absence de récolte (jours)', 1, 365]] as const).map(([key, label, min, max]) => <label className="flex flex-wrap items-center gap-3" key={key}>{label}<input className="border rounded p-2 w-24 bg-surface" type="number" min={min} max={max} step={1} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: Number(e.target.value) })} /></label>)}
      <p className="text-sm">Récoltes : uniquement pendant la période prévue de la plantation (ou de sa campagne). L’alerte signale une absence de saisie, pas nécessairement une absence de production.</p><button disabled={saving} className="border rounded px-4 py-2" onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button><p role="status">{message}</p></section>}
    {errors.length > 0 && <div role="alert" className="border border-amber-500 rounded p-3"><strong>Résultat partiel — certaines données ne sont pas disponibles.</strong>{errors.map((e, i) => <p key={i} className="text-sm">{e}</p>)}</div>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Object.entries(alertLabels).map(([key, label]) => <button key={key} className={`border rounded-lg p-4 text-left ${category === key ? 'ring-2 ring-violet-500' : ''}`} onClick={() => setCategory(category === key ? '' : key)}><div className="text-sm">{label}</div><strong className="text-2xl">{alerts.filter(a => a.type === key).length}</strong></button>)}</div>
    <div className="flex flex-wrap gap-3"><select aria-label="Type d’alerte" className="border rounded p-2 bg-surface" value={category} onChange={e => setCategory(e.target.value)}><option value="">Tous les types</option>{Object.entries(alertLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><select aria-label="Ferme" className="border rounded p-2 bg-surface" value={farm} onChange={e => { setFarm(e.target.value); setWh('') }}><option value="">Toutes les fermes / total client</option>{farms.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><select aria-label="Entrepôt" className="border rounded p-2 bg-surface" value={wh} onChange={e => setWh(e.target.value)}><option value="">Tous les entrepôts</option>{(loadedDomain === domain ? data?.warehouses || [] : []).filter((w: any) => w.is_active && (!farm || w.farm_id === farm)).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
    <p className="text-sm">{visible.length} alerte(s) affichée(s){updated && ` · Dernier calcul : ${updated}`} · Actualisation automatique chaque minute.</p>
    {!loading && domain && !visible.length && <p className="border rounded p-5">{errors.length ? 'Aucune alerte dans les données chargées ; le contrôle reste incomplet.' : 'Aucune alerte détectée pour ces filtres et les règles activées.'}</p>}
    {visible.map(a => <article key={a.id} className={`border rounded-lg p-4 ${a.urgent ? 'border-red-300' : 'border-amber-300'}`}><div className="flex justify-between gap-3"><div><p className="text-xs uppercase">{alertLabels[a.type]} · {a.urgent ? 'À traiter' : 'À surveiller'}</p><h2 className="font-bold mt-1">{a.title}</h2><p className="text-sm">{a.location}</p></div><Link className="underline shrink-0" href={a.href}>Ouvrir le module</Link></div><p className="mt-2 text-sm">{a.detail}</p></article>)}
    <p className="text-sm text-fg-tertiary">Ces alertes disparaissent lorsque leur cause est corrigée. Les manques de stock des traitements sont cumulés par occurrence et entrepôt. Ce centre n’envoie pas, à lui seul, de notifications push.</p>
  </main>
}
