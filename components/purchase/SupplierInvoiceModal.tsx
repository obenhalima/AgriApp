'use client'
import {useLanguage} from '@/lib/i18n'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {useAuth} from '@/lib/auth'
import {checkInvoicePrefill,type SupplierInvoicePrefill} from '@/lib/purchaseInvoiceDocument'
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
export function SupplierInvoiceModal({ po, onClose, onCreated, initial }: {
  po: PO
  onClose: () => void
  onCreated: () => void | Promise<void>
  initial?:SupplierInvoicePrefill
}) {
 const {t:_ui,text:_uiNode}=useLanguage()
 const {activeDomain,user,hasPermission}=useAuth()

  const today = new Date().toISOString().slice(0, 10)
  const dueDefault = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10) })()

  const [invoiceNumber, setInvoiceNumber] = useState(initial?.invoiceNumber||'')
  const [invoiceDate, setInvoiceDate] = useState(initial?.invoiceDate??today)
  const [dueDate, setDueDate] = useState(initial?.dueDate??dueDefault)
  const [subtotal, setSubtotal] = useState(initial?.subtotal??String(Number(po.subtotal ?? po.total_amount ?? 0)))
  const [taxAmount, setTaxAmount] = useState(initial?.taxAmount??String(Number(po.tax_amount ?? 0)))
  const [totalAmount, setTotalAmount] = useState(initial?.totalAmount??String(Number(po.total_amount ?? 0)))
  const [autoTotal, setAutoTotal] = useState(!initial?.totalAmount)
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
    if(saving)return
    if(initial?.requireOriginalNumber&&!invoiceNumber.trim()){setError('Saisissez le numéro figurant sur la facture originale du fournisseur.');return}
    if(!activeDomain||!user||!hasPermission('factures','create')){setError('Droits de création de facture requis pour le client actif.');return}
    try{checkInvoicePrefill({...initial,source:initial?.source||'manual',subtotal,taxAmount,totalAmount},po.currency)}catch(e){setError((e as Error).message);return}
    if (!invoiceDate || !dueDate) { setError('Dates requises'); return }
    const subt = Number(subtotal || 0)
    const tot  = Number(totalAmount || 0)
    if (!Number.isFinite(subt) || subt < 0) { setError('Sous-total invalide'); return }
    if (!Number.isFinite(tot) || tot <= 0)  { setError('Montant total doit être > 0'); return }

    setSaving(true)
    try {
      const purchase=await supabase.from('purchase_orders').select('id,supplier_id,currency').eq('id',po.id).eq('domain_id',activeDomain.domain_id).maybeSingle()
      if(purchase.error||!purchase.data||purchase.data.supplier_id!==po.supplier_id||purchase.data.currency!==po.currency)throw Error('Le bon a changé ou n’est plus accessible pour ce client. Rechargez avant de confirmer.')
      const num = invoiceNumber.trim() || `FF-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
      const existing=await supabase.from('supplier_invoices').select('id').eq('domain_id',activeDomain.domain_id).eq('supplier_id',po.supplier_id).eq('invoice_number',num).limit(1)
      if(existing.error)throw existing.error
      if(existing.data?.length)throw Error('Une facture portant ce numéro existe déjà pour ce fournisseur. Consultez-la avant de créer un doublon.')
      const { error: e } = await supabase.from('supplier_invoices').insert({
        invoice_number: num,
        domain_id:activeDomain.domain_id,
        created_by:user.id,
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
    <Modal title={_ui("NOUVELLE FACTURE FOURNISSEUR")} onClose={onClose} size="lg" busy={saving}>
      <div style={{ padding: 8, marginBottom: 10, background: 'var(--neon-dim)', border: '1px solid var(--neon)40', borderRadius: 6, fontSize: 11, color: 'var(--neon)' }}>
        {" "}{_ui("Rattachée au bon d'achat")}{" "}<strong>{po.po_number}</strong> — {po.suppliers?.name ?? 'fournisseur'}. Vérifiez les informations avant de créer la facture. Le statut du bon reste géré par son workflow.
      </div>

      {error && (
        <div style={{ padding: 8, marginBottom: 10, background: 'var(--red-dim)', border: '1px solid var(--red)40', borderRadius: 6, color: 'var(--red)', fontSize: 11 }}>⚠ {_uiNode(error)}</div>
      )}

      <FormRow>
        <FormGroup label={initial?.requireOriginalNumber?'N° de la facture originale *':_ui("N° facture (laisser vide = auto)")}>
          <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder={_ui("FF-2026-12345")} />
        </FormGroup>
        <FormGroup label={_ui("Devise")}>
          <Input value={po.currency} disabled />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup label={_ui("Date facture *")}><Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} /></FormGroup>
        <FormGroup label={_ui("Échéance *")}><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup label={_ui("Sous-total")}>
          <Input type="number" value={subtotal} onChange={e => setSubtotal(e.target.value)} />
        </FormGroup>
        <FormGroup label={_ui("Taxes")}>
          <Input type="number" value={taxAmount} onChange={e => setTaxAmount(e.target.value)} />
        </FormGroup>
        <FormGroup label={_ui("Total")}>
          <div style={{ display: 'flex', gap: 4 }}>
            <Input type="number" value={totalAmount} onChange={e => { setAutoTotal(false); setTotalAmount(e.target.value) }} />
            <button type="button" onClick={() => setAutoTotal(true)}
              title={_ui("Recalculer auto")}
              style={{ padding: '0 8px', border: '1px solid var(--bd-1)', background: autoTotal ? 'var(--neon-dim)' : 'transparent', color: autoTotal ? 'var(--neon)' : 'var(--tx-3)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
              Σ
            </button>
          </div>
        </FormGroup>
      </FormRow>

      <FormGroup label={_ui("Notes")}><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></FormGroup>

      <ModalFooter onCancel={onClose} onSave={submit} loading={saving} saveLabel={_ui("CONFIRMER ET CRÉER LA FACTURE")} />
    </Modal>
  )
}
