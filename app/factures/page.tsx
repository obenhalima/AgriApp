'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  createFacture,
  createFactureFournisseur,
  getCampagnes,
  getClients,
  getFactures,
  getFacturesFournisseurs,
  getFournisseurs,
  getSerres,
  payerFacture,
  payerFactureFournisseur,
} from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

type InvoiceTab = 'clients' | 'fournisseurs'
type ModalType = 'facture_client' | 'paiement_client' | 'facture_fournisseur' | 'paiement_fournisseur' | null

function toIsoDate(value?: string | null) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}

function getEffectiveStatus(item: any) {
  const total = Number(item.total_amount || 0)
  const paid = Number(item.paid_amount || 0)
  const balance = total - paid
  const today = new Date().toISOString().slice(0, 10)
  const dueDate = toIsoDate(item.due_date)

  if (balance <= 0) return 'paye'
  if (dueDate && dueDate < today) return 'en_retard'
  if (paid > 0) return 'partiellement_paye'
  return 'en_attente'
}

function formatMad(value: number) {
  return `${value.toLocaleString('fr')} MAD`
}

function diffDays(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso}T00:00:00`)
  const to = new Date(`${toIso}T00:00:00`)
  return Math.round((to.getTime() - from.getTime()) / 86400000)
}

function addDays(base: Date, days: number) {
  const date = new Date(base)
  date.setDate(date.getDate() + days)
  return date
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

export default function FacturesPage() {
  const [tab, setTab] = useState<InvoiceTab>('clients')
  const [modal, setModal] = useState<ModalType>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  const [clientInvoices, setClientInvoices] = useState<any[]>([])
  const [supplierInvoices, setSupplierInvoices] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [campagnes, setCampagnes] = useState<any[]>([])
  const [serres, setSerres] = useState<any[]>([])

  const [selectedClientInvoice, setSelectedClientInvoice] = useState<any>(null)
  const [selectedSupplierInvoice, setSelectedSupplierInvoice] = useState<any>(null)

  const [clientForm, setClientForm] = useState({ client_id: '', invoice_date: '', due_date: '', subtotal: '', notes: '' })
  const [clientPaymentForm, setClientPaymentForm] = useState({ amount: '', payment_method: 'virement', reference: '' })
  const [supplierForm, setSupplierForm] = useState({
    supplier_id: '',
    campaign_id: '',
    greenhouse_id: '',
    cost_category: 'services',
    invoice_date: '',
    due_date: '',
    subtotal: '',
    notes: '',
  })
  const [supplierPaymentForm, setSupplierPaymentForm] = useState({ amount: '', payment_method: 'virement', reference: '' })

  const [clientFilter, setClientFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0)

  const ST: Record<string, any> = {
    en_attente: { bg: '#fef3c7', color: '#92400e', label: 'En attente' },
    partiellement_paye: { bg: '#dbeafe', color: '#1e3a8a', label: 'Partiellement paye' },
    paye: { bg: '#d8f3dc', color: '#1b4332', label: 'Paye' },
    en_retard: { bg: '#fce4e5', color: '#9b1d1d', label: 'En retard' },
  }

  const load = () =>
    Promise.all([
      getFactures(),
      getFacturesFournisseurs(),
      getClients(),
      getFournisseurs(),
      getCampagnes(),
      getSerres(),
    ])
      .then(([facturesClients, facturesFournisseurs, clientsData, suppliersData, campagnesData, serresData]) => {
        setClientInvoices(facturesClients)
        setSupplierInvoices(facturesFournisseurs)
        setClients(clientsData)
        setSuppliers(suppliersData)
        setCampagnes(campagnesData)
        setSerres(serresData)
        setLoading(false)
      })
      .catch(() => setLoading(false))

  useEffect(() => {
    load()
  }, [])

  const effectiveClientInvoices = useMemo(
    () => clientInvoices.map((item: any) => ({ ...item, effectiveStatus: getEffectiveStatus(item) })),
    [clientInvoices]
  )
  const effectiveSupplierInvoices = useMemo(
    () => supplierInvoices.map((item: any) => ({ ...item, effectiveStatus: getEffectiveStatus(item) })),
    [supplierInvoices]
  )

  const filteredClientInvoices = useMemo(
    () =>
      effectiveClientInvoices.filter((item: any) => {
        if (clientFilter !== 'all' && item.client_id !== clientFilter) return false
        if (statusFilter !== 'all' && item.effectiveStatus !== statusFilter) return false
        return true
      }),
    [clientFilter, effectiveClientInvoices, statusFilter]
  )

  const filteredSupplierInvoices = useMemo(
    () =>
      effectiveSupplierInvoices.filter((item: any) => {
        if (supplierFilter !== 'all' && item.supplier_id !== supplierFilter) return false
        if (statusFilter !== 'all' && item.effectiveStatus !== statusFilter) return false
        return true
      }),
    [effectiveSupplierInvoices, statusFilter, supplierFilter]
  )

  const clientSummary = useMemo(() => {
    const total = filteredClientInvoices.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)
    const paid = filteredClientInvoices.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0)
    const outstanding = filteredClientInvoices.reduce((sum, item) => sum + Math.max(Number(item.total_amount || 0) - Number(item.paid_amount || 0), 0), 0)
    const overdue = filteredClientInvoices
      .filter((item) => item.effectiveStatus === 'en_retard')
      .reduce((sum, item) => sum + Math.max(Number(item.total_amount || 0) - Number(item.paid_amount || 0), 0), 0)
    return { total, paid, outstanding, overdue }
  }, [filteredClientInvoices])

  const supplierSummary = useMemo(() => {
    const total = filteredSupplierInvoices.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)
    const paid = filteredSupplierInvoices.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0)
    const outstanding = filteredSupplierInvoices.reduce((sum, item) => sum + Math.max(Number(item.total_amount || 0) - Number(item.paid_amount || 0), 0), 0)
    const overdue = filteredSupplierInvoices
      .filter((item) => item.effectiveStatus === 'en_retard')
      .reduce((sum, item) => sum + Math.max(Number(item.total_amount || 0) - Number(item.paid_amount || 0), 0), 0)
    return { total, paid, outstanding, overdue }
  }, [filteredSupplierInvoices])

  const supplierClientBalance = useMemo(() => {
    const grouped = new Map<string, any>()
    const source = tab === 'clients' ? filteredClientInvoices : filteredSupplierInvoices

    source.forEach((item: any) => {
      const key = tab === 'clients' ? item.client_id : item.supplier_id
      const name = tab === 'clients' ? item.clients?.name : item.suppliers?.name
      const current = grouped.get(key) || { key, name: name || '-', count: 0, total: 0, paid: 0, outstanding: 0 }
      current.count += 1
      current.total += Number(item.total_amount || 0)
      current.paid += Number(item.paid_amount || 0)
      current.outstanding += Math.max(Number(item.total_amount || 0) - Number(item.paid_amount || 0), 0)
      grouped.set(key, current)
    })

    return Array.from(grouped.values()).sort((a, b) => b.outstanding - a.outstanding)
  }, [filteredClientInvoices, filteredSupplierInvoices, tab])

  const treasurySummary = useMemo(() => {
    const collected = effectiveClientInvoices.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0)
    const paidOut = effectiveSupplierInvoices.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0)
    return {
      collected,
      paidOut,
      net: collected - paidOut,
      receivables: effectiveClientInvoices.reduce((sum, item) => sum + Math.max(Number(item.total_amount || 0) - Number(item.paid_amount || 0), 0), 0),
      payables: effectiveSupplierInvoices.reduce((sum, item) => sum + Math.max(Number(item.total_amount || 0) - Number(item.paid_amount || 0), 0), 0),
    }
  }, [effectiveClientInvoices, effectiveSupplierInvoices])

  const allOpenDueInvoices = useMemo(() => {
    const source = [
      ...effectiveClientInvoices.map((item: any) => ({
        kind: 'client',
        label: item.clients?.name || '-',
        invoice_number: item.invoice_number,
        due_date: toIsoDate(item.due_date),
        remaining: Math.max(Number(item.total_amount || 0) - Number(item.paid_amount || 0), 0),
      })),
      ...effectiveSupplierInvoices.map((item: any) => ({
        kind: 'fournisseur',
        label: item.suppliers?.name || '-',
        invoice_number: item.invoice_number,
        due_date: toIsoDate(item.due_date),
        remaining: Math.max(Number(item.total_amount || 0) - Number(item.paid_amount || 0), 0),
      })),
    ]

    return source.filter((item) => item.remaining > 0 && item.due_date)
  }, [effectiveClientInvoices, effectiveSupplierInvoices])

  const calendarMonthDate = useMemo(() => {
    const base = new Date()
    base.setDate(1)
    base.setMonth(base.getMonth() + calendarMonthOffset)
    return base
  }, [calendarMonthOffset])

  const visibleCalendarRange = useMemo(() => {
    const monthStart = new Date(calendarMonthDate)
    const monthEnd = new Date(calendarMonthDate)
    monthEnd.setMonth(monthEnd.getMonth() + 1)
    monthEnd.setDate(0)

    const gridStart = new Date(monthStart)
    const startDay = (gridStart.getDay() + 6) % 7
    gridStart.setDate(gridStart.getDate() - startDay)

    const gridEnd = new Date(gridStart)
    gridEnd.setDate(gridEnd.getDate() + 41)

    return {
      startIso: gridStart.toISOString().slice(0, 10),
      endIso: gridEnd.toISOString().slice(0, 10),
    }
  }, [calendarMonthDate])

  const monthlyDueInvoices = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10)

    return allOpenDueInvoices
      .map((item) => ({ ...item, daysLeft: diffDays(todayIso, item.due_date) }))
      .filter((item) => item.due_date >= visibleCalendarRange.startIso && item.due_date <= visibleCalendarRange.endIso)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
  }, [allOpenDueInvoices, visibleCalendarRange])

  const nextDueReport = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10)
    return allOpenDueInvoices
      .map((item) => ({ ...item, daysLeft: diffDays(todayIso, item.due_date) }))
      .filter((item) => item.daysLeft >= 0)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 12)
  }, [allOpenDueInvoices])

  const upcomingByDate = useMemo(() => {
    const grouped = new Map<string, any[]>()
    monthlyDueInvoices.forEach((item) => {
      const list = grouped.get(item.due_date) || []
      list.push(item)
      grouped.set(item.due_date, list)
    })
    return grouped
  }, [monthlyDueInvoices])

  const monthGridDays = useMemo(() => {
    const monthStart = new Date(calendarMonthDate)
    const monthEnd = new Date(calendarMonthDate)
    monthEnd.setMonth(monthEnd.getMonth() + 1)
    monthEnd.setDate(0)

    const gridStart = new Date(monthStart)
    const startDay = (gridStart.getDay() + 6) % 7
    gridStart.setDate(gridStart.getDate() - startDay)

    return Array.from({ length: 42 }, (_, index) => {
      const date = addDays(gridStart, index)
      const iso = date.toISOString().slice(0, 10)
      return {
        iso,
        label: date.getDate(),
        inMonth: date.getMonth() === calendarMonthDate.getMonth(),
        isToday: iso === new Date().toISOString().slice(0, 10),
        events: upcomingByDate.get(iso) || [],
      }
    })
  }, [calendarMonthDate, upcomingByDate])

  const resetModalState = () => {
    setDone(false)
    setPaymentError('')
    setModal(null)
    setSelectedClientInvoice(null)
    setSelectedSupplierInvoice(null)
  }

  const saveClientInvoice = async () => {
    if (!clientForm.client_id || !clientForm.invoice_date || !clientForm.due_date || !clientForm.subtotal) return
    setSaving(true)
    try {
      const total = Number(clientForm.subtotal)
      const created = await createFacture({ ...clientForm, subtotal: total, total_amount: total })
      setClientInvoices((prev) => [created, ...prev])
      setDone(true)
      setTimeout(() => {
        resetModalState()
        setClientForm({ client_id: '', invoice_date: '', due_date: '', subtotal: '', notes: '' })
      }, 1200)
    } catch (e: any) {
      alert('Erreur: ' + e.message)
    }
    setSaving(false)
  }

  const saveSupplierInvoice = async () => {
    if (!supplierForm.supplier_id || !supplierForm.invoice_date || !supplierForm.due_date || !supplierForm.subtotal) return
    setSaving(true)
    try {
      const total = Number(supplierForm.subtotal)
      const created = await createFactureFournisseur({
        ...supplierForm,
        campaign_id: supplierForm.campaign_id || undefined,
        greenhouse_id: supplierForm.greenhouse_id || undefined,
        subtotal: total,
        total_amount: total,
      })
      setSupplierInvoices((prev) => [created, ...prev])
      setDone(true)
      setTimeout(() => {
        resetModalState()
        setSupplierForm({
          supplier_id: '',
          campaign_id: '',
          greenhouse_id: '',
          cost_category: 'services',
          invoice_date: '',
          due_date: '',
          subtotal: '',
          notes: '',
        })
      }, 1200)
    } catch (e: any) {
      alert('Erreur: ' + e.message)
    }
    setSaving(false)
  }

  const saveClientPayment = async () => {
    if (!selectedClientInvoice || !clientPaymentForm.amount) return
    const amount = Number(clientPaymentForm.amount)
    const remaining = Number(selectedClientInvoice.total_amount || 0) - Number(selectedClientInvoice.paid_amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) return setPaymentError('Le montant doit etre superieur a zero')
    if (amount > remaining) return setPaymentError(`Le paiement depasse le reste a encaisser (${remaining.toFixed(2)} MAD)`)

    setSaving(true)
    try {
      await payerFacture({ invoice_id: selectedClientInvoice.id, amount, payment_method: clientPaymentForm.payment_method, reference: clientPaymentForm.reference })
      await load()
      setDone(true)
      setTimeout(() => {
        resetModalState()
        setClientPaymentForm({ amount: '', payment_method: 'virement', reference: '' })
      }, 1200)
    } catch (e: any) {
      alert('Erreur: ' + e.message)
    }
    setSaving(false)
  }

  const saveSupplierPayment = async () => {
    if (!selectedSupplierInvoice || !supplierPaymentForm.amount) return
    const amount = Number(supplierPaymentForm.amount)
    const remaining = Number(selectedSupplierInvoice.total_amount || 0) - Number(selectedSupplierInvoice.paid_amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) return setPaymentError('Le montant doit etre superieur a zero')
    if (amount > remaining) return setPaymentError(`Le paiement depasse le reste a regler (${remaining.toFixed(2)} MAD)`)

    setSaving(true)
    try {
      await payerFactureFournisseur({
        supplier_invoice_id: selectedSupplierInvoice.id,
        amount,
        payment_method: supplierPaymentForm.payment_method,
        reference: supplierPaymentForm.reference,
      })
      await load()
      setDone(true)
      setTimeout(() => {
        resetModalState()
        setSupplierPaymentForm({ amount: '', payment_method: 'virement', reference: '' })
      }, 1200)
    } catch (e: any) {
      alert('Erreur: ' + e.message)
    }
    setSaving(false)
  }

  return (
    <div style={{ background: 'var(--bg-deep)', minHeight: '100vh', padding: '20px 22px 28px' }}>
      {modal === 'facture_client' && (
        <Modal title="Nouvelle facture client" onClose={resetModalState}>
          {done ? <SuccessMessage message="Facture client creee !" /> : (
            <>
              <FormGroup label="Client *">
                <Select value={clientForm.client_id} onChange={(e: any) => setClientForm((f) => ({ ...f, client_id: e.target.value }))}>
                  <option value="">-- Selectionner un client --</option>
                  {clients.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              </FormGroup>
              <FormRow>
                <FormGroup label="Date facture *"><Input type="date" value={clientForm.invoice_date} onChange={(e: any) => setClientForm((f) => ({ ...f, invoice_date: e.target.value }))} /></FormGroup>
                <FormGroup label="Date echeance *"><Input type="date" value={clientForm.due_date} onChange={(e: any) => setClientForm((f) => ({ ...f, due_date: e.target.value }))} /></FormGroup>
              </FormRow>
              <FormGroup label="Montant total (MAD) *"><Input type="number" value={clientForm.subtotal} onChange={(e: any) => setClientForm((f) => ({ ...f, subtotal: e.target.value }))} /></FormGroup>
              <FormGroup label="Notes"><Textarea rows={2} value={clientForm.notes} onChange={(e: any) => setClientForm((f) => ({ ...f, notes: e.target.value }))} /></FormGroup>
              <ModalFooter onCancel={resetModalState} onSave={saveClientInvoice} loading={saving} disabled={!clientForm.client_id || !clientForm.invoice_date || !clientForm.due_date || !clientForm.subtotal} saveLabel="Creer la facture client" />
            </>
          )}
        </Modal>
      )}

      {modal === 'facture_fournisseur' && (
        <Modal title="Nouvelle facture fournisseur" onClose={resetModalState} size="lg">
          {done ? <SuccessMessage message="Facture fournisseur creee !" /> : (
            <>
              <FormGroup label="Fournisseur *">
                <Select value={supplierForm.supplier_id} onChange={(e: any) => setSupplierForm((f) => ({ ...f, supplier_id: e.target.value }))}>
                  <option value="">-- Selectionner un fournisseur --</option>
                  {suppliers.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              </FormGroup>
              <FormRow>
                <FormGroup label="Date facture *"><Input type="date" value={supplierForm.invoice_date} onChange={(e: any) => setSupplierForm((f) => ({ ...f, invoice_date: e.target.value }))} /></FormGroup>
                <FormGroup label="Date echeance *"><Input type="date" value={supplierForm.due_date} onChange={(e: any) => setSupplierForm((f) => ({ ...f, due_date: e.target.value }))} /></FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Campagne">
                  <Select value={supplierForm.campaign_id} onChange={(e: any) => setSupplierForm((f) => ({ ...f, campaign_id: e.target.value }))}>
                    <option value="">-- Optionnel --</option>
                    {campagnes.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup label="Serre">
                  <Select value={supplierForm.greenhouse_id} onChange={(e: any) => setSupplierForm((f) => ({ ...f, greenhouse_id: e.target.value }))}>
                    <option value="">-- Optionnel --</option>
                    {serres.map((item: any) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
                  </Select>
                </FormGroup>
              </FormRow>
              <FormRow>
                <FormGroup label="Categorie">
                  <Select value={supplierForm.cost_category} onChange={(e: any) => setSupplierForm((f) => ({ ...f, cost_category: e.target.value }))}>
                    {['semences', 'engrais', 'phytosanitaires', 'irrigation', 'emballage', 'transport', 'energie', 'services', 'equipement', 'divers'].map((item) => <option key={item} value={item}>{item}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup label="Montant total (MAD) *"><Input type="number" value={supplierForm.subtotal} onChange={(e: any) => setSupplierForm((f) => ({ ...f, subtotal: e.target.value }))} /></FormGroup>
              </FormRow>
              <FormGroup label="Notes"><Textarea rows={2} value={supplierForm.notes} onChange={(e: any) => setSupplierForm((f) => ({ ...f, notes: e.target.value }))} /></FormGroup>
              <ModalFooter onCancel={resetModalState} onSave={saveSupplierInvoice} loading={saving} disabled={!supplierForm.supplier_id || !supplierForm.invoice_date || !supplierForm.due_date || !supplierForm.subtotal} saveLabel="Creer la facture fournisseur" />
            </>
          )}
        </Modal>
      )}

      {modal === 'paiement_client' && selectedClientInvoice && (
        <Modal title="Encaisser une facture client" onClose={resetModalState}>
          {done ? <SuccessMessage message="Encaissement enregistre !" /> : (
            <>
              <div style={{ background: '#f4f9f4', border: '1px solid #cce5d4', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#5a7a66' }}>{selectedClientInvoice.invoice_number} - {selectedClientInvoice.clients?.name}</div>
                <div style={{ fontSize: 12, color: '#5a7a66', marginTop: 4 }}>
                  A encaisser: {formatMad(Math.max(Number(selectedClientInvoice.total_amount || 0) - Number(selectedClientInvoice.paid_amount || 0), 0))}
                </div>
              </div>
              <FormGroup label="Montant encaisse *"><Input type="number" value={clientPaymentForm.amount} onChange={(e: any) => { setClientPaymentForm((f) => ({ ...f, amount: e.target.value })); setPaymentError('') }} /></FormGroup>
              <FormRow>
                <FormGroup label="Mode de paiement">
                  <Select value={clientPaymentForm.payment_method} onChange={(e: any) => setClientPaymentForm((f) => ({ ...f, payment_method: e.target.value }))}>
                    {['virement', 'cheque', 'especes', 'lettre_change'].map((item) => <option key={item} value={item}>{item}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup label="Reference"><Input value={clientPaymentForm.reference} onChange={(e: any) => setClientPaymentForm((f) => ({ ...f, reference: e.target.value }))} /></FormGroup>
              </FormRow>
              {paymentError && <div style={{ marginBottom: 12, padding: '8px 10px', background: '#fce4e5', border: '1px solid #f3b6bb', borderRadius: 8, fontSize: 12, color: '#9b1d1d' }}>{paymentError}</div>}
              <ModalFooter onCancel={resetModalState} onSave={saveClientPayment} loading={saving} disabled={!clientPaymentForm.amount} saveLabel="Encaisser" />
            </>
          )}
        </Modal>
      )}

      {modal === 'paiement_fournisseur' && selectedSupplierInvoice && (
        <Modal title="Regler une facture fournisseur" onClose={resetModalState}>
          {done ? <SuccessMessage message="Paiement fournisseur enregistre !" /> : (
            <>
              <div style={{ background: '#f4f9f4', border: '1px solid #cce5d4', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#5a7a66' }}>{selectedSupplierInvoice.invoice_number} - {selectedSupplierInvoice.suppliers?.name}</div>
                <div style={{ fontSize: 12, color: '#5a7a66', marginTop: 4 }}>
                  A regler: {formatMad(Math.max(Number(selectedSupplierInvoice.total_amount || 0) - Number(selectedSupplierInvoice.paid_amount || 0), 0))}
                </div>
              </div>
              <FormGroup label="Montant regle *"><Input type="number" value={supplierPaymentForm.amount} onChange={(e: any) => { setSupplierPaymentForm((f) => ({ ...f, amount: e.target.value })); setPaymentError('') }} /></FormGroup>
              <FormRow>
                <FormGroup label="Mode de paiement">
                  <Select value={supplierPaymentForm.payment_method} onChange={(e: any) => setSupplierPaymentForm((f) => ({ ...f, payment_method: e.target.value }))}>
                    {['virement', 'cheque', 'especes', 'lettre_change'].map((item) => <option key={item} value={item}>{item}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup label="Reference"><Input value={supplierPaymentForm.reference} onChange={(e: any) => setSupplierPaymentForm((f) => ({ ...f, reference: e.target.value }))} /></FormGroup>
              </FormRow>
              {paymentError && <div style={{ marginBottom: 12, padding: '8px 10px', background: '#fce4e5', border: '1px solid #f3b6bb', borderRadius: 8, fontSize: 12, color: '#9b1d1d' }}>{paymentError}</div>}
              <ModalFooter onCancel={resetModalState} onSave={saveSupplierPayment} loading={saving} disabled={!supplierPaymentForm.amount} saveLabel="Regler" />
            </>
          )}
        </Modal>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">FACTURES</div>
          <div className="page-sub">Separation entre credit client et debit fournisseur</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setModal(tab === 'clients' ? 'facture_client' : 'facture_fournisseur')}
            className="btn-primary"
            style={{ whiteSpace: 'nowrap' }}
          >
            {tab === 'clients' ? '+ Facture client' : '+ Facture fournisseur'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        {[
          { key: 'clients', label: 'Credit clients' },
          { key: 'fournisseurs', label: 'Debit fournisseurs' },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key as InvoiceTab)}
            style={{
              padding: '10px 14px',
              borderRadius: 999,
              border: `1px solid ${tab === item.key ? '#2d6a4f' : '#cce5d4'}`,
              background: tab === item.key ? '#2d6a4f' : '#fff',
              color: tab === item.key ? '#fff' : '#1b3a2d',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { l: 'Encaissements', v: formatMad(treasurySummary.collected), c: '#2d6a4f' },
          { l: 'Paiements', v: formatMad(treasurySummary.paidOut), c: '#8a5a00' },
          { l: 'Solde net', v: formatMad(treasurySummary.net), c: treasurySummary.net >= 0 ? '#40916c' : '#c1121f' },
          { l: 'Creances', v: formatMad(treasurySummary.receivables), c: '#1d4ed8' },
          { l: 'Dettes', v: formatMad(treasurySummary.payables), c: '#e9a820' },
        ].map((item, index) => (
          <div key={index} className="card" style={{ border: `1px solid ${item.c}35`, borderRadius: 18, padding: '14px 16px', boxShadow: 'none', background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(244,250,247,0.96))' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>{item.l}</div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: index < 3 ? 26 : 22, fontWeight: 800, color: item.c }}>{item.v}</div>
          </div>
        ))}
      </div>

      <div className="calendar-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(0, 3fr)', gap: 12, marginBottom: 18 }}>
        <div className="card" style={{ borderRadius: 18, overflow: 'hidden', padding: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #e8f0eb', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 16, fontWeight: 700, color: '#1b3a2d' }}>Calendrier</div>
              <div style={{ fontSize: 11, color: '#6c7f76', marginTop: 2 }}>Apercu mensuel</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCalendarMonthOffset((v) => v - 1)}
                style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #d1e3d7', background: '#fff', color: '#1b3a2d', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
              >
                Mois precedent
              </button>
              <div style={{ minWidth: 120, textAlign: 'center', fontSize: 11, fontWeight: 800, color: '#1b3a2d', textTransform: 'capitalize' }}>
                {formatMonthLabel(calendarMonthDate)}
              </div>
              <button
                onClick={() => setCalendarMonthOffset((v) => v + 1)}
                style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #d1e3d7', background: '#fff', color: '#1b3a2d', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
              >
                Mois suivant
              </button>
            </div>
          </div>
          <div style={{ padding: 12 }}>
            <div className="calendar-month">
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((label) => (
                <div key={label} className="calendar-head">{label}</div>
              ))}
              {monthGridDays.map((day) => (
                <div key={day.iso} className={`calendar-cell${day.inMonth ? '' : ' out'}${day.isToday ? ' today' : ''}`}>
                  <div className="calendar-day-number">{day.label}</div>
                  <div className="calendar-dots">
                    {day.events.slice(0, 4).map((item, index) => (
                      <span key={`${item.kind}-${item.invoice_number}-${index}`} className={`calendar-dot ${item.kind === 'client' ? 'credit' : 'debit'}`} />
                    ))}
                    {day.events.length > 4 && <span className="calendar-more">+{day.events.length - 4}</span>}
                  </div>
                  {day.events.length > 0 && (
                    <div className="calendar-tooltip">
                      <div className="calendar-tooltip-title">{new Date(`${day.iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}</div>
                      {day.events.map((item, index) => (
                        <div key={`${item.kind}-${item.invoice_number}-${index}`} className="calendar-tooltip-item">
                          <span className={`calendar-tooltip-badge ${item.kind === 'client' ? 'credit' : 'debit'}`}>{item.kind === 'client' ? 'Credit' : 'Debit'}</span>
                          <span className="calendar-tooltip-label">{item.label}</span>
                          <span className="calendar-tooltip-meta">{item.invoice_number} · {formatMad(item.remaining)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ borderRadius: 18, overflow: 'hidden', padding: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #e8f0eb', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 16, fontWeight: 700, color: '#1b3a2d' }}>Releve des prochaines echeances</div>
              <div style={{ fontSize: 11, color: '#6c7f76', marginTop: 2 }}>Encaissements et paiements classes par proximite</div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 10, color: '#6c7f76', flexWrap: 'wrap' }}>
              <span><strong style={{ color: '#1d4ed8' }}>Bleu</strong> = credit</span>
              <span><strong style={{ color: '#9a6700' }}>Ambre</strong> = debit</span>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  {['Type', 'Compte', 'No Facture', 'Echeance', 'Jours', 'Montant restant'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: 10.5, fontWeight: 600, color: '#5a7a66', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid #e8f5ec', textAlign: 'left', background: '#f9fdf9', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nextDueReport.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: '18px 14px', color: '#5a7a66' }}>Aucune echeance ouverte a venir.</td></tr>
                ) : nextDueReport.map((item, index) => (
                  <tr key={`${item.kind}-${item.invoice_number}-${index}`} style={{ background: index % 2 === 0 ? '#ffffff' : '#f8fbf9' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ background: item.kind === 'client' ? '#dbeafe' : '#fff3cd', color: item.kind === 'client' ? '#1d4ed8' : '#9a6700', padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800, letterSpacing: '.8px', textTransform: 'uppercase' }}>
                        {item.kind === 'client' ? 'Credit' : 'Debit'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#1b3a2d' }}>{item.label}</td>
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12 }}>{item.invoice_number}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#5a7a66' }}>{item.due_date}</td>
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: 800, color: item.daysLeft <= 7 ? '#c1121f' : '#8a5a00' }}>{item.daysLeft} j</td>
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: 800 }}>{formatMad(item.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12, marginBottom: 18 }}>
        <div className="card" style={{ borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#5a7a66', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
            {tab === 'clients' ? 'Client' : 'Fournisseur'}
          </div>
          {tab === 'clients' ? (
            <Select value={clientFilter} onChange={(e: any) => setClientFilter(e.target.value)}>
              <option value="all">Tous les clients</option>
              {clients.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          ) : (
            <Select value={supplierFilter} onChange={(e: any) => setSupplierFilter(e.target.value)}>
              <option value="all">Tous les fournisseurs</option>
              {suppliers.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          )}
        </div>
        <div className="card" style={{ borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#5a7a66', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Statut</div>
          <Select value={statusFilter} onChange={(e: any) => setStatusFilter(e.target.value)}>
            <option value="all">Tous les statuts</option>
            <option value="en_attente">En attente</option>
            <option value="partiellement_paye">Partiellement paye</option>
            <option value="en_retard">En retard</option>
            <option value="paye">Paye</option>
          </Select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { l: tab === 'clients' ? 'Facture' : 'A payer', v: formatMad(tab === 'clients' ? clientSummary.total : supplierSummary.total), c: '#2d6a4f' },
          { l: tab === 'clients' ? 'Encaisse' : 'Regle', v: formatMad(tab === 'clients' ? clientSummary.paid : supplierSummary.paid), c: '#40916c' },
          { l: tab === 'clients' ? 'Encours client' : 'Dette fournisseur', v: formatMad(tab === 'clients' ? clientSummary.outstanding : supplierSummary.outstanding), c: '#e9a820' },
          { l: 'En retard', v: formatMad(tab === 'clients' ? clientSummary.overdue : supplierSummary.overdue), c: '#c1121f' },
        ].map((item, index) => (
          <div key={index} className="card" style={{ borderRadius: 16, padding: '14px 16px', border: `1px solid ${item.c}33`, borderTop: `3px solid ${item.c}` }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#5a7a66', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{item.l}</div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, color: '#1b3a2d' }}>{item.v}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ borderRadius: 18, overflow: 'hidden', marginBottom: 18, padding: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e8f5ec', fontFamily: 'Syne,sans-serif', fontSize: 16, fontWeight: 700, color: '#1b3a2d' }}>
          {tab === 'clients' ? 'Synthese clients' : 'Synthese fournisseurs'}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                {['Compte', 'Factures', 'Total', tab === 'clients' ? 'Encaisse' : 'Regle', 'Encours'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 10.5, fontWeight: 600, color: '#5a7a66', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid #e8f5ec', textAlign: 'left', background: '#f9fdf9', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {supplierClientBalance.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '16px 14px', color: '#5a7a66' }}>Aucune donnee disponible.</td></tr>
              ) : supplierClientBalance.map((item: any, index: number) => (
                <tr key={item.key} style={{ background: index % 2 === 0 ? '#fcfefd' : '#f7fbf8' }}>
                  <td style={{ padding: '13px 14px', fontWeight: 700, color: '#1b3a2d' }}>{item.name}</td>
                  <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12 }}>{item.count}</td>
                  <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12 }}>{formatMad(item.total)}</td>
                  <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: '#2d6a4f' }}>{formatMad(item.paid)}</td>
                  <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: '#e9a820', fontWeight: 700 }}>{formatMad(item.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#5a7a66' }}>Chargement...</div>
      ) : (
        <div className="card" style={{ borderRadius: 18, overflow: 'hidden', padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  {(tab === 'clients'
                    ? ['No Facture', 'Client', 'Date', 'Echeance', 'Montant', 'Encaisse', 'Reste', 'Statut', 'Actions']
                    : ['No Facture', 'Fournisseur', 'Categorie', 'Date', 'Echeance', 'Montant', 'Regle', 'Reste', 'Statut', 'Actions']
                  ).map((h) => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: 10.5, fontWeight: 600, color: '#5a7a66', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid #e8f5ec', textAlign: 'left', background: '#f9fdf9', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(tab === 'clients' ? filteredClientInvoices : filteredSupplierInvoices).map((item: any, index: number) => {
                  const remaining = Math.max(Number(item.total_amount || 0) - Number(item.paid_amount || 0), 0)
                  const st = ST[item.effectiveStatus] || ST.en_attente
                  return (
                    <tr key={item.id} style={{ background: index % 2 === 0 ? '#ffffff' : '#f8fbf9' }}>
                      <td style={{ padding: '13px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: 800, color: '#1b3a2d' }}>{item.invoice_number}</td>
                      <td style={{ padding: '13px 14px', fontWeight: 700, color: '#1b3a2d' }}>{tab === 'clients' ? item.clients?.name || '-' : item.suppliers?.name || '-'}</td>
                      {tab === 'fournisseurs' && <td style={{ padding: '11px 14px', color: '#5a7a66', fontSize: 12 }}>{item.cost_category || '-'}</td>}
                      <td style={{ padding: '11px 14px', color: '#5a7a66', fontSize: 12 }}>{item.invoice_date}</td>
                      <td style={{ padding: '11px 14px', color: '#5a7a66', fontSize: 12 }}>{item.due_date}</td>
                      <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12 }}>{formatMad(Number(item.total_amount || 0))}</td>
                      <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: '#2d6a4f' }}>{formatMad(Number(item.paid_amount || 0))}</td>
                      <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#e9a820' }}>{formatMad(remaining)}</td>
                      <td style={{ padding: '11px 14px' }}><span style={{ background: st.bg, color: st.color, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600 }}>{st.label}</span></td>
                      <td style={{ padding: '11px 14px' }}>
                        {item.effectiveStatus !== 'paye' && (
                          <button
                            onClick={() => {
                              setPaymentError('')
                              if (tab === 'clients') {
                                setSelectedClientInvoice(item)
                                setModal('paiement_client')
                              } else {
                                setSelectedSupplierInvoice(item)
                                setModal('paiement_fournisseur')
                              }
                            }}
                            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: tab === 'clients' ? '#2d6a4f' : '#8a5a00', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                          >
                            {tab === 'clients' ? 'Encaisser' : 'Regler'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <style jsx>{`
        .calendar-month {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 6px;
        }
        .calendar-head {
          padding: 4px 6px;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #6c7f76;
        }
        .calendar-cell {
          position: relative;
          min-height: 72px;
          border: 1px solid #dbe9e0;
          border-radius: 12px;
          background: #fff;
          padding: 7px 8px;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
        }
        .calendar-cell:hover {
          border-color: #9dc7b0;
          box-shadow: 0 12px 24px rgba(22, 56, 46, 0.08);
          z-index: 3;
        }
        .calendar-cell.out {
          background: #f7fbf8;
          opacity: 0.72;
        }
        .calendar-cell.today {
          background: #eef8f1;
          border-color: #99c8ae;
        }
        .calendar-day-number {
          font-family: 'Syne', sans-serif;
          font-size: 15px;
          font-weight: 800;
          color: #16382e;
          line-height: 1;
        }
        .calendar-dots {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
          margin-top: 8px;
        }
        .calendar-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          display: inline-block;
          box-shadow: 0 0 0 2px rgba(255,255,255,0.9);
        }
        .calendar-dot.credit {
          background: #1d4ed8;
        }
        .calendar-dot.debit {
          background: #d97706;
        }
        .calendar-more {
          font-size: 9px;
          font-weight: 800;
          color: #6c7f76;
        }
        .calendar-tooltip {
          position: absolute;
          left: 10px;
          top: calc(100% + 8px);
          width: 220px;
          max-width: calc(100vw - 48px);
          background: #10261f;
          color: #f5fbf7;
          border: 1px solid rgba(133, 194, 164, 0.25);
          border-radius: 14px;
          padding: 12px;
          box-shadow: 0 18px 34px rgba(0, 0, 0, 0.28);
          opacity: 0;
          pointer-events: none;
          transform: translateY(6px);
          transition: opacity 0.15s ease, transform 0.15s ease;
        }
        .calendar-cell:hover .calendar-tooltip {
          opacity: 1;
          transform: translateY(0);
        }
        .calendar-tooltip-title {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: #b8d6c7;
          margin-bottom: 10px;
        }
        .calendar-tooltip-item + .calendar-tooltip-item {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .calendar-tooltip-badge {
          display: inline-block;
          border-radius: 999px;
          padding: 3px 7px;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .8px;
          margin-bottom: 6px;
        }
        .calendar-tooltip-badge.credit {
          background: rgba(29, 78, 216, 0.18);
          color: #8cb7ff;
        }
        .calendar-tooltip-badge.debit {
          background: rgba(217, 119, 6, 0.18);
          color: #ffc77f;
        }
        .calendar-tooltip-label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: #ffffff;
        }
        .calendar-tooltip-meta {
          display: block;
          font-size: 11px;
          color: #bdd6ca;
          margin-top: 3px;
        }
        @media (max-width: 900px) {
          .page-title {
            font-size: 24px;
          }
          .calendar-layout {
            grid-template-columns: 1fr !important;
          }
          .calendar-cell {
            min-height: 68px;
          }
          .calendar-tooltip {
            left: 0;
            width: 210px;
          }
        }
        @media (max-width: 560px) {
          .calendar-month {
            grid-template-columns: repeat(7, minmax(44px, 1fr));
            overflow-x: auto;
          }
          .calendar-head {
            display: block;
          }
          .calendar-cell {
            min-height: 62px;
            padding: 6px;
          }
          .calendar-day-number {
            font-size: 13px;
          }
          .calendar-dot {
            width: 7px;
            height: 7px;
          }
        }
      `}</style>
    </div>
  )
}
