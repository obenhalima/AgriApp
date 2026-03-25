'use client'
import { useEffect } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({ title, onClose, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const widths = { sm: 420, md: 560, lg: 720 }

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(27,58,45,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:widths[size], maxHeight:'92vh', overflowY:'auto', border:'1px solid #cce5d4', boxShadow:'0 24px 64px rgba(27,58,45,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 24px 16px', borderBottom:'1px solid #e8f5ec' }}>
          <span style={{ fontFamily:'Syne,sans-serif', fontSize:17, fontWeight:700, color:'#1b3a2d' }}>{title}</span>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:'1px solid #cce5d4', background:'#f4f9f4', cursor:'pointer', fontSize:16, color:'#5a7a66', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>✕</button>
        </div>
        {/* Body */}
        <div style={{ padding:'20px 24px' }}>{children}</div>
      </div>
    </div>
  )
}

/* Composants de formulaire réutilisables */
export function FormRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>{children}</div>
}

export function FormGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#5a7a66', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}>{label}</label>
      {children}
    </div>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #cce5d4', background:'#f9fdf9', color:'#1b3a2d', fontSize:13.5, fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box', ...props.style }} />
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #cce5d4', background:'#f9fdf9', color:'#1b3a2d', fontSize:13.5, fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box', ...props.style }} />
  )
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #cce5d4', background:'#f9fdf9', color:'#1b3a2d', fontSize:13.5, fontFamily:'Inter,sans-serif', outline:'none', resize:'vertical', boxSizing:'border-box', ...props.style }} />
  )
}

export function ModalFooter({ onCancel, onSave, loading, saveLabel = 'Enregistrer', disabled = false }: { onCancel:()=>void; onSave:()=>void; loading?:boolean; saveLabel?:string; disabled?:boolean }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end', gap:10, paddingTop:16, borderTop:'1px solid #e8f5ec', marginTop:4 }}>
      <button onClick={onCancel} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #cce5d4', background:'transparent', color:'#5a7a66', fontSize:13, fontWeight:500, cursor:'pointer' }}>Annuler</button>
      <button onClick={onSave} disabled={disabled || loading}
        style={{ padding:'8px 18px', borderRadius:8, border:'none', background: disabled||loading ? '#9dc4b0' : '#2d6a4f', color:'#fff', fontSize:13, fontWeight:600, cursor: disabled||loading ? 'not-allowed' : 'pointer' }}>
        {loading ? 'Enregistrement...' : saveLabel}
      </button>
    </div>
  )
}

export function SuccessMessage({ message = 'Enregistré avec succès !' }: { message?: string }) {
  return (
    <div style={{ textAlign:'center', padding:'32px 0' }}>
      <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
      <div style={{ fontSize:16, fontWeight:700, color:'#2d6a4f', fontFamily:'Syne,sans-serif' }}>{message}</div>
    </div>
  )
}
