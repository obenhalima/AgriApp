'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { FarmShape, newShape, normalizeShape, formatPlanNumber as fmt } from '@/lib/farmLayout'
import { ProductionCostReport } from '@/components/costs/ProductionCostReport'

type Greenhouse = { id: string; code: string; name: string; farm_id: string; total_area: number }
type Planting = { id: string; greenhouse_id: string; variety_id: string; planted_area: number; planting_date: string | null; status: string; target_total_production: number | null; target_yield_per_m2: number | null }
type Harvest = { id: string; campaign_planting_id: string; total_qty: number; harvest_date: string }
type Props = { domainId: string; farmId: string; campaignId: string; greenhouses: Greenhouse[]; onDirtyChange: (dirty: boolean) => void }
const control = 'rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed'
const statusLabel: Record<string, string> = { planifie: 'Planifiée', en_cours: 'En cours', termine: 'Terminée', terminee: 'Terminée', recolte: 'En récolte', annule: 'Annulée' }

export function FarmMapTab({ domainId, farmId, campaignId, greenhouses, onDirtyChange }: Props) {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('fermes', 'edit')
  const [shapes, setShapes] = useState<FarmShape[]>([])
  const [saved, setSaved] = useState<FarmShape[]>([])
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState('')
  const [toAdd, setToAdd] = useState('')
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)
  const [plantings, setPlantings] = useState<Planting[]>([])
  const [harvests, setHarvests] = useState<Harvest[]>([])
  const [varieties, setVarieties] = useState<Record<string, string>>({})
  const [dataError, setDataError] = useState('')
  const [dataBusy, setDataBusy] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: string; x: number; y: number; ox: number; oy: number } | null>(null)
  const scopeGreenhouses = greenhouses.filter(g => g.farm_id === farmId)
  const missing = scopeGreenhouses.filter(g => !shapes.some(s => s.greenhouse_id === g.id))
  const greenhouse = scopeGreenhouses.find(g => g.id === selected)
  const shape = shapes.find(s => s.greenhouse_id === selected)
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    const timeout = setTimeout(() => controller.abort(), 20000)
    setBusy(true); setError('')
    Promise.resolve(supabase.from('farm_schematic_plans').select('shapes,revision').eq('domain_id', domainId).eq('farm_id', farmId)
      .abortSignal(controller.signal).maybeSingle()).then(({ data, error: err }) => {
        if (cancelled) return
        if (err) { setError(`Chargement du plan impossible : ${err.message}. Vérifiez que la migration 114 est appliquée.`); return }
        const layout = (data?.shapes ?? []) as FarmShape[]
        setShapes(layout); setSaved(layout); setRevision(data?.revision ?? 0); setDirty(false); setEditing(false)
      }).catch((e: any) => { if (!cancelled) setError(`Chargement du plan impossible : ${e.message}`) })
      .finally(() => { clearTimeout(timeout); if (!cancelled) setBusy(false) })
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout) }
  }, [domainId, farmId, reload])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    setPlantings([]); setHarvests([]); setDataError(''); setDataBusy(!!campaignId)
    async function load() {
      if (!campaignId) return
      try {
        const ps: Planting[] = []
        for (let start = 0; ; start += 500) {
          const result = await supabase.from('campaign_plantings')
            .select('id,greenhouse_id,variety_id,planted_area,planting_date,status,target_total_production,target_yield_per_m2,greenhouses!inner(farm_id)')
            .eq('domain_id', domainId).eq('campaign_id', campaignId).eq('greenhouses.farm_id', farmId)
            .order('id').range(start, start + 499).abortSignal(controller.signal)
          if (result.error) throw result.error
          ps.push(...(result.data ?? []) as Planting[])
          if ((result.data?.length ?? 0) < 500) break
        }
        const hs: Harvest[] = []
        // Paginated: do not silently truncate a season to the API's default row limit.
        for (let start = 0; ; start += 500) {
          const result = await supabase.from('harvests')
            .select('id,campaign_planting_id,total_qty,harvest_date,campaign_plantings!inner(campaign_id,greenhouses!inner(farm_id))')
            .eq('domain_id', domainId).eq('campaign_plantings.campaign_id', campaignId)
            .eq('campaign_plantings.greenhouses.farm_id', farmId)
            .order('id').range(start, start + 499).abortSignal(controller.signal)
          if (result.error) throw result.error
          hs.push(...(result.data ?? []) as Harvest[])
          if ((result.data?.length ?? 0) < 500) break
        }
        const names: Record<string, string> = {}
        const ids = Array.from(new Set(ps.map(p => p.variety_id)))
        for (let start = 0; start < ids.length; start += 100) {
          const result = await supabase.from('varieties').select('id,commercial_name').in('id', ids.slice(start, start + 100)).abortSignal(controller.signal)
          if (result.error) throw result.error
          result.data?.forEach(v => { names[v.id] = v.commercial_name })
        }
        if (!cancelled) { setPlantings(ps); setHarvests(hs); setVarieties(names) }
      } catch (e: any) { if (!cancelled) setDataError(`Données culture / production indisponibles : ${e.message ?? 'délai dépassé'}`) }
      finally { clearTimeout(timeout); if (!cancelled) setDataBusy(false) }
    }
    void load()
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout) }
  }, [campaignId, domainId, farmId, reload])

  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  function update(patch: Partial<FarmShape>) {
    setShapes(items => items.map(s => s.greenhouse_id === selected ? normalizeShape({ ...s, ...patch }) : s))
    setDirty(true); setMessage('')
  }
  async function save() {
    setSaving(true); setMessage('')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    try {
      const result = await supabase.rpc('save_farm_schematic_plan', { p_farm: farmId, p_revision: revision, p_shapes: shapes }).abortSignal(controller.signal)
      if (result.error) throw result.error
      setRevision(result.data); setSaved(shapes); setDirty(false); setEditing(false); setMessage('Plan enregistré.')
    } catch (e: any) { setMessage(`Sauvegarde non confirmée : ${e.message ?? 'délai dépassé'}. Rechargez le plan avant de réessayer.`) }
    finally { clearTimeout(timeout); setSaving(false) }
  }
  function point(event: React.PointerEvent<SVGElement>) {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return { x: 0, y: 0 }
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY
    return p.matrixTransform(matrix.inverse())
  }
  const selectedPlantings = plantings.filter(p => p.greenhouse_id === selected)
  const selectedIds = new Set(selectedPlantings.map(p => p.id))
  const selectedHarvests = harvests.filter(h => selectedIds.has(h.campaign_planting_id))
  const date = (value: string | null) => value ? new Date(value + 'T12:00:00').toLocaleDateString('fr-FR') : 'Non renseignée'

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <strong>Plan schématique — {editing ? 'Modification' : 'Consultation'}</strong>
      <button className={control} disabled={busy || saving} onClick={() => {
        if (!dirty || window.confirm('Abandonner les modifications non enregistrées et recharger ?')) setReload(n => n + 1)
      }}>Actualiser</button>
      {canEdit && !editing && <button className={control} disabled={busy || !!error} onClick={() => setEditing(true)}>Modifier le plan</button>}
      {editing && <>
        <button className={control} disabled={saving || !dirty} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        <button className={control} disabled={saving} onClick={() => {
          if (!dirty || window.confirm('Abandonner les modifications du plan ?')) { setShapes(saved); setDirty(false); setEditing(false) }
        }}>Annuler</button>
      </>}
      {dirty && <span role="status" className="text-amber-700">Modifications non enregistrées : enregistrez avant de changer de ferme, de société ou de page.</span>}
    </div>
    <p className="text-sm text-slate-500">Schéma non cadastral, sans échelle réelle. La taille des rectangles ne modifie jamais les surfaces du référentiel. Cliquez sur une serre pour sa fiche. Le filtre variété ne masque pas les serres du plan.</p>
    {message && <p role="status" className="rounded border p-3">{message}</p>}
    {dataError && <p role="alert" className="rounded bg-amber-50 p-3 text-amber-900">{dataError} Les couleurs de culture ne sont pas disponibles.</p>}
    {error ? <p role="alert" className="rounded bg-amber-50 p-3 text-amber-900">{error}</p> : busy ? <p>Chargement du plan…</p> : <>
      {editing && <div className="flex flex-wrap gap-2">
        <select className={control} aria-label="Serre à placer" value={toAdd} disabled={saving} onChange={e => setToAdd(e.target.value)}>
          <option value="">Choisir une serre existante ({missing.length} à placer)</option>
          {missing.map(g => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
        </select>
        <button className={control} disabled={saving || !missing.some(g => g.id === toAdd) || shapes.length >= 500} onClick={() => {
          setShapes(items => [...items, newShape(toAdd, items.length)]); setSelected(toAdd); setToAdd(''); setDirty(true)
        }}>Placer la serre</button>
        <span className="self-center text-sm text-slate-500">Glissez les serres ; ajustez leurs dimensions dans le panneau.</span>
      </div>}
      {!scopeGreenhouses.length && <p>Aucune serre dans cette ferme. Créez-les d’abord dans le <Link className="underline" href="/serres">référentiel des serres</Link>.</p>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-xl border bg-slate-50">
          {!shapes.length && <p className="p-4 text-slate-600">Aucune serre placée. {canEdit ? 'Cliquez sur « Modifier le plan » pour commencer.' : 'Une personne habilitée peut préparer ce plan.'}</p>}
          <svg ref={svgRef} viewBox="0 0 1200 800" className="w-full" aria-label="Plan interactif de la ferme" style={{ touchAction: editing ? 'none' : 'auto' }}
            onPointerMove={event => {
              if (!drag.current || !editing || saving) return
              const p = point(event), d = drag.current
              setShapes(items => items.map(s => s.greenhouse_id === d.id ? normalizeShape({ ...s, x: d.ox + p.x - d.x, y: d.oy + p.y - d.y }) : s))
              setDirty(true)
            }} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
            <defs><pattern id="farm-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#cbd5e1" strokeWidth="0.6" /></pattern></defs>
            <rect width="1200" height="800" fill="url(#farm-grid)" />
            {shapes.map(s => {
              const g = scopeGreenhouses.find(g => g.id === s.greenhouse_id)
              const occupied = plantings.some(p => p.greenhouse_id === s.greenhouse_id)
              return <g key={s.greenhouse_id} transform={`translate(${s.x},${s.y}) rotate(${s.rotation})`} tabIndex={0} role="button"
                aria-label={`Consulter ${g?.code ?? 'serre retirée du référentiel'}`} style={{ cursor: editing ? 'move' : 'pointer' }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(s.greenhouse_id) } }}
                onPointerDown={e => {
                  setSelected(s.greenhouse_id)
                  if (!editing || saving) return
                  e.preventDefault(); const p = point(e); drag.current = { id: s.greenhouse_id, x: p.x, y: p.y, ox: s.x, oy: s.y }
                  e.currentTarget.setPointerCapture(e.pointerId)
                }}>
                <title>{g ? `${g.code} — ${g.name} · ${fmt(Number(g.total_area))} m²` : 'Serre retirée du référentiel'}</title>
                <rect x={-s.width / 2} y={-s.height / 2} width={s.width} height={s.height} rx={8} fill={occupied ? '#d1fae5' : '#e2e8f0'} stroke={selected === s.greenhouse_id ? '#4f46e5' : '#64748b'} strokeWidth={selected === s.greenhouse_id ? 4 : 2} />
                <text textAnchor="middle" dominantBaseline="central" fill="#0f172a" fontSize={15} pointerEvents="none">{(g?.code ?? 'Retirée').slice(0, 18)}</text>
              </g>
            })}
          </svg>
          <p className="p-3 text-xs text-slate-600">Vert : plantation sur la campagne sélectionnée · Gris : aucune plantation chargée. {shapes.length} serre(s) placée(s), {missing.length} non placée(s).</p>
        </div>
        <aside className="space-y-3 rounded-xl border p-4">
          {!shape ? <p>Sélectionnez une serre sur le plan.</p> : <>
            <h3 className="font-semibold">{greenhouse?.code} — {greenhouse?.name ?? 'Serre retirée du référentiel'}</h3>
            <p>Surface officielle : {greenhouse ? `${fmt(Number(greenhouse.total_area))} m²` : 'Indisponible'}</p>
            {editing && <fieldset disabled={saving} className="space-y-2">
              <legend className="font-medium">Disposition (unités de dessin)</legend>
              {(['x', 'y', 'width', 'height'] as const).map((key, i) => <label className="flex items-center justify-between gap-2" key={key}>
                {['Position X', 'Position Y', 'Largeur', 'Hauteur'][i]}
                <input className={`${control} w-24`} type="number" value={Math.round(shape[key])} onChange={e => { if (e.target.value !== '') update({ [key]: Number(e.target.value) }) }} />
              </label>)}
              <button className={control} onClick={() => update({ rotation: shape.rotation + 90 })}>Tourner de 90°</button>
              <button className={control} onClick={() => {
                if (window.confirm('Retirer cette forme du plan ? La serre et ses données seront conservées.')) {
                  setShapes(items => items.filter(s => s.greenhouse_id !== selected)); setSelected(''); setDirty(true)
                }
              }}>Retirer du plan</button>
            </fieldset>}
            <h4 className="border-t pt-3 font-semibold">Culture et production — campagne sélectionnée</h4>
            {!campaignId ? <p>Sélectionnez une campagne.</p> : dataBusy ? <p>Chargement des cultures et récoltes…</p> : dataError ? <p role="alert" className="text-amber-700">{dataError}</p> : <>
              {!selectedPlantings.length && <p>Aucune plantation sur cette campagne.</p>}
              {selectedPlantings.map(p => <div key={p.id} className="space-y-1 rounded border p-2 text-sm">
                <strong>{varieties[p.variety_id] ?? 'Variété non disponible'}</strong>
                <p>{statusLabel[p.status] ?? p.status} · Plantation : {date(p.planting_date)}</p>
                <p>Surface plantée : {fmt(Number(p.planted_area))} m²</p>
                <p>Objectif : {fmt(p.target_total_production != null ? Number(p.target_total_production) : p.target_yield_per_m2 != null ? Number(p.target_yield_per_m2) * Number(p.planted_area) : null)} kg</p>
              </div>)}
              {!!selectedPlantings.length && <>
                <p>Récolte enregistrée : <strong>{fmt(selectedHarvests.reduce((sum, h) => sum + Number(h.total_qty ?? 0), 0))} kg</strong></p>
                <p className="text-xs text-slate-500">Toutes catégories, déchets inclus. {selectedHarvests.length} saisie(s). Une absence de saisie ne prouve pas l’absence de récolte.</p>
              </>}
            </>}
            {campaignId && <ProductionCostReport compact fixedCampaign={campaignId} fixedGreenhouse={selected} />}
            <Link className="block text-sm underline" href="/couts/pilotage">Synthèse des coûts par serre, ferme et société</Link>
            <p className="text-sm text-slate-500">CA et marges au clic : restent à rapprocher des ventes et de leur devise.</p>
            <Link className="block text-sm underline" href="/recoltes">Ouvrir les récoltes</Link>
            <Link className="block text-sm underline" href="/serres">Ouvrir le référentiel des serres</Link>
          </>}
        </aside>
      </div>
    </>}
  </section>
}
