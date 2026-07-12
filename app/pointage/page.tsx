'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Clock, Plus, Trash2, Users, User, AlertCircle, Timer, Coins } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useReferenceList } from '@/lib/useReferenceList'
import { listLaborEntries, createLaborEntry, deleteLaborEntry } from '@/lib/labor'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonKPI } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect } from '@/components/ui/Input'
import { KPICard } from '@/components/ui/KPICard'
import { Modal, FormGroup, FormRow, ModalFooter } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'
import { MoneyDisplay, DateDisplay } from '@/components/display'

type Campaign = { id: string; code: string; name: string; farm_id: string | null }
const todayISO = () => new Date().toISOString().slice(0, 10)
const emptyForm = () => ({
  work_date: todayISO(), greenhouse_id: '', campaign_planting_id: '', operation_type: '',
  mode: 'equipe' as 'ouvrier' | 'equipe', worker_id: '', worker_count: '1',
  hours_worked: '', daily_rate: '', notes: '',
})

export default function PointagePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [greenhouses, setGreenhouses] = useState<any[]>([])
  const [plantings, setPlantings] = useState<any[]>([])
  const [workers, setWorkers] = useState<any[]>([])
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const { values: TASKS, defaultCode: defaultTask } = useReferenceList('labor_task')
  const upd = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    ;(async () => {
      const [c, w] = await Promise.all([
        supabase.from('campaigns').select('id, code, name, farm_id').order('planting_start', { ascending: false }),
        supabase.from('workers').select('id, first_name, last_name, matricule').eq('is_active', true).order('last_name'),
      ])
      setCampaigns(c.data ?? []); setWorkers(w.data ?? [])
      if (c.data && c.data.length > 0) setCampaignId(prev => prev || c.data![0].id)
    })()
  }, [])

  const campaign = useMemo(() => campaigns.find(c => c.id === campaignId), [campaigns, campaignId])

  useEffect(() => {
    if (!campaignId) return
    setLoading(true)
    ;(async () => {
      try {
        const [g, p, e] = await Promise.all([
          campaign?.farm_id
            ? supabase.from('greenhouses').select('id, code, name, farm_id').eq('farm_id', campaign.farm_id).order('code')
            : supabase.from('greenhouses').select('id, code, name, farm_id').order('code'),
          supabase.from('campaign_plantings').select('id, greenhouse_id, varieties(commercial_name)').eq('campaign_id', campaignId),
          listLaborEntries({ campaignId }),
        ])
        setGreenhouses(g.data ?? []); setPlantings(p.data ?? []); setEntries(e)
      } catch (err: any) { toast.error('Erreur : ' + err.message) }
      finally { setLoading(false) }
    })()
  }, [campaignId, campaign?.farm_id])

  const openModal = () => { setForm({ ...emptyForm(), operation_type: defaultTask || '' }); setModal(true) }
  const plantingsForGh = useMemo(() =>
    form.greenhouse_id ? plantings.filter(p => p.greenhouse_id === form.greenhouse_id) : [],
    [plantings, form.greenhouse_id])

  const hpp = Number(form.hours_worked) || 0
  const count = form.mode === 'ouvrier' ? 1 : (Number(form.worker_count) || 0)
  const personHours = hpp * count
  const rate = Number(form.daily_rate) || 0
  const cost = (personHours / 8) * rate

  const save = async () => {
    if (!form.work_date || !form.operation_type || !hpp) { toast.error('Date, tâche et heures sont requis'); return }
    if (form.mode === 'ouvrier' && !form.worker_id) { toast.error('Sélectionne un ouvrier'); return }
    if (form.mode === 'equipe' && count < 1) { toast.error('Nombre d\'ouvriers invalide'); return }
    setSaving(true)
    try {
      const row = await createLaborEntry({
        work_date: form.work_date, campaign_id: campaignId,
        greenhouse_id: form.greenhouse_id || null,
        campaign_planting_id: form.campaign_planting_id || null,
        worker_id: form.mode === 'ouvrier' ? form.worker_id : null,
        worker_count: form.mode === 'ouvrier' ? 1 : count,
        operation_type: form.operation_type,
        hours_worked: hpp,
        daily_rate: form.daily_rate ? rate : null,
        notes: form.notes || null,
      })
      setEntries(prev => [row, ...prev])
      toast.success('Pointage enregistré')
      setModal(false)
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
    finally { setSaving(false) }
  }

  const onDelete = async (id: string) => {
    if (!confirm('Supprimer ce pointage ?')) return
    try { await deleteLaborEntry(id); setEntries(prev => prev.filter(x => x.id !== id)); toast.success('Supprimé') }
    catch (e: any) { toast.error('Erreur : ' + e.message) }
  }

  const totals = useMemo(() => {
    let ph = 0, cost = 0
    for (const e of entries) { ph += Number(e.person_hours) || 0; cost += Number(e.total_cost) || 0 }
    return { ph, cost, count: entries.length }
  }, [entries])
  const taskLabel = (code: string) => TASKS.find(t => t.code === code)?.label ?? code

  return (
    <div>
      <PageHeader
        title="Pointage" subtitle="Production" icon={Clock} iconColor="#0ea5e9"
        description="Heures de travail par serre, culture et tâche — base de la productivité MO réelle"
        actions={
          <div className="flex items-center gap-2">
            <TSelect value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="h-9 w-auto min-w-[220px]">
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </TSelect>
            <Button onClick={openModal} variant="primary"><Plus size={14} strokeWidth={2.5} /> Pointer</Button>
          </div>
        }
      />

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-md mb-md">{Array.from({ length: 3 }).map((_, i) => <SkeletonKPI key={i} />)}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-md mb-md">
          <KPICard label="Heures-personnes" value={<span className="font-display text-display-sm">{totals.ph.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</span>} sub={`${totals.count} pointage(s)`} icon={Timer} accent="#0ea5e9" variant="hero" delay={0} />
          <KPICard label="Coût MO pointé" value={<MoneyDisplay value={totals.cost} compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="selon taux journalier saisi" icon={Coins} accent="#f59e0b" variant="hero" delay={0.05} />
          <KPICard label="Coût moyen /h" value={<span className="font-display text-display-sm">{totals.ph > 0 ? (totals.cost / totals.ph).toFixed(1) : '—'}</span>} sub="MAD par heure-personne" icon={Users} accent="#8b5cf6" variant="hero" delay={0.1} />
        </div>
      )}

      <Card padding="none" className="overflow-hidden">
        <div className="px-md py-sm border-b border-border font-display text-heading-sm font-bold text-fg-primary">Pointages — {entries.length}</div>
        {entries.length === 0 ? (
          <EmptyState icon={Clock} title="Aucun pointage sur cette campagne" description="Clique « Pointer » pour saisir des heures de travail." />
        ) : (
          <div className="overflow-x-auto">
            <DataTable>
              <THead><TR><TH>Date</TH><TH>Serre</TH><TH>Culture</TH><TH>Tâche</TH><TH>Qui</TH><TH right>h/pers</TH><TH right>h-pers</TH><TH right>Coût</TH><TH></TH></TR></THead>
              <tbody>
                {entries.map((e, i) => (
                  <TR key={e.id} animate delay={Math.min(0.3, i * 0.015)}>
                    <TD mono><DateDisplay value={e.work_date} /></TD>
                    <TD>{e.greenhouses?.code ?? '—'}</TD>
                    <TD className="text-fg-secondary">{e.campaign_plantings?.varieties?.commercial_name ?? '—'}</TD>
                    <TD><Badge variant="default" size="xs">{taskLabel(e.operation_type)}</Badge></TD>
                    <TD>{e.workers ? <span className="inline-flex items-center gap-1"><User size={12} />{e.workers.last_name} {e.workers.first_name}</span> : <span className="inline-flex items-center gap-1 text-fg-secondary"><Users size={12} />{e.worker_count} ouvriers</span>}</TD>
                    <TD right mono>{Number(e.hours_worked).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</TD>
                    <TD right mono className="font-bold">{Number(e.person_hours).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</TD>
                    <TD right mono>{e.total_cost ? <MoneyDisplay value={e.total_cost} compact="auto" /> : <span className="opacity-40">—</span>}</TD>
                    <TD><button onClick={() => onDelete(e.id)} className="text-fg-tertiary hover:text-danger transition-colors" title="Supprimer"><Trash2 size={14} /></button></TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </Card>

      {modal && (
        <Modal title="NOUVEAU POINTAGE" onClose={() => setModal(false)} size="lg">
          <FormRow>
            <FormGroup label="Date *"><TInput type="date" value={form.work_date} onChange={upd('work_date')} /></FormGroup>
            <FormGroup label="Tâche *">
              <TSelect value={form.operation_type} onChange={upd('operation_type')}>
                <option value="">— Sélectionner —</option>
                {TASKS.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
              </TSelect>
            </FormGroup>
          </FormRow>
          <FormRow>
            <FormGroup label="Serre">
              <TSelect value={form.greenhouse_id} onChange={(e) => setForm(f => ({ ...f, greenhouse_id: e.target.value, campaign_planting_id: '' }))}>
                <option value="">— Toute la campagne —</option>
                {greenhouses.map(g => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
              </TSelect>
            </FormGroup>
            <FormGroup label="Culture (optionnel)">
              <TSelect value={form.campaign_planting_id} onChange={upd('campaign_planting_id')} disabled={!form.greenhouse_id}>
                <option value="">— Toutes —</option>
                {plantingsForGh.map(p => <option key={p.id} value={p.id}>{p.varieties?.commercial_name ?? '—'}</option>)}
              </TSelect>
            </FormGroup>
          </FormRow>

          <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mt-md mb-1">Main-d'œuvre</div>
          <div className="flex gap-2 mb-sm">
            <button type="button" onClick={() => setForm(f => ({ ...f, mode: 'equipe' }))} className={`flex-1 rounded-md border px-md py-2 text-body-sm inline-flex items-center justify-center gap-2 transition-colors ${form.mode === 'equipe' ? 'border-brand bg-brand/10 text-brand font-semibold' : 'border-border text-fg-secondary'}`}><Users size={14} /> Équipe</button>
            <button type="button" onClick={() => setForm(f => ({ ...f, mode: 'ouvrier' }))} className={`flex-1 rounded-md border px-md py-2 text-body-sm inline-flex items-center justify-center gap-2 transition-colors ${form.mode === 'ouvrier' ? 'border-brand bg-brand/10 text-brand font-semibold' : 'border-border text-fg-secondary'}`}><User size={14} /> Ouvrier nommé</button>
          </div>
          <FormRow>
            {form.mode === 'ouvrier' ? (
              <FormGroup label="Ouvrier *">
                <TSelect value={form.worker_id} onChange={upd('worker_id')}>
                  <option value="">— Sélectionner —</option>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.last_name} {w.first_name} {w.matricule ? `(${w.matricule})` : ''}</option>)}
                </TSelect>
              </FormGroup>
            ) : (
              <FormGroup label="Nombre d'ouvriers *"><TInput type="number" min={1 as any} value={form.worker_count} onChange={upd('worker_count')} placeholder="5" /></FormGroup>
            )}
            <FormGroup label="Heures par personne *"><TInput type="number" step="0.5" value={form.hours_worked} onChange={upd('hours_worked')} placeholder="6" /></FormGroup>
          </FormRow>
          <FormRow>
            <FormGroup label="Taux journalier (MAD, optionnel)"><TInput type="number" value={form.daily_rate} onChange={upd('daily_rate')} placeholder="ex: 100 (base 8h)" /></FormGroup>
            <FormGroup label="Notes"><TInput value={form.notes} onChange={upd('notes')} placeholder="Optionnel" /></FormGroup>
          </FormRow>

          {hpp > 0 && (
            <div className="rounded-md border border-brand/30 bg-brand/5 p-md text-body-sm text-brand mt-sm">
              → <strong>{personHours.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} heures-personnes</strong>
              {rate > 0 && <> · coût ≈ <strong>{cost.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} MAD</strong></>}
            </div>
          )}

          <ModalFooter onCancel={() => setModal(false)} onSave={save} loading={saving} saveLabel="ENREGISTRER" />
        </Modal>
      )}
    </div>
  )
}
