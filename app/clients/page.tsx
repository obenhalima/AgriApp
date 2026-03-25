'use client'
import { useEffect, useState } from 'react'
import { getClients, createClient_, deleteClient } from '@/lib/supabase'
import { Modal, FormGroup, FormRow, Input, Select, Textarea, ModalFooter, SuccessMessage } from '@/components/ui/Modal'

export default function ClientsPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({ code:'', name:'', type:'grossiste', city:'', country:'Maroc', email:'', phone:'', payment_terms_days:'30', credit_limit:'' })
  const s = (k:string) => (e:any) => setForm(f=>({...f,[k]:e.target.value}))

  useEffect(() => { getClients().then(d=>{setItems(d);setLoading(false)}).catch(()=>setLoading(false)) }, [])

  const save = async () => {
    if (!form.code||!form.name) return
    setSaving(true)
    try {
      const n = await createClient_({ ...form, payment_terms_days:Number(form.payment_terms_days)||30, credit_limit:Number(form.credit_limit)||undefined })
      setItems(p=>[n,...p]); setDone(true)
      setTimeout(()=>{setModal(false);setDone(false);setForm({code:'',name:'',type:'grossiste',city:'',country:'Maroc',email:'',phone:'',payment_terms_days:'30',credit_limit:''})},1400)
    } catch(e:any){alert('Erreur: '+e.message)}
    setSaving(false)
  }

  const del = async (id:string,name:string) => {
    if(!confirm(`Désactiver "${name}" ?`)) return
    await deleteClient(id); setItems(p=>p.filter(i=>i.id!==id))
  }

  return (
    <div style={{padding:'22px 26px',background:'#f4f9f4',minHeight:'100vh'}}>
      {modal && (
        <Modal title="Nouveau client" onClose={()=>{setModal(false);setDone(false)}}>
          {done ? <SuccessMessage message="Client créé avec succès !" /> : (<>
            <FormRow>
              <FormGroup label="Code *"><Input value={form.code} onChange={s('code')} placeholder="ex: CL001" /></FormGroup>
              <FormGroup label="Nom *"><Input value={form.name} onChange={s('name')} placeholder="Nom de la société" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Type">
                <Select value={form.type} onChange={s('type')}>{['grossiste','exportateur','grande_surface','detail','industrie','institutionnel','autre'].map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1).replace('_',' ')}</option>)}</Select>
              </FormGroup>
              <FormGroup label="Pays"><Input value={form.country} onChange={s('country')} placeholder="Maroc" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Ville"><Input value={form.city} onChange={s('city')} placeholder="ex: Agadir" /></FormGroup>
              <FormGroup label="Téléphone"><Input value={form.phone} onChange={s('phone')} placeholder="+212 6xx xxx xxx" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Email"><Input type="email" value={form.email} onChange={s('email')} placeholder="contact@client.ma" /></FormGroup>
              <FormGroup label="Délai paiement (jours)"><Input type="number" value={form.payment_terms_days} onChange={s('payment_terms_days')} /></FormGroup>
            </FormRow>
            <FormGroup label="Plafond crédit (MAD)"><Input type="number" value={form.credit_limit} onChange={s('credit_limit')} placeholder="ex: 500000" /></FormGroup>
            <ModalFooter onCancel={()=>setModal(false)} onSave={save} loading={saving} disabled={!form.code||!form.name} saveLabel="Créer le client" />
          </>)}
        </Modal>
      )}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
        <div><h2 style={{fontFamily:'Syne,sans-serif',fontSize:20,fontWeight:700,color:'#1b3a2d',marginBottom:4}}>Clients</h2><p style={{fontSize:13,color:'#5a7a66'}}>{items.length} client(s)</p></div>
        <button onClick={()=>setModal(true)} style={{padding:'8px 16px',borderRadius:8,border:'none',background:'#2d6a4f',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Nouveau client</button>
      </div>
      {loading ? <div style={{textAlign:'center',padding:60,color:'#5a7a66'}}>Chargement...</div>
      : items.length===0 ? (
        <div style={{textAlign:'center',padding:60,background:'#fff',border:'1px solid #cce5d4',borderRadius:12}}>
          <div style={{fontSize:40,marginBottom:12}}>👥</div>
          <div style={{fontFamily:'Syne,sans-serif',fontSize:16,fontWeight:700,color:'#1b3a2d',marginBottom:8}}>Aucun client enregistré</div>
          <button onClick={()=>setModal(true)} style={{padding:'9px 20px',borderRadius:8,border:'none',background:'#2d6a4f',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Nouveau client</button>
        </div>
      ) : (
        <div style={{background:'#fff',border:'1px solid #cce5d4',borderRadius:12,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['Code','Nom','Type','Ville','Pays','Email','Téléphone','Délai pmt','Actions'].map(h=><th key={h} style={{padding:'10px 14px',fontSize:10.5,fontWeight:600,color:'#5a7a66',textTransform:'uppercase',letterSpacing:'.5px',borderBottom:'1px solid #e8f5ec',textAlign:'left',background:'#f9fdf9',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
              <tbody>
                {items.map((c:any)=>(
                  <tr key={c.id} style={{borderBottom:'1px solid #e8f5ec'}}>
                    <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12,color:'#5a7a66'}}>{c.code}</td>
                    <td style={{padding:'11px 14px',fontWeight:600,color:'#1b3a2d'}}>{c.name}</td>
                    <td style={{padding:'11px 14px'}}><span style={{background:'#dbeafe',color:'#1e3a8a',padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600}}>{c.type}</span></td>
                    <td style={{padding:'11px 14px',color:'#5a7a66',fontSize:12}}>{c.city||'—'}</td>
                    <td style={{padding:'11px 14px',color:'#5a7a66',fontSize:12}}>{c.country||'—'}</td>
                    <td style={{padding:'11px 14px',color:'#5a7a66',fontSize:12}}>{c.email||'—'}</td>
                    <td style={{padding:'11px 14px',color:'#5a7a66',fontSize:12}}>{c.phone||'—'}</td>
                    <td style={{padding:'11px 14px',fontFamily:'monospace',fontSize:12}}>{c.payment_terms_days} j</td>
                    <td style={{padding:'11px 14px'}}>
                      <button onClick={()=>del(c.id,c.name)} style={{padding:'4px 10px',borderRadius:6,border:'1px solid #fcc',background:'#fff1f1',color:'#9b1d1d',fontSize:11,cursor:'pointer'}}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
