'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, ModalFooter } from '@/components/ui/Modal'

export type StockCategory =
  | 'semences' | 'plants' | 'engrais' | 'phytosanitaires'
  | 'emballages' | 'consommables' | 'pieces_rechange' | 'autre'

const CATEGORIES: StockCategory[] = [
  'semences', 'plants', 'engrais', 'phytosanitaires',
  'emballages', 'consommables', 'pieces_rechange', 'autre',
]

const CATEGORY_LABELS: Record<StockCategory, string> = {
  semences: 'Semences',
  plants: 'Plants',
  engrais: 'Engrais',
  phytosanitaires: 'Phytosanitaires',
  emballages: 'Emballages',
  consommables: 'Consommables',
  pieces_rechange: 'Pièces de rechange',
  autre: 'Autre',
}

function suggestCode(name: string): string {
  const prefix = name.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'ART'
  return `${prefix}-${String(Date.now()).slice(-4)}`
}

type CreatedItem = { id: string; code: string; name: string; category: string; unit: string }

export function StockItemCreateModal(props: {
  open: boolean
  onClose: () => void
  onCreated: (item: CreatedItem) => void
  initialName?: string
  initialUnit?: string
  initialCategory?: StockCategory
}) {
  const { open, onClose, onCreated, initialName = '', initialUnit = '', initialCategory = 'consommables' } = props

  const [name, setName] = useState(initialName)
  const [code, setCode] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const [category, setCategory] = useState<StockCategory>(initialCategory)
  const [unit, setUnit] = useState(initialUnit)
  const [minQty, setMinQty] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const handleNameChange = (v: string) => {
    setName(v)
    if (!codeTouched) setCode(v ? suggestCode(v) : '')
  }

  const reset = () => {
    setName(initialName); setCode(''); setCodeTouched(false)
    setCategory(initialCategory); setUnit(initialUnit)
    setMinQty(''); setUnitCost(''); setLocation(''); setError('')
  }
  const close = () => { reset(); onClose() }

  const submit = async () => {
    setError('')
    if (!name.trim() || !code.trim() || !unit.trim()) {
      setError('Nom, code et unité sont requis'); return
    }
    setSaving(true)
    try {
      const { data, error: e } = await supabase.from('stock_items').insert({
        code: code.trim(),
        name: name.trim(),
        category,
        unit: unit.trim(),
        min_qty: minQty ? Number(minQty) : 0,
        unit_cost: unitCost ? Number(unitCost) : null,
        location: location.trim() || null,
        current_qty: 0,
        is_active: true,
      }).select('id, code, name, category, unit').single()
      if (e) throw e
      onCreated(data as CreatedItem)
      reset()
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Erreur lors de la création')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="NOUVEL ARTICLE DE STOCK" onClose={close} size="md">
      {error && (
        <div style={{ padding: 8, marginBottom: 10, background: 'var(--red-dim)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 6, color: 'var(--red)', fontSize: 11 }}>
          ⚠ {error}
        </div>
      )}

      <FormRow>
        <FormGroup label="Nom *">
          <Input value={name} onChange={e => handleNameChange(e.target.value)} placeholder="ex: Engrais NPK 15-15-15" />
        </FormGroup>
        <FormGroup label="Code *">
          <Input value={code} onChange={e => { setCode(e.target.value); setCodeTouched(true) }} placeholder="NPKFER-1234" />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup label="Catégorie *">
          <Select value={category} onChange={e => setCategory(e.target.value as StockCategory)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </Select>
        </FormGroup>
        <FormGroup label="Unité *">
          <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="kg, L, unité..." />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup label="Seuil alerte">
          <Input type="number" value={minQty} onChange={e => setMinQty(e.target.value)} placeholder="0" />
        </FormGroup>
        <FormGroup label="Coût unitaire">
          <Input type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="0" />
        </FormGroup>
        <FormGroup label="Emplacement">
          <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Entrepôt A" />
        </FormGroup>
      </FormRow>

      <ModalFooter
        onCancel={close}
        onSave={submit}
        loading={saving}
        disabled={!name.trim() || !code.trim() || !unit.trim()}
        saveLabel="CRÉER L'ARTICLE"
      />
    </Modal>
  )
}
