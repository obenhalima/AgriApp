'use client'
import { Modal, ModalFooter } from './Modal'

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
  if (done) {
    return (
      <Modal title={title} onClose={onCancel}>
        <div style={{ textAlign: 'center', padding: '36px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>✅</div>
          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 18, fontWeight: 700, color: '#00e87a', textTransform: 'uppercase', letterSpacing: 1 }}>
            {doneMessage || 'Modifié avec succès !'}
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={title} onClose={onCancel}>
      {fields.map(f => (
        <div key={f.key} style={{ marginBottom: 14 }}>
          <label className="form-label">{f.label}</label>
          {f.type === 'select' ? (
            <select className="form-input" value={values[f.key] ?? ''} onChange={e => onChange(f.key, e.target.value)}>
              {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : f.type === 'textarea' ? (
            <textarea className="form-input" rows={3} value={values[f.key] ?? ''} onChange={e => onChange(f.key, e.target.value)} placeholder={f.placeholder} style={{ resize: 'vertical' }} />
          ) : (
            <input className="form-input" type={f.type || 'text'} value={values[f.key] ?? ''} onChange={e => onChange(f.key, e.target.value)} placeholder={f.placeholder} />
          )}
        </div>
      ))}
      <ModalFooter onCancel={onCancel} onSave={onSave} loading={loading} saveLabel="ENREGISTRER LES MODIFICATIONS" />
    </Modal>
  )
}
