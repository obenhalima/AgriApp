'use client'
import { useEffect } from 'react'

export function Modal({ title, onClose, children, size='md' }: { title:string; onClose:()=>void; children:React.ReactNode; size?:'sm'|'md'|'lg' }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if(e.key==='Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const widths = {sm:420,md:580,lg:740}
  return (
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="modal-box" style={{maxWidth:widths[size]}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function FormRow({children}:{children:React.ReactNode}) {
  return <div className="form-row">{children}</div>
}
export function FormGroup({label,children}:{label:string;children:React.ReactNode}) {
  return <div className="form-group"><label className="form-label">{label}</label>{children}</div>
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="form-input" style={{...props.style}} />
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="form-input" style={{...props.style}} />
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className="form-input" style={{resize:'vertical',...props.style}} />
}
export function ModalFooter({onCancel,onSave,loading,saveLabel='Enregistrer',disabled=false}:{onCancel:()=>void;onSave:()=>void;loading?:boolean;saveLabel?:string;disabled?:boolean}) {
  return (
    <div style={{display:'flex',justifyContent:'flex-end',gap:10,paddingTop:18,borderTop:'1px solid #1a3526',marginTop:4}}>
      <button onClick={onCancel} className="btn-ghost" style={{letterSpacing:.5}}>ANNULER</button>
      <button onClick={onSave} disabled={disabled||loading} className="btn-primary" style={{letterSpacing:1}}>
        {loading ? 'TRAITEMENT...' : saveLabel.toUpperCase()}
      </button>
    </div>
  )
}
export function SuccessMessage({message='Enregistre avec succes !'}:{message?:string}) {
  return (
    <div style={{textAlign:'center',padding:'36px 0'}}>
      <div style={{fontSize:48,marginBottom:14}}>✅</div>
      <div style={{fontFamily:'Rajdhani,sans-serif',fontSize:18,fontWeight:700,color:'#00e87a',textTransform:'uppercase',letterSpacing:1,textShadow:'0 0 20px #00e87a'}}>{message}</div>
    </div>
  )
}
