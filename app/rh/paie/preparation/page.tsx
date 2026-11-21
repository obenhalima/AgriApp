'use client'

import {useEffect, useMemo, useRef, useState} from 'react'
import Link from 'next/link'
import {Banknote, LayoutDashboard} from 'lucide-react'
import {PageHeader} from '@/components/ui/PageHeader'
import {Card} from '@/components/ui/Card'
import {Button} from '@/components/ui/Button'
import {KPICard} from '@/components/ui/KPICard'
import {useAuth} from '@/lib/auth'
import {usesFortnightPayroll} from '@/lib/hrWorkflow'
import {useLanguage} from '@/lib/i18n'
import {supabase} from '@/lib/supabase'
import {readAttendance} from '@/lib/attendanceApi'
import {attendanceDays, type AttendancePeriod, type AttendanceRow} from '@/lib/attendance'
import {listClientWorkerFarms, listClientWorkers, type WorkerFarm} from '@/lib/workerScope'
import {newPayrollLine, withNetPayrollContext, payrollAdjustmentFields, payrollLineAmounts, payrollLineIssues, type PayrollWorker, type PayrollPreparationLine, type PayrollPreparation, type PayrollPayment} from '@/lib/payrollPreparation'
import {readPayrollPreparation, readNetPayrollContext, savePayrollPreparation, recordPayrollPayment} from '@/lib/payrollPreparationApi'
import {buildPayrollDocuments} from '@/lib/payrollPreparationWorkbook'
import {downloadBlob} from '@/lib/imports/engine'
import {FilterableTable} from '@/components/ui/FilterableTable'
import {Modal} from '@/components/ui/Modal'
import PayrollHistory from '@/components/rh/PayrollHistory'
import PayrollCorrections from '@/components/rh/PayrollCorrections'
import PayrollPaymentHistory from '@/components/rh/PayrollPaymentHistory'
import PayrollFortnightSettlement from '@/components/rh/PayrollFortnightSettlement'

const adjustmentLabels = {
  bonuses: 'Primes nettes', advance: 'Avances à récupérer', other_deductions: 'Autres retenues',
  cnss_employee: 'CNSS salarié', amo_employee: 'AMO salarié', ir_amount: 'IR',
  cnss_employer: 'CNSS employeur', amo_employer: 'AMO employeur',
  family_allowance_employer: 'Allocations familiales', prof_training_employer: 'Formation professionnelle',
}
const control = 'rounded-md border border-border bg-surface-input px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50'

export default function PayrollPreparationPage() {
  const {activeDomain} = useAuth()
  const {t} = useLanguage()
  return activeDomain ? <Preparation key={activeDomain.domain_id} domain={activeDomain.domain_id} client={activeDomain.domain_code}/> : <p>{t('Sélectionnez un client')}</p>
}

function Preparation({domain, client}: {domain: string; client: string}) {
  const {t, intlLocale} = useLanguage()
  const {isAdmin, hasPermission} = useAuth()
  const adapted = usesFortnightPayroll(client)
  const today = new Date()
  const [farm, setFarm] = useState('')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [half, setHalf] = useState<'first' | 'second'>(today.getDate() <= 15 ? 'first' : 'second')
  const [farms, setFarms] = useState<WorkerFarm[]>([])
  const [workers, setWorkers] = useState<PayrollWorker[]>([])
  const [campaigns, setCampaigns] = useState<{id: string; code: string; name: string; farm_id: string}[]>([])
  const [campaign, setCampaign] = useState('')
  const [payDate, setPayDate] = useState('')
  const [attendance, setAttendance] = useState<{period: AttendancePeriod | null; rows: AttendanceRow[]}>({period: null, rows: []})
  const [netContexts, setNetContexts] = useState<Awaited<ReturnType<typeof readNetPayrollContext>>>([])
  const [attendanceRevision, setAttendanceRevision] = useState<number | null>(null)
  const [preparation, setPreparation] = useState<PayrollPreparation | null>(null)
  const [lines, setLines] = useState<PayrollPreparationLine[]>([])
  const [payments, setPayments] = useState<PayrollPayment[]>([])
  const [units, setUnits] = useState<Record<string, 'hours' | 'days'>>({})
  const [detail, setDetail] = useState<string | null>(null)
  const [paymentWorker, setPaymentWorker] = useState<string | null>(null)
  const [paymentForm, setPaymentForm] = useState({amount: '', date: today.toLocaleDateString('en-CA'), method: 'cash', reference: ''})
  const [search, setSearch] = useState('')
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [historyRevision, setHistoryRevision] = useState(0)
  const saveRequest = useRef<{signature: string; id: string} | null>(null)
  const paymentRequest = useRef<{signature: string; id: string} | null>(null)
  const days = useMemo(() => attendanceDays(year, month, half), [year, month, half])
  const locked = preparation?.status === 'validated'
  const legacyCalculation = locked && lines.some(line => line.calculation_basis !== 'net-v1')
  const canWrite = isAdmin || hasPermission('rh_paie', preparation ? 'edit' : 'create')
  const canValidate = isAdmin || hasPermission('rh_paie', 'admin')
  const canPay = isAdmin || hasPermission('rh_paie', 'edit')
  const discard = () => !dirty || window.confirm(t('Abandonner les modifications non enregistrées ?'))
  const format = (value: number, precision = 2) => value.toLocaleString(intlLocale, {maximumFractionDigits: precision, minimumFractionDigits: precision === 2 ? 2 : 0})

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setFarm(params.get('farm') || '')
    const nextYear = Number(params.get('year')), nextMonth = Number(params.get('month'))
    if (nextYear >= 1900 && nextYear <= 2200) setYear(nextYear)
    if (nextMonth >= 1 && nextMonth <= 12) setMonth(nextMonth)
    if (params.get('half') === 'first' || params.get('half') === 'second') setHalf(params.get('half') as 'first' | 'second')
  }, [])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {if (dirty) {event.preventDefault(); event.returnValue = ''}}
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => {
    let cancelled = false
    setReady(false); setError(''); setInfo(''); setPreparation(null); setLines([]); setPayments([]); setDirty(false); setUnits({}); setCampaign(''); setPayDate(days[days.length - 1]); setAttendance({period: null, rows: []}); setAttendanceRevision(null)
    saveRequest.current = null; paymentRequest.current = null
    setLoading(true)
    async function load() {
      const [nextFarms, nextWorkers] = await Promise.all([listClientWorkerFarms(domain), listClientWorkers(domain)])
      if (cancelled) return
      setFarms(nextFarms); setWorkers(nextWorkers)
      if (!farm) return
      if (!nextFarms.some(item => item.id === farm)) throw new Error('Ferme inaccessible pour ce client')
      const [nextAttendance, saved, campaignResult, contexts] = await Promise.all([
        readAttendance(domain, farm, days[0]), readPayrollPreparation(domain, farm, days[0]),
        supabase.from('campaigns').select('id,code,name,farm_id').eq('farm_id', farm).order('created_at', {ascending: false}),
        readNetPayrollContext(domain, farm, days[0]),
      ])
      if (campaignResult.error) throw campaignResult.error
      if (cancelled) return
      setNetContexts(contexts)
      setCampaigns(campaignResult.data || []); setAttendance(nextAttendance); setPreparation(saved.preparation); setPayments(saved.payments)
      setAttendanceRevision(saved.preparation?.attendance_revision ?? nextAttendance.period?.revision ?? null)
      setCampaign(saved.preparation?.campaign_id || ''); setPayDate(saved.preparation?.pay_date || days[days.length - 1])
      const loadedLines = saved.preparation ? saved.preparation.rows : nextWorkers.filter(worker => worker.farm_id === farm && (worker.is_active || nextAttendance.rows.some(row => row.worker_id === worker.id))).map(worker => newPayrollLine(worker, nextAttendance))
      setLines(saved.preparation?.status === 'validated' ? loadedLines : loadedLines.map(line => withNetPayrollContext(line, nextWorkers.find(worker => worker.id === line.worker_id), contexts.find(context => context.worker_id === line.worker_id), days[0])))
      setReady(true)
    }
    load().catch(reason => {if (!cancelled) setError(reason.message || String(reason))}).finally(() => {if (!cancelled) setLoading(false)})
    return () => {cancelled = true}
  }, [domain, farm, days, refresh])

  const selectedWorkers = new Set(lines.map(line => line.worker_id))
  const staleAttendance = lines.some(line => line.source === 'attendance') && (attendance.period?.status !== 'validated' || attendance.period.revision !== attendanceRevision)
  const issues = lines.flatMap(line => payrollLineIssues(line, days.length, false))
  const visible = lines.filter(line => `${line.worker_name} ${line.worker_code}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const paidFor = (id: string) => payments.filter(payment => payment.worker_id === id).reduce((sum, payment) => sum + Number(payment.amount), 0)
  const summary = visible.reduce((sum, line) => {
    const amounts = payrollLineAmounts(line)
    return {normal: sum.normal + (line.normal_hours || 0), overtime: sum.overtime + (line.overtime_hours || 0), gross: sum.gross + amounts.gross_salary, net: sum.net + amounts.net_salary, cost: sum.cost + amounts.total_employer_cost, paid: sum.paid + paidFor(line.worker_id), remaining: sum.remaining + Math.max(0, amounts.net_salary - paidFor(line.worker_id)), overpaid: sum.overpaid + Math.max(0, paidFor(line.worker_id) - amounts.net_salary)}
  }, {normal: 0, overtime: 0, gross: 0, net: 0, cost: 0, paid: 0, remaining: 0, overpaid: 0})
  const detailLine = lines.find(line => line.worker_id === detail)
  const paymentLine = lines.find(line => line.worker_id === paymentWorker)

  function changeLine(id: string, field: keyof PayrollPreparationLine, value: number | boolean | null) {
    setLines(current => current.map(line => line.worker_id === id ? {...line, [field]: value, deductions_confirmed: field === 'deductions_confirmed' ? Boolean(value) : false} : line))
    setDirty(true)
  }
  function numericInput(line: PayrollPreparationLine, field: 'normal_hours' | 'overtime_hours' | 'normal_rate' | 'overtime_rate', disabled = false) {
    const multiplier = field === 'normal_hours' && units[line.worker_id] === 'days' ? 8 : 1
    const label = field === 'normal_hours' ? 'Heures normales' : field === 'overtime_hours' ? 'Heures supplémentaires' : field === 'normal_rate' ? 'Taux normal' : 'Taux supplémentaire'
    return <input aria-label={`${line.worker_code} ${t(label)}`} type="number" min="0" step="any" className={`${control} w-28 text-end`} disabled={locked || busy || !canWrite || disabled} value={line[field] == null || !Number.isFinite(line[field]) ? '' : line[field]! / multiplier} onChange={event => changeLine(line.worker_id, field, event.target.value === '' ? null : Number(event.target.value) * multiplier)}/>
  }
  function updateAttendance() {
    if (attendance.period?.status !== 'validated') return
    setLines(current => current.map(line => {
      const worker = workers.find(item => item.id === line.worker_id)
      if (!worker || !attendance.rows.some(row => row.worker_id === worker.id)) return line
      const next = newPayrollLine(worker, attendance)
      return {...line, source: next.source, normal_hours: next.normal_hours, overtime_hours: next.overtime_hours, deductions_confirmed: false}
    }))
    setAttendanceRevision(attendance.period.revision); setDirty(true)
  }
  async function persist(action: 'save' | 'validate') {
    setError(''); setInfo('')
    const validationIssues = lines.flatMap(line => payrollLineIssues(line, days.length, action === 'validate'))
    if (validationIssues.length) {setError(t(validationIssues[0])); return}
    if (staleAttendance) {setError(t('Actualisez les heures depuis le pointage validé.')); return}
    if (action === 'validate' && (!campaign || !lines.length)) {setError(t('Choisissez une campagne et au moins un employé')); return}
    if (action === 'validate' && !window.confirm(t(preparation?.correction_id ? 'Valider la correction et remplacer les coûts de la paie précédente ?' : 'Valider cette paie et générer les coûts de la campagne sélectionnée ?'))) return
    const payload = {domain, farm, start: days[0], end: days[days.length - 1], campaign: campaign || null, payDate, attendanceRevision, revision: preparation?.revision || 0, rows: lines, action}
    const signature = JSON.stringify(payload)
    if (saveRequest.current?.signature !== signature) saveRequest.current = {signature, id: crypto.randomUUID()}
    setBusy(true)
    try {
      const saved = await savePayrollPreparation({...payload, request: saveRequest.current.id})
      setPreparation(saved); setLines(saved.rows); setAttendanceRevision(saved.attendance_revision); setDirty(false); saveRequest.current = null
      setHistoryRevision(value => value + 1)
      setInfo(t(action === 'validate' ? 'Paie validée et coûts générés' : 'Préparation enregistrée'))
    } catch (reason: any) {setError(reason.message || String(reason))}
    finally {setBusy(false)}
  }
  async function pay() {
    if (!preparation || !paymentWorker) return
    setError(''); setInfo('')
    const payload = {preparation: preparation.id, worker: paymentWorker, amount: Number(paymentForm.amount), date: paymentForm.date, method: paymentForm.method, reference: paymentForm.reference}
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {setError(t('Paiement invalide')); return}
    const signature = JSON.stringify(payload)
    if (paymentRequest.current?.signature !== signature) paymentRequest.current = {signature, id: crypto.randomUUID()}
    setBusy(true)
    try {
      const payment = await recordPayrollPayment({...payload, request: paymentRequest.current.id})
      setPayments(current => current.some(item => item.id === payment.id) ? current : [...current, payment]); setPaymentWorker(null); paymentRequest.current = null; setInfo(t('Paiement enregistré'))
      setHistoryRevision(value => value + 1)
    } catch (reason: any) {setError(reason.message || String(reason))}
    finally {setBusy(false)}
  }
  async function exportDocuments() {
    setBusy(true); setError('')
    try {
      downloadBlob(await buildPayrollDocuments({client, farm: farms.find(item => item.id === farm)?.name || farm, start: days[0], end: days[days.length - 1], status: preparation?.status || 'draft', rows: lines, payments}), `ItriX_Paie_${client}_${days[0]}.xlsx`)
    } catch (reason: any) {setError(reason.message || String(reason))}
    finally {setBusy(false)}
  }

  return <main className="space-y-lg">
    <PageHeader title={t('Préparer la paie de la quinzaine')} subtitle={`${t('Parcours quinzaine')} · ${client}`} icon={Banknote} iconColor="#10b981" actions={<Button asChild variant="ghost"><Link href={adapted ? '/rh' : '/rh/paie'} onClick={event => {if (!discard()) event.preventDefault()}}><LayoutDashboard size={14}/>{t(adapted ? 'Tableau de bord' : 'Retour à la paie')}</Link></Button>}/>
    <PayrollHistory domain={domain} farms={farms} revision={historyRevision} disabled={busy} onSettled={result => {if (result.preparation_id === preparation?.id) setPayments(current => [...current, ...result.payments.filter(payment => !current.some(item => item.id === payment.id))])}} onOpen={saved => {
      if (!discard()) return
      const [nextYear, nextMonth, day] = saved.start_date.split('-').map(Number)
      setDetail(null); setPaymentWorker(null)
      setFarm(saved.farm_id); setYear(nextYear); setMonth(nextMonth); setHalf(day === 1 ? 'first' : 'second')
      setRefresh(value => value + 1)
    }}/>
    <Card className="flex flex-wrap items-end gap-md">
      <label>{t('Ferme')}<select aria-label={t('Ferme')} className={`${control} block`} value={farm} disabled={busy} onChange={event => {if (discard()) setFarm(event.target.value)}}><option value="">{t('Sélectionnez une ferme')}</option>{farms.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
      <label>{t('Année')}<select aria-label={t('Année')} className={`${control} block`} disabled={busy} value={year} onChange={event => {if (discard()) setYear(Number(event.target.value))}}>{[...new Set([...Array.from({length: 11}, (_, index) => today.getFullYear() - 5 + index), year])].sort().map(value => <option key={value}>{value}</option>)}</select></label>
      <label>{t('Mois')}<select aria-label={t('Mois')} className={`${control} block`} disabled={busy} value={month} onChange={event => {if (discard()) setMonth(Number(event.target.value))}}>{Array.from({length: 12}, (_, index) => <option key={index} value={index + 1}>{new Date(2026, index, 1).toLocaleDateString(intlLocale, {month: 'long'})}</option>)}</select></label>
      <label>{t('Quinzaine')}<select aria-label={t('Quinzaine')} className={`${control} block`} disabled={busy} value={half} onChange={event => {if (discard()) setHalf(event.target.value as 'first' | 'second')}}><option value="first">{t('Du 1 au 15')}</option><option value="second">{t('Du 16 à la fin du mois')}</option></select></label>
      <button className={`${control} self-end`} disabled={busy || loading} onClick={() => {if (discard()) setRefresh(value => value + 1)}}>{t('Recharger')}</button>
    </Card>
    {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-danger">{t(error)}</p>}
    {info && <p role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-success">{info}</p>}
    {loading && <p role="status">{t('Chargement…')}</p>}
    {ready && <>
      {preparation && <div data-payroll-settlement><PayrollFortnightSettlement preparation={preparation} payments={payments} disabled={busy} onBusy={setBusy} onRefresh={() => setRefresh(value => value + 1)} onPaid={result => {setPayments(current => [...current, ...result.payments.filter(payment => !current.some(item => item.id === payment.id))]); setInfo(t('Paiements de la quinzaine enregistrés. Aucun nouveau coût généré.')); setHistoryRevision(value => value + 1)}}/></div>}
      {preparation && <PayrollCorrections key={preparation.id} domain={domain} preparation={preparation} lines={lines} payments={payments} canCorrect={canValidate} busy={busy} onBusy={setBusy} onChanged={() => {setDirty(false); setRefresh(value => value + 1); setHistoryRevision(value => value + 1)}}/>}
      {legacyCalculation && <p role="status" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-warning">{t('Cette paie validée utilise le calcul brut enregistré lors de sa validation.')}</p>}
      <div className="flex flex-wrap gap-4 items-end"><p>{days[0]} — {days[days.length - 1]} · {t(locked ? 'Validée' : 'Brouillon')}{dirty && ` · ${t('Modifications non enregistrées')}`}</p>
        <label>{t('Campagne des coûts')}<select aria-label={t('Campagne des coûts')} className={`${control} block`} disabled={locked || busy || !canWrite} value={campaign} onChange={event => {setCampaign(event.target.value); setDirty(true)}}><option value="">{t('Sélectionnez une campagne')}</option>{campaigns.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
        <label>{t('Date de paie')}<input aria-label={t('Date de paie')} className={`${control} block`} type="date" disabled={locked || busy || !canWrite} value={payDate} onChange={event => {setPayDate(event.target.value); setDirty(true)}}/></label>
        <Link className="text-brand underline" href={`/pointage?farm=${farm}&year=${year}&month=${month}&half=${half}`} onClick={event => {if (!discard()) event.preventDefault()}}>{t('Ouvrir le pointage')}</Link>
      </div>
      {staleAttendance && !locked && <div role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-warning">{t('Le pointage a changé ou reste à valider. Rechargez la période.')} {attendance.period?.status === 'validated' && <button className={control} disabled={busy || !canWrite} onClick={updateAttendance}>{t('Actualiser les heures depuis le pointage')}</button>}</div>}
      {!locked && <details className="rounded-lg border p-3"><summary>{t('Employés de la quinzaine')} ({lines.length})</summary><div className="grid gap-2 mt-3 sm:grid-cols-2 lg:grid-cols-3">{workers.filter(worker => worker.farm_id === farm).map(worker => <label key={worker.id} className="flex gap-2"><input type="checkbox" checked={selectedWorkers.has(worker.id)} disabled={busy || !canWrite} onChange={() => {
        if (selectedWorkers.has(worker.id) && !window.confirm(t('Retirer cet employé de la préparation ?'))) return
        setLines(current => selectedWorkers.has(worker.id) ? current.filter(line => line.worker_id !== worker.id) : [...current, withNetPayrollContext(newPayrollLine(worker, attendance), worker, netContexts.find(context => context.worker_id === worker.id), days[0])]); setDirty(true)
      }}/>{worker.last_name} {worker.first_name}{!worker.is_active && ` · ${t('Inactif')}`}</label>)}</div></details>}
      <div className="flex flex-wrap gap-3"><input aria-label={t('Rechercher un employé')} placeholder={t('Rechercher un employé')} className={control} value={search} onChange={event => setSearch(event.target.value)}/><button className={control} disabled={busy || !lines.length || !!issues.length} onClick={exportDocuments}>{t('Exporter état de paie et émargement')}</button></div>
      <div className="grid gap-md sm:grid-cols-3 lg:grid-cols-4">{[['Heures normales', summary.normal], ['Heures supplémentaires', summary.overtime], ['Total brut', summary.gross], ['Net à payer', summary.net], ['Coût employeur', summary.cost], ['Payé', summary.paid], ['Reste à payer', summary.remaining], ...(summary.overpaid > 0 ? [['Trop-perçu à régulariser', summary.overpaid]] : [])].map(([label, value]) => <KPICard key={label} label={t(String(label))} value={format(Number(value))} icon={Banknote} accent="#10b981"/>)}</div>
      <p className="text-sm">{t('Les heures du pointage validé sont reprises automatiquement. Sans pointage, saisissez les heures ou les jours équivalents. 8 h = 1 jour.')}</p>
      <p className="text-sm text-amber-900 bg-amber-50 rounded-lg p-3">{t('Les taux horaires sont nets. Le brut, les cotisations et le coût employeur sont calculés automatiquement selon le statut déclaré. Les avances et autres retenues sont déduites du net acquis.')}</p>
      <div className="overflow-auto rounded-lg border bg-surface-raised"><FilterableTable className="w-full text-sm" data-payroll-preparation amountSummary={{total: summary.net, count: visible.length, currency: 'MAD'}}>
        <thead className="bg-surface-input text-fg-secondary"><tr>{['Employé', 'Origine', 'Employé déclaré', 'Heures normales', 'Heures supplémentaires', legacyCalculation ? 'Taux normal' : 'Taux normal net', legacyCalculation ? 'Taux supplémentaire' : 'Taux supplémentaire net', legacyCalculation ? 'Salaire normal' : 'Net normal acquis', legacyCalculation ? 'Montant heures supplémentaires' : 'Net heures supplémentaires acquis', 'Brut', 'Retenues', 'Net à payer', 'Payé', 'Reste à payer', 'Actions'].map((label, index) => <th key={label} className={`p-3 text-start whitespace-nowrap ${index === 0 ? 'sticky start-0 z-20 bg-surface-input' : ''}`}>{t(label)}</th>)}</tr></thead>
        <tbody>{visible.map(line => {
          const amounts = payrollLineAmounts(line), paid = paidFor(line.worker_id), remaining = Math.round((amounts.net_salary - paid) * 100) / 100
          const rowIssues = payrollLineIssues(line, days.length, false)
          return <tr key={line.worker_id} className="border-b align-top" data-filter-amount={amounts.net_salary}>
            <td data-filter-value={line.worker_name || t('Nom manquant')} className="p-3 min-w-[200px] sticky start-0 z-10 bg-surface-raised"><strong>{line.worker_name}</strong>{rowIssues.map(issue => <p key={issue} className="text-danger bg-danger/10 p-1 mt-1">{t(issue)}</p>)}</td>
            <td className="p-3">{t(line.source === 'attendance' ? 'Pointage validé' : 'Saisie manuelle')}</td>
            <td className="p-3">{t(line.is_declared !== false ? 'Oui' : 'Non')}{!locked && <Link className="block text-brand underline" href="/rh/employes" target="_blank">{t('Fiche employé')}</Link>}</td>
            <td className="p-3">{numericInput(line, 'normal_hours', line.source === 'attendance')}{line.source === 'manual' ? <select aria-label={`${line.worker_code} ${t('Unité de saisie')}`} className={`${control} mt-1 block`} disabled={locked || busy || !canWrite} value={units[line.worker_id] || 'hours'} onChange={event => setUnits(current => ({...current, [line.worker_id]: event.target.value as 'hours' | 'days'}))}><option value="hours">{t('Heures')}</option><option value="days">{t('Jours de 8 h')}</option></select> : <small className="block">{format((line.normal_hours || 0) / 8)} {t('jours équivalents')}</small>}</td>
            <td className="p-3">{numericInput(line, 'overtime_hours', line.source === 'attendance')}</td>
            {(['normal_rate', 'overtime_rate'] as const).map(field => {const original = field === 'normal_rate' ? line.original_normal_rate : line.original_overtime_rate; return <td key={field} className="p-3 min-w-[190px]">{numericInput(line, field)}<small className="block">{t('Taux net de la fiche')} · {original == null ? '—' : format(original, 9)}</small>{line[field] != null && original != null && line[field] !== original && <small className="block text-amber-900 bg-amber-50 p-1">{t('Écart')} · {format(line[field]! - original, 9)} MAD/h</small>}</td>})}
            <td className="p-3 whitespace-nowrap">{format(amounts.base_amount)}</td><td className="p-3 whitespace-nowrap">{format(amounts.overtime_amount)}</td><td className="p-3 whitespace-nowrap">{format(amounts.gross_salary)}</td>
            <td className="p-3 whitespace-nowrap">{format(amounts.gross_salary - amounts.net_salary)}<small className={`block ${line.deductions_confirmed ? 'text-green-800' : 'text-amber-900'}`}>{t(line.deductions_confirmed ? 'Confirmées' : 'À confirmer')}</small></td>
            <td className="p-3 whitespace-nowrap font-bold">{format(amounts.net_salary)}</td><td className="p-3 whitespace-nowrap">{format(paid)}</td><td className="p-3 whitespace-nowrap">{format(Math.max(0, remaining))}{remaining < 0 && <small className="block rounded bg-warning/10 p-1 text-warning">{t('Trop-perçu à régulariser')} · {format(-remaining)} MAD</small>}</td>
            <td className="p-3 flex gap-2"><button aria-label={`${t('Détails')} ${line.worker_code}`} className={control} onClick={() => setDetail(line.worker_id)}>{t('Détails')}</button>{locked && remaining > 0 && <button aria-label={`${t('Enregistrer un paiement')} ${line.worker_code}`} className={control} disabled={busy || !canPay} onClick={() => {setPaymentForm({amount: remaining.toFixed(2), date: new Date().toLocaleDateString('en-CA'), method: 'cash', reference: ''}); setPaymentWorker(line.worker_id)}}>{t('Payer')}</button>}</td>
          </tr>
        })}</tbody>
      </FilterableTable>{!visible.length && <p className="p-4">{t('Aucun employé à afficher')}</p>}</div>
      {!locked && <footer className="space-y-3"><label className="flex gap-2 items-center"><input type="checkbox" disabled={busy || !canWrite || !lines.length} checked={!!lines.length && lines.every(line => line.deductions_confirmed)} onChange={event => {setLines(current => current.map(line => ({...line, deductions_confirmed: event.target.checked}))); setDirty(true)}}/>{t('Je confirme les primes nettes, avances et autres retenues de tous les employés.')}</label><div className="flex flex-wrap gap-3"><button className={control} disabled={busy || !canWrite || !!issues.length || staleAttendance} onClick={() => void persist('save')}>{t('Enregistrer le brouillon')}</button><button className="rounded-lg bg-brand px-4 py-2 text-white disabled:opacity-50" disabled={busy || !canWrite || !canValidate || !!issues.length || staleAttendance} onClick={() => void persist('validate')}>{t('Valider la paie et générer les coûts')}</button></div></footer>}
    </>}
    {detailLine && <Modal title={`${t('Détail de paie')} — ${detailLine.worker_name}`} onClose={() => setDetail(null)} busy={busy}>
      <p className="mb-3">{t('Montants en MAD')} · {format(payrollLineAmounts(detailLine).gross_salary)} {t('brut')} · {format(payrollLineAmounts(detailLine).net_salary)} {t('net')}</p>
      <div className="mb-4"><PayrollPaymentHistory payments={payments.filter(payment => payment.worker_id === detailLine.worker_id)} summary={{net: payrollLineAmounts(detailLine).net_salary, paid: paidFor(detailLine.worker_id), remaining: locked ? Math.max(0, payrollLineAmounts(detailLine).net_salary - paidFor(detailLine.worker_id)) : null}} disabled={busy} onPay={locked && canPay && payrollLineAmounts(detailLine).net_salary > paidFor(detailLine.worker_id) ? () => {setPaymentForm({amount: (payrollLineAmounts(detailLine).net_salary - paidFor(detailLine.worker_id)).toFixed(2), date: new Date().toLocaleDateString('en-CA'), method: 'cash', reference: ''}); setDetail(null); setPaymentWorker(detailLine.worker_id)} : undefined}/></div>
      <div className="grid sm:grid-cols-2 gap-3">{payrollAdjustmentFields.map(field => <label key={field}>{t(adjustmentLabels[field])}<input aria-label={t(adjustmentLabels[field])} className={`${control} block w-full`} type="number" min="0" step="0.01" disabled={locked || busy || !canWrite || !['bonuses', 'advance', 'other_deductions'].includes(field)} value={['bonuses', 'advance', 'other_deductions'].includes(field) ? detailLine[field] : payrollLineAmounts(detailLine)[field as 'cnss_employee']} onChange={event => changeLine(detailLine.worker_id, field, Number(event.target.value))}/></label>)}</div>
      <p className="mt-3">{t('Coût employeur')} · {format(payrollLineAmounts(detailLine).total_employer_cost)}</p>
      {!locked && <label className="flex gap-2 mt-3"><input type="checkbox" disabled={busy || !canWrite} checked={detailLine.deductions_confirmed} onChange={event => changeLine(detailLine.worker_id, 'deductions_confirmed', event.target.checked)}/>{t('Je confirme les primes nettes, avances et autres retenues de cet employé.')}</label>}
      <button className={`${control} mt-4`} onClick={() => setDetail(null)}>{t('Fermer')}</button>
    </Modal>}
    {paymentLine && <Modal title={`${t('Enregistrer un paiement')} — ${paymentLine.worker_name}`} onClose={() => {if (!busy) setPaymentWorker(null)}} busy={busy}>
      {error && <p role="alert" className="text-danger bg-danger/10 p-3">{t(error)}</p>}
      <p>{t('Reste à payer')} · {format(payrollLineAmounts(paymentLine).net_salary - paidFor(paymentLine.worker_id))} MAD</p>
      <label className="block mt-3">{t('Montant du paiement')}<input aria-label={t('Montant du paiement')} className={`${control} block w-full`} type="number" min="0.01" step="0.01" disabled={busy} value={paymentForm.amount} onChange={event => setPaymentForm(current => ({...current, amount: event.target.value}))}/></label>
      <label className="block mt-3">{t('Date de paiement')}<input aria-label={t('Date de paiement')} className={`${control} block w-full`} type="date" disabled={busy} value={paymentForm.date} onChange={event => setPaymentForm(current => ({...current, date: event.target.value}))}/></label>
      <label className="block mt-3">{t('Mode de paiement')}<select aria-label={t('Mode de paiement')} className={`${control} block w-full`} disabled={busy} value={paymentForm.method} onChange={event => setPaymentForm(current => ({...current, method: event.target.value}))}><option value="cash">{t('Espèces')}</option><option value="virement">{t('Virement')}</option><option value="cheque">{t('Chèque')}</option></select></label>
      <label className="block mt-3">{t('Référence (facultative)')}<input aria-label={t('Référence (facultative)')} className={`${control} block w-full`} maxLength={255} disabled={busy} value={paymentForm.reference} onChange={event => setPaymentForm(current => ({...current, reference: event.target.value}))}/></label>
      <button className="rounded-lg bg-brand text-white px-4 py-2 mt-4 disabled:opacity-50" disabled={busy} onClick={() => void pay()}>{t('Confirmer le paiement')}</button>
    </Modal>}
  </main>
}
