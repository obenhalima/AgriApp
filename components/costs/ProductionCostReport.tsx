'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { buildProductionCosts, costRatio, CostData, CostSummary } from '@/lib/productionCosting'
import { formatPlanNumber as fmt } from '@/lib/farmLayout'

const field = 'rounded border border-slate-300 bg-white p-2 text-sm text-slate-900 disabled:opacity-50'
export function ProductionCostReport({ fixedCampaign, fixedGreenhouse, compact = false }: { fixedCampaign?: string; fixedGreenhouse?: string; compact?: boolean }) {
  const { activeDomain, hasPermission } = useAuth()
  const domain = activeDomain?.domain_id
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [campaign, setCampaign] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [farm, setFarm] = useState('')
  const [level, setLevel] = useState('serre')
  const [data, setData] = useState<CostData | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [updating, setUpdating] = useState(false)
  const [reviewId, setReviewId] = useState('')
  const [reviewPlanting, setReviewPlanting] = useState('')
  const [reviewPrice, setReviewPrice] = useState('')
  const [reviewReason, setReviewReason] = useState('')
  useEffect(() => {
    setCampaign(''); setFarm(''); setData(null)
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
  const details = (r: CostSummary) => <>
    <td className="p-2">{fmt(r.direct)}</td><td className="p-2">{fmt(r.shared)}</td><td className="p-2 font-semibold">{fmt(r.direct + r.shared)}</td>
    <td className="p-2">{fmt(r.gross)}</td><td className="p-2">{fmt(costRatio(r.direct, r.gross))}</td>
    <td className="p-2 font-semibold">{fmt(costRatio(r.direct + r.shared, r.gross))}</td><td className="p-2">{fmt(costRatio(r.direct + r.shared, r.sorted))}</td>
    <td className="p-2">{fmt(r.planned)}</td><td className="p-2">{fmt(r.targetMissing ? null : costRatio(r.planned, r.target))}</td><td className="p-2">{fmt(r.direct + r.shared - r.planned)}</td>
  </>
  if (!hasPermission('couts', 'view')) return <p>Droit de consultation des coûts requis.</p>
  return <section className="space-y-4">
    <h2 className="text-lg font-semibold">Coûts de production et stock valorisé</h2>
    {!compact && <div className="flex flex-wrap gap-2">
      <select aria-label="Campagne des coûts" className={field} value={campaign} onChange={e => setCampaign(e.target.value)}><option value="">Toutes les campagnes</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <label>Du <input aria-label="Début de période" className={field} type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>Au <input aria-label="Fin de période" className={field} type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
      <select className={field} aria-label="Niveau de consolidation" value={level} onChange={e => setLevel(e.target.value)}><option value="serre">Par serre</option><option value="ferme">Par ferme</option><option value="client">Client / société</option></select>
      {level !== 'client' && <select aria-label="Ferme des coûts" className={field} value={farm} onChange={e => setFarm(e.target.value)}><option value="">Toutes les fermes</option>{result?.farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
      <button className={field} disabled={busy} onClick={() => setRevision(v => v + 1)}>Actualiser</button>
    </div>}
    <p className="text-sm text-slate-500">Indicateurs provisoires : coûts saisis et consommations valorisées de la période, pas une clôture comptable. Le coût complet inclut les charges communes affectées. Récolté = toutes catégories, déchets inclus ; hors déchets = catégories 1, 2 et 3, avant tri station. Aucun ratio en l’absence de récolte.</p>
    {busy && <p>Chargement…</p>}{error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
    {result && data && <>
      {(data.pending_movements.length > 0 || result.unallocated !== 0 || result.company.provisional) && <p className="rounded bg-amber-50 p-3 text-amber-900">Coûts incomplets ou provisoires : {data.pending_movements.length} sortie(s) sans imputation, {fmt(result.unallocated)} DH de charges non réparties. {result.company.provisional && 'Des prix repris de l’historique restent à vérifier.'} Les ratios ne sont pas certifiés complets.</p>}
      {compact ? rows.map(r => <div key={r.id} className="text-sm space-y-1"><p>Coûts directs : {fmt(r.direct)} DH</p><p>Charges communes affectées : {fmt(r.shared)} DH</p><p>Coût complet/kg récolté : <strong>{fmt(costRatio(r.direct + r.shared, r.gross))} DH/kg</strong></p><p>Budget saisi : {fmt(r.planned)} DH</p></div>) : <>
        <div className="overflow-auto rounded border"><table className="w-full text-right text-sm"><thead><tr className="bg-slate-100 text-slate-800">{['Périmètre', 'Direct DH', 'Commun DH', 'Total DH', 'Récolté kg', 'Direct/kg', 'Complet/kg', 'Hors déchets/kg', 'Budget DH', 'Budget/kg cible', 'Écart DH'].map(s => <th key={s} className="whitespace-nowrap p-2">{s}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.id} className="border-t"><th className="p-2 text-left">{r.name}</th>{details(r)}</tr>)}</tbody></table>{!rows.length && <p className="p-4">Aucune plantation dans ce périmètre.</p>}</div>
        <p className="text-sm">Budget non affecté : {fmt(result.plannedUnallocated)} DH. Un budget vide n’est pas une estimation automatique des coûts futurs.</p>
        <label className="flex flex-wrap gap-2 items-center">Répartition des charges communes de chaque campagne
          <select className={field} disabled={updating || !hasPermission('couts', 'edit')} value={data.basis} onChange={async e => {
            const value = e.target.value
            if (!window.confirm('Changer la clé analytique ? Les rapports seront recalculés, sans modifier les écritures sources.')) return
            setUpdating(true)
            try { const r = await supabase.from('cost_reporting_settings').upsert({ domain_id: domain, allocation_basis: value }); if (r.error) throw r.error; setRevision(v => v + 1) } catch (e: any) { setError(e.message) } finally { setUpdating(false) }
          }}><option value="surface">Surface plantée</option><option value="production">Quantité récoltée dans la période</option></select>
        </label>
        <details className="rounded border p-3"><summary>Sorties à rapprocher ({data.pending_movements.length})</summary><p className="text-sm">À valoriser ou à affecter avant d’utiliser les marges comme résultat définitif. Les pertes ne doivent pas être affectées à un traitement.</p>{data.pending_movements.slice(0, 100).map(m => <p className="text-sm" key={m.id}>{m.date} · {m.reference || m.id} · {m.reason} · {fmt(m.amount)} DH {hasPermission('couts', 'edit') && <button className={field} onClick={() => { setReviewId(m.id); setReviewPlanting(''); setReviewPrice(m.amount == null ? '' : String(Number(m.amount) / Number(m.quantity))); setReviewReason('') }}>Rapprocher</button>}</p>)}
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
        </details>
        <details className="rounded border p-3"><summary>Stock actuel au bilan de gestion — hors filtre campagne/période</summary>
          <p className="my-2 text-sm">Valeur connue en entrepôts : {fmt(data.inventory.reduce((s, i) => s + Number(i.value ?? 0), 0))} DH. En transit (valeur connue) : {fmt(Number(data.transit))} DH. {data.inventory.filter(i => Number(i.qty) > 0 && (!i.verified || i.value == null)).length} solde(s) à confirmer. Ce relevé n’est pas un bilan comptable arrêté.</p>
          <div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{['Entrepôt', 'Article', 'Quantité', 'CUMP DH', 'Valeur DH', 'Contrôle'].map(h => <th className="p-2 text-left" key={h}>{h}</th>)}</tr></thead><tbody>{data.inventory.map(i => <tr className="border-t" key={`${i.warehouse_id}:${i.stock_item_id}`}><td className="p-2">{i.warehouse_name}</td><td className="p-2">{i.item_name}</td><td className="p-2">{fmt(Number(i.qty))} {i.unit}</td><td className="p-2">{fmt(i.value == null ? null : costRatio(Number(i.value), Number(i.qty)))}</td><td className="p-2">{fmt(i.value == null ? null : Number(i.value))}</td><td className="p-2">{i.verified ? 'Confirmé' : 'À valoriser / confirmer'} {hasPermission('couts', 'edit') && Number(i.qty) > 0 && <button disabled={updating} className={field} onClick={async () => {
            const raw = window.prompt(`Coût unitaire en MAD par ${i.unit}. Cette correction du solde actuel ne recalcule pas les anciennes consommations.`, i.value == null ? '' : String(Number(i.value) / Number(i.qty)))
            if (raw == null) return
            const price = Number(raw.replace(/\s/g, '').replace(',', '.'))
            if (!raw.trim() || !Number.isFinite(price) || price < 0) { setError('Prix invalide'); return }
            const reason = window.prompt('Justificatif de la valorisation (source du prix, inventaire…)')
            if (!reason || reason.trim().length < 5) return
            setUpdating(true)
            try { const r = await supabase.rpc('confirm_inventory_value', { p_warehouse: i.warehouse_id, p_item: i.stock_item_id, p_expected_qty: Number(i.qty), p_unit_cost: price, p_reason: reason }); if (r.error) throw r.error; setRevision(v => v + 1) } catch (e: any) { setError(e.message) } finally { setUpdating(false) }
          }}>Valoriser</button>}</td></tr>)}</tbody></table></div>
        </details>
      </>}
    </>}
  </section>
}
