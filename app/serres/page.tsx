'use client'
/**
 * /serres — Gestion des serres (vitrine du nouveau design system).
 * Cards avec gradient, badges sémantiques, animations stagger, toasts.
 */
import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Box, Plus, Pencil, Trash2, Search, MapPin, Maximize, Activity,
  AlertCircle, X,
} from 'lucide-react'

import { getSerres, deleteSerre, getFarms, supabase } from '@/lib/supabase'
import { genCode } from '@/lib/utils'
import { cn } from '@/lib/cn'
import { formatArea } from '@/lib/format'

import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Textarea, Field } from '@/components/ui/Input'
import { Modal, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { AreaDisplay } from '@/components/display'

const TYPE_OPTS = ['tunnel', 'chapelle', 'venlo', 'multispan', 'solaire', 'autre'] as const
const STATUS_OPTS = ['active', 'en_preparation', 'hors_service', 'renovation'] as const

const STATUS_COLOR: Record<string, string> = {
  active:         '#10b981',
  en_preparation: '#a855f7',
  hors_service:   '#ef4444',
  renovation:     '#3b82f6',
}

export default function SerresPage() {
  const [serres, setSerres] = useState<any[]>([])
  const [farms, setFarms]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalNew, setModalNew]   = useState(false)
  const [modalEdit, setModalEdit] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  // Filtres
  const [search, setSearch] = useState('')
  const [farmFilter, setFarmFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Form
  const [form, setForm] = useState({
    farm_id: '', code: '', name: '', type: 'tunnel', status: 'active',
    total_area: '', exploitable_area: '', notes: '',
  })
  const [formE, setFormE] = useState<Record<string, any>>({})
  const upd = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))
  const updE = (k: string) => (e: any) => setFormE(f => ({ ...f, [k]: e.target.value }))

  const load = async () => {
    setLoading(true)
    const [sr, fr] = await Promise.all([getSerres(), getFarms()])
    setSerres(sr); setFarms(fr); setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Filtrage live
  const filtered = useMemo(() => {
    return serres.filter(s => {
      if (farmFilter !== 'all' && s.farm_id !== farmFilter) return false
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!(`${s.code} ${s.name} ${s.farms?.name ?? ''}`).toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [serres, search, farmFilter, statusFilter])

  // Stats agrégées
  const stats = useMemo(() => {
    const totalArea = serres.reduce((s, x) => s + Number(x.total_area || 0), 0)
    const exploitable = serres.reduce((s, x) => s + Number(x.exploitable_area || 0), 0)
    const active = serres.filter(s => s.status === 'active').length
    return {
      count: serres.length,
      active,
      totalArea,
      exploitable,
      farms: new Set(serres.map(s => s.farm_id)).size,
    }
  }, [serres])

  const openNew = () => {
    const codes = serres.map(s => s.code)
    const farmId = farms.length === 1 ? farms[0].id : ''
    setForm({
      farm_id: farmId, code: genCode('S', codes),
      name: '', type: 'tunnel', status: 'active',
      total_area: '', exploitable_area: '', notes: '',
    })
    setModalNew(true)
  }

  const openEdit = (s: any) => {
    setFormE({
      farm_id: s.farm_id, code: s.code, name: s.name, type: s.type, status: s.status,
      total_area: String(s.total_area || ''), exploitable_area: String(s.exploitable_area || ''),
      notes: s.notes || '',
    })
    setModalEdit(s)
  }

  const save = async () => {
    if (!form.farm_id || !form.name || !form.total_area) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('greenhouses').insert({
        farm_id: form.farm_id, code: form.code, name: form.name,
        type: form.type, status: form.status,
        total_area: Number(form.total_area),
        exploitable_area: Number(form.exploitable_area || form.total_area),
        notes: form.notes || null,
      }).select('*, farms(name)').single()
      if (error) throw error
      setSerres(p => [data, ...p]); setDone(true)
      toast.success(`Serre "${data.name}" créée`)
      setTimeout(() => { setModalNew(false); setDone(false) }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  const saveEdit = async () => {
    if (!modalEdit || !formE.name) return
    setSaving(true)
    try {
      const { error } = await supabase.from('greenhouses').update({
        farm_id: formE.farm_id, code: formE.code, name: formE.name,
        type: formE.type, status: formE.status,
        total_area: Number(formE.total_area) || 0,
        exploitable_area: Number(formE.exploitable_area || formE.total_area) || 0,
        notes: formE.notes || null,
      }).eq('id', modalEdit.id)
      if (error) throw error
      setDone(true)
      toast.success('Serre modifiée')
      setTimeout(() => { setModalEdit(null); setDone(false); load() }, 1200)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setSaving(false)
  }

  const del = async (id: string, name: string) => {
    if (!confirm(`Supprimer "${name}" ?`)) return
    try {
      await deleteSerre(id)
      setSerres(p => p.filter(s => s.id !== id))
      toast.success(`Serre "${name}" supprimée`)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
  }

  // ─── Formulaire partagé New/Edit ───
  const FormBlock = ({ vals, onChange, isNew = true }: { vals: any; onChange: (k: string) => (e: any) => void; isNew?: boolean }) => (
    <div className="space-y-md">
      {isNew && (
        <Field label="Ferme" required>
          {farms.length === 0 ? (
            <div className="flex items-center gap-2 px-md py-2 rounded-md border border-danger/30 bg-danger/10 text-danger text-body-sm">
              <AlertCircle size={14} /> Aucune ferme — crée d'abord une ferme
            </div>
          ) : (
            <TSelect value={vals.farm_id} onChange={onChange('farm_id')}>
              <option value="">— Sélectionner —</option>
              {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </TSelect>
          )}
        </Field>
      )}
      <div className="grid grid-cols-2 gap-md">
        <Field label="Code"><TInput value={vals.code} onChange={onChange('code')} /></Field>
        <Field label="Nom" required><TInput value={vals.name} onChange={onChange('name')} placeholder="Serre Nord A" autoFocus /></Field>
      </div>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Type">
          <TSelect value={vals.type} onChange={onChange('type')}>
            {TYPE_OPTS.map(t => <option key={t}>{t}</option>)}
          </TSelect>
        </Field>
        <Field label="Statut">
          <TSelect value={vals.status} onChange={onChange('status')}>
            {STATUS_OPTS.map(t => <option key={t}>{t.replace('_', ' ')}</option>)}
          </TSelect>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Superficie totale (m²)" required><TInput type="number" value={vals.total_area} onChange={onChange('total_area')} placeholder="5000" /></Field>
        <Field label="Exploitable (m²)" hint="= totale si vide"><TInput type="number" value={vals.exploitable_area} onChange={onChange('exploitable_area')} /></Field>
      </div>
      <Field label="Notes"><Textarea rows={2} value={vals.notes} onChange={onChange('notes')} /></Field>
    </div>
  )

  return (
    <div>
      {/* ─── Modals ─── */}
      {modalNew && (
        <Modal title="NOUVELLE SERRE" onClose={() => { setModalNew(false); setDone(false) }}>
          {done ? <SuccessMessage message="Serre créée !" /> : (
            <>
              <FormBlock vals={form} onChange={upd} isNew />
              <ModalFooter onCancel={() => setModalNew(false)} onSave={save} loading={saving} disabled={!form.farm_id || !form.name || !form.total_area} saveLabel="CRÉER" />
            </>
          )}
        </Modal>
      )}
      {modalEdit && (
        <Modal title={`MODIFIER — ${modalEdit.name}`} onClose={() => { setModalEdit(null); setDone(false) }}>
          {done ? <SuccessMessage message="Serre modifiée !" /> : (
            <>
              <FormBlock vals={formE} onChange={updE} isNew={false} />
              <ModalFooter onCancel={() => setModalEdit(null)} onSave={saveEdit} loading={saving} disabled={!formE.name} saveLabel="ENREGISTRER" />
            </>
          )}
        </Modal>
      )}

      {/* ─── Page Header avec stats ─── */}
      <PageHeader
        title="Serres"
        subtitle="Infrastructure"
        icon={Box}
        iconColor="#0ea5e9"
        description={`${stats.count} serre${stats.count > 1 ? 's' : ''} sur ${stats.farms} ferme${stats.farms > 1 ? 's' : ''}`}
        actions={
          <Button onClick={openNew} variant="primary" size="md">
            <Plus size={14} strokeWidth={2.5} />
            Nouvelle serre
          </Button>
        }
        stats={loading ? [] : [
          { label: 'Total',       value: String(stats.count),                    icon: Box,      color: '#0ea5e9' },
          { label: 'Actives',     value: String(stats.active),                   icon: Activity, color: '#10b981' },
          { label: 'Surface',     value: <AreaDisplay value={stats.totalArea}    showTooltip={false} className="!text-current" />, icon: Maximize, color: '#a855f7' },
          { label: 'Exploitable', value: <AreaDisplay value={stats.exploitable}  showTooltip={false} className="!text-current" />, icon: Maximize, color: '#3b82f6' },
          { label: 'Fermes',      value: String(stats.farms),                    icon: MapPin,   color: '#f59e0b' },
        ]}
      />

      {/* ─── Filtres ─── */}
      {!loading && serres.length > 0 && (
        <Card animate delay={0.15} className="mb-md">
          <div className="flex items-center gap-md flex-wrap">
            <div className="flex items-center gap-sm flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="text-fg-tertiary flex-shrink-0" />
              <TInput
                placeholder="Rechercher code, nom, ferme…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="border-none bg-transparent focus:ring-0 px-0"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-sm">
              <Badge variant="default" size="sm">FERME</Badge>
              <TSelect value={farmFilter} onChange={(e) => setFarmFilter(e.target.value)} className="h-8 text-body-sm w-auto min-w-[160px]">
                <option value="all">Toutes</option>
                {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </TSelect>
            </div>
            <div className="flex items-center gap-sm">
              <Badge variant="default" size="sm">STATUT</Badge>
              <TSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 text-body-sm w-auto min-w-[140px]">
                <option value="all">Tous</option>
                {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </TSelect>
            </div>
            {(search || farmFilter !== 'all' || statusFilter !== 'all') && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFarmFilter('all'); setStatusFilter('all') }}>
                Réinitialiser
              </Button>
            )}
            <div className="ml-auto text-caption font-mono text-fg-tertiary">
              {filtered.length}/{serres.length}
            </div>
          </div>
        </Card>
      )}

      {/* ─── Liste ─── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-md">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : serres.length === 0 ? (
        <EmptyState
          icon={Box}
          title="Aucune serre"
          description="Crée ta première serre pour commencer à planifier les cultures."
          action={<Button onClick={openNew}><Plus size={14} strokeWidth={2.5} /> Nouvelle serre</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Aucun résultat"
          description="Aucune serre ne correspond à tes filtres."
          action={<Button variant="ghost" onClick={() => { setSearch(''); setFarmFilter('all'); setStatusFilter('all') }}>Réinitialiser</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-md">
          {filtered.map((s, i) => {
            const color = STATUS_COLOR[s.status] || '#64748b'
            const usagePct = s.total_area > 0 ? (Number(s.exploitable_area || 0) / Number(s.total_area)) * 100 : 100
            return (
              <Card
                key={s.id}
                animate
                delay={0.05 + i * 0.03}
                interactive
                padding="none"
                className="overflow-hidden flex flex-col group"
              >
                {/* Bandeau coloré */}
                <div className="h-1" style={{ background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 50%, transparent))` }} />

                <div className="p-lg flex-1 flex flex-col">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-sm mb-md pb-md border-b border-border">
                    <div className="min-w-0">
                      <div className="font-display text-heading font-bold text-fg-primary uppercase tracking-tight truncate">
                        {s.name}
                      </div>
                      <div className="font-mono text-caption text-fg-tertiary mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold">{s.code}</span>
                        <span className="opacity-50">·</span>
                        <span>{s.type}</span>
                        {s.farms?.name && (
                          <>
                            <span className="opacity-50">·</span>
                            <span className="flex items-center gap-1"><MapPin size={9} />{s.farms.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <StatusBadge status={s.status} size="sm" />
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-sm mb-md">
                    <div className="rounded-md bg-surface-sunk border border-border px-md py-sm">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-fg-tertiary mb-0.5">Superficie</div>
                      <div className="font-display text-heading font-bold text-fg-primary">
                        <AreaDisplay value={Number(s.total_area)} showTooltip={false} />
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-sunk border border-border px-md py-sm">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-fg-tertiary mb-0.5">Exploitable</div>
                      <div className="font-display text-heading font-bold text-info">
                        <AreaDisplay value={Number(s.exploitable_area || s.total_area)} showTooltip={false} />
                      </div>
                    </div>
                  </div>

                  {/* Barre d'usage */}
                  <div className="mb-md">
                    <div className="flex justify-between items-center text-caption font-mono text-fg-tertiary mb-1">
                      <span>Taux d'exploitation</span>
                      <span className="text-fg-secondary tabular-nums">{usagePct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-sunk overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${usagePct}%` }}
                        transition={{ delay: 0.3 + i * 0.05, duration: 0.6, ease: 'easeOut' }}
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 60%, transparent))` }}
                      />
                    </div>
                  </div>

                  {s.notes && (
                    <div className="text-caption text-fg-tertiary italic mb-md border-l-2 border-border pl-sm">
                      {s.notes}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-auto grid grid-cols-[1fr_auto] gap-xs pt-sm border-t border-border">
                    <Button onClick={() => openEdit(s)} variant="secondary" size="sm">
                      <Pencil size={12} strokeWidth={2.5} /> Modifier
                    </Button>
                    <Button onClick={() => del(s.id, s.name)} variant="destructive" size="icon-sm" title="Supprimer">
                      <Trash2 size={13} strokeWidth={2.2} />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
