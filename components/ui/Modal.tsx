'use client'
import { ReactNode, useRef } from 'react'

function CalendarIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  )
}

/* MODAL CONTAINER */
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
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

/* FORM HELPERS */
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
  const inputRef = useRef<HTMLInputElement>(null)

  if (type === 'date') {
    const openDatePicker = () => {
      const input = inputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null
      if (!input) return
      input.focus()
      if (typeof input.showPicker === 'function') {
        input.showPicker()
        return
      }
      input.click()
    }

    return (
      <div style={{ position:'relative' }}>
        <input
          ref={inputRef}
          className="form-input"
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoFocus={autoFocus}
          step={step}
          min={min}
          max={max}
          style={{ paddingRight: 42 }}
        />
        <button
          type="button"
          onClick={openDatePicker}
          aria-label="Ouvrir le calendrier"
          style={{
            position:'absolute',
            right:8,
            top:'50%',
            transform:'translateY(-50%)',
            width:28,
            height:28,
            borderRadius:8,
            border:'1px solid var(--border)',
            background:'var(--bg-card2)',
            color:'var(--tx-2)',
            cursor:'pointer',
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
          }}
        >
          <CalendarIcon />
        </button>
      </div>
    )
  }

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

/* MODAL FOOTER */
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

/* SUCCESS MESSAGE */
export function SuccessMessage({ message='Enregistre !' }: { message?:string }) {
  return (
    <div style={{ textAlign:'center', padding:'36px 0' }}>
      <div style={{ fontSize:44, marginBottom:14 }}>OK</div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:700, color:'var(--neon)', textTransform:'uppercase', letterSpacing:1 }}>
        {message}
      </div>
    </div>
  )
}
