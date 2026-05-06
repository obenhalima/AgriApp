'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Banknote, Plus, Settings2, CheckCircle2, FileText, Coins, Calculator } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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

type Period = { id: string; code: string; period_year: number; period_month: number; period_half: string; start_date: string; end_date: string; pay_date: string; status: string }
type Worker = { id: string; first_name: string; last_name: string; matricule: string | null; category: string; pay_frequency: string | null; base_salary: number | null; dependents: number | null; family_status: string | null; is_active: boolean }
type Payslip = { id: string; period_id: string; worker_id: string; gross_salary: number; net_salary: number; total_employer_cost: number; cnss_employee: number; amo_employee: number; ir_amount: number; status: string }

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

export default function PaiePage() {
  const [periods, setPeriods] = useState<Period[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, half: 'full' as 'full' | 'first' | 'second' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [p, w, ps] = await Promise.all([
        supabase.from('payroll_periods').select('*').order('period_year', { ascending: false }).order('period_month', { ascending: false }),
        supabase.from('workers').select('id, first_name, last_name, matricule, category, pay_frequency, base_salary, dependents, family_status, is_active').eq('is_active', true).order('last_name'),
        supabase.from('payslips').select('*'),
      ])
      if (p.error) throw p.error
      setPeriods((p.data ?? []) as any); setWorkers((w.data ?? []) as any); setPayslips((ps.data ?? []) as any)
      if (!selectedPeriod && p.data && p.data.length > 0) setSelectedPeriod(p.data[0].id)
    } catch (e: any) { toast.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const period = periods.find(p => p.id === selectedPeriod)
  const periodPayslips = payslips.filter(ps => ps.period_id === selectedPeriod)
  const eligible = useMemo(() => {
    if (!period) return []
    return workers.filter(w => {
      if (period.period_half === 'full') return w.pay_frequency === 'mensuel'
      if (period.period_half === 'first' || period.period_half === 'second') return w.pay_frequency === 'quinzaine' || w.pay_frequency === 'journalier'
      return false
    })
  }, [workers, period])

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
      toast.success(`Période ${code} créée`)
      setTimeout(() => { setModalOpen(false); setDone(false); load() }, 800)
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  const generatePayslips = async () => {
    if (!period) return
    if (!confirm(`Générer les bulletins pour ${eligible.length} employé(s) ?`)) return
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
      toast.success(`${rows.length} bulletin(s) généré(s)`)
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  const validatePeriod = async () => {
    if (!period) return
    if (!confirm('Valider la période ? Les bulletins seront figés et une écriture comptable générée.')) return
    try {
      const { error } = await supabase.from('payroll_periods').update({ status: 'valide', validated_at: new Date().toISOString() }).eq('id', period.id)
      if (error) throw error
      toast.success('Période validée')
      load()
    } catch (e: any) { toast.error('Erreur : ' + e.message) }
  }

  return (
    <div>
      <PageHeader
        title="Paie" subtitle="Ressources humaines" icon={Banknote} iconColor="#10b981"
        description="Périodes mensuelles (staff) ou bimensuelles (fermiers : 1-15 et 16-fin)"
        actions={<Button onClick={() => { setModalOpen(true); setDone(false) }} variant="primary"><Plus size={14} strokeWidth={2.5} /> Nouvelle période</Button>}
      />

      {/* Sélecteur période + actions */}
      <Card animate delay={0.1} className="mb-md">
        <div className="flex flex-wrap gap-md items-center">
          <span className="text-body-sm text-fg-secondary font-semibold">Période :</span>
          <TSelect value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} className="h-9 w-auto min-w-[320px] flex-1 max-w-md">
            {periods.length === 0 && <option value="">Aucune période</option>}
            {periods.map(p => (
              <option key={p.id} value={p.id}>
                {p.code} — {MONTHS[p.period_month - 1]} {p.period_year} {p.period_half === 'first' ? '(1-15)' : p.period_half === 'second' ? '(16-fin)' : '(mois)'} · {p.status}
              </option>
            ))}
          </TSelect>
          {period && (
            <>
              <Button onClick={generatePayslips} disabled={period.status !== 'brouillon'} variant="secondary" size="sm">
                <Settings2 size={12} /> Générer ({eligible.length})
              </Button>
              <Button onClick={validatePeriod} disabled={period.status !== 'brouillon' || periodPayslips.length === 0} variant="primary" size="sm">
                <CheckCircle2 size={12} /> Valider
              </Button>
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
                <span className="font-mono text-[10px] uppercase tracking-wider text-fg-tertiary font-semibold">{k.label}</span>
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
          <EmptyState icon={Banknote} title={period ? 'Aucun bulletin' : 'Sélectionnez une période'} description={period ? 'Cliquer "Générer" pour créer les bulletins.' : ''} />
        ) : (
          <DataTable minWidth={1200}>
            <THead>
              <TR><TH>Matricule</TH><TH>Employé</TH><TH right>Brut</TH><TH right>CNSS sal.</TH><TH right>AMO sal.</TH><TH right>IR</TH><TH right>Net à payer</TH><TH right>CNSS pat.</TH><TH right>Coût total</TH><TH>Statut</TH></TR>
            </THead>
            <tbody>
              {periodPayslips.map((ps, i) => {
                const w = workers.find(x => x.id === ps.worker_id)
                return (
                  <TR key={ps.id} animate delay={0.04 + i * 0.02}>
                    <TD mono className="text-caption">{w?.matricule ?? '—'}</TD>
                    <TD className="font-display font-semibold text-fg-primary">{w ? `${w.last_name} ${w.first_name}` : '—'}</TD>
                    <TD right mono>{Math.round(ps.gross_salary).toLocaleString('fr-FR')}</TD>
                    <TD right mono>{Math.round(ps.cnss_employee).toLocaleString('fr-FR')}</TD>
                    <TD right mono>{Math.round(ps.amo_employee).toLocaleString('fr-FR')}</TD>
                    <TD right mono>{Math.round(ps.ir_amount).toLocaleString('fr-FR')}</TD>
                    <TD right mono className="text-success font-bold">{Math.round(ps.net_salary).toLocaleString('fr-FR')}</TD>
                    <TD right mono className="text-fg-tertiary">{Math.round(Number((ps as any).cnss_employer || 0) + Number((ps as any).amo_employer || 0) + Number((ps as any).family_allowance_employer || 0) + Number((ps as any).prof_training_employer || 0)).toLocaleString('fr-FR')}</TD>
                    <TD right mono className="text-warning font-semibold">{Math.round(ps.total_employer_cost).toLocaleString('fr-FR')}</TD>
                    <TD><Badge variant={ps.status === 'paye' ? 'success' : 'default'} size="sm">{ps.status}</Badge></TD>
                  </TR>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </Card>

      {modalOpen && (
        <Modal title="Créer une période de paie" onClose={() => setModalOpen(false)}>
          {done ? <SuccessMessage message="Période créée" /> : (
            <div className="space-y-md">
              <FormRow>
                <FormGroup label="Année"><TInput type="number" value={String(form.year)} onChange={(e) => setForm(s => ({ ...s, year: Number(e.target.value) }))} /></FormGroup>
                <FormGroup label="Mois">
                  <TSelect value={form.month} onChange={(e) => setForm(s => ({ ...s, month: Number(e.target.value) }))}>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </TSelect>
                </FormGroup>
              </FormRow>
              <Field label="Type de période">
                <TSelect value={form.half} onChange={(e) => setForm(s => ({ ...s, half: e.target.value as any }))}>
                  <option value="full">Mensuel (staff admin) — paie en fin de mois</option>
                  <option value="first">Quinzaine 1 (1-15) — paie le 15 (fermiers)</option>
                  <option value="second">Quinzaine 2 (16-fin) — paie en fin de mois (fermiers)</option>
                </TSelect>
              </Field>
              <ModalFooter onCancel={() => setModalOpen(false)} onSave={createPeriod} loading={saving} saveLabel="CRÉER" />
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
