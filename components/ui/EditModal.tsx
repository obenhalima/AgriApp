'use client'
import {useLanguage} from '@/lib/i18n'
import { useId } from 'react'

import { Input, Modal, ModalFooter } from './Modal'

interface Field {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea'
  options?: { value: string; label: string }[]
  placeholder?: string
}

interface EditModalProps {
  title: string
  fields: Field[]
  values: Record<string, any>
  onChange: (key: string, val: string) => void
  onSave: () => void
  onCancel: () => void
  loading?: boolean
  done?: boolean
  doneMessage?: string
}

export function EditModal({ title, fields, values, onChange, onSave, onCancel, loading, done, doneMessage }: EditModalProps) {
 const formId = useId()
 const {t:_ui,text:_uiNode}=useLanguage()

  if (done) {
    return (
      <Modal title={title} onClose={onCancel} dirty={false}>
        <div style={{ textAlign: 'center', padding: '36px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>✅</div>
          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 18, fontWeight: 700, color: '#00e87a', textTransform: 'uppercase', letterSpacing: 1 }}>
            {doneMessage || _ui("Modifié avec succès !")}
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={title} onClose={onCancel} busy={loading}>
      {fields.map(f => (
        <div key={f.key} style={{ marginBottom: 14 }}>
          <label htmlFor={`${formId}-${f.key}`} className="form-label">{_uiNode(f.label)}</label>
          {f.type === 'select' ? (
            <select id={`${formId}-${f.key}`} className="form-input" value={values[f.key] ?? ''} onChange={e => onChange(f.key, e.target.value)}>
              {f.options?.map(o => <option key={o.value} value={o.value}>{_uiNode(o.label)}</option>)}
            </select>
          ) : f.type === 'textarea' ? (
            <textarea id={`${formId}-${f.key}`} className="form-input" rows={3} value={values[f.key] ?? ''} onChange={e => onChange(f.key, e.target.value)} placeholder={f.placeholder} style={{ resize: 'vertical' }} />
          ) : (
            <Input id={`${formId}-${f.key}`} type={f.type || 'text'} value={values[f.key] ?? ''} onChange={e => onChange(f.key, e.target.value)} placeholder={f.placeholder} />
          )}
        </div>
      ))}
      <ModalFooter onCancel={onCancel} onSave={onSave} loading={loading} saveLabel={_ui("ENREGISTRER LES MODIFICATIONS")} />
    </Modal>
  )
}
