'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Palmtree, Plus, Check, X, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useReferenceList } from '@/lib/useReferenceList'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Textarea, Field } from '@/components/ui/Input'
import { Modal, FormGroup, FormRow, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { cn } from '@/lib/cn'

type LeaveRequest = {
  id: string; worker_id: string; type: string
  start_date: string; end_date: string; days: number
  reason: string | null; status: string
  approved_at: string | null; refused_reason: string | null
  notes: string | null; created_at: string
}
type Worker = { id: string; first_name: string; last_name: string; matricule: string | null; category: string | null }

// TYPES de congés : chargés depuis le référentiel no-code 'leave_type'
// (voir hook dans le composant). Le statut reste un état géré par l'app.
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  demande: 'warning', approuve: 'success', refuse: 'danger', annule: 'default',
}
const STATUS_LABEL: Record<string, string> = {
  demande: 'En attente', approuve: 'Approuvé', refuse: 'Refusé', annule: 'Annulé',
}

const computeDays = (start: string, end: string): number => {
  if (!start || !end) return 0
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1)
}

export default function CongesPage() {
  const { values: WLEAVE } = useReferenceList('leave_type')
  const TYPES = useMemo(() => WLEAVE.map(v => ({
    code: v.code, label: v.label, icon: v.icon ?? '', color: v.color ?? '#64748b',
  })), [WLEAVE])
  const [items, setItems] = useState<LeaveRequest[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<Partial<LeaveRequest>>({ type: 'annuel', status: 'demande' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [lr, w] = await Promise.all([
        supabase.from('leave_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('workers').select('id, first_name, last_name, matricule, category').eq('is_active', true).order('last_name'),
      ])
      if (lr.error) throw lr.error
      setItems((lr.data ?? []) as any); setWorkers((w.data ?? []) as any)
    } catch (e: any) { toast.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => filterStatus === 'all' ? items : items.filter(i => i.status === filterStatus), [items, filterStatus])
  const counts = useMemo(() => ({
    demande: items.filter(i => i.status === 'demande').length,
    approuve: items.filter(i => i.status === 'approuve').length,
    refuse: items.filter(i => i.status === 'refuse').length,
    total_days_taken: items.filter(i => i.status === 'approuve' && i.type === 'annuel').reduce((s, i) => s + (Number(i.days) || 0), 0),
  }), [items])

  const f = (k: keyof LeaveRequest) => (e: any) => setForm(s => ({ ...s, [k]: e.target.value }))

  const save = async () => {
    if (!form.worker_id || !form.start_date || !form.end_date || !form.type) { toast.error('Tous les champs requis'); return }
    setSaving(true)
    try {
      const days = computeDays(form.start_date, form.end_date)
      const { error } = await supabase.from('leave_requests').insert({
        worker_id: form.worker_id, type: form.type, start_date: form.start_date, end_date: form.end_date, days,
        reason: form.reason || null, status: 'demande',
      })
      if (error) throw error
      setDone(true)
      toast.success('Demande créée')
      setTimeout(() => { setModalOpen(false); setDone(false); setForm({ type: 'annuel', status: 'demande' }); load() }, 800)
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  const updateStatus = async (id: string, status: 'approuve' | 'refuse', refused_reason?: string) => {
    const patch: any = { status, approved_at: new Date().toISOString() }
    if (status === 'refuse') patch.refused_reason = refused_reason ?? null
    try {
      const { error } = await supabase.from('leave_requests').update(patch).eq('id', id)
      if (error) throw error
      toast.success(status === 'approuve' ? 'Demande approuvée' : 'Demande refusée')
      load()
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
  }

  return (
    <div>
      <PageHeader
        title="Congés" subtitle="Ressources humaines" icon={Palmtree} iconColor="#f59e0b"
        description="Acquisition standard Maroc : 1,5 jour / mois travaillé soit 18 j/an"
        actions={<Button onClick={() => { setModalOpen(true); setDone(false) }} variant="primary"><Plus size={14} strokeWidth={2.5} /> Nouvelle demande</Button>}
        stats={loading ? [] : [
          { label: 'En attente', value: String(counts.demande), icon: Clock, color: '#f59e0b' },
          { label: 'Approuvés', value: String(counts.approuve), icon: CheckCircle2, color: '#10b981' },
          { label: 'Refusés', value: String(counts.refuse), icon: XCircle, color: '#ef4444' },
          { label: 'Jours pris', value: `${counts.total_days_taken}j`, icon: Palmtree, color: '#0ea5e9' },
        ]}
      />

      <Card animate delay={0.15} className="mb-md">
        <div className="flex flex-wrap gap-1">
          {(['all', 'demande', 'approuve', 'refuse'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn(
                'h-8 px-md rounded-md font-mono text-[11px] uppercase tracking-wider font-semibold transition-all',
                filterStatus === s ? 'bg-brand text-white shadow-[0_2px_8px_var(--neon-dim)]' : 'bg-surface-raised text-fg-secondary border border-border hover:border-border-strong'
              )}>
              {s === 'all' ? 'Tous' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </Card>

      <Card animate delay={0.25} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Palmtree} title="Aucune demande" action={<Button onClick={() => setModalOpen(true)}><Plus size={14} /> Nouvelle</Button>} />
        ) : (
          <DataTable minWidth={1100}>
            <THead>
              <TR><TH>Employé</TH><TH>Type</TH><TH>Du</TH><TH>Au</TH><TH right>Jours</TH><TH>Motif</TH><TH>Statut</TH><TH right>Actions</TH></TR>
            </THead>
            <tbody>
              {filtered.map((lr, i) => {
                const w = workers.find(x => x.id === lr.worker_id)
                const t = TYPES.find(x => x.code === lr.type)
                return (
                  <TR key={lr.id} animate delay={0.04 + i * 0.02}>
                    <TD>
                      <div className="font-display font-semibold text-fg-primary">{w ? `${w.last_name} ${w.first_name}` : '—'}</div>
                      {w?.matricule && <div className="font-mono text-[10px] text-fg-tertiary">{w.matricule}</div>}
                    </TD>
                    <TD>
                      {t ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-caption font-semibold"
                          style={{ background: `color-mix(in srgb, ${t.color} 14%, transparent)`, color: t.color }}>
                          <span>{t.icon}</span> {t.label}
                        </span>
                      ) : lr.type}
                    </TD>
                    <TD mono className="text-caption">{lr.start_date}</TD>
                    <TD mono className="text-caption">{lr.end_date}</TD>
                    <TD right mono className="font-bold">{lr.days}j</TD>
                    <TD className="text-caption text-fg-secondary truncate max-w-[200px]">{lr.reason ?? '—'}</TD>
                    <TD><Badge variant={STATUS_VARIANT[lr.status] || 'default'} size="sm">{STATUS_LABEL[lr.status] ?? lr.status}</Badge></TD>
                    <TD right>
                      {lr.status === 'demande' && (
                        <div className="flex items-center justify-end gap-1">
                          <Button onClick={() => updateStatus(lr.id, 'approuve')} variant="primary" size="xs" title="Approuver"><Check size={11} /></Button>
                          <Button onClick={() => updateStatus(lr.id, 'refuse', prompt('Motif du refus ?') ?? undefined)} variant="ghost" size="xs" title="Refuser" className="hover:text-danger"><X size={11} /></Button>
                        </div>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </Card>

      {modalOpen && (
        <Modal title="Nouvelle demande de congé" onClose={() => setModalOpen(false)}>
          {done ? <SuccessMessage message="Demande créée" /> : (
            <div className="space-y-md">
              <Field label="Employé" required>
                <TSelect value={form.worker_id ?? ''} onChange={f('worker_id')}>
                  <option value="">— Sélectionner —</option>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.last_name} {w.first_name} {w.matricule ? `(${w.matricule})` : ''}</option>)}
                </TSelect>
              </Field>
              <Field label="Type" required>
                <TSelect value={form.type ?? 'annuel'} onChange={f('type')}>
                  {TYPES.map(t => <option key={t.code} value={t.code}>{t.icon} {t.label}</option>)}
                </TSelect>
              </Field>
              <FormRow>
                <FormGroup label="Date début *"><TInput type="date" value={form.start_date ?? ''} onChange={f('start_date')} /></FormGroup>
                <FormGroup label="Date fin *"><TInput type="date" value={form.end_date ?? ''} onChange={f('end_date')} /></FormGroup>
              </FormRow>
              {form.start_date && form.end_date && (
                <div className="rounded-md border border-border bg-surface-sunk p-md text-body-sm text-fg-secondary">
                  Durée calculée : <strong className="text-fg-primary">{computeDays(form.start_date, form.end_date)} jour(s)</strong>
                </div>
              )}
              <Field label="Motif"><Textarea value={form.reason ?? ''} onChange={f('reason')} placeholder="Optionnel" /></Field>
              <ModalFooter onCancel={() => setModalOpen(false)} onSave={save} loading={saving} saveLabel="SOUMETTRE" />
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
