'use client'
/**
 * /varietes — Refonte avec design system.
 */
import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Dna, Plus, Pencil, Trash2, Search, X, Sprout, Coins, TrendingUp,
} from 'lucide-react'

import { getVarietes, createVariete, deleteVariete, supabase } from '@/lib/supabase'
import { genCode } from '@/lib/utils'
import { cn } from '@/lib/cn'

import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Textarea, Field } from '@/components/ui/Input'
import { Modal, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { NumberDisplay, MoneyDisplay } from '@/components/display'
import { useReferenceList } from '@/lib/useReferenceList'
import { type Crop, listCrops } from '@/lib/crops'

// ─── Formulaire partagé (HORS du composant parent pour éviter remount/focus loss) ───
function FormBlock({ vals, onChange }: { vals: any; onChange: (k: string) => (e: any) => void }) {
  const { values: refTypes } = useReferenceList('variety_type')
  const { values: destinations } = useReferenceList('variety_destination')
  const [crops, setCrops] = useState<Crop[]>([])
  useEffect(() => { listCrops({ activeOnly: true }).then(setCrops).catch(() => {}) }, [])

  // Type filtré par la culture sélectionnée (segments propres), sinon le référentiel
  const selectedCrop = crops.find(c => c.id === vals.crop_id)
  const typeOptions: { code: string; label: string }[] = selectedCrop?.variety_segments?.length
    ? selectedCrop.variety_segments.map(s => ({ code: s, label: s.replace(/_/g, ' ') }))
    : refTypes.map(t => ({ code: t.code, label: t.label }))
  // Conserve la valeur courante même si absente des options
  if (vals.type && !typeOptions.some(o => o.code === vals.type)) {
    typeOptions.unshift({ code: vals.type, label: vals.type.replace(/_/g, ' ') })
  }

  return (
    <div className="space-y-md">
      <div className="grid grid-cols-2 gap-md">
        <Field label="Code"><TInput value={vals.code} onChange={onChange('code')} /></Field>
        <Field label="Nom commercial" required><TInput value={vals.commercial_name} onChange={onChange('commercial_name')} placeholder="Vitalia" autoFocus /></Field>
      </div>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Culture">
          <TSelect value={vals.crop_id ?? ''} onChange={onChange('crop_id')}>
            <option value="">— choisir —</option>
            {crops.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </TSelect>
        </Field>
        <Field label="Type">
          <TSelect value={vals.type} onChange={onChange('type')}>
            {typeOptions.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
          </TSelect>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Destination">
          <TSelect value={vals.destination} onChange={onChange('destination')}>
            {destinations.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
          </TSelect>
        </Field>
        <div />
      </div>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Rendement th. (kg/m²)"><TInput type="number" value={vals.theoretical_yield_per_m2} onChange={onChange('theoretical_yield_per_m2')} placeholder="45" /></Field>
        <Field label="Coût th. (MAD/m²)"><TInput type="number" value={vals.theoretical_cost_per_m2} onChange={onChange('theoretical_cost_per_m2')} placeholder="120" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Prix local (MAD/kg)"><TInput type="number" value={vals.avg_price_local} onChange={onChange('avg_price_local')} placeholder="3.50" /></Field>
        <Field label="Prix export (MAD/kg)" hint="Saisir en MAD. Pour utiliser EUR/USD, configure la devise sur le marché concerné."><TInput type="number" value={vals.avg_price_export} onChange={onChange('avg_price_export')} placeholder="7.00" /></Field>
      </div>
      <Field label="Cycle estimé (jours)" hint="Plantation → fin récolte">
        <TInput type="number" value={vals.estimated_cycle_days} onChange={onChange('estimated_cycle_days')} placeholder="200" />
      </Field>
      <Field label="Notes techniques"><Textarea rows={2} value={vals.technical_notes} onChange={onChange('technical_notes')} /></Field>
    </div>
  )
}

const DEST_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'brand' | 'default'> = {
  export: 'warning',
  local: 'success',
  mixte: 'info',
  grande_distribution: 'brand',
  industrie: 'default',
}

const blank = {
  code: '', commercial_name: '', crop_id: '', type: 'ronde', destination: 'mixte',
  theoretical_yield_per_m2: '', theoretical_cost_per_m2: '',
  avg_price_local: '', avg_price_export: '',
  estimated_cycle_days: '', technical_notes: '',
}

export default function VarietesPage() {
  const { values: TYPES } = useReferenceList('variety_type')
  const { values: DESTINATIONS } = useReferenceList('variety_destination')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalNew, setModalNew] = useState(false)
  const [modalEdit, setModalEdit] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [destFilter, setDestFilter] = useState('all')

  const [form, setForm] = useState({ ...blank })
  const [formE, setFormE] = useState<Record<string, any>>({})
  const upd = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))
  const updE = (k: string) => (e: any) => setFormE(f => ({ ...f, [k]: e.target.value }))

  const load = () => getVarietes().then(d => { setItems(d); setLoading(false) }).catch(() => setLoading(false))
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => items.filter(v => {
    if (typeFilter !== 'all' && v.type !== typeFilter) return false
    if (destFilter !== 'all' && v.destination !== destFilter) return false
    if (search && !`${v.code} ${v.commercial_name}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [items, search, typeFilter, destFilter])

  const stats = useMemo(() => {
    const cycles = items.map(v => v.estimated_cycle_days).filter(Boolean)
    const yields_ = items.map(v => v.theoretical_yield_per_m2).filter(Boolean)
    return {
      count: items.length,
      avgYield: yields_.length > 0 ? yields_.reduce((a, b) => a + Number(b), 0) / yields_.length : 0,
      avgCycle: cycles.length > 0 ? cycles.reduce((a, b) => a + Number(b), 0) / cycles.length : 0,
      types: new Set(items.map(v => v.type)).size,
      exportable: items.filter(v => ['export', 'mixte'].includes(v.destination)).length,
    }
  }, [items])

  const openNew = () => { setForm({ ...blank, code: genCode('V', items.map(i => i.code)) }); setModalNew(true) }
  const openEdit = (v: any) => {
    setFormE({
      code: v.code, commercial_name: v.commercial_name, crop_id: v.crop_id ?? '', type: v.type, destination: v.destination,
      theoretical_yield_per_m2: String(v.theoretical_yield_per_m2 || ''),
      theoretical_cost_per_m2: String(v.theoretical_cost_per_m2 || ''),
      avg_price_local: String(v.avg_price_local || ''),
      avg_price_export: String(v.avg_price_export || ''),
      estimated_cycle_days: String(v.estimated_cycle_days || ''),
      technical_notes: v.technical_notes || '',
    })
    setModalEdit(v)
  }

  const save = async () => {
    if (!form.commercial_name) return
    setSaving(true)
    try {
      const n = await createVariete({
        ...form,
        crop_id: form.crop_id || undefined,
        theoretical_yield_per_m2: Number(form.theoretical_yield_per_m2) || 0,
        theoretical_cost_per_m2: Number(form.theoretical_cost_per_m2) || 0,
        avg_price_local: Number(form.avg_price_local) || 0,
        avg_price_export: Number(form.avg_price_export) || 0,
        estimated_cycle_days: form.estimated_cycle_days ? Number(form.estimated_cycle_days) : undefined,
      })
      setItems(p => [n, ...p]); setDone(true)
      toast.success(`Variété "${n.commercial_name}" créée`)
      setTimeout(() => { setModalNew(false); setDone(false) }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  const saveEdit = async () => {
    if (!modalEdit || !formE.commercial_name) return
    setSaving(true)
    try {
      const { error } = await supabase.from('varieties').update({
        code: formE.code, commercial_name: formE.commercial_name, crop_id: formE.crop_id || null, type: formE.type, destination: formE.destination,
        theoretical_yield_per_m2: Number(formE.theoretical_yield_per_m2) || 0,
        theoretical_cost_per_m2: Number(formE.theoretical_cost_per_m2) || 0,
        avg_price_local: Number(formE.avg_price_local) || 0,
        avg_price_export: Number(formE.avg_price_export) || 0,
        estimated_cycle_days: formE.estimated_cycle_days ? Number(formE.estimated_cycle_days) : null,
        technical_notes: formE.technical_notes || null,
      }).eq('id', modalEdit.id)
      if (error) throw error
      setDone(true)
      toast.success('Variété modifiée')
      setTimeout(() => { setModalEdit(null); setDone(false); load() }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  const del = async (v: any) => {
    if (!confirm(`Archiver "${v.commercial_name}" ?`)) return
    try {
      await deleteVariete(v.id)
      setItems(p => p.filter(i => i.id !== v.id))
      toast.success(`Variété archivée`)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
  }

  return (
    <div>
      {modalNew && (
        <Modal title="NOUVELLE VARIÉTÉ" onClose={() => { setModalNew(false); setDone(false) }}>
          {done ? <SuccessMessage message="Variété créée !" /> : (
            <>
              <FormBlock vals={form} onChange={upd} />
              <ModalFooter onCancel={() => setModalNew(false)} onSave={save} loading={saving} disabled={!form.commercial_name} saveLabel="CRÉER" />
            </>
          )}
        </Modal>
      )}
      {modalEdit && (
        <Modal title={`MODIFIER — ${modalEdit.commercial_name}`} onClose={() => { setModalEdit(null); setDone(false) }}>
          {done ? <SuccessMessage message="Variété modifiée !" /> : (
            <>
              <FormBlock vals={formE} onChange={updE} />
              <ModalFooter onCancel={() => setModalEdit(null)} onSave={saveEdit} loading={saving} disabled={!formE.commercial_name} saveLabel="ENREGISTRER" />
            </>
          )}
        </Modal>
      )}

      <PageHeader
        title="Variétés"
        subtitle="Référentiel"
        icon={Dna}
        iconColor="#a855f7"
        description={`${items.length} variété${items.length > 1 ? 's' : ''} de tomates`}
        actions={
          <Button onClick={openNew} variant="primary">
            <Plus size={14} strokeWidth={2.5} /> Nouvelle variété
          </Button>
        }
        stats={loading ? [] : [
          { label: 'Total',        value: String(stats.count),                                                     icon: Dna,         color: '#a855f7' },
          { label: 'Types',        value: String(stats.types),                                                    icon: Sprout,      color: '#10b981' },
          { label: 'Rdt moyen',    value: stats.avgYield > 0 ? `${stats.avgYield.toFixed(1)} kg/m²` : '—',         icon: TrendingUp,  color: '#3b82f6' },
          { label: 'Cycle moyen',  value: stats.avgCycle > 0 ? `${Math.round(stats.avgCycle)}j` : '—',             icon: Coins,       color: '#f59e0b' },
          { label: 'Exportables',  value: String(stats.exportable),                                                icon: TrendingUp,  color: '#ec4899' },
        ]}
      />

      {!loading && items.length > 0 && (
        <Card animate delay={0.15} className="mb-md">
          <div className="flex items-center gap-md flex-wrap">
            <div className="flex items-center gap-sm flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="text-fg-tertiary flex-shrink-0" />
              <TInput
                placeholder="Rechercher code, nom…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="border-none bg-transparent focus:ring-0 px-0"
              />
              {search && <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary"><X size={14} /></button>}
            </div>
            <TSelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-8 w-auto min-w-[130px] text-body-sm">
              <option value="all">Tous types</option>
              {TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
            </TSelect>
            <TSelect value={destFilter} onChange={(e) => setDestFilter(e.target.value)} className="h-8 w-auto min-w-[150px] text-body-sm">
              <option value="all">Toutes destinations</option>
              {DESTINATIONS.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
            </TSelect>
            <div className="ml-auto text-caption font-mono text-fg-tertiary">{filtered.length}/{items.length}</div>
          </div>
        </Card>
      )}

      <Card animate delay={0.25} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Dna}
            title="Aucune variété"
            description="Crée tes variétés pour commencer la planification."
            action={<Button onClick={openNew}><Plus size={14} strokeWidth={2.5} /> Nouvelle variété</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Aucun résultat"
            description="Aucune variété ne correspond à tes filtres."
            action={<Button variant="ghost" onClick={() => { setSearch(''); setTypeFilter('all'); setDestFilter('all') }}>Réinitialiser</Button>}
          />
        ) : (
          <DataTable minWidth={1100}>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Nom commercial</TH>
                <TH>Type</TH>
                <TH>Destination</TH>
                <TH right>Rdt th.</TH>
                <TH right>Coût/m²</TH>
                <TH right>Prix Local (MAD)</TH>
                <TH right>Prix Export (MAD)</TH>
                <TH right>Cycle</TH>
                <TH right>Actions</TH>
              </TR>
            </THead>
            <tbody>
              {filtered.map((v, i) => (
                <TR key={v.id} animate delay={0.04 + i * 0.02}>
                  <TD mono className="text-caption font-semibold text-fg-tertiary">{v.code}</TD>
                  <TD className="font-display font-semibold text-fg-primary">{v.commercial_name}</TD>
                  <TD><Badge variant="info" size="sm">{v.type}</Badge></TD>
                  <TD><Badge variant={DEST_VARIANT[v.destination] || 'default'} size="sm">{v.destination?.replace('_', ' ')}</Badge></TD>
                  <TD right mono className="text-fg-secondary">
                    {v.theoretical_yield_per_m2 ? <span><NumberDisplay value={Number(v.theoretical_yield_per_m2)} decimals={1} /> kg</span> : <span className="text-fg-tertiary">—</span>}
                  </TD>
                  <TD right mono className="text-fg-secondary">
                    {v.theoretical_cost_per_m2 ? <NumberDisplay value={Number(v.theoretical_cost_per_m2)} decimals={0} /> : <span className="text-fg-tertiary">—</span>}
                  </TD>
                  <TD right mono className="text-success">
                    {v.avg_price_local ? <NumberDisplay value={Number(v.avg_price_local)} decimals={2} /> : <span className="text-fg-tertiary">—</span>}
                  </TD>
                  <TD right mono className="text-warning">
                    {v.avg_price_export ? <NumberDisplay value={Number(v.avg_price_export)} decimals={2} /> : <span className="text-fg-tertiary">—</span>}
                  </TD>
                  <TD right mono className="text-fg-secondary">
                    {v.estimated_cycle_days ? `${v.estimated_cycle_days}j` : <span className="text-fg-tertiary">—</span>}
                  </TD>
                  <TD right>
                    <div className="flex items-center justify-end gap-1">
                      <Button onClick={() => openEdit(v)} variant="ghost" size="icon-sm" title="Modifier">
                        <Pencil size={12} strokeWidth={2.2} />
                      </Button>
                      <Button onClick={() => del(v)} variant="ghost" size="icon-sm" title="Archiver" className="hover:text-danger">
                        <Trash2 size={12} strokeWidth={2.2} />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </div>
  )
}
