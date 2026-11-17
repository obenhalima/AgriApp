'use client'

import {useEffect, useState} from 'react'
import {useLanguage} from '@/lib/i18n'
import {listPayrollPreparationHistory} from '@/lib/payrollPreparationApi'
import {attendancePaymentSummary} from '@/lib/attendanceHistory'
import type {PayrollPreparation, PayrollPreparationLine} from '@/lib/payrollPreparation'
import type {WorkerFarm} from '@/lib/workerScope'
import {Card} from '@/components/ui/Card'
import {Button} from '@/components/ui/Button'
import {FilterableTable} from '@/components/ui/FilterableTable'
import {Modal} from '@/components/ui/Modal'

type History = Awaited<ReturnType<typeof listPayrollPreparationHistory>>
const empty: History = {preparations: [], payments: []}

export default function PayrollHistory({domain, farms, revision, disabled, onOpen}: {
  domain: string; farms: WorkerFarm[]; revision: number; disabled: boolean
  onOpen: (preparation: PayrollPreparation) => void
}) {
  const {t, intlLocale} = useLanguage()
  const [history, setHistory] = useState<History>(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [farm, setFarm] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [workerId, setWorkerId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setHistory(empty)
    listPayrollPreparationHistory(domain).then(result => {
      if (!cancelled) setHistory(result)
    }).catch(reason => {if (!cancelled) setError(reason.message || String(reason))})
      .finally(() => {if (!cancelled) setLoading(false)})
    return () => {cancelled = true}
  }, [domain, revision, refresh])

  const money = (amount: number | null | undefined) => amount == null ? '—' : Number(amount).toLocaleString(intlLocale, {style: 'currency', currency: 'MAD'})
  const number = (amount: number | null) => amount == null ? '—' : Number(amount).toLocaleString(intlLocale, {maximumFractionDigits: 2})
  const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(intlLocale, {timeZone: 'UTC'})
  const farmName = (id: string) => {
    const item = farms.find(item => item.id === id)
    return item ? `${item.code} — ${item.name}` : id
  }
  const status = (preparation: PayrollPreparation) => t(preparation.status === 'validated' ? 'Validée' : 'Brouillon')
  const detail = history.preparations.find(item => item.id === detailId)
  const employee = detail?.rows.find(row => row.worker_id === workerId)
  const rows = history.preparations.filter(item => !farm || item.farm_id === farm)
  const summaryFor = (preparation: PayrollPreparation, line?: PayrollPreparationLine) => {
    const selected = line ? {...preparation, rows: [line]} : preparation
    const summary = attendancePaymentSummary(selected, history.payments)
    // A saved draft has a provisional net, but cannot yet have an amount due.
    if (preparation.status === 'draft' && selected.rows.every(row => row.net_salary != null)) {
      return {...summary, net: selected.rows.reduce((sum, row) => sum + Math.round(Number(row.net_salary) * 100), 0) / 100}
    }
    return summary
  }
  const badge = (label: string) => <span className={`rounded px-2 py-1 whitespace-nowrap ${label === 'Payé' ? 'bg-success/10 text-success' : label === 'Partiellement payé' ? 'bg-warning/10 text-warning' : 'bg-surface-input text-fg-secondary'}`}>{t(label)}</span>

  return <Card className="space-y-md" role="region" aria-label={t('Historique des paies')}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-display text-heading-sm font-bold">{t('Historique des paies')}</h2>
      <div className="flex gap-3">
        <select aria-label={t('Filtrer les paies par ferme')} value={farm} onChange={event => setFarm(event.target.value)} className="rounded-lg border border-border bg-surface-raised px-3 py-2">
          <option value="">{t('Toutes les fermes')}</option>
          {farms.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
        </select>
        <Button variant="ghost" disabled={loading || disabled} onClick={() => setRefresh(value => value + 1)}>{t('Actualiser')}</Button>
      </div>
    </div>
    {loading ? <p role="status">{t('Chargement…')}</p> : error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-danger">{t(error)}</p> : <div className="overflow-x-auto">
      <FilterableTable className="w-full text-sm text-start">
        <thead className="bg-surface-input"><tr>{['Ferme', 'Quinzaine', 'Paie', 'Paiement', 'Employés', 'Net à payer', 'Montant payé', 'Reste à payer', 'Actions'].map(label => <th key={label} className="p-md text-start whitespace-nowrap font-mono text-caption text-fg-secondary">{t(label)}</th>)}</tr></thead>
        <tbody>{rows.map(preparation => {
          const summary = summaryFor(preparation)
          return <tr key={preparation.id} className="border-t border-border hover:bg-surface-hover">
            <td className="p-3">{farmName(preparation.farm_id)}</td>
            <td className="p-3 whitespace-nowrap">{date(preparation.start_date)} — {date(preparation.end_date)}</td>
            <td className="p-3">{status(preparation)}</td><td className="p-3">{badge(summary.label)}</td>
            <td className="p-3">{preparation.rows.length}</td>
            <td className="p-3 whitespace-nowrap">{money(summary.net)}{preparation.status === 'draft' && <small className="block text-amber-900">{t('Provisoire')}</small>}</td>
            <td className="p-3 whitespace-nowrap">{money(summary.paid)}</td><td className="p-3 whitespace-nowrap">{money(summary.remaining)}</td>
            <td className="p-3"><div className="flex flex-col items-start gap-2 whitespace-nowrap">
              <button className="text-brand underline disabled:opacity-50" disabled={disabled} onClick={() => onOpen(preparation)}>{t('Ouvrir la paie')}</button>
              <button className="text-brand underline" onClick={() => {setDetailId(preparation.id); setWorkerId(null)}}>{t('Détail par employé')}</button>
            </div></td>
          </tr>
        })}</tbody>
      </FilterableTable>
      {!rows.length && <p className="py-4">{t('Aucune paie enregistrée')}</p>}
    </div>}
    {detail && <Modal title={t('Détail par employé')} onClose={() => {setDetailId(null); setWorkerId(null)}} size="lg">
      <p className="mb-4">{farmName(detail.farm_id)} · {date(detail.start_date)} — {date(detail.end_date)} · {status(detail)}</p>
      <div className="overflow-x-auto"><FilterableTable className="w-full text-sm">
        <thead><tr>{['Employé', 'Net à payer', 'Montant payé', 'Reste à payer', 'Paiement', 'Actions'].map(label => <th key={label} className={`p-2 text-start whitespace-nowrap ${label === 'Employé' ? 'sticky start-0 z-10 bg-surface-raised' : ''}`}>{t(label)}</th>)}</tr></thead>
        <tbody>{detail.rows.map(line => {
          const summary = summaryFor(detail, line)
          return <tr key={line.worker_id} className="border-t border-border hover:bg-surface-hover">
            <td className="p-2 sticky start-0 z-10 bg-surface-raised"><strong>{line.worker_name || line.worker_id}</strong><small className="block">{line.worker_code}</small></td>
            <td className="p-2 whitespace-nowrap">{money(summary.net)}</td><td className="p-2 whitespace-nowrap">{money(summary.paid)}</td><td className="p-2 whitespace-nowrap">{money(summary.remaining)}</td>
            <td className="p-2">{badge(summary.label)}</td>
            <td className="p-2"><button aria-label={`${t('Détails')} ${line.worker_code}`} className="text-brand underline" onClick={() => setWorkerId(line.worker_id)}>{t('Détails')}</button></td>
          </tr>
        })}</tbody>
      </FilterableTable></div>
      {employee && <section className="mt-5 rounded-lg border border-border p-4 space-y-3" aria-label={`${t('Détail de paie')} ${employee.worker_code}`}>
        <h3 className="font-semibold">{employee.worker_name}</h3>
        <dl className="grid grid-cols-2 gap-3"><div><dt className="text-fg-secondary">{t('Heures normales')}</dt><dd>{number(employee.normal_hours)} h</dd></div><div><dt className="text-fg-secondary">{t('Heures supplémentaires')}</dt><dd>{number(employee.overtime_hours)} h</dd></div></dl>
        <dl className="grid grid-cols-2 gap-3">{([
          ['Taux normal', employee.normal_rate], ['Taux supplémentaire', employee.overtime_rate],
          ['Primes nettes', employee.bonuses], ['Avances à récupérer', employee.advance], ['Autres retenues', employee.other_deductions],
          ['Salaire brut', employee.gross_salary], ['CNSS salarié', employee.cnss_employee], ['AMO salarié', employee.amo_employee], ['IR', employee.ir_amount],
          ['CNSS employeur', employee.cnss_employer], ['AMO employeur', employee.amo_employer],
          ['Allocations familiales', employee.family_allowance_employer], ['Formation professionnelle', employee.prof_training_employer], ['Coût employeur', employee.total_employer_cost],
        ] as const).map(([label, amount]) => <div key={label}><dt className="text-fg-secondary">{t(label)}</dt><dd>{money(amount)}</dd></div>)}</dl>
        <h4 className="font-semibold">{t('Paiements')}</h4>
        {history.payments.filter(payment => payment.preparation_id === detail.id && payment.worker_id === employee.worker_id).map(payment => <p key={payment.id}>{date(payment.payment_date)} · {money(payment.amount)} · {t({cash: 'Espèces', virement: 'Virement', cheque: 'Chèque'}[payment.payment_method])} · {payment.reference || '—'}</p>)}
        {!history.payments.some(payment => payment.preparation_id === detail.id && payment.worker_id === employee.worker_id) && <p>{t('Aucun paiement enregistré')}</p>}
      </section>}
      <button className="mt-4 rounded-md border border-border bg-surface-input px-3 py-2" onClick={() => {setDetailId(null); setWorkerId(null)}}>{t('Fermer')}</button>
    </Modal>}
  </Card>
}
