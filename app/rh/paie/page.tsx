'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, ModalFooter, SuccessMessage } from '@/components/ui/Modal'
import { computePayroll, fmtMAD, periodCode, periodBounds, type PayFrequency } from '@/lib/payroll'

type Period = {
  id: string; code: string; period_year: number; period_month: number; period_half: string
  start_date: string; end_date: string; pay_date: string; status: string
}
type Worker = {
  id: string; first_name: string; last_name: string; matricule: string | null
  category: string; pay_frequency: string | null; base_salary: number | null
  dependents: number | null; family_status: string | null; is_active: boolean
}
type Payslip = {
  id: string; period_id: string; worker_id: string
  gross_salary: number; net_salary: number; total_employer_cost: number
  cnss_employee: number; amo_employee: number; ir_amount: number
  status: string
}

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

export default function PaiePage() {
  const [periods, setPeriods] = useState<Period[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Modal create period
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, half: 'full' as 'full'|'first'|'second' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [p, w, ps] = await Promise.all([
        supabase.from('payroll_periods').select('*').order('period_year', { ascending: false }).order('period_month', { ascending: false }),
        supabase.from('workers').select('id, first_name, last_name, matricule, category, pay_frequency, base_salary, dependents, family_status, is_active').eq('is_active', true).order('last_name'),
        supabase.from('payslips').select('*'),
      ])
      if (p.error) throw p.error
      setPeriods((p.data ?? []) as any)
      setWorkers((w.data ?? []) as any)
      setPayslips((ps.data ?? []) as any)
      if (!selectedPeriod && p.data && p.data.length > 0) setSelectedPeriod(p.data[0].id)
    } catch (e: any) { setError(e.message || String(e)) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const period = periods.find(p => p.id === selectedPeriod)
  const periodPayslips = payslips.filter(ps => ps.period_id === selectedPeriod)

  // Eligibles : workers dont la fréquence correspond à la nature de la période
  const eligible = useMemo(() => {
    if (!period) return []
    return workers.filter(w => {
      if (period.period_half === 'full') return w.pay_frequency === 'mensuel'
      if (period.period_half === 'first' || period.period_half === 'second') return w.pay_frequency === 'quinzaine' || w.pay_frequency === 'journalier'
      return false
    })
  }, [workers, period])

  // KPIs période
  const kpis = useMemo(() => {
    const totalGross = periodPayslips.reduce((s, x) => s + Number(x.gross_salary || 0), 0)
    const totalNet = periodPayslips.reduce((s, x) => s + Number(x.net_salary || 0), 0)
    const totalEmployer = periodPayslips.reduce((s, x) => s + Number(x.total_employer_cost || 0), 0)
    const totalCotis = periodPayslips.reduce((s, x) => s + Number(x.cnss_employee || 0) + Number(x.amo_employee || 0) + Number(x.ir_amount || 0), 0)
    return { totalGross, totalNet, totalEmployer, totalCotis }
  }, [periodPayslips])

  const createPeriod = async () => {
    setSaving(true); setError('')
    try {
      const code = periodCode(form.year, form.month, form.half)
      const bounds = periodBounds(form.year, form.month, form.half)
      const { error } = await supabase.from('payroll_periods').insert({
        code,
        period_year: form.year,
        period_month: form.month,
        period_half: form.half,
        start_date: bounds.start,
        end_date: bounds.end,
        pay_date: bounds.payDate,
        status: 'brouillon',
      })
      if (error) throw error
      setDone(true)
      setTimeout(() => { setModalOpen(false); setDone(false); load() }, 800)
    } catch (e: any) { setError(e.message || String(e)) }
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
          period_id: period.id,
          worker_id: w.id,
          base_amount: r.base_amount,
          overtime_amount: r.overtime_amount,
          bonuses: r.bonuses,
          gross_salary: r.gross_salary,
          cnss_employee: r.cnss_employee,
          amo_employee: r.amo_employee,
          ir_amount: r.ir_amount,
          other_deductions: r.other_deductions,
          net_salary: r.net_salary,
          cnss_employer: r.cnss_employer,
          amo_employer: r.amo_employer,
          family_allowance_employer: r.family_allowance_employer,
          prof_training_employer: r.prof_training_employer,
          total_employer_cost: r.total_employer_cost,
          status: 'brouillon',
        }
      })
      // Upsert pour éviter les doublons sur (period_id, worker_id)
      const { error } = await supabase.from('payslips').upsert(rows, { onConflict: 'period_id,worker_id' })
      if (error) throw error
      load()
    } catch (e: any) { setError(e.message || String(e)) }
  }

  const validatePeriod = async () => {
    if (!period) return
    if (!confirm('Valider la période ? Les bulletins seront figés et une écriture comptable sera générée.')) return
    const { error } = await supabase.from('payroll_periods').update({ status: 'valide', validated_at: new Date().toISOString() }).eq('id', period.id)
    if (error) alert('Erreur : ' + error.message); else load()
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1500 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-main)' }}>
            💵 Paie
          </h1>
          <div style={{ color: 'var(--text-sub)', fontSize: 12.5, marginTop: 4 }}>
            Périodes mensuelles (staff) ou bimensuelles (fermiers : 1-15 et 16-fin)
          </div>
        </div>
        <button onClick={() => { setModalOpen(true); setDone(false); setError('') }} className="btn-primary" style={{ marginLeft: 'auto', fontSize: 12, padding: '7px 14px' }}>
          + Nouvelle période
        </button>
      </header>

      {error && (
        <div style={{ padding: 12, marginBottom: 14, background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 6, color: 'var(--text-main)', fontSize: 12.5 }}>
          ⚠ {error}
        </div>
      )}

      {/* Sélecteur période */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>Période :</span>
        <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)}
          style={{ padding: '7px 12px', background: 'var(--bg-2)', color: 'var(--text-main)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 12, minWidth: 320 }}>
          {periods.length === 0 && <option value="">Aucune période</option>}
          {periods.map(p => (
            <option key={p.id} value={p.id}>
              {p.code} — {MONTHS[p.period_month - 1]} {p.period_year} {p.period_half === 'first' ? '(1-15)' : p.period_half === 'second' ? '(16-fin)' : '(mois)'} · {p.status}
            </option>
          ))}
        </select>
        {period && (
          <>
            <button onClick={generatePayslips} disabled={period.status !== 'brouillon'} className="btn-ghost" style={{ fontSize: 11, padding: '6px 12px' }}>
              ⚙ Générer bulletins ({eligible.length} éligibles)
            </button>
            <button onClick={validatePeriod} disabled={period.status !== 'brouillon' || periodPayslips.length === 0} className="btn-primary" style={{ fontSize: 11, padding: '6px 12px' }}>
              ✓ Valider la période
            </button>
          </>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 14 }}>
        <KPI label="Bulletins" value={periodPayslips.length} sub="générés sur la période" color="#0ea5e9" />
        <KPI label="Total brut" value={fmtMAD(kpis.totalGross)} sub="rémunérations brutes" color="#3b82f6" />
        <KPI label="Cotisations + IR" value={fmtMAD(kpis.totalCotis)} sub="déductions salariales" color="#f59e0b" />
        <KPI label="Coût employeur" value={fmtMAD(kpis.totalEmployer)} sub="charge réelle" color="#10b981" />
      </div>

      {/* Tableau bulletins */}
      <div style={{ border: '1px solid var(--bd-1)', borderRadius: 8, overflow: 'auto', background: 'var(--bg-1)' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-2)' }}>
            <tr>
              {['Matricule', 'Employé', 'Brut', 'CNSS sal.', 'AMO sal.', 'IR', 'Net à payer', 'CNSS pat.', 'Coût total', 'Statut'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} style={{ padding: 16, textAlign: 'center', color: 'var(--text-sub)' }}>Chargement…</td></tr>}
            {!loading && periodPayslips.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                {period ? 'Aucun bulletin sur cette période. Cliquer "⚙ Générer bulletins".' : 'Sélectionnez une période.'}
              </td></tr>
            )}
            {periodPayslips.map(ps => {
              const w = workers.find(x => x.id === ps.worker_id)
              return (
                <tr key={ps.id} style={{ borderBottom: '1px solid var(--bd-1)' }}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{w?.matricule ?? '—'}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{w ? `${w.last_name} ${w.first_name}` : '—'}</td>
                  <td style={tdNum}>{Math.round(ps.gross_salary).toLocaleString('fr-FR')}</td>
                  <td style={tdNum}>{Math.round(ps.cnss_employee).toLocaleString('fr-FR')}</td>
                  <td style={tdNum}>{Math.round(ps.amo_employee).toLocaleString('fr-FR')}</td>
                  <td style={tdNum}>{Math.round(ps.ir_amount).toLocaleString('fr-FR')}</td>
                  <td style={{ ...tdNum, color: 'var(--neon)', fontWeight: 700 }}>{Math.round(ps.net_salary).toLocaleString('fr-FR')}</td>
                  <td style={{ ...tdNum, color: 'var(--text-sub)' }}>{Math.round(Number((ps as any).cnss_employer || 0) + Number((ps as any).amo_employer || 0) + Number((ps as any).family_allowance_employer || 0) + Number((ps as any).prof_training_employer || 0)).toLocaleString('fr-FR')}</td>
                  <td style={{ ...tdNum, color: 'var(--amber)', fontWeight: 600 }}>{Math.round(ps.total_employer_cost).toLocaleString('fr-FR')}</td>
                  <td style={td}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, background: ps.status === 'paye' ? 'var(--neon-dim)' : 'var(--bg-2)', color: ps.status === 'paye' ? 'var(--neon)' : 'var(--text-sub)', fontSize: 10.5 }}>
                      {ps.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal création période */}
      {modalOpen && (
        <Modal title="Créer une période de paie" onClose={() => setModalOpen(false)}>
          {done ? <SuccessMessage message="Période créée" /> : (
            <>
              <FormRow>
                <FormGroup label="Année">
                  <input type="number" value={form.year} onChange={e => setForm(s => ({ ...s, year: Number(e.target.value) }))}
                    style={{ width: '100%', padding: 8, background: 'var(--bg-2)', color: 'var(--text-main)', border: '1px solid var(--bd-1)', borderRadius: 6 }} />
                </FormGroup>
                <FormGroup label="Mois">
                  <select value={form.month} onChange={e => setForm(s => ({ ...s, month: Number(e.target.value) }))}
                    style={{ width: '100%', padding: 8, background: 'var(--bg-2)', color: 'var(--text-main)', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </FormGroup>
              </FormRow>
              <FormGroup label="Type de période">
                <select value={form.half} onChange={e => setForm(s => ({ ...s, half: e.target.value as any }))}
                  style={{ width: '100%', padding: 8, background: 'var(--bg-2)', color: 'var(--text-main)', border: '1px solid var(--bd-1)', borderRadius: 6 }}>
                  <option value="full">Mensuel (staff admin) — paie en fin de mois</option>
                  <option value="first">Quinzaine 1 (1-15) — paie le 15 (fermiers)</option>
                  <option value="second">Quinzaine 2 (16-fin) — paie en fin de mois (fermiers)</option>
                </select>
              </FormGroup>
              <ModalFooter
                onCancel={() => setModalOpen(false)}
                onSave={createPeriod}
                loading={saving}
                saveLabel="CRÉER"
              />
            </>
          )}
        </Modal>
      )}
    </div>
  )
}

function KPI({ label, value, sub, color }: { label: string; value: any; sub: string; color: string }) {
  return (
    <div style={{ padding: 14, background: 'var(--bg-1)', border: '1px solid var(--bd-1)', borderRadius: 10, borderTop: `2px solid ${color}` }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'var(--font-display)', marginTop: 4 }}>
        {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-sub)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: .5, borderBottom: '1px solid var(--bd-1)' }
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text-main)' }
const tdNum: React.CSSProperties = { padding: '8px 10px', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', textAlign: 'right' }
