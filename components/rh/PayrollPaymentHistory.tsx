'use client'

import {useLanguage} from '@/lib/i18n'
import type {PayrollPayment} from '@/lib/payrollPreparation'
import {FilterableTable} from '@/components/ui/FilterableTable'

export default function PayrollPaymentHistory({payments, summary, onPay, disabled = false}: {
  payments: PayrollPayment[]
  summary: {net: number | null; paid: number | null; remaining: number | null}
  onPay?: () => void; disabled?: boolean
}) {
  const {t, intlLocale} = useLanguage()
  const money = (value: number | null) => value == null ? '—' : Number(value).toLocaleString(intlLocale, {style: 'currency', currency: 'MAD'})
  const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(intlLocale, {timeZone: 'UTC'})
  return <section className="rounded-lg border border-brand/30 bg-brand/5 p-3 space-y-3" aria-label={t('Historique des paiements')}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{t('Historique des paiements')}</h3>
      {onPay && <button className="rounded-lg bg-brand px-3 py-2 text-white disabled:opacity-50" disabled={disabled} onClick={onPay}>{t('Enregistrer un paiement')}</button>}
    </div>
    <dl className="grid grid-cols-3 gap-3">{[['Net à payer', summary.net], ['Montant payé', summary.paid], ['Reste à payer', summary.remaining]].map(([label, value]) => <div key={String(label)}><dt className="text-sm text-fg-secondary">{t(String(label))}</dt><dd className="font-semibold">{money(value as number | null)}</dd></div>)}</dl>
    {payments.length ? <div className="overflow-x-auto"><FilterableTable className="w-full text-sm" aria-label={t('Paiements enregistrés')}>
      <thead><tr>{['Date de paiement', 'Montant payé', 'Mode de paiement', 'Référence'].map(label => <th key={label} className="p-2 text-start whitespace-nowrap">{t(label)}</th>)}</tr></thead>
      <tbody>{[...payments].sort((a, b) => b.payment_date.localeCompare(a.payment_date) || a.id.localeCompare(b.id)).map(payment => <tr key={payment.id} className="border-t border-border"><td className="p-2 whitespace-nowrap">{date(payment.payment_date)}</td><td className="p-2 whitespace-nowrap">{money(Number(payment.amount))}</td><td className="p-2">{t({cash: 'Espèces', virement: 'Virement', cheque: 'Chèque'}[payment.payment_method])}</td><td className="p-2">{payment.reference || '—'}</td></tr>)}</tbody>
    </FilterableTable></div> : <p className="rounded bg-info/10 p-3 text-info">{t('Aucun paiement enregistré')}</p>}
  </section>
}
