'use client'
import { useEffect, useState } from 'react'
import { getFournisseurs, createFournisseur } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

export default function FournisseursPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({ code:'', name:'', category:'semences', city:'', email:'', phone:'', payment_terms_days:'30', notes:'' })
  const s = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))

  useEffect(() => { getFournisseurs().then(d=>{setItems(d);setLoading(false)}).catch(()=>setLoading(false)) }, [])

  const save = async () => {
    if (!form.code||!form.name) return
    setSaving(true)
    try {
      const n = await createFournisseur({ ...form, payment_terms_days: Number(form.payment_terms_days)||30 })
      setItems(p=>[n,...p]); setDone(true)
      setTimeout(()=>{setModal(false);setDone(false);setForm({code:'',name:'',category:'semences',city:'',email:'',phone:'',payment_terms_days:'30',notes:''})},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const CATS = ['semences','engrais','phytosanitaires','irrigation','emballage','transport','energie','services','equipement','autre']

  return (
    <div style={{padding:'22px 26px',background:'#f4f9f4',minHeight:'100vh'}}>
      {modal && (
        <Modal title="Nouveau fournisseur" onClose={()=>{setModal(false);setDone(false)}}>
          {done ? <SuccessMessage message="Fournisseur créé !" /> : (<>
            <FormRow>
              <FormGroup label="Code *"><Input value={form.code} onChange={s('code')} placeholder="ex: F001" /></FormGroup>
              <FormGroup label="Nom *"><Input value={form.name} onChange={s('name')} placeholder="Nom du fournisseur" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Catégorie">
                <Select value={form.category} onChange={s('category')}>{CATS.map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}</Select>
              </FormGroup>
              <FormGroup label="Ville"><Input value={form.city} onChange={s('city')} placeholder="ex: Casablanca" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Email"><Input type="email" value={form.email} onChange={s('email')} placeholder="contact@fournisseur.ma" /></FormGroup>
              <FormGroup label="Téléphone"><Input value={form.phone} onChange={s('phone')} placeholder="+212 5xx xxx xxx" /></FormGroup>
            </FormRow>
            <FormGroup label="Délai de paiement (jours)"><Input type="number" value={form.payment_terms_days} onChange={s('payment_terms_days')} /></FormGroup>
            <FormGroup label="Notes"><Textarea rows={2} value={form.notes} onChange={s('notes')} /></FormGroup>
            <ModalFooter onCancel={()=>setModal(false)} onSave={save} loading={saving} disabled={!form.code||!form.name} saveLabel="Créer le fournisseur" />
          </>)}
        </Modal>
      )}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div><h2 style={{fontFamily:'Syne,sans-serif',fontSize:20,fontWeight:700,color:'#1b3a2d',marginBottom:4}}>Fournisseurs</h2><p style={{fontSize:13,color:'#5a7a66'}}>{items.length} fournisseur(s)</p></div>
        <button onClick={()=>setModal(true)} style={{padding:'8px 16px',borderRadius:8,border:'none',background:'#2d6a4f',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Nouveau fournisseur</button>
      </div>
      {loading ? <div style={{textAlign:'center',padding:60,color:'#5a7a66'}}>Chargement...</div>
      : items.length===0 ? (
        <div style={{textAlign:'center',padding:60,background:'#fff',border:'1px solid #cce5d4',borderRadius:12}}>
          <div style={{fontSize:40,marginBottom:12}}>🏭</div>
          <div style={{fontFamily:'Syne,sans-serif',fontSize:16,fontWeight:700,color:'#1b3a2d',marginBottom:8}}>Aucun fournisseur enregistré</div>
          <button onClick={()=>setModal(true)} style={{padding:'9px 20px',borderRadius:8,border:'none',background:'#2d6a4f',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Nouveau fournisseur</button>
        </div>
      ) : (
        <div style={{background:'#fff',border:'1px solid #cce5d4',borderRadius:12,overflow:'hidden',overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>{['Code','Nom','Catégorie','Ville','Email','Téléphone','Délai pmt'].map(h=><th key={h} style={{padding:'10px 14px',fontSize:10.5,fontWeight:600,color:'#5a7a66',textTransform:'uppercase',letterSpacing:'.5px',borderBottom:'1px solid #e8f5ec',textAlign:'left',background:'#f9fdf9',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
            <tbody>
              {items.map((f:any)=>(
                <tr key={f.id} style={{borderBottom:'1px solid #e8f5ec'}}>
                  <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12,color:'#5a7a66'}}>{f.code}</td>
                  <td style={{padding:'11px 14px',fontWeight:600,color:'#1b3a2d'}}>{f.name}</td>
                  <td style={{padding:'11px 14px'}}><span style={{background:'#fef3c7',color:'#92400e',padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600}}>{f.category}</span></td>
                  <td style={{padding:'11px 14px',color:'#5a7a66',fontSize:12}}>{f.city||'—'}</td>
                  <td style={{padding:'11px 14px',color:'#5a7a66',fontSize:12}}>{f.email||'—'}</td>
                  <td style={{padding:'11px 14px',color:'#5a7a66',fontSize:12}}>{f.phone||'—'}</td>
                  <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12}}>{f.payment_terms_days} j</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
