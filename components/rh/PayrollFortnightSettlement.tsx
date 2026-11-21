'use client'

import {useRef, useState} from 'react'
import {useAuth} from '@/lib/auth'
import {useLanguage} from '@/lib/i18n'
import type {PayrollPayment, PayrollPreparation} from '@/lib/payrollPreparation'
import {payrollSettlementPreview} from '@/lib/payrollSettlement'
import {listPayrollFortnightSettlements, settlePayrollFortnight, type PayrollFortnightSettlement as Settlement} from '@/lib/payrollPreparationApi'
import {FilterableTable} from '@/components/ui/FilterableTable'
import {Modal} from '@/components/ui/Modal'

const control = 'rounded-md border border-border bg-surface-input px-3 py-2 text-body-sm disabled:opacity-50'
const methods = {cash: 'Espèces', virement: 'Virement', cheque: 'Chèque'}
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date())

export default function PayrollFortnightSettlement({preparation, payments, disabled, onPaid, onRefresh, onBusy}: {
  preparation: PayrollPreparation; payments: PayrollPayment[]; disabled: boolean
  onPaid: (result: Settlement) => void; onRefresh: () => void; onBusy?: (busy: boolean) => void
}) {
  const {t, intlLocale} = useLanguage()
  const {isAdmin, hasPermission} = useAuth()
  const canPay = isAdmin || hasPermission('rh_paie', 'edit')
  const preview = payrollSettlementPreview(preparation, payments)
  const [snapshot, setSnapshot] = useState<{revision: number; preview: typeof preview} | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipts, setReceipts] = useState<Settlement[]>([])
  const [form, setForm] = useState({date: today(), method: 'cash', reference: ''})
  const request = useRef<{signature: string; id: string} | null>(null)
  const money = (value: number) => Number(value).toLocaleString(intlLocale, {style: 'currency', currency: 'MAD'})
  const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(intlLocale, {timeZone: 'UTC'})
  async function show() {
    setSnapshot({revision: preparation.revision, preview}); setForm({date: today(), method: 'cash', reference: ''})
    setError(''); setReceipts([]); request.current = null; setOpen(true); setLoading(true)
    try {setReceipts(await listPayrollFortnightSettlements(preparation.domain_id, preparation.id))}
    catch (failure: any) {setError(failure.message || String(failure))}
    finally {setLoading(false)}
  }
  async function submit() {
    if (!snapshot || !snapshot.preview.canSettle || !canPay || busy) return
    if (!form.date) {setError(t('Renseignez la date réelle du paiement.')); return}
    const input = {preparation: preparation.id, revision: snapshot.revision, expected: snapshot.preview.remaining, date: form.date, method: form.method, reference: form.reference.trim()}
    const signature = JSON.stringify(input)
    if (request.current?.signature !== signature) request.current = {signature, id: crypto.randomUUID()}
    setError(''); setBusy(true); onBusy?.(true)
    try {
      const result = await settlePayrollFortnight({...input, request: request.current.id})
      setOpen(false); request.current = null; onPaid(result)
    } catch (failure: any) {setError(failure.message || String(failure))}
    finally {setBusy(false); onBusy?.(false)}
  }
  const selected = snapshot?.preview
  return <div className="flex flex-col items-start gap-2">
    {canPay && preparation.status === 'validated' && <button className="rounded-md bg-brand px-3 py-2 text-sm text-white disabled:opacity-50" disabled={disabled || !preview.canSettle} onClick={() => void show()}>{t('Marquer la paie comme payée')}</button>}
    {preview.paid > 0 && <button className="text-brand underline text-sm disabled:opacity-50" disabled={disabled} onClick={() => void show()}>{t('Règlements de la quinzaine')}</button>}
    {open && selected && <Modal title={t(selected.canSettle && canPay ? 'Marquer la paie comme payée' : 'Règlements de la quinzaine')} onClose={() => {if (!busy) setOpen(false)}} busy={busy} size="lg">
      <p className="mb-3">{date(preparation.start_date)} — {date(preparation.end_date)}</p>
      <dl className="grid sm:grid-cols-3 gap-3 rounded-lg border p-3 mb-3"><div><dt>{t('Déjà payé')}</dt><dd className="font-semibold">{money(selected.paid)}</dd></div><div><dt>{t('Solde à enregistrer')}</dt><dd className="font-semibold">{money(selected.remaining)}</dd></div><div><dt>{t('Employés à solder')}</dt><dd className="font-semibold">{selected.count}</dd></div></dl>
      <p className="rounded bg-info/10 p-3 text-info">{t('Ce bouton enregistre des paiements déjà effectués. Seuls les soldes restant dus sont ajoutés ; les paiements partiels sont conservés. Aucun virement ni nouveau coût n’est généré.')}</p>
      {selected.overpaid > 0 && <p role="status" className="mt-3 rounded bg-warning/10 p-3 text-warning">{t('Un trop-perçu existe. Seuls les montants dus aux autres employés seront réglés.')} · {money(selected.overpaid)}</p>}
      {selected.canSettle && canPay && <div className="grid sm:grid-cols-2 gap-3 mt-3">
        <label>{t('Date réelle du paiement')}<input aria-label={t('Date réelle du paiement')} className={`${control} block w-full`} type="date" required disabled={busy} value={form.date} onChange={event => {setError(''); setForm(current => ({...current, date: event.target.value}))}}/></label>
        <label>{t('Mode de paiement')}<select aria-label={t('Mode de paiement')} className={`${control} block w-full`} disabled={busy} value={form.method} onChange={event => {setError(''); setForm(current => ({...current, method: event.target.value}))}}>{Object.entries(methods).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
        <label className="sm:col-span-2">{t('Référence (facultative)')}<input aria-label={t('Référence (facultative)')} className={`${control} block w-full`} maxLength={255} disabled={busy} value={form.reference} onChange={event => {setError(''); setForm(current => ({...current, reference: event.target.value}))}}/></label>
      </div>}
      <details className="rounded border p-3 mt-3"><summary className="cursor-pointer">{t('Détail des soldes par employé')}</summary><div className="overflow-x-auto"><FilterableTable className="w-full text-sm"><thead><tr>{['Employé', 'Net à payer', 'Déjà payé', 'Solde à enregistrer'].map(label => <th key={label} className="p-2 text-start">{t(label)}</th>)}</tr></thead><tbody>{selected.rows.map(row => <tr key={row.worker} className="border-t"><td className="p-2">{row.name || t('Nom manquant')}</td><td className="p-2 whitespace-nowrap">{money(row.net)}</td><td className="p-2 whitespace-nowrap">{money(row.paid)}</td><td className="p-2 whitespace-nowrap">{money(row.remaining)}</td></tr>)}</tbody></FilterableTable></div></details>
      {loading && <p role="status" className="mt-3">{t('Chargement…')}</p>}
      {!!receipts.length && <details className="rounded border p-3 mt-3"><summary className="cursor-pointer">{t('Historique des règlements collectifs')}</summary><div className="overflow-x-auto"><FilterableTable className="w-full text-sm"><thead><tr>{['Date de paiement', 'Montant payé', 'Employés', 'Mode de paiement', 'Référence', 'Enregistré le'].map(label => <th key={label} className="p-2 text-start">{t(label)}</th>)}</tr></thead><tbody>{receipts.map(receipt => <tr key={receipt.id} className="border-t"><td className="p-2">{date(receipt.payment_date)}</td><td className="p-2 whitespace-nowrap">{money(receipt.amount)}</td><td className="p-2">{receipt.worker_count}</td><td className="p-2">{t(methods[receipt.payment_method])}</td><td className="p-2">{receipt.reference || '—'}</td><td className="p-2">{new Date(receipt.created_at).toLocaleString(intlLocale, {timeZone: 'Africa/Casablanca'})}</td></tr>)}</tbody></FilterableTable></div></details>}
      {error && <div role="alert" className="mt-3 rounded bg-danger/10 p-3 text-danger"><p>{t(error)}</p><button className="underline mt-2" disabled={busy} onClick={() => {setOpen(false); onRefresh()}}>{t('Actualiser les paiements')}</button></div>}
      <div className="flex gap-3 mt-4"><button className={control} disabled={busy} onClick={() => setOpen(false)}>{t('Fermer')}</button>{selected.canSettle && canPay && <button className="rounded-md bg-brand px-4 py-2 text-white disabled:opacity-50" disabled={busy || loading || !form.date || !!error} onClick={() => void submit()}>{t('Confirmer le paiement de la quinzaine')}</button>}</div>
    </Modal>}
  </div>
}
