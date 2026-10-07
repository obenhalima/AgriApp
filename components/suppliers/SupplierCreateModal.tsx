'use client'
import {useLanguage} from '@/lib/i18n'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter } from '@/components/ui/Modal'
import { useAuth } from '@/lib/auth'

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
 const {t:_ui,text:_uiNode}=useLanguage()

  const { activeDomain } = useAuth()
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
    if (!activeDomain) { setError('Aucun domaine actif'); return }
    if (!name.trim() || !code.trim()) { setError('Nom et code sont requis'); return }
    setSaving(true)
    try {
      const { data, error: e } = await supabase.from('suppliers').insert({
        domain_id: activeDomain.domain_id,
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
    <Modal title={_ui("NOUVEAU FOURNISSEUR")} onClose={close} size="md">
      {error && (
        <div style={{ padding: 8, marginBottom: 10, background: 'var(--red-dim)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 6, color: 'var(--red)', fontSize: 11 }}>
          ⚠ {_uiNode(error)}
        </div>
      )}

      <FormRow>
        <FormGroup label={_ui("Nom *")}>
          <Input value={name} onChange={e => handleNameChange(e.target.value)} placeholder={_ui("ex: Agri-Supply SARL")} />
        </FormGroup>
        <FormGroup label={_ui("Code *")}>
          <Input value={code} onChange={e => { setCode(e.target.value); setCodeTouched(true) }} placeholder={_ui("AGRI-1234")} />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup label={_ui("Catégorie *")}>
          <Select value={category} onChange={e => setCategory(e.target.value as SupplierCategory)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{_uiNode(CATEGORY_LABELS[c])}</option>)}
          </Select>
        </FormGroup>
        <FormGroup label={_ui("Ville")}>
          <Input value={city} onChange={e => setCity(e.target.value)} placeholder={_ui("Casablanca")} />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup label={_ui("Email")}>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={_ui("contact@...")} />
        </FormGroup>
        <FormGroup label={_ui("Téléphone")}>
          <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+212..." />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup label={_ui("Contact (nom)")}>
          <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder={_ui("M. Alami")} />
        </FormGroup>
        <FormGroup label={_ui("Délai paiement (jours)")}>
          <Input type="number" value={paymentTermsDays} onChange={e => setPaymentTermsDays(e.target.value)} />
        </FormGroup>
      </FormRow>

      <FormGroup label={_ui("Notes")}>
        <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </FormGroup>

      <ModalFooter
        onCancel={close}
        onSave={submit}
        loading={saving}
        disabled={!name.trim() || !code.trim()}
        saveLabel={_ui("CRÉER LE FOURNISSEUR")}
      />
    </Modal>
  )
}
