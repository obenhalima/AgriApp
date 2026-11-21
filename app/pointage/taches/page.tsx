'use client'
import {useLanguage, TranslatedText} from '@/lib/i18n'

import '@/components/ui/workspace.css'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Clock, Plus, Trash2, Users, User, AlertCircle, Timer, Coins } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {useAuth} from '@/lib/auth'
import {listClientWorkers} from '@/lib/workerScope'
import { useReferenceList } from '@/lib/useReferenceList'
import { listLaborEntries, createLaborEntry, deleteLaborEntry, unitLabel } from '@/lib/labor'
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
  hours_worked: '', daily_rate: '', quantity_done: '', notes: '',
})

export default function TaskAttendancePage() {
  const {activeDomain} = useAuth()
  const {t} = useLanguage()
  return activeDomain ? <PointagePage key={activeDomain.domain_id} domainId={activeDomain.domain_id}/> : <p>{t('Sélectionnez un client')}</p>
}

function PointagePage({domainId}: {domainId: string}) {
 const {t:_ui,text:_uiNode,intlLocale:_uiLocale}=useLanguage()

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
    let cancelled = false
    async function load() {
      const [result, clientWorkers] = await Promise.all([
        supabase.from('campaigns').select('id,code,name,farm_id,farms!inner(domain_id)').eq('farms.domain_id', domainId).order('planting_start', {ascending: false}),
        listClientWorkers(domainId),
      ])
      if (result.error) throw result.error
      if (cancelled) return
      setCampaigns(result.data || []); setWorkers(clientWorkers.filter(worker => worker.is_active))
      setCampaignId(result.data?.[0]?.id || '')
      if (!result.data?.length) setLoading(false)
    }
    load().catch(error => {if (!cancelled) {toast.error(error.message); setLoading(false)}})
    return () => {cancelled = true}
  }, [domainId])

  const campaign = useMemo(() => campaigns.find(item => item.id === campaignId), [campaigns, campaignId])
  const farmWorkers = useMemo(() => workers.filter(worker => worker.farm_id === campaign?.farm_id), [workers, campaign?.farm_id])
  useEffect(() => {
    let cancelled = false
    if (!campaignId || !campaign?.farm_id) {setEntries([]); setGreenhouses([]); setPlantings([]); setLoading(false); return}
    const farmId = campaign.farm_id
    setLoading(true); setForm(emptyForm())
    async function load() {
      const [g, p, e] = await Promise.all([
        supabase.from('greenhouses').select('id,code,name,farm_id').eq('farm_id', farmId).order('code'),
        supabase.from('campaign_plantings').select('id,greenhouse_id,varieties!campaign_plantings_variety_id_fkey(commercial_name)').eq('campaign_id', campaignId),
        listLaborEntries({campaignId}),
      ])
      if (g.error) throw g.error
      if (p.error) throw p.error
      if (!cancelled) {setGreenhouses(g.data || []); setPlantings(p.data || []); setEntries(e)}
    }
    load().catch(error => {if (!cancelled) toast.error(error.message)}).finally(() => {if (!cancelled) setLoading(false)})
    return () => {cancelled = true}
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

  // Unité de rendement de la tâche choisie (référentiel labor_task, no-code).
  // Pour la cueillette (is_harvest), les kg viennent des récoltes → pas de saisie.
  const selectedTask = useMemo(() => TASKS.find(t => t.code === form.operation_type) as any, [TASKS, form.operation_type])
  const taskUnit: string | null = selectedTask?.metadata?.unit ?? null
  const isHarvestTask = !!selectedTask?.metadata?.is_harvest
  const askQuantity = !!taskUnit && !isHarvestTask
  const qty = Number(form.quantity_done) || 0
  const rendement = personHours > 0 && qty > 0 ? qty / personHours : null

  const save = async () => {
    if (!campaign?.farm_id) {toast.error(_ui('Sélectionnez une campagne')); return}
    if (form.mode === 'ouvrier' && !farmWorkers.some(worker => worker.id === form.worker_id)) {toast.error(_ui('Sélectionnez un employé de cette ferme')); return}
    if (!form.work_date || !form.operation_type || !hpp) { toast.error(_ui("Date, tâche et heures sont requis")); return }
    if (form.mode === 'ouvrier' && !form.worker_id) { toast.error(_ui("Sélectionne un ouvrier")); return }
    if (form.mode === 'equipe' && count < 1) { toast.error(_ui("Nombre d'ouvriers invalide")); return }
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
        quantity_done: askQuantity && qty > 0 ? qty : null,
        quantity_unit: askQuantity && qty > 0 ? taskUnit : null,
        notes: form.notes || null,
      })
      setEntries(prev => [row, ...prev])
      toast.success(_ui("Pointage enregistré"))
      setModal(false)
    } catch (e: any) { toast.error(_ui("Erreur :") + e.message) }
    finally { setSaving(false) }
  }

  const onDelete = async (id: string) => {
    if (!confirm(_ui("Supprimer ce pointage ?"))) return
    try { await deleteLaborEntry(id); setEntries(prev => prev.filter(x => x.id !== id)); toast.success(_ui("Supprimé")) }
    catch (e: any) { toast.error(_ui("Erreur :") + e.message) }
  }

  const totals = useMemo(() => {
    let ph = 0, cost = 0
    for (const e of entries) { ph += Number(e.person_hours) || 0; cost += Number(e.total_cost) || 0 }
    return { ph, cost, count: entries.length }
  }, [entries])
  const taskLabel = (code: string) => TASKS.find(t => t.code === code)?.label ?? code
  const plantingVariety = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of plantings) if (p.varieties?.commercial_name) m.set(p.id, p.varieties.commercial_name)
    return m
  }, [plantings])

  return (
    <div className="itrix-workspace">
      <Link href="/pointage/recolte" className="inline-block mb-4 rounded-lg border border-brand/30 bg-brand/10 px-4 py-3 text-brand font-semibold">{_ui("Récolte : productivité par personne et objectifs →")}</Link>
      <PageHeader
        title={_ui("Pointage")} subtitle={_ui("Module RH standard")} icon={Clock} iconColor="#0ea5e9"
        description={_ui("Heures de travail par serre, culture et tâche — base de la productivité MO réelle")}
        actions={
          <div className="itrix-actions">
            <TSelect aria-label={_ui("Campagne du pointage")} value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="h-9 w-auto min-w-0 max-w-full">
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </TSelect>
            <Button onClick={openModal} disabled={!campaign?.farm_id || loading} variant="primary"><Plus size={14} strokeWidth={2.5} /> {" "}{_ui("Pointer")}</Button>
          </div>
        }
      />

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-md mb-md">{Array.from({ length: 3 }).map((_, i) => <SkeletonKPI key={i} />)}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-md mb-md">
          <KPICard label={_ui("Heures-personnes")} value={<span className="font-display text-display-sm">{totals.ph.toLocaleString(_uiLocale, { maximumFractionDigits: 0 })}</span>} sub={`${totals.count} pointage(s)`} icon={Timer} accent="#0ea5e9" variant="hero" delay={0} />
          <KPICard label={_ui("Coût MO pointé")} value={<MoneyDisplay value={totals.cost} compact="auto" showCurrency={false} className="!text-current font-display !text-display-sm" />} sub="selon taux journalier saisi" icon={Coins} accent="#f59e0b" variant="hero" delay={0.05} />
          <KPICard label={_ui("Coût moyen /h")} value={<span className="font-display text-display-sm">{totals.ph > 0 ? (totals.cost / totals.ph).toFixed(1) : '—'}</span>} sub="MAD par heure-personne" icon={Users} accent="#8b5cf6" variant="hero" delay={0.1} />
        </div>
      )}

      <Card padding="none" className="itrix-table">
        <div className="px-md py-sm border-b border-border font-display text-heading-sm font-bold text-fg-primary">{_ui("Pointages —")}{" "}{entries.length}</div>
        {entries.length === 0 ? (
          <EmptyState icon={Clock} title={_ui("Aucun pointage sur cette campagne")} description={_ui("Clique « Pointer » pour saisir des heures de travail.")} />
        ) : (
          <div className="overflow-x-auto">
            <DataTable>
              <THead><TR><TH>{_ui("Date")}</TH><TH>{_ui("Serre")}</TH><TH>{_ui("Culture")}</TH><TH>{_ui("Tâche")}</TH><TH>{_ui("Qui")}</TH><TH right>{_ui("h/pers")}</TH><TH right>{_ui("h-pers")}</TH><TH right>{_ui("Fait")}</TH><TH right>{_ui("Rendement")}</TH><TH right>{_ui("Coût")}</TH><TH></TH></TR></THead>
              <tbody>
                {entries.map((e, i) => (
                  <TR key={e.id} animate delay={Math.min(0.3, i * 0.015)}>
                    <TD mono><DateDisplay value={e.work_date} /></TD>
                    <TD>{e.greenhouses?.code ?? '—'}</TD>
                    <TD className="text-fg-secondary">{plantingVariety.get(e.campaign_planting_id) ?? '—'}</TD>
                    <TD><Badge variant="default" size="xs">{taskLabel(e.operation_type)}</Badge></TD>
                    <TD>{e.workers ? <span className="inline-flex items-center gap-1"><User size={12} />{e.workers.last_name} {e.workers.first_name}</span> : <span className="inline-flex items-center gap-1 text-fg-secondary"><Users size={12} />{e.worker_count} {" "}{_ui("ouvriers")}</span>}</TD>
                    <TD right mono>{Number(e.hours_worked).toLocaleString(_uiLocale, { maximumFractionDigits: 1 })}</TD>
                    <TD right mono className="font-bold">{Number(e.person_hours).toLocaleString(_uiLocale, { maximumFractionDigits: 1 })}</TD>
                    <TD right mono>{e.quantity_done ? `${Number(e.quantity_done).toLocaleString(_uiLocale, { maximumFractionDigits: 0 })} ${unitLabel(e.quantity_unit)}` : <span className="opacity-40">—</span>}</TD>
                    <TD right mono className="font-bold text-brand">{e.quantity_done && Number(e.person_hours) > 0 ? `${(Number(e.quantity_done) / Number(e.person_hours)).toLocaleString(_uiLocale, { maximumFractionDigits: 1 })} ${unitLabel(e.quantity_unit)}/h` : <span className="opacity-40 font-normal text-fg-primary">—</span>}</TD>
                    <TD right mono>{e.total_cost ? <MoneyDisplay value={e.total_cost} compact="auto" /> : <span className="opacity-40">—</span>}</TD>
                    <TD><button onClick={() => onDelete(e.id)} className="text-fg-tertiary hover:text-danger transition-colors" title={_ui("Supprimer")}><Trash2 size={14} /></button></TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </Card>

      {modal && (
        <Modal title={_ui("NOUVEAU POINTAGE")} onClose={() => setModal(false)} size="lg">
          <FormRow>
            <FormGroup label={_ui("Date *")}><TInput type="date" value={form.work_date} onChange={upd('work_date')} /></FormGroup>
            <FormGroup label={_ui("Tâche *")}>
              <TSelect value={form.operation_type} onChange={upd('operation_type')}>
                <option value="">{_ui("— Sélectionner —")}</option>
                {TASKS.map(t => <option key={t.code} value={t.code}>{_uiNode(t.label)}</option>)}
              </TSelect>
            </FormGroup>
          </FormRow>
          <FormRow>
            <FormGroup label={_ui("Serre")}>
              <TSelect value={form.greenhouse_id} onChange={(e) => setForm(f => ({ ...f, greenhouse_id: e.target.value, campaign_planting_id: '' }))}>
                <option value="">{_ui("— Toute la campagne —")}</option>
                {greenhouses.map(g => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
              </TSelect>
            </FormGroup>
            <FormGroup label={_ui("Culture (optionnel)")}>
              <TSelect value={form.campaign_planting_id} onChange={upd('campaign_planting_id')} disabled={!form.greenhouse_id}>
                <option value="">{_ui("— Toutes —")}</option>
                {plantingsForGh.map(p => <option key={p.id} value={p.id}>{p.varieties?.commercial_name ?? '—'}</option>)}
              </TSelect>
            </FormGroup>
          </FormRow>

          <div className="font-mono text-caption uppercase tracking-wider text-fg-tertiary mt-md mb-1">{_ui("Main-d'œuvre")}</div>
          <div className="flex gap-2 mb-sm">
            <button type="button" onClick={() => setForm(f => ({ ...f, mode: 'equipe' }))} className={`flex-1 rounded-md border px-md py-2 text-body-sm inline-flex items-center justify-center gap-2 transition-colors ${form.mode === 'equipe' ? 'border-brand bg-brand/10 text-brand font-semibold' : 'border-border text-fg-secondary'}`}><Users size={14} /> {" "}{_ui("Équipe")}</button>
            <button type="button" onClick={() => setForm(f => ({ ...f, mode: 'ouvrier' }))} className={`flex-1 rounded-md border px-md py-2 text-body-sm inline-flex items-center justify-center gap-2 transition-colors ${form.mode === 'ouvrier' ? 'border-brand bg-brand/10 text-brand font-semibold' : 'border-border text-fg-secondary'}`}><User size={14} /> {" "}{_ui("Ouvrier nommé")}</button>
          </div>
          <FormRow>
            {form.mode === 'ouvrier' ? (
              <FormGroup label={_ui("Ouvrier *")}>
                <TSelect value={form.worker_id} onChange={upd('worker_id')}>
                  <option value="">{_ui("— Sélectionner —")}</option>
                  {farmWorkers.map(w => <option key={w.id} value={w.id}>{w.last_name} {w.first_name}</option>)}
                </TSelect>
              </FormGroup>
            ) : (
              <FormGroup label={_ui("Nombre d'ouvriers *")}><TInput type="number" min={1 as any} value={form.worker_count} onChange={upd('worker_count')} placeholder="5" /></FormGroup>
            )}
            <FormGroup label={_ui("Heures par personne *")}><TInput type="number" step="0.5" value={form.hours_worked} onChange={upd('hours_worked')} placeholder="6" /></FormGroup>
          </FormRow>
          <FormRow>
            {askQuantity && (
              <FormGroup label={_ui("Travail réalisé ({v0})",{v0:String(unitLabel(taskUnit))})}>
                <TInput type="number" value={form.quantity_done} onChange={upd('quantity_done')} placeholder={taskUnit === 'ml' ? _ui("ex: 400 mètres faits") : _ui("ex: 1200")} />
                <div className="mt-1 font-mono text-caption text-fg-tertiary">{_ui("Sert à calculer le rendement (")}{unitLabel(taskUnit)}<TranslatedText text={"/h) et son évolution."}/></div>
              </FormGroup>
            )}
            <FormGroup label={_ui("Taux journalier (MAD, optionnel)")}><TInput type="number" value={form.daily_rate} onChange={upd('daily_rate')} placeholder={_ui("ex: 100 (base 8h)")} /></FormGroup>
          </FormRow>
          <FormGroup label={_ui("Notes")}><TInput value={form.notes} onChange={upd('notes')} placeholder={_ui("Optionnel")} /></FormGroup>

          {isHarvestTask && (
            <div className="rounded-md border border-info/30 bg-info/5 p-md text-body-sm text-fg-secondary mt-sm">
              {" "}{_ui("ℹ️ Pour la cueillette, les kg proviennent automatiquement des")}{" "}<b>{_ui("récoltes")}</b> {" "}{_ui("— pas besoin de les ressaisir.")}{" "}</div>
          )}

          {hpp > 0 && (
            <div className="rounded-md border border-brand/30 bg-brand/5 p-md text-body-sm text-brand mt-sm">
              → <strong>{personHours.toLocaleString(_uiLocale, { maximumFractionDigits: 1 })} {" "}{_ui("heures-personnes")}</strong>
              {rate > 0 && <> {" "}{_ui("· coût ≈")}{" "}<strong>{cost.toLocaleString(_uiLocale, { maximumFractionDigits: 0 })} MAD</strong></>}
              {rendement != null && <> {" "}{_ui("· rendement ≈")}{" "}<strong>{rendement.toLocaleString(_uiLocale, { maximumFractionDigits: 1 })} {unitLabel(taskUnit)}/h</strong></>}
            </div>
          )}

          <ModalFooter onCancel={() => setModal(false)} onSave={save} loading={saving} saveLabel={_ui("ENREGISTRER")} />
        </Modal>
      )}
    </div>
  )
}
