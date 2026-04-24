'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter } from '@/components/ui/Modal'

export type SupplierCategory =
  | 'semences' | 'engrais' | 'phytosanitaires' | 'irrigation'
  | 'emballage' | 'transport' | 'energie' | 'services' | 'equipement' | 'autre'

const CATEGORIES: SupplierCategory[] = [
  'semences', 'engrais', 'phytosanitaires', 'irrigation',
  'emballage', 'transport', 'energie', 'services', 'equipement', 'autre',
]

const CATEGORY_LABELS: Record<SupplierCategory, string> = {
  semences: 'Semences',
  engrais: 'Engrais',
  phytosanitaires: 'Phytosanitaires',
  irrigation: 'Irrigation',
  emballage: 'Emballage',
  transport: 'Transport',
  energie: 'Énergie',
  services: 'Services',
  equipement: 'Équipement',
  autre: 'Autre',
}

function suggestCode(name: string): string {
  const prefix = name.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'FOUR'
  return `${prefix}-${String(Date.now()).slice(-4)}`
}

export type CreatedSupplier = { id: string; code: string; name: string; category: string }

export function SupplierCreateModal(props: {
  open: boolean
  onClose: () => void
  onCreated: (supplier: CreatedSupplier) => void
  initialCategory?: SupplierCategory
}) {
  const { open, onClose, onCreated, initialCategory = 'autre' } = props

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const [category, setCategory] = useState<SupplierCategory>(initialCategory)
  const [city, setCity] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [contactName, setContactName] = useState('')
  const [paymentTermsDays, setPaymentTermsDays] = useState('30')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const handleNameChange = (v: string) => {
    setName(v)
    if (!codeTouched) setCode(v ? suggestCode(v) : '')
  }

  const reset = () => {
    setName(''); setCode(''); setCodeTouched(false)
    setCategory(initialCategory); setCity(''); setEmail('')
    setPhone(''); setContactName(''); setPaymentTermsDays('30')
    setNotes(''); setError('')
  }
  const close = () => { reset(); onClose() }

  const submit = async () => {
    setError('')
    if (!name.trim() || !code.trim()) { setError('Nom et code sont requis'); return }
    setSaving(true)
    try {
      const { data, error: e } = await supabase.from('suppliers').insert({
        code: code.trim(),
        name: name.trim(),
        category,
        city: city.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        contact_name: contactName.trim() || null,
        payment_terms_days: paymentTermsDays ? Number(paymentTermsDays) : 30,
        notes: notes.trim() || null,
        currency: 'MAD',
        is_active: true,
      }).select('id, code, name, category').single()
      if (e) throw e
      onCreated(data as CreatedSupplier)
      reset()
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Erreur lors de la création')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="NOUVEAU FOURNISSEUR" onClose={close} size="md">
      {error && (
        <div style={{ padding: 8, marginBottom: 10, background: 'var(--red-dim)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 6, color: 'var(--red)', fontSize: 11 }}>
          ⚠ {error}
        </div>
      )}

      <FormRow>
        <FormGroup label="Nom *">
          <Input value={name} onChange={e => handleNameChange(e.target.value)} placeholder="ex: Agri-Supply SARL" />
        </FormGroup>
        <FormGroup label="Code *">
          <Input value={code} onChange={e => { setCode(e.target.value); setCodeTouched(true) }} placeholder="AGRI-1234" />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup label="Catégorie *">
          <Select value={category} onChange={e => setCategory(e.target.value as SupplierCategory)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </Select>
        </FormGroup>
        <FormGroup label="Ville">
          <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Casablanca" />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup label="Email">
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@..." />
        </FormGroup>
        <FormGroup label="Téléphone">
          <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+212..." />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup label="Contact (nom)">
          <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="M. Alami" />
        </FormGroup>
        <FormGroup label="Délai paiement (jours)">
          <Input type="number" value={paymentTermsDays} onChange={e => setPaymentTermsDays(e.target.value)} />
        </FormGroup>
      </FormRow>

      <FormGroup label="Notes">
        <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </FormGroup>

      <ModalFooter
        onCancel={close}
        onSave={submit}
        loading={saving}
        disabled={!name.trim() || !code.trim()}
        saveLabel="CRÉER LE FOURNISSEUR"
      />
    </Modal>
  )
}
