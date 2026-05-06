'use client'
import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Settings2, Plus, Pencil, Sprout, Maximize, Wheat, Box, AlertCircle, Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Field } from '@/components/ui/Input'
import { Modal, FormGroup, FormRow, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { AreaDisplay, VolumeDisplay, MoneyDisplay, DateDisplay } from '@/components/display'

const emptyForm = {
  campaign_id: '', farm_id: '', greenhouse_id: '', variety_id: '',
  planted_area: '', plant_count: '', planting_date: '',
  target_yield_per_m2: '', estimated_cost: '',
  harvest_start_date: '', harvest_end_date: '',
  export_share_pct: '100',
  price_per_kg_export: '', price_per_kg_local: '',
}

export default function ProductionPage() {
  const [items, setItems] = useState<any[]>([])
  const [campagnes, setCampagnes] = useState<any[]>([])
  const [fermes, setFermes] = useState<any[]>([])
  const [serres, setSerres] = useState<any[]>([])
  const [varietes, setVarietes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [areaError, setAreaError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyForm)
  const upd = (k: string) => (e: any) => { setForm(f => ({ ...f, [k]: e.target.value })); if (k === 'planted_area') setAreaError('') }

  const closeModal = () => { setModal(false); setDone(false); setAreaError(''); setEditingId(null); setForm(emptyForm) }

  const loadExisting = (p: any) => {
    setEditingId(p.id)
    const greenhouse = serres.find(g => g.id === p.greenhouse_id)
    const campaign = campagnes.find(c => c.id === p.campaign_id)
    const farm_id = greenhouse?.farm_id || campaign?.farm_id || ''
    setForm({
      campaign_id: p.campaign_id || '', farm_id,
      greenhouse_id: p.greenhouse_id || '', variety_id: p.variety_id || '',
      planted_area: p.planted_area ? String(p.planted_area) : '',
      plant_count: p.plant_count ? String(p.plant_count) : '',
      planting_date: p.planting_date || '',
      target_yield_per_m2: p.target_yield_per_m2 ? String(p.target_yield_per_m2) : '',
      estimated_cost: p.estimated_cost ? String(p.estimated_cost) : '',
      harvest_start_date: p.harvest_start_date || '', harvest_end_date: p.harvest_end_date || '',
      export_share_pct: p.export_share_pct != null ? String(p.export_share_pct) : '100',
      price_per_kg_export: p.price_per_kg_export != null ? String(p.price_per_kg_export) : '',
      price_per_kg_local: p.price_per_kg_local != null ? String(p.price_per_kg_local) : '',
    })
    setAreaError('')
  }

  const load = async () => {
    const [p, c, f, sr, v] = await Promise.all([
      supabase.from('campaign_plantings').select('*, campaigns(name), greenhouses(code,name,exploitable_area), varieties(commercial_name,type)').order('created_at', { ascending: false }),
      supabase.from('campaigns').select('id,name,code,farm_id').order('name'),
      supabase.from('farms').select('id,code,name').eq('is_active', true).order('name'),
      supabase.from('greenhouses').select('id,code,name,farm_id,total_area,exploitable_area').order('code'),
      supabase.from('varieties').select('id,commercial_name,type,theoretical_yield_per_m2,theoretical_cost_per_m2,avg_price_export,avg_price_local').eq('is_active', true).order('commercial_name'),
    ])
    setItems(p.data || []); setCampagnes(c.data || []); setFermes(f.data || []); setSerres(sr.data || []); setVarietes(v.data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const onChangeCampaign = (campaignId: string) => {
    const camp = campagnes.find(c => c.id === campaignId)
    const farm_id = camp?.farm_id || form.farm_id
    const currentGh = serres.find(g => g.id === form.greenhouse_id)
    const keepGh = currentGh && currentGh.farm_id === farm_id ? form.greenhouse_id : ''
    setForm(f => ({ ...f, campaign_id: campaignId, farm_id, greenhouse_id: keepGh }))
  }
  const onChangeFarm = (farmId: string) => {
    const currentGh = serres.find(g => g.id === form.greenhouse_id)
    const keepGh = currentGh && currentGh.farm_id === farmId ? form.greenhouse_id : ''
    setForm(f => ({ ...f, farm_id: farmId, greenhouse_id: keepGh })); setAreaError('')
  }

  const filteredSerres = useMemo(() =>
    form.farm_id ? serres.filter(s => s.farm_id === form.farm_id) : serres,
    [serres, form.farm_id])

  const selectVariete = (varId: string) => {
    const v = varietes.find(x => x.id === varId)
    setForm(f => ({
      ...f, variety_id: varId,
      target_yield_per_m2: v ? String(v.theoretical_yield_per_m2 || '') : f.target_yield_per_m2,
      price_per_kg_export: f.price_per_kg_export || (v?.avg_price_export ? String(v.avg_price_export) : ''),
      price_per_kg_local: f.price_per_kg_local || (v?.avg_price_local ? String(v.avg_price_local) : ''),
    }))
  }

  const selectedSerre = useMemo(() => serres.find(s => s.id === form.greenhouse_id), [form.greenhouse_id, serres])
  const surfaceDejaPlantee = useMemo(() => {
    if (!form.greenhouse_id) return 0
    return items.filter(p => p.greenhouse_id === form.greenhouse_id && p.id !== editingId).reduce((s, p) => s + (p.planted_area || 0), 0)
  }, [form.greenhouse_id, items, editingId])
  const surfaceDisponible = selectedSerre ? (selectedSerre.exploitable_area || selectedSerre.total_area || 0) - surfaceDejaPlantee : 0
  const surfaceProposee = Number(form.planted_area) || 0
  const surfaceOk = !form.planted_area || !form.greenhouse_id || surfaceProposee <= surfaceDisponible

  const filteredItems = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(p => `${p.campaigns?.name ?? ''} ${p.greenhouses?.name ?? ''} ${p.varieties?.commercial_name ?? ''}`.toLowerCase().includes(q))
  }, [items, search])

  const save = async () => {
    if (!form.campaign_id || !form.farm_id || !form.greenhouse_id || !form.variety_id || !form.planted_area) return
    if (!surfaceOk) {
      setAreaError(`Surface trop grande — disponible : ${surfaceDisponible.toLocaleString('fr')} m²`)
      return
    }
    setSaving(true)
    try {
      const area = Number(form.planted_area)
      const yld = Number(form.target_yield_per_m2) || 0
      const payload = {
        campaign_id: form.campaign_id, greenhouse_id: form.greenhouse_id, variety_id: form.variety_id,
        planted_area: area,
        plant_count: form.plant_count ? Number(form.plant_count) : null,
        planting_date: form.planting_date || null,
        harvest_start_date: form.harvest_start_date || null,
        harvest_end_date: form.harvest_end_date || null,
        export_share_pct: form.export_share_pct ? Number(form.export_share_pct) : 100,
        price_per_kg_export: form.price_per_kg_export ? Number(form.price_per_kg_export) : null,
        price_per_kg_local: form.price_per_kg_local ? Number(form.price_per_kg_local) : null,
        target_yield_per_m2: yld,
        target_total_production: area * yld,
        estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
      }
      const selectCols = '*, campaigns(name), greenhouses(code,name,exploitable_area), varieties(commercial_name,type)'
      if (editingId) {
        const { data, error } = await supabase.from('campaign_plantings').update(payload).eq('id', editingId).select(selectCols).single()
        if (error) throw error
        setItems(prev => prev.map(x => x.id === editingId ? data : x))
        toast.success('Plantation modifiée')
      } else {
        const { data, error } = await supabase.from('campaign_plantings').insert({ ...payload, status: 'planifie' }).select(selectCols).single()
        if (error) throw error
        setItems(p => [data, ...p])
        toast.success('Plantation créée')
      }
      setDone(true)
      setTimeout(closeModal, 1200)
    } catch (e: any) {
      const isDuplicate = e?.code === '23505' || (typeof e?.message === 'string' && e.message.includes('campaign_plantings_campaign_id_greenhouse_id_variety_id_key'))
      if (isDuplicate) {
        const existing = items.find(p => p.campaign_id === form.campaign_id && p.greenhouse_id === form.greenhouse_id && p.variety_id === form.variety_id)
        const varNom = varietes.find(v => v.id === form.variety_id)?.commercial_name || 'cette variété'
        const serreNom = serres.find(x => x.id === form.greenhouse_id)?.code || 'cette serre'
        if (existing && confirm(`Une plantation de ${varNom} existe déjà dans ${serreNom}. Modifier ?`)) loadExisting(existing)
        else toast.error('Plantation déjà existante')
      } else toast.error('Erreur : ' + e.message)
    }
    setSaving(false)
  }

  const totalArea = items.reduce((s, p) => s + (p.planted_area || 0), 0)
  const totalProd = items.reduce((s, p) => s + (p.target_total_production || 0), 0)

  return (
    <div>
      {modal && (
        <Modal title={editingId ? 'MODIFIER PLANTATION' : 'NOUVELLE PLANTATION'} onClose={closeModal} size="lg">
          {done ? <SuccessMessage message={editingId ? 'Plantation modifiée !' : 'Plantation enregistrée !'} /> : (
            <div className="space-y-md">
              <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary">Affectation</div>
              <FormRow>
                <FormGroup label="Campagne *">
                  {campagnes.length === 0 ? <div className="rounded-md border border-danger/30 bg-danger/10 p-md text-danger text-body-sm">⚠ Aucune campagne</div> :
                    <TSelect value={form.campaign_id} onChange={(e) => onChangeCampaign(e.target.value)}>
                      <option value="">— Sélectionner —</option>
                      {campagnes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                    </TSelect>}
                </FormGroup>
                <FormGroup label="Ferme *">
                  {fermes.length === 0 ? <div className="rounded-md border border-danger/30 bg-danger/10 p-md text-danger text-body-sm">⚠ Aucune ferme</div> :
                    <TSelect value={form.farm_id} onChange={(e) => onChangeFarm(e.target.value)}>
                      <option value="">— Sélectionner —</option>
                      {fermes.map(f => <option key={f.id} value={f.id}>{f.name} ({f.code})</option>)}
                    </TSelect>}
                </FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Serre *">
                  <TSelect value={form.greenhouse_id} onChange={(e) => { upd('greenhouse_id')(e); setAreaError('') }}>
                    <option value="">{form.farm_id ? '— Sélectionner —' : '— Choisir d\'abord une ferme —'}</option>
                    {filteredSerres.map(sr => <option key={sr.id} value={sr.id}>{sr.code} — {sr.name} ({sr.exploitable_area?.toLocaleString('fr')} m²)</option>)}
                  </TSelect>
                  {selectedSerre && (
                    <div className="mt-1 font-mono text-caption text-fg-tertiary">
                      Surface exploitable : <strong className={surfaceDisponible > 0 ? 'text-success' : 'text-danger'}>{surfaceDisponible.toLocaleString('fr')} m²</strong>
                      {surfaceDejaPlantee > 0 && <span className="text-warning ml-2">({surfaceDejaPlantee.toLocaleString('fr')} m² déjà plantés)</span>}
                    </div>
                  )}
                </FormGroup>
                <FormGroup label="Variété *">
                  <TSelect value={form.variety_id} onChange={(e) => selectVariete(e.target.value)}>
                    <option value="">— Sélectionner —</option>
                    {varietes.map(v => <option key={v.id} value={v.id}>{v.commercial_name} ({v.type})</option>)}
                  </TSelect>
                </FormGroup>
              </FormRow>

              <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mt-md">Surfaces & densité</div>
              <FormRow>
                <FormGroup label="Surface plantée (m²) *">
                  <TInput type="number" value={form.planted_area} onChange={upd('planted_area')} placeholder={selectedSerre ? `max ${surfaceDisponible.toLocaleString('fr')} m²` : '2500'} />
                  {areaError && <div className="mt-1 rounded-md border border-danger/30 bg-danger/10 px-md py-1.5 text-caption text-danger flex items-center gap-1"><AlertCircle size={12} />{areaError}</div>}
                  {!areaError && form.planted_area && form.greenhouse_id && surfaceOk && surfaceProposee > 0 && (
                    <div className="mt-1 font-mono text-caption text-success">✓ Surface valide · reste {(surfaceDisponible - surfaceProposee).toLocaleString('fr')} m²</div>
                  )}
                </FormGroup>
                <FormGroup label="Nombre de plants"><TInput type="number" value={form.plant_count} onChange={upd('plant_count')} placeholder="6250" /></FormGroup>
              </FormRow>

              <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mt-md">Objectifs</div>
              <FormRow>
                <FormGroup label="Rendement cible (kg/m²)"><TInput type="number" value={form.target_yield_per_m2} onChange={upd('target_yield_per_m2')} placeholder="auto depuis variété" /></FormGroup>
                <FormGroup label="Date de plantation"><TInput type="date" value={form.planting_date} onChange={upd('planting_date')} /></FormGroup>
              </FormRow>
              <FormGroup label="Coût estimé (MAD)"><TInput type="number" value={form.estimated_cost} onChange={upd('estimated_cost')} placeholder="Optionnel" /></FormGroup>
              {form.planted_area && form.target_yield_per_m2 && (
                <div className="rounded-md border border-brand/30 bg-brand/5 p-md text-body-sm text-brand">
                  → Production théorique : <strong>{(Number(form.planted_area) * Number(form.target_yield_per_m2) / 1000).toFixed(2)} tonnes</strong>
                </div>
              )}

              <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mt-md">Récolte & ventes</div>
              <FormRow>
                <FormGroup label="Début récolte"><TInput type="date" value={form.harvest_start_date} onChange={upd('harvest_start_date')} /></FormGroup>
                <FormGroup label="Fin récolte"><TInput type="date" value={form.harvest_end_date} onChange={upd('harvest_end_date')} /></FormGroup>
                <FormGroup label="% Export"><TInput type="number" value={form.export_share_pct} onChange={upd('export_share_pct')} placeholder="100" min={0 as any} max={100 as any} /></FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Prix kg Export (MAD)"><TInput type="number" value={form.price_per_kg_export} onChange={upd('price_per_kg_export')} /></FormGroup>
                <FormGroup label="Prix kg Local (MAD)"><TInput type="number" value={form.price_per_kg_local} onChange={upd('price_per_kg_local')} /></FormGroup>
              </FormRow>
              {form.planted_area && form.target_yield_per_m2 && (form.price_per_kg_export || form.price_per_kg_local) && (() => {
                const vol = Number(form.planted_area) * Number(form.target_yield_per_m2)
                const exportPct = Math.max(0, Math.min(100, Number(form.export_share_pct) || 0))
                const volExport = vol * exportPct / 100
                const volLocal = vol - volExport
                const caExport = volExport * (Number(form.price_per_kg_export) || 0)
                const caLocal = volLocal * (Number(form.price_per_kg_local) || 0)
                return (
                  <div className="rounded-md border border-warning/30 bg-warning/5 p-md text-body-sm grid grid-cols-3 gap-md">
                    <div>→ CA Export : <strong className="text-warning"><MoneyDisplay value={caExport} compact="auto" showCurrency={false} /></strong></div>
                    <div>→ CA Local : <strong className="text-warning"><MoneyDisplay value={caLocal} compact="auto" showCurrency={false} /></strong></div>
                    <div>→ CA Total : <strong className="text-warning"><MoneyDisplay value={caExport + caLocal} compact="auto" showCurrency={false} /></strong></div>
                  </div>
                )
              })()}

              <ModalFooter onCancel={closeModal} onSave={save} loading={saving}
                disabled={!form.campaign_id || !form.farm_id || !form.greenhouse_id || !form.variety_id || !form.planted_area || !surfaceOk}
                saveLabel={editingId ? 'ENREGISTRER' : 'CRÉER LA PLANTATION'} />
            </div>
          )}
        </Modal>
      )}

      <PageHeader
        title="Suivi production" subtitle="Pilotage" icon={Settings2} iconColor="#f59e0b"
        description={`${items.length} plantation${items.length > 1 ? 's' : ''} · ${(totalArea / 10000).toFixed(2)} ha · Objectif ${(totalProd / 1000).toFixed(1)} t`}
        actions={<Button onClick={() => setModal(true)} variant="primary"><Plus size={14} strokeWidth={2.5} /> Nouvelle plantation</Button>}
        stats={loading ? [] : [
          { label: 'Plantations', value: String(items.length), icon: Sprout, color: '#10b981' },
          { label: 'Surface', value: <AreaDisplay value={totalArea} className="!text-current" />, icon: Maximize, color: '#3b82f6' },
          { label: 'Prod. théo.', value: <VolumeDisplay value={totalProd} forceUnit="t" className="!text-current" />, icon: Wheat, color: '#f59e0b' },
          { label: 'Serres', value: String(new Set(items.map(i => i.greenhouse_id)).size), icon: Box, color: '#a855f7' },
        ]}
      />

      {!loading && items.length > 0 && (
        <Card animate delay={0.15} className="mb-md">
          <div className="flex items-center gap-sm">
            <Search size={14} className="text-fg-tertiary" />
            <TInput placeholder="Rechercher campagne, serre, variété…" value={search} onChange={(e) => setSearch(e.target.value)} className="border-none bg-transparent focus:ring-0 px-0" />
            {search && <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary"><X size={14} /></button>}
          </div>
        </Card>
      )}

      <Card animate delay={0.25} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={Settings2} title="Aucune plantation" description="Crée une plantation pour commencer." action={<Button onClick={() => setModal(true)}><Plus size={14} /> Plantation</Button>} />
        ) : (
          <DataTable minWidth={1200}>
            <THead>
              <TR><TH>Campagne</TH><TH>Serre</TH><TH>Variété</TH><TH right>Surface</TH><TH right>Plants</TH><TH right>Rdt</TH><TH right>Prod. théo.</TH><TH>Plant.</TH><TH right>Surf. dispo</TH><TH>Statut</TH><TH right>Actions</TH></TR>
            </THead>
            <tbody>
              {filteredItems.map((p, i) => {
                const gh = serres.find(s => s.id === p.greenhouse_id)
                const exploitable = gh?.exploitable_area || gh?.total_area || 0
                const autresSurface = items.filter(x => x.greenhouse_id === p.greenhouse_id && x.id !== p.id).reduce((s, x) => s + (x.planted_area || 0), 0)
                const dispo = exploitable - autresSurface - (p.planted_area || 0)
                return (
                  <TR key={p.id} animate delay={0.04 + i * 0.02}>
                    <TD className="text-caption text-fg-tertiary">{p.campaigns?.name || '—'}</TD>
                    <TD className="font-display font-semibold text-fg-primary">{p.greenhouses?.name || '—'}</TD>
                    <TD className="text-fg-secondary">{p.varieties?.commercial_name || '—'}</TD>
                    <TD right mono className="text-success"><AreaDisplay value={p.planted_area} forceUnit="m2" /></TD>
                    <TD right mono>{p.plant_count?.toLocaleString('fr') || '—'}</TD>
                    <TD right mono className="text-warning">{p.target_yield_per_m2 ? `${p.target_yield_per_m2} kg/m²` : '—'}</TD>
                    <TD right mono className="text-success font-bold"><VolumeDisplay value={p.target_total_production} forceUnit="t" /></TD>
                    <TD mono className="text-caption"><DateDisplay value={p.planting_date} variant="compact" /></TD>
                    <TD right mono className={dispo >= 0 ? 'text-success' : 'text-danger'}>{exploitable > 0 ? `${dispo.toLocaleString('fr')} m²` : '—'}</TD>
                    <TD><StatusBadge status={p.status || 'planifie'} size="sm" /></TD>
                    <TD right>
                      <Button onClick={() => { loadExisting(p); setModal(true) }} variant="ghost" size="icon-sm" title="Modifier">
                        <Pencil size={12} strokeWidth={2.2} />
                      </Button>
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </Card>
    </div>
  )
}
