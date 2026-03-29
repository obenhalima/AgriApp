'use client'
import { ReactNode } from 'react'

/* ── MODAL CONTAINER ── */
interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({ title, onClose, children, size='md' }: ModalProps) {
  const maxW = size==='lg' ? 860 : size==='sm' ? 420 : 580
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal-box" style={{ maxWidth: maxW }} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

/* ── FORM HELPERS ── */
export function FormGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      {children}
    </div>
  )
}

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="form-row">{children}</div>
}

export function Input({ type='text', value, onChange, placeholder, autoFocus, step, min, max }: {
  type?:string; value?:string; onChange?:(e:any)=>void;
  placeholder?:string; autoFocus?:boolean; step?:string; min?:string; max?:string
}) {
  return <input className="form-input" type={type} value={value} onChange={onChange}
    placeholder={placeholder} autoFocus={autoFocus} step={step} min={min} max={max} />
}

export function Select({ value, onChange, children }: { value?:string; onChange?:(e:any)=>void; children:ReactNode }) {
  return <select className="form-input" value={value} onChange={onChange}>{children}</select>
}

export function Textarea({ rows=3, value, onChange, placeholder }: { rows?:number; value?:string; onChange?:(e:any)=>void; placeholder?:string }) {
  return <textarea className="form-input" rows={rows} value={value} onChange={onChange}
    placeholder={placeholder} style={{ resize:'vertical' }} />
}

/* ── MODAL FOOTER ── */
export function ModalFooter({ onCancel, onSave, loading, saveLabel='ENREGISTRER', disabled=false }: {
  onCancel:()=>void; onSave:()=>void; loading?:boolean; saveLabel?:string; disabled?:boolean
}) {
  return (
    <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20, paddingTop:16, borderTop:'1px solid var(--border)' }}>
      <button onClick={onCancel} className="btn-ghost">ANNULER</button>
      <button onClick={onSave} className="btn-primary" disabled={disabled||loading}
        style={{ minWidth:140, justifyContent:'center', opacity: disabled ? .5 : 1 }}>
        {loading ? 'TRAITEMENT...' : saveLabel}
      </button>
    </div>
  )
}

/* ── SUCCESS MESSAGE ── */
export function SuccessMessage({ message='Enregistré !' }: { message?:string }) {
  return (
    <div style={{ textAlign:'center', padding:'36px 0' }}>
      <div style={{ fontSize:44, marginBottom:14 }}>✅</div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:700, color:'var(--neon)', textTransform:'uppercase', letterSpacing:1 }}>
        {message}
      </div>
    </div>
  )
}
