'use client'

import {useEffect, useRef, useState} from 'react'
import {useLanguage} from '@/lib/i18n'
import {beginPayrollCorrection, cancelPayrollCorrection, listPayrollCorrections, type PayrollCorrection} from '@/lib/payrollPreparationApi'
import {payrollCorrectionChanges} from '@/lib/payrollCorrections'
import type {PayrollPayment, PayrollPreparation, PayrollPreparationLine} from '@/lib/payrollPreparation'
import {FilterableTable} from '@/components/ui/FilterableTable'
import {Modal} from '@/components/ui/Modal'

const control = 'rounded-md border border-border bg-surface-input px-3 py-2 text-body-sm disabled:opacity-50'
export default function PayrollCorrections({domain, preparation, lines, payments, canCorrect, busy, onBusy, onChanged}: {
  domain: string; preparation: PayrollPreparation; lines: PayrollPreparationLine[]; payments: PayrollPayment[]
  canCorrect: boolean; busy: boolean; onBusy: (value: boolean) => void; onChanged: () => void
}) {
  const {t, intlLocale} = useLanguage()
  const [history, setHistory] = useState<PayrollCorrection[]>([])
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const [reason, setReason] = useState('')
  const request = useRef<{reason: string; id: string} | null>(null)
  const paid = payments.some(payment => Number(payment.amount) > 0)
  const active = history.find(item => item.id === preparation.correction_id)
  const money = (value: number) => value.toLocaleString(intlLocale, {style: 'currency', currency: 'MAD'})
  const action = paid ? 'Préparer une régularisation' : 'Rouvrir la paie'
  useEffect(() => {
    let cancelled = false
    setError(''); setHistory([])
    listPayrollCorrections(domain, preparation.id).then(rows => {if (!cancelled) setHistory(rows)})
      .catch(failure => {if (!cancelled) setError(failure.message || String(failure))})
    return () => {cancelled = true}
  }, [domain, preparation.id, preparation.revision])

  async function begin() {
    if (!reason.trim()) {setError(t('Renseignez le motif de la correction')); return}
    if (request.current?.reason !== reason.trim()) request.current = {reason: reason.trim(), id: crypto.randomUUID()}
    setError(''); onBusy(true)
    try {
      await beginPayrollCorrection({domain, preparation: preparation.id, revision: preparation.revision, reason: reason.trim(), request: request.current.id})
      setModal(false); onChanged()
    } catch (failure: any) {setError(failure.message || String(failure))}
    finally {onBusy(false)}
  }
  async function cancel() {
    if (!window.confirm(t('Abandonner la correction et conserver la dernière paie validée ?'))) return
    setError(''); onBusy(true)
    try {await cancelPayrollCorrection({domain, preparation: preparation.id, revision: preparation.revision}); onChanged()}
    catch (failure: any) {setError(failure.message || String(failure))}
    finally {onBusy(false)}
  }
  function comparison(original: PayrollPreparationLine[], revised: PayrollPreparationLine[], saved = false) {
    const changes = payrollCorrectionChanges(original, revised, payments, saved)
    return <div className="overflow-x-auto"><FilterableTable className="w-full text-sm">
      <thead><tr>{['Employé', 'Net avant correction', 'Net après correction', 'Écart net', 'Coût avant correction', 'Coût après correction', 'Écart coût', 'Montant payé', 'Reste à payer', 'Trop-perçu à régulariser'].map(label => <th key={label} className="p-2 text-start whitespace-nowrap">{t(label)}</th>)}</tr></thead>
      <tbody>{changes.map(row => <tr key={row.worker} className="border-t">
        <td className="p-2">{row.name || t('Nom manquant')}</td>
        {[row.netBefore, row.netAfter, row.netDelta, row.costBefore, row.costAfter, row.costDelta, row.paid, row.remaining, row.overpaid].map((value, index) => <td key={index} className={`p-2 whitespace-nowrap ${index === 8 && value > 0 ? 'bg-warning/10 text-warning font-bold' : ''}`}>{money(value)}</td>)}
      </tr>)}</tbody>
    </FilterableTable></div>
  }
  return <section className="space-y-3 rounded-lg border border-border p-4" aria-label={t('Corrections de paie')}>
    <div className="flex flex-wrap items-center gap-3"><h2 className="font-bold">{t('Corrections de paie')}</h2>
      {canCorrect && preparation.status === 'validated' && <button className={control} disabled={busy} onClick={() => {setReason(''); request.current = null; setModal(true)}}>{t(action)}</button>}
      {canCorrect && preparation.correction_id && <button className={control} disabled={busy} onClick={() => void cancel()}>{t('Abandonner la correction')}</button>}
    </div>
    {error && !modal && <p role="alert" className="rounded-lg bg-danger/10 p-3 text-danger">{t(error)}</p>}
    {preparation.correction_id && <div className="rounded-lg bg-warning/10 p-3 text-warning space-y-2">
      <p className="font-semibold">{t(preparation.correction_mode === 'regularization' ? 'Régularisation en cours' : 'Paie rouverte pour correction')}</p>
      <p>{t('Les paiements sont conservés. Les bulletins et coûts validés restent en place jusqu’à la nouvelle validation. Les paiements sont suspendus pendant la correction.')}</p>
      {active && <p>{t('Motif')} · {active.reason}</p>}
      <p>{t('Un trop-perçu est signalé séparément. Aucune retenue ni récupération automatique n’est créée.')}</p>
    </div>}
    {preparation.correction_id && comparison(preparation.published_rows || active?.original_preparation.rows || [], lines)}
    {history.filter(item => item.status !== 'open').map(item => <details key={item.id} className="rounded border p-3">
      <summary className="cursor-pointer">{t(item.mode === 'regularization' ? 'Régularisation' : 'Réouverture')} · {new Date(item.created_at).toLocaleString(intlLocale)} · {t(item.status === 'applied' ? 'Appliquée' : 'Annulée')}</summary>
      <p className="my-2">{t('Motif')} · {item.reason}</p>
      <p className="my-2 text-fg-secondary">{t('Montant payé à l’ouverture')} · {money(Number(item.paid_at_open))}</p>
      {item.revised_preparation && comparison(item.original_preparation.rows, item.revised_preparation.rows, true)}
    </details>)}
    {modal && <Modal title={t(action)} onClose={() => {if (!busy) setModal(false)}} busy={busy}>
      <p>{t('La version validée est conservée dans l’historique. Les coûts seront recalculés à la nouvelle validation.')}</p>
      {paid && <p className="mt-3 rounded bg-warning/10 p-3 text-warning">{t('Les paiements existants seront conservés. L’écart indiquera le complément à payer ou le trop-perçu à régulariser.')}</p>}
      <label className="block mt-3">{t('Motif de la correction')}<textarea aria-label={t('Motif de la correction')} className={`${control} block w-full mt-1`} maxLength={1000} required disabled={busy} value={reason} onChange={event => setReason(event.target.value)}/></label>
      {error && <p role="alert" className="mt-3 rounded bg-danger/10 p-3 text-danger">{t(error)}</p>}
      <div className="flex gap-3 mt-4"><button className={control} disabled={busy} onClick={() => setModal(false)}>{t('Annuler')}</button><button className="rounded-lg bg-brand text-white px-4 py-2 disabled:opacity-50" disabled={busy || !reason.trim()} onClick={() => void begin()}>{t('Confirmer la correction')}</button></div>
    </Modal>}
  </section>
}
