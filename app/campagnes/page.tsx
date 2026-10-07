'use client'
import {useLanguage} from '@/lib/i18n'

/**
 * /campagnes — Refonte avec design system.
 */
import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Calendar, Plus, Pencil, AlertCircle, Sprout, Wheat, Coins, Target,
  Search, X,
} from 'lucide-react'

import { supabase, getFarms } from '@/lib/supabase'
import { useReferenceList } from '@/lib/useReferenceList'
import { genCampagneCode } from '@/lib/utils'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'

import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Textarea, Field } from '@/components/ui/Input'
import { Modal, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { MoneyDisplay, VolumeDisplay, DateDisplay } from '@/components/display'
import { useAuth } from '@/lib/auth'

const EMPTY_FORM = {
  code: '', name: '', farm_id: '', status: 'planification',
  preparation_start: '', planting_start: '', harvest_start: '',
  harvest_end: '', campaign_end: '',
  budget_total: '', production_target_kg: '',
  notes: '',
}

// Statut de campagne : référentiel no-code campaign_status (hook ci-dessous).
// ⚠️ Les codes (planification/en_cours/terminee/annulee) pilotent la logique
// (en_cours = campagne active) — éditer les libellés/couleurs, pas les codes.

export default function CampagnesPage() {
 const {t:_ui,text:_uiNode}=useLanguage()

  const { activeDomain } = useAuth()
  const { values: CAMP_STATUS } = useReferenceList('campaign_status')
  const statusColor = (code: string) => CAMP_STATUS.find(v => v.code === code)?.color || '#64748b'
  const [items, setItems] = useState<any[]>([])
  const [farms, setFarms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const upd = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))

  const closeModal = () => { setModal(false); setDone(false); setEditingId(null); setForm(EMPTY_FORM) }

  const load = async () => {
    if (!activeDomain) { setItems([]); setFarms([]); setLoading(false); return }
    try {
      const [c, f] = await Promise.all([
        supabase.from('campaigns').select('*, farms(name)').eq('domain_id', activeDomain.domain_id).order('created_at', { ascending: false }),
        getFarms(activeDomain.domain_id),
      ])
      setItems(c.data || [])
      setFarms(f)
    } catch (e) { /* silent */ }
    setLoading(false)
  }
  useEffect(() => { load() }, [activeDomain?.domain_id])

  const filtered = useMemo(() => items.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!`${c.code} ${c.name} ${c.farms?.name ?? ''}`.toLowerCase().includes(q)) return false
    }
    return true
  }), [items, search, statusFilter])

  const stats = useMemo(() => ({
    count: items.length,
    active: items.filter(c => c.status === 'en_cours').length,
    planification: items.filter(c => c.status === 'planification').length,
    terminees: items.filter(c => c.status === 'terminee').length,
    totalBudget: items.reduce((s, c) => s + Number(c.budget_total || 0), 0),
    totalTarget: items.reduce((s, c) => s + Number(c.production_target_kg || 0), 0),
  }), [items])

  const openCreate = () => {
    const codes = items.map(i => i.code)
    const year = new Date().getFullYear()
    setEditingId(null)
    setForm({
      ...EMPTY_FORM,
      code: genCampagneCode(codes),
      name: `Campagne ${year}-${year + 1}`,
      farm_id: farms.length === 1 ? farms[0].id : '',
    })
    setModal(true)
  }

  const openEdit = (c: any) => {
    setEditingId(c.id)
    setForm({
      code: c.code || '',
      name: c.name || '',
      farm_id: c.farm_id || '',
      status: c.status || 'planification',
      preparation_start: c.preparation_start || '',
      planting_start: c.planting_start || '',
      harvest_start: c.harvest_start || '',
      harvest_end: c.harvest_end || '',
      campaign_end: c.campaign_end || '',
      budget_total: c.budget_total != null ? String(c.budget_total) : '',
      production_target_kg: c.production_target_kg != null ? String(c.production_target_kg / 1000) : '',
      notes: c.notes || '',
    })
    setModal(true)
  }

  const save = async () => {
    if (!form.farm_id || !form.name) return
    setSaving(true)
    try {
      const payload = {
        code: form.code, name: form.name, farm_id: form.farm_id,
        status: form.status || 'planification',
        preparation_start: form.preparation_start || null,
        planting_start: form.planting_start || null,
        harvest_start: form.harvest_start || null,
        harvest_end: form.harvest_end || null,
        campaign_end: form.campaign_end || null,
        budget_total: form.budget_total ? Number(form.budget_total) : null,
        production_target_kg: form.production_target_kg ? Number(form.production_target_kg) * 1000 : null,
        notes: form.notes,
      }
      if (editingId) {
        const { data, error } = await supabase.from('campaigns')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingId)
          .select('*, farms(name)').single()
        if (error) throw error
        setItems(prev => prev.map(i => i.id === editingId ? data : i))
        toast.success(_ui("Campagne modifiée"))
      } else {
        const { data, error } = await supabase.from('campaigns').insert(payload).select('*, farms(name)').single()
        if (error) throw error
        setItems(prev => [data, ...prev])
        toast.success(_ui("Campagne \"{v0}\" créée",{v0:String(data.name)}))
      }
      setDone(true)
      setTimeout(closeModal, 1200)
    } catch (e: any) { toast.error(_ui("Erreur :") + e.message) }
    setSaving(false)
  }

  return (
    <div>
      {modal && (
        <Modal title={editingId ? _ui("MODIFIER CAMPAGNE") : _ui("NOUVELLE CAMPAGNE")} onClose={closeModal} size="lg">
          {done ? <SuccessMessage message={editingId ? _ui("Campagne modifiée !") : _ui("Campagne créée !")} /> : (
            <div className="space-y-md">
              {/* Identification */}
              <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary flex items-center gap-2">
                {" "}{_ui("Identification")}{" "}<div className="flex-1 h-px bg-border ml-2" />
              </div>
              <div className="grid grid-cols-2 gap-md">
                <Field label={_ui("Code (auto-généré)")}><TInput value={form.code} onChange={upd('code')} /></Field>
                <Field label={_ui("Nom de la campagne")} required><TInput value={form.name} onChange={upd('name')} placeholder={_ui("Campagne 2026-2027")} autoFocus /></Field>
              </div>
              <div className="grid grid-cols-2 gap-md">
                <Field label={_ui("Ferme")} required>
                  {farms.length === 0 ? (
                    <div className="flex items-center gap-2 px-md py-2 rounded-md border border-danger/30 bg-danger/10 text-danger text-body-sm">
                      <AlertCircle size={14} /> {" "}{_ui("Aucune ferme — crée d'abord une ferme")}{" "}</div>
                  ) : (
                    <TSelect value={form.farm_id} onChange={upd('farm_id')}>
                      <option value="">{_ui("— Sélectionner —")}</option>
                      {farms.map(f => <option key={f.id} value={f.id}>{f.name} ({f.code})</option>)}
                    </TSelect>
                  )}
                </Field>
                <Field label={_ui("Statut")}>
                  <TSelect value={form.status} onChange={upd('status')}>
                    {CAMP_STATUS.map(s => <option key={s.code} value={s.code}>{_uiNode(s.label)}</option>)}
                  </TSelect>
                </Field>
              </div>

              {/* Calendrier */}
              <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary flex items-center gap-2 mt-md">
                {" "}{_ui("Calendrier")}{" "}<div className="flex-1 h-px bg-border ml-2" />
              </div>
              <div className="grid grid-cols-2 gap-md">
                <Field label={_ui("Début préparation")}><TInput type="date" value={form.preparation_start} onChange={upd('preparation_start')} /></Field>
                <Field label={_ui("Début plantation")}><TInput type="date" value={form.planting_start} onChange={upd('planting_start')} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-md">
                <Field label={_ui("Début récolte")}><TInput type="date" value={form.harvest_start} onChange={upd('harvest_start')} /></Field>
                <Field label={_ui("Fin récolte")}><TInput type="date" value={form.harvest_end} onChange={upd('harvest_end')} /></Field>
              </div>
              <Field label={_ui("Fin de campagne")}><TInput type="date" value={form.campaign_end} onChange={upd('campaign_end')} /></Field>

              {/* Objectifs */}
              <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary flex items-center gap-2 mt-md">
                {" "}{_ui("Objectifs")}{" "}<div className="flex-1 h-px bg-border ml-2" />
              </div>
              <div className="grid grid-cols-2 gap-md">
                <Field label={_ui("Budget prévisionnel (MAD)")}><TInput type="number" value={form.budget_total} onChange={upd('budget_total')} placeholder="4200000" /></Field>
                <Field label={_ui("Objectif production (tonnes)")}><TInput type="number" value={form.production_target_kg} onChange={upd('production_target_kg')} placeholder="1850" /></Field>
              </div>
              <Field label={_ui("Notes")}><Textarea rows={2} value={form.notes} onChange={upd('notes')} /></Field>

              <ModalFooter
                onCancel={closeModal} onSave={save} loading={saving}
                disabled={!form.farm_id || !form.name}
                saveLabel={editingId ? _ui("ENREGISTRER") : _ui("CRÉER LA CAMPAGNE")}
              />
            </div>
          )}
        </Modal>
      )}

      <PageHeader
        title={_ui("Campagnes")}
        subtitle={_ui("Planification")}
        icon={Calendar}
        iconColor="#22c55e"
        description={_ui("{v0} campagne{v1} · {v2} ferme{v3} disponible{v4}",{v0:String(items.length),v1:String(items.length > 1 ? 's' : ''),v2:String(farms.length),v3:String(farms.length > 1 ? 's' : ''),v4:String(farms.length > 1 ? 's' : '')})}
        actions={
          <Button onClick={openCreate} variant="primary" disabled={farms.length === 0}>
            <Plus size={14} strokeWidth={2.5} /> {" "}{_ui("Nouvelle campagne")}{" "}</Button>
        }
        stats={loading ? [] : [
          { label: 'Total',         value: String(stats.count),                                                                  icon: Calendar, color: '#22c55e' },
          { label: 'En cours',      value: String(stats.active),                                                                 icon: Sprout,   color: '#10b981' },
          { label: 'Planification', value: String(stats.planification),                                                          icon: Calendar, color: '#3b82f6' },
          { label: 'Budget total',  value: <MoneyDisplay value={stats.totalBudget} compact="auto" showCurrency={false} className="!text-current" />, icon: Coins,    color: '#f59e0b' },
          { label: 'Objectif total', value: <VolumeDisplay value={stats.totalTarget} forceUnit="t" className="!text-current" />,                       icon: Target,   color: '#a855f7' },
        ]}
      />

      {farms.length === 0 && !loading && (
        <Card variant="ghost" className="mb-md border-warning/30 bg-warning/5">
          <div className="flex items-center gap-sm text-warning text-body-sm">
            <AlertCircle size={16} />
            {" "}{_ui("Crée d'abord une ferme dans")}{" "}<strong>{_ui("Fermes")}</strong> {" "}{_ui("avant de créer une campagne.")}{" "}</div>
        </Card>
      )}

      {!loading && items.length > 0 && (
        <Card animate delay={0.15} className="mb-md">
          <div className="flex items-center gap-md flex-wrap">
            <div className="flex items-center gap-sm flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="text-fg-tertiary flex-shrink-0" />
              <TInput
                placeholder={_ui("Rechercher code, nom, ferme…")}
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="border-none bg-transparent focus:ring-0 px-0"
              />
              {search && <button onClick={() => setSearch('')} className="text-fg-tertiary hover:text-fg-primary"><X size={14} /></button>}
            </div>
            <TSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 w-auto min-w-[150px] text-body-sm">
              <option value="all">{_ui("Tous statuts")}</option>
              {CAMP_STATUS.map(s => <option key={s.code} value={s.code}>{_uiNode(s.label)}</option>)}
            </TSelect>
            <div className="ml-auto text-caption font-mono text-fg-tertiary">{filtered.length}/{items.length}</div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="space-y-md">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title={_ui("Aucune campagne")}
          description={_ui("Crée ta première campagne de production.")}
          action={<Button onClick={openCreate} disabled={farms.length === 0}><Plus size={14} strokeWidth={2.5} /> {" "}{_ui("Nouvelle campagne")}</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={_ui("Aucun résultat")}
          description={_ui("Aucune campagne ne correspond à tes filtres.")}
          action={<Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('all') }}>{_ui("Réinitialiser")}</Button>}
        />
      ) : (
        <div className="flex flex-col gap-md">
          {filtered.map((c, i) => {
            const color = statusColor(c.status)
            return (
              <Card
                key={c.id}
                animate delay={0.05 + i * 0.04}
                interactive
                padding="none"
                className="overflow-hidden"
              >
                <div className="h-1" style={{ background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 50%, transparent))` }} />
                <div className="p-lg">
                  <div className="flex items-start justify-between gap-md mb-md">
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-heading-lg font-bold text-fg-primary uppercase tracking-tight">
                        {c.name}
                      </div>
                      <div className="font-mono text-caption text-fg-tertiary mt-1 flex items-center gap-1.5">
                        <span className="font-semibold">{c.code}</span>
                        {c.farms?.name && (
                          <>
                            <span className="opacity-50">·</span>
                            <span>{c.farms.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-sm flex-shrink-0">
                      <StatusBadge status={c.status} size="md" />
                      <Button onClick={() => openEdit(c)} variant="ghost" size="icon-sm" title={_ui("Modifier")}>
                        <Pencil size={12} strokeWidth={2.2} />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-sm">
                    {[
                      { label: 'Plantation',     icon: Sprout,   value: <DateDisplay value={c.planting_start} variant="compact" /> },
                      { label: 'Début récolte',  icon: Wheat,    value: <DateDisplay value={c.harvest_start} variant="compact" /> },
                      { label: 'Fin récolte',    icon: Wheat,    value: <DateDisplay value={c.harvest_end} variant="compact" /> },
                      { label: 'Budget',         icon: Coins,    value: c.budget_total ? <MoneyDisplay value={Number(c.budget_total)} compact="auto" showCurrency={false} /> : <span className="text-fg-tertiary">—</span> },
                      { label: 'Objectif',       icon: Target,   value: c.production_target_kg ? <VolumeDisplay value={Number(c.production_target_kg)} forceUnit="t" /> : <span className="text-fg-tertiary">—</span> },
                    ].map((item, idx) => {
                      const Icon = item.icon
                      return (
                        <div key={idx} className="rounded-md bg-surface-sunk border border-border px-md py-sm">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Icon size={10} className="text-fg-tertiary" strokeWidth={2.2} />
                            <span className="font-mono text-[9px] uppercase tracking-wider text-fg-tertiary">{_uiNode(item.label)}</span>
                          </div>
                          <div className="font-display font-semibold text-body-sm text-fg-primary">{item.value}</div>
                        </div>
                      )
                    })}
                  </div>

                  {c.notes && (
                    <div className="mt-md text-caption text-fg-tertiary italic border-l-2 border-border pl-sm">
                      {c.notes}
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
