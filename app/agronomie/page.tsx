'use client'
import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { FlaskConical, Plus, Search, X, Droplets, Thermometer, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Textarea, Field } from '@/components/ui/Input'
import { Modal, FormGroup, FormRow, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { DateDisplay } from '@/components/display'
import { useReferenceList } from '@/lib/useReferenceList'
const TYPE_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'brand' | 'danger' | 'default'> = {
  traitement: 'danger', irrigation: 'info', fertilisation: 'success', taille: 'warning',
  effeuillage: 'brand', inspection: 'info', plantation: 'warning', autre: 'default',
}

export default function AgronomePage() {
  const { values: TYPES } = useReferenceList('operation_type')
  const [items, setItems] = useState<any[]>([])
  const [plantings, setPlantings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const [form, setForm] = useState({
    campaign_planting_id: '', operation_type: 'traitement', operation_date: '',
    product_used: '', dose_per_m2: '', total_quantity: '', unit: 'L', duration_hours: '',
    water_volume_liters: '', ec_ms_cm: '', ph_value: '',
    temperature: '', humidity_pct: '', worker_count: '', observations: '',
  })
  const upd = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))

  const load = async () => {
    const [ops, p] = await Promise.all([
      supabase.from('cultural_operations').select('*, campaign_plantings(*, greenhouses(code,name), varieties(commercial_name))').order('operation_date', { ascending: false }).limit(100),
      supabase.from('campaign_plantings').select('id, greenhouses(code,name), varieties(commercial_name), campaigns(name)'),
    ])
    setItems(ops.data || []); setPlantings(p.data || []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => items.filter(op => {
    if (typeFilter !== 'all' && op.operation_type !== typeFilter) return false
    if (search) {
      const cp = op.campaign_plantings
      const hay = `${op.product_used ?? ''} ${cp?.greenhouses?.name ?? ''} ${cp?.varieties?.commercial_name ?? ''}`.toLowerCase()
      if (!hay.includes(search.toLowerCase())) return false
    }
    return true
  }), [items, search, typeFilter])

  const stats = useMemo(() => ({
    count: items.length,
    types: new Set(items.map(i => i.operation_type)).size,
    treatments: items.filter(i => i.operation_type === 'traitement').length,
    irrigations: items.filter(i => i.operation_type === 'irrigation').length,
  }), [items])

  const save = async () => {
    if (!form.campaign_planting_id || !form.operation_date) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('cultural_operations').insert({
        campaign_planting_id: form.campaign_planting_id,
        operation_type: form.operation_type, operation_date: form.operation_date,
        product_used: form.product_used || null,
        dose_per_m2: form.dose_per_m2 ? Number(form.dose_per_m2) : null,
        total_quantity: form.total_quantity ? Number(form.total_quantity) : null,
        unit: form.unit || null,
        duration_hours: form.duration_hours ? Number(form.duration_hours) : null,
        water_volume_liters: form.water_volume_liters ? Number(form.water_volume_liters) : null,
        ec_ms_cm: form.ec_ms_cm ? Number(form.ec_ms_cm) : null,
        ph_value: form.ph_value ? Number(form.ph_value) : null,
        temperature: form.temperature ? Number(form.temperature) : null,
        humidity_pct: form.humidity_pct ? Number(form.humidity_pct) : null,
        worker_count: form.worker_count ? Number(form.worker_count) : null,
        observations: form.observations || null,
      }).select('*, campaign_plantings(*, greenhouses(code,name), varieties(commercial_name))').single()
      if (error) throw error
      setItems(p => [data, ...p]); setDone(true)
      toast.success('Intervention enregistrée')
      setTimeout(() => {
        setModal(false); setDone(false)
        setForm({ campaign_planting_id: '', operation_type: 'traitement', operation_date: '', product_used: '', dose_per_m2: '', total_quantity: '', unit: 'L', duration_hours: '', water_volume_liters: '', ec_ms_cm: '', ph_value: '', temperature: '', humidity_pct: '', worker_count: '', observations: '' })
      }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  return (
    <div>
      {modal && (
        <Modal title="NOUVELLE INTERVENTION" onClose={() => { setModal(false); setDone(false) }} size="lg">
          {done ? <SuccessMessage message="Intervention enregistrée !" /> : (
            <div className="space-y-md">
              <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary">Identification</div>
              <FormGroup label="Plantation / Serre *">
                {plantings.length === 0
                  ? <div className="rounded-md border border-danger/30 bg-danger/10 p-md text-danger text-body-sm">⚠ Aucune plantation disponible</div>
                  : <TSelect value={form.campaign_planting_id} onChange={upd('campaign_planting_id')}>
                      <option value="">— Sélectionner —</option>
                      {plantings.map(p => <option key={p.id} value={p.id}>{p.greenhouses?.name} · {p.varieties?.commercial_name}</option>)}
                    </TSelect>
                }
              </FormGroup>
              <FormRow>
                <FormGroup label="Type d'opération">
                  <TSelect value={form.operation_type} onChange={upd('operation_type')}>{TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}</TSelect>
                </FormGroup>
                <FormGroup label="Date *"><TInput type="date" value={form.operation_date} onChange={upd('operation_date')} /></FormGroup>
              </FormRow>

              <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mt-md">Produit & dosage</div>
              <FormRow>
                <FormGroup label="Produit utilisé"><TInput value={form.product_used} onChange={upd('product_used')} placeholder="Azoxystrobin 250SC" /></FormGroup>
                <FormGroup label="Dose / m²"><TInput type="number" value={form.dose_per_m2} onChange={upd('dose_per_m2')} placeholder="0.15" /></FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Quantité totale"><TInput type="number" value={form.total_quantity} onChange={upd('total_quantity')} /></FormGroup>
                <FormGroup label="Unité"><TSelect value={form.unit} onChange={upd('unit')}>{['L', 'kg', 'mL', 'g', 'unité'].map(u => <option key={u}>{u}</option>)}</TSelect></FormGroup>
              </FormRow>

              <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mt-md">Irrigation / Fertigation</div>
              <FormRow>
                <FormGroup label="Volume eau (L)"><TInput type="number" value={form.water_volume_liters} onChange={upd('water_volume_liters')} /></FormGroup>
                <FormGroup label="EC (mS/cm)"><TInput type="number" value={form.ec_ms_cm} onChange={upd('ec_ms_cm')} placeholder="3.5" /></FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="pH"><TInput type="number" value={form.ph_value} onChange={upd('ph_value')} placeholder="6.2" /></FormGroup>
                <FormGroup label="Durée (heures)"><TInput type="number" value={form.duration_hours} onChange={upd('duration_hours')} placeholder="2.5" /></FormGroup>
              </FormRow>

              <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mt-md">Conditions</div>
              <FormRow>
                <FormGroup label="Température (°C)"><TInput type="number" value={form.temperature} onChange={upd('temperature')} placeholder="24" /></FormGroup>
                <FormGroup label="Humidité (%)"><TInput type="number" value={form.humidity_pct} onChange={upd('humidity_pct')} placeholder="75" /></FormGroup>
              </FormRow>
              <FormGroup label="Nombre d'ouvriers"><TInput type="number" value={form.worker_count} onChange={upd('worker_count')} placeholder="3" /></FormGroup>
              <FormGroup label="Observations"><Textarea rows={2} value={form.observations} onChange={upd('observations')} /></FormGroup>

              <ModalFooter onCancel={() => setModal(false)} onSave={save} loading={saving} disabled={!form.campaign_planting_id || !form.operation_date} saveLabel="ENREGISTRER" />
            </div>
          )}
        </Modal>
      )}

      <PageHeader
        title="Journal agronomique" subtitle="Cultural" icon={FlaskConical} iconColor="#06b6d4"
        description={`${items.length} intervention${items.length > 1 ? 's' : ''} enregistrée${items.length > 1 ? 's' : ''}`}
        actions={<Button onClick={() => setModal(true)} variant="primary"><Plus size={14} strokeWidth={2.5} /> Nouvelle intervention</Button>}
        stats={loading ? [] : [
          { label: 'Total', value: String(stats.count), icon: FlaskConical, color: '#06b6d4' },
          { label: 'Types', value: String(stats.types), icon: FlaskConical, color: '#a855f7' },
          { label: 'Traitements', value: String(stats.treatments), icon: Droplets, color: '#ef4444' },
          { label: 'Irrigations', value: String(stats.irrigations), icon: Droplets, color: '#3b82f6' },
        ]}
      />

      {!loading && items.length > 0 && (
        <Card animate delay={0.15} className="mb-md">
          <div className="flex items-center gap-md flex-wrap">
            <div className="flex items-center gap-sm flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="text-fg-tertiary" />
              <TInput placeholder="Rechercher produit, serre, variété…" value={search} onChange={(e) => setSearch(e.target.value)} className="border-none bg-transparent focus:ring-0 px-0" />
              {search && <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary"><X size={14} /></button>}
            </div>
            <TSelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-8 w-auto min-w-[160px] text-body-sm">
              <option value="all">Tous types</option>
              {TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
            </TSelect>
          </div>
        </Card>
      )}

      <Card animate delay={0.25} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={FlaskConical} title="Aucune intervention" description="Enregistre la première intervention agronomique." action={<Button onClick={() => setModal(true)}><Plus size={14} /> Nouvelle</Button>} />
        ) : (
          <DataTable minWidth={1200}>
            <THead>
              <TR><TH>Date</TH><TH>Serre</TH><TH>Variété</TH><TH>Type</TH><TH>Produit</TH><TH right>Dose/m²</TH><TH right>Qté</TH><TH right>EC</TH><TH right>pH</TH><TH right>Ouvriers</TH><TH>Notes</TH></TR>
            </THead>
            <tbody>
              {filtered.map((op, i) => {
                const cp = op.campaign_plantings
                return (
                  <TR key={op.id} animate delay={0.04 + i * 0.02}>
                    <TD mono className="text-caption"><DateDisplay value={op.operation_date} variant="compact" /></TD>
                    <TD className="font-display font-semibold text-fg-primary">{cp?.greenhouses?.name || '—'}</TD>
                    <TD mono className="text-caption text-fg-tertiary">{cp?.varieties?.commercial_name || '—'}</TD>
                    <TD><Badge variant={TYPE_VARIANT[op.operation_type] || 'default'} size="sm">{op.operation_type}</Badge></TD>
                    <TD className="text-caption">{op.product_used || '—'}</TD>
                    <TD right mono className="text-warning">{op.dose_per_m2 ?? '—'}</TD>
                    <TD right mono className="text-caption">{op.total_quantity ? `${op.total_quantity} ${op.unit}` : '—'}</TD>
                    <TD right mono className="text-info">{op.ec_ms_cm ?? '—'}</TD>
                    <TD right mono className="text-success">{op.ph_value ?? '—'}</TD>
                    <TD right mono>{op.worker_count ?? '—'}</TD>
                    <TD className="text-caption text-fg-tertiary truncate max-w-[120px]">{op.observations || '—'}</TD>
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
