'use client'
import { ReactNode, useRef, useId,createContext,useContext } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useLanguage } from '@/lib/i18n'
import { FieldHelp } from './FieldHelp'
import { fieldExplanation } from '@/lib/userDocumentation'
import {confirmDiscard} from '@/lib/confirmDiscard'

const DiscardContext=createContext<(close:()=>void)=>void>(close=>close())

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
  size?: 'sm' | 'md' | 'lg' | 'xl'
  dirty?: boolean
  busy?: boolean
}

export function Modal({ title, onClose, children, size='md',dirty,busy=false }: ModalProps) {
  const {t}=useLanguage()
  const titleId = useId()
  const edited=useRef(false)
  const contentRef=useRef<HTMLDivElement>(null)
  const requestClose=(close:()=>void)=>{
    if(busy)return
    const hasFields=!!contentRef.current?.querySelector('input:not([type="hidden"]):not([readonly]),select:not([disabled]),textarea:not([readonly]),[contenteditable="true"]')
    if(confirmDiscard(dirty ?? (edited.current && hasFields),()=>window.confirm(t('Des modifications ne sont pas enregistrées. Voulez-vous fermer cette fenêtre et abandonner votre saisie ?'))))close()
  }
  // Capture before child autoFocus moves focus into the dialog during commit.
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null
  )
  const maxW = size==='xl' ? 1300 : size==='lg' ? 860 : size==='sm' ? 420 : 580
  return (
    <DiscardContext.Provider value={requestClose}>
    <Dialog.Root open onOpenChange={open => { if (!open) requestClose(onClose) }}>
      <Dialog.Portal>
      <Dialog.Overlay className="modal-overlay">
      <Dialog.Content ref={contentRef} onInputCapture={event=>{if(!(event.target as HTMLElement).closest('[data-column-filter-ui]'))edited.current=true}} onChangeCapture={event=>{if(!(event.target as HTMLElement).closest('[data-column-filter-ui]'))edited.current=true}} className="modal-box" aria-labelledby={titleId} aria-describedby={undefined} style={{ maxWidth: maxW }}
        onCloseAutoFocus={event => { event.preventDefault(); if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus() }}>
        <div className="modal-header">
          <Dialog.Title id={titleId} className="modal-title">{t(title)}</Dialog.Title>
          <button type="button" disabled={busy} aria-label={t('Fermer la fenêtre')} className="modal-close" onClick={()=>requestClose(onClose)}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </Dialog.Content>
      </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
    </DiscardContext.Provider>
  )
}

/* FORM HELPERS */
export function FormGroup({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  const {t}=useLanguage()
  const explanation=help??fieldExplanation(label,t)
  return (
    <div className="form-group">
      {label && <div className="flex items-center gap-1"><label className="form-label">{t(label)}</label>{explanation&&<FieldHelp text={explanation}/>}</div>}
      {children}
    </div>
  )
}

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="form-row">{children}</div>
}

export function Input({ id, type='text', value, onChange, placeholder, autoFocus, step, min, max, disabled }: {
  id?:string; type?:string; value?:string | number; onChange?:(e:any)=>void;
  placeholder?:string; autoFocus?:boolean; step?:string | number; min?:string | number; max?:string | number; disabled?:boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const {t}=useLanguage()

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
          id={id}
          ref={inputRef}
          disabled={disabled}
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
          disabled={disabled}
          aria-label={t('Ouvrir le calendrier')}
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

  return <input id={id} className="form-input" type={type} value={value} onChange={onChange} disabled={disabled}
    placeholder={placeholder} autoFocus={autoFocus} step={step} min={min} max={max} />
}

export function Select({ value, onChange, children, disabled }: { value?:string; onChange?:(e:any)=>void; children:ReactNode; disabled?:boolean }) {
  return <select className="form-input" value={value} onChange={onChange} disabled={disabled}>{children}</select>
}

export function Textarea({ rows=3, value, onChange, placeholder }: { rows?:number; value?:string; onChange?:(e:any)=>void; placeholder?:string }) {
  return <textarea className="form-input" rows={rows} value={value} onChange={onChange}
    placeholder={placeholder} style={{ resize:'vertical' }} />
}

/* MODAL FOOTER */
export function ModalFooter({ onCancel, onSave, loading, saveLabel='ENREGISTRER', disabled=false }: {
  onCancel:()=>void; onSave:()=>void; loading?:boolean; saveLabel?:string; disabled?:boolean
}) {
  const {t}=useLanguage()
  const requestClose=useContext(DiscardContext)
  return (
    <div className="itrix-modal-footer" style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20, paddingTop:16, borderTop:'1px solid var(--border)' }}>
      <button type="button" disabled={loading} onClick={()=>requestClose(onCancel)} className="btn-ghost">{t('ANNULER')}</button>
      <button onClick={onSave} className="btn-primary" disabled={disabled||loading}
        style={{ minWidth:140, justifyContent:'center', opacity: disabled ? .5 : 1 }}>
        {t(loading ? 'TRAITEMENT...' : saveLabel)}
      </button>
    </div>
  )
}

/* SUCCESS MESSAGE */
export function SuccessMessage({ message='Enregistre !' }: { message?:string }) {
 const {t:_ui,text:_uiNode}=useLanguage()

  return (
    <div style={{ textAlign:'center', padding:'36px 0' }}>
      <div style={{ fontSize:44, marginBottom:14 }}>OK</div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:700, color:'var(--neon)', textTransform:'uppercase', letterSpacing:1 }}>
        {_uiNode(message)}
      </div>
    </div>
  )
}
