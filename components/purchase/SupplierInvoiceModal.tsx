'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter } from '@/components/ui/Modal'

type PO = {
  id: string
  po_number: string
  supplier_id: string
  cost_category: string | null
  campaign_id: string | null
  greenhouse_id: string | null
  currency: string
  subtotal: number
  tax_amount: number
  total_amount: number
  suppliers?: { name: string }
}

/**
 * Crée une facture fournisseur rattachée à un bon d'achat.
 * Appelle onCreated() en cas de succès (utilisé pour enchaîner la transition workflow).
 */
export function SupplierInvoiceModal({ po, onClose, onCreated }: {
  po: PO
  onClose: () => void
  onCreated: () => void | Promise<void>
}) {
  const today = new Date().toISOString().slice(0, 10)
  const dueDefault = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10) })()

  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today)
  const [dueDate, setDueDate] = useState(dueDefault)
  const [subtotal, setSubtotal] = useState(String(Number(po.subtotal ?? po.total_amount ?? 0)))
  const [taxAmount, setTaxAmount] = useState(String(Number(po.tax_amount ?? 0)))
  const [totalAmount, setTotalAmount] = useState(String(Number(po.total_amount ?? 0)))
  const [autoTotal, setAutoTotal] = useState(true)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (autoTotal) {
      const t = Number(subtotal || 0) + Number(taxAmount || 0)
      setTotalAmount(t.toFixed(2))
    }
  }, [subtotal, taxAmount, autoTotal])

  const submit = async () => {
    setError('')
    if (!invoiceDate || !dueDate) { setError('Dates requises'); return }
    const subt = Number(subtotal || 0)
    const tot  = Number(totalAmount || 0)
    if (!Number.isFinite(subt) || subt < 0) { setError('Sous-total invalide'); return }
    if (!Number.isFinite(tot) || tot <= 0)  { setError('Montant total doit être > 0'); return }

    setSaving(true)
    try {
      const num = invoiceNumber.trim() || `FF-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
      const { error: e } = await supabase.from('supplier_invoices').insert({
        invoice_number: num,
        supplier_id: po.supplier_id,
        po_id: po.id,
        campaign_id: po.campaign_id,
        greenhouse_id: po.greenhouse_id,
        cost_category: po.cost_category,
        invoice_date: invoiceDate,
        due_date: dueDate,
        subtotal: subt,
        tax_amount: Number(taxAmount || 0),
        total_amount: tot,
        paid_amount: 0,
        status: 'en_attente',
        currency: po.currency,
        notes: notes || null,
      })
      if (e) throw e
      await onCreated()
    } catch (e: any) {
      setError(e.message ?? 'Erreur lors de la création de la facture')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="NOUVELLE FACTURE FOURNISSEUR" onClose={onClose} size="lg">
      <div style={{ padding: 8, marginBottom: 10, background: 'var(--neon-dim)', border: '1px solid var(--neon)40', borderRadius: 6, fontSize: 11, color: 'var(--neon)' }}>
        Rattachée au bon d'achat <strong>{po.po_number}</strong> — {po.suppliers?.name ?? 'fournisseur'}.
        Une fois créée, le bon passera automatiquement en état <strong>Facturé</strong>.
      </div>

      {error && (
        <div style={{ padding: 8, marginBottom: 10, background: 'var(--red-dim)', border: '1px solid var(--red)40', borderRadius: 6, color: 'var(--red)', fontSize: 11 }}>⚠ {error}</div>
      )}

      <FormRow>
        <FormGroup label="N° facture (laisser vide = auto)">
          <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="FF-2026-12345" />
        </FormGroup>
        <FormGroup label="Devise">
          <Input value={po.currency} disabled />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup label="Date facture *"><Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} /></FormGroup>
        <FormGroup label="Échéance *"><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup label="Sous-total">
          <Input type="number" value={subtotal} onChange={e => setSubtotal(e.target.value)} />
        </FormGroup>
        <FormGroup label="Taxes">
          <Input type="number" value={taxAmount} onChange={e => setTaxAmount(e.target.value)} />
        </FormGroup>
        <FormGroup label="Total">
          <div style={{ display: 'flex', gap: 4 }}>
            <Input type="number" value={totalAmount} onChange={e => { setAutoTotal(false); setTotalAmount(e.target.value) }} />
            <button type="button" onClick={() => setAutoTotal(true)}
              title="Recalculer auto"
              style={{ padding: '0 8px', border: '1px solid var(--bd-1)', background: autoTotal ? 'var(--neon-dim)' : 'transparent', color: autoTotal ? 'var(--neon)' : 'var(--tx-3)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
              Σ
            </button>
          </div>
        </FormGroup>
      </FormRow>

      <FormGroup label="Notes"><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></FormGroup>

      <ModalFooter onCancel={onClose} onSave={submit} loading={saving} saveLabel="CRÉER LA FACTURE" />
    </Modal>
  )
}
