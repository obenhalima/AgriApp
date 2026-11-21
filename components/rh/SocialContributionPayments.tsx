'use client'

import {useCallback, useEffect, useRef, useState} from 'react'
import Link from 'next/link'
import {Banknote, Building, Wallet} from 'lucide-react'
import {useAuth} from '@/lib/auth'
import {useLanguage} from '@/lib/i18n'
import {listSocialContributions, recordSocialPayment, saveSocialDeclaration, socialPaymentStatus, type SocialContributionMonth} from '@/lib/socialContributions'
import {PageHeader} from '@/components/ui/PageHeader'
import {Card} from '@/components/ui/Card'
import {Button} from '@/components/ui/Button'
import {KPICard} from '@/components/ui/KPICard'
import {FilterableTable} from '@/components/ui/FilterableTable'
import {Modal} from '@/components/ui/Modal'

const control = 'rounded-md border border-border bg-surface-input px-3 py-2 text-body-sm disabled:opacity-50'
const methodLabels = {virement: 'Virement', cheque: 'Chèque', cash: 'Espèces', other: 'Autre'}
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date())

export default function SocialContributionPayments({domain, client}: {domain: string; client: string}) {
  const {t, intlLocale} = useLanguage()
  const {isAdmin, hasPermission} = useAuth()
  const canView = isAdmin || hasPermission('rh_cnss', 'view')
  const canEdit = isAdmin || hasPermission('rh_cnss', 'edit')
  const canDeclare = isAdmin || hasPermission('rh_cnss', 'admin')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('')
  const [rows, setRows] = useState<SocialContributionMonth[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [detailMonth, setDetailMonth] = useState<number | null>(null)
  const [action, setAction] = useState<{month: number; kind: 'payment' | 'declaration'} | null>(null)
  const [form, setForm] = useState({amount: '', date: today(), method: 'virement', reference: ''})
  const paymentRequest = useRef<{signature: string; id: string} | null>(null)
  const loadVersion = useRef(0)
  const load = useCallback(async () => {
    const version = ++loadVersion.current
    setLoading(true); setError('')
    if (!canView) {setRows([]); setLoading(false); return}
    try {const result = await listSocialContributions(domain, year); if (version === loadVersion.current) setRows(result)}
    catch (failure: any) {if (version === loadVersion.current) {setRows([]); setError(failure.message || String(failure))}}
    finally {if (version === loadVersion.current) setLoading(false)}
  }, [domain, year, canView])
  useEffect(() => {setRows([]); setDetailMonth(null); setAction(null); void load(); return () => {loadVersion.current++}}, [load])
  const monthName = (value: number) => new Date(Date.UTC(year, value - 1, 15)).toLocaleDateString(intlLocale, {month: 'long', timeZone: 'UTC'})
  const money = (value: number) => Number(value).toLocaleString(intlLocale, {style: 'currency', currency: 'MAD'})
  const date = (value: string | null) => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString(intlLocale, {timeZone: 'UTC'}) : '—'
  const visible = rows.filter(row => !month || row.period_month === Number(month))
  const total = (key: 'paid' | 'remaining' | 'overpaid') => visible.reduce((sum, row) => sum + Math.round(Number(row[key]) * 100), 0) / 100
  const due = visible.reduce((sum, row) => sum + Math.round(Number(row.source.total_due) * 100), 0) / 100
  const detail = rows.find(row => row.period_month === detailMonth)
  const selected = rows.find(row => row.period_month === action?.month)
  function open(row: SocialContributionMonth, kind: 'payment' | 'declaration') {
    setError(''); setInfo(''); setDetailMonth(null); paymentRequest.current = null
    setForm({amount: Number(row.remaining).toFixed(2), date: today(), method: 'virement', reference: kind === 'declaration' ? row.declaration_number || '' : ''})
    setAction({month: row.period_month, kind})
  }
  async function calculate(row: SocialContributionMonth) {
    setBusy(true); setError(''); setInfo('')
    try {await saveSocialDeclaration(row, false, ''); await load(); setInfo(t('Cotisations actualisées. Aucun coût supplémentaire créé.'))}
    catch (failure: any) {setError(failure.message || String(failure))}
    finally {setBusy(false)}
  }
  async function submit() {
    if (!selected || !action) return
    setError(''); setInfo('')
    const value = {amount: Number(form.amount), date: form.date, method: form.method, reference: form.reference.trim()}
    if (action.kind === 'payment' && (!Number.isFinite(value.amount) || value.amount <= 0 || Math.abs(value.amount * 100 - Math.round(value.amount * 100)) > 0.00001 || value.amount > Number(selected.remaining) || !value.date)) {
      setError(t('Saisissez une date et un montant positif, inférieur ou égal au reste à payer.')); return
    }
    const signature = JSON.stringify({row: selected, value})
    if (paymentRequest.current?.signature !== signature) paymentRequest.current = {signature, id: crypto.randomUUID()}
    setBusy(true)
    try {
      if (action.kind === 'payment') await recordSocialPayment(selected, value, paymentRequest.current.id)
      else await saveSocialDeclaration(selected, true, value.reference)
      const completed = action.kind
      setAction(null); paymentRequest.current = null; await load()
      setInfo(t(completed === 'payment' ? 'Règlement enregistré. Aucun nouveau coût généré.' : 'Déclaration marquée déclarée'))
    } catch (failure: any) {setError(failure.message || String(failure))}
    finally {setBusy(false)}
  }
  const badge = (row: SocialContributionMonth) => {
    const label = socialPaymentStatus(row)
    return <span className={`rounded px-2 py-1 whitespace-nowrap ${label === 'Payé' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{t(label)}</span>
  }
  return <main className="space-y-lg">
    <PageHeader title={t('CNSS et charges patronales')} subtitle={`${t('Ressources humaines')} · ${client}`} icon={Building} iconColor="#6366f1" actions={<Button asChild variant="ghost"><Link href="/rh">{t('Tableau de bord')}</Link></Button>}/>
    <Card className="space-y-3">
      <p>{t('Les cotisations sont calculées depuis les bulletins validés du mois. Le total à régler comprend la part salariale et la part patronale, hors impôt sur le revenu.')}</p>
      <p className="rounded bg-info/10 p-3 text-info">{t('Les règlements suivent uniquement les sommes versées à l’organisme. Ils ne créent aucun coût supplémentaire et ne modifient pas les paiements des employés.')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label>{t('Année')}<input className={`${control} block w-28`} aria-label={t('Année')} type="number" min="1900" max="2200" value={year} disabled={busy || !!action} onChange={event => {const value = Number(event.target.value); if (value >= 1900 && value <= 2200) {setInfo(''); setYear(value)}}}/></label>
        <label>{t('Mois')}<select className={`${control} block`} aria-label={t('Mois')} value={month} disabled={busy || !!action} onChange={event => setMonth(event.target.value)}><option value="">{t('Tous les mois')}</option>{Array.from({length: 12}, (_, index) => <option key={index} value={index + 1}>{monthName(index + 1)}</option>)}</select></label>
        <button className={control} disabled={loading || busy || !!action} onClick={() => void load()}>{t('Actualiser')}</button>
      </div>
    </Card>
    {!canView && <p role="alert" className="rounded bg-danger/10 p-3 text-danger">{t('Accès aux cotisations non autorisé')}</p>}
    {error && !action && <p role="alert" className="rounded bg-danger/10 p-3 text-danger">{t(error)}</p>}
    {info && <p role="status" className="rounded bg-success/10 p-3 text-success">{info}</p>}
    {loading ? <p role="status">{t('Chargement…')}</p> : canView && (!error || rows.length > 0) && <>
      <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4"><KPICard label={t('Total à régler')} value={money(due)} icon={Banknote} accent="#6366f1"/><KPICard label={t('Montant payé')} value={money(total('paid'))} icon={Wallet} accent="#10b981"/><KPICard label={t('Reste à payer')} value={money(total('remaining'))} icon={Wallet} accent="#f59e0b"/><KPICard label={t('Trop-perçu à régulariser')} value={money(total('overpaid'))} icon={Wallet} accent="#ef4444"/></div>
      <Card padding="none"><div className="overflow-x-auto"><FilterableTable className="w-full text-sm" aria-label={t('Suivi mensuel des cotisations')}>
        <thead><tr>{['Période', 'Déclaration', 'Paiement', 'Salariés', 'Part salariale', 'Charges patronales', 'Total à régler', 'Montant payé', 'Reste à payer', 'Dernier règlement', 'Actions'].map(label => <th key={label} className="p-3 text-start whitespace-nowrap">{t(label)}</th>)}</tr></thead>
        <tbody>{visible.map(row => <tr key={row.period_month} className="border-t align-top">
          <td className="p-3 whitespace-nowrap">{monthName(row.period_month)} {year}</td>
          <td className="p-3">{t(row.stale ? 'À actualiser' : row.declared_at ? 'Déclarée' : row.id ? 'Brouillon' : 'À préparer')}{row.source.open_correction && <p className="rounded bg-warning/10 p-1 text-warning">{t('Correction de paie en cours')}</p>}</td>
          <td className="p-3">{badge(row)}</td><td className="p-3">{row.source.nb_workers}</td>
          {[row.source.total_employee, row.source.total_employer, row.source.total_due, row.paid, row.remaining].map((value, index) => <td key={index} className="p-3 whitespace-nowrap">{money(value)}{index === 4 && Number(row.overpaid) > 0 && <small className="block rounded bg-warning/10 p-1 text-warning">{t('Trop-perçu à régulariser')} · {money(row.overpaid)}</small>}</td>)}
          <td className="p-3 whitespace-nowrap">{date(row.last_payment_date)}</td>
          <td className="p-3"><div className="flex flex-wrap gap-2"><button className={control} disabled={busy} onClick={() => setDetailMonth(row.period_month)}>{t('Détails')}</button>
            {canEdit && <button className={control} disabled={busy || row.source.open_correction || !row.source.nb_periods} onClick={() => void calculate(row)}>{t('Recalculer')}</button>}
            {canDeclare && (!row.declared_at || row.stale) && <button className={control} disabled={busy || row.source.open_correction || !row.source.nb_periods} onClick={() => open(row, 'declaration')}>{t('Déclarer')}</button>}
            {canEdit && <button className="rounded-md bg-brand text-white px-3 py-2 disabled:opacity-50" disabled={busy || row.stale || row.source.open_correction || Number(row.remaining) <= 0} aria-label={`${t('Payer les cotisations')} ${row.period_month}/${year}`} onClick={() => open(row, 'payment')}>{t('Payer')}</button>}
          </div></td>
        </tr>)}</tbody>
      </FilterableTable></div>{!visible.length && <p className="p-4">{t('Aucune paie validée pour cette période.')}</p>}</Card>
    </>}
    {detail && <Modal title={`${t('Détail des cotisations')} — ${monthName(detail.period_month)} ${year}`} onClose={() => setDetailMonth(null)} size="lg">
      <p className="mb-3">{detail.source.nb_periods} {t('période(s) de paie validée(s)')} · {t('Brut total')} · {money(detail.source.total_gross)}</p>
      {detail.stale && <p className="rounded bg-warning/10 p-3 text-warning">{t('Les paies ont changé. Recalculez le mois et vérifiez la déclaration avant le prochain règlement.')}</p>}
      <dl className="grid gap-3 sm:grid-cols-2 my-4">{(['total_cnss_employee', 'total_amo_employee', 'total_cnss_employer', 'total_amo_employer', 'total_family_allowance', 'total_prof_training'] as const).map((key, index) => <div key={key}><dt>{t(['CNSS salarié', 'AMO salarié', 'CNSS employeur', 'AMO employeur', 'Allocations familiales', 'Formation professionnelle'][index])}</dt><dd className="font-semibold">{money(detail.source[key])}</dd></div>)}</dl>
      <p>{t('N° DAMANCOM')} · {detail.declaration_number || '—'}</p>
      <h2 className="font-semibold mt-5 mb-3">{t('Historique des règlements')}</h2>
      <div className="overflow-x-auto"><FilterableTable className="w-full text-sm"><thead><tr>{['Date', 'Montant payé', 'Mode de paiement', 'Référence'].map(label => <th key={label} className="p-2 text-start">{t(label)}</th>)}</tr></thead><tbody>{detail.payments.map(payment => <tr key={payment.id} className="border-t"><td className="p-2">{date(payment.payment_date)}</td><td className="p-2">{money(payment.amount)}</td><td className="p-2">{t(methodLabels[payment.payment_method])}</td><td className="p-2">{payment.reference || '—'}</td></tr>)}</tbody></FilterableTable></div>
      {!detail.payments.length && <p className="mt-2">{t('Aucun règlement enregistré')}</p>}
      <button className={`${control} mt-4`} onClick={() => setDetailMonth(null)}>{t('Fermer')}</button>
    </Modal>}
    {selected && action && <Modal title={`${t(action.kind === 'payment' ? 'Payer les cotisations' : 'Déclarer les cotisations')} — ${monthName(selected.period_month)} ${year}`} onClose={() => {if (!busy) setAction(null)}} busy={busy}>
      <p>{t('Total à régler')} · {money(selected.source.total_due)}</p><p>{t('Montant payé')} · {money(selected.paid)}</p><p className="font-bold">{t('Reste à payer')} · {money(selected.remaining)}</p>
      {action.kind === 'payment' && <>
        <label className="block mt-3">{t('Montant du paiement')}<input className={`${control} block w-full`} aria-label={t('Montant du paiement')} type="number" min="0.01" step="0.01" max={selected.remaining} disabled={busy} value={form.amount} onChange={event => setForm(current => ({...current, amount: event.target.value}))}/></label>
        <label className="block mt-3">{t('Date de paiement')}<input className={`${control} block w-full`} aria-label={t('Date de paiement')} type="date" disabled={busy} value={form.date} onChange={event => setForm(current => ({...current, date: event.target.value}))}/></label>
        <label className="block mt-3">{t('Mode de paiement')}<select className={`${control} block w-full`} aria-label={t('Mode de paiement')} disabled={busy} value={form.method} onChange={event => setForm(current => ({...current, method: event.target.value}))}>{Object.entries(methodLabels).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
      </>}
      <label className="block mt-3">{t(action.kind === 'payment' ? 'Référence (facultative)' : 'Numéro DAMANCOM (facultatif)')}<input className={`${control} block w-full`} aria-label={t('Référence (facultative)')} maxLength={action.kind === 'payment' ? 255 : 100} disabled={busy} value={form.reference} onChange={event => setForm(current => ({...current, reference: event.target.value}))}/></label>
      {error && <p role="alert" className="rounded bg-danger/10 p-3 text-danger mt-3">{t(error)}</p>}
      <div className="flex gap-3 mt-4"><button className={control} disabled={busy} onClick={() => setAction(null)}>{t('Annuler')}</button><button className="rounded bg-brand text-white px-4 py-2 disabled:opacity-50" disabled={busy} onClick={() => void submit()}>{t(action.kind === 'payment' ? 'Confirmer le paiement' : 'Confirmer la déclaration')}</button></div>
    </Modal>}
  </main>
}
