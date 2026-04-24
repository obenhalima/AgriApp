'use client'
import { useEffect, useState } from 'react'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter } from '@/components/ui/Modal'
import {
  AccountCategory, AccountCategoryType, TYPE_LABELS,
  createAccountCategory, updateAccountCategory,
} from '@/lib/accountCategories'

type Mode = 'create' | 'edit'

export function AccountCategoryModal(props: {
  open: boolean
  mode: Mode
  // Mode 'create' : parent OPTIONNEL (racine si non fourni)
  parent?: AccountCategory | null
  // Mode 'edit' : la catégorie à modifier
  category?: AccountCategory
  onClose: () => void
  onSaved: (c: AccountCategory) => void
}) {
  const { open, mode, parent, category, onClose, onSaved } = props

  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<AccountCategoryType>('charge_variable')
  const [displayOrder, setDisplayOrder] = useState('10')
  const [depYears, setDepYears] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && category) {
      setCode(category.code)
      setLabel(category.label)
      setDescription(category.description ?? '')
      setType(category.type)
      setDisplayOrder(String(category.display_order))
      setDepYears(category.default_depreciation_years ? String(category.default_depreciation_years) : '')
    } else {
      setCode('')
      setLabel('')
      setDescription('')
      setType(parent?.type ?? 'charge_variable')
      setDisplayOrder('10')
      setDepYears('')
    }
    setError('')
  }, [open, mode, category?.id, parent?.id])

  if (!open) return null

  const isEdit = mode === 'edit'
  const typeLocked = isEdit || Boolean(parent)          // on ne change pas le type en édition ni sous un parent
  const parentInfo = parent ? `${parent.code} — ${parent.label}` : 'Aucun (racine)'

  const submit = async () => {
    setError('')
    if (!label.trim()) { setError('Libellé requis'); return }
    if (!isEdit && !code.trim()) { setError('Code requis'); return }

    setSaving(true)
    try {
      let saved: AccountCategory
      if (isEdit && category) {
        saved = await updateAccountCategory(category.id, {
          label,
          description: description.trim() || null,
          display_order: Number(displayOrder) || 0,
          default_depreciation_years: category.type === 'amortissement'
            ? (depYears ? Number(depYears) : null)
            : null,
        })
      } else {
        saved = await createAccountCategory({
          parent_id: parent?.id ?? null,
          code,
          label,
          description: description.trim() || undefined,
          type,
          display_order: Number(displayOrder) || 99,
          default_depreciation_years: type === 'amortissement' && depYears ? Number(depYears) : null,
        })
      }
      onSaved(saved)
    } catch (e: any) {
      setError(e.message ?? 'Erreur lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? 'MODIFIER CATÉGORIE COMPTABLE' : (parent ? `+ SOUS-CATÉGORIE DE ${parent.code}` : '+ CATÉGORIE RACINE')}
      onClose={onClose}
      size="md"
    >
      {error && (
        <div style={{ padding: 8, marginBottom: 10, background: 'var(--red-dim)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 6, color: 'var(--red)', fontSize: 11 }}>
          ⚠ {error}
        </div>
      )}

      {!isEdit && (
        <div style={{ padding: 8, marginBottom: 10, background: 'var(--bg-deep)', border: '1px solid var(--bd-1)', borderRadius: 6, fontSize: 11, color: 'var(--tx-3)' }}>
          Parent : <strong style={{ color: 'var(--tx-2)' }}>{parentInfo}</strong>
        </div>
      )}

      <FormRow>
        <FormGroup label="Code *">
          <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="ex: MAT_CONSO" />
        </FormGroup>
        <FormGroup label="Libellé *">
          <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="ex: Matériel de consommation" />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup label="Type comptable *">
          <Select
            value={type}
            onChange={e => !typeLocked && setType(e.target.value as AccountCategoryType)}
          >
            {(['produit','charge_variable','charge_fixe','amortissement'] as AccountCategoryType[]).map(t =>
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            )}
          </Select>
          {typeLocked && (
            <div style={{ fontSize: 10, color: 'var(--tx-3)', marginTop: 3 }}>
              Hérité {isEdit ? 'de la catégorie' : 'du parent'}, non modifiable ici.
            </div>
          )}
        </FormGroup>
        <FormGroup label="Ordre d'affichage">
          <Input type="number" value={displayOrder} onChange={e => setDisplayOrder(e.target.value)} />
        </FormGroup>
      </FormRow>

      {type === 'amortissement' && (
        <FormGroup label="Durée d'amortissement par défaut (années)">
          <Input type="number" value={depYears} onChange={e => setDepYears(e.target.value)} placeholder="ex: 10" />
        </FormGroup>
      )}

      <FormGroup label="Description">
        <Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} />
      </FormGroup>

      <ModalFooter
        onCancel={onClose}
        onSave={submit}
        loading={saving}
        disabled={!label.trim() || (!isEdit && !code.trim())}
        saveLabel={isEdit ? 'ENREGISTRER' : 'CRÉER LA CATÉGORIE'}
      />
    </Modal>
  )
}
