'use client'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { allocateProductionCosts, buildProductionCosts, costRatio, CostData, CostSummary } from '@/lib/productionCosting'
import { formatPlanNumber as fmt } from '@/lib/farmLayout'
import { InventoryValuationDialog, type ValuationItem } from './InventoryValuationDialog'
import { BarChart3, Package, ClipboardCheck, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { HistoricalCostDialog } from './HistoricalCostDialog'
import Link from 'next/link'
import { analyticalHref, type AnalyticalScope } from '@/lib/analyticalNavigation'

const field = 'rounded-md border border-border bg-surface-input px-3 py-2 text-sm text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50'
export function ProductionCostReport({ fixedCampaign, fixedGreenhouse, compact = false, compactKpiTarget, initialScope }: { fixedCampaign?: string; fixedGreenhouse?: string; compact?: boolean; compactKpiTarget?: HTMLElement | null; initialScope?: AnalyticalScope }) {
  const { activeDomain, hasPermission } = useAuth()
  const domain = activeDomain?.domain_id
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [campaign, setCampaign] = useState(initialScope?.campaign || '')
  const [start, setStart] = useState(initialScope?.start || '')
  const [end, setEnd] = useState(initialScope?.end || '')
  const [farm, setFarm] = useState(initialScope?.farm || '')
  const [level, setLevel] = useState(initialScope?.farm ? 'ferme' : 'serre')
  const [data, setData] = useState<CostData | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [updating, setUpdating] = useState(false)
  const [reviewId, setReviewId] = useState('')
  const [reviewPlanting, setReviewPlanting] = useState('')
  const [reviewPrice, setReviewPrice] = useState('')
  const [reviewReason, setReviewReason] = useState('')
  const [valuationItem, setValuationItem] = useState<ValuationItem|null>(null)
  const [valuationMessage, setValuationMessage] = useState('')
  const [tab, setTab] = useState<'production' | 'review' | 'stock'>(initialScope?.tab === 'stock' ? 'stock' : initialScope?.tab === 'review' ? 'review' : 'production')
  const [stockSearch, setStockSearch] = useState('')
  const [stockControl, setStockControl] = useState('all')
  const [historicalMovement, setHistoricalMovement] = useState('')
  useEffect(() => {
    setCampaign(initialScope?.campaign || ''); setFarm(initialScope?.farm || ''); setData(null)
    setValuationItem(null); setValuationMessage('')
    setStockSearch(''); setStockControl('all')
    if (!domain || compact) return
    let stop = false
    supabase.from('campaigns').select('id,name').eq('domain_id', domain).order('name').then(r => { if (!stop) { setCampaigns(r.data ?? []); if (r.error) setError(r.error.message) } })
    return () => { stop = true }
  }, [domain, compact])
  useEffect(() => {
    setData(null); setError('')
    if (!domain || !hasPermission('couts', 'view')) return
    const controller = new AbortController(); let stop = false
    const timer = setTimeout(() => controller.abort(), 25000)
    setBusy(true)
    Promise.resolve(supabase.rpc('get_production_cost_data', { p_domain: domain, p_campaign: fixedCampaign || campaign || null, p_start: start || null, p_end: end || null }).abortSignal(controller.signal))
      .then(r => { if (!stop) { if (r.error) throw r.error; setData(r.data as CostData) } })
      .catch(e => { if (!stop) setError(e.message || 'Chargement interrompu') })
      .finally(() => { clearTimeout(timer); if (!stop) setBusy(false) })
    return () => { stop = true; controller.abort(); clearTimeout(timer) }
  }, [domain, fixedCampaign, campaign, start, end, revision, hasPermission])
  const result = useMemo(() => data ? buildProductionCosts(data) : null, [data])
  const rows = result ? fixedGreenhouse ? result.greenhouses.filter(g => g.id === fixedGreenhouse)
    : level === 'client' ? [result.company] : level === 'ferme' ? result.farms.filter(f => !farm || f.id === farm) : result.greenhouses.filter(g => !farm || g.farm_id === farm) : []
  const totals = rows.reduce((s,r)=>({cost:s.cost+r.direct+r.shared,budget:s.budget+r.planned,kg:s.kg+r.gross}),{cost:0,budget:0,kg:0})
  const provisionalCosts = useMemo(() => {
    if (!data) return []
    const plantingIds = new Set(data.plantings.filter(p => fixedGreenhouse ? p.greenhouse_id === fixedGreenhouse : level === 'client' || !farm || p.farm_id === farm).map(p => p.id))
    const amounts = new Map<string, number>()
    for (const a of allocateProductionCosts(data).allocations) {
      if (!a.planned && a.provisional && plantingIds.has(a.plantingId)) amounts.set(a.costId, (amounts.get(a.costId) || 0) + a.amount)
    }
    return data.costs.filter(c => amounts.has(c.id)).map(c => ({ ...c, scopedAmount: amounts.get(c.id)! }))
  }, [data, fixedGreenhouse, level, farm])
  const inventory = (data?.inventory||[]).filter(i=>(stockControl!=='pending'||Number(i.qty)>0&&(!i.verified||i.value==null))&&`${i.item_name} ${i.warehouse_name}`.toLocaleLowerCase('fr').includes(stockSearch.toLocaleLowerCase('fr')))
  const details = (r: CostSummary) => <>
    <td className="p-2">{fmt(r.direct)}</td><td className="p-2">{fmt(r.shared)}</td><td className="p-2 font-semibold">{fmt(r.direct + r.shared)}</td>
    <td className="p-2">{fmt(r.gross)}</td><td className="p-2">{fmt(costRatio(r.direct, r.gross))}</td>
    <td className="p-2 font-semibold">{fmt(costRatio(r.direct + r.shared, r.gross))}</td><td className="p-2">{fmt(costRatio(r.direct + r.shared, r.sorted))}</td>
    <td className="p-2">{fmt(r.planned)}</td><td className="p-2">{fmt(r.targetMissing ? null : costRatio(r.planned, r.target))}</td><td className="p-2">{fmt(r.direct + r.shared - r.planned)}</td>
  </>
  const placeKpis = (content: ReactNode) => compactKpiTarget ? createPortal(content, compactKpiTarget) : content
  if (!hasPermission('couts', 'view')) return <>{compactKpiTarget && placeKpis(<p className="text-sm text-fg-secondary">Droit de consultation des coûts requis.</p>)}<p>Droit de consultation des coûts requis.</p></>
  return <section className="min-w-0 space-y-5">
    {!compact&&domain&&<nav aria-label="Parcours analytique" className="flex flex-wrap gap-3 text-sm"><Link className="text-brand underline" href={analyticalHref('/agronomie/dashboard',domain,{campaign,farm})}>← Vue de mon exploitation</Link><Link className="text-brand underline" href={analyticalHref('/couts/performance',domain,{campaign,farm,start,end,metric:'costKg',level:level==='ferme'?'farm':'greenhouse'})}>Comparer les performances du même périmètre →</Link></nav>}
    {compact ? <h2 className="text-lg font-semibold">{compactKpiTarget ? 'Détails et contrôles des coûts' : 'Coûts de production'}</h2> : <PageHeader title="Coûts de production et stock valorisé" subtitle="Pilotage financier" icon={BarChart3} iconColor="#8b5cf6" description="Suivez les coûts consommés, contrôlez les imputations et valorisez les stocks." />}
    {compactKpiTarget && !result && placeKpis(<p className="text-sm text-fg-secondary">{error ? 'Indicateurs financiers indisponibles — voir le détail en bas.' : 'Chargement des indicateurs financiers…'}</p>)}
    {!compact && <>
    <nav aria-label="Rubriques du pilotage des coûts" className="flex flex-wrap gap-2 rounded-xl border border-border bg-surface-raised p-2">{([
      ['production','Coûts de production',BarChart3],['review','Sorties à rapprocher',ClipboardCheck],['stock','Stock valorisé',Package],
    ] as const).map(([value,label,Icon])=><button key={value} aria-pressed={tab===value} onClick={()=>setTab(value)} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${tab===value?'bg-brand text-white':'text-fg-secondary hover:bg-surface-input'}`}><Icon size={16}/>{label}{value==='review'&&data&&<span className="rounded bg-black/10 px-2 text-xs">{data.pending_movements.length}</span>}</button>)}</nav>
    {tab!=='stock'&&<div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-raised p-4">
      <label className="grid gap-1 text-xs text-fg-secondary">Campagne
      <select aria-label="Campagne des coûts" className={field} value={campaign} onChange={e => setCampaign(e.target.value)}><option value="">Toutes les campagnes</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </label><label className="grid gap-1 text-xs text-fg-secondary">Du <input aria-label="Début de période" className={field} type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label className="grid gap-1 text-xs text-fg-secondary">Au <input aria-label="Fin de période" className={field} type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
      {tab==='production'&&<><label className="grid gap-1 text-xs text-fg-secondary">Consolidation
      <select className={field} aria-label="Niveau de consolidation" value={level} onChange={e => setLevel(e.target.value)}><option value="serre">Par serre</option><option value="ferme">Par ferme</option><option value="client">Client / société</option></select>
      </label>{level !== 'client' && <label className="grid gap-1 text-xs text-fg-secondary">Ferme<select aria-label="Ferme des coûts" className={field} value={farm} onChange={e => setFarm(e.target.value)}><option value="">Toutes les fermes</option>{result?.farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}</>}
      <button className={`${field} inline-flex items-center gap-2`} disabled={busy} onClick={() => setRevision(v => v + 1)}><RefreshCw size={15}/>Actualiser</button>
    </div>}</>}
    {(compact||tab==='production')&&<p className="text-sm text-fg-secondary">Indicateurs provisoires, pas une clôture comptable. Le coût complet inclut les charges communes affectées. Récolté = toutes catégories, déchets inclus ; hors déchets = catégories 1, 2 et 3, avant tri station. Aucun ratio en l’absence de récolte.</p>}
    {busy && <p>Chargement…</p>}{error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
    {result && data && <>
      {(compact || tab !== 'stock') && (data.pending_movements.length > 0 || result.unallocated !== 0 || provisionalCosts.length > 0) && <div role="status" className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-fg-primary">
        {!!data.pending_movements.length && <p>{data.pending_movements.length} sortie(s) restent à imputer sur le client et la période sélectionnée.{!compact && <button className="ml-2 text-brand underline" onClick={() => setTab('review')}>Voir les sorties à rapprocher</button>}</p>}
        {result.unallocated !== 0 && <p>{fmt(result.unallocated)} DH de charges restent non réparties sur le client et la période sélectionnée.</p>}
        {!!provisionalCosts.length && <>
          <p><strong>Certains prix historiques restent à confirmer.</strong> {provisionalCosts.length} ligne(s) de coûts provisoires concernent le périmètre affiché. Le coût/kg reste provisoire.</p>
          <details className="rounded-md border border-warning/30 p-3"><summary className="cursor-pointer font-medium">Voir les coûts concernés ({provisionalCosts.length})</summary>
            <p className="my-3 text-xs text-fg-secondary">Ces montants proviennent des consommations historiques. Valoriser le stock actuel ne confirme pas ces coûts. Les montants ci-dessous correspondent à la part imputée au périmètre affiché.</p>
            <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Campagne', 'Affectation', 'Catégorie', 'Montant provisoire (DH)', 'Référence du coût'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
              <tbody>{provisionalCosts.map(c => <tr key={c.id} className="border-t border-border"><td className="p-2">{campaigns.find(x => x.id === c.campaign_id)?.name || c.campaign_id}</td><td className="p-2">{c.greenhouse_id ? data.plantings.find(p => p.greenhouse_id === c.greenhouse_id)?.greenhouse_name || c.greenhouse_id : 'Charge commune répartie'}</td><td className="p-2">{c.category}</td><td className="p-2 whitespace-nowrap tabular-nums">{fmt(c.scopedAmount)}</td><td className="p-2 break-all text-xs">{c.id}{hasPermission('couts','edit') && (c.source ? <button className={`${field} mt-2 block`} onClick={()=>setHistoricalMovement(c.source!)}>Vérifier et confirmer</button> : <p className="mt-2">Mouvement source absent : revue manuelle nécessaire.</p>)}</td></tr>)}</tbody>
            </table></div>
          </details>
        </>}
      </div>}
      {compact ? placeKpis(<>{provisionalCosts.length > 0 && <p className="mb-2 text-xs text-warning">Coûts provisoires — contrôles détaillés en bas de la fiche.</p>}{!rows.length && <p className="text-sm text-fg-secondary">Aucune donnée de coûts pour cette serre sur la campagne sélectionnée.</p>}{rows.map(r => <div key={r.id} className="grid grid-cols-2 gap-3 lg:grid-cols-3">{[
        ['Coûts directs', r.direct, 'DH'], ['Charges communes affectées', r.shared, 'DH'], ['Coût total', r.direct + r.shared, 'DH'],
        ['Coût / kg récolté', costRatio(r.direct + r.shared, r.gross), 'DH/kg'], ['Budget saisi', r.planned, 'DH'], ['Écart réalisé − budget', r.direct + r.shared - r.planned, 'DH'],
      ].map(([label, value, unit]) => <div key={String(label)} className="rounded-lg border border-border bg-surface-input p-3"><p className="text-xs text-fg-secondary">{label}</p><p className="mt-1 font-semibold tabular-nums">{fmt(value as number | null)} <span className="text-xs font-normal text-fg-tertiary">{unit}</span></p></div>)}</div>)}</>) : <>
        {tab==='production'&&<>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[['Coût total',totals.cost,'DH'],['Coût moyen / kg récolté',costRatio(totals.cost,totals.kg),'DH/kg'],['Budget saisi',totals.budget,'DH'],['Production récoltée',totals.kg,'kg']].map(([label,value,unit])=><div key={String(label)} className="rounded-xl border border-border bg-surface-raised p-4"><p className="text-xs text-fg-secondary">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums text-brand">{fmt(value as number|null)}</p><p className="text-xs text-fg-tertiary">{unit}</p></div>)}</div>
        <div className="overflow-auto rounded-xl border border-border bg-surface-raised"><table className="w-full text-right text-sm"><thead><tr className="bg-surface-input text-fg-secondary">{['Périmètre', 'Direct DH', 'Commun DH', 'Total DH', 'Récolté kg', 'Direct/kg', 'Complet/kg', 'Hors déchets/kg', 'Budget DH', 'Budget/kg cible', 'Écart DH'].map(s => <th key={s} className="whitespace-nowrap p-3 text-xs font-medium">{s}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.id} className="border-t border-border hover:bg-surface-input"><th className="p-3 text-left">{r.name}</th>{details(r)}</tr>)}</tbody></table>{!rows.length && <p className="p-4">Aucune plantation dans ce périmètre.</p>}</div>
        <p className="text-sm">Budget non affecté : {fmt(result.plannedUnallocated)} DH. Un budget vide n’est pas une estimation automatique des coûts futurs.</p>
        <label className="flex flex-wrap gap-2 items-center">Répartition des charges communes de chaque campagne
          <select className={field} disabled={updating || !hasPermission('couts', 'edit')} value={data.basis} onChange={async e => {
            const value = e.target.value
            if (!window.confirm('Changer la clé analytique ? Les rapports seront recalculés, sans modifier les écritures sources.')) return
            setUpdating(true)
            try { const r = await supabase.from('cost_reporting_settings').upsert({ domain_id: domain, allocation_basis: value }); if (r.error) throw r.error; setRevision(v => v + 1) } catch (e: any) { setError(e.message) } finally { setUpdating(false) }
          }}><option value="surface">Surface plantée</option><option value="production">Quantité récoltée dans la période</option></select>
        </label>
        </>}
        {tab==='review'&&<section className="space-y-4 rounded-xl border border-border bg-surface-raised p-5"><h3 className="font-semibold">Sorties à rapprocher ({data.pending_movements.length})</h3><p className="text-sm text-fg-secondary">À valoriser ou à affecter avant d’utiliser les marges comme résultat définitif. Les pertes ne doivent pas être affectées à un traitement.</p>{!data.pending_movements.length&&<p className="rounded-lg bg-success/10 p-4 text-success">Aucune sortie à rapprocher sur ce périmètre.</p>}{data.pending_movements.map(m => <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm" key={m.id}><div><strong>{m.reference || m.id}</strong><p className="text-fg-secondary">{m.date} · {m.reason} · {fmt(m.amount)} DH</p></div>{hasPermission('couts', 'edit') && <button className={field} onClick={() => { setReviewId(m.id); setReviewPlanting(''); setReviewPrice(m.amount == null ? '' : String(Number(m.amount) / Number(m.quantity))); setReviewReason('') }}>Rapprocher</button>}</div>)}
          {reviewId && <div className="mt-3 space-y-2 border-t pt-3"><p>Confirmer le prix historique par unité de stock et la plantation. Pour un traitement lié, ses cibles sont conservées automatiquement.</p>
            <select className={field} aria-label="Plantation d’imputation" value={reviewPlanting} onChange={e => setReviewPlanting(e.target.value)}><option value="">Cibles du traitement lié (sinon choisir une plantation)</option>{data.plantings.map(p => <option key={p.id} value={p.id}>{p.farm_name} — {p.greenhouse_name} — {campaigns.find(c => c.id === p.campaign_id)?.name ?? p.campaign_id}</option>)}</select>
            <input className={field} aria-label="Prix historique confirmé" placeholder="Coût unitaire MAD" value={reviewPrice} onChange={e => setReviewPrice(e.target.value)} />
            <input className={field} aria-label="Justificatif du rapprochement" placeholder="Justificatif / source du prix" value={reviewReason} onChange={e => setReviewReason(e.target.value)} />
            <button className={field} disabled={updating} onClick={async () => {
              const price = Number(reviewPrice.replace(/\s/g, '').replace(',', '.'))
              if (!reviewPrice.trim() || !Number.isFinite(price) || price < 0 || reviewReason.trim().length < 5) { setError('Prix et justificatif requis'); return }
              setUpdating(true)
              try { const r = await supabase.rpc('review_inventory_consumption', { p_movement: reviewId, p_planting: reviewPlanting || null, p_unit_cost: price, p_reason: reviewReason }); if (r.error) throw r.error; setReviewId(''); setRevision(v => v + 1) } catch (e: any) { setError(e.message) } finally { setUpdating(false) }
            }}>Confirmer l’imputation</button><button className={field} onClick={() => setReviewId('')}>Annuler</button>
          </div>}
        </section>}
        {tab==='stock'&&<section className="space-y-4 rounded-xl border border-border bg-surface-raised p-5"><h3 className="font-semibold">Stock actuel au bilan de gestion</h3><p className="text-sm text-fg-secondary">Tous les entrepôts du client — indépendant des filtres campagne, période et ferme de production.</p>
          <div className="flex flex-wrap gap-3"><input aria-label="Rechercher dans le stock valorisé" className={`${field} min-w-0 flex-1`} placeholder="Article ou entrepôt…" value={stockSearch} onChange={e=>setStockSearch(e.target.value)}/><select aria-label="Contrôle du stock" className={field} value={stockControl} onChange={e=>setStockControl(e.target.value)}><option value="all">Tous les articles</option><option value="pending">À valoriser / confirmer</option></select><button className={field} disabled={busy} onClick={()=>setRevision(v=>v+1)}>Actualiser</button></div>
          {valuationMessage&&<p role="status" className="my-2 rounded bg-green-50 p-3 text-green-800">{valuationMessage}</p>}
          <p className="my-2 text-sm">Valeur connue en entrepôts : {fmt(data.inventory.reduce((s, i) => s + Number(i.value ?? 0), 0))} DH. En transit (valeur connue) : {fmt(Number(data.transit))} DH. {data.inventory.filter(i => Number(i.qty) > 0 && (!i.verified || i.value == null)).length} solde(s) à confirmer. Ce relevé n’est pas un bilan comptable arrêté.</p>
          <div className="overflow-auto rounded-lg border border-border"><table className="w-full text-sm"><thead className="bg-surface-input text-fg-secondary"><tr>{['Entrepôt', 'Article', 'Quantité', 'CUMP DH', 'Valeur DH', 'Contrôle'].map(h => <th className="p-3 text-left text-xs" key={h}>{h}</th>)}</tr></thead><tbody>{inventory.map(i => <tr className="border-t border-border hover:bg-surface-input" key={`${i.warehouse_id}:${i.stock_item_id}`}><td className="p-3">{i.warehouse_name}</td><td className="p-3 font-medium">{i.item_name}</td><td className="p-3 whitespace-nowrap tabular-nums">{fmt(Number(i.qty))} {i.unit}</td><td className="p-3 whitespace-nowrap tabular-nums">{fmt(i.value == null ? null : costRatio(Number(i.value), Number(i.qty)))}</td><td className="p-3 whitespace-nowrap tabular-nums">{fmt(i.value == null ? null : Number(i.value))}</td><td className="p-3"><span className={`mr-2 text-xs ${i.verified&&i.value!=null?'text-success':'text-warning'}`}>{i.verified&&i.value!=null ? 'Confirmé' : 'À valoriser / confirmer'}</span> {hasPermission('couts', 'edit') && Number(i.qty) > 0 && <button disabled={updating} className={field} onClick={async () => {
            setValuationMessage(''); setValuationItem(i)
          }}>Valoriser</button>}</td></tr>)}</tbody></table>{!inventory.length&&<p className="p-4 text-sm text-fg-secondary">Aucun article ne correspond à ces filtres.</p>}</div>
        </section>}
      </>}
    </>}
    {valuationItem&&<InventoryValuationDialog key={`${valuationItem.warehouse_id}:${valuationItem.stock_item_id}`} item={valuationItem} onClose={()=>setValuationItem(null)} onConfirmed={()=>{setValuationMessage(`Valorisation confirmée pour ${valuationItem.item_name}.`);setValuationItem(null);setRevision(v=>v+1)}}/>}
    {historicalMovement&&<HistoricalCostDialog key={`${domain}:${historicalMovement}`} movement={historicalMovement} onClose={()=>setHistoricalMovement('')} onConfirmed={()=>{setHistoricalMovement('');setRevision(v=>v+1)}}/>}
  </section>
}
