'use client'
import {useLanguage} from '@/lib/i18n'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Banknote, Plus, Settings2, CheckCircle2, FileText, Coins, Calculator } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {useAuth} from '@/lib/auth'
import {listClientWorkers,listClientWorkerFarms,listClientPayslips,type WorkerFarm} from '@/lib/workerScope'
import { computePayroll, fmtMAD, periodCode, periodBounds, type PayFrequency } from '@/lib/payroll'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Input as TInput, Select as TSelect, Field } from '@/components/ui/Input'
import { Modal, FormGroup, FormRow, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { DataTable, THead, TR, TH, TD } from '@/components/ui/DataTable'

type Period = { preparation_id?: string | null; id: string; code: string; period_year: number; period_month: number; period_half: string; start_date: string; end_date: string; pay_date: string; status: string }
type Worker = { id: string; farm_id:string; first_name: string; last_name: string; matricule: string | null; category: string; pay_frequency: string | null; base_salary: number | null; dependents: number | null; family_status: string | null; is_active: boolean }
type Payslip = { id: string; period_id: string; worker_id: string; gross_salary: number; net_salary: number; total_employer_cost: number; cnss_employee: number; amo_employee: number; ir_amount: number; status: string }

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

export default function PaiePage() {
  const {activeDomain}=useAuth()
  const {t}=useLanguage()
  return activeDomain?<ClientPayroll key={activeDomain.domain_id} domainId={activeDomain.domain_id}/>:<p role="status">{t('Sélectionnez un client')}</p>
}

function ClientPayroll({domainId}:{domainId:string}) {
 const {t:_ui,text:_uiNode,intlLocale:_uiLocale}=useLanguage()

  const [periods, setPeriods] = useState<Period[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [farms,setFarms]=useState<WorkerFarm[]>([])
  const [filterFarm,setFilterFarm]=useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, half: 'full' as 'full' | 'first' | 'second' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [p, clientWorkers, clientPayslips,clientFarms] = await Promise.all([
        supabase.from('payroll_periods').select('*').order('period_year', { ascending: false }).order('period_month', { ascending: false }),
        listClientWorkers(domainId),
        listClientPayslips(domainId),
        listClientWorkerFarms(domainId),
      ])
      if (p.error) throw p.error
      const visiblePeriods = (p.data ?? []).filter(item => !item.preparation_id || clientPayslips.some(slip => slip.period_id === item.id))
      setPeriods(visiblePeriods as Period[]);setWorkers(clientWorkers);setPayslips(clientPayslips);setFarms(clientFarms)
      setSelectedPeriod(current => visiblePeriods.some(item => item.id === current) ? current : visiblePeriods[0]?.id || '')
    } catch (e: any) { toast.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const period = periods.find(p => p.id === selectedPeriod)
  const scopedWorkers=useMemo(()=>workers.filter(worker=>!filterFarm||worker.farm_id===filterFarm),[workers,filterFarm])
  const periodPayslips = useMemo(()=>{
    const ids=new Set(scopedWorkers.map(worker=>worker.id))
    return payslips.filter(ps=>ps.period_id===selectedPeriod&&ids.has(ps.worker_id))
  },[payslips,selectedPeriod,scopedWorkers])
  const eligible = useMemo(() => {
    if (!period) return []
    return scopedWorkers.filter(w => {
      if(!w.is_active)return false
      if (period.period_half === 'full') return w.pay_frequency === 'mensuel'
      if (period.period_half === 'first' || period.period_half === 'second') return w.pay_frequency === 'quinzaine' || w.pay_frequency === 'journalier'
      return false
    })
  }, [scopedWorkers, period])

  const kpis = useMemo(() => ({
    totalGross: periodPayslips.reduce((s, x) => s + Number(x.gross_salary || 0), 0),
    totalNet: periodPayslips.reduce((s, x) => s + Number(x.net_salary || 0), 0),
    totalEmployer: periodPayslips.reduce((s, x) => s + Number(x.total_employer_cost || 0), 0),
    totalCotis: periodPayslips.reduce((s, x) => s + Number(x.cnss_employee || 0) + Number(x.amo_employee || 0) + Number(x.ir_amount || 0), 0),
  }), [periodPayslips])

  const createPeriod = async () => {
    setSaving(true)
    try {
      const code = periodCode(form.year, form.month, form.half)
      const bounds = periodBounds(form.year, form.month, form.half)
      const { error } = await supabase.from('payroll_periods').insert({
        code, period_year: form.year, period_month: form.month, period_half: form.half,
        start_date: bounds.start, end_date: bounds.end, pay_date: bounds.payDate, status: 'brouillon',
      })
      if (error) throw error
      setDone(true)
      toast.success(_ui("Période {v0} créée",{v0:String(code)}))
      setTimeout(() => { setModalOpen(false); setDone(false); load() }, 800)
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  const generatePayslips = async () => {
    if (!period||!eligible.length||period.preparation_id) return
    if (!confirm(_ui("Générer les bulletins pour {v0} employé(s) ?",{v0:String(eligible.length)}))) return
    try {
      const rows = eligible.map(w => {
        const r = computePayroll({
          baseSalaryMonthly: Number(w.base_salary) || 0,
          payFrequency: (w.pay_frequency as PayFrequency) ?? 'mensuel',
          dependents: Number(w.dependents) || 0,
          familyStatus: (w.family_status as any) ?? 'celibataire',
          daysWorked: w.pay_frequency === 'journalier' ? 26 : undefined,
        })
        return {
          period_id: period.id, worker_id: w.id,
          base_amount: r.base_amount, overtime_amount: r.overtime_amount, bonuses: r.bonuses,
          gross_salary: r.gross_salary, cnss_employee: r.cnss_employee, amo_employee: r.amo_employee,
          ir_amount: r.ir_amount, other_deductions: r.other_deductions, net_salary: r.net_salary,
          cnss_employer: r.cnss_employer, amo_employer: r.amo_employer,
          family_allowance_employer: r.family_allowance_employer, prof_training_employer: r.prof_training_employer,
          total_employer_cost: r.total_employer_cost, status: 'brouillon',
        }
      })
      const { error } = await supabase.from('payslips').upsert(rows, { onConflict: 'period_id,worker_id' })
      if (error) throw error
      toast.success(_ui("{v0} bulletin(s) généré(s)",{v0:String(rows.length)}))
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  const validatePeriod = async () => {
    if (!period || period.preparation_id) return
    if (!confirm(_ui("Valider la période ? Les bulletins seront figés et une écriture comptable générée."))) return
    try {
      const { error } = await supabase.from('payroll_periods').update({ status: 'valide', validated_at: new Date().toISOString() }).eq('id', period.id)
      if (error) throw error
      toast.success(_ui("Période validée"))
      load()
    } catch (e: any) { toast.error(_ui("Erreur :") + e.message) }
  }

  return (
    <div>
      <PageHeader
        title={_ui("Paie")} subtitle={_ui("Module RH standard")} icon={Banknote} iconColor="#10b981"
        description={_ui("Périodes mensuelles (staff) ou bimensuelles (fermiers : 1-15 et 16-fin)")}
        actions={<Button onClick={() => { setModalOpen(true); setDone(false) }} variant="primary"><Plus size={14} strokeWidth={2.5} /> {" "}{_ui("Nouvelle période")}</Button>}
      />

      {/* Sélecteur période + actions */}
      <Card animate delay={0.1} className="mb-md">
        <div className="flex flex-wrap gap-md items-center">
          <TSelect aria-label={_ui('Ferme')} value={filterFarm} onChange={event=>setFilterFarm(event.target.value)} className="h-9 w-auto min-w-[180px]">
            <option value="">{_ui('Toutes les fermes')}</option>
            {farms.map(farm=><option key={farm.id} value={farm.id}>{farm.code} · {farm.name}</option>)}
          </TSelect>
          <span className="text-body-sm text-fg-secondary font-semibold">{_ui("Période :")}</span>
          <TSelect value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} className="h-9 w-auto min-w-[320px] flex-1 max-w-md">
            {periods.length === 0 && <option value="">{_ui("Aucune période")}</option>}
            {periods.map(p => (
              <option key={p.id} value={p.id}>
                {p.code} — {MONTHS[p.period_month - 1]} {p.period_year} {p.period_half === 'first' ? '(1-15)' : p.period_half === 'second' ? _ui("(16-fin)") : _ui("(mois)")} · {p.status}
              </option>
            ))}
          </TSelect>
          {period && (
            <>
              {period.preparation_id && <Link className="text-green-800 underline" href={`/rh/paie/preparation?farm=${workers.find(worker => worker.id === periodPayslips[0]?.worker_id)?.farm_id || filterFarm}&year=${period.period_year}&month=${period.period_month}&half=${period.period_half}`}>{_ui("Ouvrir la préparation")}</Link>}
              <Button onClick={generatePayslips} disabled={loading||period.status !== 'brouillon'||!eligible.length||!!period.preparation_id} variant="secondary" size="sm">
                <Settings2 size={12} /> {" "}{_ui("Générer (")}{eligible.length})
              </Button>
              <Button onClick={validatePeriod} disabled={period.status !== 'brouillon' || periodPayslips.length === 0 || !!period.preparation_id} variant="primary" size="sm">
                <CheckCircle2 size={12} /> {" "}{_ui("Valider")}{" "}</Button>
            </>
          )}
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-md mb-md">
        {[
          { label: 'Bulletins', value: String(periodPayslips.length), color: '#0ea5e9', icon: FileText },
          { label: 'Total brut', value: fmtMAD(kpis.totalGross), color: '#3b82f6', icon: Banknote },
          { label: 'Cotisations + IR', value: fmtMAD(kpis.totalCotis), color: '#f59e0b', icon: Coins },
          { label: 'Coût employeur', value: fmtMAD(kpis.totalEmployer), color: '#10b981', icon: Calculator },
        ].map((k, i) => {
          const Icon = k.icon
          return (
            <Card key={i} animate delay={0.15 + i * 0.04} padding="md" className="border-l-[3px]" style={{ borderLeftColor: k.color } as any}>
              <div className="flex items-center gap-sm mb-1">
                <Icon size={14} strokeWidth={2.2} style={{ color: k.color }} />
                <span className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-semibold">{_uiNode(k.label)}</span>
              </div>
              <div className="font-display text-display-sm font-extrabold" style={{ color: k.color }}>{k.value}</div>
            </Card>
          )
        })}
      </div>

      {/* Tableau bulletins */}
      <Card animate delay={0.3} padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-md space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : periodPayslips.length === 0 ? (
          <EmptyState icon={Banknote} title={period ? _ui("Aucun bulletin") : _ui("Sélectionnez une période")} description={period ? _ui("Cliquer \"Générer\" pour créer les bulletins.") : ''} />
        ) : (
          <DataTable minWidth={1200}>
            <THead>
              <TR><TH>{_ui("Matricule")}</TH><TH>{_ui("Employé")}</TH><TH>{_ui('Ferme')}</TH><TH right>{_ui("Brut")}</TH><TH right>{_ui("CNSS sal.")}</TH><TH right>{_ui("AMO sal.")}</TH><TH right>{_ui("IR")}</TH><TH right>{_ui("Net à payer")}</TH><TH right>{_ui("CNSS pat.")}</TH><TH right>{_ui("Coût total")}</TH><TH>{_ui("Statut")}</TH></TR>
            </THead>
            <tbody>
              {periodPayslips.map((ps, i) => {
                const w = workers.find(x => x.id === ps.worker_id)
                return (
                  <TR key={ps.id} animate delay={0.04 + i * 0.02}>
                    <TD mono className="text-caption">{w?.matricule ?? '—'}</TD>
                    <TD className="font-display font-semibold text-fg-primary">{w ? `${w.last_name} ${w.first_name}` : '—'}</TD>
                    <TD>{farms.find(farm=>farm.id===w?.farm_id)?.name||'—'}</TD>
                    <TD right mono>{Math.round(ps.gross_salary).toLocaleString(_uiLocale)}</TD>
                    <TD right mono>{Math.round(ps.cnss_employee).toLocaleString(_uiLocale)}</TD>
                    <TD right mono>{Math.round(ps.amo_employee).toLocaleString(_uiLocale)}</TD>
                    <TD right mono>{Math.round(ps.ir_amount).toLocaleString(_uiLocale)}</TD>
                    <TD right mono className="text-success font-bold">{Math.round(ps.net_salary).toLocaleString(_uiLocale)}</TD>
                    <TD right mono className="text-fg-tertiary">{Math.round(Number((ps as any).cnss_employer || 0) + Number((ps as any).amo_employer || 0) + Number((ps as any).family_allowance_employer || 0) + Number((ps as any).prof_training_employer || 0)).toLocaleString(_uiLocale)}</TD>
                    <TD right mono className="text-warning font-semibold">{Math.round(ps.total_employer_cost).toLocaleString(_uiLocale)}</TD>
                    <TD><Badge variant={ps.status === 'paye' ? 'success' : 'default'} size="sm">{ps.status}</Badge></TD>
                  </TR>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </Card>

      {modalOpen && (
        <Modal title={_ui("Créer une période de paie")} onClose={() => setModalOpen(false)}>
          {done ? <SuccessMessage message={_ui("Période créée")} /> : (
            <div className="space-y-md">
              <FormRow>
                <FormGroup label={_ui("Année")}><TInput type="number" value={String(form.year)} onChange={(e) => setForm(s => ({ ...s, year: Number(e.target.value) }))} /></FormGroup>
                <FormGroup label={_ui("Mois")}>
                  <TSelect value={form.month} onChange={(e) => setForm(s => ({ ...s, month: Number(e.target.value) }))}>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </TSelect>
                </FormGroup>
              </FormRow>
              <Field label={_ui("Type de période")}>
                <TSelect value={form.half} onChange={(e) => setForm(s => ({ ...s, half: e.target.value as any }))}>
                  <option value="full">{_ui("Mensuel (staff admin) — paie en fin de mois")}</option>
                  <option value="first">{_ui("Quinzaine 1 (1-15) — paie le 15 (fermiers)")}</option>
                  <option value="second">{_ui("Quinzaine 2 (16-fin) — paie en fin de mois (fermiers)")}</option>
                </TSelect>
              </Field>
              <ModalFooter onCancel={() => setModalOpen(false)} onSave={createPeriod} loading={saving} saveLabel={_ui("CRÉER")} />
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
