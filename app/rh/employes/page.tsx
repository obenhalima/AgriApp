'use client'
/**
 * /rh/employes — Refonte avec le design system.
 * Conserve toute la logique métier (paie, mission tâcherons) — refait juste le rendu.
 */
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  UserSquare, Plus, Pencil, UserCheck, UserX, Users, Search, X, Wrench,
  Wallet, Phone, Mail, MapPin, Banknote, Calendar, BadgeInfo,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { computePayroll, fmtMAD, type PayFrequency } from '@/lib/payroll'
import { cn } from '@/lib/cn'
import { useReferenceList } from '@/lib/useReferenceList'

import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Textarea, Field } from '@/components/ui/Input'
import { Modal, FormGroup, FormRow, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { MoneyDisplay } from '@/components/display'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'

// ─── Types ───
type Worker = {
  id: string
  matricule: string | null
  first_name: string; last_name: string
  cin: string | null; cnss_number: string | null
  date_birth: string | null; date_hired?: string | null; start_date: string | null
  category: string | null
  contract_type: string | null
  pay_frequency: string | null
  base_salary: number | null; daily_rate: number | null
  function: string | null
  family_status: string | null; dependents: number | null
  bank_iban: string | null; payment_method: string | null
  farm_id: string | null
  phone: string | null; email: string | null; address: string | null
  is_active: boolean
  mission_label: string | null
  mission_days_planned: number | null; mission_days_done: number | null
  mission_start_date: string | null; mission_end_date: string | null
}
type Farm = { id: string; code: string; name: string }

const CATEGORIES = [
  { code: 'fermier',     label: 'Fermier',          icon: '🌾',  color: '#10b981', defaultFreq: 'quinzaine' as PayFrequency, description: 'Permanent — paie quinzaine' },
  { code: 'staff_admin', label: 'Staff admin',      icon: '🧑‍💼', color: '#8b5cf6', defaultFreq: 'mensuel' as PayFrequency,    description: 'Personnel admin — paie mensuelle' },
  { code: 'saisonnier',  label: 'Saisonnier',       icon: '🌻',  color: '#f59e0b', defaultFreq: 'journalier' as PayFrequency, description: 'Saisonnier — paie journalière' },
  { code: 'tacheron',    label: 'Staff à la tâche', icon: '🛠️',  color: '#ec4899', defaultFreq: 'journalier' as PayFrequency, description: 'Mission ponctuelle' },
]
// FAMILY_STATUS, PAY_METHODS, CONTRACT_TYPES sont maintenant chargés
// dynamiquement via useReferenceList (no-code, voir /admin/referentiels).
// CATEGORIES reste en code : il porte de la logique de paie (defaultFreq).

const empty: Partial<Worker> = {
  first_name: '', last_name: '', cin: '', cnss_number: '', matricule: '',
  category: 'fermier', contract_type: 'CDI', pay_frequency: 'quinzaine',
  base_salary: 0, daily_rate: 0, function: '',
  family_status: 'celibataire', dependents: 0,
  bank_iban: '', payment_method: 'virement',
  phone: '', email: '', address: '', is_active: true,
  mission_label: '', mission_days_planned: 0, mission_start_date: '', mission_end_date: '', mission_days_done: 0,
}

export default function EmployesPage() {
  const { values: FAMILY_STATUS } = useReferenceList('family_status')
  const { values: PAY_METHODS } = useReferenceList('payment_method')
  const { values: CONTRACT_TYPES } = useReferenceList('contract_type')
  const [items, setItems] = useState<Worker[]>([])
  const [farms, setFarms] = useState<Farm[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active')
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Worker | null>(null)
  const [form, setForm] = useState<Partial<Worker>>(empty)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [modalError, setModalError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [w, f] = await Promise.all([
        supabase.from('workers').select('*').order('last_name'),
        supabase.from('farms').select('id, code, name').eq('is_active', true).order('name'),
      ])
      if (w.error) throw w.error
      setItems((w.data ?? []) as any)
      setFarms((f.data ?? []) as any)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => items.filter(w => {
    if (filterCategory && w.category !== filterCategory) return false
    if (filterStatus === 'active' && !w.is_active) return false
    if (filterStatus === 'inactive' && w.is_active) return false
    if (search) {
      const s = search.toLowerCase()
      const hay = `${w.first_name} ${w.last_name} ${w.matricule ?? ''} ${w.cin ?? ''} ${w.cnss_number ?? ''} ${w.function ?? ''}`.toLowerCase()
      if (!hay.includes(s)) return false
    }
    return true
  }), [items, filterCategory, filterStatus, search])

  // Stats
  const stats = useMemo(() => {
    const active = items.filter(i => i.is_active)
    const totalGross = active.reduce((s, i) => s + Number(i.base_salary || 0), 0)
    return {
      total: items.length,
      active: active.length,
      inactive: items.length - active.length,
      totalGross,
      byCategory: CATEGORIES.map(c => ({
        ...c,
        count: active.filter(i => i.category === c.code).length,
      })),
    }
  }, [items])

  const openCreate = () => { setEditing(null); setForm(empty); setModalOpen(true); setDone(false); setModalError('') }
  const openEdit = (w: Worker) => { setEditing(w); setForm({ ...w }); setModalOpen(true); setDone(false); setModalError('') }
  const f = (k: keyof Worker) => (e: any) => setForm(s => ({ ...s, [k]: e.target.value }))
  const onChangeCategory = (e: any) => {
    const cat = e.target.value
    const def = CATEGORIES.find(c => c.code === cat)
    setForm(s => ({ ...s, category: cat, pay_frequency: def?.defaultFreq ?? s.pay_frequency }))
  }

  const save = async () => {
    setModalError('')
    if (!form.first_name || !form.last_name) {
      setModalError('Nom et prénom sont requis')
      return
    }
    setSaving(true)
    try {
      const payload: any = {
        first_name: form.first_name,
        last_name: form.last_name,
        cin: form.cin || null,
        cnss_number: form.cnss_number || null,
        ...(editing ? { matricule: form.matricule || null } : {}),
        category: form.category,
        contract_type: form.contract_type,
        pay_frequency: form.pay_frequency,
        base_salary: Number(form.base_salary) || 0,
        daily_rate: Number(form.daily_rate) || 0,
        function: form.function || null,
        family_status: form.family_status,
        dependents: Number(form.dependents) || 0,
        bank_iban: form.bank_iban || null,
        payment_method: form.payment_method,
        farm_id: form.farm_id || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        date_birth: form.date_birth || null,
        start_date: form.start_date || null,
        is_active: form.is_active ?? true,
        mission_label: form.mission_label || null,
        mission_days_planned: Number(form.mission_days_planned) || null,
        mission_start_date: form.mission_start_date || null,
        mission_end_date: form.mission_end_date || null,
        mission_days_done: Number(form.mission_days_done) || 0,
      }
      if (editing) {
        const { error } = await supabase.from('workers').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('workers').insert(payload).select()
        if (error) throw error
      }
      setDone(true)
      toast.success(editing ? 'Employé modifié' : 'Employé créé')
      setTimeout(() => { setModalOpen(false); setDone(false); load() }, 1000)
    } catch (e: any) {
      setModalError(`Erreur : ${e?.message || 'inconnue'}${e?.details ? ' — ' + e.details : ''}`)
    }
    setSaving(false)
  }

  const toggleActive = async (w: Worker) => {
    if (!confirm(`${w.is_active ? 'Désactiver' : 'Réactiver'} ${w.first_name} ${w.last_name} ?`)) return
    try {
      const { error } = await supabase.from('workers').update({ is_active: !w.is_active }).eq('id', w.id)
      if (error) throw error
      toast.success(w.is_active ? `${w.first_name} désactivé` : `${w.first_name} réactivé`)
      load()
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
  }

  return (
    <div>
      <PageHeader
        title="Employés"
        subtitle="Ressources humaines"
        icon={UserSquare}
        iconColor="#0ea5e9"
        description={`${filtered.length} / ${items.length} employé${items.length > 1 ? 's' : ''} affichés`}
        actions={
          <Button onClick={openCreate} variant="primary">
            <Plus size={14} strokeWidth={2.5} /> Nouvel employé
          </Button>
        }
        stats={loading ? [] : [
          { label: 'Total',     value: String(stats.total),                                                         icon: Users,     color: '#0ea5e9' },
          { label: 'Actifs',    value: String(stats.active),                                                        icon: UserCheck, color: '#10b981' },
          { label: 'Inactifs',  value: String(stats.inactive),                                                      icon: UserX,     color: '#64748b' },
          { label: 'Masse brute', value: <MoneyDisplay value={stats.totalGross} compact="auto" showCurrency={false} className="!text-current" />, icon: Wallet,    color: '#f59e0b' },
        ]}
      />

      {/* Filtres + catégories en pills */}
      <Card animate delay={0.15} className="mb-md">
        <div className="flex items-center gap-md flex-wrap">
          <div className="flex items-center gap-sm flex-1 min-w-[220px] max-w-md">
            <Search size={14} className="text-fg-tertiary flex-shrink-0" />
            <TInput
              placeholder="Recherche (nom, matricule, CIN, fonction…)"
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
            <TSelect value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="h-8 w-auto min-w-[120px] text-body-sm">
              <option value="active">Actifs</option>
              <option value="inactive">Inactifs</option>
              <option value="all">Tous</option>
            </TSelect>
          </div>
        </div>

        {/* Pills par catégorie */}
        <div className="flex flex-wrap gap-1.5 mt-md pt-md border-t border-border">
          <button
            onClick={() => setFilterCategory('')}
            className={cn(
              'h-7 px-md rounded-full text-caption font-mono uppercase tracking-wider font-semibold transition-all',
              filterCategory === ''
                ? 'bg-fg-primary text-surface-base'
                : 'bg-surface-sunk text-fg-secondary border border-border hover:border-border-strong'
            )}
          >
            Toutes ({stats.active})
          </button>
          {stats.byCategory.map(c => (
            <button
              key={c.code}
              onClick={() => setFilterCategory(c.code === filterCategory ? '' : c.code)}
              className={cn(
                'h-7 px-md rounded-full text-caption font-mono uppercase tracking-wider font-semibold transition-all',
                'flex items-center gap-1.5',
                filterCategory === c.code
                  ? 'text-white'
                  : 'bg-surface-sunk text-fg-secondary border border-border hover:border-border-strong'
              )}
              style={filterCategory === c.code ? {
                background: c.color,
                boxShadow: `0 2px 8px color-mix(in srgb, ${c.color} 30%, transparent)`,
              } : undefined}
            >
              <span className="text-[12px]">{c.icon}</span>
              {c.label}
              <span className="opacity-70">({c.count})</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Table */}
      <Card animate delay={0.25} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : filtered.length === 0 ? (
          items.length === 0 ? (
            <EmptyState
              icon={UserSquare}
              title="Aucun employé"
              description="Crée ton premier employé pour commencer la gestion RH."
              action={<Button onClick={openCreate}><Plus size={14} strokeWidth={2.5} /> Nouvel employé</Button>}
            />
          ) : (
            <EmptyState
              icon={Search}
              title="Aucun résultat"
              description="Aucun employé ne correspond à tes filtres."
              action={<Button variant="ghost" onClick={() => { setSearch(''); setFilterCategory(''); setFilterStatus('active') }}>Réinitialiser</Button>}
            />
          )
        ) : (
          <DataTable minWidth={1200}>
            <THead>
              <TR>
                <TH>Matricule</TH>
                <TH>Nom complet</TH>
                <TH>Catégorie</TH>
                <TH>Fonction</TH>
                <TH>Contrat</TH>
                <TH>Fréq.</TH>
                <TH right>Brut mensuel</TH>
                <TH>CNSS</TH>
                <TH right>Net estimé</TH>
                <TH>Statut</TH>
                <TH right>Actions</TH>
              </TR>
            </THead>
            <tbody>
              {filtered.map((w, i) => {
                const cat = CATEGORIES.find(c => c.code === w.category)
                const calc = (w.base_salary && Number(w.base_salary) > 0) ? computePayroll({
                  baseSalaryMonthly: Number(w.base_salary),
                  payFrequency: (w.pay_frequency as PayFrequency) ?? 'mensuel',
                  dependents: Number(w.dependents) || 0,
                  familyStatus: (w.family_status as any) ?? 'celibataire',
                }) : null
                return (
                  <TR key={w.id} animate delay={0.05 + i * 0.02} className={cn(!w.is_active && 'opacity-50')}>
                    <TD mono className="text-caption font-semibold">{w.matricule ?? '—'}</TD>
                    <TD className="font-semibold text-fg-primary">{w.last_name} {w.first_name}</TD>
                    <TD>
                      {cat ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-caption font-semibold"
                          style={{ background: `color-mix(in srgb, ${cat.color} 14%, transparent)`, color: cat.color }}
                        >
                          <span>{cat.icon}</span> {cat.label}
                        </span>
                      ) : '—'}
                    </TD>
                    <TD className="text-fg-secondary text-caption">{w.function ?? '—'}</TD>
                    <TD className="text-caption">{w.contract_type ?? '—'}</TD>
                    <TD className="text-caption">{w.pay_frequency ?? '—'}</TD>
                    <TD right mono><MoneyDisplay value={Number(w.base_salary)} showCurrency={false} className="text-fg-primary" /></TD>
                    <TD mono className="text-caption text-fg-tertiary">{w.cnss_number ?? '—'}</TD>
                    <TD right mono>
                      {calc ? <MoneyDisplay value={calc.net_salary} showCurrency={false} className="text-success font-semibold" /> : <span className="text-fg-tertiary">—</span>}
                    </TD>
                    <TD>
                      {w.is_active
                        ? <Badge variant="success" size="sm" dot>Actif</Badge>
                        : <Badge variant="default" size="sm">Inactif</Badge>}
                    </TD>
                    <TD right>
                      <div className="flex items-center justify-end gap-1">
                        <Button onClick={() => openEdit(w)} variant="ghost" size="icon-sm" title="Éditer">
                          <Pencil size={12} strokeWidth={2.2} />
                        </Button>
                        <Button onClick={() => toggleActive(w)} variant="ghost" size="icon-sm" title={w.is_active ? 'Désactiver' : 'Réactiver'}>
                          {w.is_active ? <UserX size={12} strokeWidth={2.2} /> : <UserCheck size={12} strokeWidth={2.2} />}
                        </Button>
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </Card>

      {/* Modal */}
      {modalOpen && (
        <Modal
          title={editing ? `Éditer — ${editing.first_name} ${editing.last_name}` : 'Nouvel employé'}
          onClose={() => setModalOpen(false)} size="lg"
        >
          {done ? (
            <SuccessMessage message={editing ? 'Employé modifié' : 'Employé créé'} />
          ) : (
            <div className="space-y-md">
              <FormRow>
                <FormGroup label={editing ? 'Matricule' : 'Matricule (auto-généré)'}>
                  <TInput
                    type="text"
                    value={editing ? (form.matricule ?? '') : '— auto à la création —'}
                    readOnly
                    className={cn(
                      editing ? '' : 'italic text-fg-tertiary',
                      'cursor-not-allowed bg-surface-sunk'
                    )}
                  />
                </FormGroup>
                <FormGroup label="CIN"><TInput value={form.cin ?? ''} onChange={f('cin')} placeholder="XX123456" /></FormGroup>
                <FormGroup label="N° CNSS"><TInput value={form.cnss_number ?? ''} onChange={f('cnss_number')} placeholder="123456789" /></FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Prénom *"><TInput value={form.first_name ?? ''} onChange={f('first_name')} autoFocus /></FormGroup>
                <FormGroup label="Nom *"><TInput value={form.last_name ?? ''} onChange={f('last_name')} /></FormGroup>
                <FormGroup label="Date naissance"><TInput type="date" value={form.date_birth ?? ''} onChange={f('date_birth')} /></FormGroup>
              </FormRow>

              <FormRow>
                <FormGroup label="Catégorie *">
                  <TSelect value={form.category ?? 'fermier'} onChange={onChangeCategory}>
                    {CATEGORIES.map(c => <option key={c.code} value={c.code}>{c.icon} {c.label}</option>)}
                  </TSelect>
                </FormGroup>
                <FormGroup label="Fonction"><TInput value={form.function ?? ''} onChange={f('function')} placeholder="Ouvrier, Responsable serres…" /></FormGroup>
                <FormGroup label="Ferme">
                  <TSelect value={form.farm_id ?? ''} onChange={f('farm_id')}>
                    <option value="">— aucune —</option>
                    {farms.map(fm => <option key={fm.id} value={fm.id}>{fm.code} — {fm.name}</option>)}
                  </TSelect>
                </FormGroup>
              </FormRow>

              <FormRow>
                <FormGroup label="Type de contrat">
                  <TSelect value={form.contract_type ?? 'CDI'} onChange={f('contract_type')}>
                    {CONTRACT_TYPES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </TSelect>
                </FormGroup>
                <FormGroup label="Date d'embauche"><TInput type="date" value={form.start_date ?? ''} onChange={f('start_date')} /></FormGroup>
                <FormGroup label="Fréquence paie *">
                  <TSelect value={form.pay_frequency ?? 'mensuel'} onChange={f('pay_frequency')}>
                    <option value="mensuel">Mensuel (fin de mois)</option>
                    <option value="quinzaine">Quinzaine (15 et fin de mois)</option>
                    <option value="journalier">Journalier (saisonniers)</option>
                  </TSelect>
                </FormGroup>
              </FormRow>

              {/* Bloc rémunération */}
              <div className="rounded-md border border-border bg-surface-sunk px-md py-sm flex items-center gap-2 text-body-sm text-fg-secondary">
                <Banknote size={14} className="text-success" /> <strong className="text-fg-primary">Rémunération</strong>
              </div>
              <FormRow>
                <FormGroup label="Salaire brut mensuel (MAD)"><TInput type="number" value={String(form.base_salary ?? 0)} onChange={f('base_salary')} /></FormGroup>
                <FormGroup label="Tarif journalier (MAD)"><TInput type="number" value={String(form.daily_rate ?? 0)} onChange={f('daily_rate')} /></FormGroup>
                <FormGroup label="Méthode paiement">
                  <TSelect value={form.payment_method ?? 'virement'} onChange={f('payment_method')}>
                    {PAY_METHODS.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
                  </TSelect>
                </FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Statut familial">
                  <TSelect value={form.family_status ?? 'celibataire'} onChange={f('family_status')}>
                    {FAMILY_STATUS.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                  </TSelect>
                </FormGroup>
                <FormGroup label="Personnes à charge (max 6)">
                  <TInput type="number" value={String(form.dependents ?? 0)} onChange={f('dependents')} />
                </FormGroup>
                <FormGroup label="IBAN">
                  <TInput value={form.bank_iban ?? ''} onChange={f('bank_iban')} placeholder="MA64 011 …" />
                </FormGroup>
              </FormRow>

              <FormRow>
                <FormGroup label="Téléphone"><TInput value={form.phone ?? ''} onChange={f('phone')} placeholder="+212 6 XX XX XX XX" /></FormGroup>
                <FormGroup label="Email"><TInput type="email" value={form.email ?? ''} onChange={f('email')} /></FormGroup>
              </FormRow>
              <FormGroup label="Adresse"><Textarea value={form.address ?? ''} onChange={f('address')} rows={2} /></FormGroup>

              {/* Bloc mission tâcherons */}
              {form.category === 'tacheron' && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-md">
                  <div className="rounded-md border border-pink-500/30 bg-pink-500/5 px-md py-sm flex items-center gap-2 text-body-sm font-semibold" style={{ color: '#ec4899' }}>
                    <Wrench size={14} /> Mission de dépannage — détails
                  </div>
                  <FormGroup label="Libellé mission *">
                    <TInput value={form.mission_label ?? ''} onChange={f('mission_label')} placeholder="Ex: Dépannage récolte serre 3, renfort plantation, etc." />
                  </FormGroup>
                  <FormRow>
                    <FormGroup label="Jours planifiés *"><TInput type="number" value={String(form.mission_days_planned ?? 0)} onChange={f('mission_days_planned')} placeholder="7" /></FormGroup>
                    <FormGroup label="Jours réalisés"><TInput type="number" value={String(form.mission_days_done ?? 0)} onChange={f('mission_days_done')} /></FormGroup>
                    <FormGroup label="Date début"><TInput type="date" value={form.mission_start_date ?? ''} onChange={f('mission_start_date')} /></FormGroup>
                    <FormGroup label="Date fin prévue"><TInput type="date" value={form.mission_end_date ?? ''} onChange={f('mission_end_date')} /></FormGroup>
                  </FormRow>
                  {Number(form.daily_rate) > 0 && Number(form.mission_days_planned) > 0 && (
                    <div className="rounded-md bg-surface-sunk border border-border px-md py-sm text-body-sm text-fg-secondary flex items-center gap-2">
                      <Wallet size={14} className="text-warning" />
                      Coût total prévu :{' '}
                      <strong className="text-fg-primary">
                        <MoneyDisplay value={Number(form.daily_rate) * Number(form.mission_days_planned)} />
                      </strong>{' '}
                      <span className="text-caption text-fg-tertiary">({Number(form.daily_rate)} × {Number(form.mission_days_planned)} jours)</span>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Aperçu calcul paie */}
              {Number(form.base_salary) > 0 && (() => {
                const r = computePayroll({
                  baseSalaryMonthly: Number(form.base_salary),
                  payFrequency: (form.pay_frequency as PayFrequency) ?? 'mensuel',
                  dependents: Number(form.dependents) || 0,
                  familyStatus: form.family_status as any,
                })
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-brand/30 bg-brand/5 p-md"
                  >
                    <div className="flex items-center gap-2 mb-sm">
                      <BadgeInfo size={14} className="text-brand" />
                      <span className="font-display text-body font-bold text-brand">Simulation bulletin (1 période)</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-sm">
                      <SimStat label="Brut période"      value={fmtMAD(r.gross_salary)} />
                      <SimStat label="CNSS + AMO + IR"   value={fmtMAD(r.cnss_employee + r.amo_employee + r.ir_amount)} />
                      <SimStat label="Net à payer"       value={fmtMAD(r.net_salary)} highlight />
                      <SimStat label="Coût employeur"    value={fmtMAD(r.total_employer_cost)} />
                    </div>
                  </motion.div>
                )
              })()}

              {modalError && (
                <div className="rounded-md border border-danger/30 bg-danger/5 p-md text-body-sm text-danger">
                  ⚠ {modalError}
                  {modalError.includes('column') && (
                    <div className="mt-2 text-caption text-warning">
                      💡 Si l'erreur mentionne une colonne manquante, exécute les migrations <strong>018_hr_module.sql</strong> et <strong>019_hr_task_workers.sql</strong>.
                    </div>
                  )}
                </div>
              )}
              <ModalFooter
                onCancel={() => setModalOpen(false)}
                onSave={save}
                loading={saving}
                saveLabel={editing ? 'ENREGISTRER' : 'CRÉER'}
              />
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

function SimStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-fg-tertiary">{label}</div>
      <div className={cn('font-mono text-body font-semibold mt-1', highlight ? 'text-brand font-bold' : 'text-fg-primary')}>{value}</div>
    </div>
  )
}
