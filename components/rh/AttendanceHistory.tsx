'use client'

import {useEffect, useState} from 'react'
import Link from 'next/link'
import {useAuth} from '@/lib/auth'
import {useLanguage} from '@/lib/i18n'
import {listAttendanceHistory} from '@/lib/attendanceApi'
import {attendancePaymentSummary} from '@/lib/attendanceHistory'
import type {AttendancePeriod} from '@/lib/attendance'
import type {WorkerFarm} from '@/lib/workerScope'
import {Card} from '@/components/ui/Card'
import {Button} from '@/components/ui/Button'
import {FilterableTable} from '@/components/ui/FilterableTable'

type History = Awaited<ReturnType<typeof listAttendanceHistory>>
const empty: History = {periods: [], preparations: [], payments: []}

export default function AttendanceHistory({domain, farms, revision, onOpen, onPayroll}: {
  domain: string; farms: WorkerFarm[]; revision: number
  onOpen: (period: AttendancePeriod) => void
  onPayroll: () => boolean
}) {
  const {t, intlLocale} = useLanguage()
  const {hasPermission} = useAuth()
  const canReadPayroll = hasPermission('rh_paie', 'view')
  const [history, setHistory] = useState<History>(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [farm, setFarm] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setHistory(empty)
    listAttendanceHistory(domain, canReadPayroll).then(result => {
      if (!cancelled) setHistory(result)
    }).catch(reason => {if (!cancelled) setError(reason.message || String(reason))})
      .finally(() => {if (!cancelled) setLoading(false)})
    return () => {cancelled = true}
  }, [domain, revision, refresh, canReadPayroll])

  const money = (amount: number | null) => amount == null ? '—' : amount.toLocaleString(intlLocale, {style: 'currency', currency: 'MAD'})
  const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(intlLocale, {timeZone: 'UTC'})
  const rows = history.periods.filter(period => !farm || period.farm_id === farm)
  return <Card className="space-y-md" role="region" aria-label={t('Historique des pointages')}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-display text-heading-sm font-bold">{t('Historique des pointages')}</h2>
      <div className="flex gap-3">
        <select aria-label={t('Filtrer les pointages par ferme')} value={farm} onChange={event => setFarm(event.target.value)} className="rounded-md border border-border bg-surface-input px-3 py-2">
          <option value="">{t('Toutes les fermes')}</option>
          {farms.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
        </select>
        <Button variant="ghost" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{t('Actualiser')}</Button>
      </div>
    </div>
    {loading ? <p role="status">{t('Chargement…')}</p> : error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-danger">{t(error)}</p> : <div className="overflow-x-auto">
      <FilterableTable className="w-full text-sm text-start">
        <thead className="bg-surface-input"><tr>{['Ferme', 'Quinzaine', 'Pointage', ...(canReadPayroll ? ['Paie', 'Paiement', 'Net à payer', 'Montant payé', 'Reste à payer'] : []), 'Actions'].map(label => <th key={label} className="p-md text-start whitespace-nowrap font-mono text-caption text-fg-secondary">{t(label)}</th>)}</tr></thead>
        <tbody>{rows.map(period => {
          const preparation = history.preparations.find(item => item.attendance_period_id === period.id)
            || history.preparations.find(item => item.farm_id === period.farm_id && item.start_date === period.start_date)
          const summary = attendancePaymentSummary(preparation, history.payments)
          const farmName = farms.find(item => item.id === period.farm_id)
          const start = period.start_date.split('-').map(Number)
          const query = `farm=${period.farm_id}&year=${start[0]}&month=${start[1]}&half=${start[2] === 1 ? 'first' : 'second'}`
          const paymentColor = summary.label === 'Payé' ? 'bg-success/10 text-success' : summary.label === 'Partiellement payé' ? 'bg-warning/10 text-warning' : 'bg-surface-input text-fg-secondary'
          return <tr key={period.id} className="border-t border-border hover:bg-surface-hover">
            <td className="p-3">{farmName ? `${farmName.code} — ${farmName.name}` : period.farm_id}</td>
            <td className="p-3 whitespace-nowrap">{date(period.start_date)} — {date(period.end_date)}</td>
            <td className="p-3"><span className={`rounded px-2 py-1 ${period.status === 'validated' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{t(period.status === 'validated' ? 'Validé' : 'Brouillon')}</span></td>
            {canReadPayroll && <>
              <td className="p-3">{t(!preparation ? 'À préparer' : preparation.status === 'validated' ? 'Validée' : 'Brouillon')}</td>
              <td className="p-3"><span className={`rounded px-2 py-1 whitespace-nowrap ${paymentColor}`}>{t(summary.label)}</span></td>
              <td className="p-3 whitespace-nowrap">{money(summary.net)}</td><td className="p-3 whitespace-nowrap">{money(summary.paid)}</td><td className="p-3 whitespace-nowrap">{money(summary.remaining)}</td>
            </>}
            <td className="p-3"><div className="flex gap-3 whitespace-nowrap"><button className="text-brand underline" onClick={() => onOpen(period)}>{t('Ouvrir le pointage')}</button>
              {canReadPayroll && period.status === 'validated' && <Link className="text-brand underline" href={`/rh/paie?${query}`} onClick={event => {if (!onPayroll()) event.preventDefault()}}>{t('Paie & paiements')}</Link>}
            </div></td>
          </tr>
        })}</tbody>
      </FilterableTable>
      {!rows.length && <p className="py-4">{t('Aucun pointage enregistré')}</p>}
    </div>}
  </Card>
}
